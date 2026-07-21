import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { append } from '../../state/audit-log.js'
import {
  setCurrent,
  clearCurrent,
  getSessionById,
  updateSession,
  assertPrecondition,
  sessionDirFor,
} from '../../state/session-store/index.js'
import { qualityPrecheckInputSchema, type QualityPrecheckInput } from './input-schema.js'
import { detectApplicableCategories } from './detect-tooling.js'
import { runCategory, type CategoryResult, type CategoryResultWithRaw } from './run-category.js'

/** Отбрасывает сырой вывод инструмента — то, что уходит в audit-лог и session events. */
function toCompact(result: CategoryResultWithRaw): CategoryResult {
  const { raw: _raw, ...compact } = result
  return compact
}

/**
 * Узел 3 пайплайна ship-changes: механическая pre-check-проверка написанного
 * кода (lint/prettier/typescript), встающая между `read_changes` и `report`
 * (промежуточные шаги полного пайплайна — `create_jira_task` и далее — пока
 * не реализованы, см. `PIPELINE_ORDER`). Категории обнаруживаются только по
 * конфигам и package.json-скриптам целевого репозитория (`detect-tooling.ts`);
 * если ни одна не применима, узел полностью пропускается (не блокировка).
 *
 * Fail-closed: `append`/`updateSession` вызываются только после того как
 * автофикс и повторная проверка реально прогнаны — модель не может заявить
 * об успехе узла в обход этого инструмента. При неисправимых автофиксом
 * находках узел не пытается чинить код сам — он переводит сессию в `blocked`
 * и явно указывает вызвать внешнего fix-errors агента/skill проекта (эта
 * часть намеренно не реализуется здесь).
 *
 * Precondition (`assertPrecondition`) проверяется сразу после проверки
 * активности сессии: вызов вне порядка (например, до `read_changes`) — штатный
 * исход пайплайна, поэтому возвращается как `blocked:`-ответ, а не исключение.
 */
export function runQualityPrecheck(rawInput: unknown): {
  content: [{ type: 'text'; text: string }]
} {
  setCurrent('quality_precheck')

  let input: QualityPrecheckInput
  try {
    input = qualityPrecheckInputSchema.parse(rawInput)
  } catch (error) {
    clearCurrent()
    throw error
  }

  const session = getSessionById(input.sessionId)
  if (!session) {
    clearCurrent()
    throw new Error(`session ${input.sessionId} not found`)
  }
  if (session.status !== 'active') {
    clearCurrent()
    throw new Error(`session ${input.sessionId} is not active (status: ${session.status})`)
  }

  const precondition = assertPrecondition(session, 'quality_precheck')
  if (!precondition.ok) {
    clearCurrent()
    return { content: [{ type: 'text', text: `blocked: ${precondition.message}` }] }
  }

  const targetRepoDir = process.cwd()
  const categories = detectApplicableCategories(targetRepoDir)

  if (categories.length === 0) {
    const reason = 'no applicable tooling detected'
    append('quality_precheck_skipped', { reason })
    updateSession(input.sessionId, {
      currentStep: 'quality_precheck',
      event: 'quality_precheck_skipped',
      detail: { reason },
      completeStep: 'quality_precheck',
    })
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            sessionId: input.sessionId,
            step: 'quality-precheck',
            status: 'skipped',
            categoriesDetected: [],
            nextTool: 'report',
            note: 'No lint/prettier/typescript tooling detected in target repo. Intermediate pipeline steps (create_jira_task and later) are not implemented yet; ship_report is the next available tool.',
          }),
        },
      ],
    }
  }

  // Категории запускаются последовательно (не Promise.all) — снимки `git status`
  // до/после автофикса внутри runCategory корректны только без параллелизма.
  const results = categories.map((detected) => runCategory(detected, targetRepoDir))
  const compactResults = results.map(toCompact)

  const sessionDir = sessionDirFor(session)
  const reportPath = join(sessionDir, 'quality-precheck.json')
  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(
    reportPath,
    JSON.stringify({ categoriesDetected: categories, results }, null, 2),
    'utf8',
  )

  const allPass = results.every((r) => r.status === 'pass')

  if (allPass) {
    append('quality_precheck_passed', { results: compactResults })
    updateSession(input.sessionId, {
      currentStep: 'quality_precheck',
      event: 'quality_precheck_passed',
      detail: { results: compactResults },
      completeStep: 'quality_precheck',
    })
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            sessionId: input.sessionId,
            step: 'quality-precheck',
            status: 'completed',
            categoriesDetected: categories.map((c) => c.category),
            results: compactResults,
            nextTool: 'report',
            note: 'Intermediate pipeline steps (create_jira_task and later) are not implemented yet; ship_report is the next available tool.',
          }),
        },
      ],
    }
  }

  // Автофикс/повторная проверка реально прогнаны — работа шага выполнена,
  // completeStep отражает именно это, а не то, что код оказался чист.
  append('quality_precheck_failed', { results: compactResults, reportPath })
  updateSession(input.sessionId, {
    status: 'blocked',
    currentStep: 'quality_precheck',
    event: 'quality_precheck_failed',
    detail: { results: compactResults, reportPath },
    completeStep: 'quality_precheck',
  })

  const summary = compactResults.map((r) => r.message).join('; ')
  return {
    content: [
      {
        type: 'text',
        text:
          `blocked: unresolved quality findings — ${summary}. Full details in ${reportPath}. ` +
          "Invoke this project's fix-errors agent/skill to resolve the remaining findings, then set this " +
          'session\'s status back to "active" (see session-store README on manual session recovery) and ' +
          'call quality_precheck again for this sessionId to re-verify.',
      },
    ],
  }
}
