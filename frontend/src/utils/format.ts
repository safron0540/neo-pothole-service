// Все даты в интерфейсе показываем по Томску, независимо от часового пояса браузера
export const TOMSK_TZ = 'Asia/Tomsk';

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: TOMSK_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(d)
    .replace(',', '');
}

export function formatTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: TOMSK_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: TOMSK_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

function formatHours(h: number): string {
  return h < 48 ? `${h} ч.` : `${Math.floor(h / 24)} дн.`;
}

// Сколько осталось до планового срока (считается от текущего момента, а не хранится строкой)
export function remainingInfo(due?: string | null): { label: string; overdue: boolean; urgent: boolean } {
  if (!due) return { label: 'Срок по ГОСТ', overdue: false, urgent: false };
  const diffH = Math.round((new Date(due).getTime() - Date.now()) / 36e5);
  if (diffH < 0) return { label: `Просрочено на ${formatHours(-diffH)}`, overdue: true, urgent: true };
  return { label: `Осталось ${formatHours(diffH)}`, overdue: false, urgent: diffH < 24 };
}

// ---- Подписи сроков по макету ----
const dayKey = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TOMSK_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

const hm = (d: Date) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: TOMSK_TZ, hour: '2-digit', minute: '2-digit' }).format(d);

const dayMonth = (d: Date) =>
  new Intl.DateTimeFormat('ru-RU', { timeZone: TOMSK_TZ, day: 'numeric', month: 'long' }).format(d);

/** «Сегодня, 09:15» / «Завтра, 11:20» / «18 мая, 12:00» */
export function formatDayTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const today = new Date();
  const tomorrow = new Date(Date.now() + 864e5);
  const yesterday = new Date(Date.now() - 864e5);
  if (dayKey(d) === dayKey(today)) return `Сегодня, ${hm(d)}`;
  if (dayKey(d) === dayKey(tomorrow)) return `Завтра, ${hm(d)}`;
  if (dayKey(d) === dayKey(yesterday)) return `Вчера, ${hm(d)}`;
  return `${dayMonth(d)}, ${hm(d)}`;
}

/** Срок «до»: «Сегодня до 18:00» / «Завтра до 14:00» / «18 мая, 12:00» */
export function formatDueLabel(iso?: string | null): string {
  if (!iso) return 'Штатный срок';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  if (dayKey(d) === dayKey(new Date())) return `Сегодня до ${hm(d)}`;
  if (dayKey(d) === dayKey(new Date(Date.now() + 864e5))) return `Завтра до ${hm(d)}`;
  return `${dayMonth(d)}, ${hm(d)}`;
}

/** «3 ч 15 м» */
export function formatHM(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h > 0 ? `${h} ч ${mm} м` : `${mm} м`;
}

/** Остаток до срока в формате макета подрядчика: «Осталось 3 ч 15 м» / «Просрочено на 2 ч 40 м» */
export function remainingDetailed(due?: string | null): { label: string; overdue: boolean; urgent: boolean } {
  if (!due) return { label: 'Штатный срок', overdue: false, urgent: false };
  const min = (new Date(due).getTime() - Date.now()) / 6e4;
  if (min < 0) return { label: `Просрочено на ${formatHM(-min)}`, overdue: true, urgent: true };
  return { label: `Осталось ${formatHM(min)}`, overdue: false, urgent: min < 6 * 60 };
}

const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

/** Плашка в очереди диспетчера: «Осталось 24 ч.» / «Осталось 3 дня» / «Осталось 7 дней» */
export function remainingChip(due?: string | null): { label: string; tone: 'red' | 'orange' | 'gray' } {
  if (!due) return { label: 'Срок не задан', tone: 'gray' };
  const hours = Math.round((new Date(due).getTime() - Date.now()) / 36e5);
  if (hours < 0) return { label: 'Просрочено', tone: 'red' };
  if (hours <= 24) return { label: `Осталось ${hours} ч.`, tone: 'red' };
  const days = Math.ceil(hours / 24);
  return { label: `Осталось ${days} ${plural(days, 'день', 'дня', 'дней')}`, tone: days <= 3 ? 'orange' : 'gray' };
}

/** «до 18:00 сегодня» / «до 14:00 завтра» / «до 18 мая, 12:00» */
export function formatDeadlineShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  if (dayKey(d) === dayKey(new Date())) return `до ${hm(d)} сегодня`;
  if (dayKey(d) === dayKey(new Date(Date.now() + 864e5))) return `до ${hm(d)} завтра`;
  return `до ${dayMonth(d)}, ${hm(d)}`;
}

/** «Ленинский район» → «Ленинский» (в таблицах и списках, как в макете) */
export const shortDistrict = (name?: string | null): string => (name ? name.replace(/\s*район$/i, '') : '—');

/** Адрес из API — «улица, дом, район». Делим на улицу и район (район может отсутствовать) */
export function splitAddress(address?: string | null): { street: string; district: string | null } {
  if (!address) return { street: '—', district: null };
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  if (parts.length > 1 && /(район|округ|р-н)/i.test(last)) {
    return { street: parts.slice(0, -1).join(', '), district: last };
  }
  return { street: address, district: null };
}
