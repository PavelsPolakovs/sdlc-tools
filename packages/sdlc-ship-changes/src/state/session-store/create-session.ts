import { randomUUID } from "node:crypto";
import { persistSession } from "./persist-session.js";
import type { SessionRecord } from "./types.js";

/**
 * Создаёт новую сессию пайплайна: генерирует `sessionId`/`timestamp`, записывает
 * событие `session_started` и персистит всё на диск. Сама запись файла и есть
 * доказательство выполненной работы шага `start_session` — поэтому событие
 * и завершение шага фиксируются здесь же, а не оставляются на усмотрение
 * вызывающего кода (fail-closed: инструмент не может "притвориться", что сессия
 * создана, не вызвав эту функцию).
 */
export function createSession(hint?: string): SessionRecord {
  const record: SessionRecord = {
    sessionId: randomUUID(),
    timestamp: Date.now(),
    currentStep: "start_session",
    status: "active",
    hint,
    events: [],
  };
  record.events.push({
    timestamp: record.timestamp,
    event: "session_started",
    detail: hint ? { hint } : undefined,
  });
  record.currentStep = null;
  persistSession(record);
  return record;
}
