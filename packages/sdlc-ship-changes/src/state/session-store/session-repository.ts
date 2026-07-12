import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { SESSIONS_ROOT } from "./paths.js";
import type { SessionRecord } from "./types.js";

/**
 * Собирает пути ко всем `session.json` на диске — по одному на директорию сессии
 * внутри `SESSIONS_ROOT`. Возвращает пустой список, если директория сессий ещё
 * не создана (например, до первого успешного прохождения guard-проверки).
 */
function listSessionFiles(): string[] {
  if (!existsSync(SESSIONS_ROOT)) return [];
  return readdirSync(SESSIONS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(SESSIONS_ROOT, entry.name, "session.json"))
    .filter((file) => existsSync(file));
}

/**
 * Читает и парсит один `session.json`. Возвращает `null` при отсутствии файла
 * или битом JSON, чтобы одна повреждённая сессия не валила сканирование остальных.
 */
function readSessionFile(file: string): SessionRecord | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as SessionRecord;
  } catch {
    return null;
  }
}

/**
 * Ищет среди всех сессий на диске ту, что находится в статусе `active`.
 * Используется `start_session`, чтобы не дать запустить вторую сессию поверх
 * ещё не завершённой — проверка обязательна перед созданием новой сессии.
 */
export function findActiveSession(): SessionRecord | null {
  for (const file of listSessionFiles()) {
    const record = readSessionFile(file);
    if (record?.status === "active") return record;
  }
  return null;
}
