import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Layer, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RotateCcw, Flame, MapPin, Layers, Map as MapIcon, Clock, X, Camera, Loader2 } from 'lucide-react';
import { api } from '../../api';
import type { DefectClass, DispatcherRequestOut, MapPoint, StatusCode, StreetGroupCode } from '../../api';
import {
  DEFECT_CLASS_LABEL,
  STATUS_CODES,
  STATUS_COLOR,
  STATUS_LABEL,
  contractorColor,
  statusLabel,
} from '../../data/reference';
import { useReference } from '../../data/useReference';
import { formatDateTime, remainingInfo } from '../../utils/format';

(window as unknown as { L: typeof L }).L = L;
import 'leaflet.heat';

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
  status: StatusCode | 'Все';
  districtId: string;
  streetGroup: StreetGroupCode | 'Все';
  defectClass: DefectClass | 'Все';
  contractorId: string;
  period: string;
}

const DEFAULT_FILTERS: Filters = {
  status: 'Все',
  districtId: 'Все',
  streetGroup: 'Все',
  defectClass: 'Все',
  contractorId: 'Все',
  period: 'Все',
};

const detectedFrom = (period: string): string | undefined => {
  const days = PERIODS.find((p) => p.value === period)?.days;
  return days ? new Date(Date.now() - days * 864e5).toISOString() : undefined;
};

// Видимая область карты → bbox «запад,юг,восток,север» (формат Leaflet, как ждёт контракт)
function BoundsWatcher({ onChange }: { onChange: (bbox: string) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds().toBBoxString()),
  });
  useEffect(() => {
    map.whenReady(() => onChange(map.getBounds().toBBoxString()));
  }, [map, onChange]);
  return null;
}

interface HeatLayerFactory {
  heatLayer?: (
    points: [number, number, number][],
    options: Record<string, unknown>
  ) => Layer & { addTo: (map: LeafletMap) => Layer };
}

function HeatmapLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  useEffect(() => {
    const factory = (L as unknown as HeatLayerFactory).heatLayer;
    if (!factory) return;
    const heat = factory(points, {
      radius: 40,
      blur: 25,
      maxZoom: 16,
      gradient: { 0.3: '#F2B705', 0.6: '#F08A24', 0.9: '#D93025' },
    });
    heat.addTo(map);
    return () => {
      map.removeLayer(heat);
    };
  }, [map, points]);
  return null;
}

// Карточка точки: данные маркера + полная карточка с сервера (фото)
interface Panel {
  point: MapPoint;
  detail: DispatcherRequestOut | null;
}

type ZoneData = React.ComponentProps<typeof GeoJSON>['data'];

export default function MapPage({ onNavigateToRequest }: { onNavigateToRequest?: (id: number) => void }) {
  const { districts, streetGroups, contractors } = useReference();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const [bbox, setBbox] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showZones, setShowZones] = useState(false);

  // Фильтры и bbox уходят на сервер — он же отдаёт готовую выборку
  const queryKey = JSON.stringify([bbox, filters]);
  const [result, setResult] = useState<{ key: string; points: MapPoint[]; error?: string } | null>(null);

  useEffect(() => {
    if (bbox === null) return; // ждём первого положения карты
    let cancelled = false;
    api
      .getMapPoints({
        bbox,
        status: filters.status === 'Все' ? undefined : [filters.status],
        district_id: filters.districtId === 'Все' ? undefined : Number(filters.districtId),
        street_group: filters.streetGroup === 'Все' ? undefined : filters.streetGroup,
        defect_class: filters.defectClass === 'Все' ? undefined : filters.defectClass,
        contractor_id: filters.contractorId === 'Все' ? undefined : Number(filters.contractorId),
        detected_from: detectedFrom(filters.period),
      })
      .then((data) => {
        if (!cancelled) setResult({ key: queryKey, points: data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult({ key: queryKey, points: [], error: err instanceof Error ? err.message : 'Ошибка' });
      });
    return () => {
      cancelled = true;
    };
  }, [bbox, filters, queryKey]);

  const isLoading = bbox === null || result?.key !== queryKey;
  const points = result?.points ?? [];

  const heatPoints = useMemo<[number, number, number][]>(
    () => points.map((p) => [p.lat, p.lon, p.defect_class === 'big' ? 1 : 0.5]),
    [points]
  );

  const visibleZones = useMemo(
    () =>
      contractors.filter(
        (c) => c.zone && (filters.contractorId === 'Все' || String(c.id) === filters.contractorId)
      ),
    [contractors, filters.contractorId]
  );

  // Полную карточку (фото, координаты) берём по клику: GET /requests/{id}
  const openPit = (point: MapPoint) => {
    setPhotoFailed(false);
    setPanel({ point, detail: null });
    api
      .getRequestById(point.id)
      .then((detail) => setPanel((prev) => (prev && prev.point.id === point.id ? { point, detail } : prev)))
      .catch(() => {
        /* остаёмся с данными маркера */
      });
  };

  const statusList: { code: StatusCode | 'Все'; label: string; color: string }[] = [
    { code: 'Все', label: 'Все', color: '#212121' },
    ...STATUS_CODES.map((code) => ({ code, label: STATUS_LABEL[code], color: STATUS_COLOR[code] })),
  ];

  const selectClass = 'h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none';
  const pit = panel?.point;
  const pitDue = panel?.detail?.planned_due_at ?? pit?.planned_due_at ?? null;

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-neutral-100 text-neutral-800 antialiased">
      <div className="bg-white/95 backdrop-blur-sm border-b border-neutral-200 px-6 py-3 z-10 flex flex-col gap-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-neutral-100 rounded-2xl px-3 py-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs border border-neutral-200">
            <span className="font-semibold text-neutral-600">Статусы:</span>
            {statusList.map((st) => (
              <button
                key={st.code}
                onClick={() => setFilter('status', st.code)}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full transition-all cursor-pointer font-bold ${
                  filters.status === st.code
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
            <select value={filters.districtId} onChange={(e) => setFilter('districtId', e.target.value)} className={selectClass}>
              <option value="Все">Район</option>
              {districts.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>

            <select
              value={filters.streetGroup}
              onChange={(e) => setFilter('streetGroup', e.target.value as Filters['streetGroup'])}
              className={selectClass}
            >
              <option value="Все">Группа улиц</option>
              {streetGroups.map((g) => (
                <option key={g.code} value={g.code}>Категория {g.code}</option>
              ))}
            </select>

            <select
              value={filters.defectClass}
              onChange={(e) => setFilter('defectClass', e.target.value as Filters['defectClass'])}
              className={selectClass}
            >
              <option value="Все">Класс дефекта</option>
              <option value="big">Большая</option>
              <option value="small">Маленькая</option>
            </select>

            <select value={filters.contractorId} onChange={(e) => setFilter('contractorId', e.target.value)} className={selectClass}>
              <option value="Все">Подрядчик</option>
              {contractors.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>

            <select value={filters.period} onChange={(e) => setFilter('period', e.target.value)} className={selectClass}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            <button
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="h-8 px-3 rounded-lg bg-neutral-400 hover:bg-neutral-500 text-white font-bold flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить</span>
            </button>

            <span className="text-neutral-500 font-medium flex items-center gap-1.5">
              {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-700" /> : null}
              Найдено: {points.length}
              {result?.error && <span className="text-red-600">({result.error})</span>}
            </span>
          </div>

          <div className="bg-neutral-100 p-1 rounded-xl border border-neutral-200 flex items-center gap-1">
            <button
              onClick={() => setShowHeatmap(!showHeatmap)}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                showHeatmap ? 'bg-red-700 text-white font-bold shadow-sm' : 'text-neutral-600 hover:text-black'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>Тепловая карта</span>
            </button>

            <button
              onClick={() => setShowMarkers(!showMarkers)}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                showMarkers ? 'bg-red-700 text-white font-bold shadow-sm' : 'text-neutral-600 hover:text-black'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-red-500" />
              <span>Маркеры</span>
            </button>

            <button
              onClick={() => setShowZones(!showZones)}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
                showZones ? 'bg-red-700 text-white font-bold shadow-sm' : 'text-neutral-600 hover:text-black'
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
          <BoundsWatcher onChange={setBbox} />
          {showHeatmap && <HeatmapLayer points={heatPoints} />}
          {showMarkers &&
            points.map((p) => (
              <Marker
                key={p.id}
                position={[p.lat, p.lon]}
                icon={createColorMarker(STATUS_COLOR[p.status] || '#9E9E9E')}
                eventHandlers={{ click: () => openPit(p) }}
              />
            ))}
          {/* zone — GeoJSON MultiPolygon [долгота, широта]; Leaflet сам разбирает порядок координат */}
          {showZones &&
            visibleZones.map((c) => (
              <GeoJSON
                key={`${c.id}-${c.zone ? c.zone.coordinates.length : 0}`}
                data={c.zone as unknown as ZoneData}
                style={{ color: contractorColor(c.id), fillOpacity: 0.15, weight: 2 }}
              >
                <Tooltip sticky>{c.name}</Tooltip>
              </GeoJSON>
            ))}
        </MapContainer>

        {showHeatmap && (
          <div className="absolute bottom-6 left-6 z-[1000] bg-white rounded-2xl p-4 shadow-lg border border-neutral-200 w-64">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-800 mb-1.5">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-500" />
                <span>Концентрация заявок</span>
              </div>
              <span className="text-xs text-neutral-400 font-normal">Heatmap активен</span>
            </div>
            <div
              className="w-full h-2 rounded-full mb-1"
              style={{ background: 'linear-gradient(to right, #F2B705, #F08A24, #D93025)' }}
            ></div>
            <div className="flex justify-between text-xs text-neutral-400 font-medium">
              <span>Низкая</span>
              <span>Средняя</span>
              <span>Высокая</span>
            </div>
          </div>
        )}

        {panel && pit && (
          <div className="absolute top-4 right-4 bottom-4 z-[1000] w-96 bg-white rounded-3xl shadow-2xl border border-neutral-200 p-6 flex flex-col justify-between overflow-y-auto">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold px-2.5 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: STATUS_COLOR[pit.status] || '#212121' }}
                  >
                    {panel.detail?.status.label ?? statusLabel(pit.status)}
                  </span>
                  <span className="text-sm font-bold text-neutral-800">№ {pit.id}</span>
                </div>
                <button onClick={() => setPanel(null)} className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-black cursor-pointer font-bold">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Ссылки на фото подписаны и живут 15 минут — не кэшируем */}
              {panel.detail?.photo_before_url && !photoFailed ? (
                <img
                  src={panel.detail.photo_before_url}
                  alt="Фото дефекта"
                  onError={() => setPhotoFailed(true)}
                  className="w-full h-44 rounded-2xl object-cover border border-neutral-200 bg-neutral-100"
                />
              ) : (
                <div className="relative w-full h-44 rounded-2xl bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center text-neutral-400">
                  <Camera className="w-8 h-8 mb-1" />
                  <span className="text-xs font-bold uppercase tracking-wider text-center">Фото не загружено</span>
                </div>
              )}

              <div>
                <div className="text-xs text-neutral-400 font-medium">Класс дефекта</div>
                <div className="text-base font-bold text-neutral-900">{DEFECT_CLASS_LABEL[pit.defect_class]} яма</div>
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-start gap-2.5 text-xs">
                  <MapPin className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-neutral-400">Адрес дефекта</div>
                    <div className="font-semibold text-neutral-800">{pit.address || '—'}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-xs">
                  <MapIcon className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-neutral-400">Группа улицы</div>
                    <div className="font-semibold text-neutral-800">
                      {pit.street_group ? `Категория ${pit.street_group}` : '—'}
                      {pit.district ? ` · ${pit.district.name}` : ''}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-xs">
                  <Clock className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-neutral-400">Плановая дата устранения</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="font-semibold text-neutral-800">{formatDateTime(pitDue)}</span>
                      {pitDue && (
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                            pit.is_overdue || remainingInfo(pitDue).urgent ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {remainingInfo(pitDue).label}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-50 rounded-2xl p-3 border border-neutral-100">
                <div className="text-xs text-neutral-400 font-medium">Назначенный подрядчик</div>
                <div className="text-xs font-bold text-neutral-900 mt-0.5">{pit.contractor?.name ?? 'Не назначен'}</div>
              </div>
            </div>

            <button
              onClick={() => onNavigateToRequest?.(pit.id)}
              className="w-full mt-4 py-3 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white text-sm font-bold rounded-xl shadow-md transition-colors cursor-pointer"
            >
              Открыть полную карточку заявки
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
