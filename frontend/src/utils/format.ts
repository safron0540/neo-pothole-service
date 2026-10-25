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
  }).format(d);
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
