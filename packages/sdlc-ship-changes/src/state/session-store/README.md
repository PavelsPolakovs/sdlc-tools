# session-store

Хранилище состояния пайплайна ship-changes. Наружу отдаёт только `index.ts` (барель) — остальные файлы не импортируются напрямую извне директории.

- `types.ts` — все типы и интерфейсы (`StepName`, `SessionStatus`, `SessionEvent`, `SessionRecord`, `GuardResult`, `InMemorySessionState`).
- `in-memory-state.ts` — legacy in-memory трекер текущего шага (`getState`, `setCurrent`, `clearCurrent`), используется `report.ts`. In-memory, состояние сбрасывается при рестарте процесса — служит только отладке (видно, на каком шаге завис процесс); порядок шагов проверяется персистентно (см. ниже).
- `paths.ts` — константы путей (`SESSIONS_ROOT`, `SESSIONS_ROOT_RELATIVE`) и `sessionDirFor`.
- `guard.ts` — `checkSessionsGuard`: проверка, что `./tmp/sdlc-sessions/` существует и реально игнорируется git (через `git check-ignore`, а не построчное сравнение с `.gitignore`), прежде чем можно создавать сессию.
- `session-repository.ts` — чтение сессий с диска: `findActiveSession` (детерминированно возвращает самую свежую по `timestamp` сессию со статусом `active`, если их на диске несколько) и `getSessionById` (поиск по `sessionId` независимо от статуса).
- `log-renderer.ts` — рендер `session.json` в человекочитаемый `log.md`.
- `persist-session.ts` — атомарная запись `session.json` (write-to-temp + rename) и генерация `log.md`.
- `create-session.ts` — `createSession`: создаёт новую сессию (id, timestamp, событие `session_started`) и персистит её. Сразу засевает `completedSteps: ['start_session']` — сама запись создаётся только этим кодом, значит `start_session` уже выполнен.
- `update-session.ts` — `updateSession`: переводит существующую сессию (по `sessionId`) в новый статус/шаг и дописывает событие в её журнал. Не выставлена как MCP-инструмент — вызывается только изнутри реализаций других инструментов, после того как соответствующая работа шага реально выполнена (см. использование в `report.ts`). Опциональное поле `completeStep` в `SessionTransition` добавляет шаг в персистентный `SessionRecord.completedSteps` (с де-дупликацией) — независимо от `status`, так как даже неуспешный исход шага (например, `quality_precheck_failed`) означает, что шаг реально прогнан.
- `pipeline-order.ts` — `PIPELINE_ORDER`: линейный порядок шагов пайплайна (без `transition_issue`, см. комментарий над `StepName`), источник истины для `assertPrecondition`. Сейчас — `['start_session', 'read_changes', 'quality_precheck', 'report']`: промежуточные шаги полного пайплайна (`create_jira_task`, `create_branch`, `commit`, `open_mr`, `poll_ci`) пока не реализованы и намеренно не входят ни в `PIPELINE_ORDER`, ни в `StepName` — держать их здесь только мешало бы. Вернуть их по мере реальной реализации.
- `assert-precondition.ts` — `assertPrecondition(session, step)`: проверяет, что непосредственный предшественник `step` по `PIPELINE_ORDER` есть в `session.completedSteps`. Возвращает `{ ok: true }` или `{ ok: false, missingStep, message }` — не бросает исключение, так как вызов инструмента вне порядка это штатный исход пайплайна (инструмент оборачивает `!ok` в `blocked:`-ответ), а не аварийный сбой.

Файл сессии на диске: `./tmp/sdlc-sessions/sdlc-<timestamp>/session.json` — единый источник истины, `events[]`/`completedSteps` в нём append-only и пишутся только кодом этой директории, не инструментами напрямую.

## Проверка порядка шагов (`assertPrecondition`)

Каждый реализованный инструмент пайплайна (кроме `start_session`, у которого нет предшественника) вызывает `assertPrecondition(session, '<этот шаг>')` сразу после проверки `session.status === 'active'` и до какой-либо побочно-эффектной работы: `read_changes` требует `start_session`, `quality_precheck` требует `read_changes`, `report` требует `quality_precheck` (текущий непосредственный предшественник по укороченному `PIPELINE_ORDER` — см. выше).

`completedSteps` фиксирует сам факт того, что шаг реально прогнан — не то, каким был его исход. Например, все три исхода `quality_precheck` (`passed`/`skipped`/`failed`) добавляют `quality_precheck` в `completedSteps`; то, что пайплайн при этом заблокирован, выражает отдельно `session.status === 'blocked'`.

## Ручное восстановление зависшей сессии

Пока в пайплайне реализованы не все шаги, ни один инструмент ещё не переводит сессию в `blocked`/`abandoned` автоматически при сбое. Если процесс упал и на диске осталась сессия со статусом `active`, которую `start_session` из-за этого отказывается заменить новой — отредактируйте вручную поле `status` в её `./tmp/sdlc-sessions/sdlc-<timestamp>/session.json` на `"abandoned"` (или `"errored"`). По мере реализации новых шагов пайплайна они должны сами вызывать `updateSession(sessionId, { status: "blocked", event: ... })` при обнаружении невыполнимого precondition, вместо того чтобы полагаться на этот ручной обходной путь.
