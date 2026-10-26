import { useState, useEffect, useMemo } from 'react';
import { Camera, ImageOff, Check, ArrowRight, ArrowLeft, MapPin, Loader2, Clock, User, ChevronRight } from 'lucide-react';
import { Pagination } from "../../components/Pagination";
import logoSvg from "../../assets/logo.svg";
import { api } from "../../api";
import type { ContractorRequestOut, RequestSummary } from "../../api";
import { useMe, shortName } from "../../data/useMe";
import { STATUS_COLOR } from "../../data/reference";
import { DEFECT_CLASS_LABEL } from "../../data/reference";
import { formatDateTime, formatDayTime, formatDeadlineShort, formatDueLabel, remainingDetailed } from "../../utils/format";

type Notice = { type: 'ok' | 'error'; text: string } | null;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // до 10 МБ
const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png'];

function StatusPill({ code, label }: { code: RequestSummary['status']['code']; label: string }) {
  return (
    <span
      className={`inline-flex h-5 w-[130px] items-center justify-center rounded-xl text-[11px] font-light ${
        code === 'in_progress' ? 'text-neutral-800' : 'text-white'
      }`}
      style={{ backgroundColor: STATUS_COLOR[code] }}
    >
      {label}
    </span>
  );
}

export default function ContractorPage({ onLogout }: { onLogout?: () => void }) {
  const me = useMe();
  const [tasks, setTasks] = useState<RequestSummary[]>([]);
  const [selectedTask, setSelectedTask] = useState<RequestSummary | null>(null);
  const [taskDetail, setTaskDetail] = useState<ContractorRequestOut | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'in_work' | 'overdue' | 'done'>('all');
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);
  const PAGE_SIZE = 5; // как в макете: «Показано 5 из 14 заявок»

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [afterPhotoPreview, setAfterPhotoPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [listState, setListState] = useState<{ tick: number; error?: string } | null>(null);
  const isLoading = listState?.tick !== reloadTick;

  // Название организации под заголовком (если справочник доступен этой роли)
  const [orgName, setOrgName] = useState<string | null>(null);
  const contractorId = me?.contractor_id ?? null;
  useEffect(() => {
    if (contractorId == null) return;
    let cancelled = false;
    api
      .getContractors()
      .then((list) => !cancelled && setOrgName(list.find((c) => c.id === contractorId)?.name ?? null))
      .catch(() => {
        /* без названия организации — не критично */
      });
    return () => {
      cancelled = true;
    };
  }, [contractorId]);

  // Наряды подрядчика (чужих бэкенд не отдаёт)
  useEffect(() => {
    let cancelled = false;
    api
      .getContractorRequests({ limit: 200 })
      .then((data) => {
        if (cancelled) return;
        setTasks(data.items);
        setListState({ tick: reloadTick });
      })
      .catch((err: unknown) => {
        if (!cancelled) setListState({ tick: reloadTick, error: err instanceof Error ? err.message : 'Ошибка' });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  // Открыть наряд: подгружаем карточку (фото до/после, координаты)
  const openTask = (task: RequestSummary) => {
    setSelectedTask(task);
    setTaskDetail(null);
    setNotice(null);
    api
      .getContractorRequestById(task.id)
      .then((d) => setTaskDetail((prev) => (prev === null ? d : prev)))
      .catch(() => {
        /* работаем с данными из списка */
      });
  };

  const closeTask = () => {
    setSelectedTask(null);
    setTaskDetail(null);
    setAfterPhotoPreview(null);
    setSelectedFile(null);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      setNotice({ type: 'error', text: 'Фото должно быть в формате JPEG или PNG.' });
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setNotice({ type: 'error', text: 'Фото слишком большое: максимум 10 МБ.' });
      return;
    }
    setNotice(null);
    setSelectedFile(file);
    setAfterPhotoPreview(URL.createObjectURL(file));
  };

  // Завершение наряда: фото уходит в поле «image», version не нужен
  const handleCompleteTask = async () => {
    if (!selectedFile || !selectedTask) return;

    setIsSubmitting(true);
    setNotice(null);
    try {
      await api.completeContractorRequest(selectedTask.id, selectedFile);
      setNotice({ type: 'ok', text: `Наряд № ${selectedTask.id} закрыт со статусом «Выполнено».` });
      closeTask();
      setReloadTick((t) => t + 1);
    } catch (err) {
      // message от бэкенда: размер/формат фото (422, 413) и т.п.
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка завершения наряда' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (activeFilter === 'in_work') return t.status.code === 'in_progress';
      if (activeFilter === 'overdue') return t.is_overdue;
      if (activeFilter === 'done') return t.status.code === 'done';
      return true;
    });
  }, [tasks, activeFilter]);

  const pagedTasks = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredTasks.slice(start, start + PAGE_SIZE);
  }, [filteredTasks, page]);

  const counts = useMemo(
    () => ({
      all: tasks.length,
      in_work: tasks.filter((t) => t.status.code === 'in_progress').length,
      overdue: tasks.filter((t) => t.is_overdue).length,
      done: tasks.filter((t) => t.status.code === 'done').length,
    }),
    [tasks]
  );

  const TABS = [
    { id: 'all' as const, label: 'Все заявки', count: counts.all },
    { id: 'in_work' as const, label: 'В работе', count: counts.in_work },
    { id: 'overdue' as const, label: 'Просроченные', count: counts.overdue },
    { id: 'done' as const, label: 'Выполнено', count: counts.done },
  ];

  const badgeFor = (t: RequestSummary): { label: string; cls: string } => {
    if (t.is_overdue) return { label: 'Просрочен', cls: 'bg-[#FFDAD6] text-red-700' };
    if (t.status.code !== 'done' && remainingDetailed(t.planned_due_at).urgent) {
      return { label: 'Срочно', cls: 'bg-[#FFDBD0] text-[#7F2B0D]' };
    }
    return { label: 'В плане', cls: 'bg-neutral-100 text-neutral-600' };
  };


  // Шапка из макета «Веб/Подрядчики_Главный»: 64 px, полупрозрачная, имя справа с вертикальной чертой
  const header = (
    <header className="shrink-0 border-b border-neutral-200 bg-white py-[7px]">
      <div className="flex h-16 items-center justify-between bg-[rgba(250,248,255,0.8)] px-6 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-[12px]">
        <div className="flex items-center gap-[5px]">
          <img src={logoSvg} alt="NEO-СЕРВИС" className="h-9 w-[27px] shrink-0 object-contain" />
          <div className="text-xs font-light leading-normal text-black">
            NEO-СЕРВИС:
            <br />
            ЯМОЧНЫЙ РЕМОНТ
          </div>
        </div>

        <div className="flex h-9 items-center gap-3 border-l border-[#DAE2FD] pl-[21px]">
          <div className="text-right leading-tight">
            <div className="text-sm font-bold text-[#131B2E]">{shortName(me)}</div>
            <div className="text-xs text-neutral-800">Мастер участка. Подрядчик</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-700 text-white">
            <User className="h-3 w-3" />
          </div>
          <button
            onClick={onLogout}
            className="ml-1 text-xs text-neutral-600 hover:text-red-700 cursor-pointer transition-colors"
          >
            Выход
          </button>
        </div>
      </div>
    </header>
  );

  // ---------------- Открытая заявка («Веб/Подрядчики_Открытая заявка») ----------------
  if (selectedTask) {
    const due = remainingDetailed(selectedTask.planned_due_at);
    const isDone = selectedTask.status.code === 'done';
    const beforeUrl = taskDetail?.photo_before_url ?? null;
    const afterUrl = afterPhotoPreview ?? taskDetail?.photo_after_url ?? null;

    return (
      <div className="min-h-screen w-full bg-white text-neutral-800 antialiased flex flex-col">
        {header}
        <main className="flex-1 overflow-y-auto bg-neutral-100 px-8 pb-8 pt-6">
          <div className="mx-auto flex max-w-[1302px] flex-col gap-6">
            <div className="flex h-16 items-center justify-between rounded-xl bg-white px-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-4">
                <button
                  onClick={closeTask}
                  className="flex items-center gap-2 text-sm font-normal text-neutral-800 hover:text-red-700 cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Назад к списку заявок</span>
                </button>
                <span className="h-6 w-px bg-neutral-200" />
                <span className="text-sm text-neutral-800">ID {selectedTask.id}</span>
                <StatusPill code={selectedTask.status.code} label={selectedTask.status.label} />
              </div>

              {!isDone && selectedTask.planned_due_at && (
                <div className="flex h-8 items-center gap-2 rounded-lg bg-neutral-100 px-3 text-xs text-red-700">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    Срок : {formatDeadlineShort(selectedTask.planned_due_at)} ({due.label.toLowerCase()})
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 items-start gap-6">
              <div className="flex flex-col gap-6">
                <section className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <div className="flex items-start justify-between">
                    <h2 className="text-lg font-bold text-neutral-800">Параметры дефекта</h2>
                    {taskDetail?.street_group && (
                      <span className="rounded bg-neutral-100 px-2 py-1 text-[11px] font-bold uppercase text-neutral-800">
                        Категория {taskDetail.street_group}
                      </span>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl bg-neutral-100 p-4">
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                      <div>
                        <div className="text-sm font-bold text-neutral-800">
                          {selectedTask.address ? `г. Томск, ${selectedTask.address}` : 'Адрес не определён'}
                        </div>
                        {taskDetail?.location && (
                          <div className="mt-0.5 text-xs font-light text-neutral-600">
                            GPS: {taskDetail.location.lat.toFixed(4)}° N, {taskDetail.location.lon.toFixed(4)}° E
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 inline-block min-w-[220px] rounded-xl bg-neutral-100 p-3">
                    <div className="text-[11px] font-bold uppercase text-neutral-600">Класс ямы</div>
                    <div className="mt-1 text-sm font-bold text-red-700">{DEFECT_CLASS_LABEL[selectedTask.defect_class]} яма</div>
                  </div>
                </section>

                <section className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-neutral-800">Фотофиксация осмотра</h3>
                    <span className="rounded bg-[#FFDAD6] px-2 py-1 text-[11px] font-bold uppercase text-red-700">До ремонта</span>
                  </div>
                  {/* Ссылки на фото подписаны и живут 15 минут — не кэшируем */}
                  <div className="relative mt-4 h-[320px] overflow-hidden rounded-xl bg-neutral-100">
                    {beforeUrl ? (
                      <img src={beforeUrl} alt="До ремонта" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-neutral-400">
                        <ImageOff className="h-12 w-12" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/50 to-transparent px-4 pb-3 pt-8 text-xs text-white/90">
                      <Clock className="h-3 w-3" />
                      {formatDateTime(selectedTask.detected_at)}
                    </div>
                  </div>
                </section>
              </div>

              <section className="rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <h2 className="text-lg font-bold text-neutral-800">Сдача работ</h2>
                <p className="mt-1 text-xs font-light text-neutral-600">Фотофиксация выполнения и подтверждение закрытия</p>

                <div className="relative mt-4 h-[320px] overflow-hidden rounded-xl bg-neutral-100">
                  <span className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-800 shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                    ПОСЛЕ ремонта
                  </span>
                  {afterUrl ? (
                    <img src={afterUrl} alt="После ремонта" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center text-neutral-400">
                      <ImageOff className="mb-2 h-12 w-12" />
                      <span className="text-xs font-light">Фотография ещё не загружена</span>
                    </div>
                  )}
                </div>

                {notice?.type === 'error' && <div className="mt-3 text-xs text-red-700">{notice.text}</div>}

                {!isDone && (
                  <>
                    <label className="mt-2 flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-neutral-100 text-sm font-bold text-neutral-800 transition-colors hover:bg-neutral-200">
                      <Camera className="h-4 w-4" />
                      <span>{afterPhotoPreview ? 'Заменить фото' : 'Загрузить фото'}</span>
                      <input type="file" accept="image/jpeg,image/png" onChange={handlePhotoUpload} className="hidden" />
                    </label>

                    <button
                      onClick={handleCompleteTask}
                      disabled={!selectedFile || isSubmitting}
                      className={`mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors ${
                        selectedFile && !isSubmitting
                          ? 'cursor-pointer bg-red-700 text-white hover:bg-red-800'
                          : 'cursor-not-allowed bg-neutral-200 text-neutral-400'
                      }`}
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          <span>Подтвердить статус «Выполнено»</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </section>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ---------------- Список («Веб/Подрядчики_Главный») ----------------
  return (
    <div className="min-h-screen w-full bg-white text-neutral-800 antialiased flex flex-col">
      {header}
      <main className="flex-1 overflow-y-auto px-4 pb-6 pt-[14px]">
        <div className="mx-auto flex max-w-[1334px] flex-col gap-4">
          <div className="flex items-center justify-between pb-1">
            <div className="flex flex-col gap-0.5">
              <h1 className="text-2xl font-bold leading-tight text-neutral-800">Мои заявки</h1>
              {orgName && <p className="text-sm text-neutral-600">{orgName}</p>}
            </div>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-red-700" />}
          </div>

          {(notice || listState?.error) && (
            <div
              role="status"
              className={`rounded-xl border px-4 py-2.5 text-xs ${
                notice?.type === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-red-50 text-red-800'
              }`}
            >
              {notice?.text ?? `Не удалось загрузить наряды: ${listState?.error}`}
            </div>
          )}

          <div className="rounded-xl bg-white p-4 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-1 pb-1">
              {TABS.map((tab) => {
                const active = activeFilter === tab.id;
                const isOverdueTab = tab.id === 'overdue';
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveFilter(tab.id);
                      setPage(1);
                    }}
                    className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm cursor-pointer transition-colors ${
                      active ? 'bg-neutral-100 font-bold text-neutral-800' : 'font-normal'
                    } ${isOverdueTab ? 'text-[#BA1A1A]' : active ? '' : 'text-neutral-600'}`}
                  >
                    {isOverdueTab && <span className="h-1.5 w-1.5 rounded-full bg-[#BA1A1A]" />}
                    <span>{tab.label}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-[14px] ${
                        isOverdueTab
                          ? 'bg-[#FFDAD6] text-red-700'
                          : active
                          ? 'bg-[#DAE2FD] text-neutral-800'
                          : 'bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
            <div className="grid grid-cols-[286px_1fr_1fr_253px_1fr] items-center bg-neutral-100 px-[11px] py-2 text-[11px] font-bold uppercase tracking-[0.55px] text-neutral-600">
              <div>ID/ статус</div>
              <div>Адрес дефекта</div>
              <div>Плановый срок</div>
              <div className="text-center">Статус заявки</div>
              <div className="text-right">Действие</div>
            </div>

            {pagedTasks.map((t) => {
              const badge = badgeFor(t);
              const rem = remainingDetailed(t.planned_due_at);
              const hot = t.is_overdue || rem.urgent;
              return (
                <div
                  key={t.id}
                  className={`grid grid-cols-[286px_1fr_1fr_253px_1fr] items-start px-6 py-4 transition-colors hover:bg-neutral-100/60 ${
                    !t.is_overdue && rem.urgent ? 'bg-[rgba(242,243,255,0.4)]' : ''
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-neutral-800">№ ЗЯ-{t.id}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold leading-[14px] ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <span className="text-xs text-neutral-600">{formatDayTime(t.detected_at)}</span>
                  </div>

                  <div className="flex min-w-0 flex-col pr-4">
                    <span className="truncate text-sm font-bold leading-5 text-neutral-800">{t.address ?? '—'}</span>
                    <span className="text-xs text-neutral-600">{DEFECT_CLASS_LABEL[t.defect_class]} яма</span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-neutral-600">{formatDueLabel(t.planned_due_at)}</span>
                    {t.status.code !== 'done' && (
                      <span
                        className={`text-xs ${hot ? 'font-bold' : 'font-normal text-neutral-600'}`}
                        style={hot ? { color: t.is_overdue ? '#BA1A1A' : '#9E4123' } : undefined}
                      >
                        {rem.label}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-center">
                    <StatusPill code={t.status.code} label={t.status.label} />
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => openTask(t)}
                      className={`inline-flex h-4 items-center gap-1 text-xs cursor-pointer ${
                        hot ? 'text-red-700' : 'text-neutral-600'
                      }`}
                    >
                      <span>Открыть</span>
                      {hot ? <ArrowRight className="h-[11px] w-[11px]" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              );
            })}

            {!isLoading && filteredTasks.length === 0 && (
              <div className="py-12 text-center text-xs font-light text-neutral-500">Нарядов нет</div>
            )}

            <Pagination
              variant="footer"
              currentPage={page}
              totalItems={filteredTasks.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="заявок"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
