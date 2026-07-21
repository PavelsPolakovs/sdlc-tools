# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Соглашение о языке

Внутренние файлы проекта (`CLAUDE.md`, `README.md`, включая README поддиректорий) пишутся на русском языке. Технические термины, команды, пути к файлам, идентификаторы кода — как есть, на английском.

Все комментарии в коде (JSDoc-блоки над функциями/методами, inline `//`) также пишутся на русском языке. Публичные функции и методы должны иметь комментарий, поясняющий их назначение — для чего и зачем они нужны, а не только пересказ того, что делает код построчно (это уже видно по названиям и телу функции). Zod `.describe()` и текст `description` MCP-инструментов — исключение: это часть протокола, который читает модель, и остаётся на английском.

## Структура репозитория

Монорепо, содержащее MCP-сервер пакеты под `packages/`. Сейчас один пакет:

- `packages/sdlc-ship-changes` — MCP-сервер, который отдаёт пайплайн SDLC "ship changes" (Jira + GitLab) как курируемый набор MCP-инструментов.

В корне есть свой `package.json`, но это **не npm workspaces** — поле `workspaces` намеренно не объявлено. Корневой `package.json` существует только как якорь для repo-wide тулинга (сейчас — Prettier, ESLint, TypeScript-тайпчек); `packages/sdlc-ship-changes` остаётся полностью самостоятельным npm-проектом со своим `package.json`/`node_modules`, устанавливается и собирается независимо (см. ниже). Прежде чем вводить `workspaces` и общий hoisting зависимостей — дождаться появления второго реального пакета.

## Команды

Форматирование — repo-wide, из корня:

```bash
npm install         # поставит Prettier в корневой node_modules
npm run format       # prettier --write . (автофикс по всему репозиторию)
npm run format:check # prettier --check . (проверка без изменений)
```

Конфиг — `.prettierrc.json`/`.prettierignore` в корне (без точек с запятой, одинарные кавычки, `printWidth: 100`); эти же настройки автоматически подхватываются и внутри `packages/sdlc-ship-changes` — Prettier резолвит ближайший конфиг вверх по дереву директорий, отдельного файла в пакете больше нет. Из корня есть также шорткат `make format` (см. `Makefile`).

Линтинг — repo-wide, из корня:

```bash
npm run lint      # eslint . (проверка без автофикса)
npm run lint:fix  # eslint . --fix (автофикс)
```

Конфиг — `eslint.config.mjs` в корне (flat config, ESLint 9): `@eslint/js` recommended + `typescript-eslint` recommended (для `.ts`/`.mjs`) + Node-глобалы из пакета `globals` (`console`/`process` и т.п. в `.mjs`-скриптах) + `eslint-config-prettier` последним (отключает стилистические правила, дублирующие Prettier — `lint` и `prettier` остаются раздельными категориями `quality_precheck`). `@typescript-eslint/no-unused-vars` донастроен (`argsIgnorePattern`/`varsIgnorePattern: '^_'`, `ignoreRestSiblings: true`) под уже используемые в коде идиомы (заглушки с `_`-префиксом, `const { x: _x, ...rest } = obj` для отбрасывания поля). Резолвится вверх по дереву директорий так же, как `.prettierrc.json`; отдельного файла в пакете нет. Из корня есть также шорткат `make lint`.

Тайпчек — repo-wide, из корня:

```bash
npm run typecheck  # tsc -p tsconfig.json --noEmit
```

Конфиг — `tsconfig.json` в корне: самостоятельный (без `extends`/project references — `tsc -p ... --noEmit` не обходит `references` без `--build`), с `include: ["packages/*/src/**/*.ts"]`, дублирует нужные `compilerOptions` из `packages/sdlc-ship-changes/tsconfig.json`. Из корня есть также шорткат `make typecheck`.

Repo-wide тест-раннер не настроен — тесты запускаются только внутри пакета (см. ниже).

Команды самого пакета (запускать из `packages/sdlc-ship-changes/`):

```bash
npm install       # установить зависимости пакета (независимо от корневых)
npm run build     # tsc -p tsconfig.json, затем chmod +x dist/server.js (postbuild)
npm run typecheck # tsc -p tsconfig.json --noEmit (без сборки, только проверка типов)
npm run dev        # запустить src/server.ts напрямую через tsx, без сборки
npm start          # запустить собранный dist/server.js
npm test           # node --import tsx --test src/**/*.test.ts (встроенный Node test runner, без vitest/jest)
```

Из корня репозитория есть шорткат `make build`, вызывающий `npm run build` внутри пакета (см. корневой `Makefile`).

Чтобы зарегистрировать собранный сервер в Claude Code для ручного тестирования:

```bash
claude mcp add sdlc-ship-changes -- node /absolute/path/to/dist/server.js
```

Затем в сессии `/mcp` должен показать `sdlc-ship-changes` как подключённый, а `start_session`, `read_changes`, `quality_precheck` и `ship_report` — как доступные инструменты.

## Архитектура: `sdlc-ship-changes`

### Ключевой принцип дизайна

Пайплайн навязывается тем, что **только шаги пайплайна выставлены как MCP-инструменты**, а не через хуки/гейты на сырые вызовы `Bash`/`Edit`. Если шаг не выставлен как инструмент, у модели нет способа его обойти — например, модель не может сама написать текст финального отчёта; она обязана вызвать `ship_report`, единственный код-путь, который дописывает audit-событие `report_submitted` и помечает шаг завершённым.

Этот "fail-closed" паттерн (см. комментарий в `src/tools/report/run-report.ts`) нужно сохранять при реализации новых инструментов: побочные эффекты, которые являются доказательством выполненной работы (audit-события, маркеры завершения), должны записываться только внутри реализации самого инструмента, после того как работа реально выполнена — никогда так, чтобы модель могла их вызвать в обход инструмента.

### Шаги пайплайна (`StepName` в `src/state/session-store/types.ts`)

```
start_session -> read_changes -> quality_precheck -> report
```

Промежуточные шаги полного пайплайна (`create_jira_task`, `create_branch`, `commit`, `open_mr`, `poll_ci`) пока не реализованы и намеренно убраны из `StepName`/`PIPELINE_ORDER` — держать их в типах и документации до реальной реализации только мешало бы. `quality_precheck` временно ведёт напрямую к `report`; вернуть их по мере реализации (см. roadmap в README пакета).

`transition_issue` также существует как инструмент, но не входит в линейную последовательность `StepName` (Jira-переходы могут происходить в нескольких точках).

Реализованы пока `start_session` (инструмент `start_session`), `read_changes` (инструмент `read_changes`), `quality_precheck` (инструмент `quality_precheck`, механический pre-check lint/prettier/typescript целевого репозитория по конфигам+package.json-скриптам) и `report` (инструмент `ship_report`). Единственная оставшаяся папка-заглушка под `src/tools/` — `transition-issue/`; `src/clients/jira-client.ts` — предполагаемая опора для него (`src/clients/gitlab-client.ts` удалён вместе со стаб-шагами, которые на него опирались).

Неуспешный исход `quality_precheck` не заводит отдельный шаг пайплайна для исправления находок — вместо этого ответ инструмента указывает вызвать внешнего fix-errors агента/skill, уже существующего в проекте пользователя (не часть этого MCP-сервера), после чего сессию нужно вручную вернуть в `active` и вызвать `quality_precheck` повторно.

### Структура модулей

- `src/server.ts` — точка входа MCP-сервера. Создаёт `McpServer`, вызывает `registerTool` для каждого инструмента, подключается через `StdioServerTransport`.
- `src/tools/<tool-name>/` — одна папка на инструмент пайплайна (например, `src/tools/read-changes/`), а не одиночный файл. Каждая папка содержит:
  - `index.ts` — барель: реэкспортирует Zod input shape/schema, выведенный TS-тип и функцию `run*`; это единственное, что импортирует `server.ts` (`./tools/<tool-name>/index.js`);
  - файлы, разбитые по смысловым единицам (например, `input-schema.ts` для Zod-схемы, `run-<tool-name>.ts` для основного обработчика) — каждый с JSDoc-комментарием, поясняющим назначение;
  - `README.md` — Mermaid-диаграмма потока инструмента плюс подробное текстовое описание входа/побочных эффектов/возврата.

  Следуйте паттерну из `src/tools/report/`: `input-schema.ts` определяет `xInputShape` (сырой Zod shape, с `.describe()` на каждом поле — описания видны модели через input schema инструмента) и выводит `xInputSchema`/TS-тип через `z.object(...)`; `run-x.ts` экспортирует функцию `run*(rawInput: unknown)`, возвращающую `{ content: [{ type: "text", text }] }`. Инструменты-заглушки (ещё не реализованные) — папка с единственным `index.ts` (комментарий-заглушка) + `README.md`, описывающим планируемое поведение.

- `src/state/session-store/` — хранилище состояния пайплайна, оформлено директорией с барелем (`index.ts`); подробности — в `src/state/session-store/README.md`. Содержит как legacy in-memory трекер текущего шага (`setCurrent`/`clearCurrent`, только для отладки), так и дисковый API сессий (`checkSessionsGuard`/`findActiveSession`/`getSessionById`/`createSession`/`updateSession`/`assertPrecondition`/`PIPELINE_ORDER`/`sessionDirFor`/`SESSIONS_ROOT`, используется `start-session/`, `read-changes/`, `quality-precheck/` и `report/`), персистящий `session.json` + `log.md` в `./tmp/sdlc-sessions/`. `SessionRecord.completedSteps` персистится на диске и проверяется `assertPrecondition` перед стартом каждого шага (кроме `start_session`) — вызов вне порядка возвращается как `blocked: ...` текстом, а не бросает исключение. `ship_report` требует `sessionId` (возвращённый `start_session`) и переводит соответствующую дисковую сессию в статус `completed` через `updateSession`; `checkSessionsGuard` проверяет игнорирование пути через реальный `git check-ignore`, а не построчное сравнение с `.gitignore`.
- `src/state/audit-log.ts` — кросс-сессионный append-only лог `AuditEvent`, пишется одновременно в память (для синхронного чтения через `all()` в рамках текущего процесса) и построчно в JSONL на диск (`SESSIONS_ROOT/audit.jsonl`), чтобы история переживала рестарт процесса. `append()` — единственный путь записи; ни один инструмент не должен конструировать `AuditEvent` напрямую или иначе писать в лог.
- `src/clients/jira-client.ts` — предполагаемое место для клиента Jira API, на который будет опираться `transition_issue`.

### Известное ближайшее направление (из roadmap в README пакета)

- Оставшийся инструмент к реализации — `transition_issue`. Промежуточные шаги полного пайплайна (`create_jira_task`, `create_branch`, `commit`, `open_mr`, `poll_ci`) временно убраны из `StepName`/`PIPELINE_ORDER`/roadmap (см. выше) — вернуть их по мере реальной реализации.
- Дисковая персистентность уже реализована и для сессии (`session.json`/`log.md` в `./tmp/sdlc-sessions/`), и для кросс-сессионного audit-лога (`SESSIONS_ROOT/audit.jsonl`) — оба пишутся синхронно при каждом вызове `append`/`updateSession`.
