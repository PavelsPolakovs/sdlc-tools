import { getSessionById } from './session-repository.js'
import { persistSession } from './persist-session.js'
import type { SessionRecord, SessionStatus, StepName } from './types.js'

/**
 * Описание перехода существующей сессии: какие поля обновить и какое событие
 * зафиксировать в append-only журнале `SessionRecord.events`.
 */
export interface SessionTransition {
  status?: SessionStatus
  currentStep?: StepName | null
  event: string
  detail?: Record<string, unknown>
  /**
   * Шаг, который считается выполненным этим переходом — попадает в
   * `SessionRecord.completedSteps` (с де-дупликацией), откуда его читает
   * `assertPrecondition` следующего шага. Не связан с `status`: даже
   * `quality_precheck_failed` помечает `quality_precheck` завершённым — сам
   * шаг реально прогнан, а то, что пайплайн заблокирован, выражает `status`.
   */
  completeStep?: StepName
}

/**
 * Переводит существующую сессию в новое состояние (например, `blocked` при
 * невыполнимом precondition или `completed` по завершении пайплайна) и
 * персистит изменение. В отличие от `createSession`, не выставлена как
 * отдельный MCP-инструмент — иначе модель могла бы напрямую проставить любой
 * статус/событие без реально выполненной работы, что нарушает fail-closed
 * принцип проекта. Вызывать только изнутри реализации других инструментов,
 * уже после того как соответствующая работа шага фактически выполнена.
 */
export function updateSession(sessionId: string, transition: SessionTransition): SessionRecord {
  const record = getSessionById(sessionId)
  if (!record) {
    throw new Error(`session ${sessionId} not found`)
  }
  if (transition.status) {
    record.status = transition.status
  }
  if (transition.currentStep !== undefined) {
    record.currentStep = transition.currentStep
  }
  record.events.push({
    timestamp: Date.now(),
    event: transition.event,
    detail: transition.detail,
  })
  if (transition.completeStep && !record.completedSteps.includes(transition.completeStep)) {
    record.completedSteps.push(transition.completeStep)
  }
  persistSession(record)
  return record
}
