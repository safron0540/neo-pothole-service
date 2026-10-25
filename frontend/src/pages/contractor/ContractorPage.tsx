import { useState, useEffect, useMemo } from 'react';
import { Camera, ImageOff, Check, ArrowRight, ArrowLeft, MapPin, Loader2 } from 'lucide-react';
import { Pagination } from "../../components/Pagination"; 
import logoSvg from "../../assets/logo.svg";
import { api } from "../../api";
import { TomskClock } from "../../components/TomskClock";
import { formatDate } from "../../utils/format";

interface ContractorTask {
  id: number | string;
  address: string;
  full_address?: string;
  defect_class?: string;
  status: string;
  planned_due?: string;
  hours_left?: number;
  is_overdue?: boolean;
}

const FALLBACK_TASKS: ContractorTask[] = [
  {
    id: 20092026,
    address: 'ул. Ленина, 15',
    full_address: 'г. Томск, ул. Ленина, 15',
    defect_class: 'big',
    status: 'В работе',
    planned_due: '2026-10-20T14:00:00Z',
    hours_left: 24,
    is_overdue: false,
  },
  {
    id: 20090899,
    address: 'ул. Вершинина, 24',
    full_address: 'г. Томск, ул. Вершинина, 24',
    defect_class: 'big',
    status: 'В работе',
    planned_due: '2026-10-18T12:00:00Z',
    hours_left: -26,
    is_overdue: true,
  },
];

export default function ContractorPage({ onLogout }: { onLogout?: () => void }) {
  const [tasks, setTasks] = useState<ContractorTask[]>(FALLBACK_TASKS);
  const [selectedTask, setSelectedTask] = useState<ContractorTask | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'in_work' | 'overdue' | 'done'>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [afterPhotoPreview, setAfterPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Загрузка нарядов подрядчика с сервера (Q-18)
  useEffect(() => {
    setIsLoading(true);
    api.getContractorRequests()
      .then((data) => {
        if (data.items && data.items.length > 0) {
          setTasks(data.items);
        }
      })
      .catch(() => {
        console.log('Используются резервные наряды подрядчика');
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setAfterPhotoPreview(URL.createObjectURL(file));
    }
  };

  // Завершение наряда с отправкой фото на сервер (Q-19)
  const handleCompleteTask = async () => {
    if (!afterPhotoPreview || !selectedTask) return;

    setIsSubmitting(true);
    if (selectedFile) {
      try {
        await api.completeContractorRequest(selectedTask.id, selectedFile);
      } catch (err: any) {
        console.warn('Сервер недоступен, перевод в оффлайн-режиме:', err.message);
      }
    }

    setTasks((prev) =>
      prev.map((item) =>
        item.id === selectedTask.id
          ? { ...item, status: 'Выполнено', is_overdue: false }
          : item
      )
    );

    alert(`Наряд №${selectedTask.id} успешно закрыт со статусом «Выполнено»!`);
    setIsSubmitting(false);
    setSelectedTask(null);
    setAfterPhotoPreview(null);
    setSelectedFile(null);
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (activeFilter === 'in_work') return t.status === 'В работе' || t.status === 'Принято';
      if (activeFilter === 'overdue') return t.is_overdue;
      if (activeFilter === 'done') return t.status === 'Выполнено';
      return true;
    });
  }, [tasks, activeFilter]);

  const pagedTasks = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTasks.slice(start, start + PAGE_SIZE);
  }, [filteredTasks, page]);

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
          <TomskClock />
          <div className="text-right">
            <div className="text-sm font-bold text-neutral-900">Воронов А. С.</div>
            <div className="text-xs text-neutral-400">Мастер участка • Подрядчик</div>
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
                  <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Мои наряды на ремонт</h1>
                  <p className="text-xs text-neutral-400 mt-0.5">ООО «ДорСтрой-Лидер»</p>
                </div>
                {isLoading && <Loader2 className="w-4 h-4 animate-spin text-red-700" />}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setActiveFilter('all'); setPage(1); }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold cursor-pointer transition-all ${
                    activeFilter === 'all' ? 'bg-white shadow-sm border border-neutral-300 text-neutral-900' : 'bg-neutral-200/60 text-neutral-500'
                  }`}
                >
                  Все ({tasks.length})
                </button>
                <button
                  onClick={() => { setActiveFilter('in_work'); setPage(1); }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold cursor-pointer transition-all ${
                    activeFilter === 'in_work' ? 'bg-white shadow-sm border border-neutral-300 text-neutral-900' : 'bg-neutral-200/60 text-neutral-500'
                  }`}
                >
                  В работе
                </button>
                <button
                  onClick={() => { setActiveFilter('overdue'); setPage(1); }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold cursor-pointer transition-all ${
                    activeFilter === 'overdue' ? 'bg-white shadow-sm border border-red-300 text-red-700' : 'bg-neutral-200/60 text-red-600'
                  }`}
                >
                  Просроченные
                </button>
                <button
                  onClick={() => { setActiveFilter('done'); setPage(1); }}
                  className={`px-4 py-2 rounded-2xl text-xs font-bold cursor-pointer transition-all ${
                    activeFilter === 'done' ? 'bg-white shadow-sm border border-neutral-300 text-neutral-900' : 'bg-neutral-200/60 text-neutral-500'
                  }`}
                >
                  Выполнено
                </button>
              </div>

              <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-100 text-neutral-400 uppercase font-semibold text-[10px] tracking-wider pb-3">
                        <th className="py-2.5 px-3">Номер наряда</th>
                        <th className="py-2.5 px-3">Адрес дефекта</th>
                        <th className="py-2.5 px-3">Класс ямы</th>
                        <th className="py-2.5 px-3">Срок устранения</th>
                        <th className="py-2.5 px-3">Статус</th>
                        <th className="py-2.5 px-3 text-right">Действие</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {pagedTasks.map((t) => (
                        <tr key={t.id} className="hover:bg-neutral-50/70 transition-colors">
                          <td className="py-4 px-3 font-bold text-neutral-900">№ {t.id}</td>
                          <td className="py-4 px-3 font-semibold text-neutral-900">{t.address}</td>
                          <td className="py-4 px-3">{t.defect_class === 'big' ? 'Большая' : 'Маленькая'} яма</td>
                          <td className="py-4 px-3">
                            <span className={t.is_overdue ? 'text-red-600 font-bold' : 'text-neutral-600'}>
                              {t.planned_due ? formatDate(t.planned_due) : 'В плане'}
                            </span>
                          </td>
                          <td className="py-4 px-3">
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                              t.status === 'Выполнено' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {t.status}
                            </span>
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
                  totalItems={filteredTasks.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                  itemLabel="нарядов"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-neutral-200/80 p-4 shadow-sm flex items-center justify-between">
                <button
                  onClick={() => { setSelectedTask(null); setAfterPhotoPreview(null); }}
                  className="text-xs font-bold text-neutral-600 hover:text-neutral-900 flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Назад к списку нарядов</span>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-neutral-500">Наряд № {selectedTask.id}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                    selectedTask.status === 'Выполнено' ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-neutral-900'
                  }`}>
                    {selectedTask.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="space-y-6">
                  <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
                    <h2 className="text-base font-bold text-neutral-900">Параметры дефекта</h2>
                    <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100">
                      <div className="flex items-start gap-2 text-xs">
                        <MapPin className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-neutral-900">{selectedTask.address}</div>
                          <div className="text-[11px] text-neutral-400 mt-0.5">{selectedTask.full_address || selectedTask.address}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-neutral-900">Фотофиксация осмотра</h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700">ДО РЕМОНТА</span>
                    </div>

                    <div className="relative w-full h-56 rounded-2xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-400">
                      <ImageOff className="w-12 h-12 text-neutral-300" />
                      <div className="absolute bottom-2 left-3 text-[11px] text-neutral-500 bg-white/80 px-2 py-1 rounded">
                        Фото из первичной заявки
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-4">
                  <h2 className="text-base font-bold text-neutral-900">Сдача работ (Фотоконтроль)</h2>

                  <div className="relative w-full h-72 rounded-2xl bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center text-neutral-400 overflow-hidden">
                    <span className="absolute top-3 left-3 z-10 text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">
                      ПОСЛЕ ремонта
                    </span>

                    {afterPhotoPreview ? (
                      <img src={afterPhotoPreview} alt="После ремонта" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center">
                        <ImageOff className="w-12 h-12 text-neutral-300 mb-2" />
                        <span className="text-xs text-neutral-400">Фотография ещё не загружена</span>
                      </div>
                    )}
                  </div>

                  <label className="w-full h-11 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors border border-neutral-200">
                    <Camera className="w-4 h-4" />
                    <span>{afterPhotoPreview ? 'Заменить фото' : 'Загрузить фото с камеры'}</span>
                    <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                  </label>

                  <button
                    onClick={handleCompleteTask}
                    disabled={!afterPhotoPreview || isSubmitting}
                    className={`w-full py-3.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all ${
                      afterPhotoPreview && !isSubmitting
                        ? 'bg-red-700 hover:bg-red-800 text-white cursor-pointer'
                        : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                    }`}
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Подтвердить статус «Выполнено» (Q-19)</span>
                      </>
                    )}
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