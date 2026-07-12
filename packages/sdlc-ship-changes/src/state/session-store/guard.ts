import { existsSync, readFileSync } from "node:fs";
import { GITIGNORE_PATH, SESSIONS_ROOT } from "./paths.js";
import type { GuardResult } from "./types.js";

/**
 * Guard, обязательный перед созданием любой сессии: `./tmp/sdlc-sessions/` должна
 * уже существовать и быть внесена в `.gitignore`. Без этого файлы `session.json`
 * засветятся в `git status --porcelain` и последующие узлы пайплайна ошибочно
 * примут служебные файлы сессии за реальные изменения для коммита.
 *
 * Намеренно не создаёт директорию и не правит `.gitignore` сама — это разовое,
 * видимое действие настройки проекта, которое модель должна выполнить явно
 * (через Bash/Edit), а не тихо внутри вызова MCP-инструмента.
 */
export function checkSessionsGuard(): GuardResult {
  const dirExists = existsSync(SESSIONS_ROOT);
  let gitignored = false;
  if (existsSync(GITIGNORE_PATH)) {
    gitignored = readFileSync(GITIGNORE_PATH, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .some((line) => line === "tmp/sdlc-sessions/" || line === "tmp/sdlc-sessions" || line === "tmp/" || line === "tmp");
  }
  if (dirExists && gitignored) return { ok: true };
  return {
    ok: false,
    reason:
      "./tmp/sdlc-sessions/ must exist and be listed in .gitignore before a session can start. " +
      "Create it (e.g. `mkdir -p tmp/sdlc-sessions`) and add `tmp/sdlc-sessions/` to .gitignore, then retry.",
  };
}
