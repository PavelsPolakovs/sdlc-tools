#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { reportInputShape, runReport } from "./tools/report.js";

const server = new McpServer({
  name: "sdlc-ship-changes",
  version: "0.1.0",
});

server.registerTool(
  "ship_report",
  {
    description:
      "Final, mandatory step of the ship-changes pipeline. Records a " +
      "report_submitted audit event and returns the formatted final report. " +
      "This is the only way to produce the final report — do not hand-write " +
      "the report text yourself instead of calling this tool.",
    inputSchema: reportInputShape,
  },
  async (input) => runReport(input),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("sdlc-ship-changes MCP server running on stdio");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
