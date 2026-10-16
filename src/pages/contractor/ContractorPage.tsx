import { useState, useMemo } from 'react';
import { Camera, ImageOff, Check, ArrowRight, ArrowLeft, Clock, MapPin } from 'lucide-react';
import { Pagination } from "../../components/Pagination"; 
import logoSvg from "../../assets/logo.svg";               

interface ContractorTask {
  id: string;
  tagType: 'urgent' | 'overdue' | 'planned';
  tagLabel: string;
  assignedDate: string;
  timestamp: number;
  hoursLeft: number;
  address: string;
  districtInfo: string;
  dimensionText: string;
  categoryText: string;
  deadlineText: string;
  remainingText: string;
  isOverdue: boolean;
  brigade: string;
  foreman: string;
  status: 'В работе' | 'Выполнено';
  gps: string;
  defectClass: string;
}

const INITIAL_CONTRACTOR_TASKS: ContractorTask[] = [
  {
    id: '№ ЗЯ-0899',
    tagType: 'overdue',
    tagLabel: 'Просрочен',
    assignedDate: '17 мая, 12:00',
    timestamp: 1747476000,
    hoursLeft: -2.6,
    address: 'ул. Вершинина, 24',
    districtInfo: 'Кировский район • Полоса 1',
    dimensionText: 'Большая > 60 см',
    categoryText: 'Кат. 1 • 2.4 м²',
    deadlineText: '18 мая, 12:00',
    remainingText: 'Просрочено на 2 ч 40 м',
    isOverdue: true,
    brigade: 'Бригада №7',
    foreman: 'Воронов А. С.',
    status: 'В работе',
    gps: '56.4632° N, 84.9541° E (±0.8 м)',
    defectClass: 'Большая яма',
  },
  {
    id: '№ ЗЯ-0912',
    tagType: 'urgent',
    tagLabel: 'Срочно',
    assignedDate: 'Сегодня, 09:15',
    timestamp: 1747552500,
    hoursLeft: 3.25,
    address: 'ул. Интернационалистов, 12, стр. 1',
    districtInfo: 'Ленинский район',
    dimensionText: 'Маленькая < 30 см',
    categoryText: 'Кат. 1 • 2.1 м²',
    deadlineText: 'Сегодня до 18:00',
    remainingText: 'Осталось 3 ч 15 м',
    isOverdue: false,
    brigade: 'Бригада №7',
    foreman: 'Воронов А. С.',
    status: 'В работе',
    gps: '56.5128° N, 84.9810° E (±0.8 м)',
    defectClass: 'Большая яма',
  },
  {
    id: '№ ЗЯ-0915',
    tagType: 'planned',
    tagLabel: 'В плане',
    assignedDate: 'Сегодня, 11:20',
    timestamp: 1747560000,
    hoursLeft: 26,
    address: 'Иркутский тракт, 19',
    districtInfo: 'Иркутский тракт',
    dimensionText: 'Маленькая < 30 см',
    categoryText: 'Кат. 2 • 0.8 м²',
    deadlineText: 'Завтра до 14:00',
    remainingText: 'Штатный срок',
    isOverdue: false,
    brigade: 'Бригада №2',
    foreman: 'Кузьмин В.',
    status: 'В работе',
    gps: '56.5011° N, 85.0120° E (±1.2 м)',
    defectClass: 'Маленькая яма',
  },
  {
    id: '№ ЗЯ-0870',
    tagType: 'planned',
    tagLabel: 'Выполнено',
    assignedDate: '15 мая, 10:00',
    timestamp: 1747303200,
    hoursLeft: 999,
    address: 'ул. Красноармейская, 101',
    districtInfo: 'Кировский район',
    dimensionText: 'Большая > 60 см',
    categoryText: 'Кат. 1 • 3.2 м²',
    deadlineText: '16 мая, 18:00',
    remainingText: 'Завершено в срок',
    isOverdue: false,
    brigade: 'Бригада №7',
    foreman: 'Воронов А. С.',
    status: 'Выполнено',
    gps: '56.4680° N, 84.9650° E (±0.7 м)',
    defectClass: 'Большая яма',
  },
];

export default function ContractorPage({ onLogout }: { onLogout?: () => void }) {
  const [tasks, setTasks] = useState<ContractorTask[]>(INITIAL_CONTRACTOR_TASKS);
  const [selectedTask, setSelectedTask] = useState<ContractorTask | null>(null);

  const [activeFilter, setActiveFilter] = useState<'all' | 'in_work' | 'overdue' | 'done'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'date'>('priority');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;

  const [afterPhoto, setAfterPhoto] = useState<string | null>(null);

  const counts = useMemo(() => {
    return {
      all: tasks.length,
      in_work: tasks.filter((t) => t.status === 'В работе').length,
      overdue: tasks.filter((t) => t.isOverdue && t.status === 'В работе').length,
      done: tasks.filter((t) => t.status === 'Выполнено').length,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (activeFilter === 'in_work') return t.status === 'В работе';
      if (activeFilter === 'overdue') return t.isOverdue && t.status === 'В работе';
      if (activeFilter === 'done') return t.status === 'Выполнено';
      return true;
    });
  }, [tasks, activeFilter]);

  const sortedTasks = useMemo(() => {
    return [...filteredTasks].sort((a, b) => {
      if (sortBy === 'priority') return a.hoursLeft - b.hoursLeft;
      return b.timestamp - a.timestamp;
    });
  }, [filteredTasks, sortBy]);

  const pagedTasks = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedTasks.slice(start, start + PAGE_SIZE);
  }, [sortedTasks, page]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAfterPhoto(URL.createObjectURL(file));
    }
  };

  const handleCompleteTask = () => {
    if (!afterPhoto || !selectedTask) return;

    setTasks((prev) =>
      prev.map((item) =>
        item.id === selectedTask.id
          ? { ...item, status: 'Выполнено', tagLabel: 'Выполнено', isOverdue: false, remainingText: 'Завершено в срок' }
          : item
      )
    );

    alert(`Заявка ${selectedTask.id} успешно закрыта!`);
    setSelectedTask(null);
    setAfterPhoto(null);
  };

  return (
    <div className="min-h-screen w-full bg-neutral-100 font-sans text-neutral-800 antialiased flex flex-col">
      <header className="h-20 bg-white border-b border-neutral-200 px-8 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <img 
            src={logoSvg} 
            alt="NEO-СЕРВИС" 
            className="w-9 h-10 shrink-0 object-contain drop-shadow-sm" 
          />
          <div className="text-xs font-bold uppercase leading-tight tracking-wide">
            NEO-СЕРВИС:<br />ЯМОЧНЫЙ РЕМОНТ
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-bold text-neutral-900">Воронов А. С.</div>
            <div className="text-xs text-neutral-400">Мастер участка. Подрядчик</div>
          </div>
          <div className="w-10 h-10 rounded-full bg-red-700 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            В
          </div>
          <button
            onClick={onLogout}
            className="text-xs font-semibold text-neutral-400 hover:text-red-700 ml-2 cursor-pointer transition-colors"
          >
            Выход ↗
          </button>
        </div>
      </header>

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {!selectedTask ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Мои заявки</h1>
                  <p className="text-xs text-neutral-400 mt-0.5">ООО «ДорСтрой-Лидер»</p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-neutral-400 font-medium">Сортировать:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => { setSortBy(e.target.value as any); setPage(1); }}
                    className="h-9 px-3 bg-white border border-neutral-300 rounded-xl font-bold outline-none focus:border-red-600 shadow-sm"
                  >
                    <option value="priority">По срочности (дедлайн ГОСТ)</option>
                    <option value="date">По дате назначения</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setActiveFilter('all'); setPage(1); }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                    activeFilter === 'all' ? 'bg-white shadow-sm border border-neutral-300 text-neutral-900' : 'bg-neutral-200/60 text-neutral-500'
                  }`}
                >
                  <span>Все заявки</span>
                  <span className="bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full text-[10px]">{counts.all}</span>
                </button>

                <button
                  onClick={() => { setActiveFilter('in_work'); setPage(1); }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                    activeFilter === 'in_work' ? 'bg-white shadow-sm border border-neutral-300 text-neutral-900' : 'bg-neutral-200/60 text-neutral-500'
                  }`}
                >
                  <span>В работе</span>
                  <span className="bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full text-[10px]">{counts.in_work}</span>
                </button>

                <button
                  onClick={() => { setActiveFilter('overdue'); setPage(1); }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                    activeFilter === 'overdue' ? 'bg-white shadow-sm border border-red-300 text-red-700' : 'bg-neutral-200/60 text-red-600'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600"></span>
                  <span>Просроченные</span>
                  <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-[10px]">{counts.overdue}</span>
                </button>

                <button
                  onClick={() => { setActiveFilter('done'); setPage(1); }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                    activeFilter === 'done' ? 'bg-white shadow-sm border border-neutral-300 text-neutral-900' : 'bg-neutral-200/60 text-neutral-500'
                  }`}
                >
                  <span>Выполнено</span>
                  <span className="bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full text-[10px]">{counts.done}</span>
                </button>
              </div>

              <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-100 text-neutral-400 uppercase font-semibold text-[10px] tracking-wider pb-3">
                        <th className="py-2.5 px-3">ID/Статус</th>
                        <th className="py-2.5 px-3">Адрес дефекта</th>
                        <th className="py-2.5 px-3">Параметры</th>
                        <th className="py-2.5 px-3">Плановый срок</th>
                        <th className="py-2.5 px-3">Исполнитель</th>
                        <th className="py-2.5 px-3 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {pagedTasks.map((t) => (
                        <tr key={t.id} className="hover:bg-neutral-50/70 transition-colors">
                          <td className="py-4 px-3">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-neutral-900">{t.id}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                t.isOverdue ? 'bg-red-100 text-red-700' : t.tagType === 'urgent' ? 'bg-orange-100 text-orange-800' : 'bg-neutral-100'
                              }`}>
                                {t.tagLabel}
                              </span>
                            </div>
                            <div className="text-[11px] text-neutral-400 mt-0.5">{t.assignedDate}</div>
                          </td>

                          <td className="py-4 px-3">
                            <div className="font-bold text-neutral-900">{t.address}</div>
                            <div className="text-[11px] text-neutral-400 mt-0.5">{t.districtInfo}</div>
                          </td>

                          <td className="py-4 px-3">
                            <div className="font-medium text-neutral-800">{t.dimensionText}</div>
                            <div className="text-[11px] text-neutral-400 mt-0.5">{t.categoryText}</div>
                          </td>

                          <td className="py-4 px-3">
                            <div className="text-neutral-600 font-medium">{t.deadlineText}</div>
                            <div className={`text-[11px] font-bold mt-0.5 ${t.isOverdue ? 'text-red-600' : 'text-neutral-800'}`}>
                              {t.remainingText}
                            </div>
                          </td>

                          <td className="py-4 px-3">
                            <div className="font-bold text-neutral-800">{t.brigade}</div>
                            <div className="text-[11px] text-neutral-400 mt-0.5">{t.foreman}</div>
                          </td>

                          <td className="py-4 px-3 text-right">
                            <button
                              onClick={() => setSelectedTask(t)}
                              className="text-red-700 hover:text-red-800 font-bold text-xs inline-flex items-center gap-1 cursor-pointer"
                            >
                              <span>Открыть</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={page}
                  totalItems={sortedTasks.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                  itemLabel="заявок"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-neutral-200/80 p-4 shadow-sm flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => { setSelectedTask(null); setAfterPhoto(null); }}
                    className="text-xs font-bold text-neutral-600 hover:text-neutral-900 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Назад к списку заявок</span>
                  </button>
                  <span className="text-neutral-300">|</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-500">ID {selectedTask.id}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      selectedTask.status === 'Выполнено' ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-neutral-900'
                    }`}>
                      {selectedTask.status}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 bg-neutral-50 px-3 py-1.5 rounded-xl border border-neutral-200">
                  <Clock className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Срок: <strong className="text-red-700">{selectedTask.deadlineText} ({selectedTask.remainingText})</strong></span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                  <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-neutral-900">Параметры дефекта</h2>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-neutral-100 text-neutral-600">
                        КАТЕГОРИЯ 1 (МАГИСТРАЛЬ А)
                      </span>
                    </div>

                    <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100">
                      <div className="flex items-start gap-2 text-xs">
                        <MapPin className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-neutral-900">{selectedTask.address}</div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">GPS: {selectedTask.gps}</div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100">
                      <div className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Класс ямы</div>
                      <div className="text-sm font-bold text-red-700 mt-0.5">{selectedTask.defectClass}</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-neutral-900">Фотофиксация осмотра</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">ДО РЕМОНТА</span>
                    </div>

                    <div className="relative w-full h-64 rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-400 overflow-hidden">
                      <ImageOff className="w-16 h-16 text-neutral-300" />
                      <div className="absolute bottom-2 left-3 text-[11px] text-neutral-500 bg-white/80 px-2 py-1 rounded">
                        18 мая 2025, 09:15
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-neutral-900">Сдача работ</h2>
                    <p className="text-xs text-neutral-400 mt-0.5">Фотофиксация выполнения и подтверждение закрытия</p>
                  </div>

                  <div className="relative w-full h-80 rounded-2xl bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center text-neutral-400 overflow-hidden">
                    <span className="absolute top-3 left-3 z-10 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                      ПОСЛЕ ремонта
                    </span>

                    {afterPhoto ? (
                      <img src={afterPhoto} alt="После ремонта" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-4">
                        <ImageOff className="w-16 h-16 text-neutral-300 mb-2" />
                        <span className="text-xs text-neutral-400">Фотография ещё не загружена</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="w-full h-11 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors border border-neutral-200">
                      <Camera className="w-4 h-4" />
                      <span>{afterPhoto ? 'Заменить фото' : 'Загрузить фото'}</span>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  </div>

                  <button
                    onClick={handleCompleteTask}
                    disabled={!afterPhoto}
                    className={`w-full py-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all ${
                      afterPhoto ? 'bg-red-700 hover:bg-red-800 text-white cursor-pointer' : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    <span>Подтвердить статус «Выполнено»</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}