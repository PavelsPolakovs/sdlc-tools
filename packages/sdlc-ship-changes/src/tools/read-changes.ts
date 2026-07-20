import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { append } from "../state/audit-log.js";
import {
  setCurrent,
  markCompleted,
  clearCurrent,
  getSessionById,
  updateSession,
} from "../state/session-store/index.js";

export const readChangesInputShape = {
  sessionId: z
    .string()
    .uuid()
    .describe("sessionId returned by start_session; identifies which on-disk session to read changes for"),
};

export const readChangesInputSchema = z.object(readChangesInputShape);

export type ReadChangesInput = z.infer<typeof readChangesInputSchema>;

/**
 * Путь к внешнему скрипту-структуризатору (`scripts/structure-changes.mjs`).
 * Вычисляется от расположения этого файла, а не от `process.cwd()` — `cwd`
 * во время выполнения указывает на целевой репозиторий, изменения которого
 * доставляются, а не на директорию самого пакета `sdlc-ship-changes`.
 * `scripts/` лежит на том же уровне, что и `src`/`dist`, поэтому смещение
 * `../../` одинаково корректно и при разработке через `tsx` (запуск из
 * `src/tools/`), и в собранном виде (запуск из `dist/tools/`).
 */
const STRUCTURE_SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../scripts/structure-changes.mjs",
);

interface StructureScriptSuccess {
  ok: true;
  mode: "create" | "append";
  path: string;
  summary?: Record<string, unknown>;
}

/**
 * Обвязка запуска скрипта-структуризатора. Скрипт получает `session.timestamp`
 * (а не `sessionId`-UUID) позиционным аргументом, так как именно `timestamp`
 * используется для построения имени директории сессии (`sdlc-<timestamp>`,
 * см. `paths.ts`) — скрипт ожидает получить ровно это значение, несмотря на то
 * что называет свой аргумент `sessionId` в usage-сообщении.
 */
function runStructureScript(sessionTimestamp: number): StructureScriptSuccess {
  const stdout = execFileSync("node", [STRUCTURE_SCRIPT_PATH, String(sessionTimestamp)], {
    encoding: "utf8",
  });
  return JSON.parse(stdout) as StructureScriptSuccess;
}

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
    const result = runStructureScript(session.timestamp);

    append("changes_structured", { summary: result.summary });
    markCompleted("read_changes");
    updateSession(input.sessionId, {
      currentStep: "read_changes",
      event: "changes_structured",
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
            nextTool: "create_jira_task",
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
