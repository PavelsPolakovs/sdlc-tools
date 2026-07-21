#!/usr/bin/env node
/**
 * structure-changes.mjs
 *
 * Отдельный скрипт-структуризатор для узла 2 («Чтение изменений в рабочей ветке»)
 * пайплайна ship-changes. Вызывается из MCP tool (не встроенная логика самого tool —
 * см. согласованное решение 2.4 в ship-step-2-read-changes.md).
 *
 * Реализует три фазы:
 *   A — общая картина: git status --porcelain=v2 --branch + git diff --numstat HEAD
 *   B — построчное чтение КАЖДОГО файла из списка фазы A (без пропусков, fail-closed)
 *   C — расширенный контекст для файлов Tier 2 (критерий — см. 2.3.1/2.3.2/2.3.3/2.3.4)
 *
 * Результат пишется один раз за сессию в:
 *   ./tmp/sdlc-sessions/sdlc-<timestamp>/changes.json
 *
 * Повторный вызов с --append добавляет запись в revisions[] и НЕ переписывает files[].
 *
 * Зависимости: только встроенные модули Node.js (child_process, fs, path) — намеренно
 * без npm-зависимостей, так как это внешний скрипт, вызываемый из tool, а не часть
 * TypeScript-пакета MCP-сервера.
 *
 * Требует Node.js >= 18.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

// ---------------------------------------------------------------------------
// Конфигурация (2.3.2 / 2.3.3 / 2.3.4 — согласовано: списки пустые на старте,
// порог 50 строк). Заполняется позже на уровне конфига проекта — намеренно
// не хардкодится здесь сверх того, что уже согласовано.
// ---------------------------------------------------------------------------

const TIER0_DENYLIST = [
  // например: /\.(png|jpe?g|svg|woff2?|ttf)$/i, /package-lock\.json$/, /yarn\.lock$/
  // пока пусто — 2.3.2 открыт
]

const TIER2_PATH_PATTERNS = [
  // например: /\.claude\/agents\/.*\.md$/, /\.gitlab-ci\.yml$/, /\.claude\/rules\//
  // пока пусто — 2.3.3 открыт
]

const TIER2_LINE_THRESHOLD = 50 // 2.3.4 — согласовано

const EXTENDED_CONTEXT_MAX_MATCHES = 5 // потолок на файл — не даём changes.json разрастись
const EXTENDED_CONTEXT_SNIPPET_LINES_BEFORE = 4
const EXTENDED_CONTEXT_SNIPPET_LINES_AFTER = 5

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
}

function tryGit(args, fallback = null) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 64,
      stdio: ['ignore', 'pipe', 'ignore'], // подавляем ожидаемые stderr-сообщения (например, "no upstream")
    }).trim()
  } catch {
    return fallback
  }
}

/** Фаза A — общая картина */
function readOverview() {
  const branch = tryGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], '(detached)')
  const headSha = tryGit(['rev-parse', 'HEAD'], null)
  const upstream = tryGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], null)

  const statusRaw = git(['status', '--porcelain=v2', '--branch', '--untracked-files=all'])
  const numstatRaw = tryGit(['diff', '--numstat', 'HEAD'], '')

  return { branch, headSha, upstream, statusRaw, numstatRaw }
}

/**
 * Парсинг `git status --porcelain=v2` построчно.
 * Форматы строк (см. git-status(1), раздел "Porcelain Format Version 2"):
 *   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>                — обычный modified/added/deleted
 *   2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><origPath> — rename/copy
 *   ? <path>                                                     — untracked
 *   ! <path>                                                     — ignored (не должен встречаться,
 *                                                                  но fail-closed на неожиданный формат)
 */
function parsePorcelainV2(raw) {
  const files = []
  for (const line of raw.split('\n')) {
    if (!line) continue
    if (line.startsWith('# ')) continue // branch header lines

    const type = line[0]

    if (type === '?') {
      const path = line.slice(2)
      files.push({ path, gitStatus: 'untracked', renamedFrom: null })
      continue
    }

    if (type === '1') {
      const parts = line.split(' ')
      const xy = parts[1]
      const path = parts.slice(8).join(' ')
      files.push({ path, gitStatus: statusFromXY(xy), renamedFrom: null })
      continue
    }

    if (type === '2') {
      const parts = line.split(' ')
      const xy = parts[1]
      const rest = parts.slice(8).join(' ')
      const [path, origPath] = rest.split('\t')
      files.push({
        path,
        gitStatus: xy[0] === 'R' ? 'renamed' : 'copied',
        renamedFrom: origPath ?? null,
      })
      continue
    }

    // Fail-closed: неизвестный формат строки — не пропускаем молча.
    throw new Error(`structure-changes: unrecognized porcelain v2 line: ${JSON.stringify(line)}`)
  }
  return files
}

function statusFromXY(xy) {
  if (xy.includes('A')) return 'added'
  if (xy.includes('D')) return 'deleted'
  if (xy.includes('M')) return 'modified'
  // Fail-closed: неизвестный XY-код.
  throw new Error(`structure-changes: unrecognized status code: ${JSON.stringify(xy)}`)
}

function parseNumstat(raw) {
  const map = new Map()
  for (const line of raw.split('\n')) {
    if (!line) continue
    const [added, removed, path] = line.split('\t')
    map.set(path, {
      linesAdded: added === '-' ? null : Number(added),
      linesRemoved: removed === '-' ? null : Number(removed),
      isBinary: added === '-' && removed === '-',
    })
  }
  return map
}

/** Фаза B — построчное чтение КАЖДОГО файла (без пропусков) */
function readFileDiff(file) {
  if (file.gitStatus === 'untracked') {
    if (!existsSync(file.path)) {
      // Fail-closed: файл заявлен как untracked, но не найден на диске.
      throw new Error(`structure-changes: untracked file listed but missing on disk: ${file.path}`)
    }
    try {
      return git(['diff', '--no-index', '--', '/dev/null', file.path])
    } catch (e) {
      // git diff --no-index возвращает код выхода 1 при наличии различий — это ожидаемо,
      // execFileSync бросает на ненулевой код, но stdout всё равно есть в e.stdout.
      if (e.stdout) return e.stdout.toString()
      throw new Error(`structure-changes: failed to diff untracked file ${file.path}: ${e.message}`)
    }
  }

  try {
    return git(['diff', 'HEAD', '--', file.path])
  } catch (e) {
    throw new Error(`structure-changes: failed to diff ${file.path}: ${e.message}`)
  }
}

/** Определение tier — 2.3.1 (комбинация), 2.3.2/2.3.3/2.3.4 */
function assignTier(file, stat) {
  if (TIER0_DENYLIST.some((re) => re.test(file.path))) {
    return { tier: 0, reasons: ['denylist-match'] }
  }

  const reasons = []
  if (file.gitStatus === 'added' || file.gitStatus === 'untracked') {
    reasons.push('new-file')
  }
  if (TIER2_PATH_PATTERNS.some((re) => re.test(file.path))) {
    reasons.push('path-match')
  }
  const totalLines = (stat?.linesAdded ?? 0) + (stat?.linesRemoved ?? 0)
  if (totalLines > TIER2_LINE_THRESHOLD) {
    reasons.push('size-threshold')
  }

  return reasons.length > 0 ? { tier: 2, reasons } : { tier: 1, reasons: [] }
}

/**
 * Извлекает кандидатов-идентификаторов нового файла для поиска точек регистрации:
 * basename без расширения (например, "read-changes" из "read-changes.ts") плюс
 * имена верхнеуровневых export-объявлений, добавленных в diff.
 */
function extractIdentifiers(file, diff) {
  const identifiers = new Set()

  const base = file.path.split('/').pop() ?? file.path
  const stem = base.replace(/\.[^./]+$/, '')
  if (stem.length >= 3) identifiers.add(stem)

  if (diff) {
    const exportRe =
      /^\+\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|const|class|interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm
    let match
    while ((match = exportRe.exec(diff)) !== null) {
      identifiers.add(match[1])
    }
  }

  return [...identifiers]
}

/** Читает ±N строк вокруг совпадения — короткий сниппет, а не весь файл. */
function readSnippet(path, lineNum) {
  try {
    const lines = readFileSync(path, 'utf8').split('\n')
    const start = Math.max(0, lineNum - 1 - EXTENDED_CONTEXT_SNIPPET_LINES_BEFORE)
    const end = Math.min(lines.length, lineNum - 1 + EXTENDED_CONTEXT_SNIPPET_LINES_AFTER + 1)
    return lines.slice(start, end).join('\n')
  } catch {
    return null
  }
}

/**
 * Причина tier2 "new-file" — единственная, где расширенный контекст реально ценен:
 * ищем по репозиторию точки регистрации нового файла (импорты, упоминания в других
 * модулях) через `git grep` по извлечённым идентификаторам. Детерминированная
 * эвристика, без LLM-вызовов — согласовано при обсуждении дизайна фазы C.
 */
function findRegistrationPoints(file, diff) {
  const identifiers = extractIdentifiers(file, diff)
  if (identifiers.length === 0) return []

  const results = []
  const seen = new Set()

  for (const identifier of identifiers) {
    if (results.length >= EXTENDED_CONTEXT_MAX_MATCHES) break

    const matches = tryGit(['grep', '-n', '-F', '--untracked', '--', identifier], '')
    if (!matches) continue

    for (const line of matches.split('\n')) {
      if (results.length >= EXTENDED_CONTEXT_MAX_MATCHES) break
      if (!line) continue

      const sepIdx = line.indexOf(':')
      const path = line.slice(0, sepIdx)
      const rest = line.slice(sepIdx + 1)
      const lineEndIdx = rest.indexOf(':')
      const lineNum = Number(rest.slice(0, lineEndIdx))

      if (path === file.path) continue // пропускаем совпадения внутри самого нового файла
      const key = `${path}:${lineNum}`
      if (seen.has(key)) continue
      seen.add(key)

      results.push({
        kind: 'registration-point',
        path,
        line: lineNum,
        matchedIdentifier: identifier,
        snippet: readSnippet(path, lineNum),
      })
    }
  }

  return results
}

/**
 * Причина tier2 "path-match" — пока недостижима на практике: TIER2_PATH_PATTERNS
 * пуст (2.3.3 открыт). Интерфейс закладывается заранее: когда паттерны появятся,
 * здесь будет специфичная для паттерна логика (например, соседние конфиги для
 * CI-файлов) — не общий грепер, как для new-file.
 */
function findPatternContext(_file, _reasons) {
  return []
}

/** Фаза C — расширенный контекст, разная эвристика на причину tier2 (2.3 design) */
function gatherExtendedContext(file, diff, reasons) {
  if (reasons.includes('new-file')) {
    return findRegistrationPoints(file, diff)
  }
  if (reasons.includes('path-match')) {
    return findPatternContext(file, reasons)
  }
  // size-threshold в одиночку не добавляет ценности сверх уже прочитанного
  // в фазе B полного diff.
  return []
}

// ---------------------------------------------------------------------------
// Основная сборка
// ---------------------------------------------------------------------------

function buildChangesJson(sessionId) {
  const { branch, headSha, upstream, statusRaw, numstatRaw } = readOverview()
  const statusFiles = parsePorcelainV2(statusRaw)
  const numstatMap = parseNumstat(numstatRaw)

  if (statusFiles.length === 0) {
    // Соответствует 2.2 — блокирующий случай, отдельная защитная проверка перед чтением.
    throw new Error('structure-changes: no changes found (blocked: no-changes)')
  }

  const files = []
  const tierCounts = { tier0: 0, tier1: 0, tier2: 0 }
  let totalLinesAdded = 0
  let totalLinesRemoved = 0

  for (const f of statusFiles) {
    const stat = numstatMap.get(f.path) ?? null
    const { tier, reasons } = assignTier(f, stat)
    tierCounts[`tier${tier}`] += 1

    const linesAdded = stat?.linesAdded ?? null
    const linesRemoved = stat?.linesRemoved ?? null
    if (typeof linesAdded === 'number') totalLinesAdded += linesAdded
    if (typeof linesRemoved === 'number') totalLinesRemoved += linesRemoved

    const isBinary = stat?.isBinary ?? false
    // Tier 0 — контент не читается вообще (согласовано в 2.3).
    const diff = tier === 0 || isBinary ? null : readFileDiff(f)

    files.push({
      path: f.path,
      gitStatus: f.gitStatus,
      renamedFrom: f.renamedFrom,
      isBinary,
      linesAdded,
      linesRemoved,
      tier,
      tierReasons: reasons,
      diff,
      extendedContext: tier === 2 ? gatherExtendedContext(f, diff, reasons) : [],
    })
  }

  return {
    schemaVersion: 1,
    sessionId,
    generatedAt: new Date().toISOString(),
    generatedBy: 'read-changes-script',
    gitContext: { branch, upstream, headSha },
    summary: {
      totalFiles: files.length,
      tierCounts,
      totalLinesAdded,
      totalLinesRemoved,
    },
    files,
    revisions: [],
  }
}

// ---------------------------------------------------------------------------
// Запись — атомарно, один раз за сессию; --append только дописывает revisions[]
// ---------------------------------------------------------------------------

function writeAtomic(path, data) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${process.pid}`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8')
  renameSync(tmp, path)
}

function main() {
  const args = process.argv.slice(2)
  const sessionId = args.find((a) => !a.startsWith('--'))
  const isAppend = args.includes('--append')
  const agentName = args.find((a) => a.startsWith('--agent='))?.split('=')[1] ?? 'unknown'
  const reason = args.find((a) => a.startsWith('--reason='))?.split('=')[1] ?? ''

  if (!sessionId) {
    console.error(
      'Usage: structure-changes.mjs <sessionId> [--append --agent=<name> --reason=<text>]',
    )
    process.exit(2)
  }

  const outPath = resolve(`./tmp/sdlc-sessions/sdlc-${sessionId}/changes.json`)

  if (isAppend) {
    if (!existsSync(outPath)) {
      console.error(`structure-changes: cannot --append, no existing changes.json at ${outPath}`)
      process.exit(1)
    }
    const existing = JSON.parse(readFileSync(outPath, 'utf8'))
    existing.revisions.push({
      timestamp: new Date().toISOString(),
      agent: agentName,
      reason,
      addedContext: [], // заполняется вызывающим агентом при необходимости
    })
    writeAtomic(outPath, existing)
    console.log(JSON.stringify({ ok: true, mode: 'append', path: outPath }))
    return
  }

  if (existsSync(outPath)) {
    // files[] пишется один раз за сессию — согласовано. Повторный не-append вызов
    // не должен молча перезаписать базовый снимок.
    console.error(`structure-changes: changes.json already exists at ${outPath} — use --append`)
    process.exit(1)
  }

  let result
  try {
    result = buildChangesJson(sessionId)
  } catch (e) {
    // Оборачиваем в чистое однострочное сообщение (тот же стиль, что и у
    // соседних веток main()) — иначе, например, блокирующий случай 2.2
    // (нет изменений) долетал бы до дефолтного необработанного-исключения
    // хендлера Node и печатал полный стектрейс вместо однозначно
    // детектируемого маркера на стороне вызывающего TS-инструмента.
    console.error(e.message)
    process.exit(1)
  }
  writeAtomic(outPath, result)
  console.log(JSON.stringify({ ok: true, mode: 'create', path: outPath, summary: result.summary }))
}

main()
