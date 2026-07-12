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
 * Читает и парсит все сессии на диске, отбрасывая повреждённые записи.
 * Общий скан, на котором строятся `findActiveSession` и `getSessionById`.
 */
function readAllSessions(): SessionRecord[] {
  return listSessionFiles()
    .map(readSessionFile)
    .filter((record): record is SessionRecord => record !== null);
}

/**
 * Ищет среди всех сессий на диске ту, что находится в статусе `active`.
 * Используется `start_session`, чтобы не дать запустить вторую сессию поверх
 * ещё не завершённой — проверка обязательна перед созданием новой сессии.
 *
 * Порядок чтения директории (`readdirSync`) ничем не гарантирован, поэтому при
 * нескольких `active`-сессиях на диске (например, после аварийного завершения
 * процесса) результат сортируется по `timestamp` самой записи и возвращается
 * самая свежая — иначе выбор был бы недетерминированным между вызовами.
 */
export function findActiveSession(): SessionRecord | null {
  const active = readAllSessions().filter((record) => record.status === "active");
  if (active.length === 0) return null;
  active.sort((a, b) => b.timestamp - a.timestamp);
  return active[0];
}

/**
 * Находит сессию по `sessionId` независимо от того, активна она сейчас или нет.
 * Нужна инструментам, которым передан конкретный `sessionId` (а не "текущая
 * активная сессия") — например, `ship_report`, чтобы обновить именно ту сессию,
 * на которую ссылается вызов.
 */
export function getSessionById(sessionId: string): SessionRecord | null {
  return readAllSessions().find((record) => record.sessionId === sessionId) ?? null;
}
