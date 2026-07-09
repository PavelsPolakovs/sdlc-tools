import { z } from "zod";
import { append } from "../state/audit-log.js";
import { setCurrent, markCompleted } from "../state/session-store.js";

export const reportInputShape = {
  key: z.string(),
  status: z.enum(["Resolved", "Awaiting Deployment"]),
  branch: z.string(),
  commitSha: z.string(),
  verdict: z.enum(["pass", "changes_requested"]),
  mrWebUrl: z.string().url(),
  mrIid: z.number().int(),
  filesTouched: z.array(z.string()),
  blockers: z.array(z.string()).default([]),
};

export const reportInputSchema = z.object(reportInputShape);

export type ReportInput = z.infer<typeof reportInputSchema>;

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

export function runReport(rawInput: unknown): { content: [{ type: "text"; text: string }] } {
  setCurrent("report");

  const input = reportInputSchema.parse(rawInput);
  const text = formatReport(input);

  // Fail-closed: the audit event and completion marker are only recorded
  // here, after formatReport has actually produced the text — the model
  // cannot self-report a "report_submitted" event without going through
  // this code path.
  append("report_submitted", { key: input.key, status: input.status });
  markCompleted("report");

  return { content: [{ type: "text", text }] };
}
