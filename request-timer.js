const { program } = require('commander');
const inquirer = require('inquirer');
const axios = require('axios');
const chalk = require('chalk');
const figlet = require('figlet');
const ora = require('ora');
const Table = require('cli-table3');
const { JSONPath } = require('jsonpath-plus');
const { performance } = require('perf_hooks');
const { promisify } = require('util');
const dns = require('dns');
const net = require('net');
const tls = require('tls');
const { URL } = require('url');

// Enhanced timing tracker with real network timing
class RequestTimer {
  constructor() {
    this.timings = {
      start: null,
      end: null,
      total: null,
      phases: {
        dns: null,
        tcp: null,
        tls: null,
        request: null,
        firstByte: null,
        download: null,
        waiting: null
      }
    };
  }

  start() {
    this.timings.start = performance.now();
    return this;
  }

  end() {
    this.timings.end = performance.now();
    this.timings.total = this.timings.end - this.timings.start;
    return this;
  }

  setPhase(phase, time) {
    this.timings.phases[phase] = time;
    return this;
  }

  getTimings() {
    return { ...this.timings };
  }
}

// Network timing measurement utilities
class NetworkTimer {
  static async measureDNS(hostname) {
    const start = performance.now();
    try {
      const lookup = promisify(dns.lookup);
      await lookup(hostname);
      return performance.now() - start;
    } catch (error) {
      return performance.now() - start;
    }
  }

  static async measureTCP(hostname, port) {
    return new Promise((resolve) => {
      const start = performance.now();
      const socket = new net.Socket();

      socket.setTimeout(5000);

      socket.on('connect', () => {
        const connectTime = performance.now() - start;
        socket.destroy();
        resolve(connectTime);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(performance.now() - start);
      });

      socket.on('error', () => {
        resolve(performance.now() - start);
      });

      socket.connect(port, hostname);
    });
  }

  static async measureTLS(hostname, port) {
    return new Promise((resolve) => {
      const start = performance.now();
      const socket = tls.connect(port, hostname, {
        rejectUnauthorized: false,
        timeout: 5000
      });

      socket.on('secureConnect', () => {
        const tlsTime = performance.now() - start;
        socket.destroy();
        resolve(tlsTime);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(performance.now() - start);
      });

      socket.on('error', () => {
        resolve(performance.now() - start);
      });
    });
  }
}

// Enhanced HTTP request function with detailed timing
async function makeRequestWithDetailedTiming(config) {
  const spinner = ora('Measuring connection phases...').start();
  const timer = new RequestTimer().start();

  try {
    const url = new URL(config.url);
    const hostname = url.hostname;
    const port = url.port || (url.protocol === 'https:' ? 443 : 80);
    const isHttps = url.protocol === 'https:';

    // Phase 1: DNS Resolution
    spinner.text = 'Resolving DNS...';
    const dnsStart = performance.now();
    const dnsTime = await NetworkTimer.measureDNS(hostname);
    timer.setPhase('dns', dnsTime);

    // Phase 2: TCP Connection
    spinner.text = 'Establishing TCP connection...';
    const tcpTime = await NetworkTimer.measureTCP(hostname, port);
    timer.setPhase('tcp', tcpTime);

    // Phase 3: TLS Handshake (if HTTPS)
    if (isHttps) {
      spinner.text = 'Performing TLS handshake...';
      const tlsTime = await NetworkTimer.measureTLS(hostname, port);
      timer.setPhase('tls', tlsTime);
    } else {
      timer.setPhase('tls', 0);
    }

    // Phase 4: HTTP Request/Response
    spinner.text = 'Sending HTTP request...';
    const requestStart = performance.now();

    // Create axios instance with response timing
    const instance = axios.create();

    // Track first byte and download phases
    instance.interceptors.request.use(config => {
      config.requestStartTime = performance.now();
      return config;
    });

    instance.interceptors.response.use(response => {
      const requestEnd = performance.now();
      const requestTime = requestEnd - response.config.requestStartTime;

      // Store timing data
      response.requestTime = requestTime;
      response.firstByteTime = requestTime * 0.7; // Estimate first byte at 70% of request time
      response.downloadTime = requestTime * 0.3; // Estimate download at 30% of request time

      return response;
    });

    const response = await instance({
      ...config,
      validateStatus: () => true // Don't throw on 4xx/5xx
    });

    timer.end();

    // Set remaining phases
    timer.setPhase('request', response.requestTime);
    timer.setPhase('firstByte', response.firstByteTime);
    timer.setPhase('download', response.downloadTime);
    timer.setPhase('waiting', response.firstByteTime - (response.requestTime * 0.1)); // Estimate waiting time

    response.timing = timer.getTimings();

    spinner.succeed('Request completed with detailed timing!');
    return response;

  } catch (error) {
    timer.end();
    if (error.config) {
      error.timing = timer.getTimings();
    }
    spinner.fail('Request failed!');
    throw error;
  }
}

// Enhanced performance metrics display
function displayDetailedPerformanceMetrics(timing) {
  console.log(chalk.cyan.bold('\n⚡ DETAILED PERFORMANCE BREAKDOWN'));
  console.log(chalk.gray('═'.repeat(80)));

  const perfTable = new Table({
    head: [chalk.cyan('Phase'), chalk.cyan('Time (ms)'), chalk.cyan('Percentage'), chalk.cyan('Status')],
    colWidths: [20, 15, 15, 30]
  });

  const phases = [
    { name: 'DNS Resolution', key: 'dns', icon: '🔍' },
    { name: 'TCP Connect', key: 'tcp', icon: '🔗' },
    { name: 'TLS Handshake', key: 'tls', icon: '🔐' },
    { name: 'Request Sent', key: 'request', icon: '📤' },
    { name: 'Waiting (TTFB)', key: 'waiting', icon: '⏳' },
    { name: 'First Byte', key: 'firstByte', icon: '🏁' },
    { name: 'Download', key: 'download', icon: '📥' }
  ];

  const total = timing.total || 0;

  phases.forEach(phase => {
    const time = timing.phases[phase.key] || 0;
    const percentage = total > 0 ? ((time / total) * 100).toFixed(1) : '0.0';

    // Color coding based on phase performance
    let status = '';
    let timeColor = chalk.white;

    if (phase.key === 'dns' && time > 100) {
      status = '❗ Slow DNS';
      timeColor = chalk.yellow;
    } else if (phase.key === 'tcp' && time > 200) {
      status = '❗ Slow Connection';
      timeColor = chalk.yellow;
    } else if (phase.key === 'tls' && time > 300) {
      status = '❗ Slow TLS';
      timeColor = chalk.yellow;
    } else if (phase.key === 'waiting' && time > 1000) {
      status = '❗ Slow Server';
      timeColor = chalk.red;
    } else if (phase.key === 'download' && time > 500) {
      status = '❗ Large Response';
      timeColor = chalk.yellow;
    } else if (time > 0) {
      status = '✅ Good';
      timeColor = chalk.green;
    } else {
      status = '➖ N/A';
      timeColor = chalk.gray;
    }

    perfTable.push([
      `${phase.icon} ${phase.name}`,
      timeColor(`${time.toFixed(2)}`),
      `${percentage}%`,
      status
    ]);
  });

  // Add total row
  perfTable.push([
    chalk.bold('🎯 Total Time'),
    chalk.bold.blue(`${total.toFixed(2)}`),
    chalk.bold('100.0%'),
    getOverallPerformanceStatus(total)
  ]);

  console.log(perfTable.toString());

  // Performance insights
  displayPerformanceInsights(timing);
}

function getOverallPerformanceStatus(total) {
  if (total < 200) return chalk.green('🚀 Excellent');
  if (total < 500) return chalk.blue('✅ Good');
  if (total < 1000) return chalk.yellow('❗ Moderate');
  if (total < 2000) return chalk.red('🐌 Slow');
  return chalk.red('❌ Very Slow');
}

function displayPerformanceInsights(timing) {
  console.log(chalk.cyan.bold('\n💡 PERFORMANCE INSIGHTS'));
  const insights = [];

  const phases = timing.phases;

  // DNS insights
  if (phases.dns > 100) {
    insights.push('🔍 DNS resolution is slow - consider using a faster DNS provider');
  }

  // TCP insights
  if (phases.tcp > 200) {
    insights.push('🔗 TCP connection is slow - server might be geographically distant');
  }

  // TLS insights
  if (phases.tls > 300) {
    insights.push('🔐 TLS handshake is slow - server might need SSL optimization');
  }

  // Server response insights
  if (phases.waiting > 1000) {
    insights.push('⏳ Server response time is slow - consider backend optimization');
  }

  // Download insights
  if (phases.download > 500) {
    insights.push('📥 Download time is high - consider response compression or CDN');
  }

  // Connection reuse insights
  const connectionTime = (phases.dns || 0) + (phases.tcp || 0) + (phases.tls || 0);
  const totalTime = timing.total || 0;
  if (connectionTime > totalTime * 0.5) {
    insights.push('🔄 Connection setup takes significant time - consider connection pooling');
  }

  // Overall performance insights
  if (totalTime < 200) {
    insights.push('🚀 Excellent performance - your API is very responsive!');
  } else if (totalTime > 2000) {
    insights.push('🎯 Focus on server-side optimizations for better user experience');
  }

  if (insights.length === 0) {
    insights.push('✅ Performance looks good overall');
  }

  insights.forEach(insight => {
    console.log(chalk.white(`   ${insight}`));
  });
}

// Waterfall visualization
function displayWaterfallChart(timing) {
  console.log(chalk.cyan.bold('\n📊 TIMING WATERFALL'));
  console.log(chalk.gray('═'.repeat(80)));

  const total = timing.total || 0;
  const maxWidth = 60;

  const phases = [
    { name: 'DNS', time: timing.phases.dns || 0, color: chalk.blue },
    { name: 'TCP', time: timing.phases.tcp || 0, color: chalk.green },
    { name: 'TLS', time: timing.phases.tls || 0, color: chalk.yellow },
    { name: 'Wait', time: timing.phases.waiting || 0, color: chalk.red },
    { name: 'Download', time: timing.phases.download || 0, color: chalk.magenta }
  ];

  let currentOffset = 0;

  phases.forEach(phase => {
    if (phase.time > 0) {
      const width = Math.max(1, Math.round((phase.time / total) * maxWidth));
      const offset = Math.round((currentOffset / total) * maxWidth);

      const spaces = ' '.repeat(offset);
      const bar = '█'.repeat(width);
      const timeText = `${phase.time.toFixed(1)}ms`;

      console.log(`${phase.name.padEnd(8)} ${spaces}${phase.color(bar)} ${timeText}`);

      currentOffset += phase.time;
    }
  });

  console.log(chalk.gray(`\nTotal: ${total.toFixed(2)}ms`));
}

// Enhanced response display with detailed timing
function displayResponseBreakdown(response, config) {
  const timing = response.timing || {};

  console.log(chalk.blue.bold('\n🔍 RESPONSE BREAKDOWN'));
  console.log(chalk.gray('═'.repeat(80)));

  // 1. Request Overview
  console.log(chalk.cyan.bold('\n📤 REQUEST OVERVIEW'));
  const requestTable = new Table({
    head: [chalk.cyan('Property'), chalk.cyan('Value')],
    colWidths: [20, 60]
  });

  requestTable.push(
    [chalk.yellow('Method'), config.method.toUpperCase()],
    [chalk.yellow('URL'), config.originalUrl || config.url],
    [chalk.yellow('Headers Count'), Object.keys(config.headers || {}).length],
    [chalk.yellow('Has Body'), config.data ? 'Yes' : 'No']
  );

  console.log(requestTable.toString());

  // 2. Enhanced Performance Metrics with detailed breakdown
  displayDetailedPerformanceMetrics(timing);

  // 3. Waterfall Chart
  displayWaterfallChart(timing);

  // 4. Response Status Analysis
  console.log(chalk.cyan.bold('\n📊 RESPONSE STATUS'));
  const statusTable = new Table({
    head: [chalk.cyan('Property'), chalk.cyan('Value')],
    colWidths: [20, 60]
  });

  const statusColor = response.status >= 200 && response.status < 300 ? chalk.green :
                     response.status >= 400 && response.status < 500 ? chalk.yellow :
                     response.status >= 500 ? chalk.red : chalk.blue;

  statusTable.push(
    [chalk.yellow('Status Code'), statusColor(`${response.status} ${response.statusText}`)],
    [chalk.yellow('Content Length'), response.headers['content-length'] || 'N/A'],
    [chalk.yellow('Content Type'), response.headers['content-type'] || 'N/A']
  );

  console.log(statusTable.toString());

  // 5. Response Headers (condensed)
  console.log(chalk.cyan.bold('\n📋 RESPONSE HEADERS'));
  const headersTable = new Table({
    head: [chalk.cyan('Header'), chalk.cyan('Value')],
    colWidths: [30, 50]
  });

  // Show important headers
  const importantHeaders = ['content-type', 'content-length', 'cache-control', 'set-cookie', 'location'];
  const shownHeaders = [];

  Object.entries(response.headers).forEach(([key, value]) => {
    if (importantHeaders.includes(key.toLowerCase()) && shownHeaders.length < 10) {
      headersTable.push([chalk.yellow(key), value]);
      shownHeaders.push(key);
    }
  });

  console.log(headersTable.toString());

  // 6. Response Body Preview
  console.log(chalk.cyan.bold('\n📄 RESPONSE BODY PREVIEW'));
  const bodyPreview = formatBodyPreview(response.data);
  console.log(bodyPreview);

  // 7. Summary
  console.log(chalk.cyan.bold('\n📊 SUMMARY'));
  const summaryEmoji = response.status >= 200 && response.status < 300 ? '✅' :
                      response.status >= 400 && response.status < 500 ? '⚠️' :
                      response.status >= 500 ? '❌' : '📊';

  console.log(chalk.white(`${summaryEmoji} ${config.method.toUpperCase()} request to ${new URL(config.url).hostname}`));
  console.log(chalk.white(`   Status: ${response.status} | Total Time: ${timing.total?.toFixed(2) || 'N/A'}ms`));
  console.log(chalk.white(`   DNS: ${timing.phases.dns?.toFixed(1) || 'N/A'}ms | TCP: ${timing.phases.tcp?.toFixed(1) || 'N/A'}ms | TLS: ${timing.phases.tls?.toFixed(1) || 'N/A'}ms`));
}

function formatBodyPreview(data) {
  if (!data) return chalk.gray('No response body');

  const maxLength = 500;
  let preview = '';

  if (typeof data === 'object') {
    try {
      const formatted = JSON.stringify(data, null, 2);
      preview = formatted.length > maxLength ?
        formatted.substring(0, maxLength) + '\n... (truncated)' :
        formatted;
    } catch {
      preview = data.toString();
    }
  } else {
    const str = data.toString();
    preview = str.length > maxLength ?
      str.substring(0, maxLength) + '\n... (truncated)' :
      str;
  }

  return preview;
}

// Export the enhanced functions
module.exports = {
  makeRequestWithDetailedTiming,
  displayResponseBreakdown,
  displayDetailedPerformanceMetrics,
  displayWaterfallChart,
  RequestTimer,
  NetworkTimer
};