# quality_precheck

Узел 3 пайплайна ship-changes — механический pre-check качества написанного кода между `read_changes` и `report` (промежуточные шаги полного пайплайна — `create_jira_task` и далее — пока не реализованы, см. `PIPELINE_ORDER` в `session-store/README.md`). Проверяет lint/prettier/typescript в целевом репозитории (`process.cwd()`), запускает автофикс каждого применимого инструмента, затем повторную проверку. Семантические проверки (смешение неродственных изменений, забытая логика) вне области ответственности этого узла.

## Диаграмма

```mermaid
flowchart TD
    A[Вход: sessionId] --> B{Сессия найдена и active?}
    B -- нет --> B1[Ошибка / clearCurrent]
    B -- да --> B2{assertPrecondition:\nread_changes завершён?}
    B2 -- нет --> B3["blocked: ... (не ошибка)"]
    B2 -- да --> C["detectApplicableCategories(cwd):\n.eslintrc*|eslint.config.*+lint script,\n.prettierrc*+format script,\ntsconfig.json+typecheck/type-check script"]
    C --> D{Хотя бы одна\nкатегория применима?}
    D -- нет --> E[quality_precheck_skipped\nnextTool=report]
    D -- да --> F[Для каждой категории последовательно:\nautofix, затем recheck]
    F --> G[Запись quality-precheck.json\nв директорию сессии]
    G --> H{Все категории pass?}
    H -- да --> I[quality_precheck_passed\nnextTool=report]
    H -- нет --> J["quality_precheck_failed\nupdateSession status=blocked"]
    J --> K["Ответ: blocked + инструкция вызвать\nfix-errors агента/skill, затем повторить"]
```

## Подробное описание

**Вход** (`input-schema.ts`): только `sessionId`. Узел ничего не спрашивает у модели/пользователя — все решения принимаются исключительно по состоянию целевого репозитория.

**Precondition**: сразу после проверки `status === 'active'` вызывается `assertPrecondition(session, 'quality_precheck')` — требует `read_changes` в `session.completedSteps` (см. `session-store/README.md`). Вызов вне порядка (например, до `read_changes`) — штатный исход пайплайна: ответ `blocked: ...` текстом, называющим отсутствующий шаг, а не исключение.

**Обнаружение применимых категорий** (`detect-tooling.ts`): ровно три категории, каждая требует ОБА условия одновременно —

- `lint`: файл `.eslintrc*` или `eslint.config.*` в корне целевого репозитория И script `lint` в его `package.json`;
- `prettier`: файл `.prettierrc*` И script `format`;
- `typescript`: файл `tsconfig.json` И script `typecheck` или `type-check`.

Никакие другие источники (CLAUDE.md-конвенции, skills, содержимое конфигов) не рассматриваются. Отсутствующий/битый `package.json` — категория просто не применима, не ошибка. Если не применима ни одна категория — узел полностью пропускается: `quality_precheck_skipped`, без блокировки и без предупреждения, пайплайн продолжается дальше.

**Запуск категорий** (`run-category.ts`): для каждой обнаруженной категории бинарник резолвится напрямую — `<targetRepoDir>/node_modules/.bin/<eslint|prettier|tsc>`, при отсутствии — `npx --no-install <tool>` (без сети и интерактивных промптов). Тело package.json-script игнорируется — его существование использовалось только как сигнал обнаружения, а не как способ запуска, поскольку это ненадёжно предсказало бы точные флаги автофикса.

- **lint**: автофикс `eslint . --fix --format json`, затем recheck `eslint . --format json`; `fail`, если `errorCount + warningCount > 0` (warnings тоже блокируют).
- **prettier**: автофикс `prettier --write .`, затем recheck `prettier --check .`; `fail` при ненулевом exit code.
- **typescript**: автофикса нет; только `tsc -p tsconfig.json --noEmit`; `fail` при ненулевом exit code.

Ненулевой exit code инструмента — штатный сценарий (есть находки), а не сбой процесса: перехватывается и разбирается stdout/stderr пойманного исключения (см. прецедент в `read-changes/run-structure-script.ts`). Только `ENOENT` (бинарник не резолвился вовсе) даёт категории статус `error`, не обрушивая весь узел. Категории запускаются строго последовательно — снимки `git status --porcelain` до/после автофикса каждой категории (флаг `autofixed`) корректны только без параллелизма.

**Побочные эффекты** (только после реально выполненной проверки):

- Полный сырой вывод каждого инструмента (JSON от eslint, список файлов от prettier, диагностика tsc) пишется в `quality-precheck.json` внутри директории сессии — по аналогии с `changes.json` у `read_changes`.
- `audit-log.append("quality_precheck_skipped" | "quality_precheck_passed" | "quality_precheck_failed", { ... })` — с компактной сводкой по категориям (`category`, `status`, `autofixed`, `findingsCount`), без сырого вывода.
- `session-store.updateSession(sessionId, { currentStep: "quality_precheck", event, detail, completeStep: "quality_precheck" })`. При неуспехе (`quality_precheck_failed`) сессия дополнительно переводится в `status: "blocked"` — но `completeStep` проставляется во всех трёх исходах (`skipped`/`passed`/`failed`) одинаково: шаг реально прогнан независимо от вердикта, это отдельно от `status`.

**Возврат модели**:

- Пропуск: `{ status: "skipped", categoriesDetected: [], nextTool: "report", note }`.
- Успех: `{ status: "completed", categoriesDetected, results: [{ category, status, autofixed, findingsCount?, message }], nextTool: "report", note }` — сообщение по каждой категории отдельно (`lint: pass`, `prettier: pass (auto-fixed)`, `typescript: pass`), а не один общий булев статус.
- Неуспех: обычный текст `blocked: unresolved quality findings — ...`, с путём к `quality-precheck.json` и явной инструкцией вызвать проектного fix-errors агента/skill (это отдельный агент, живущий в проекте пользователя, а не часть этого MCP-сервера и не отдельный шаг `StepName`), затем вручную вернуть сессию в `active` (см. `session-store/README.md`, раздел «Ручное восстановление зависшей сессии») и вызвать `quality_precheck` повторно.

`nextTool` в успешном/пропущенном случае указывает на `report` — промежуточные шаги полного пайплайна (`create_jira_task` и далее) пока не реализованы, так что `ship_report` сейчас следующий реально вызываемый инструмент. Это подсказка модели, отражающая текущее (временно укороченное) состояние `PIPELINE_ORDER`, а не финальную форму пайплайна.
