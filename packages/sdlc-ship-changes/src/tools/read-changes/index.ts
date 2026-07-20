// Барель: единственная точка входа в инструмент `read_changes` снаружи этой
// директории. `server.ts` импортирует только отсюда.

export { readChangesInputShape, readChangesInputSchema, type ReadChangesInput } from "./input-schema.js";
export { runReadChanges } from "./run-read-changes.js";
