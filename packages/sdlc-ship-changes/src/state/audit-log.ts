// In-memory для этого bootstrap-среза; должен стать дисковым (например, JSONL
// в project-local директории .sdlc/), как только приземлится больше инструментов
// и история audit должна будет переживать рестарт процесса. `append` обязан
// оставаться единственным путём записи в этот лог — ни один инструмент не должен
// писать произвольные audit-события напрямую, поскольку лог — это факт-о-записи
// того, что реально произошло, независимо от того, что утверждает модель.

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
  events.push({
    timestamp: new Date().toISOString(),
    event,
    detail,
  });
}

/** Возвращает все записанные audit-события — для чтения/отладки. */
export function all(): AuditEvent[] {
  return events;
}
