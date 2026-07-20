#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { reportInputShape, runReport } from "./tools/report.js";
import { readChangesInputShape, runReadChanges } from "./tools/read-changes.js";
import { startSessionInputShape, runStartSession } from "./tools/start-session.js";

const server = new McpServer({
  name: "sdlc-ship-changes",
  version: "0.1.0",
});

// Точка входа пайплайна — единственный способ создать сессию, к которой должны
// обращаться (по sessionId) все последующие инструменты.
server.registerTool(
  "start_session",
  {
    description:
      "Entry point of the ship-changes pipeline. Must be called first — checks that " +
      "./tmp/sdlc-sessions/ is set up and gitignored, that no session is already active, " +
      "and that the working tree actually has changes to ship, then creates the session " +
      "file that every subsequent pipeline tool call must reference by sessionId.",
    inputSchema: startSessionInputShape,
  },
  async (input) => runStartSession(input),
);

// Первый шаг после старта сессии — единственный способ структурировать
// изменения рабочего дерева перед созданием Jira-задачи.
server.registerTool(
  "read_changes",
  {
    description:
      "First step after start_session. Requires the sessionId returned by start_session. " +
      "Runs a three-phase read of the working tree (git status/diff overview, per-file diff, " +
      "extended context for high-signal files), writes the full snapshot to changes.json inside " +
      "the session directory, and returns only a minimal completion confirmation — not the raw " +
      "diffs or file list. Read changes.json directly if you need the actual file contents.",
    inputSchema: readChangesInputShape,
  },
  async (input) => runReadChanges(input),
);

// Финальный шаг пайплайна — единственный способ получить текст итогового отчёта.
server.registerTool(
  "ship_report",
  {
    description:
      "Final, mandatory step of the ship-changes pipeline. Requires the sessionId " +
      "returned by start_session. Records a report_submitted audit event, marks that " +
      "session completed, and returns the formatted final report. This is the only way " +
      "to produce the final report — do not hand-write the report text yourself instead " +
      "of calling this tool.",
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
