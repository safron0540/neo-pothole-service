# Иконки из макета Figma

Иконки лежат в `src/assets/icons/*.svg` и подключаются через компонент `<Icon name="…" />`.
Пока файла нет, на месте иконки пустой блок такого же размера, а в консоли браузера (`npm run dev`) выводится список недостающих файлов.

## Выгрузка (один раз и после правок макета)

1. В Figma: **Settings → Security → Personal access tokens → Generate new token** (право *File content: Read*).
2. В папке `frontend`:
   - macOS / Linux / Git Bash: `FIGMA_TOKEN=<токен> npm run icons:figma`
   - PowerShell: `$env:FIGMA_TOKEN="<токен>"; npm run icons:figma`
3. Скрипт скачает SVG по списку из `scripts/figma-icons.manifest.json` и положит их в `src/assets/icons/`.
   Если какого-то узла в макете уже нет, он будет в списке «не удалось получить» — выгрузите эту иконку вручную.
4. Закоммитьте папку `src/assets/icons/` (токен в репозиторий класть нельзя).

## Как добавить иконку

1. Найдите её в `scripts/figma-icons-catalog.md` (там ссылки на узлы Figma) или скопируйте ссылку на слой в Figma:
   *правый клик → Copy link to selection* (`node-id=97-1884` → в манифесте `97:1884`).
2. Добавьте в `figma-icons.manifest.json`: `{ "name": "my-icon", "node": "97:1884" }`.
   Если цвет иконки должен меняться классом (`text-red-700`, `text-white`), добавьте `"recolor": true`.
3. В коде: `<Icon name="my-icon" className="h-4 w-4" />` и добавьте имя в `ICON_NAMES` (src/components/Icon.tsx).

## Ручной вариант

Выделите иконки в Figma → **Export → SVG** и положите файлы в `src/assets/icons/` с теми же именами, что в манифесте.
