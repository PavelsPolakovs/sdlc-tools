// Барель: единственная точка входа в инструмент `quality_precheck` снаружи этой
// директории. `server.ts` импортирует только отсюда.

export {
  qualityPrecheckInputShape,
  qualityPrecheckInputSchema,
  type QualityPrecheckInput,
} from './input-schema.js'
export { runQualityPrecheck } from './run-quality-precheck.js'
