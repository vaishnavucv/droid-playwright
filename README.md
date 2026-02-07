# Site Analyzer MCP Server

This tool uses Playwright to deep-crawl a website and analyze its structure, extracting UI components, forms, authentication points, and other interactive elements into a structured JSON format.

## Setup

1.  Install dependencies:
    ```bash
    npm install
    npx playwright install chromium
    ```

### Troubleshooting

If you encounter permission errors during browser installation (e.g., `EACCES: permission denied`), try setting a local browser path:

```bash
# Set browsers to be installed in the current directory
export PLAYWRIGHT_BROWSERS_PATH=./.playwright
npx playwright install chromium
```

Then run the scanner with the same environment variable:

```bash
export PLAYWRIGHT_BROWSERS_PATH=./.playwright
node site-scanner.js <URL>
```

### As an MCP Server

This project provides an MCP server that exposes the `scan_website_deep` tool.

To use it with Claude Desktop or other MCP clients, add the following to your configuration:

```json
{
  "mcpServers": {
    "site-analyzer": {
      "command": "node",
      "args": ["/Users/vaishnavucv/nuvepro-palywright/mcp-server.js"],
      "env": {
        "PLAYWRIGHT_BROWSERS_PATH": "/Users/vaishnavucv/nuvepro-palywright/.playwright"
      }
    }
  }
}
```

## Features

-   **Deep Crawling**: Visits multiple pages on the same domain (limit: 50 pages).
-   **Element Analysis**: Identifies:
    -   UI Components
    -   Forms & Inputs
    -   Authentication Points (Login/Register)
    -   Navigation Paths
    -   File Upload/Download
    -   Drag & Drop Targets

## Authentication

If the site requires login, you can provide credentials in a `config.yml` file in the project directory:

```yaml
username: "myuser"
email: "user@example.com" 
password: "mypassword"

# Flags to select credential type
use_email: true # Set true to use email
use_username: false 
```

The scanner will automatically attempt to fill and submit login forms when detected, respecting your selection.

## Link Filtering

You can control which URLs are scanned by creating a `link-rules.json` file in the project directory.

First, enable it in `config.yml`:
```yaml
use_link_rules: true
```

Then define your rules in `link-rules.json`:
```json
{
  "include": [],          // If set, only URLs containing these strings will be scanned
  "exclude": ["logout", "signout"] // URLs containing these strings will be skipped
}
```
Exclusions take priority. If `include` lists are provided, a URL must match at least one include rule AND not match any exclude rules.
