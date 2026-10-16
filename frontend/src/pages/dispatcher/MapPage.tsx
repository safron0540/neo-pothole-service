import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RotateCcw, Flame, MapPin, Layers, Map as MapIcon, Clock, X, Camera } from 'lucide-react';
import { Header } from '../../components/Header';

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

const createColorMarker = (color: string) =>
  L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="
        background-color: ${color};
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

const DEMO_PITS = [
  {
    id: 'ID 2109026',
    lat: 56.495,
    lng: 84.975,
    address: 'г. Томск, 79 Гвардейской дивизии, 14',
    status: 'В работе',
    defectClass: 'Большая яма',
    streetCategory: 'Магистральная улица (Категория А)',
    contractor: 'ООО «ДорСтрой-Лидер»',
    plannedDate: '17 мая 2024, 14:00',
    deadline: 'Осталось 5 ч',
    dimensions: '1.4 × 0.8 м',
    intensity: 0.9,
  },
  {
    id: 'ID 200292026',
    lat: 56.467,
    lng: 84.952,
    address: 'г. Томск, ул. Ленина, 15',
    status: 'На проверке',
    defectClass: 'Большая яма',
    streetCategory: 'Категория А',
    contractor: 'ООО «ДорСтрой-Лидер»',
    plannedDate: '18 мая 2024, 12:00',
    deadline: 'Осталось 24 ч',
    dimensions: '2.1 × 1.2 м',
    intensity: 0.8,
  },
];

const CONTRACTOR_ZONES = [
  {
    name: 'ООО «ДорСтрой-Лидер»',
    color: '#2563EB',
    coords: [
      [56.455, 84.940],
      [56.470, 84.940],
      [56.470, 84.970],
      [56.455, 84.970],
    ] as [number, number][],
  },
];

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

export default function MapPage({ onNavigateToRequest }: { onNavigateToRequest?: (id: string) => void }) {
  const [selectedPit, setSelectedPit] = useState<typeof DEMO_PITS[0] | null>(DEMO_PITS[0]);
  const [selectedStatus, setSelectedStatus] = useState<string>('В работе');
  const [district, setDistrict] = useState<string>('Все');
  const [streetGroup, setStreetGroup] = useState<string>('Все');
  const [defectClass, setDefectClass] = useState<string>('Все');
  const [contractor, setContractor] = useState<string>('Все');
  const [period, setPeriod] = useState<string>('Все');

  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [showZones, setShowZones] = useState(false);

  const heatPoints = useMemo<[number, number, number][]>(() => {
    return DEMO_PITS.map((p) => [p.lat, p.lng, p.intensity]);
  }, []);

  const filteredPits = useMemo(() => {
    return DEMO_PITS.filter((pit) => {
      if (selectedStatus !== 'Все' && pit.status !== selectedStatus) return false;
      return true;
    });
  }, [selectedStatus]);

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
      <Header />

      <div className="bg-white/95 backdrop-blur-sm border-b border-neutral-200 px-6 py-3 z-10 flex flex-col gap-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-neutral-100 rounded-full px-3 py-1 flex items-center gap-3 text-xs border border-neutral-200">
            <span className="font-semibold text-neutral-600">Статусы:</span>
            {statusList.map((st) => (
              <button
                key={st.label}
                onClick={() => setSelectedStatus(st.label)}
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full transition-all cursor-pointer ${
                  selectedStatus === st.label
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
            <select value={district} onChange={(e) => setDistrict(e.target.value)} className="h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none">
              <option value="Все">Район</option>
              <option value="Кировский">Кировский</option>
              <option value="Советский">Советский</option>
            </select>

            <select value={streetGroup} onChange={(e) => setStreetGroup(e.target.value)} className="h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none">
              <option value="Все">Группа улиц</option>
              <option value="А">Категория А</option>
            </select>

            <select value={defectClass} onChange={(e) => setDefectClass(e.target.value)} className="h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none">
              <option value="Все">Класс дефекта</option>
              <option value="Большая">Большая</option>
            </select>

            <select value={contractor} onChange={(e) => setContractor(e.target.value)} className="h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none">
              <option value="Все">Подрядчик</option>
              <option value="ООО «ДорСтрой-Лидер»">ООО «ДорСтрой-Лидер»</option>
            </select>

            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-8 px-3 bg-white border border-neutral-300 rounded-lg outline-none">
              <option value="Все">Период</option>
              <option value="month">За месяц</option>
            </select>

            <button
              onClick={() => { setSelectedStatus('Все'); setDefectClass('Все'); }}
              className="h-8 px-3 rounded-lg bg-neutral-400 hover:bg-neutral-500 text-white font-medium flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Сбросить</span>
            </button>
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
                position={[pit.lat, pit.lng]}
                icon={createColorMarker(STATUS_COLORS[pit.status] || '#000')}
                eventHandlers={{ click: () => setSelectedPit(pit) }}
              />
            ))}
          {showZones &&
            CONTRACTOR_ZONES.map((zone, idx) => (
              <Polygon key={idx} positions={zone.coords} pathOptions={{ color: zone.color, fillOpacity: 0.15, weight: 2 }} />
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
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-yellow-400 text-neutral-900">
                    {selectedPit.status}
                  </span>
                  <span className="text-sm font-bold text-neutral-800">{selectedPit.id}</span>
                </div>
                <button onClick={() => setSelectedPit(null)} className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-black cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="relative w-full h-44 rounded-2xl bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center text-neutral-400">
                <Camera className="w-8 h-8 mb-1" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-center">
                  ФОТО ВРЕМЕННО<br />ОТСУТСТВУЕТ
                </span>
                <span className="absolute bottom-2.5 left-2.5 bg-neutral-900/80 text-white text-[10px] px-2.5 py-1 rounded-lg">
                  Фотофиксация дефекта
                </span>
                <span className="absolute top-2.5 right-2.5 bg-red-700 text-white text-[11px] font-bold px-2 py-0.5 rounded-lg">
                  {selectedPit.dimensions}
                </span>
              </div>

              <div>
                <div className="text-xs text-neutral-400 font-medium">Класс дефекта</div>
                <div className="text-base font-bold text-neutral-900">{selectedPit.defectClass}</div>
              </div>

              <div className="space-y-2.5 pt-1">
                <div className="flex items-start gap-2.5 text-xs">
                  <MapPin className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-neutral-400">Адрес дефекта</div>
                    <div className="font-semibold text-neutral-800">{selectedPit.address}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-xs">
                  <MapIcon className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-neutral-400">Группа улицы</div>
                    <div className="font-semibold text-neutral-800">{selectedPit.streetCategory}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-xs">
                  <Clock className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-neutral-400">Плановая дата устранения</div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="font-semibold text-neutral-800">{selectedPit.plannedDate}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-yellow-100 text-yellow-800">
                        {selectedPit.deadline}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-neutral-50 rounded-2xl p-3 border border-neutral-100">
                <div className="text-[11px] text-neutral-400 font-medium">Назначенный подрядчик</div>
                <div className="text-xs font-bold text-neutral-900 mt-0.5">{selectedPit.contractor}</div>
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