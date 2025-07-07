#!/usr/bin/env node

const { program } = require('commander');
const inquirer = require('inquirer');
const axios = require('axios');
const chalk = require('chalk');
const figlet = require('figlet');
const ora = require('ora');
const Table = require('cli-table3');
const { JSONPath } = require('jsonpath-plus');
const { makeRequestWithDetailedTiming, displayResponseBreakdown } = require('./request-timer');

// ASCII Art Banner
function showBanner() {
  console.log(
    chalk.cyan(
      figlet.textSync('HTTP CLI', {
        font: 'Big',
        horizontalLayout: 'default',
        verticalLayout: 'default'
      })
    )
  );
  console.log(chalk.gray('🚀 Interactive HTTP Client for the Command Line\n'));
}

// Common headers for selection
const commonHeaders = [
  { name: 'Content-Type: application/json', value: { 'Content-Type': 'application/json' } },
  { name: 'Content-Type: application/x-www-form-urlencoded', value: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  { name: 'Accept: application/json', value: { 'Accept': 'application/json' } },
  { name: 'Accept: text/html', value: { 'Accept': 'text/html' } },
  { name: 'User-Agent: HTTP-CLI/1.0', value: { 'User-Agent': 'HTTP-CLI/1.0' } },
  { name: 'Authorization: Bearer (will prompt for token)', value: { 'Authorization': 'Bearer <token>' } },
  { name: 'X-API-Key (will prompt for key)', value: { 'X-API-Key': '<key>' } },
  { name: 'Accept-Encoding: gzip, deflate', value: { 'Accept-Encoding': 'gzip, deflate' } },
  { name: 'Cache-Control: no-cache', value: { 'Cache-Control': 'no-cache' } }
];

// Enhanced timing tracker
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
        download: null
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
    // For now, we'll estimate phases (real implementation would need lower-level hooks)
    this.timings.phases.request = this.timings.total * 0.3;
    this.timings.phases.firstByte = this.timings.total * 0.6;
    this.timings.phases.download = this.timings.total * 0.4;
    return this;
  }

  getTimings() {
    return { ...this.timings };
  }
}

// Response analyzer
class ResponseAnalyzer {
  constructor(response) {
    this.response = response;
    this.analysis = this.analyze();
  }

  analyze() {
    const data = this.response.data;
    const headers = this.response.headers;
    const status = this.response.status;

    return {
      dataType: this.getDataType(data, headers),
      size: this.getResponseSize(data, headers),
      structure: this.analyzeStructure(data),
      performance: this.analyzePerformance(),
      security: this.analyzeSecurityHeaders(headers),
      caching: this.analyzeCaching(headers),
      statusCategory: this.getStatusCategory(status)
    };
  }

  getDataType(data, headers) {
    const contentType = headers['content-type'] || '';

    if (contentType.includes('application/json')) return 'JSON';
    if (contentType.includes('text/html')) return 'HTML';
    if (contentType.includes('text/xml') || contentType.includes('application/xml')) return 'XML';
    if (contentType.includes('text/plain')) return 'Plain Text';
    if (contentType.includes('image/')) return 'Image';
    if (contentType.includes('application/pdf')) return 'PDF';

    return 'Unknown';
  }

  getResponseSize(data, headers) {
    const contentLength = headers['content-length'];
    if (contentLength) {
      return {
        bytes: parseInt(contentLength),
        formatted: this.formatBytes(parseInt(contentLength))
      };
    }

    // Estimate size from data
    const estimatedSize = JSON.stringify(data).length;
    return {
      bytes: estimatedSize,
      formatted: this.formatBytes(estimatedSize),
      estimated: true
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  analyzeStructure(data) {
    if (!data) return { type: 'empty' };

    if (Array.isArray(data)) {
      return {
        type: 'array',
        length: data.length,
        itemType: data.length > 0 ? typeof data[0] : 'unknown'
      };
    }

    if (typeof data === 'object') {
      const keys = Object.keys(data);
      return {
        type: 'object',
        keys: keys.length,
        topLevelKeys: keys.slice(0, 10) // Show first 10 keys
      };
    }

    return {
      type: typeof data,
      length: data.toString().length
    };
  }

  analyzePerformance() {
    const timing = this.response.timing || {};
    const status = this.response.status;

    let performance = 'good';
    if (timing.total > 5000) performance = 'slow';
    else if (timing.total > 2000) performance = 'moderate';
    else if (timing.total < 500) performance = 'excellent';

    return {
      rating: performance,
      recommendations: this.getPerformanceRecommendations(timing, status)
    };
  }

  getPerformanceRecommendations(timing, status) {
    const recommendations = [];

    if (timing.total > 2000) {
      recommendations.push('Consider optimizing server response time');
    }

    if (status >= 400) {
      recommendations.push('Check API endpoint and request parameters');
    }

    if (!this.response.headers['cache-control']) {
      recommendations.push('Consider adding cache headers for better performance');
    }

    return recommendations;
  }

  analyzeSecurityHeaders(headers) {
    const securityHeaders = {
      'strict-transport-security': 'HSTS',
      'x-frame-options': 'Frame Options',
      'x-content-type-options': 'Content Type Options',
      'x-xss-protection': 'XSS Protection',
      'content-security-policy': 'CSP'
    };

    const present = [];
    const missing = [];

    Object.entries(securityHeaders).forEach(([header, name]) => {
      if (headers[header]) {
        present.push(name);
      } else {
        missing.push(name);
      }
    });

    return { present, missing };
  }

  analyzeCaching(headers) {
    const cacheControl = headers['cache-control'];
    const etag = headers['etag'];
    const lastModified = headers['last-modified'];
    const expires = headers['expires'];

    return {
      cacheControl: cacheControl || 'Not set',
      etag: etag ? 'Present' : 'Not set',
      lastModified: lastModified || 'Not set',
      expires: expires || 'Not set',
      cacheable: !!(cacheControl && !cacheControl.includes('no-cache'))
    };
  }

  getStatusCategory(status) {
    if (status >= 200 && status < 300) return 'success';
    if (status >= 300 && status < 400) return 'redirect';
    if (status >= 400 && status < 500) return 'client_error';
    if (status >= 500) return 'server_error';
    return 'informational';
  }
}

// Generate quick command string for reuse
function generateQuickCommand(config) {
  let command = 'awesome-http-cli quick';

  // Add URL
  command += ` -u "${config.url}"`;

  // Add method if not GET
  if (config.method && config.method.toUpperCase() !== 'GET') {
    command += ` -m ${config.method.toUpperCase()}`;
  }

  // Add headers if any
  if (config.headers && Object.keys(config.headers).length > 0) {
    const headersJson = JSON.stringify(config.headers);
    command += ` -H '${headersJson}'`;
  }

  // Add data if any
  if (config.data) {
    const dataJson = typeof config.data === 'object' ? JSON.stringify(config.data) : config.data;
    command += ` -d '${dataJson}'`;
  }

  return command;
}

// Parse query parameters from string
function parseQueryParams(queryString) {
  if (!queryString || queryString.trim() === '') return {};

  const params = {};
  const pairs = queryString.split('&');

  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
    }
  }

  return params;
}

// Parse JSON safely
function parseJSON(jsonString) {
  if (!jsonString || jsonString.trim() === '') return null;

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.log(chalk.red('❌ Invalid JSON format. Please check your input.'));
    return null;
  }
}

// Enhanced body preview with smart truncation
function formatBodyPreview(data, dataType) {
  if (!data) return chalk.gray('No response body');

  let preview = '';
  const maxLength = 1000;

  if (dataType === 'JSON') {
    try {
      const formatted = JSON.stringify(data, null, 2);
      preview = formatted.length > maxLength ?
        formatted.substring(0, maxLength) + '\n... (truncated)' :
        formatted;
    } catch {
      preview = data.toString();
    }
  } else {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    preview = str.length > maxLength ?
      str.substring(0, maxLength) + '\n... (truncated)' :
      str;
  }

  return preview;
}

// Legacy format functions (kept for compatibility)
function formatResponse(response) {
  const table = new Table({
    head: [chalk.cyan('Response Info'), chalk.cyan('Value')],
    colWidths: [20, 60]
  });

  const responseTime = response.timing?.total || 0;

  table.push(
    [chalk.yellow('Status'), `${response.status} ${response.statusText}`],
    [chalk.yellow('Response Time'), `${responseTime.toFixed(2)}ms`],
    [chalk.yellow('Content Length'), response.headers['content-length'] || 'N/A'],
    [chalk.yellow('Content Type'), response.headers['content-type'] || 'N/A']
  );

  return table.toString();
}

function formatHeaders(headers) {
  const table = new Table({
    head: [chalk.cyan('Header'), chalk.cyan('Value')],
    colWidths: [30, 50]
  });

  Object.entries(headers).forEach(([key, value]) => {
    table.push([chalk.yellow(key), value]);
  });

  return table.toString();
}

function formatBody(data, contentType) {
  if (!data) return chalk.gray('No response body');

  if (contentType && contentType.includes('application/json')) {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return data.toString();
    }
  }

  if (typeof data === 'object') {
    return JSON.stringify(data, null, 2);
  }

  return data.toString();
}

// Main interactive flow
async function startInteractiveMode() {
  let continueRequests = true;

  while (continueRequests) {
    console.log(chalk.blue.bold('\n📋 Configure your HTTP request:\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'url',
        message: 'Enter the URL:',
        validate: (input) => {
          if (!input.trim()) return 'URL is required';
          try {
            new URL(input);
            return true;
          } catch {
            return 'Please enter a valid URL (include http:// or https://)';
          }
        }
      },
      {
        type: 'list',
        name: 'method',
        message: 'Select HTTP method:',
        choices: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        default: 'GET'
      },
      {
        type: 'input',
        name: 'queryParams',
        message: 'Enter query parameters (format: key1=value1&key2=value2):',
        when: () => true
      },
      {
        type: 'checkbox',
        name: 'selectedHeaders',
        message: 'Select common headers:',
        choices: commonHeaders.map(h => ({ name: h.name, value: h.value }))
      },
      {
        type: 'input',
        name: 'customHeaders',
        message: 'Enter custom headers (JSON format, e.g., {"X-Custom": "value"}):',
        validate: (input) => {
          if (!input.trim()) return true;
          try {
            JSON.parse(input);
            return true;
          } catch {
            return 'Please enter valid JSON format for headers';
          }
        }
      },
      {
        type: 'editor',
        name: 'body',
        message: 'Enter request body (JSON/text):',
        when: (answers) => ['POST', 'PUT', 'PATCH'].includes(answers.method)
      }
    ]);

    // Process the answers
    const config = {
      url: answers.url,
      method: answers.method.toLowerCase(),
      headers: {},
      params: parseQueryParams(answers.queryParams),
      originalUrl: answers.url // Store original URL for quick command
    };

    // Merge selected headers and handle placeholders
    for (const headerObj of answers.selectedHeaders) {
      const headerEntries = Object.entries(headerObj);
      for (const [key, value] of headerEntries) {
        if (value.includes('<token>') || value.includes('<key>')) {
          // Ask for the actual token/key value
          const placeholder = value.includes('<token>') ? 'token' : 'key';
          const { tokenValue } = await inquirer.prompt([
            {
              type: 'input',
              name: 'tokenValue',
              message: `Enter the ${placeholder} value for ${key}:`,
              validate: (input) => input.trim() ? true : `${placeholder} value is required`
            }
          ]);

          if (value.includes('<token>')) {
            config.headers[key] = value.replace('<token>', tokenValue);
          } else {
            config.headers[key] = tokenValue;
          }
        } else {
          config.headers[key] = value;
        }
      }
    }

    // Add custom headers
    if (answers.customHeaders && answers.customHeaders.trim()) {
      try {
        const customHeaders = JSON.parse(answers.customHeaders);
        Object.assign(config.headers, customHeaders);
      } catch (error) {
        console.log(chalk.red('❌ Failed to parse custom headers, skipping...'));
      }
    }

    // Add query parameters to URL for quick command
    if (Object.keys(config.params || {}).length > 0) {
      const urlObj = new URL(config.url);
      Object.entries(config.params).forEach(([key, value]) => {
        urlObj.searchParams.append(key, value);
      });
      config.url = urlObj.toString();
    }

    // Add request body
    if (answers.body && answers.body.trim()) {
      const parsedBody = parseJSON(answers.body);
      if (parsedBody !== null) {
        config.data = parsedBody;
        if (!config.headers['Content-Type']) {
          config.headers['Content-Type'] = 'application/json';
        }
      } else {
        config.data = answers.body;
      }
    }

    try {
      // Make the request
      const response = await makeRequestWithDetailedTiming(config);

      // Display complete response with breakdown
      displayResponseBreakdown(response, config);

    } catch (error) {
      console.log(chalk.red.bold('\n❌ Request Error:'));
      console.log(chalk.red(error.message));

      if (error.response) {
        console.log(chalk.yellow(`Status: ${error.response.status}`));
        console.log(chalk.yellow(`Response: ${JSON.stringify(error.response.data, null, 2)}`));
      }
    }

    // Ask if user wants to continue
    const { continue: shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: 'Make another request?',
        default: true
      }
    ]);

    continueRequests = shouldContinue;
  }

  console.log(chalk.cyan.bold('\n👋 Thanks for using HTTP CLI! Goodbye!'));
}

// Program setup
program
  .name('awesome-http-cli')
  .description('Interactive HTTP client for the command line')
  .version('1.0.0');

program
  .command('start')
  .description('Start interactive HTTP client')
  .action(() => {
    showBanner();
    startInteractiveMode();
  });

program
  .command('quick')
  .description('Quick HTTP request')
  .option('-u, --url <url>', 'Request URL')
  .option('-m, --method <method>', 'HTTP method', 'GET')
  .option('-H, --headers <headers>', 'Headers in JSON format')
  .option('-d, --data <data>', 'Request body')
  .action(async (options) => {
    if (!options.url) {
      console.log(chalk.red('❌ URL is required for quick mode'));
      return;
    }

    const config = {
      url: options.url,
      method: options.method.toLowerCase(),
      headers: options.headers ? JSON.parse(options.headers) : {},
      data: options.data ? (parseJSON(options.data) || options.data) : undefined,
      showQuickCommand: false // Don't show quick command in quick mode
    };

    try {
      const response = await makeRequestWithDetailedTiming(config);

      // Use the same complete response display as interactive mode
      displayResponseBreakdown(response, config);

    } catch (error) {
      console.log(chalk.red.bold('\n❌ Request Error:'));
      console.log(chalk.red(error.message));

      if (error.response) {
        console.log(chalk.yellow(`Status: ${error.response.status}`));
        console.log(chalk.yellow(`Response: ${JSON.stringify(error.response.data, null, 2)}`));
      }
    }
  });

// Default action
if (process.argv.length === 2) {
  showBanner();
  startInteractiveMode();
} else {
  program.parse();
}