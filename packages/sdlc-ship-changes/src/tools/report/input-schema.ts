import { z } from "zod";

/** Zod-схема входа инструмента `ship_report` — все поля финального отчёта. */
export const reportInputShape = {
  sessionId: z
    .string()
    .uuid()
    .describe("sessionId returned by start_session; identifies which on-disk session this report closes out"),
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
