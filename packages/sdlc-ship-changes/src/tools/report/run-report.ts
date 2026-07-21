import { append } from '../../state/audit-log.js'
import {
  setCurrent,
  clearCurrent,
  getSessionById,
  updateSession,
  assertPrecondition,
} from '../../state/session-store/index.js'
import { reportInputSchema, type ReportInput } from './input-schema.js'
import { formatReport } from './format-report.js'

/**
 * Финальный, обязательный шаг пайплайна ship-changes. Единственный код-путь,
 * производящий текст отчёта: fail-closed паттерн — audit-событие
 * `report_submitted`, маркер завершения шага `report` и перевод дисковой
 * сессии в статус `completed` записываются только здесь, после того как
 * `formatReport` реально сформировал текст, поэтому модель не может
 * "отчитаться" самостоятельно, в обход этого инструмента.
 *
 * Precondition (`assertPrecondition`) требует `quality_precheck` в
 * `completedSteps` — сейчас это непосредственный предшественник `report` по
 * `PIPELINE_ORDER` (промежуточные шаги полного пайплайна, `create_jira_task` и
 * далее, пока не реализованы и в него не входят).
 */
export function runReport(rawInput: unknown): { content: [{ type: 'text'; text: string }] } {
  setCurrent('report')

  let input: ReportInput
  try {
    input = reportInputSchema.parse(rawInput)
  } catch (error) {
    clearCurrent()
    throw error
  }

  const text = formatReport(input)

  append('report_submitted', { key: input.key, status: input.status })

  const session = getSessionById(input.sessionId)
  if (!session) {
    clearCurrent()
    throw new Error(`session ${input.sessionId} not found`)
  }
  if (session.status !== 'active') {
    clearCurrent()
    throw new Error(`session ${input.sessionId} is not active (status: ${session.status})`)
  }

  const precondition = assertPrecondition(session, 'report')
  if (!precondition.ok) {
    clearCurrent()
    return { content: [{ type: 'text', text: `blocked: ${precondition.message}` }] }
  }

  updateSession(input.sessionId, {
    status: 'completed',
    currentStep: 'report',
    event: 'report_submitted',
    detail: { key: input.key, status: input.status },
    completeStep: 'report',
  })

  return { content: [{ type: 'text', text }] }
}
