# Prompter — суфлёр для Markdown

Окно-подсказка для видеосозвонов: висит поверх всех окон, читается только вами
и **не попадает в трансляцию экрана** (Zoom, Teams, Discord, Google Meet, OBS,
скриншоты). Запускается в трее, кнопки на панели задач не занимает.

## Как это работает

Приложение вызывает Win32 API `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` —
окно исключается из всех системных каналов захвата экрана, но на физическом
мониторе отображается как обычно. Требуется Windows 10 версии 2004+.

## Управление

| Действие | Как |
|---|---|
| Показать / скрыть окно | `Ctrl+Alt+P`, клик по иконке в трее, меню трея |
| Прозрачность ±10% | `Ctrl+Alt+=` и `Ctrl+Alt+-` (работают и когда окно скрыто), меню трея |
| Размер шрифта 12–28px | `Ctrl+колесо` над окном |
| Открыть файл | Меню трея «Открыть файл…» или перетащить .md в окно |
| Автопрокрутка | Меню трея: чекбокс «Автопрокрутка» + скорость (медленно/средне/быстро) |
| Клик-сквозь | Меню трея: чекбокс (окно перестаёт перехватывать мышь) |
| Выход | Меню трея → Выход |

Правки открытого файла подхватываются на лету (debounce 150 мс): можно править
конспект во время созвона — окно обновится само. Настройки (прозрачность, кегль,
геометрия окна, последний файл, автопрокрутка) переживают перезапуск. Повторный
запуск не плодит процессы — показывает уже открытое окно.

## Сборка и разработка

Требуется Node.js 22+. При сетевых сбоях npm используйте зеркало:
`--registry=https://registry.npmmirror.com` и `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`.

```bash
npm install            # зависимости (все dev — рантайм-зависимостей нет)
npm run icons          # перегенерировать иконки (PNG/ICO, без внешних библиотек)
npm test               # юнит-тесты (vitest, TDD-циклы Red-Green-Refactor)
npm run test:e2e       # E2E: 9 сценариев реального Electron-приложения (Playwright)
npm run typecheck      # строгий tsc для main+preload и renderer
npm start              # dev-запуск
npm run dist           # сборка: release/Prompter-Setup-<v>.exe (NSIS) и Prompter-Portable-<v>.exe
```

Дымовой тест собранного бинарника:
`PACKAGED_EXE="<путь к exe>" npx playwright test tests/e2e/packaged.spec.ts`

Тихая установка/удаление (Git Bash: флаги `/S` портятся MSYS — запускайте через cmd):

```bash
cmd //c "release\\Prompter-Setup-1.0.0.exe /S /D=C:\\путь\\без\\пробелов"
powershell -Command "Start-Process -FilePath 'C:\\путь\\Uninstall Prompter.exe' -ArgumentList '/currentuser','/S' -Wait"
```

## Архитектура

- `src/main` — main-процесс: окно (`setContentProtection`, `skipTaskbar`,
  frameless, always-on-top), трей с меню, глобальные хоткеи, `FileWatcher`
  (fs.watch + debounce), `SettingsStore` (JSON, атомарная запись, валидация
  типов), single-instance lock.
- `src/preload` — contextBridge API (contextIsolation + sandbox, бандлится
  esbuild: sandbox-preload не умеет локальные require).
- `src/renderer` — тема «Графит + индиго», безопасный рендер Markdown
  (markdown-it + DOMPurify), автопрокрутка на rAF, drag&drop через
  `webUtils.getPathForFile`.
- `src/shared` — типы настроек и IPC-контракты.
- `src/tools` — генератор иконок: собственный PNG-энкодер (zlib + CRC32),
  пиксельный художник (SDF-антиалиасинг) и сборщик Windows ICO.
- `tests/unit` — 64 юнит-теста логики (реальные файлы и fs.watch, без моков
  внешних сервисов); `tests/e2e` — Playwright: 9 сценариев приложения + smoke
  собранных бинарников.

## Ограничения

- Не защищает от фотографирования экрана телефоном и аппаратных видеозахватников.
- Совместное использование «клик-сквозь» и ручного скролла: в режиме клик-сквозь
  окно не получает событий мыши — выключайте режим из меню трея.
