import { z } from 'zod'

/**
 * Zod-схема входа инструмента `read_changes`. `sessionId` обязателен всегда;
 * `agent`/`reason` используются только при повторном вызове для той же сессии
 * (режим `--append` скрипта-структуризатора, см. `run-structure-script.ts`) —
 * при первом вызове они игнорируются.
 */
export const readChangesInputShape = {
  sessionId: z
    .string()
    .uuid()
    .describe(
      'sessionId returned by start_session; identifies which on-disk session to read changes for',
    ),
  agent: z
    .string()
    .optional()
    .describe(
      'Only used when changes.json already exists for this session (re-read/append case): ' +
        'identifies which agent/tool is requesting the append. Ignored on the first call.',
    ),
  reason: z
    .string()
    .optional()
    .describe(
      'Only used when changes.json already exists for this session (re-read/append case): ' +
        'why an additional read is being requested. Ignored on the first call.',
    ),
}

export const readChangesInputSchema = z.object(readChangesInputShape)

export type ReadChangesInput = z.infer<typeof readChangesInputSchema>
