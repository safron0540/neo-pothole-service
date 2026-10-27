// Иконки из макета Figma лежат в src/assets/icons/<имя>.svg (список имён — в src/assets/icons/README.md).
// Файла нет — на месте иконки пустой блок такого же размера, а в консоли (npm run dev) видно, чего не хватает.
const files = import.meta.glob('../assets/icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

// Все имена, которые использует приложение
export const ICON_NAMES = [
  'add-plus',
  'arrow-down',
  'arrow-left',
  'arrow-right',
  'badge-check',
  'badge-filter',
  'calendar',
  'camera',
  'check-circle',
  'chevron-down',
  'chevron-right',
  'clock',
  'clock-planned',
  'close',
  'close-small',
  'confirm-check',
  'contact',
  'ctr-kpi-on-time',
  'ctr-kpi-requests',
  'ctr-kpi-time',
  'download',
  'edit',
  'empty-contractor',
  'empty-reports',
  'empty-tap',
  'empty-tap-plan',
  'export-excel',
  'field-calendar',
  'field-category',
  'field-contractor',
  'field-district',
  'file',
  'gps-pin',
  'group-street',
  'history',
  'info',
  'kpi-on-time',
  'kpi-time',
  'kpi-total',
  'legend-flame',
  'map-heat',
  'map-markers',
  'map-pin',
  'map-zones',
  'nav-admin',
  'nav-contractors',
  'nav-map',
  'nav-planned',
  'nav-reports',
  'nav-requests',
  'nav-users',
  'pagination-next',
  'pagination-prev',
  'phone',
  'photo-time',
  'pin-address',
  'plus-circle',
  'refresh',
  'reload',
  'report-chart',
  'reset-small',
  'ruler',
  'save-check',
  'shield',
  'sliders',
  'tab-chart',
  'tab-contractors-zones',
  'tab-deadlines',
  'tab-streets',
  'tab-timer',
  'tile-excavator',
  'tile-tools',
  'tile-truck',
  'user-avatar',
  'user-plus',
] as const;

// Иконки, цвет которых меняется классом (text-white / text-red-700): у них цвета заменяются на currentColor.
// Остальные показываются в цветах макета.
const RECOLOR = new Set(['map-heat', 'map-markers', 'map-zones', 'tab-chart', 'tab-timer', 'legend-flame']);

// Размер иконки = размер полотна в Figma (width/height корневого <svg>). Иконки выгружены вместе с полотном,
// поэтому масштабировать их под другой размер нельзя: стрелка на полотне 32×32 превратится в точку.
const SIZES: Record<string, [number, number]> = {};

function prepare(name: string, raw: string): string {
  const w = /<svg[^>]*\swidth="([\d.]+)"/.exec(raw);
  const h = /<svg[^>]*\sheight="([\d.]+)"/.exec(raw);
  if (w && h) SIZES[name] = [Number(w[1]), Number(h[1])];
  let svg = raw.replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();
  svg = svg.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
    const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, '');
    return `<svg${cleaned} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">`;
  });
  if (RECOLOR.has(name)) {
    svg = svg
      .replace(/\b(fill|stroke)="(?!none|url)([^"]+)"/g, '$1="currentColor"')
      .replace(/\b(fill|stroke):\s*(?!none|url)[^;"]+/g, '$1:currentColor');
  }
  return svg;
}

const ICONS: Record<string, string> = {};
for (const [path, svg] of Object.entries(files)) {
  const name = path.split('/').pop()?.replace(/\.svg$/, '');
  if (name) ICONS[name] = prepare(name, svg);
}

// Диагностика при разработке: сколько файлов найдено и какие названы не так, как нужно
if (import.meta.env.DEV) {
  const known = new Set<string>(ICON_NAMES);
  const found = Object.keys(ICONS);
  const unknown = found.filter((n) => !known.has(n));
  const missing = ICON_NAMES.filter((n) => !(n in ICONS));
  console.info(`[Icons] найдено ${found.length} из ${ICON_NAMES.length} иконок в src/assets/icons/`);
  if (unknown.length) console.warn('[Icons] файлы с неизвестными именами (проверьте опечатки):', unknown);
  if (missing.length) console.warn('[Icons] нет файлов:', missing.join(', '));
}

interface IconProps {
  name: string;
  /** Положение и цвет (например `absolute right-3 text-red-700`). Размер берётся из файла SVG; цвет меняется у иконок из RECOLOR */
  className?: string;
}

export function Icon({ name, className = '' }: IconProps) {
  const svg = ICONS[name];
  // Нет файла — пустой блок (размер берётся из className), чтобы вёрстка не сдвигалась
  if (!svg) return <span aria-hidden="true" data-missing-icon={name} className={`inline-block shrink-0 ${className}`} />;
  const size = SIZES[name];
  return (
    <span
      aria-hidden="true"
      style={size ? { width: size[0], height: size[1] } : undefined}
      className={`inline-flex shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full ${className}`}
      // SVG берётся из файлов репозитория (выгрузка из макета), не из пользовательского ввода
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
