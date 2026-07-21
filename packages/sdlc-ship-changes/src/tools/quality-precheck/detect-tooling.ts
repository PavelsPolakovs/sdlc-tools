import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Одна из трёх формальных категорий проверки, признаваемых узлом `quality_precheck`. */
export type QualityCategory = 'lint' | 'prettier' | 'typescript'

/** Обнаруженная категория вместе с конфигом/скриптом, по которым она была признана применимой. */
export interface DetectedCategory {
  category: QualityCategory
  configFile: string
  scriptName: string
}

/**
 * Ищет в `targetRepoDir` файл, чьё имя начинается с заданного префикса
 * (например, `.eslintrc` → `.eslintrc.json`, `.eslintrc.cjs` и т.п.).
 * Не рекурсивная — конфиги ищутся только в корне целевого репозитория.
 */
function findConfigFile(targetRepoDir: string, prefix: string): string | undefined {
  return readdirSync(targetRepoDir).find((name) => name.startsWith(prefix))
}

/**
 * Читает `package.json` целевого репозитория и возвращает его `scripts`.
 * Отсутствующий или битый `package.json` не считается ошибкой — просто
 * ни одна категория, зависящая от script, не будет признана применимой.
 */
function readScripts(targetRepoDir: string): Record<string, string> {
  const packageJsonPath = join(targetRepoDir, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    if (parsed && typeof parsed === 'object' && 'scripts' in parsed) {
      const scripts = (parsed as { scripts?: unknown }).scripts
      if (scripts && typeof scripts === 'object') {
        return scripts as Record<string, string>
      }
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Определяет, какие из трёх категорий (lint/prettier/typescript) применимы
 * к целевому репозиторию (`targetRepoDir` — как правило, `process.cwd()`
 * во время выполнения инструмента). Категория применима, только если ОБА
 * условия выполнены: соответствующий конфиг-файл присутствует в корне
 * репозитория И в `package.json` есть ожидаемый npm-script. Никакие другие
 * источники (CLAUDE.md, skills, содержимое конфига) не рассматриваются —
 * согласованное ограничение узла (3.1). Для `lint` конфиг-файлом признаётся
 * либо legacy `.eslintrc*`, либо flat config `eslint.config.*`.
 */
export function detectApplicableCategories(targetRepoDir: string): DetectedCategory[] {
  const scripts = readScripts(targetRepoDir)
  const detected: DetectedCategory[] = []

  const eslintConfig =
    findConfigFile(targetRepoDir, '.eslintrc') ?? findConfigFile(targetRepoDir, 'eslint.config')
  if (eslintConfig && scripts.lint) {
    detected.push({ category: 'lint', configFile: eslintConfig, scriptName: 'lint' })
  }

  const prettierConfig = findConfigFile(targetRepoDir, '.prettierrc')
  if (prettierConfig && scripts.format) {
    detected.push({ category: 'prettier', configFile: prettierConfig, scriptName: 'format' })
  }

  const hasTsconfig = existsSync(join(targetRepoDir, 'tsconfig.json'))
  const typescriptScriptName = scripts.typecheck
    ? 'typecheck'
    : scripts['type-check']
      ? 'type-check'
      : undefined
  if (hasTsconfig && typescriptScriptName) {
    detected.push({
      category: 'typescript',
      configFile: 'tsconfig.json',
      scriptName: typescriptScriptName,
    })
  }

  return detected
}
