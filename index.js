#!/usr/bin/env node

const { program } = require('commander');
const inquirer = require('inquirer');
const axios = require('axios');
const chalk = require('chalk');
const figlet = require('figlet');
const ora = require('ora');
const Table = require('cli-table3');
const { JSONPath } = require('jsonpath-plus');

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

// Format response data
function formatResponse(response) {
  const table = new Table({
    head: [chalk.cyan('Response Info'), chalk.cyan('Value')],
    colWidths: [20, 60]
  });

  const responseTime = response.config.metadata?.endTime - response.config.metadata?.startTime || 0;

  table.push(
    [chalk.yellow('Status'), `${response.status} ${response.statusText}`],
    [chalk.yellow('Response Time'), `${responseTime}ms`],
    [chalk.yellow('Content Length'), response.headers['content-length'] || 'N/A'],
    [chalk.yellow('Content Type'), response.headers['content-type'] || 'N/A']
  );

  return table.toString();
}

// Format response headers
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

// Format response body
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

// Main HTTP request function
async function makeRequest(config) {
  const spinner = ora('Sending HTTP request...').start();

  try {
    // Add request interceptor for timing
    const requestConfig = {
      ...config,
      metadata: { startTime: Date.now() }
    };

    const response = await axios({
      ...requestConfig,
      validateStatus: () => true // Don't throw on 4xx/5xx
    });

    response.config.metadata.endTime = Date.now();
    spinner.succeed('Request completed!');

    return response;
  } catch (error) {
    spinner.fail('Request failed!');
    throw error;
  }
}

// Display complete response (used by both interactive and quick modes)
function displayCompleteResponse(response, config) {
  // Display response body first
  console.log(chalk.blue.bold('\n📄 Response Body:'));
  const formattedBody = formatBody(response.data, response.headers['content-type']);
  console.log(formattedBody);

  // Show request summary
  console.log(chalk.green.bold('\n📤 Request Summary:'));
  console.log(chalk.white(`${config.method.toUpperCase()} ${config.originalUrl || config.url}`));

  if (Object.keys(config.headers || {}).length > 0) {
    console.log(chalk.gray('Headers:'), JSON.stringify(config.headers, null, 2));
  }

  if (Object.keys(config.params || {}).length > 0) {
    console.log(chalk.gray('Query Params:'), JSON.stringify(config.params, null, 2));
  }

  if (config.data) {
    console.log(chalk.gray('Body:'), typeof config.data === 'object' ? JSON.stringify(config.data, null, 2) : config.data);
  }

  // Status color coding with timing
  const responseTime = response.config.metadata?.endTime - response.config.metadata?.startTime || 0;

  if (response.status >= 200 && response.status < 300) {
    console.log(chalk.green.bold(`\n✅ Success! Status: ${response.status} | Time: ${responseTime}ms`));
  } else if (response.status >= 400 && response.status < 500) {
    console.log(chalk.yellow.bold(`\n⚠️  Client Error! Status: ${response.status} | Time: ${responseTime}ms`));
  } else if (response.status >= 500) {
    console.log(chalk.red.bold(`\n❌ Server Error! Status: ${response.status} | Time: ${responseTime}ms`));
  } else {
    console.log(chalk.blue.bold(`\n📊 Response! Status: ${response.status} | Time: ${responseTime}ms`));
  }

  // Display tables at the end
  console.log(chalk.green.bold('\n📊 Response Summary:'));
  console.log(formatResponse(response));

  console.log(chalk.blue.bold('\n📋 Response Headers:'));
  console.log(formatHeaders(response.headers));
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
    };

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
      const response = await makeRequest(config);

      // Display complete response
      displayCompleteResponse(response, config);

      // Generate quick command for future use (only in interactive mode)
      console.log(chalk.cyan.bold('\n⚡ Quick Command for Future Use:'));
      const quickCommand = generateQuickCommand(config);
      console.log(chalk.gray(quickCommand));

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
      data: options.data ? (parseJSON(options.data) || options.data) : undefined
    };

    try {
      const response = await makeRequest(config);

      // Use the same complete response display as interactive mode
      displayCompleteResponse(response, config);

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