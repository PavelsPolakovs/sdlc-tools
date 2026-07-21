import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ReadChangesInput } from './input-schema.js'

/**
 * Путь к внешнему скрипту-структуризатору (`scripts/structure-changes.mjs`).
 * Вычисляется от расположения этого файла, а не от `process.cwd()` — `cwd`
 * во время выполнения указывает на целевой репозиторий, изменения которого
 * доставляются, а не на директорию самого пакета `sdlc-ship-changes`.
 * `scripts/` лежит на уровень выше `src`/`dist` (корень пакета), а этот файл —
 * на два уровня глубже корня (`src/tools/read-changes/`), поэтому нужно три
 * `../`. Смещение одинаково корректно и при разработке через `tsx` (запуск из
 * `src/tools/read-changes/`), и в собранном виде (запуск из
 * `dist/tools/read-changes/`), так как `dist` зеркалит структуру `src` один в
 * один (`rootDir: src`, `outDir: dist` в `tsconfig.json`).
 */
const STRUCTURE_SCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/structure-changes.mjs',
)

export interface StructureScriptSuccess {
  ok: true
  mode: 'create' | 'append'
  path: string
  summary?: Record<string, unknown>
}

/**
 * Обвязка запуска скрипта-структуризатора. Скрипт получает `session.timestamp`
 * (а не `sessionId`-UUID) позиционным аргументом, так как именно `timestamp`
 * используется для построения имени директории сессии (`sdlc-<timestamp>`,
 * см. `session-store/paths.ts`) — скрипт ожидает получить ровно это значение,
 * несмотря на то что называет свой аргумент `sessionId` в usage-сообщении.
 *
 * Режим (`create`/`--append`) определяется здесь, а не в скрипте: если
 * `changes.json` для сессии уже существует на диске, это повторное чтение
 * (например, другим агентом на более позднем шаге пайплайна), и в скрипт
 * передаются `--append --agent=<...> --reason=<...>`. Первый вызов для сессии
 * всегда идёт в режиме `create`.
 */
export function runStructureScript(
  sessionTimestamp: number,
  changesJsonPath: string,
  input: ReadChangesInput,
): StructureScriptSuccess {
  const args = [STRUCTURE_SCRIPT_PATH, String(sessionTimestamp)]
  if (existsSync(changesJsonPath)) {
    args.push('--append', `--agent=${input.agent ?? 'unknown'}`, `--reason=${input.reason ?? ''}`)
  }
  const stdout = execFileSync('node', args, { encoding: 'utf8' })
  return JSON.parse(stdout) as StructureScriptSuccess
}
