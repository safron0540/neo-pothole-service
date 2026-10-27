import { useState, useMemo, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, ImageOverlay, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { Map as LeafletMap } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
import { SelectBox } from '../../components/SelectBox';
import { Icon } from '../../components/Icon';
import { formatDateTime, remainingInfo } from '../../utils/format';


import { CameraIcon, Spinner } from '../../components/UiIcons';
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

// ---- Тепловая карта (ПР-7) ----
// Поверхность плотности по отфильтрованным заявкам: точки складываются в сетку, сетка сглаживается
// (гауссово размытие, радиус ≈ 250 м), цвет — концентрация: зелёный → жёлтый → оранжевый → красный.
// Соседние заявки сливаются в зоны, одиночная заявка даёт лишь слабое зелёное пятно. Расчёт — десятки миллисекунд.
const HEAT_RAMP: { at: number; rgb: [number, number, number]; alpha: number }[] = [
  { at: 0.0, rgb: [96, 200, 90], alpha: 0 },
  { at: 0.1, rgb: [96, 200, 90], alpha: 0.32 }, // низкая  — зелёный
  { at: 0.35, rgb: [242, 183, 5], alpha: 0.55 }, // жёлтый #F2B705
  { at: 0.65, rgb: [240, 138, 36], alpha: 0.65 }, // оранжевый #F08A24
  { at: 1.0, rgb: [217, 48, 37], alpha: 0.78 }, // высокая — красный #D93025
];

function rampColor(t: number): [number, number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  let i = 1;
  while (i < HEAT_RAMP.length - 1 && HEAT_RAMP[i].at < x) i++;
  const a = HEAT_RAMP[i - 1];
  const b = HEAT_RAMP[i];
  const k = b.at === a.at ? 0 : (x - a.at) / (b.at - a.at);
  return [
    Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k),
    Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k),
    Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k),
    Math.round((a.alpha + (b.alpha - a.alpha) * k) * 255),
  ];
}

// Одномерное гауссово размытие по строкам и столбцам (за пределами сетки — ноль)
function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w) acc += src[y * w + xx] * kernel[k + radius];
      }
      tmp[y * w + x] = acc;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h) acc += tmp[yy * w + x] * kernel[k + radius];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

const HEAT_SIGMA_METERS = 250; // «размер» зоны вокруг заявки
const HEAT_SATURATION = 4; // сколько заявок рядом дают красный цвет

interface HeatImage {
  url: string;
  bounds: [[number, number], [number, number]];
}

// Рисуем картинку на область в 2 раза больше экрана: при перетаскивании карты края уже закрашены
function buildHeatImage(map: LeafletMap, points: MapPoint[]): HeatImage | null {
  const size = map.getSize();
  if (size.x === 0 || size.y === 0 || points.length === 0) return null;

  const padX = size.x / 2;
  const padY = size.y / 2;
  const totalW = size.x * 2;
  const totalH = size.y * 2;

  // метров в пикселе на широте центра
  const center = map.getCenter();
  const metersPerPx = (156543.03392 * Math.cos((center.lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
  const sigmaPx = HEAT_SIGMA_METERS / metersPerPx;

  // Размер ячейки сетки подбираем так, чтобы sigma не превышала ~8 ячеек (быстрое размытие)
  const cell = Math.max(6, Math.round(sigmaPx / 8));
  const w = Math.ceil(totalW / cell);
  const h = Math.ceil(totalH / cell);
  if (w * h > 600000) return null; // защита от слишком большого окна

  const grid = new Float32Array(w * h);
  for (const p of points) {
    const pt = map.latLngToContainerPoint([p.lat, p.lon]);
    const gx = Math.floor((pt.x + padX) / cell);
    const gy = Math.floor((pt.y + padY) / cell);
    if (gx >= 0 && gx < w && gy >= 0 && gy < h) grid[gy * w + gx] += p.defect_class === 'big' ? 1 : 0.6;
  }

  const sigmaCells = Math.max(1.2, sigmaPx / cell);
  const blurred = gaussianBlur(grid, w, h, sigmaCells);
  // Пик одиночной заявки после размытия — 1/(2πσ²); насыщение — HEAT_SATURATION таких заявок
  const saturation = HEAT_SATURATION / (2 * Math.PI * sigmaCells * sigmaCells);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(w, h);
  for (let i = 0; i < blurred.length; i++) {
    const [r, g, b, a] = rampColor(blurred[i] / saturation);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = a;
  }
  ctx.putImageData(image, 0, 0);

  // Углы области: экранные точки (-padX, -padY) и (size.x + padX, size.y + padY) → координаты
  const nw = map.containerPointToLatLng([-padX, -padY]);
  const se = map.containerPointToLatLng([size.x + padX, size.y + padY]);
  return { url: canvas.toDataURL('image/png'), bounds: [[nw.lat, nw.lng], [se.lat, se.lng]] };
}

function HeatSurface({ points }: { points: MapPoint[] }) {
  const map = useMap();
  // Версия вида карты: меняется при сдвиге/масштабировании и пересчитывает картинку
  const [view, setView] = useState(0);
  useMapEvents({
    moveend: () => setView((v) => v + 1),
    zoomend: () => setView((v) => v + 1),
  });
  useEffect(() => {
    map.whenReady(() => setView((v) => v + 1));
  }, [map]);

  const heat = useMemo(() => (view >= 0 ? buildHeatImage(map, points) : null), [map, points, view]);
  if (!heat) return null;
  return <ImageOverlay url={heat.url} bounds={heat.bounds} opacity={1} interactive={false} />;
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
  const handleBounds = useCallback((box: string) => {
    setBbox(box);
  }, []);
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

  const pit = panel?.point;
  const pitDue = panel?.detail?.planned_due_at ?? pit?.planned_due_at ?? null;

  const toggleClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer text-xs font-bold ${
      active ? 'bg-red-700 text-white shadow-sm' : 'text-neutral-800 hover:bg-white'
    }`;

  return (
    <div className="flex-1 flex flex-col h-full relative overflow-y-auto lg:overflow-hidden bg-neutral-100 text-neutral-800 antialiased">
      {/* Макет «Веб/Карта»: статусы → фильтры → «Сбросить» → переключатели слоёв, каждое с новой строки */}
      <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-3 z-10 flex flex-col gap-3 shrink-0">
        <div className="flex">
          <div className="bg-neutral-100 rounded-full px-3 py-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs border border-neutral-200">
            <span className="font-bold text-neutral-800 mr-1">Статусы:</span>
            {statusList.map((st) => (
              <button
                key={st.code}
                onClick={() => setFilter('status', st.code)}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full transition-colors cursor-pointer text-xs font-normal ${
                  filters.status === st.code
                    ? 'bg-white border border-neutral-800 text-neutral-900'
                    : 'border border-transparent text-neutral-700 hover:text-black'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }}></span>
                <span>{st.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <SelectBox ariaLabel="Район" className="h-9 min-w-[130px]" value={filters.districtId} onChange={(v) => setFilter('districtId', v)}>
            <option value="Все">Район</option>
            {districts.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.name}
              </option>
            ))}
          </SelectBox>

          <SelectBox
            ariaLabel="Группа улиц"
            className="h-9 min-w-[130px]"
            value={filters.streetGroup}
            onChange={(v) => setFilter('streetGroup', v as Filters['streetGroup'])}
          >
            <option value="Все">Группа улиц</option>
            {streetGroups.map((g) => (
              <option key={g.code} value={g.code}>
                Категория {g.code}
              </option>
            ))}
          </SelectBox>

          <SelectBox
            ariaLabel="Класс дефекта"
            className="h-9 min-w-[130px]"
            value={filters.defectClass}
            onChange={(v) => setFilter('defectClass', v as Filters['defectClass'])}
          >
            <option value="Все">Класс дефекта</option>
            <option value="big">Большая</option>
            <option value="small">Маленькая</option>
          </SelectBox>

          <SelectBox ariaLabel="Подрядчик" className="h-9 min-w-[130px]" value={filters.contractorId} onChange={(v) => setFilter('contractorId', v)}>
            <option value="Все">Подрядчик</option>
            {contractors.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </SelectBox>

          <SelectBox ariaLabel="Период" className="h-9 min-w-[130px]" value={filters.period} onChange={(v) => setFilter('period', v)}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </SelectBox>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="h-8 px-3 rounded-lg bg-neutral-400 hover:bg-neutral-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Icon name="reload" className="h-3.5 w-3.5" />
            <span>Сбросить</span>
          </button>
          {isLoading && <Spinner className="w-4 h-4 animate-spin text-red-700" />}
          {result?.error && <span className="text-xs text-red-700">{result.error}</span>}
        </div>

        <div className="flex">
          <div className="bg-neutral-100 p-1 rounded-xl border border-neutral-200 flex items-center gap-1">
            <button onClick={() => setShowHeatmap(!showHeatmap)} className={toggleClass(showHeatmap)}>
              <Icon name="map-heat" className={`h-3.5 w-3.5 ${showHeatmap ? 'text-white' : 'text-red-700'}`} />
              <span>Тепловая карта</span>
              {showHeatmap && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </button>
            <button onClick={() => setShowMarkers(!showMarkers)} className={toggleClass(showMarkers)}>
              <Icon name="map-markers" className={`h-3.5 w-3.5 ${showMarkers ? 'text-white' : 'text-red-700'}`} />
              <span>Маркеры</span>
            </button>
            <button onClick={() => setShowZones(!showZones)} className={toggleClass(showZones)}>
              <Icon name="map-zones" className={`h-3.5 w-3.5 ${showZones ? 'text-white' : 'text-red-700'}`} />
              <span>Зоны подрядчиков</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full h-full min-h-[420px] relative z-0">
        <MapContainer center={[56.495, 84.975]} zoom={13} className="w-full h-full" attributionControl={false}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <BoundsWatcher onChange={handleBounds} />
          {showHeatmap && <HeatSurface points={points} />}
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
          <div className="absolute bottom-3 left-3 sm:bottom-6 sm:left-6 z-[1000] bg-white rounded-2xl p-4 shadow-lg border border-neutral-200 w-64 max-w-[calc(100%-1.5rem)]">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-800 mb-1.5">
              <div className="flex items-center gap-1.5">
                <Icon name="legend-flame" className="h-[13px] w-[11px] text-orange-500" />
                <span>Зоны концентрации заявок</span>
              </div>
              <span className="text-xs text-neutral-400 font-normal">Слой включён</span>
            </div>
            <div
              className="w-full h-2 rounded-full mb-1"
              style={{ background: 'linear-gradient(to right, #60C85A, #F2B705, #F08A24, #D93025)' }}
            ></div>
            <div className="flex justify-between text-xs text-neutral-400 font-medium">
              <span>Низкая</span>
              <span>Средняя</span>
              <span>Высокая</span>
            </div>
          </div>
        )}

        {panel && pit && (
          <div className="absolute top-4 right-4 left-4 sm:left-auto z-[1000] sm:w-96 max-h-[calc(100%-2rem)] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-neutral-200 p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold px-2.5 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: STATUS_COLOR[pit.status] || '#212121' }}
                >
                  {panel.detail?.status.label ?? statusLabel(pit.status)}
                </span>
                <span className="text-sm font-bold text-neutral-800">ID {pit.id}</span>
              </div>
              <button
                onClick={() => setPanel(null)}
                aria-label="Закрыть"
                className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-black cursor-pointer"
              >
                <Icon name="close" className="h-5 w-5" />
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
              <div className="w-full h-44 rounded-2xl bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center text-neutral-400">
                <CameraIcon className="w-8 h-8 mb-1" />
                <span className="text-xs font-bold uppercase tracking-wider text-center">Фото не загружено</span>
              </div>
            )}

            <div>
              <div className="text-xs font-light text-neutral-600">Класс дефекта</div>
              <div className="text-lg font-bold text-neutral-900">{DEFECT_CLASS_LABEL[pit.defect_class]} яма</div>
            </div>

            {/* Единый серый блок: адрес, группа улицы, плановая дата */}
            <div className="rounded-xl bg-neutral-100 p-3 flex flex-col gap-3">
              <div className="flex items-start gap-2.5 text-xs">
                <Icon name="pin-address" className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-light text-neutral-600">Адрес дефекта</div>
                  <div className="font-bold text-neutral-800">{pit.address || '—'}</div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs">
                <Icon name="group-street" className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                <div>
                  <div className="font-light text-neutral-600">Группа улицы</div>
                  <div className="font-bold text-neutral-800">
                    {pit.street_group ? `Категория ${pit.street_group}` : '—'}
                    {pit.district ? ` · ${pit.district.name}` : ''}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs">
                <Icon name="clock-planned" className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-light text-neutral-600">Плановая дата устранения</div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="font-bold text-neutral-800">{formatDateTime(pitDue)}</span>
                    {pitDue && (
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${
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

            <div className="rounded-xl bg-neutral-100 p-3">
              <div className="text-xs font-light text-neutral-600">Назначенный подрядчик</div>
              <div className="text-sm font-bold text-neutral-900 mt-0.5">{pit.contractor?.name ?? 'Не назначен'}</div>
            </div>

            <div className="border-t border-neutral-200 pt-3">
              <button
                onClick={() => onNavigateToRequest?.(pit.id)}
                className="w-full h-11 bg-red-700 hover:bg-red-800 active:bg-red-900 text-white text-sm font-bold rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Открыть полную карточку заявки
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
