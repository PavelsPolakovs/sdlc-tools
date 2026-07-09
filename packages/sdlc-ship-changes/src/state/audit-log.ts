// In-memory for this bootstrap slice; must become disk-persisted (e.g. JSONL
// under a project-local .sdlc/ dir) once more tools land and audit history
// needs to survive process restarts. `append` must remain the only write
// path into this log — no tool should be able to write arbitrary audit
// events directly, since the log is the fact-of-record for what actually
// happened, independent of what the model claims happened.

export interface AuditEvent {
  timestamp: string;
  event: string;
  detail?: Record<string, unknown>;
}

const events: AuditEvent[] = [];

export function append(event: string, detail?: Record<string, unknown>): void {
  events.push({
    timestamp: new Date().toISOString(),
    event,
    detail,
  });
}

export function all(): AuditEvent[] {
  return events;
}
