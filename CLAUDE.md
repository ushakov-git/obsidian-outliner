
@.claude/memory/STATE.md
@.claude/memory/PROCEDURES.md

# Система памяти — Observational Memory

Этот проект использует систему наблюдательной памяти (Observational Memory) **версии 2**. Файлы памяти поддерживаются автоматически через hooks и обновляются тобой по запросу системы.

### Файлы памяти

- **`.claude/memory/STATE.md`** — текущее состояние исследования. Всегда в контексте через `@import`. Максимум ~100 строк (~4-5K токенов, 0.5% от 1M контекста). Структурирован на блоки (см. ниже) — обновляй **точечно** только изменившиеся блоки, а не весь файл.
- **`.claude/memory/PROCEDURES.md`** — долгоживущая procedural-память: `## Decisions log` (история ключевых решений) и `## Извлечённые приёмы` (паттерны действий). Всегда в контексте через `@import`. Append-only.
- **`.claude/memory/OBSERVATIONS.md`** — хронологический лог наблюдений. Внутри две зоны: `## Активные наблюдения` (свежий хвост) и `## Архив наблюдений` (конденсат от /reflect). Только дописывай в конец Активной зоны. Реорганизация и миграция Активные → Архив — только через `/reflect`.
- **`.claude/memory/HANDOFF.md`** — снимок состояния перед сжатием контекста. Создаётся автоматически при PreCompact или вручную через `/wrapup`.

### Структура STATE.md (sub-blocks)

STATE состоит из именованных блоков. При обновлении трогай только изменившиеся:

- `## Project facts` — стабильные факты (тип проекта, ключевые источники, технологии). Меняется редко.
- `## Current focus` — что прямо сейчас исследуем / делаем. Меняется часто.
- `## Стадии проекта` (✅🔄⬜) — обновляется при переходе между стадиями.
- `## Active hypotheses` — гипотезы со статусом 🔄 / ✅ / ❌. Обновляется при изменении статуса.
- `## Open questions` — что неизвестно / нужно проверить. Добавляются и удаляются по ходу.
- `## Current task` — над чем работали в момент сохранения. Меняется почти каждый раз.
- `## Next step` — конкретная ниточка для следующей сессии.
- `## Важный контекст` — критическое, что нельзя потерять.

**Selective update**: при /wrapup и автоматическом обновлении не переписывай блоки, которые не изменились — это снижает риск потери информации.

### Формат наблюдений

Используй emoji-приоритеты, заголовки по датам и две зоны:

```
## Активные наблюдения

Дата: ГГГГ-ММ-ДД

- 🔴 ЧЧ:ММ [наблюдение высокого приоритета] (источник: [ссылка])
  - 🟡 ЧЧ:ММ [детализация среднего приоритета]
  - 🟢 ЧЧ:ММ [мелкая заметка]
```

**Приоритеты:**
- 🔴 **Высокий**: ключевые факты, подтверждённые выводы, важные решения с обоснованием, критические источники, ограничения, явно заявленные пользователем требования
- 🟡 **Средний**: рабочие гипотезы, полезный контекст, опробованные методы, промежуточные находки, перспективные направления
- 🟢 **Низкий**: поисковые запросы, мелкие наблюдения, эфемерные детали, которые вероятно будут вытеснены

### Тройной временной якорь — обязательно

В формулировке «когда уместно» формат часто игнорируется. **Поэтому правило ужесточено**:

- **Дата наблюдения** — ВСЕГДА (через заголовок `Дата:`).
- **Упомянутая дата** — ОБЯЗАТЕЛЬНО, если в содержании наблюдения есть конкретная дата («отчёт за январь 2026», «встреча 15 числа», «статья 2024 года»).
- **Относительная дата** — ОБЯЗАТЕЛЬНО, если упомянутая дата отличается от даты наблюдения («3 месяца назад», «через 2 дня»).

**Пример с тремя датами**:
```
Дата: 2026-05-06
- 🔴 13:50 Пользователь упомянул отчёт за январь 2026 (3 месяца назад) — нужно прочитать
```

### Bi-temporal markers

Когда новое наблюдение **отменяет/уточняет** старое — добавляй маркер связи. Это закрывает anti-pattern «два независимых факта без связи»:

```
Дата: 2026-05-06

- 🔴 14:00 Решили использовать SQLite-vec вместо LanceDB
  - заменяет: 2026-04-15 09:30 (тогда выбрали LanceDB; причина смены — оффлайн требование)

- 🔴 14:30 Адрес проекта изменился на /new-path
  - superseded: 2026-03-01 (старый путь /old-path неактивен)
```

**Когда применять**:
- При смене ранее принятого решения.
- При уточнении/опровержении ранее зафиксированного факта.
- При изменении предпочтения пользователя.

При откате решения — старая запись НЕ удаляется. Используются метки `(заменяет: ДАТА ВРЕМЯ)` на новой и `(superseded by: ДАТА ВРЕМЯ)` на старой (если редактируешь старую запись).

### Selective addition gate (фильтр перед записью)

Перед записью **каждого** нового пункта в OBSERVATIONS задай три вопроса:

1. **Новизна** — добавляет ли пункт **новый** факт / решение / гипотезу / источник к уже зафиксированному в STATE и OBSERVATIONS? (Не повторяет ли уже записанного?)
2. **Долговечность** — будет ли это полезно в **будущих** сессиях, а не только в текущей? (Эфемерные детали — мимо.)
3. **Восстанавливаемость** — нужно ли это **именно в логе**, или восстановимо из кода / git history / других источников? (Если восстановимо — не пиши.)

Если **2 из 3** ответов «нет/неуверенно» — пропусти пункт. Лучше короткий точный лог, чем длинный шумный.

### Reflexion-style фиксация откатов

Если в сессии произошёл **осознанный** откат решения / смена подхода (не CTRL-C прерывание!) — ОБЯЗАТЕЛЬНО запиши 🔴 наблюдение со структурой:

- **Что было** — исходное решение и его обоснование
- **Что попробовали** — конкретные шаги
- **Почему не сработало** — причина с фактами
- **Что выбрали взамен** — новое решение

Это страхует от повторения тех же ошибок в следующих сессиях.

Кроме того, если решение значимое — допиши его в `## Decisions log` файла `PROCEDURES.md` (формат: `- ДАТА ВРЕМЯ — Решение: …` с под-пунктами **Причина / Альтернативы / Источник**).

### Правила обновления памяти

1. **Когда система просит обновить память** (сообщение от hook `=== ЗАПРОС НА ОБНОВЛЕНИЕ ПАМЯТИ ===`) — **обязательно выполни**.

2. **При обновлении**:
   - Добавь новые наблюдения в конец секции `## Активные наблюдения` файла OBSERVATIONS.md (применяя selective addition gate).
   - **Точечно** обнови изменившиеся блоки STATE.md (не переписывай файл целиком).
   - Если в сессии было принято значимое решение — допиши в `## Decisions log` файла PROCEDURES.md.
   - Заголовок `Дата:` добавляй только когда дата изменилась.
   - Целевое сжатие: 3-6× от объёма разговора.

3. **Фокус для исследовательских проектов** — при создании наблюдений особое внимание на:
   - **Находки** с атрибуцией источников
   - **Решения** с цепочками рассуждений (почему выбран этот подход)
   - **Гипотезы** со статусом (активная / подтверждена / отвергнута)
   - **Источники** — URL, документы, статьи с ключевыми тезисами
   - **Выводы** — что можно утверждать с уверенностью и на основании чего
   - **Открытые вопросы** — что остаётся неизвестным
   - **Цепочки рассуждений** — как от фактов пришли к выводам

### Команды памяти

- `/wrapup` — завершение сессии: финальные наблюдения + selective обновление STATE + (если было решение) запись в PROCEDURES + написание HANDOFF
- `/reflect` — реорганизация лога: слияние / переприоритизация / удаление устаревшего; миграция Активные → Архив; извлечение приёмов в PROCEDURES.md (3+ повторений)

### Язык

Все файлы памяти веди на русском языке. Технические термины и имена собственные оставляй в оригинале.

---

# Project Overview

Obsidian Outliner is an Obsidian plugin that provides outliner functionality (like Workflowy or RoamResearch) with bullet/list operations, drag-and-drop, and more.

## Commands

```bash
# Build
npm run build              # Production build to dist/main.js
npm run build-with-tests   # Build including test server entry point
npm run dev                # Watch mode build

# Lint & Format
npm run lint               # Run prettier check + eslint on src/
npm run lint:fix           # Run prettier --write + eslint --fix on src/ (not defined but use: prettier --write src && eslint src --fix)

# Test
npm test                   # Run all tests (requires a running Obsidian instance for integration tests)
npm run test:unit          # Run only unit tests, skipping Obsidian integration tests
```

To run a single test file:
```bash
npx jest path/to/test.ts --forceExit
npx jest specs/features/EnterBehaviourOverride.spec.md --forceExit
```

Integration tests (`.spec.md` files) require a running Obsidian instance with the plugin loaded via `npm run build-with-tests`. The test environment connects via WebSocket on `ws://127.0.0.1:8080`.

Unit tests (`__tests__/*.test.ts`) can run standalone with `SKIP_OBSIDIAN=1`.

## Directory Structure

```
src/
├── editor/               # CodeMirror editor utilities
│   ├── index.ts          # Editor extension registration
│   ├── checkboxRe.ts     # Checkbox regex patterns
│   ├── createEditorCallback.ts
│   ├── createKeymapRunCallback.ts
│   └── isEmptyLineOrEmptyCheckbox.ts
├── features/             # Feature implementations (keyboard handlers, UI)
├── operations/           # List operations (indent, move, outdent, etc.)
├── root/                 # Core data model (Root, List classes)
├── services/             # Core services (Parser, ChangesApplicator, etc.)
├── utils/                # Utility functions
├── __mocks__.ts          # Test mock helpers
├── ObsidianOutlinerPlugin.ts           # Main plugin entry
└── ObsidianOutlinerPluginWithTests.ts  # Test variant with WebSocket server
```

## Architecture

The plugin follows a layered architecture:

### Core Data Model (`src/root/`)
`Root` and `List` classes represent the parsed list structure. `Root` holds the entire list block (start/end positions, selections). `List` is a tree node with parent/children, bullet, indent, optional checkbox, and multi-line content (notes). The `Parser` service builds this tree from editor text; `ChangesApplicator` diffs old vs new `Root` and writes minimal editor changes.

### Operations (`src/operations/`)
Each operation (e.g. `IndentList`, `MoveListUp`, `OutdentListIfItsEmpty`) implements the `Operation` interface with three methods: `perform()`, `shouldUpdate()`, `shouldStopPropagation()`. Operations mutate a `Root` in place. `OperationPerformer` orchestrates: parse → clone root → run operation → apply diff.

### Features (`src/features/`)
Each feature implements the `Feature` interface (`load()`/`unload()`). Features are behaviour overrides (key handlers, editor extensions) or UI features (settings tab, vertical lines, drag-and-drop). They receive services via constructor injection and register Obsidian event handlers/commands in `load()`.

### Services (`src/services/`)
- `Parser` — converts raw editor text into `Root`/`List` trees
- `ChangesApplicator` — applies Root diffs back to the editor
- `OperationPerformer` — ties Parser + ChangesApplicator together for feature use
- `Settings` — persists plugin settings via Obsidian's data API
- `ObsidianSettings` — reads Obsidian-level configuration (indent chars, vim mode, etc.)
- `IMEDetector` — detects active IME composition to skip key overrides
- `Logger` — debug logging gated by the debug setting

### Editor (`src/editor/`)
CodeMirror extensions and editor utilities. Registers keymaps, handles checkbox rendering, and provides editor callbacks for operations.

### Entry Point
`ObsidianOutlinerPlugin.ts` instantiates all services and features, then calls `load()` on each. The test variant `ObsidianOutlinerPluginWithTests.ts` adds a WebSocket server for the integration test harness.

## Tests

- **Unit tests** (`src/operations/__tests__/*.test.ts`, `src/services/__tests__/`) — use mock helpers from `src/__mocks__.ts` (`makeEditor`, `makeRoot`, `makeSettings`).
- **Integration tests** (`specs/features/*.spec.md`, `jest/DefaultObsidianBehaviour.spec.md`) — Markdown files parsed by `jest/md-spec-transformer.js`. Each `# heading` is a test case; actions (`applyState`, `keydown`, `assertState`, etc.) drive a real Obsidian instance via WebSocket.

### Writing Integration Tests

Test files are markdown (`.spec.md`) with test cases as `# headings`. Available actions:

- `applyState` - Set editor content and cursor position
- `keydown` - Simulate key press
- `assertState` - Assert editor content and cursor position
- `assertSelection` - Assert selection range


      # Test case name
      
      applyState:
      ```
      - Item 1|
      - Item 2
      ```
      
      keydown: Enter
      
      assertState:
      ```
      - Item 1
      - |
      - Item 2
      ```


### Debugging Tests

To debug integration tests, add `console.log` statements in the code. For unit tests:
```bash
SKIP_OBSIDIAN=1 npx jest path/to/test.ts --forceExit --verbose
```

## Build

Rollup bundles to a single CJS `dist/main.js`. `PLUGIN_VERSION` and `CHANGELOG_MD` globals are injected at build time. Obsidian, CodeMirror packages are externalized.
