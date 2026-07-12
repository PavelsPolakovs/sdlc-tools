/**
 * Шаги пайплайна ship-changes в порядке прохождения (кроме `transition_issue`,
 * который существует как отдельный инструмент, но не входит в эту линейную
 * последовательность, так как Jira-переходы могут случаться в нескольких точках).
 * Используется и legacy in-memory API (`in-memory-state.ts`), и дисковыми сессиями
 * (`SessionRecord.currentStep`), чтобы отмечать, на каком шаге сейчас находится процесс.
 */
export type StepName =
  | "start_session"
  | "read_changes"
  | "create_jira_task"
  | "create_branch"
  | "commit"
  | "open_mr"
  | "poll_ci"
  | "report";

/**
 * Состояние легаси in-memory API отслеживания шагов (см. `in-memory-state.ts`).
 * Существует отдельно от `SessionRecord`, потому что `report.ts` пока не мигрировал
 * на дисковые сессии и не принимает `sessionId`.
 */
export interface InMemorySessionState {
  currentStep: StepName | null;
  completedSteps: StepName[];
}

/**
 * Статусная модель сессии — общий принцип, применимый ко всем узлам пайплайна:
 * - `active` — сессия выполняется прямо сейчас, шаги идут по порядку;
 * - `blocked` — инструмент упёрся в невыполнимый precondition, но прогресс не потерян,
 *   сессия резюмируема;
 * - `completed` — пайплайн дошёл до конца штатно (терминально);
 * - `abandoned` / `errored` — сессия явно брошена (терминально).
 */
export type SessionStatus = "active" | "blocked" | "completed" | "abandoned" | "errored";

/**
 * Единичная запись в append-only журнале сессии (`SessionRecord.events`).
 * Пишется только кодом `session-store` — после того как соответствующее действие
 * реально произошло, а не в момент, когда модель лишь утверждает, что оно произошло.
 */
export interface SessionEvent {
  timestamp: number;
  event: string;
  detail?: Record<string, unknown>;
}

/**
 * Полное состояние одной сессии пайплайна ship-changes — персистится целиком
 * в `./tmp/sdlc-sessions/sdlc-<timestamp>/session.json`. Это единый источник истины:
 * `events` — факты о том, что произошло, `currentStep`/`status`/`hint` — то, что
 * сервер считает текущим положением дел.
 */
export interface SessionRecord {
  sessionId: string;
  timestamp: number;
  currentStep: StepName | null;
  status: SessionStatus;
  hint?: string;
  events: SessionEvent[];
}

/**
 * Результат guard-проверки перед стартом сессии (см. `guard.ts`).
 * `ok: false` означает, что начинать сессию нельзя, а `reason` — что именно
 * нужно исправить, прежде чем повторить попытку.
 */
export interface GuardResult {
  ok: boolean;
  reason?: string;
}
