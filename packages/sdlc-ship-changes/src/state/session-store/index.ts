// Барель: единственная точка входа в session-store снаружи этой директории.
// Остальные файлы директории не должны импортироваться напрямую из-за её пределов.

export type {
  GuardResult,
  InMemorySessionState,
  SessionEvent,
  SessionRecord,
  SessionStatus,
  StepName,
} from './types.js'

export type { SessionTransition } from './update-session.js'
export type { PreconditionResult } from './assert-precondition.js'

export { getState, setCurrent, clearCurrent } from './in-memory-state.js'
export { checkSessionsGuard } from './guard.js'
export { findActiveSession, getSessionById } from './session-repository.js'
export { createSession } from './create-session.js'
export { updateSession } from './update-session.js'
export { assertPrecondition } from './assert-precondition.js'
export { PIPELINE_ORDER } from './pipeline-order.js'
export { SESSIONS_ROOT, sessionDirFor } from './paths.js'
