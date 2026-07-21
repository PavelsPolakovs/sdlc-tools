import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { renderLog } from './log-renderer.js'
import { sessionDirFor } from './paths.js'
import type { SessionRecord } from './types.js'

/**
 * Атомарно записывает `session.json` (write-to-temp + rename), чтобы падение
 * процесса посреди записи не оставляло битый JSON, и синхронно перегенерирует
 * `log.md` из того же `record` — оба файла всегда согласованы друг с другом.
 */
export function persistSession(record: SessionRecord): void {
  const dir = sessionDirFor(record)
  mkdirSync(dir, { recursive: true })
  const finalPath = path.join(dir, 'session.json')
  const tmpPath = `${finalPath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(record, null, 2))
  renameSync(tmpPath, finalPath)
  writeFileSync(path.join(dir, 'log.md'), renderLog(record))
}
