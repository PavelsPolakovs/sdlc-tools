import type { SessionRecord } from "./types.js";

/**
 * Рендерит `SessionRecord` в человекочитаемый `log.md`. Это проекция,
 * а не отдельный источник истины: генерируется заново из `record.events`
 * при каждой персистентности (см. `persist-session.ts`), вручную не редактируется.
 */
export function renderLog(record: SessionRecord): string {
  const lines = [
    `# Session ${record.sessionId}`,
    "",
    `- Status: ${record.status}`,
    `- Current step: ${record.currentStep ?? "(none)"}`,
    ...(record.hint ? [`- Hint: ${record.hint}`] : []),
    "",
    "## Events",
    "",
    ...record.events.map(
      (event) =>
        `- ${new Date(event.timestamp).toISOString()} — ${event.event}` +
        (event.detail ? ` (${JSON.stringify(event.detail)})` : ""),
    ),
  ];
  return `${lines.join("\n")}\n`;
}
