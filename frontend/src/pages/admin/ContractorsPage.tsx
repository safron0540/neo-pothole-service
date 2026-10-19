
import { useState, useMemo } from 'react';
import { Calendar, MapPin, HardHat, Smartphone, Timer } from 'lucide-react';
import { Pagination } from '../../components/Pagination';

interface ContractorItem {
  id: string;
  name: string;
  district: string;
  hasData: boolean;
  contactPerson?: string;
  phone?: string;
  stats?: {
    total: number;
    closed: number;
    inProgress: number;
    onTimePercent: number;
    onTimeCount: number;
    delayedCount: number;
    avgTimeHours: number;
  };
}

interface ContractorTask {
  id: string;
  dateAssigned: string;
  address: string;
  duration: string;
  normTime: string;
  isOverdue?: boolean;
  overdueTime?: string;
  status: 'Выполнено' | 'В работе';
}

const MOCK_CONTRACTORS: ContractorItem[] = [
  {
    id: 'c-1',
    name: 'ООО «ДорСтрой-Лидер»',
    district: 'Ленинский',
    hasData: true,
    contactPerson: 'Соколов В. П.',
    phone: '+7 (123) 124–55–88',
    stats: {
      total: 142,
      closed: 138,
      inProgress: 4,
      onTimePercent: 96.4,
      onTimeCount: 137,
      delayedCount: 5,
      avgTimeHours: 18.4,
    },
  },
  {
    id: 'c-2',
    name: 'МУП «Автодор-Север»',
    district: 'Октябрьский',
    hasData: true,
    contactPerson: 'Иванов И. И.',
    phone: '+7 (123) 999–11–22',
    stats: {
      total: 98,
      closed: 90,
      inProgress: 8,
      onTimePercent: 91.8,
      onTimeCount: 89,
      delayedCount: 9,
      avgTimeHours: 21.2,
    },
  },
  {
    id: 'c-5',
    name: 'ООО «СпецДорРем»',
    district: 'Иркутский тракт (резерв)',
    hasData: false,
  },
];

const MOCK_TASKS: ContractorTask[] = [
  {
    id: '№ ЗЯ-2024-0912',
    dateAssigned: '28.04.2025, 14:32',
    address: 'ул. Вершинина, 24',
    duration: '14 ч 20 мин',
    normTime: 'Норма: 24 ч',
    status: 'Выполнено',
  },
  {
    id: '№ ЗЯ-2024-0908',
    dateAssigned: '26.04.2025, 09:15',
    address: 'Иркутский тракт, 19',
    duration: '19 ч 45 мин',
    normTime: 'Норма: 24 ч',
    status: 'Выполнено',
  },
  {
    id: '№ ЗЯ-2024-0899',
    dateAssigned: '24.04.2025, 11:50',
    address: 'ул. Вершинина, 24',
    duration: '26 ч 10 мин',
    normTime: 'Норма: 24 ч',
    isOverdue: true,
    overdueTime: '+2 ч 10 мин',
    status: 'В работе',
  },
  {
    id: '№ ЗЯ-2024-0892',
    dateAssigned: '22.04.2025, 16:00',
    address: 'ул. Вершинина, 24',
    duration: '12 ч 10 мин',
    normTime: 'Норма: 24 ч',
    status: 'В работе',
  },
];

export default function ContractorsPage() {
  const [period, setPeriod] = useState('Апрель 2025');
  const [selectedContractor, setSelectedContractor] = useState<ContractorItem | null>(MOCK_CONTRACTORS[0]);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 2;

  const currentTasks = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return MOCK_TASKS.slice(start, start + PAGE_SIZE);
  }, [page]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 font-sans text-neutral-800 antialiased">
      <header className="px-8 pt-7 pb-4 flex items-start justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Управление подрядчиками</h1>
          <p className="text-xs text-neutral-400 mt-1">Рейтинг эффективности и история выполнения заявок</p>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200/80 px-4 py-2 flex items-center gap-3 shadow-sm">
          <Calendar className="w-4 h-4 text-red-600" />
          <div className="text-left">
            <div className="text-[10px] text-neutral-400 font-medium">Отчётный период</div>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="text-xs font-bold text-neutral-800 bg-transparent outline-none cursor-pointer">
              <option value="Апрель 2025">Апрель 2025</option>
              <option value="Май 2025">Май 2025</option>
            </select>
          </div>
        </div>
      </header>

      <div className="flex-1 px-8 pb-8 flex gap-6 overflow-hidden">
        <section className="w-80 flex flex-col shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Подрядные организации</span>
            <span className="text-xs font-bold text-neutral-600">{MOCK_CONTRACTORS.length}</span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {MOCK_CONTRACTORS.map((c) => {
              const isSelected = selectedContractor?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => { setSelectedContractor(c); setPage(1); }}
                  className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-sm hover:shadow ${
                    isSelected ? 'border-red-600 ring-2 ring-red-100' : 'border-neutral-200/80'
                  }`}
                >
                  <h3 className="text-sm font-bold text-neutral-900 leading-tight">{c.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-1">
                    <MapPin className="w-3.5 h-3.5 text-red-600" />
                    <span>{c.district}</span>
                  </div>

                  {!c.hasData && (
                    <div className="mt-3 bg-neutral-50 rounded-xl p-2.5 border border-neutral-100 flex items-center justify-between text-[11px] text-neutral-400">
                      <span>Нет данных за выбранный месяц</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {!selectedContractor ? (
          <main className="flex-1 bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 mb-4">
              <HardHat className="w-10 h-10" />
            </div>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">Выберите подрядчика из списка слева</h2>
          </main>
        ) : !selectedContractor.hasData ? (
          <main className="flex-1 bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center p-12 text-center">
            <h2 className="text-base font-bold text-neutral-800">Показатели {selectedContractor.name} отсутствуют</h2>
          </main>
        ) : (
          <main className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1">
            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm">
              <div className="flex items-start justify-between mb-6">
                <h2 className="text-xl font-bold text-neutral-900">{selectedContractor.name}</h2>
                <div className="text-right text-xs">
                  <div className="text-neutral-500">Контакт: {selectedContractor.contactPerson}</div>
                  <div className="text-red-600 font-bold mt-0.5">{selectedContractor.phone}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">Всего заявок</div>
                  <div className="text-3xl font-extrabold text-neutral-900 my-2">{selectedContractor.stats?.total}</div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-neutral-500">{selectedContractor.stats?.closed} закрыто</span>
                    <span className="text-red-600 font-bold">{selectedContractor.stats?.inProgress} в работе</span>
                  </div>
                </div>

                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                    <span>Доля в срок</span>
                    <Smartphone className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="text-3xl font-extrabold text-neutral-900 my-2">{selectedContractor.stats?.onTimePercent}%</div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-neutral-500">{selectedContractor.stats?.onTimeCount} вовремя</span>
                    <span className="text-red-600 font-bold">{selectedContractor.stats?.delayedCount} с задержкой</span>
                  </div>
                </div>

                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
                    <span>Среднее время</span>
                    <Timer className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="text-3xl font-extrabold text-neutral-900 my-2">{selectedContractor.stats?.avgTimeHours} ч</div>
                  <div className="text-xs text-neutral-400">Норматив соблюден</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-neutral-900">История заявок подрядчика</h3>
                  <span className="text-xs text-neutral-400">({selectedContractor.stats?.total} заявки в {period})</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 text-neutral-400 uppercase font-semibold text-[10px] tracking-wider pb-2">
                        <th className="py-2.5 px-3">ID и дата</th>
                        <th className="py-2.5 px-3">Адрес</th>
                        <th className="py-2.5 px-3 text-center">Время работ</th>
                        <th className="py-2.5 px-3 text-right">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {currentTasks.map((t, idx) => (
                        <tr key={idx} className={`hover:bg-neutral-50/80 transition-colors ${t.isOverdue ? 'bg-red-50/40' : ''}`}>
                          <td className="py-3 px-3">
                            <div className={`font-bold ${t.isOverdue ? 'text-red-700' : 'text-neutral-800'}`}>{t.id}</div>
                            <div className="text-[11px] text-neutral-400 mt-0.5">{t.dateAssigned}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5 font-semibold text-neutral-800">
                              <MapPin className="w-3.5 h-3.5 text-red-600" />
                              <span>{t.address}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <div className="font-bold text-neutral-800">{t.duration}</div>
                            {t.isOverdue ? (
                              <div className="text-[10px] font-bold text-red-600 mt-0.5">{t.overdueTime}</div>
                            ) : (
                              <div className="text-[10px] text-neutral-400 mt-0.5">{t.normTime}</div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold text-white ${
                              t.status === 'Выполнено' ? 'bg-emerald-600' : 'bg-amber-500'
                            }`}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Pagination
                currentPage={page}
                totalItems={MOCK_TASKS.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                itemLabel="заявок"
              />
            </div>
          </main>
        )}
      </div>
    </div>
  );
}