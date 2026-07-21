/**
 * Шаги пайплайна ship-changes в порядке прохождения (кроме `transition_issue`,
 * который существует как отдельный инструмент, но не входит в эту линейную
 * последовательность, так как Jira-переходы могут случаться в нескольких точках).
 * Используется и legacy in-memory API (`in-memory-state.ts`), и дисковыми сессиями
 * (`SessionRecord.currentStep`), чтобы отмечать, на каком шаге сейчас находится процесс.
 *
 * `quality_precheck` при неуспехе не заводит отдельный шаг пайплайна для исправления
 * находок — это внешний агент/skill проекта, который вызывается по инструкции в ответе
 * `quality_precheck`, а сам шаг после исправления вызывается повторно.
 *
 * Промежуточные шаги полного пайплайна (`create_jira_task`, `create_branch`,
 * `commit`, `open_mr`, `poll_ci`) намеренно убраны из этого типа и из
 * `PIPELINE_ORDER` — они ещё не реализованы, и держать их здесь только мешало
 * бы (типизировать несуществующий код). `quality_precheck` временно ведёт
 * напрямую к `report`; вернуть их сюда по мере реальной реализации.
 */
export type StepName = 'start_session' | 'read_changes' | 'quality_precheck' | 'report'

/**
 * Состояние легаси in-memory трекера текущего шага (см. `in-memory-state.ts`).
 * Служит только отладке — показывает, на каком шаге завис процесс, если он
 * упал посреди обработки инструмента; завершённые шаги персистятся на диске
 * в `SessionRecord.completedSteps`, а не здесь.
 */
export interface InMemorySessionState {
  currentStep: StepName | null
}

/**
 * Статусная модель сессии — общий принцип, применимый ко всем узлам пайплайна:
 * - `active` — сессия выполняется прямо сейчас, шаги идут по порядку;
 * - `blocked` — инструмент упёрся в невыполнимый precondition, но прогресс не потерян,
 *   сессия резюмируема;
 * - `completed` — пайплайн дошёл до конца штатно (терминально);
 * - `abandoned` / `errored` — сессия явно брошена (терминально).
 */
export type SessionStatus = 'active' | 'blocked' | 'completed' | 'abandoned' | 'errored'

/**
 * Единичная запись в append-only журнале сессии (`SessionRecord.events`).
 * Пишется только кодом `session-store` — после того как соответствующее действие
 * реально произошло, а не в момент, когда модель лишь утверждает, что оно произошло.
 */
export interface SessionEvent {
  timestamp: number
  event: string
  detail?: Record<string, unknown>
}

/**
 * Полное состояние одной сессии пайплайна ship-changes — персистится целиком
 * в `./tmp/sdlc-sessions/sdlc-<timestamp>/session.json`. Это единый источник истины:
 * `events` — факты о том, что произошло, `currentStep`/`status`/`hint` — то, что
 * сервер считает текущим положением дел.
 */
export interface SessionRecord {
  sessionId: string
  timestamp: number
  currentStep: StepName | null
  status: SessionStatus
  hint?: string
  events: SessionEvent[]
  completedSteps: StepName[]
}

/**
 * Результат guard-проверки перед стартом сессии (см. `guard.ts`).
 * `ok: false` означает, что начинать сессию нельзя, а `reason` — что именно
 * нужно исправить, прежде чем повторить попытку.
 */
export interface GuardResult {
  ok: boolean
  reason?: string
}
