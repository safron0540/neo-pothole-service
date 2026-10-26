import { useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Check, X, MousePointer } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { formatDate, formatDayTime } from '../../utils/format';

type CategoryKey = 'AB' | 'V' | 'G' | 'DE';

interface PlannedProposal {
  id: string;
  proposalId: string;
  street: string;
  district: string;
  coords: string;
  center: [number, number];
  segmentCoords: [number, number][];
  group: string;
  categoryKey: CategoryKey;
  actualPits: number;
  limitPits: number;
  createdAt: string; // ISO: по нему сортируем, от новых к старым
}

// Нормы ям на 100 м по группам улиц (демо-значения)
const LIMIT_BY_GROUP: Record<string, number> = { А: 2, Б: 4, В: 10, Г: 16, Д: 20, Е: 24 };
const GROUP_CATEGORY: Record<string, CategoryKey> = { А: 'AB', Б: 'AB', В: 'V', Г: 'G', Д: 'DE', Е: 'DE' };

// улица, район, группа, фактически ям на 100 м, сколько часов назад предложен
const SEED: [string, string, string, number, number][] = [
  ['ул. Вершинина, 36', 'Кировский район (нечетная сторона)', 'А', 5, 2.5],
  ['Чехова, 35', 'Ленинский район', 'В', 14, 3.8],
  ['Пр. Ленина, 1', 'Кировский район', 'Г', 22, 15],
  ['ул. Красноармейская, 48', 'Кировский район', 'А', 6, 19],
  ['ул. Нахимова, 13', 'Октябрьский район', 'В', 13, 26],
  ['ул. Лесная, 12', 'Кировский район', 'Г', 21, 30],
  ['пр. Фрунзе, 96', 'Ленинский район', 'Б', 9, 41],
  ['ул. Лебедева, 39', 'Советский район', 'В', 15, 47],
  ['ул. Садовая, 7', 'Октябрьский район', 'Д', 27, 52],
  ['ул. Мичурина, 4', 'Октябрьский район', 'Г', 23, 58],
  ['ул. Учебная, 8', 'Ленинский район', 'В', 12, 66],
  ['ул. 79 Гвардейской дивизии, 14', 'Советский район', 'Б', 8, 73],
  ['ул. Партизанская, 33', 'Советский район', 'Г', 20, 80],
  ['ул. Сибирская, 20', 'Томск, центр', 'В', 17, 91],
  ['Береговая, 2', 'Кировский район', 'Е', 31, 99],
  ['ул. Енисейская, 7', 'Октябрьский район', 'Г', 24, 110],
  ['ул. Говорова, 15', 'Советский район', 'В', 16, 122],
  ['ул. Заводская, 10', 'Октябрьский район', 'Д', 29, 135],
];

const HOUR = 36e5;
const MOCK_PROPOSALS: PlannedProposal[] = SEED.map(([street, district, group, actualPits, hoursAgo], i) => {
  const lat = 56.44 + (i % 6) * 0.01;
  const lon = 84.93 + Math.floor(i / 6) * 0.03 + (i % 3) * 0.005;
  return {
    id: `prop-${i + 1}`,
    proposalId: String(19203645 + i),
    street,
    district,
    coords: `${lat.toFixed(4)}° N, ${lon.toFixed(4)}° E`,
    center: [lat, lon],
    segmentCoords: [
      [lat - 0.0004, lon - 0.0006],
      [lat + 0.0004, lon + 0.0006],
    ],
    group: `Группа ${group}`,
    categoryKey: GROUP_CATEGORY[group],
    actualPits,
    limitPits: LIMIT_BY_GROUP[group],
    createdAt: new Date(Date.now() - hoursAgo * HOUR).toISOString(),
  };
});

const CATEGORY_TABS: { key: 'all' | CategoryKey; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'AB', label: 'Магистральные А–Б' },
  { key: 'V', label: 'Районные В' },
  { key: 'G', label: 'Местные Г' },
  { key: 'DE', label: 'Проезды Д–Е' },
];

export default function PlannedRepairPage() {
  const [selectedCategory, setSelectedCategory] = useState<'all' | CategoryKey>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 3; // как в макете: «Показано 3 из 18»

  // Новые предложения сверху
  const sortedProposals = useMemo(
    () => [...MOCK_PROPOSALS].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    []
  );

  // Счётчики вкладок считаем по данным, а не пишем числами
  const tabs = useMemo(
    () =>
      CATEGORY_TABS.map((tab) => ({
        ...tab,
        count: tab.key === 'all' ? sortedProposals.length : sortedProposals.filter((p) => p.categoryKey === tab.key).length,
      })),
    [sortedProposals]
  );

  const filteredList = useMemo(() => {
    if (selectedCategory === 'all') return sortedProposals;
    return sortedProposals.filter((item) => item.categoryKey === selectedCategory);
  }, [selectedCategory, sortedProposals]);

  const pagedList = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredList.slice(start, start + PAGE_SIZE);
  }, [filteredList, page]);

  const [selectedItem, setSelectedItem] = useState<PlannedProposal | null>(null);
  const [contractor, setContractor] = useState('');
  const [isPitsOpen, setIsPitsOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 text-neutral-800 antialiased">
      <div className="px-6 pt-5 pb-3 shrink-0">
        <h1 className="text-2xl font-bold text-neutral-900 leading-tight">
          Плановый ремонт: Предложения по участкам
        </h1>
        <p className="text-xs text-neutral-400 mt-1 mb-4 font-light">
          Участки с превышением порога ям на 100 м для включения в программу сплошной замены полотна
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          {tabs.map((tab) => {
            const isActive = selectedCategory === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setSelectedCategory(tab.key);
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 cursor-pointer transition-all ${
                  isActive ? 'bg-red-700 text-white shadow-sm' : 'bg-white text-neutral-600 border border-neutral-200'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-xs px-1.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-neutral-100'}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 px-6 pb-6 flex gap-4 overflow-hidden">
        <section className="w-[440px] flex flex-col shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              Очередь участков
            </span>
            <span className="w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs font-bold flex items-center justify-center">
              {filteredList.length}
            </span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {pagedList.map((item) => {
              const isSelected = selectedItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-sm hover:shadow ${
                    isSelected ? 'border-red-600 ring-2 ring-red-100' : 'border-neutral-200'
                  }`}
                >
                  <div className="mb-2">
                    <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-600">
                      {item.group}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-neutral-900 mt-1">{item.street}</h3>
                  <div className="flex items-center gap-1 text-xs text-neutral-400 mt-0.5 font-light">
                    <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                    <span className="truncate">{item.district}</span>
                  </div>

                  <div className="mt-3 bg-neutral-50 rounded-xl p-3 border border-neutral-100 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-neutral-400 font-medium">Фактически</div>
                      <div className="text-sm font-bold text-red-600 mt-0.5">{item.actualPits} ям / 100 м</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-neutral-400 font-medium">ГОСТ лимит</div>
                      <div className="text-sm font-bold text-neutral-800 mt-0.5">{item.limitPits} ямы / 100 м</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-neutral-400 mt-3 pt-2 border-t border-neutral-100 font-light">
                    <span>В очереди проверки</span>
                    <span>{formatDayTime(item.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-2 shadow-sm mt-3">
            <Pagination
              currentPage={page}
              totalItems={filteredList.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="участков"
            />
          </div>
        </section>

        <main className="flex-1 bg-white rounded-3xl border border-neutral-200 shadow-sm p-6 flex flex-col justify-between overflow-y-auto">
          {selectedItem ? (
            <div className="flex flex-col gap-5">
              <div className="relative w-full h-64 rounded-2xl overflow-hidden border border-neutral-200">
                <div className="absolute top-3 left-3 z-[1000] bg-white rounded-xl px-3 py-1.5 shadow-md border border-neutral-200 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse"></span>
                  <span className="text-xs font-bold text-neutral-800">Отрезок превышения ГОСТ</span>
                </div>

                <MapContainer center={selectedItem.center} zoom={15} className="w-full h-full" zoomControl={false} attributionControl={false}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Polyline positions={selectedItem.segmentCoords} pathOptions={{ color: '#D93025', weight: 6, opacity: 0.9 }} />
                </MapContainer>
              </div>

              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-neutral-900">{selectedItem.street}</h2>
                      <span className="bg-red-50 text-red-700 border border-red-200 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                        {selectedItem.group}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-400 mt-1 font-light">{selectedItem.district} • {selectedItem.coords}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-neutral-500 font-medium">ID: {selectedItem.proposalId}</div>
                    <div className="text-xs text-neutral-400 font-light">{formatDate(selectedItem.createdAt)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100">
                    <div className="text-xs text-neutral-500 font-medium">Плотность ям</div>
                    <div className="text-xl font-bold text-red-600 mt-0.5">{selectedItem.actualPits} ям / 100 м</div>
                    <div className="text-xs text-neutral-400 mt-0.5">Норма: {selectedItem.limitPits} ямы/100 м</div>
                  </div>

                  <select
                    value={contractor}
                    onChange={(e) => setContractor(e.target.value)}
                    className="w-full h-full min-h-[64px] px-4 bg-white border border-neutral-300 rounded-2xl text-xs font-semibold outline-none focus:border-red-600 shadow-sm"
                  >
                    <option value="">Назначить подрядчика</option>
                    <option value="ООО «ДорСтрой-Лидер»">ООО «ДорСтрой-Лидер»</option>
                    <option value="МБУ «ТомскАвтоДор»">МБУ «ТомскАвтоДор»</option>
                  </select>
                </div>

                <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setIsPitsOpen(!isPitsOpen)}
                    className="w-full p-3.5 bg-neutral-50 flex items-center justify-between text-sm font-bold cursor-pointer"
                  >
                    <span>Список заявок</span>
                    <span className="text-base">{isPitsOpen ? '−' : '+'}</span>
                  </button>
                  {isPitsOpen && (
                    <div className="p-3 text-xs text-neutral-600 bg-white space-y-1">
                      <div>• Заявка #{selectedItem.proposalId}-1 — Маленькая яма</div>
                      <div>• Заявка #{selectedItem.proposalId}-2 — Маленькая яма</div>
                    </div>
                  )}
                </div>

                <div className="border border-neutral-200 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setIsCommentsOpen(!isCommentsOpen)}
                    className="w-full p-3.5 bg-neutral-50 flex items-center justify-between text-sm font-bold cursor-pointer"
                  >
                    <span>Комментарии к заявкам</span>
                    <span className="text-base">{isCommentsOpen ? '−' : '+'}</span>
                  </button>
                  {isCommentsOpen && (
                    <div className="p-3 text-xs text-neutral-600 bg-white">
                      Жители сообщают о скоплении выбоин после дождя на нечетной стороне.
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
                  <button
                    onClick={() => alert('Участок оставлен для точечного ремонта')}
                    className="px-5 py-3 rounded-xl border border-neutral-300 text-sm font-bold cursor-pointer hover:bg-neutral-50 flex items-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Оставить точечный ремонт</span>
                  </button>
                  <button
                    onClick={() => alert('Участок включен в план сплошной замены полотна')}
                    className="px-6 py-3 rounded-xl bg-red-700 text-white text-sm font-bold shadow-md cursor-pointer hover:bg-red-800 flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Включить в план ремонта</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-4">
                <MousePointer className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-neutral-800">Выберите участок из списка слева</h3>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}