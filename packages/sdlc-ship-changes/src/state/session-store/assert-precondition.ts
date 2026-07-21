import { PIPELINE_ORDER } from './pipeline-order.js'
import type { SessionRecord, StepName } from './types.js'

export type PreconditionResult =
  { ok: true } | { ok: false; missingStep: StepName; message: string }

/**
 * Проверяет, что непосредственный предшественник `step` по `PIPELINE_ORDER`
 * уже отмечен как выполненный в `session.completedSteps`, прежде чем шаг
 * начнёт свою работу. Возвращает результат, а не бросает исключение — вызов
 * инструмента вне порядка это штатный, ожидаемый исход пайплайна (как
 * `quality_precheck_failed`), а не аварийный сбой.
 *
 * Первый шаг пайплайна (`start_session`, у которого нет предшественника)
 * всегда проходит проверку. `step` типизирован как `StepName`, а `transition_issue`
 * в него намеренно не входит (см. комментарий над `StepName` в `types.ts`) — эта
 * функция вообще не вызывается для него, поэтому "шаг не найден в PIPELINE_ORDER"
 * сегодня недостижимо; ветка `index <= 0` защищает и от этого случая на будущее.
 */
export function assertPrecondition(session: SessionRecord, step: StepName): PreconditionResult {
  const index = PIPELINE_ORDER.indexOf(step)
  if (index <= 0) {
    return { ok: true }
  }

  const requiredStep = PIPELINE_ORDER[index - 1]
  if (session.completedSteps.includes(requiredStep)) {
    return { ok: true }
  }

  return {
    ok: false,
    missingStep: requiredStep,
    message: `${step} requires ${requiredStep} to be completed first (session ${session.sessionId} has completed: [${session.completedSteps.join(', ')}])`,
  }
}
