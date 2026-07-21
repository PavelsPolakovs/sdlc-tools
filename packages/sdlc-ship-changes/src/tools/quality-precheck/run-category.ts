import { execFileSync, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DetectedCategory, QualityCategory } from './detect-tooling.js'

/** Итог проверки одной категории — то, что видит модель (без сырого вывода инструмента). */
export interface CategoryResult {
  category: QualityCategory
  status: 'pass' | 'fail' | 'error'
  autofixed: boolean
  findingsCount?: number
  message: string
}

/** То же самое плюс сырой stdout/stderr инструмента — уходит только в `quality-precheck.json`. */
export interface CategoryResultWithRaw extends CategoryResult {
  raw: { autofixStdout?: string; checkStdout?: string; checkStderr?: string }
}

interface ExecResult {
  stdout: string
  stderr: string
  failed: boolean
  enoent: boolean
}

/**
 * Резолвит бинарник инструмента относительно целевого репозитория:
 * сперва `node_modules/.bin/<name>` (то же самое, что резолвил бы npm при
 * запуске одноимённого script), при отсутствии — `npx --no-install <name>`,
 * чтобы гарантированно не уйти в сеть и не зависнуть на интерактивном промпте.
 * package.json script целевого репозитория используется в `detect-tooling.ts`
 * только как сигнал обнаружения — его тело никогда не читается и не
 * выполняется, так как оно может не поддерживать нужные для автофикса флаги.
 */
function resolveBinary(name: string, targetRepoDir: string): { cmd: string; args: string[] } {
  const local = join(targetRepoDir, 'node_modules', '.bin', name)
  if (existsSync(local)) {
    return { cmd: local, args: [] }
  }
  return { cmd: 'npx', args: ['--no-install', name] }
}

/**
 * Запускает команду, толерантно к ненулевому exit code — это штатный сценарий
 * для eslint/prettier/tsc при наличии находок, а не сбой. Отличает его от
 * `ENOENT` (бинарник не резолвился вовсе), который и обозначает реальную
 * проблему окружения.
 */
function execTolerant(cmd: string, args: string[], cwd: string): ExecResult {
  try {
    const stdout = execFileSync(cmd, args, { cwd, encoding: 'utf8' })
    return { stdout, stderr: '', failed: false, enoent: false }
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: unknown; stderr?: unknown }
    if (err.code === 'ENOENT') {
      return { stdout: '', stderr: '', failed: true, enoent: true }
    }
    return {
      stdout: err.stdout !== undefined ? String(err.stdout) : '',
      stderr: err.stderr !== undefined ? String(err.stderr) : '',
      failed: true,
      enoent: false,
    }
  }
}

/** Снимок рабочего дерева целевого репозитория — используется, чтобы понять, изменил ли автофикс файлы. */
function gitStatusSnapshot(targetRepoDir: string): string {
  return execSync('git status --porcelain', { cwd: targetRepoDir, encoding: 'utf8' })
}

function errorResult(category: QualityCategory): CategoryResultWithRaw {
  return {
    category,
    status: 'error',
    autofixed: false,
    message: `${category}: error (binary not found)`,
    raw: {},
  }
}

/** Сумма `errorCount`/`warningCount` по всем файлам в JSON-выводе ESLint (`--format json`). */
function parseEslintJson(stdout: string): { errorCount: number; warningCount: number } {
  try {
    const results = JSON.parse(stdout) as Array<{ errorCount?: number; warningCount?: number }>
    let errorCount = 0
    let warningCount = 0
    for (const r of results) {
      errorCount += r.errorCount ?? 0
      warningCount += r.warningCount ?? 0
    }
    return { errorCount, warningCount }
  } catch {
    // Неразборчивый вывод (например, ESLint упал на конфиге, а не на правилах кода)
    // трактуется как находки есть, но их число неизвестно.
    return { errorCount: 1, warningCount: 0 }
  }
}

function runLint(targetRepoDir: string): CategoryResultWithRaw {
  const bin = resolveBinary('eslint', targetRepoDir)
  const before = gitStatusSnapshot(targetRepoDir)
  const autofix = execTolerant(
    bin.cmd,
    [...bin.args, '.', '--fix', '--format', 'json'],
    targetRepoDir,
  )
  if (autofix.enoent) return errorResult('lint')
  const after = gitStatusSnapshot(targetRepoDir)
  const autofixed = before !== after

  const recheck = execTolerant(bin.cmd, [...bin.args, '.', '--format', 'json'], targetRepoDir)
  if (recheck.enoent) return errorResult('lint')

  const { errorCount, warningCount } = parseEslintJson(recheck.stdout)
  const findingsCount = errorCount + warningCount
  const status: CategoryResult['status'] = findingsCount > 0 ? 'fail' : 'pass'

  return {
    category: 'lint',
    status,
    autofixed,
    findingsCount,
    message:
      status === 'pass'
        ? `lint: pass${autofixed ? ' (auto-fixed)' : ''}`
        : `lint: fail (${errorCount} errors, ${warningCount} warnings)`,
    raw: {
      autofixStdout: autofix.stdout,
      checkStdout: recheck.stdout,
      checkStderr: recheck.stderr,
    },
  }
}

function runPrettier(targetRepoDir: string): CategoryResultWithRaw {
  const bin = resolveBinary('prettier', targetRepoDir)
  const before = gitStatusSnapshot(targetRepoDir)
  const autofix = execTolerant(bin.cmd, [...bin.args, '--write', '.'], targetRepoDir)
  if (autofix.enoent) return errorResult('prettier')
  const after = gitStatusSnapshot(targetRepoDir)
  const autofixed = before !== after

  const recheck = execTolerant(bin.cmd, [...bin.args, '--check', '.'], targetRepoDir)
  if (recheck.enoent) return errorResult('prettier')

  const status: CategoryResult['status'] = recheck.failed ? 'fail' : 'pass'
  const findingsCount =
    status === 'fail' ? recheck.stdout.split('\n').filter(Boolean).length : undefined

  return {
    category: 'prettier',
    status,
    autofixed,
    findingsCount,
    message:
      status === 'pass'
        ? `prettier: pass${autofixed ? ' (auto-fixed)' : ''}`
        : `prettier: fail (${findingsCount} files not formatted)`,
    raw: {
      autofixStdout: autofix.stdout,
      checkStdout: recheck.stdout,
      checkStderr: recheck.stderr,
    },
  }
}

function runTypescript(targetRepoDir: string): CategoryResultWithRaw {
  const bin = resolveBinary('tsc', targetRepoDir)
  const check = execTolerant(
    bin.cmd,
    [...bin.args, '-p', 'tsconfig.json', '--noEmit'],
    targetRepoDir,
  )
  if (check.enoent) return errorResult('typescript')

  const status: CategoryResult['status'] = check.failed ? 'fail' : 'pass'
  const findingsCount =
    status === 'fail' ? (check.stdout.match(/error TS\d+/g) ?? []).length : undefined

  return {
    category: 'typescript',
    status,
    autofixed: false,
    findingsCount,
    message: status === 'pass' ? 'typescript: pass' : `typescript: fail (${findingsCount} errors)`,
    raw: { checkStdout: check.stdout, checkStderr: check.stderr },
  }
}

/**
 * Прогоняет автофикс (если есть) и повторную проверку для одной обнаруженной
 * категории. Категории вызывающий код должен запускать последовательно —
 * снимки `git status` до/после автофикса корректны только без параллелизма.
 */
export function runCategory(
  detected: DetectedCategory,
  targetRepoDir: string,
): CategoryResultWithRaw {
  switch (detected.category) {
    case 'lint':
      return runLint(targetRepoDir)
    case 'prettier':
      return runPrettier(targetRepoDir)
    case 'typescript':
      return runTypescript(targetRepoDir)
  }
}
