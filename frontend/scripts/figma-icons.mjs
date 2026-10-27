// Выгрузка иконок из макета Figma в src/assets/icons/*.svg (Figma REST API).
// Запуск:  FIGMA_TOKEN=<токен> npm run icons:figma     (PowerShell: $env:FIGMA_TOKEN="<токен>"; npm run icons:figma)
// Токен: Figma → Settings → Security → Personal access tokens (достаточно права «File content: Read»).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('Не задан FIGMA_TOKEN. См. scripts/README-icons.md');
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(path.join(here, 'figma-icons.manifest.json'), 'utf8'));
const outDir = path.join(here, '..', 'src', 'assets', 'icons');
await mkdir(outDir, { recursive: true });

// Готовим SVG для вставки в страницу: без фиксированных размеров, по желанию — цвет currentColor
function prepare(svg, recolor) {
  let s = svg.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  s = s.replace(/<svg([^>]*)>/, (_m, attrs) => {
    const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
  });
  if (recolor) {
    s = s
      .replace(/\b(fill|stroke)="(?!none|url)([^"]+)"/g, '$1="currentColor"')
      .replace(/\b(fill|stroke):\s*(?!none|url)[^;"]+/g, '$1:currentColor');
  }
  return s;
}

const icons = manifest.icons;
const missing = [];
let saved = 0;

for (let i = 0; i < icons.length; i += 30) {
  const chunk = icons.slice(i, i + 30);
  const ids = chunk.map((x) => x.node).join(',');
  const url = `https://api.figma.com/v1/images/${manifest.fileKey}?ids=${encodeURIComponent(ids)}&format=svg&svg_include_id=false&svg_simplify_stroke=true`;
  const res = await fetch(url, { headers: { 'X-Figma-Token': token } });
  if (!res.ok) {
    console.error(`Figma API: ${res.status} ${res.statusText}. Проверьте токен и доступ к файлу.`);
    process.exit(1);
  }
  const { images = {} } = await res.json();

  for (const icon of chunk) {
    const link = images[icon.node];
    if (!link) {
      missing.push(icon);
      continue;
    }
    const svg = await (await fetch(link)).text();
    await writeFile(path.join(outDir, `${icon.name}.svg`), prepare(svg, icon.recolor) + '\n', 'utf8');
    saved += 1;
  }
}

console.log(`Готово: сохранено ${saved} из ${icons.length} иконок в src/assets/icons/`);
if (missing.length) {
  console.log('Не удалось получить (узел не найден — возможно, изменён в макете), будет использована запасная иконка:');
  for (const m of missing) console.log(`  ${m.name}  (${m.node})`);
}
