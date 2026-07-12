# session-store

Хранилище состояния пайплайна ship-changes. Наружу отдаёт только `index.ts` (барель) — остальные файлы не импортируются напрямую извне директории.

- `types.ts` — все типы и интерфейсы (`StepName`, `SessionStatus`, `SessionEvent`, `SessionRecord`, `GuardResult`, `InMemorySessionState`).
- `in-memory-state.ts` — legacy in-memory API (`getState`, `setCurrent`, `clearCurrent`, `markCompleted`), используется `report.ts`. In-memory, состояние сбрасывается при рестарте процесса.
- `paths.ts` — константы путей (`SESSIONS_ROOT`, `SESSIONS_ROOT_RELATIVE`) и `sessionDirFor`.
- `guard.ts` — `checkSessionsGuard`: проверка, что `./tmp/sdlc-sessions/` существует и реально игнорируется git (через `git check-ignore`, а не построчное сравнение с `.gitignore`), прежде чем можно создавать сессию.
- `session-repository.ts` — чтение сессий с диска: `findActiveSession` (детерминированно возвращает самую свежую по `timestamp` сессию со статусом `active`, если их на диске несколько) и `getSessionById` (поиск по `sessionId` независимо от статуса).
- `log-renderer.ts` — рендер `session.json` в человекочитаемый `log.md`.
- `persist-session.ts` — атомарная запись `session.json` (write-to-temp + rename) и генерация `log.md`.
- `create-session.ts` — `createSession`: создаёт новую сессию (id, timestamp, событие `session_started`) и персистит её.
- `update-session.ts` — `updateSession`: переводит существующую сессию (по `sessionId`) в новый статус/шаг и дописывает событие в её журнал. Не выставлена как MCP-инструмент — вызывается только изнутри реализаций других инструментов, после того как соответствующая работа шага реально выполнена (см. использование в `report.ts`).

Файл сессии на диске: `./tmp/sdlc-sessions/sdlc-<timestamp>/session.json` — единый источник истины, `events[]` в нём append-only и пишется только кодом этой директории, не инструментами напрямую.

## Ручное восстановление зависшей сессии

Пока в пайплайне реализованы не все шаги, ни один инструмент ещё не переводит сессию в `blocked`/`abandoned` автоматически при сбое. Если процесс упал и на диске осталась сессия со статусом `active`, которую `start_session` из-за этого отказывается заменить новой — отредактируйте вручную поле `status` в её `./tmp/sdlc-sessions/sdlc-<timestamp>/session.json` на `"abandoned"` (или `"errored"`). По мере реализации новых шагов пайплайна они должны сами вызывать `updateSession(sessionId, { status: "blocked", event: ... })` при обнаружении невыполнимого precondition, вместо того чтобы полагаться на этот ручной обходной путь.
