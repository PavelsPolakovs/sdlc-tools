# session-store

Хранилище состояния пайплайна ship-changes. Наружу отдаёт только `index.ts` (барель) — остальные файлы не импортируются напрямую извне директории.

- `types.ts` — все типы и интерфейсы (`StepName`, `SessionStatus`, `SessionEvent`, `SessionRecord`, `GuardResult`, `InMemorySessionState`).
- `in-memory-state.ts` — legacy in-memory API (`getState`, `setCurrent`, `clearCurrent`, `markCompleted`), используется `report.ts`. In-memory, состояние сбрасывается при рестарте процесса.
- `paths.ts` — константы путей (`SESSIONS_ROOT`, `GITIGNORE_PATH`) и `sessionDirFor`.
- `guard.ts` — `checkSessionsGuard`: проверка, что `./tmp/sdlc-sessions/` существует и внесена в `.gitignore`, прежде чем можно создавать сессию.
- `session-repository.ts` — чтение сессий с диска, `findActiveSession`.
- `log-renderer.ts` — рендер `session.json` в человекочитаемый `log.md`.
- `persist-session.ts` — атомарная запись `session.json` (write-to-temp + rename) и генерация `log.md`.
- `create-session.ts` — `createSession`: создаёт новую сессию (id, timestamp, событие `session_started`) и персистит её.

Файл сессии на диске: `./tmp/sdlc-sessions/sdlc-<timestamp>/session.json` — единый источник истины, `events[]` в нём append-only и пишется только кодом этой директории, не инструментами напрямую.
