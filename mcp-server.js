const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema, ListToolsRequestSchema } = require("@modelcontextprotocol/sdk/types.js");
const { crawl } = require('./site-scanner.js');

const server = new Server(
    {
        name: "site-analyzer",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "scan_website_deep",
                description: "Deeply scans a website using Playwright to identify UI components, forms, and interactive elements across multiple pages.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The starting URL of the website to scan."
                        },
                        maxPages: {
                            type: "number",
                            description: "Maximum number of pages to crawl (default: 50)."
                        },
                        timeout: {
                            type: "number",
                            description: "Timeout in milliseconds for page loads (default: 30000)."
                        }
                    },
                    required: ["url"]
                }
            }
        ]
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    switch (request.params.name) {
        case "scan_website_deep": {
            const { url, maxPages, timeout } = request.params.arguments;
            try {
                const data = await crawl(url, { maxPages, timeout });
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(data, null, 2)
                        }
                    ]
                };
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error scanning website: ${error.message}`
                        }
                    ],
                    isError: true
                };
            }
        }
        default:
            throw new Error("Unknown tool");
    }
});

const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
