// Кросс-сессионный audit-лог (в отличие от per-session `events[]` в
// session-store, который персистит факты внутри одной сессии). Пишется
// одновременно в память (для синхронного чтения через `all()` в рамках
// текущего процесса) и построчно в JSONL на диск (`SESSIONS_ROOT/audit.jsonl`),
// чтобы история переживала рестарт процесса MCP-сервера. `append` обязан
// оставаться единственным путём записи в этот лог — ни один инструмент не должен
// писать произвольные audit-события напрямую, поскольку лог — это факт-о-записи
// того, что реально произошло, независимо от того, что утверждает модель.

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SESSIONS_ROOT } from "./session-store/index.js";

const AUDIT_LOG_PATH = join(SESSIONS_ROOT, "audit.jsonl");

/** Одно audit-событие: что произошло, когда и с какими подробностями. */
export interface AuditEvent {
  timestamp: string;
  event: string;
  detail?: Record<string, unknown>;
}

const events: AuditEvent[] = [];

/**
 * Добавляет audit-событие в лог с текущей меткой времени.
 * Единственная точка записи — вызывается только реализациями инструментов,
 * и только после того, как соответствующее действие уже реально выполнено.
 */
export function append(event: string, detail?: Record<string, unknown>): void {
  const record: AuditEvent = {
    timestamp: new Date().toISOString(),
    event,
    detail,
  };
  events.push(record);

  mkdirSync(SESSIONS_ROOT, { recursive: true });
  appendFileSync(AUDIT_LOG_PATH, JSON.stringify(record) + "\n", "utf8");
}

/** Возвращает все записанные audit-события — для чтения/отладки. */
export function all(): AuditEvent[] {
  return events;
}
