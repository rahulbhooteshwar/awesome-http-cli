
# awesome-http-cli 🚀

An interactive, colorful command-line HTTP client built with Node.js. Perfect for testing APIs, making HTTP requests, and exploring web services directly from your terminal.

## Features ✨

- **Interactive Mode**: Step-by-step prompts to build your HTTP request
- **Multiple HTTP Methods**: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
- **Header Management**:
  - Select from common headers with checkboxes
  - Add custom headers in JSON format
- **Query Parameters**: Easy parameter input with key=value&key2=value2 format
- **Request Body**: Support for JSON and text bodies with validation
- **Colorful Output**: Beautiful, colored response formatting
- **Response Analysis**:
  - Status codes with color coding
  - Response headers table
  - Formatted response body
  - Response time tracking
- **Quick Mode**: Command-line arguments for fast requests
- **Error Handling**: Comprehensive error reporting

## Installation
```bash
npm i -g awesome-http-cli
```
## Help Menu

```bash
awesome-http-cli --help
```
![Screenshot 2025-07-04 at 19 07 05](https://github.com/user-attachments/assets/0c2f5ea4-d322-4824-9de5-b3b0004b37ac)

```bash
awesome-http-cli quick --help
```
![Screenshot 2025-07-04 at 19 07 25](https://github.com/user-attachments/assets/8c7b1c4e-8f8a-49bb-bfd3-e69683e1b0cd)


## Local Development & Installation 📦

1. **Clone or download the files**
2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Make it globally available (optional):**
   ```bash
   npm link
   ```

## Dependencies to Install 📋

Run this command to install all required dependencies:

```bash
npm install axios chalk cli-table3 commander figlet inquirer jsonpath-plus ora
```

### Development Dependencies (optional):
```bash
npm install --save-dev nodemon
```

## Usage 🎯

### Interactive Mode (Default)

Simply run the tool to start interactive mode:

```bash
node index.js
```

Or if globally installed:
```bash
awesome-http-cli start
```

### Quick Mode

For quick requests without prompts:

```bash
# Simple GET request
awesome-http-cli quick -u https://api.github.com/users/octocat

# POST request with data
awesome-http-cli quick -u https://httpbin.org/post -m POST -d '{"key":"value"}' -H '{"Content-Type":"application/json"}'

# With custom headers
awesome-http-cli quick -u https://api.example.com -H '{"Authorization":"Bearer token123","X-API-Key":"abc123"}'
```

### Quick Mode Options

- `-u, --url <url>`: Request URL (required)
- `-m, --method <method>`: HTTP method (default: GET)
- `-H, --headers <headers>`: Headers in JSON format
- `-d, --data <data>`: Request body (JSON or text)

## Interactive Mode Guide 📚

1. **URL Input**: Enter the full URL including protocol (http:// or https://)
2. **Method Selection**: Choose from GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
3. **Query Parameters**: Format as `key1=value1&key2=value2` (optional)
4. **Common Headers**: Select from predefined headers using checkboxes
5. **Custom Headers**: Add custom headers in JSON format (optional)
6. **Request Body**: Enter JSON or text data for POST/PUT/PATCH requests

## Examples 🔧

### REST API Testing
```bash
# Test a REST API
URL: https://jsonplaceholder.typicode.com/posts/1
Method: GET

# Create a new post
URL: https://jsonplaceholder.typicode.com/posts
Method: POST
Body: {"title":"My Post","body":"This is my post content","userId":1}
Headers: Content-Type: application/json
```

### API with Authentication
```bash
URL: https://api.github.com/user
Method: GET
Headers: {"Authorization": "token YOUR_GITHUB_TOKEN"}
```

### Form Data Submission
```bash
URL: https://httpbin.org/post
Method: POST
Body: name=John&email=john@example.com
Headers: Content-Type: application/x-www-form-urlencoded
```

## Response Display 📊

The tool displays responses in a structured format:

- **Response Info Table**: Status, response time, content length/type
- **Headers Table**: All response headers in a formatted table
- **Response Body**: Formatted JSON or raw text
- **Status Indicators**:
  - ✅ Green for 2xx (success)
  - ⚠️ Yellow for 4xx (client errors)
  - ❌ Red for 5xx (server errors)

## Available Scripts 📝

- `npm start`: Run the application
- `npm run dev`: Run with nodemon for development
- `node index.js`: Direct execution

## Requirements 📋

- Node.js 14.0.0 or higher
- npm or yarn package manager

## Features in Detail 🔍

### Header Management
- **Common Headers**: Pre-defined headers for quick selection
- **Custom Headers**: Add any custom headers in JSON format
- **Automatic Content-Type**: Automatically sets content-type for JSON bodies

### Request Body Handling
- **JSON Validation**: Automatic JSON parsing and validation
- **Text Support**: Plain text bodies for any content type
- **Editor Support**: Multi-line input for complex JSON

### Error Handling
- **Network Errors**: Connection timeouts, DNS failures
- **HTTP Errors**: 4xx and 5xx status codes with details
- **Input Validation**: URL validation, JSON parsing errors

## Contributing 🤝

Feel free to submit issues and enhancement requests!

## License 📄

MIT License - feel free to use this tool for any purpose.
