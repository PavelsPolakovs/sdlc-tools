// In-memory трекер текущего шага для этого bootstrap-среза; состояние
// сбрасывается при рестарте процесса, что приемлемо — он служит только
// отладке (видно, на каком шаге завис процесс), а не проверке порядка шагов.
// Порядок шагов проверяется персистентно через `SessionRecord.completedSteps`
// и `assertPrecondition` (см. `assert-precondition.ts`).

import type { InMemorySessionState, StepName } from './types.js'

const state: InMemorySessionState = {
  currentStep: null,
}

/**
 * Возвращает текущее in-memory состояние отслеживания шагов.
 * Нужна для отладки/инспекции — сама по себе не участвует в fail-closed логике.
 */
export function getState(): InMemorySessionState {
  return state
}

/**
 * Отмечает шаг как "выполняется сейчас". Вызывается в самом начале обработки
 * инструмента, до валидации входных данных, — чтобы при падении было видно,
 * на каком шаге пайплайн застрял.
 */
export function setCurrent(step: StepName): void {
  state.currentStep = step
}

/**
 * Сбрасывает текущий шаг. Вызывается при неуспешной валидации входа инструмента,
 * чтобы пайплайн не оставался "застрявшим" на невалидном промежуточном состоянии.
 */
export function clearCurrent(): void {
  state.currentStep = null
}
