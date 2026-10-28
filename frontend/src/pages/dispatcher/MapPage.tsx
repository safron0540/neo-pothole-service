import { useState, useMemo, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, GeoJSON, Tooltip, AttributionControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Layer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../../api';
import type {
  DefectClass,
  DispatcherRequestOut,
  HeatDetail,
  HeatFeature,
  HeatLevel,
  HeatmapOut,
  MapPoint,
  StatusCode,
  StreetGroupCode,
} from '../../api';
import {
  DEFECT_CLASS_LABEL,
  STATUS_CODES,
  STATUS_COLOR,
  STATUS_LABEL,
  contractorColor,
  statusLabel,
} from '../../data/reference';
import { useReference } from '../../data/useReference';
import { MAP_ATTRIBUTION, MAP_TILE_URL } from '../../data/mapTiles';
import { SelectBox } from '../../components/SelectBox';
import { Icon } from '../../components/Icon';
import { MapZoom } from '../../components/MapZoom';
import { formatDateTime, remainingInfo } from '../../utils/format';
import { CameraIcon, Spinner } from '../../components/UiIcons';
const PERIODS: { value: string; label: string; days?: number }[] = [
  { value: 'Все', label: 'Период' },
  { value: 'week', label: 'За неделю', days: 7 },
  { value: 'month', label: 'За месяц', days: 30 },
  { value: 'quarter', label: 'За квартал', days: 90 },
];

// Маркер растёт с приближением. Белая кайма и тёмное кольцо вокруг — чтобы точка была
// видна на любой подложке, в том числе серая «На проверке» и зелёная «Выполнено»
const markerSize = (zoom: number) =>
  zoom <= 12 ? 13 : zoom <= 13 ? 15 : zoom <= 15 ? 17 : zoom <= 17 ? 21 : 25;

const createColorMarker = (color: string, size = 18) =>
  L.divIcon({
    className: 'custom-map-pin',
    html: `<div style="background-color:${color};width:${size}px;height:${size}px;border-radius:50%;border:${size > 15 ? 3 : 2}px solid white;box-shadow:0 0 0 1.5px rgba(0,0,0,0.55),0 2px 6px rgba(0,0,0,0.35);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

interface Filters {
  status: StatusCode[]; // пусто — все статусы; можно выбрать несколько
  districtId: string;
  streetGroup: StreetGroupCode | 'Все';
  defectClass: DefectClass | 'Все';
  contractorId: string;
  period: string;
}

const DEFAULT_FILTERS: Filters = {
  status: [],
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

// Видимая область карты → bbox «запад,юг,восток,север» (формат Leaflet, как ждёт контракт) и zoom
interface View {
  bbox: string;
  zoom: number;
}

function BoundsWatcher({ onChange }: { onChange: (view: View) => void }) {
  const map = useMapEvents({
    moveend: () => onChange({ bbox: map.getBounds().toBBoxString(), zoom: map.getZoom() }),
  });
  useEffect(() => {
    map.whenReady(() => onChange({ bbox: map.getBounds().toBBoxString(), zoom: map.getZoom() }));
  }, [map, onChange]);
  return null;
}

// ---------- Тепловая карта по дорогам ----------
// Бэкенд режет дорогу на короткие кусочки и считает у каждого «ям на 100 м» с плавным
// затуханием от ямы. Цвет — непрерывный по этому числу (пороги уровней 2 / 4 / 7 те же,
// что у бэкенда), слабое тепло полупрозрачное: линия сходит на нет, а не обрывается.
const HEAT_STOPS: [number, [number, number, number]][] = [
  [0, [253, 230, 138]], // бледно-жёлтый
  [1, [242, 183, 5]], // жёлтый
  [2, [240, 138, 36]], // оранжевый
  [4, [217, 48, 37]], // красный
  [7, [127, 29, 29]], // тёмно-красный
];

const heatColor = (value: number) => {
  const v = Math.max(0, value);
  const upper = HEAT_STOPS.findIndex(([bound]) => v <= bound);
  if (upper === -1) return 'rgb(127, 29, 29)';
  if (upper === 0) return 'rgb(253, 230, 138)';
  const [b0, c0] = HEAT_STOPS[upper - 1];
  const [b1, c1] = HEAT_STOPS[upper];
  const t = (v - b0) / (b1 - b0);
  const mix = c0.map((c, i) => Math.round(c + (c1[i] - c) * t));
  return `rgb(${mix.join(', ')})`;
};
const heatOpacity = (value: number) => 0.35 + 0.6 * Math.min(value / 2.5, 1);

const HEAT_GRADIENT = `linear-gradient(to right, ${[0, 1, 2, 3, 4, 5.5, 7].map(heatColor).join(', ')})`;
const LEVEL_LABEL: Record<HeatLevel, string> = {
  low: 'мало ям',
  medium: 'заметно',
  high: 'много',
  critical: 'очень много',
};
const DETAIL_LABEL: Record<HeatDetail, string> = {
  street: 'улицы целиком',
  piece: 'отрезки улиц',
  segment: 'участки по 100 м',
};
// Толщина линии растёт с приближением: издалека тонкие улицы, вблизи — широкие участки
const lineWeight = (zoom: number) => (zoom <= 12 ? 4 : zoom <= 15 ? 6 : 10);

type GeoData = React.ComponentProps<typeof GeoJSON>['data'];

function RoadHeatLayer({ heat, zoom }: { heat: HeatmapOut; zoom: number }) {
  const style = (feature?: { properties?: HeatFeature['properties'] }) => {
    const value = feature?.properties?.per_100m ?? 0;
    return {
      color: heatColor(value),
      weight: lineWeight(zoom),
      opacity: heatOpacity(value),
      lineCap: 'round' as const,
      lineJoin: 'round' as const,
    };
  };
  const onEachFeature = (feature: { properties: HeatFeature['properties'] }, layer: Layer) => {
    const p = feature.properties;
    layer.bindTooltip(
      `<b>${p.street}</b><br/>${LEVEL_LABEL[p.level]}: ≈ ${p.per_100m} ям на 100 м<br/>рядом ям: ${p.count}`,
      { sticky: true }
    );
  };
  // react-leaflet не перерисовывает GeoJSON при смене data — меняем key
  const key = `${heat.detail}-${zoom}-${heat.features.length}-${heat.features.map((f) => f.properties.count).join('.')}`;
  return (
    <GeoJSON
      key={key}
      data={heat as unknown as GeoData}
      style={style as never}
      onEachFeature={onEachFeature as never}
    />
  );
}

// ---------- Группировка маркеров при отдалении ----------
// Точки, попавшие в одну клетку экрана, рисуются одним кружком с числом. Клетка мельчает
// с приближением, поэтому кружки распадаются постепенно. На самом крупном масштабе ямы
// в одном месте (например, дубликаты) раскладываются по кругу, чтобы не прятаться друг под другом.
const MAX_ZOOM = 19;
const clusterCell = (zoom: number) => (zoom <= 15 ? 56 : zoom <= 17 ? 36 : 24);

const clusterIcon = (count: number, color: string) => {
  const size = count < 10 ? 28 : count < 100 ? 36 : 44;
  return L.divIcon({
    className: 'map-cluster',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:3px solid rgba(255,255,255,0.85);box-shadow:0 2px 8px rgba(0,0,0,0.35);">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

function ClusteredMarkers({
  points,
  zoom,
  onOpen,
}: {
  points: MapPoint[];
  zoom: number;
  onOpen: (point: MapPoint) => void;
}) {
  const map = useMap();
  const size = markerSize(zoom);
  // Группы считаются по расстоянию на экране, а не по клеткам сетки: соседние точки
  // из разных клеток иначе перекрывают друг друга и на них не нажать.
  const groups = useMemo(() => {
    const items = points.map((p) => ({ p, xy: map.project([p.lat, p.lon], zoom) }));
    if (zoom >= MAX_ZOOM) {
      // Максимальное приближение: в одну группу — все, кто перекрывается хотя бы с одним
      // соседом (цепочкой), потом группа раскладывается по кругу
      const reach = size + 4;
      const parent = items.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      const grid = new Map<string, number[]>();
      const cellOf = (x: number, y: number) => `${Math.floor(x / reach)}:${Math.floor(y / reach)}`;
      items.forEach(({ xy }, i) => {
        const cx = Math.floor(xy.x / reach);
        const cy = Math.floor(xy.y / reach);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (const j of grid.get(`${cx + dx}:${cy + dy}`) ?? []) {
              if (items[j].xy.distanceTo(xy) < reach) parent[find(i)] = find(j);
            }
          }
        }
        const key = cellOf(xy.x, xy.y);
        grid.set(key, [...(grid.get(key) ?? []), i]);
      });
      const byRoot = new Map<number, MapPoint[]>();
      items.forEach(({ p }, i) => byRoot.set(find(i), [...(byRoot.get(find(i)) ?? []), p]));
      return [...byRoot.values()];
    }
    // Отдаление: точка присоединяется к ближайшей группе в радиусе клетки (без цепочек,
    // иначе вся улица с ямами через каждые 30 м слиплась бы в один кружок)
    const reach = clusterCell(zoom);
    const clusters: { x: number; y: number; items: MapPoint[] }[] = [];
    items.forEach(({ p, xy }) => {
      let best: (typeof clusters)[number] | null = null;
      let bestDistance = reach;
      for (const c of clusters) {
        const d = Math.hypot(c.x - xy.x, c.y - xy.y);
        if (d < bestDistance) {
          best = c;
          bestDistance = d;
        }
      }
      if (best) {
        const n = best.items.length;
        best.x = (best.x * n + xy.x) / (n + 1);
        best.y = (best.y * n + xy.y) / (n + 1);
        best.items.push(p);
      } else {
        clusters.push({ x: xy.x, y: xy.y, items: [p] });
      }
    });
    return clusters.map((c) => c.items);
  }, [points, zoom, map, size]);

  const single = (p: MapPoint, position: [number, number] = [p.lat, p.lon]) => (
    <Marker
      key={p.id}
      position={position}
      icon={createColorMarker(STATUS_COLOR[p.status] || '#9E9E9E', size)}
      eventHandlers={{ click: () => onOpen(p) }}
    />
  );

  // Перекрывающиеся ямы на максимальном приближении — по кругу вокруг их общего центра.
  // Радиус такой, чтобы маркеры стояли с зазором; в центре — точка настоящего места.
  const spread = (items: MapPoint[]) => {
    const pixels = items.map((p) => map.project([p.lat, p.lon], zoom));
    const center = pixels
      .reduce((sum, xy) => sum.add(xy), L.point(0, 0))
      .divideBy(items.length);
    const radius = Math.max(size + 6, (items.length * (size + 8)) / (2 * Math.PI));
    const hub = map.unproject(center, zoom);
    return [
      <Marker
        key={`hub-${items[0].id}`}
        position={[hub.lat, hub.lng]}
        interactive={false}
        icon={L.divIcon({
          className: 'map-spread-hub',
          html: `<div style="width:${radius * 2}px;height:${radius * 2}px;border-radius:50%;border:1.5px dashed rgba(33,33,33,0.35);background:rgba(255,255,255,0.35);"></div>`,
          iconSize: [radius * 2, radius * 2],
          iconAnchor: [radius, radius],
        })}
      />,
      ...items.map((p, i) => {
        const angle = (2 * Math.PI * i) / items.length - Math.PI / 2;
        const at = map.unproject(center.add([radius * Math.cos(angle), radius * Math.sin(angle)]), zoom);
        return single(p, [at.lat, at.lng]);
      }),
    ];
  };

  return (
    <>
      {groups.map((items) => {
        if (items.length === 1) return single(items[0]);
        if (zoom >= MAX_ZOOM) return spread(items);
        const lat = items.reduce((sum, p) => sum + p.lat, 0) / items.length;
        const lon = items.reduce((sum, p) => sum + p.lon, 0) / items.length;
        // Если внутри есть просроченная заявка — кружок красный, иначе тёмный
        const color = items.some((p) => p.is_overdue) ? '#D93025' : '#212121';
        return (
          <Marker
            key={`c-${items[0].id}-${items.length}`}
            position={[lat, lon]}
            icon={clusterIcon(items.length, color)}
            eventHandlers={{
              click: () =>
                map.fitBounds(L.latLngBounds(items.map((p) => [p.lat, p.lon] as [number, number])).pad(0.3), {
                  maxZoom: MAX_ZOOM,
                }),
            }}
          >
            <Tooltip>{`Заявок: ${items.length}`}</Tooltip>
          </Marker>
        );
      })}
    </>
  );
}

// Карточка точки: данные маркера + полная карточка с сервера (фото)
interface Panel {
  point: MapPoint;
  detail: DispatcherRequestOut | null;
}

type ZoneData = GeoData;

export default function MapPage({ onNavigateToRequest }: { onNavigateToRequest?: (id: number) => void }) {
  const { districts, streetGroups, contractors } = useReference();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const [view, setView] = useState<View | null>(null);
  const bbox = view?.bbox ?? null;
  const zoom = view?.zoom ?? 13;
  const onView = useCallback((next: View) => setView(next), []);
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
        status: filters.status.length ? filters.status : undefined,
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
  const activeFilters = (Object.keys(DEFAULT_FILTERS) as (keyof Filters)[]).filter(
    (key) => JSON.stringify(filters[key]) !== JSON.stringify(DEFAULT_FILTERS[key])
  ).length;

  // Статусы выбираются по одному кликом: включить, повторный клик — выключить
  const toggleStatus = (code: StatusCode | 'Все') =>
    setFilters((prev) => {
      // Только известные коды: старое значение (строка) не должно попасть в запрос
      const current = Array.isArray(prev.status) ? prev.status.filter((c) => STATUS_CODES.includes(c)) : [];
      return {
        ...prev,
        status: code === 'Все' ? [] : current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
      };
    });
  const points = result?.points ?? [];

  // Тепловая карта: те же фильтры, плюс zoom — от него зависит детальность линий
  const [heat, setHeat] = useState<HeatmapOut | null>(null);
  useEffect(() => {
    if (bbox === null || !showHeatmap) return;
    let cancelled = false;
    api
      .getHeatmap({
        bbox,
        zoom,
        status: filters.status.length ? filters.status : undefined,
        district_id: filters.districtId === 'Все' ? undefined : Number(filters.districtId),
        street_group: filters.streetGroup === 'Все' ? undefined : filters.streetGroup,
        defect_class: filters.defectClass === 'Все' ? undefined : filters.defectClass,
        contractor_id: filters.contractorId === 'Все' ? undefined : Number(filters.contractorId),
        detected_from: detectedFrom(filters.period),
      })
      .then((data) => {
        if (!cancelled) setHeat(data);
      })
      .catch(() => {
        if (!cancelled) setHeat(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bbox, zoom, filters, showHeatmap]);


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
      {/* Шапка карты: статусы и «Заявок на карте» — первой строкой, фильтры и «Сбросить» — второй */}
      <div className="bg-white border-b border-neutral-200 px-4 sm:px-6 py-3 z-10 flex flex-col gap-2.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="bg-neutral-100 rounded-full px-3 py-1 flex flex-wrap items-center gap-x-1 gap-y-1 text-xs border border-neutral-200">
            <span className="font-bold text-neutral-800 mr-1">Статусы:</span>
            {statusList.map((st) => {
              const on = st.code === 'Все' ? filters.status.length === 0 : filters.status.includes(st.code);
              return (
                <button
                  key={st.code}
                  onClick={() => toggleStatus(st.code)}
                  aria-pressed={on}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full transition-colors cursor-pointer text-xs font-normal ${
                    on
                      ? 'bg-white border border-neutral-800 text-neutral-900'
                      : 'border border-transparent text-neutral-700 hover:text-black'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.color }}></span>
                  <span>{st.label}</span>
                </button>
              );
            })}
            {filters.status.length > 1 && (
              <span className="text-neutral-500 ml-1">выбрано: {filters.status.length}</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isLoading && <Spinner className="w-4 h-4 animate-spin text-red-700" />}
            <span className="text-sm text-neutral-500">Заявок на карте</span>
            <span className="min-w-12 h-9 px-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-lg font-bold flex items-center justify-center">
              {points.length}
            </span>
          </div>
        </div>
        {result?.error && <div className="text-xs text-red-700">Не удалось загрузить заявки: {result.error}</div>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <SelectBox ariaLabel="Район" className="h-9" arrow="chevron" fieldClassName="!rounded-lg !py-0 !border-neutral-300" value={filters.districtId} onChange={(v) => setFilter('districtId', v)}>
              <option value="Все">Район</option>
              {districts.map((d) => (
                <option key={d.id} value={String(d.id)}>
                  {d.name}
                </option>
              ))}
            </SelectBox>

            <SelectBox
              ariaLabel="Группа улиц"
              className="h-9" arrow="chevron" fieldClassName="!rounded-lg !py-0 !border-neutral-300"
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
              className="h-9" arrow="chevron" fieldClassName="!rounded-lg !py-0 !border-neutral-300"
              value={filters.defectClass}
              onChange={(v) => setFilter('defectClass', v as Filters['defectClass'])}
            >
              <option value="Все">Класс дефекта</option>
              <option value="big">Большая</option>
              <option value="small">Маленькая</option>
            </SelectBox>

            <SelectBox ariaLabel="Подрядчик" className="h-9" arrow="chevron" fieldClassName="!rounded-lg !py-0 !border-neutral-300" value={filters.contractorId} onChange={(v) => setFilter('contractorId', v)}>
              <option value="Все">Подрядчик</option>
              {contractors.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </SelectBox>

            <SelectBox ariaLabel="Период" className="h-9" arrow="chevron" fieldClassName="!rounded-lg !py-0 !border-neutral-300" value={filters.period} onChange={(v) => setFilter('period', v)}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </SelectBox>
          </div>

          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            disabled={activeFilters === 0}
            className="h-9 px-3 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-100 text-neutral-700 text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default disabled:hover:bg-white"
          >
            <Icon name="reload" className="h-3.5 w-3.5" />
            <span>Сбросить фильтры{activeFilters > 0 ? ` (${activeFilters})` : ''}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 w-full h-full min-h-[420px] relative z-0">
        {/* Слои — прямо на карте, в одну линию сверху слева */}
        <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm p-1 rounded-xl border border-neutral-200 shadow-[0_4px_14px_rgba(0,0,0,0.18)] flex flex-wrap items-center gap-1 max-w-[calc(100%-1.5rem)]">
          <button onClick={() => setShowHeatmap(!showHeatmap)} className={toggleClass(showHeatmap)}>
            <Icon name="map-heat" className={`h-3.5 w-3.5 ${showHeatmap ? 'text-white' : 'text-red-700'}`} />
            <span>Тепловая карта</span>
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

        <MapContainer
          center={[56.495, 84.975]}
          zoom={13}
          maxZoom={MAX_ZOOM}
          zoomControl={false}
          className="w-full h-full"
          attributionControl={false}
        >
          <TileLayer url={MAP_TILE_URL} attribution={MAP_ATTRIBUTION} maxZoom={MAX_ZOOM} />
          <MapZoom />
          <AttributionControl prefix={false} position="bottomright" />
          <BoundsWatcher onChange={onView} />
          {showHeatmap && heat && <RoadHeatLayer heat={heat} zoom={zoom} />}
          {showMarkers && <ClusteredMarkers points={points} zoom={zoom} onOpen={openPit} />}
          {/* zone — GeoJSON MultiPolygon [долгота, широта]; Leaflet сам разбирает порядок координат */}
          {showZones &&
            visibleZones.map((c) => (
              <GeoJSON
                key={`${c.id}-${c.zone ? c.zone.coordinates.length : 0}`}
                data={c.zone as unknown as ZoneData}
                style={{ color: contractorColor(c.id), fillOpacity: 0.15, weight: 2 }}
              />
            ))}
        </MapContainer>

        <div className="absolute bottom-3 left-3 sm:bottom-6 sm:left-6 z-[1000] flex flex-col gap-3 w-64 max-w-[calc(100%-1.5rem)]">
          {showZones && visibleZones.length > 0 && (
            <div className="bg-white rounded-2xl p-4 shadow-lg border border-neutral-200">
              <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-800 mb-2">
                <Icon name="map-zones" className="h-3.5 w-3.5 text-red-700" />
                <span>Зоны подрядчиков</span>
              </div>
              <ul className="space-y-1.5">
                {visibleZones.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-xs text-neutral-700">
                    <span
                      className="w-4 h-4 rounded-md shrink-0 border-2"
                      style={{ borderColor: contractorColor(c.id), backgroundColor: `${contractorColor(c.id)}33` }}
                    />
                    <span className="truncate">{c.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showHeatmap && (
            <div className="bg-white rounded-2xl p-4 shadow-lg border border-neutral-200">
              <div className="flex items-center justify-between text-xs font-bold text-neutral-800 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon name="legend-flame" className="h-[13px] w-[11px] text-orange-500" />
                  <span>Ямы на дорогах</span>
                </div>
                <span className="text-xs text-neutral-400 font-normal">на 100 м</span>
              </div>
              <div className="w-full h-2 rounded-full" style={{ background: HEAT_GRADIENT }}></div>
              <div className="relative h-4 text-xs text-neutral-400 font-medium mt-0.5">
                {[0, 2, 4, 7].map((v) => (
                  <span key={v} className="absolute -translate-x-1/2" style={{ left: `${(v / 7) * 100}%` }}>
                    {v === 7 ? '7+' : v}
                  </span>
                ))}
              </div>
              <div className="text-xs text-neutral-400 mt-1">
                Показаны: {heat ? DETAIL_LABEL[heat.detail] : '—'}
                {heat && heat.outside_streets > 0 && <> · вне улиц: {heat.outside_streets}</>}
              </div>
            </div>
          )}
        </div>

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
                className="w-full h-44 rounded-2xl object-contain border border-neutral-200 bg-neutral-100"
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
                        className={`text-xs font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${
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
