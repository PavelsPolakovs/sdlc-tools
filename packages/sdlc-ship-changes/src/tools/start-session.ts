import { execSync } from "node:child_process";
import { z } from "zod";
import { checkSessionsGuard, createSession, findActiveSession } from "../state/session-store/index.js";

export const startSessionInputShape = {
  hint: z
    .string()
    .optional()
    .describe(
      "Optional free-text hint describing the intended change, passed through from the " +
        "user/skill invocation as-is and stored on the session so later pipeline steps " +
        "(e.g. Jira task creation) can read it without it being re-supplied.",
    ),
};

export const startSessionInputSchema = z.object(startSessionInputShape);

export type StartSessionInput = z.infer<typeof startSessionInputSchema>;

/**
 * Проверяет, есть ли незакоммиченные изменения в рабочем дереве текущего
 * проекта. Если изменений нет, пайплайну ship-changes нечего доставлять,
 * и сессию не имеет смысла начинать.
 */
function hasPendingChanges(): boolean {
  const output = execSync("git status --porcelain", {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return output.trim().length > 0;
}

/**
 * Хелпер для единообразного формата ответа при блокировке любой из трёх
 * проверок (guard / активная сессия / нет изменений) — модель всегда видит
 * один и тот же префикс "blocked:" и понятную причину.
 */
function blocked(reason: string): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text", text: `blocked: ${reason}` }] };
}

/**
 * Точка входа пайплайна ship-changes — должна вызываться первой. Прогоняет
 * три проверки строго в этом порядке: guard директории сессий -> есть ли уже
 * активная сессия -> есть ли вообще изменения в git. Только если все три
 * прошли успешно, создаёт файл сессии, на который обязаны ссылаться (через
 * `sessionId`) все последующие вызовы инструментов пайплайна.
 */
export function runStartSession(rawInput: unknown): { content: [{ type: "text"; text: string }] } {
  const input = startSessionInputSchema.parse(rawInput);

  // Порядок проверок принципиален: guard по .gitignore должен пройти прежде,
  // чем мы вообще трогаем файловую систему сессий, затем проверяем активную
  // сессию, и только после этого — есть ли изменения в рабочем дереве.
  const guard = checkSessionsGuard();
  if (!guard.ok) return blocked(guard.reason ?? "sessions guard check failed");

  const active = findActiveSession();
  if (active) {
    return blocked(
      `an active session already exists (sessionId ${active.sessionId}, started ` +
        `${new Date(active.timestamp).toISOString()}). Resolve or resume it before starting a new one. ` +
        `If this session is stuck (e.g. the process crashed mid-pipeline), it can be manually recovered by ` +
        `editing its status field to "abandoned" in ` +
        `./tmp/sdlc-sessions/sdlc-${active.timestamp}/session.json — see session-store/README.md.`,
    );
  }

  if (!hasPendingChanges()) {
    return blocked("no pending changes found (git status --porcelain is empty); nothing to ship.");
  }

  const session = createSession(input.hint);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          sessionId: session.sessionId,
          timestamp: session.timestamp,
          status: "started",
          nextTool: "read_changes",
        }),
      },
    ],
  };
}
