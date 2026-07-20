import { join } from "node:path";
import { append } from "../../state/audit-log.js";
import {
  setCurrent,
  markCompleted,
  clearCurrent,
  getSessionById,
  updateSession,
  sessionDirFor,
} from "../../state/session-store/index.js";
import { readChangesInputSchema, type ReadChangesInput } from "./input-schema.js";
import { runStructureScript } from "./run-structure-script.js";

/**
 * Первый шаг пайплайна после `start_session`. Прогоняет фазы A/B/C через
 * внешний скрипт `structure-changes.mjs` (см. согласованное решение 2.4 в
 * спецификации узла 2) и записывает единый снимок изменений в
 * `changes.json` внутри директории сессии. В контекст модели возвращается
 * только минимальное подтверждение (2.4.2) — ни сырые диффы, ни сводные
 * цифры сюда не попадают; полное содержимое остаётся на диске и читается
 * адресно только тогда, когда это реально понадобится.
 */
export function runReadChanges(rawInput: unknown): { content: [{ type: "text"; text: string }] } {
  setCurrent("read_changes");

  let input: ReadChangesInput;
  try {
    input = readChangesInputSchema.parse(rawInput);
  } catch (error) {
    clearCurrent();
    throw error;
  }

  const session = getSessionById(input.sessionId);
  if (!session) {
    clearCurrent();
    throw new Error(`session ${input.sessionId} not found`);
  }
  if (session.status !== "active") {
    clearCurrent();
    throw new Error(`session ${input.sessionId} is not active (status: ${session.status})`);
  }

  try {
    const changesJsonPath = join(sessionDirFor(session), "changes.json");
    const result = runStructureScript(session.timestamp, changesJsonPath, input);

    append(result.mode === "append" ? "changes_appended" : "changes_structured", {
      summary: result.summary,
    });
    markCompleted("read_changes");
    updateSession(input.sessionId, {
      currentStep: "read_changes",
      event: result.mode === "append" ? "changes_appended" : "changes_structured",
      detail: result.summary,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            sessionId: input.sessionId,
            step: "read-changes",
            status: "completed",
            changesPath: result.path,
            nextTool: null,
            note: "create_jira_task is not implemented yet; read_changes is currently the last available pipeline tool.",
          }),
        },
      ],
    };
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String((error as { stderr?: unknown }).stderr ?? "") : "";
    const message = stderr || (error instanceof Error ? error.message : String(error));

    if (message.includes("no-changes")) {
      updateSession(input.sessionId, {
        status: "blocked",
        event: "read_changes_blocked",
        detail: { reason: message.trim() },
      });
      return { content: [{ type: "text", text: `blocked: ${message.trim()}` }] };
    }

    updateSession(input.sessionId, {
      status: "errored",
      event: "read_changes_errored",
      detail: { message: message.trim() },
    });
    throw error instanceof Error ? error : new Error(message);
  }
}
