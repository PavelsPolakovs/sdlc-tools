import { execSync } from 'node:child_process'

/**
 * Проверяет, есть ли незакоммиченные изменения в рабочем дереве текущего
 * проекта. Если изменений нет, пайплайну ship-changes нечего доставлять,
 * и сессию не имеет смысла начинать.
 */
export function hasPendingChanges(): boolean {
  const output = execSync('git status --porcelain', {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
  return output.trim().length > 0
}
