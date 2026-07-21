import { z } from 'zod'

/**
 * Zod-схема входа инструмента `quality_precheck`. Единственное поле —
 * `sessionId`: узел ничего не спрашивает у модели/пользователя, все решения
 * принимаются по состоянию целевого репозитория (см. `detect-tooling.ts`).
 */
export const qualityPrecheckInputShape = {
  sessionId: z
    .string()
    .uuid()
    .describe(
      'sessionId returned by start_session; identifies which on-disk session to run the quality pre-check for',
    ),
}

export const qualityPrecheckInputSchema = z.object(qualityPrecheckInputShape)

export type QualityPrecheckInput = z.infer<typeof qualityPrecheckInputSchema>
