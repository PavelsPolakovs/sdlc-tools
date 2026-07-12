import path from "node:path";

/**
 * Корневая директория для файлов сессий пайплайна. Скоуп — per-repo:
 * берётся от `process.cwd()` того проекта, в котором сейчас работает пайплайн,
 * поэтому сессии разных репозиториев друг другу не мешают.
 */
export const SESSIONS_ROOT = path.join(process.cwd(), "tmp", "sdlc-sessions");

/**
 * Путь к `.gitignore` текущего проекта — читается guard-проверкой (`guard.ts`),
 * чтобы убедиться, что `SESSIONS_ROOT` не попадёт в `git status --porcelain`.
 */
export const GITIGNORE_PATH = path.join(process.cwd(), ".gitignore");

/**
 * Строит путь к директории конкретной сессии по её `timestamp`:
 * `./tmp/sdlc-sessions/sdlc-<timestamp>/`.
 */
export function sessionDirFor(record: { timestamp: number }): string {
  return path.join(SESSIONS_ROOT, `sdlc-${record.timestamp}`);
}
