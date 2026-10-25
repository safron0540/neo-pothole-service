import { useState, useEffect, useMemo, useRef } from 'react';
import { Camera, ShieldCheck, Loader2, MapPin, History, ImageOff } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { api, ApiError } from '../../api';
import {
  CONTRACTORS,
  DEFECT_CLASS_LABEL,
  DEMO_REQUESTS,
  STREET_GROUPS,
  contractorName,
  type DefectClass,
  type RequestItem,
  type RequestStatus,
  type StreetGroup,
} from '../../data/reference';
import { formatDateTime, formatTime, remainingInfo } from '../../utils/format';

const QUEUE_STATUS: RequestStatus = 'На проверке';
const PAGE_SIZE = 4;

type SortBy = 'priority' | 'date';
type Notice = { type: 'ok' | 'error' | 'info'; text: string } | null;

// Порядок приоритета (REQ-ЯР-045): класс → группа улицы → плановая дата → дата подачи
function sortRequests(items: RequestItem[], sortBy: SortBy): RequestItem[] {
  const copy = [...items];
  if (sortBy === 'date') {
    return copy.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }
  return copy.sort((a, b) => {
    if (a.defect_class !== b.defect_class) return a.defect_class === 'big' ? -1 : 1;
    if (a.street_group !== b.street_group) return a.street_group.localeCompare(b.street_group, 'ru');
    const due = (a.planned_due ?? '').localeCompare(b.planned_due ?? '');
    if (due !== 0) return due;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });
}

interface DispatcherPageProps {
  // Заявка, которую нужно открыть (переход с карты)
  focusRequestId?: number | null;
}

export default function DispatcherPage({ focusRequestId = null }: DispatcherPageProps) {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [selected, setSelected] = useState<RequestItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  const [sortBy, setSortBy] = useState<SortBy>('priority');
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedClass, setSelectedClass] = useState<DefectClass>('big');
  const [selectedGroup, setSelectedGroup] = useState<StreetGroup>('А');
  const [selectedContractorId, setSelectedContractorId] = useState<number | ''>('');
  const [dispatcherNote, setDispatcherNote] = useState('');

  // Очередь: только заявки «На проверке»
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      let items: RequestItem[];
      try {
        const data = await api.getRequests({ status: QUEUE_STATUS, sort: 'priority' });
        items = (data.items ?? []).filter((r) => r.status === QUEUE_STATUS);
      } catch (err) {
        console.warn('Сервер недоступен, показаны демо-заявки:', (err as Error).message);
        items = DEMO_REQUESTS.filter((r) => r.status === QUEUE_STATUS);
        setNotice({ type: 'info', text: 'Сервер недоступен — показаны демо-данные, изменения сохраняются только на экране.' });
      }
      if (cancelled) return;
      setRequests(items);
      setSelected((prev) => prev ?? sortRequests(items, 'priority')[0] ?? null);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Переход с карты: показать нужную заявку (один раз), даже если она уже не в очереди
  const handledFocusId = useRef<number | null>(null);
  useEffect(() => {
    if (focusRequestId == null || isLoading || handledFocusId.current === focusRequestId) return;
    handledFocusId.current = focusRequestId;
    const inQueue = requests.find((r) => r.id === focusRequestId);
    if (inQueue) {
      setSelected(inQueue);
      return;
    }
    api
      .getRequestById(focusRequestId)
      .catch(() => DEMO_REQUESTS.find((r) => r.id === focusRequestId) ?? null)
      .then((r) => r && setSelected(r));
  }, [focusRequestId, isLoading, requests]);

  // Подгрузка деталей выбранной заявки (фото, история) и сброс формы решения
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selected) return;
    setSelectedClass(selected.defect_class);
    setSelectedGroup(selected.street_group);
    setSelectedContractorId(selected.contractor_id ?? '');
    setDispatcherNote('');
    setPhotoFailed(false);

    let cancelled = false;
    api
      .getRequestById(selected.id)
      .then((details) => {
        if (!cancelled) setSelected((prev) => (prev && prev.id === details.id ? { ...prev, ...details } : prev));
      })
      .catch(() => {
        /* работаем с тем, что уже есть в списке */
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const sorted = useMemo(() => sortRequests(requests, sortBy), [requests, sortBy]);
  const pagedRequests = useMemo(
    () => sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [sorted, currentPage]
  );

  const canDecide = selected?.status === QUEUE_STATUS;

  const handleDecision = async (to: 'Принято' | 'Требует уточнения' | 'Отклонено') => {
    if (!selected || !canDecide) return;

    if (to === 'Отклонено' && !dispatcherNote.trim()) {
      setNotice({ type: 'error', text: 'Для отклонения заявки укажите причину в служебном комментарии.' });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    let offline = false;
    let version = selected.version;

    try {
      const fieldsChanged = selectedClass !== selected.defect_class || selectedGroup !== selected.street_group;
      if (fieldsChanged) {
        const res = await api.updateRequestFields(selected.id, {
          defect_class: selectedClass,
          street_group: selectedGroup,
          version,
        });
        version = res.version ?? version;
      }
      if (selectedContractorId !== '' && selectedContractorId !== (selected.contractor_id ?? '')) {
        await api.setRequestContractor(selected.id, selectedContractorId);
      }
      const res = await api.updateRequestStatus(selected.id, to, version, dispatcherNote.trim());
      version = res.version ?? version + 1;
    } catch (err) {
      if (err instanceof ApiError) {
        setNotice({
          type: 'error',
          text: err.status === 409 ? 'Заявка была изменена другим пользователем. Обновите страницу и повторите.' : err.message,
        });
        setIsSubmitting(false);
        return;
      }
      offline = true; // сеть недоступна — применяем локально (демо-режим)
      version += 1;
    }

    const updated: RequestItem = {
      ...selected,
      status: to,
      version,
      defect_class: selectedClass,
      street_group: selectedGroup,
      contractor_id: selectedContractorId === '' ? selected.contractor_id : selectedContractorId,
      contractor_name:
        selectedContractorId === '' ? selected.contractor_name : contractorName(selectedContractorId),
      history: [
        ...(selected.history ?? []),
        { time: new Date().toISOString(), status_from: selected.status, status_to: to, user: 'Иванова Е. А.' },
      ],
    };

    // Решённая заявка уходит из очереди, выбираем следующую
    const rest = sortRequests(requests.filter((r) => r.id !== selected.id), sortBy);
    const idx = sorted.findIndex((r) => r.id === selected.id);
    setRequests(rest);
    setSelected(rest[Math.min(Math.max(idx, 0), rest.length - 1)] ?? updated);
    setCurrentPage((p) => Math.min(p, Math.max(1, Math.ceil(rest.length / PAGE_SIZE))));
    setNotice({
      type: offline ? 'info' : 'ok',
      text: `Заявка № ${selected.id} переведена в статус «${to}»${offline ? ' (только на экране: сервер недоступен)' : ''}.`,
    });
    setIsSubmitting(false);
  };

  const selectedRemaining = remainingInfo(selected?.planned_due);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 font-sans text-neutral-800 antialiased">
      <header className="px-8 pt-6 pb-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-neutral-900">Требует решения: Новые заявки</h1>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-red-700" />}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-400 font-medium">Сортировка:</span>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortBy);
              setCurrentPage(1);
            }}
            className="h-8 px-3 bg-white border border-neutral-300 rounded-xl font-semibold outline-none focus:border-red-600 shadow-sm"
          >
            <option value="priority">По срочности ГОСТ (приоритет)</option>
            <option value="date">По дате подачи</option>
          </select>
        </div>
      </header>

      {notice && (
        <div
          role="status"
          className={`mx-8 mb-3 px-4 py-2.5 rounded-xl text-xs font-medium border shrink-0 flex items-center justify-between ${
            notice.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : notice.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="ml-4 font-bold cursor-pointer" aria-label="Закрыть">
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 px-8 pb-6 flex gap-6 overflow-hidden">
        <section className="w-80 flex flex-col shrink-0">
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
            Очередь на подтверждение ({requests.length})
          </h2>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {!isLoading && requests.length === 0 && (
              <div className="bg-white rounded-2xl p-6 border border-neutral-200 text-center text-xs text-neutral-400">
                Новых заявок нет
              </div>
            )}
            {pagedRequests.map((item) => {
              const isSelected = selected?.id === item.id;
              const rem = remainingInfo(item.planned_due);
              return (
                <div
                  key={item.id}
                  onClick={() => setSelected(item)}
                  className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-sm hover:shadow ${
                    isSelected ? 'border-red-600 ring-2 ring-red-100' : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded text-white ${
                        rem.urgent ? 'bg-red-700' : 'bg-amber-600'
                      }`}
                    >
                      {rem.label}
                    </span>
                    <span className="text-xs text-neutral-400">{formatTime(item.created_at)}</span>
                  </div>

                  <div className="flex gap-3 items-center">
                    <div className="w-12 h-12 rounded-xl bg-neutral-100 border border-neutral-200 flex items-center justify-center text-neutral-400 shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div className="truncate">
                      <div className="text-xs text-neutral-400 font-medium">
                        № {item.id} (v.{item.version})
                      </div>
                      <div className="text-sm font-bold text-neutral-900 truncate">{item.address}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">
                        {DEFECT_CLASS_LABEL[item.defect_class]} яма · группа {item.street_group}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 p-2 shadow-sm mt-3">
            <Pagination
              currentPage={currentPage}
              totalItems={requests.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              itemLabel="заявок"
            />
          </div>
        </section>

        <main className="flex-1 bg-white rounded-3xl border border-neutral-200 shadow-sm p-6 overflow-y-auto">
          {selected ? (
            <div className="flex flex-col gap-5 max-w-4xl">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-neutral-900">Карточка заявки № {selected.id}</h2>
                  <span className="bg-neutral-500 text-white text-xs px-2.5 py-0.5 rounded-full font-medium">
                    {selected.status}
                  </span>
                  <span className="text-xs text-neutral-400 font-mono">v.{selected.version}</span>
                </div>
                <p className="text-xs text-neutral-400 mt-1">
                  Зарегистрировано в системе: {formatDateTime(selected.created_at)} (Томск)
                </p>
                {!canDecide && (
                  <p className="text-xs text-amber-700 mt-1">
                    Заявка не в очереди на проверку — доступен только просмотр.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-2">Фото дефекта</label>
                  {selected.photo_url && !photoFailed ? (
                    <img
                      src={selected.photo_url}
                      alt="Фото дефекта"
                      onError={() => setPhotoFailed(true)}
                      className="w-full h-56 rounded-2xl object-cover border border-neutral-200 bg-neutral-100"
                    />
                  ) : (
                    <div className="w-full h-56 rounded-2xl bg-neutral-100 border border-neutral-200 flex flex-col items-center justify-center text-neutral-400 p-4">
                      <ImageOff className="w-10 h-10 mb-2" />
                      <span className="text-xs font-bold uppercase tracking-wider text-center">
                        Фото не загружено
                      </span>
                    </div>
                  )}
                  <div className="text-xs text-neutral-500 mt-2">
                    Заявитель:{' '}
                    <span className="text-neutral-800">
                      {selected.applicant_phone ?? '—'} {selected.applicant_name ?? ''}
                    </span>
                  </div>
                </div>

                <div className="space-y-3.5">
                  <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
                    <div className="text-xs text-neutral-400">Адрес дефекта</div>
                    <div className="text-sm font-semibold text-neutral-900 mt-0.5">
                      {selected.full_address ?? selected.address}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-neutral-500 mt-1.5">
                      <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                      {selected.lat != null && selected.lon != null
                        ? `${selected.lat.toFixed(5)}, ${selected.lon.toFixed(5)}`
                        : 'Координаты не указаны'}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-neutral-50 rounded-xl p-3 border border-neutral-100">
                      <div className="text-xs text-neutral-400">Плановый срок ГОСТ</div>
                      <div className={`text-xs font-bold mt-1 ${selectedRemaining.urgent ? 'text-red-600' : 'text-neutral-800'}`}>
                        {formatDateTime(selected.planned_due)}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5">{selectedRemaining.label}</div>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-600 mb-1">Класс ямы</label>
                      <select
                        value={selectedClass}
                        disabled={!canDecide}
                        onChange={(e) => setSelectedClass(e.target.value as DefectClass)}
                        className="w-full h-11 px-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none disabled:bg-neutral-50"
                      >
                        <option value="big">Большая</option>
                        <option value="small">Маленькая</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-neutral-600 mb-1">Группа улицы</label>
                      <select
                        value={selectedGroup}
                        disabled={!canDecide}
                        onChange={(e) => setSelectedGroup(e.target.value as StreetGroup)}
                        className="w-full h-11 px-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none disabled:bg-neutral-50"
                      >
                        {STREET_GROUPS.map((g) => (
                          <option key={g} value={g}>
                            Категория {g}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-neutral-600 mb-1">Подрядчик</label>
                      <select
                        value={selectedContractorId}
                        disabled={!canDecide}
                        onChange={(e) => setSelectedContractorId(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full h-11 px-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none disabled:bg-neutral-50"
                      >
                        <option value="">Не назначен</option>
                        {CONTRACTORS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-3 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-red-600 shrink-0" />
                    <span className="text-xs font-semibold text-neutral-800">
                      Рекомендация системы: «{selected.recommended_status ?? 'Принято'}»
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 mb-2">
                  <History className="w-3.5 h-3.5 text-neutral-400" />
                  <span>История статусов</span>
                </div>
                {selected.history && selected.history.length > 0 ? (
                  <ul className="space-y-1.5 border-l-2 border-neutral-200 pl-4">
                    {selected.history.map((h, i) => (
                      <li key={i} className="text-xs text-neutral-600">
                        <span className="text-neutral-400">{formatDateTime(h.time)}</span>{' '}
                        <span className="font-semibold text-neutral-800">
                          {h.status_from ? `${h.status_from} → ` : ''}
                          {h.status_to}
                        </span>{' '}
                        <span className="text-neutral-400">· {h.user}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-neutral-400">История пока пуста</div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                  Служебный комментарий / причина отклонения:
                </label>
                <textarea
                  rows={2}
                  value={dispatcherNote}
                  disabled={!canDecide}
                  onChange={(e) => setDispatcherNote(e.target.value)}
                  placeholder="Обязательно для статуса «Отклонено»..."
                  className="w-full p-3 text-sm bg-white border border-neutral-300 rounded-xl outline-none disabled:bg-neutral-50"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting || !canDecide}
                  onClick={() => handleDecision('Принято')}
                  className="flex-1 py-3 px-4 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Подтвердить статус «Принято»
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !canDecide}
                  onClick={() => handleDecision('Требует уточнения')}
                  className="flex-1 py-3 px-4 bg-neutral-400 hover:bg-neutral-500 text-white text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Запросить уточнение
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !canDecide}
                  onClick={() => handleDecision('Отклонено')}
                  className="flex-1 py-3 px-4 bg-red-800 hover:bg-red-900 text-white text-sm font-semibold rounded-xl cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Отклонить заявку
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
              {isLoading ? 'Загрузка заявок…' : 'Выберите заявку из списка'}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
