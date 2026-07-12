import path from "node:path";

/**
 * Корневая директория для файлов сессий пайплайна. Скоуп — per-repo:
 * берётся от `process.cwd()` того проекта, в котором сейчас работает пайплайн,
 * поэтому сессии разных репозиториев друг другу не мешают.
 */
export const SESSIONS_ROOT = path.join(process.cwd(), "tmp", "sdlc-sessions");

/**
 * Относительный (POSIX-стиль) путь к директории сессий — используется
 * guard-проверкой (`guard.ts`) как аргумент для `git check-ignore`, который
 * принимает пути в этом виде независимо от ОС.
 */
export const SESSIONS_ROOT_RELATIVE = "tmp/sdlc-sessions";

/**
 * Строит путь к директории конкретной сессии по её `timestamp`:
 * `./tmp/sdlc-sessions/sdlc-<timestamp>/`.
 */
export function sessionDirFor(record: { timestamp: number }): string {
  return path.join(SESSIONS_ROOT, `sdlc-${record.timestamp}`);
}
