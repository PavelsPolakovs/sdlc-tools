import type { ReportInput } from './input-schema.js'

/**
 * Форматирует входные данные отчёта в финальный текст, который увидит пользователь.
 * Чистая функция — не пишет в audit-лог и не меняет состояние сессии.
 */
export function formatReport(input: ReportInput): string {
  const filesLine = input.filesTouched.join(', ')
  const blockersLine = input.blockers.length > 0 ? input.blockers.join('; ') : 'none'

  return [
    `${input.key} status: ${input.status}`,
    `Branch: ${input.branch} (commit ${input.commitSha})`,
    `Review: ${input.verdict}`,
    `MR: ${input.mrWebUrl} (iid ${input.mrIid})`,
    `Files: ${filesLine}`,
    `Blockers: ${blockersLine}`,
  ].join('\n')
}
