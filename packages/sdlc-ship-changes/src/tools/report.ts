import { z } from "zod";
import { append } from "../state/audit-log.js";
import { setCurrent, markCompleted, clearCurrent } from "../state/session-store/index.js";

export const reportInputShape = {
  key: z.string().describe("Jira issue key, e.g. UNCS-305"),
  status: z
    .enum(["Resolved", "Awaiting Deployment"])
    .describe("Jira status to report the issue as"),
  branch: z.string().describe("Git branch the change was shipped from"),
  commitSha: z.string().describe("Commit SHA that was shipped"),
  verdict: z
    .enum(["pass", "changes_requested"])
    .describe("Outcome of code review for the merge request"),
  mrWebUrl: z.string().url().describe("Web URL of the merge request"),
  mrIid: z.number().int().describe("Internal ID (iid) of the merge request"),
  filesTouched: z.array(z.string()).describe("Paths of files changed by the commit"),
  blockers: z
    .array(z.string())
    .default([])
    .describe("Any unresolved blockers preventing deployment; empty if none"),
};

export const reportInputSchema = z.object(reportInputShape);

export type ReportInput = z.infer<typeof reportInputSchema>;

/**
 * Форматирует входные данные отчёта в финальный текст, который увидит пользователь.
 * Чистая функция — не пишет в audit-лог и не меняет состояние сессии.
 */
export function formatReport(input: ReportInput): string {
  const filesLine = input.filesTouched.join(", ");
  const blockersLine = input.blockers.length > 0 ? input.blockers.join("; ") : "none";

  return [
    `${input.key} status: ${input.status}`,
    `Branch: ${input.branch} (commit ${input.commitSha})`,
    `Review: ${input.verdict}`,
    `MR: ${input.mrWebUrl} (iid ${input.mrIid})`,
    `Files: ${filesLine}`,
    `Blockers: ${blockersLine}`,
  ].join("\n");
}

/**
 * Финальный, обязательный шаг пайплайна ship-changes. Единственный код-путь,
 * производящий текст отчёта: fail-closed паттерн — audit-событие
 * `report_submitted` и маркер завершения шага `report` записываются только
 * здесь, после того как `formatReport` реально сформировал текст, поэтому
 * модель не может "отчитаться" самостоятельно, в обход этого инструмента.
 */
export function runReport(rawInput: unknown): { content: [{ type: "text"; text: string }] } {
  setCurrent("report");

  let input: ReportInput;
  try {
    input = reportInputSchema.parse(rawInput);
  } catch (error) {
    clearCurrent();
    throw error;
  }

  const text = formatReport(input);

  append("report_submitted", { key: input.key, status: input.status });
  markCompleted("report");

  return { content: [{ type: "text", text }] };
}
