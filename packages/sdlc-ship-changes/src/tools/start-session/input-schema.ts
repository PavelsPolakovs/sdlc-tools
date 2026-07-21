import { z } from 'zod'

/** Zod-схема входа инструмента `start_session`. */
export const startSessionInputShape = {
  hint: z
    .string()
    .optional()
    .describe(
      'Optional free-text hint describing the intended change, passed through from the ' +
        'user/skill invocation as-is and stored on the session so later pipeline steps ' +
        '(e.g. Jira task creation) can read it without it being re-supplied.',
    ),
}

export const startSessionInputSchema = z.object(startSessionInputShape)

export type StartSessionInput = z.infer<typeof startSessionInputSchema>
