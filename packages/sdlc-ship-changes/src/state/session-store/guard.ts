import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { SESSIONS_ROOT, SESSIONS_ROOT_RELATIVE } from "./paths.js";
import type { GuardResult } from "./types.js";

/**
 * Проверяет через реальный git (`git check-ignore`), игнорируется ли путь —
 * вместо построчного сравнения `.gitignore` с захардкоженными строками, которое
 * не понимает глобы (`tmp/**`), негацию и прочую семантику паттернов gitignore.
 * Любая ошибка вызова (не git-репозиторий, нет бинаря git и т.п.) трактуется
 * как "не игнорируется" — fail closed, а не бросает исключение наружу.
 */
function isPathGitIgnored(relativePath: string): boolean {
  try {
    execSync(`git check-ignore -q ${relativePath}`, { cwd: process.cwd(), stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

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
  const gitignored = isPathGitIgnored(SESSIONS_ROOT_RELATIVE);
  if (dirExists && gitignored) return { ok: true };
  return {
    ok: false,
    reason:
      "./tmp/sdlc-sessions/ must exist and be listed in .gitignore before a session can start. " +
      "Create it (e.g. `mkdir -p tmp/sdlc-sessions`) and add `tmp/sdlc-sessions/` to .gitignore, then retry.",
  };
}
