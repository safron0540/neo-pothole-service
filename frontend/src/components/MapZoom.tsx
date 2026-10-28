import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

// Кнопки масштаба вместо стандартных Leaflet: слева, посередине высоты карты, в скруглённой
// плашке. Ставится внутрь <MapContainer zoomControl={false}>.
export function MapZoom() {
  const map = useMap();
  const box = useRef<HTMLDivElement>(null);

  // Клики и прокрутка по кнопкам не должны двигать карту
  useEffect(() => {
    if (!box.current) return;
    L.DomEvent.disableClickPropagation(box.current);
    L.DomEvent.disableScrollPropagation(box.current);
  }, []);

  const button =
    'w-10 h-10 flex items-center justify-center text-neutral-800 hover:bg-neutral-100 active:bg-neutral-200 transition-colors cursor-pointer';
  const line = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const };

  return (
    <div
      ref={box}
      className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-[1000] flex flex-col bg-white rounded-2xl shadow-[0_4px_14px_rgba(0,0,0,0.18)] overflow-hidden"
    >
      <button type="button" aria-label="Приблизить" title="Приблизить" onClick={() => map.zoomIn()} className={button}>
        <svg viewBox="0 0 20 20" className="w-5 h-5" aria-hidden="true">
          <path d="M10 4v12M4 10h12" {...line} />
        </svg>
      </button>
      <div className="h-px bg-neutral-200 mx-2" />
      <button type="button" aria-label="Отдалить" title="Отдалить" onClick={() => map.zoomOut()} className={button}>
        <svg viewBox="0 0 20 20" className="w-5 h-5" aria-hidden="true">
          <path d="M4 10h12" {...line} />
        </svg>
      </button>
    </div>
  );
}
