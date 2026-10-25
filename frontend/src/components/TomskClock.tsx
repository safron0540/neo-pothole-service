import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

const formatTomsk = (d: Date) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tomsk',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);

export function TomskClock() {
  const [time, setTime] = useState(() => formatTomsk(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTime(formatTomsk(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 text-xs font-medium text-neutral-600 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-200 tabular-nums">
      <Clock className="w-3.5 h-3.5 text-neutral-500" />
      <span>{time} Томск</span>
    </div>
  );
}
