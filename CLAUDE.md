# CLAUDE.md

Этот файл даёт Claude Code (claude.ai/code) контекст для работы с кодом в этом репозитории.

## Соглашение о языке

Внутренние файлы проекта (`CLAUDE.md`, `README.md`, включая README поддиректорий) пишутся на русском языке. Технические термины, команды, пути к файлам, идентификаторы кода — как есть, на английском.

Все комментарии в коде (JSDoc-блоки над функциями/методами, inline `//`) также пишутся на русском языке. Публичные функции и методы должны иметь комментарий, поясняющий их назначение — для чего и зачем они нужны, а не только пересказ того, что делает код построчно (это уже видно по названиям и телу функции). Zod `.describe()` и текст `description` MCP-инструментов — исключение: это часть протокола, который читает модель, и остаётся на английском.

## Структура репозитория

Это монорепо в стиле npm workspace (корневого `package.json` пока нет), содержащее MCP-сервер пакеты под `packages/`. Сейчас один пакет:

- `packages/sdlc-ship-changes` — MCP-сервер, который отдаёт пайплайн SDLC "ship changes" (Jira + GitLab) как курируемый набор MCP-инструментов.

## Команды (запускать из `packages/sdlc-ship-changes/`)

```bash
npm install       # установить зависимости
npm run build     # tsc -p tsconfig.json, затем chmod +x dist/server.js (postbuild)
npm run dev        # запустить src/server.ts напрямую через tsx, без сборки
npm start          # запустить собранный dist/server.js
```

Тест-раннер и lint-скрипт пока не настроены.

Чтобы зарегистрировать собранный сервер в Claude Code для ручного тестирования:

```bash
claude mcp add sdlc-ship-changes -- node /absolute/path/to/dist/server.js
```

Затем в сессии `/mcp` должен показать `sdlc-ship-changes` как подключённый, а `start_session` и `ship_report` — как доступные инструменты.

## Архитектура: `sdlc-ship-changes`

### Ключевой принцип дизайна

Пайплайн навязывается тем, что **только шаги пайплайна выставлены как MCP-инструменты**, а не через хуки/гейты на сырые вызовы `Bash`/`Edit`. Если шаг не выставлен как инструмент, у модели нет способа его обойти — например, модель не может сама написать текст финального отчёта; она обязана вызвать `ship_report`, единственный код-путь, который дописывает audit-событие `report_submitted` и помечает шаг завершённым.

Этот "fail-closed" паттерн (см. комментарий в `src/tools/report/run-report.ts`) нужно сохранять при реализации новых инструментов: побочные эффекты, которые являются доказательством выполненной работы (audit-события, маркеры завершения), должны записываться только внутри реализации самого инструмента, после того как работа реально выполнена — никогда так, чтобы модель могла их вызвать в обход инструмента.

### Шаги пайплайна (`StepName` в `src/state/session-store/types.ts`)

```
start_session -> read_changes -> create_jira_task -> create_branch -> commit -> open_mr -> poll_ci -> report
```

`transition_issue` также существует как инструмент, но не входит в линейную последовательность `StepName` (Jira-переходы могут происходить в нескольких точках).

Реализованы пока `start_session` (инструмент `start_session`), `read_changes` (инструмент `read_changes`) и `report` (инструмент `ship_report`). Остальные папки инструментов под `src/tools/` и оба файла под `src/clients/` (`gitlab-client.ts`, `jira-client.ts`) существуют, но пока пустые заглушки.

### Структура модулей

- `src/server.ts` — точка входа MCP-сервера. Создаёт `McpServer`, вызывает `registerTool` для каждого инструмента, подключается через `StdioServerTransport`.
- `src/tools/<tool-name>/` — одна папка на инструмент пайплайна (например, `src/tools/read-changes/`), а не одиночный файл. Каждая папка содержит:
  - `index.ts` — барель: реэкспортирует Zod input shape/schema, выведенный TS-тип и функцию `run*`; это единственное, что импортирует `server.ts` (`./tools/<tool-name>/index.js`);
  - файлы, разбитые по смысловым единицам (например, `input-schema.ts` для Zod-схемы, `run-<tool-name>.ts` для основного обработчика) — каждый с JSDoc-комментарием, поясняющим назначение;
  - `README.md` — Mermaid-диаграмма потока инструмента плюс подробное текстовое описание входа/побочных эффектов/возврата.

  Следуйте паттерну из `src/tools/report/`: `input-schema.ts` определяет `xInputShape` (сырой Zod shape, с `.describe()` на каждом поле — описания видны модели через input schema инструмента) и выводит `xInputSchema`/TS-тип через `z.object(...)`; `run-x.ts` экспортирует функцию `run*(rawInput: unknown)`, возвращающую `{ content: [{ type: "text", text }] }`. Инструменты-заглушки (ещё не реализованные) — папка с единственным `index.ts` (комментарий-заглушка) + `README.md`, описывающим планируемое поведение.
- `src/state/session-store/` — хранилище состояния пайплайна, оформлено директорией с барелем (`index.ts`); подробности — в `src/state/session-store/README.md`. Содержит как legacy in-memory API (`setCurrent`/`clearCurrent`/`markCompleted`, используется `report/run-report.ts`), так и дисковый API сессий (`checkSessionsGuard`/`findActiveSession`/`getSessionById`/`createSession`/`updateSession`/`sessionDirFor`/`SESSIONS_ROOT`, используется `start-session/`, `read-changes/` и `report/`), персистящий `session.json` + `log.md` в `./tmp/sdlc-sessions/`. `ship_report` требует `sessionId` (возвращённый `start_session`) и переводит соответствующую дисковую сессию в статус `completed` через `updateSession`; `checkSessionsGuard` проверяет игнорирование пути через реальный `git check-ignore`, а не построчное сравнение с `.gitignore`.
- `src/state/audit-log.ts` — кросс-сессионный append-only лог `AuditEvent`, пишется одновременно в память (для синхронного чтения через `all()` в рамках текущего процесса) и построчно в JSONL на диск (`SESSIONS_ROOT/audit.jsonl`), чтобы история переживала рестарт процесса. `append()` — единственный путь записи; ни один инструмент не должен конструировать `AuditEvent` напрямую или иначе писать в лог.
- `src/clients/gitlab-client.ts`, `src/clients/jira-client.ts` — предполагаемые места для API-клиентов GitLab и Jira, на которые будут опираться ещё не реализованные инструменты.

### Известное ближайшее направление (из roadmap в README пакета)

- Оставшиеся инструменты к реализации, примерно в порядке пайплайна: `read_changes`, `create_jira_task`, `transition_issue`, `create_branch`, `commit`, `open_mr`, `poll_ci`.
- Дисковая персистентность для сессии (`session.json`/`log.md` в `./tmp/sdlc-sessions/`) уже приземлилась вместе с `start_session`. `audit-log.ts` пока остаётся in-memory.
- Файловый API сессий пока не проверяет порядок шагов (например, не отклоняет вызов инструмента, чьи precondition/предыдущие завершённые шаги не выполнены) — это отмечено как необходимое по мере роста набора инструментов за пределы текущего bootstrap-среза.
