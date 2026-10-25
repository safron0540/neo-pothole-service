import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RotateCcw, Flame, MapPin, Layers, Map as MapIcon, Clock, X, Camera, Loader2 } from 'lucide-react';
import { api, type MapPoint } from '../../api';
import {
  CONTRACTORS,
  DEFECT_CLASS_LABEL,
  DEMO_REQUESTS,
  DISTRICTS,
  STREET_GROUPS,
  type RequestItem,
} from '../../data/reference';
import { formatDateTime, remainingInfo } from '../../utils/format';

(window as any).L = L;
import 'leaflet.heat';

const STATUS_COLORS: Record<string, string> = {
  'На проверке': '#9E9E9E',
  'Принято': '#2563EB',
  'В работе': '#EAB308',
  'Выполнено': '#16A34A',
  'Требует уточнения': '#EA580C',
  'Отклонено': '#DC2626',
};

const PERIODS: { value: string; label: string; days?: number }[] = [
  { value: 'Все', label: 'Период' },
  { value: 'week', label: 'За неделю', days: 7 },
  { value: 'month', label: 'За месяц', days: 30 },
  { value: 'quarter', label: 'За квартал', days: 90 },
];

const createColorMarker = (color: string) =>
  L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="background-color:${color};width:18px;height:18px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

interface Filters {
  status: string;
  district: string;
  streetGroup: string;
  defectClass: string;
  contractorId: string;
  period: string;
}

const DEFAULT_FILTERS: Filters = {
  status: 'Все',
  district: 'Все',
  streetGroup: 'Все',
  defectClass: 'Все',
  contractorId: 'Все',
  period: 'Все',
};

const createdFrom = (period: string): string | undefined => {
  const days = PERIODS.find((p) => p.value === period)?.days;
  return days ? new Date(Date.now() - days * 864e5).toISOString() : undefined;
};

// Те же условия, что уходят на сервер. Применяются и на клиенте, чтобы карта
// корректно фильтровалась и на демо-данных. Если у точки нет нужного поля,
// сервер уже отфильтровал её сам — такую точку не отбрасываем.
function applyFilters(points: MapPoint[], f: Filters): MapPoint[] {
  const from = createdFrom(f.period);
  return points.filter((p) => {
    if (f.status !== 'Все' && p.status !== f.status) return false;
    if (f.district !== 'Все' && p.district && p.district !== f.district) return false;
    if (f.streetGroup !== 'Все' && p.street_group && p.street_group !== f.streetGroup) return false;
    if (f.defectClass !== 'Все' && p.defect_class !== f.defectClass) return false;
    if (f.contractorId !== 'Все' && p.contractor_id != null && String(p.contractor_id) !== f.contractorId) return false;
    if (from && p.created_at && p.created_at < from) return false;
    return true;
  });
}

function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (!(L as any).heatLayer) return;
    const heat = (L as any).heatLayer(points, {
      radius: 40,
      blur: 25,
      maxZoom: 16,
      gradient: { 0.3: '#FBBF24', 0.6: '#F97316', 0.9: '#DC2626' },
    }).addTo(map);
    return () => {
      map.removeLayer(heat);
    };
  }, [map, points]);
  return null;
}

interface PanelData extends MapPoint {
  photo_url?: string | null;
  full_address?: string;
}

export default function MapPage({ onNavigateToRequest }: { onNavigateToRequest?: (id: number) => void }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const setFilter = (key: keyof Filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));

  const [points, setPoints] = useState<MapPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [selectedPit, setSelectedPit] = useState<PanelData | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showZones, setShowZones] = useState(false);

  // Загрузка точек: фильтры уходят на сервер, при недоступности — демо-данные
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    api
      .getMapPoints({
        status: filters.status,
        district: filters.district,
        street_group: filters.streetGroup,
        defect_class: filters.defectClass,
        contractor_id: filters.contractorId === 'Все' ? undefined : Number(filters.contractorId),
        created_from: createdFrom(filters.period),
      })
      .then((data) => {
        if (cancelled) return;
        setPoints(data.filter((p) => p.lat != null && p.lon != null));
        setIsOffline(false);
      })
      .catch(() => {
        if (cancelled) return;
        setPoints(DEMO_REQUESTS as MapPoint[]);
        setIsOffline(true);
      })
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters]);

  const filteredPits = useMemo(() => applyFilters(points, filters), [points, filters]);

  // Тепловая карта строится по тем же отфильтрованным заявкам
  const heatPoints = useMemo<[number, number, number][]>(
    () => filteredPits.map((p) => [p.lat as number, p.lon as number, p.defect_class === 'big' ? 1 : 0.5]),
    [filteredPits]
  );

  const visibleZones = useMemo(
    () => (filters.contractorId === 'Все' ? CONTRACTORS : CONTRACTORS.filter((c) => String(c.id) === filters.contractorId)),
    [filters.contractorId]
  );

  // Карточка точки: подтягиваем фото и полный адрес, если сервер их отдаёт
  const openPit = (pit: MapPoint) => {
    setPhotoFailed(false);
    setSelectedPit(pit);
    api
      .getRequestById(pit.id)
      .then((d: RequestItem) => {
        if (d.id === pit.id) setSelectedPit((prev) => (prev && prev.id === pit.id ? { ...prev, ...d } : prev));
      })
      .catch(() => {});
  };

  // Закрываем карточку, если точка пропала из выборки
  useEffect(() => {
    if (selectedPit && !filteredPits.some((p) => p.id === selectedPit.id)) setSelectedPit(null);
  }, [filteredPits]);

  const statusList = [
    { label: 'Все', color: '#171717' },
    { label: 'На проверке', color: STATUS_COLORS['На проверке'] },
    { label: 'Принято', color: STATUS_COLORS['Принято'] },
    { label: 'В работе', color: STATUS_COLORS['В работе'] },
    { label: 'Выполнено', color: STATUS_COLORS['Выполнено'] },
    { label: 'Требует уточнения', color: STATUS_COLORS['Требует уточнения'] },
    { label: 'Отклонено', color: STATUS_COLORS['Отклонено'] },
  ];

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-neutral-100 font-sans text-neutral-800 antialiased">
      <div className="bg-white/95 backdrop-blur-sm border-b border-neutral-200 px-6 py-3 z-10 flex flex-col gap-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-neutral-100 rounded-full px-3 py-1 flex items-center gap-3 text-xs border border-neutral-200">
            <span className="font-semibold text-neutral-600">Статусы:</span>
            {statusList.map((st) => (
              <button
                key={st.label}
                onClick={() => setFilter('status', st.label)}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full transition-all cursor-pointer ${
                  filters.status === st.label
                    ? 'bg-white shadow-sm font-bold text-neutral-900 border border-neutral-300'
                    : 'text-neutral-600 hover:text-black'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }}></span>
                <span>{st.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <select value={filters.district} onChange={(e) => setFilter('district', e.target.value)} className="h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none">
              <option value="Все">Район</option>
              {DISTRICTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select value={filters.streetGroup} onChange={(e) => setFilter('streetGroup', e.target.value)} className="h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none">
              <option value="Все">Группа улиц</option>
              {STREET_GROUPS.map((g) => (
                <option key={g} value={g}>Категория {g}</option>
              ))}
            </select>

            <select value={filters.defectClass} onChange={(e) => setFilter('defectClass', e.target.value)} className="h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none">
              <option value="Все">Класс дефекта</option>
              <option value="big">Большая</option>
              <option value="small">Маленькая</option>
            </select>

            <select value={filters.contractorId} onChange={(e) => setFilter('contractorId', e.target.value)} className="h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none">
              <option value="Все">Подрядчик</option>
              {CONTRACTORS.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>

            <select value={filters.period} onChange={(e) => setFilter('period', e.target.value)} className="h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none">
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="h-8 px-3 rounded-lg bg-neutral-400 hover:bg-neutral-500 text-white font-medium flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить</span>
            </button>

            <span className="text-neutral-500 font-medium flex items-center gap-1.5">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-700" /> : null}
              Найдено: {filteredPits.length}
              {isOffline && <span className="text-amber-700">(демо-данные)</span>}
            </span>
          </div>

          <div className="bg-neutral-100 p-1 rounded-xl border border-neutral-200 flex items-center gap-1">
            <button
              onClick={() => setShowHeatmap(!showHeatmap)}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                showHeatmap ? 'bg-red-700 text-white font-semibold shadow-sm' : 'text-neutral-600 hover:text-black'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>Тепловая карта</span>
            </button>

            <button
              onClick={() => setShowMarkers(!showMarkers)}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                showMarkers ? 'bg-red-700 text-white font-semibold shadow-sm' : 'text-neutral-600 hover:text-black'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-red-500" />
              <span>Маркеры</span>
            </button>

            <button
              onClick={() => setShowZones(!showZones)}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                showZones ? 'bg-red-700 text-white font-semibold shadow-sm' : 'text-neutral-600 hover:text-black'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-500" />
              <span>Зоны подрядчиков</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full h-full relative z-0">
        <MapContainer center={[56.495, 84.975]} zoom={13} className="w-full h-full" attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {showHeatmap && <HeatmapLayer points={heatPoints} />}
          {showMarkers &&
            filteredPits.map((pit) => (
              <Marker
                key={pit.id}
                position={[pit.lat as number, pit.lon as number]}
                icon={createColorMarker(STATUS_COLORS[pit.status] || '#000')}
                eventHandlers={{ click: () => openPit(pit) }}
              />
            ))}
          {showZones &&
            visibleZones.map((zone) => (
              <Polygon key={zone.id} positions={zone.zone} pathOptions={{ color: zone.color, fillOpacity: 0.15, weight: 2 }}>
                <Tooltip sticky>{zone.name}</Tooltip>
              </Polygon>
            ))}
        </MapContainer>

        {showHeatmap && (
          <div className="absolute bottom-6 left-6 z-[1000] bg-white rounded-2xl p-4 shadow-lg border border-neutral-200 w-64">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-800 mb-1.5">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-500" />
                <span>Концентрация заявок</span>
              </div>
              <span className="text-[10px] text-neutral-400 font-normal">Heatmap активен</span>
            </div>
            <div className="w-full h-2 rounded-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600 mb-1"></div>
            <div className="flex justify-between text-[10px] text-neutral-400 font-medium">
              <span>Низкая</span>
              <span>Средняя</span>
              <span>Высокая</span>
            </div>
          </div>
        )}

        {selectedPit && (
          <div className="absolute top-4 right-4 bottom-4 z-[1000] w-96 bg-white rounded-3xl shadow-2xl border border-neutral-200 p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold px-2.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: STATUS_COLORS[selectedPit.status] || '#171717' }}
                  >
                    {selectedPit.status}
                  </span>
                  <span className="text-sm font-bold text-neutral-800">№ {selectedPit.id}</span>
                </div>
                <button onClick={() => setSelectedPit(null)} className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-black cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {selectedPit.photo_url && !photoFailed ? (
                <img
                  src={selectedPit.photo_url}
                  alt="Фото дефекта"
                  onError={() => setPhotoFailed(true)}
                  className="w-full h-44 rounded-2xl object-cover border border-neutral-200 bg-neutral-100"
                />
              ) : (
                <div className="relative w-full h-44 rounded-2xl bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center text-neutral-400">
                  <Camera className="w-8 h-8 mb-1" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-center">Фото не загружено</span>
                </div>
              )}

              <div>
                <div className="text-xs text-neutral-400 font-medium">Класс дефекта</div>
                <div className="text-base font-bold text-neutral-900">{DEFECT_CLASS_LABEL[selectedPit.defect_class]} яма</div>
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-start gap-2.5 text-xs">
                  <MapPin className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-neutral-400">Адрес дефекта</div>
                    <div className="font-semibold text-neutral-800">{selectedPit.full_address ?? selectedPit.address ?? '—'}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-xs">
                  <MapIcon className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-neutral-400">Группа улицы</div>
                    <div className="font-semibold text-neutral-800">
                      {selectedPit.street_group ? `Категория ${selectedPit.street_group}` : '—'}
                      {selectedPit.district ? ` · ${selectedPit.district}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-xs">
                  <Clock className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-neutral-400">Плановая дата устранения</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="font-semibold text-neutral-800">{formatDateTime(selectedPit.planned_due)}</span>
                      {selectedPit.planned_due && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            remainingInfo(selectedPit.planned_due).urgent ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {remainingInfo(selectedPit.planned_due).label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-50 rounded-2xl p-3 border border-neutral-100">
                <div className="text-[11px] text-neutral-400 font-medium">Назначенный подрядчик</div>
                <div className="text-xs font-bold text-neutral-900 mt-0.5">{selectedPit.contractor_name ?? 'Не назначен'}</div>
              </div>
            </div>

            <button
              onClick={() => onNavigateToRequest?.(selectedPit.id)}
              className="w-full mt-4 py-3 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white text-xs font-bold rounded-xl shadow-md transition-colors cursor-pointer"
            >
              Открыть полную карточку заявки
            </button>
          </div>
        )}
      </div>
    </div>
  );
}