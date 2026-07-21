# sdlc-ship-changes

MCP-сервер, который выставляет пайплайн SDLC ship-changes как курируемый набор инструментов — вместо того чтобы навязывать его через хуки, гейтящие сырые вызовы `Bash`/`Edit`. Если шаг пайплайна не выставлен как инструмент, у модели нет способа его обойти.

## Статус

Proof of concept. Сейчас реализовано четыре инструмента: `start_session` (точка входа пайплайна), `read_changes` (структурирование диффа рабочего дерева), `quality_precheck` (механический pre-check lint/prettier/typescript) и `ship_report` (финальный шаг) — это доказывает путь install → build → register → call целиком. Остальные инструменты пайплайна (см. Roadmap) — заглушки, ещё не реализованы.

## Установка (из исходников)

```bash
git clone <this-repo-url>
cd sdlc-tools/packages/sdlc-ship-changes
npm install
npm run build
```

Собирает `dist/server.js` — исполняемый Node-скрипт.

Форматирование — `npm run format` (Prettier, автофикс) / `npm run format:check` (проверка без изменений); конфиг (`.prettierrc.json`/`.prettierignore` — без точек с запятой, одинарные кавычки) живёт в корне репозитория, а не в этом пакете — Prettier резолвит его сам, поднимаясь по дереву директорий. Lint и type-check как отдельные npm-скрипты пока не настроены.

## Регистрация в Claude Code

```bash
claude mcp add sdlc-ship-changes -- node /absolute/path/to/dist/server.js
```

Используйте абсолютный путь к `dist/server.js` на вашей машине.

## Проверка

В сессии Claude Code выполните `/mcp` и убедитесь, что `sdlc-ship-changes` подключён и в списке есть инструменты `start_session` и `ship_report`.

Затем попробуйте промпт вроде:

> Call ship_report for PROJ-123, status Resolved, branch
> `feature/proj-123-fix`, commit `abc1234`, verdict pass, MR
> https://gitlab.example.com/group/repo/-/merge_requests/42 with iid 42,
> files touched `src/a.ts` and `src/b.ts`, no blockers.

Claude должен вызвать `ship_report` и вернуть отформатированный отчёт — не должен писать текст отчёта вручную.

## Roadmap

Оставшиеся инструменты пайплайна, к реализации в следующих срезах:

- `create_jira_task` — создание Jira-задачи под изменение
- `transition_issue` — перевод Jira-задачи по статусам workflow
- `create_branch` — создание git-ветки под изменение
- `commit` — коммит застейдженных изменений
- `open_mr` — открытие merge/pull request
- `poll_ci` — опрос статуса CI для MR

Дисковая персистентность уже реализована и для сессии (`session.json` + `log.md` в `./tmp/sdlc-sessions/`, вместе с `start_session`), и для кросс-сессионного audit-лога (`SESSIONS_ROOT/audit.jsonl`) в `src/state/session-store/` и `src/state/audit-log.ts`.
