import type { StepName } from './types.js'

/**
 * Линейный порядок шагов пайплайна ship-changes, используемый
 * `assertPrecondition` для определения обязательного предшественника каждого
 * шага. `transition_issue` намеренно исключён — как и в комментарии над
 * `StepName` в `types.ts`, это отдельный инструмент вне линейной
 * последовательности, потому что Jira-переходы могут случаться в нескольких
 * точках пайплайна.
 *
 * Промежуточные шаги полного пайплайна (`create_jira_task`, `create_branch`,
 * `commit`, `open_mr`, `poll_ci`) пока не реализованы и намеренно не входят
 * сюда — `quality_precheck` временно считается непосредственным
 * предшественником `report`. Вернуть их в этот массив по мере реальной
 * реализации, вставив на своё место между `quality_precheck` и `report`.
 */
export const PIPELINE_ORDER: StepName[] = [
  'start_session',
  'read_changes',
  'quality_precheck',
  'report',
]
