import { useState, useMemo, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Pagination } from '../../components/Pagination';
import { SelectBox } from '../../components/SelectBox';
import { formatDate, formatDayTime } from '../../utils/format';

import { Icon } from '../../components/Icon';
import { MinusIcon, PlusIcon } from '../../components/UiIcons';
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

const pitsWord = (n: number) => {
  const a = n % 100;
  const b = n % 10;
  if (a > 10 && a < 20) return 'ям';
  if (b > 1 && b < 5) return 'ямы';
  if (b === 1) return 'яма';
  return 'ям';
};

const STAGE_LABEL = (index: number) => (index % 3 === 2 ? 'Предварительное согласование' : 'В очереди проверки');

// Кнопки масштаба карты («+» и «−», 32×32, как в макете «Веб/План»)
function ZoomButtons() {
  const map = useMap();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // клики по кнопкам не должны двигать карту
    if (ref.current) L.DomEvent.disableClickPropagation(ref.current);
  }, []);

  const btn =
    'flex h-8 w-8 items-center justify-center rounded-lg bg-white text-neutral-800 shadow-[0_1px_1px_rgba(0,0,0,0.05)] hover:bg-neutral-100 cursor-pointer transition-colors';
  return (
    <div ref={ref} className="absolute bottom-3 right-3 z-[1000] flex items-center gap-1.5">
      <button type="button" aria-label="Приблизить" onClick={() => map.zoomIn()} className={btn}>
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
      <button type="button" aria-label="Отдалить" onClick={() => map.zoomOut()} className={btn}>
        <MinusIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

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
  const [notice, setNotice] = useState<string | null>(null);


  const borderLav = 'border-[rgba(70,89,155,0.4)]';

  // Макет «Веб/План»: поля 24, две колонки 5/7 с зазором 16, карточки без прокрутки — по 3 на страницу
  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-neutral-100 text-neutral-800 antialiased">
      <div className="px-4 sm:px-6 py-4 flex flex-col gap-[10px]">
        <div className="border-b border-neutral-200 pb-4 flex flex-col gap-1">
          <h1 className="text-xl sm:text-2xl font-bold leading-tight text-[#131B2E]">Плановый ремонт: Предложения по участкам</h1>
          <p className="text-xs font-light text-[#5B403B]">
            Участки с превышением порога ям на 100 м для включения в программу сплошной замены полотна
          </p>
        </div>

        <div className="flex items-center gap-[9px] flex-wrap">
          {tabs.map((tab) => {
            const isActive = selectedCategory === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setSelectedCategory(tab.key);
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 rounded-full px-[14px] py-[6px] text-xs font-light cursor-pointer transition-colors shadow-[0_1px_1px_rgba(0,0,0,0.05)] ${
                  isActive ? 'bg-red-700 text-white' : 'bg-white text-neutral-800 hover:bg-neutral-100'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 text-[11px] font-bold leading-[14px] ${
                    isActive ? 'bg-[#C38C85] text-white' : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          <section className="lg:col-span-5 flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm text-[#131B2E]">ОЧЕРЕДЬ УЧАСТКОВ</span>
              <span className="flex h-5 items-center justify-center rounded-full bg-[#FFDAD4] px-2 text-[11px] font-bold text-[#9F0E00]">
                {filteredList.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {pagedList.map((item, index) => {
                const isSelected = selectedItem?.id === item.id;
                const heavy = item.actualPits / item.limitPits >= 2;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`flex flex-col gap-[5px] rounded-xl border bg-white p-4 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-colors ${
                      isSelected ? 'border-red-700' : 'border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    <div>
                      <span className="inline-block rounded bg-neutral-100 px-2 py-0.5 text-[11px] font-bold leading-[14px] text-[#131B2E]">
                        {item.group}
                      </span>
                    </div>

                    <div className="flex flex-col gap-[1.5px]">
                      <h3 className="text-sm font-normal text-[#131B2E]">{item.street}</h3>
                      <div className="flex items-center gap-1 text-xs font-light text-[#5B403B]">
                        <Icon name="map-pin" className="h-3 w-3 shrink-0 text-red-700" />
                        <span className="truncate">{item.district}</span>
                      </div>
                    </div>

                    {/* Две равные колонки: «ГОСТ лимит» начинается от центра блока */}
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-neutral-100 px-[10px] pb-[10px] pt-[14px]">
                      <div>
                        <div className="text-[11px] font-bold leading-[14px] text-neutral-600">Фактически</div>
                        <div className={`pt-0.5 text-sm font-bold leading-5 ${heavy ? 'text-[#9F0E00]' : 'text-[#9E4123]'}`}>
                          {item.actualPits} {pitsWord(item.actualPits)} / 100 м
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-bold leading-[14px] text-neutral-600">ГОСТ лимит</div>
                        <div className="pt-0.5 text-sm font-normal leading-5 text-[#131B2E]">
                          {item.limitPits} {pitsWord(item.limitPits)} / 100 м
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3">
                      <div className="flex items-center gap-1.5 text-xs text-neutral-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
                        <span>{STAGE_LABEL(index)}</span>
                      </div>
                      <span className="text-[11px] font-bold text-neutral-600">{formatDayTime(item.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl bg-white px-2 py-2 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
              <Pagination currentPage={page} totalItems={filteredList.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
            </div>
          </section>

          <main className="lg:col-span-7 overflow-hidden rounded-2xl border border-[rgba(218,226,253,0.5)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            {selectedItem ? (
              <div className="flex flex-col">
                <div className="relative h-[320px] w-full bg-[#CCD4E6]">
                  <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex items-center gap-2 rounded-lg border border-[rgba(70,89,155,0.4)] bg-white px-[13px] py-[7px] shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-700" />
                    <span className="text-[11px] font-bold leading-[14px] text-neutral-800">Отрезок превышения ГОСТ</span>
                  </div>

                  <MapContainer
                    key={selectedItem.id}
                    center={selectedItem.center}
                    zoom={15}
                    className="h-full w-full"
                    zoomControl={false}
                    attributionControl={false}
                  >
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Polyline positions={selectedItem.segmentCoords} pathOptions={{ color: '#D93025', weight: 6, opacity: 0.9 }} />
                    <ZoomButtons />
                  </MapContainer>
                </div>

                <div className="flex flex-col gap-4 p-6">
                  {notice && (
                    <div role="status" className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800">
                      <span>{notice}</span>
                      <button type="button" aria-label="Закрыть" onClick={() => setNotice(null)} className="ml-3 cursor-pointer">
                        ✕
                      </button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-start justify-between gap-3 sm:gap-6">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <h2 className="text-2xl font-bold leading-tight text-neutral-800">{selectedItem.street}</h2>
                        <span className="rounded-md bg-[#FFDAD4] px-2 py-0.5 text-sm text-[#9F0E00]">{selectedItem.group}</span>
                      </div>
                      <div className="text-xs text-neutral-600">
                        {selectedItem.district} • {selectedItem.coords}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 text-xs">
                      <span className="text-black">ID: {selectedItem.proposalId}</span>
                      <span className="text-neutral-600">{formatDate(selectedItem.createdAt)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-start gap-[10px]">
                    <div className="flex h-20 w-[193px] shrink-0 flex-col gap-1 rounded-xl bg-neutral-100 px-2 pt-2">
                      <div className="text-[11px] font-bold leading-[14px] text-neutral-800">Плотность ям</div>
                      <div className="text-lg font-bold leading-6 text-[#9F0E00]">
                        {selectedItem.actualPits} {pitsWord(selectedItem.actualPits)} / 100 м
                      </div>
                      <div className="text-xs text-neutral-600">
                        Норма: {selectedItem.limitPits} {pitsWord(selectedItem.limitPits)}/100 м
                      </div>
                    </div>

                    <SelectBox
                      ariaLabel="Назначить подрядчика"
                      className="h-[48px] w-[246px] shrink-0"
                      fieldClassName={`bg-neutral-100 ${borderLav} pl-[13px] pr-10 py-0 text-sm font-bold text-black`}
                      value={contractor}
                      onChange={setContractor}
                    >
                      <option value="">Назначить подрядчика</option>
                      <option value="ООО «ДорСтрой-Лидер»">ООО «ДорСтрой-Лидер»</option>
                      <option value="МБУ «ТомскАвтоДор»">МБУ «ТомскАвтоДор»</option>
                    </SelectBox>
                  </div>

                  <div className={`overflow-hidden rounded-xl border bg-neutral-100 ${borderLav}`}>
                    <button
                      type="button"
                      onClick={() => setIsPitsOpen(!isPitsOpen)}
                      className="flex w-full items-center justify-between p-[13px] text-sm font-bold text-black cursor-pointer"
                    >
                      <span>Список заявок</span>
                      {isPitsOpen ? <MinusIcon className="h-[18px] w-[18px]" /> : <Icon name="add-plus" className="h-[21px] w-[21px]" />}
                    </button>
                    {isPitsOpen && (
                      <div className={`space-y-1 border-t bg-white p-3 text-xs text-neutral-600 ${borderLav}`}>
                        <div>• Заявка #{selectedItem.proposalId}-1 — Маленькая яма</div>
                        <div>• Заявка #{selectedItem.proposalId}-2 — Маленькая яма</div>
                      </div>
                    )}
                  </div>

                  <div className={`overflow-hidden rounded-xl border bg-neutral-100 ${borderLav}`}>
                    <button
                      type="button"
                      onClick={() => setIsCommentsOpen(!isCommentsOpen)}
                      className="flex w-full items-center justify-between p-[13px] text-sm font-bold text-black cursor-pointer"
                    >
                      <span>Комментарии к заявкам</span>
                      {isCommentsOpen ? <MinusIcon className="h-[18px] w-[18px]" /> : <Icon name="add-plus" className="h-[21px] w-[21px]" />}
                    </button>
                    {isCommentsOpen && (
                      <div className={`border-t bg-white p-3 text-xs text-neutral-600 ${borderLav}`}>
                        Жители сообщают о скоплении выбоин после дождя на нечетной стороне.
                      </div>
                    )}
                  </div>

                  <div className={`flex items-center justify-center gap-3 border-t pt-[13px] ${borderLav}`}>
                    <button
                      type="button"
                      onClick={() => setNotice('Участок оставлен для точечного ремонта.')}
                      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-neutral-100 px-5 text-xs font-bold text-neutral-800 cursor-pointer hover:bg-neutral-200 transition-colors"
                    >
                      <Icon name="close-small" className="h-[10px] w-[10px]" />
                      <span>Оставить точечный ремонт</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotice('Участок включён в план сплошной замены полотна.')}
                      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-6 text-xs font-bold text-white shadow-[0_1px_1px_rgba(0,0,0,0.05)] cursor-pointer hover:bg-red-800 transition-colors"
                    >
                      <Icon name="check-circle" className="h-4 w-4" />
                      <span>Включить в план ремонта</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
                <Icon name="empty-tap-plan" className="-mb-2" />
                <h3 className="text-2xl font-bold text-neutral-800">Выберите участок из списка слева</h3>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
