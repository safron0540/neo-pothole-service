import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Pagination } from '../../components/Pagination';
import { api, ApiError } from '../../api';
import type {
  DefectClass,
  DispatcherRequestOut,
  DispatcherRequestSummary,
  RejectReason,
  EventOut,
  EventType,
  StatusCode,
  StreetGroupCode,
} from '../../api';
import { DEFECT_CLASS_LABEL, STATUS_COLOR, statusLabel } from '../../data/reference';
import { useReference } from '../../data/useReference';
import { formatDateTime, formatTime, remainingChip, remainingInfo } from '../../utils/format';
import { Icon } from '../../components/Icon';

import { CameraIcon, ImageOffIcon, Spinner } from '../../components/UiIcons';
const PAGE_SIZE = 4;

type QueueTab = 'new' | 'clarify' | 'overdue';

const QUEUE_TABS: { id: QueueTab; label: string; title: string }[] = [
  { id: 'new', label: 'Новые', title: 'Новые заявки' },
  { id: 'clarify', label: 'На уточнении', title: 'Ожидают уточнения' },
  { id: 'overdue', label: 'Просроченные', title: 'Просроченные заявки' },
];
type Notice = { type: 'ok' | 'error' | 'info'; text: string } | null;
type Decision = Extract<StatusCode, 'accepted' | 'needs_clarification' | 'rejected'>;

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Неизвестная ошибка');

const EVENT_LABEL: Record<EventType, string> = {
  created: 'Заявка создана',
  processed: 'Обработана системой',
  status_changed: 'Смена статуса',
  class_changed: 'Изменён класс ямы',
  group_changed: 'Изменена группа улицы',
  contractor_changed: 'Назначен подрядчик',
  merged: 'Слита с основной заявкой',
  duplicate_flag_removed: 'Снята пометка «дубликат»',
  note_added: 'Добавлена заметка',
};

// В макете выбора причины нет, а контракт API требует reject_reason: выводим её автоматически
function defaultRejectReason(d: DispatcherRequestOut): RejectReason {
  if (d.duplicate_of_id != null) return 'duplicate';
  if (d.defect_class === 'small') return 'small_pit';
  return 'other';
}

function describeEvent(e: EventOut): string {
  if (e.type === 'status_changed') {
    const from = typeof e.payload.from === 'string' ? statusLabel(e.payload.from) : null;
    const to = typeof e.payload.to === 'string' ? statusLabel(e.payload.to) : '';
    return from ? `${from} → ${to}` : to || EVENT_LABEL.status_changed;
  }
  return EVENT_LABEL[e.type] ?? e.type;
}

interface DispatcherPageProps {
  // Заявка, которую нужно открыть (переход с карты)
  focusRequestId?: number | null;
}

export default function DispatcherPage({ focusRequestId = null }: DispatcherPageProps) {
  const [notice, setNotice] = useState<Notice>(null);
  const [queueTab, setQueueTab] = useState<QueueTab>('new');
  const [page, setPage] = useState(1);
  const [queueTick, setQueueTick] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(focusRequestId);

  // ---- Очередь «На проверке»: сортировку и страницы делает бэкенд ----
  const queueKey = `${queueTab}|${page}|${queueTick}`;
  const [queue, setQueue] = useState<{
    key: string;
    items: DispatcherRequestSummary[];
    total: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getRequests({
        // «Новые» — на проверке; «На уточнении» — ждут ответа заявителя; «Просроченные» — оба статуса с просроченным сроком
        status: queueTab === 'clarify' ? ['needs_clarification'] : queueTab === 'overdue' ? ['on_review', 'needs_clarification'] : ['on_review'],
        overdue: queueTab === 'overdue' ? true : undefined,
        sort: 'priority',
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      .then((data) => {
        if (cancelled) return;
        // Решили последнюю заявку на странице — возвращаемся на предыдущую
        if (data.items.length === 0 && data.total > 0 && page > 1) {
          setPage(page - 1);
          return;
        }
        setQueue({ key: queueKey, items: data.items, total: data.total });
      })
      .catch((err: unknown) => {
        if (!cancelled) setQueue({ key: queueKey, items: [], total: 0, error: errorText(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [queueKey, queueTab, page]);

  const isQueueLoading = queue?.key !== queueKey;
  const items = queue?.items ?? [];
  const total = queue?.total ?? 0;

  // Как в макете: пока заявка не выбрана, справа подсказка «Выберите заявку из списка слева»
  const activeId = selectedId;

  // ---- Карточка выбранной заявки: детали и история ----
  const [detailState, setDetailState] = useState<{
    id: number;
    detail: DispatcherRequestOut | null;
    events: EventOut[];
    error?: string;
  } | null>(null);
  const [detailTick, setDetailTick] = useState(0);

  useEffect(() => {
    if (activeId == null) return;
    let cancelled = false;
    Promise.all([api.getRequestById(activeId), api.getRequestEvents(activeId).catch(() => [] as EventOut[])])
      .then(([detail, events]) => {
        if (!cancelled) setDetailState({ id: activeId, detail, events });
      })
      .catch((err: unknown) => {
        if (!cancelled) setDetailState({ id: activeId, detail: null, events: [], error: errorText(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, detailTick]);

  const current = detailState && detailState.id === activeId ? detailState : null;
  const isDetailLoading = activeId != null && current === null;

  // Решение принято: показываем сообщение, берём следующую заявку и перечитываем очередь
  const handleDecided = (decidedId: number, text: string) => {
    const idx = items.findIndex((r) => r.id === decidedId);
    const next = items[idx + 1] ?? items[idx - 1] ?? null;
    setSelectedId(next ? next.id : null);
    setNotice({ type: 'ok', text });
    setQueueTick((t) => t + 1);
  };

  // 409: заявку изменил другой диспетчер — показываем сообщение и перечитываем данные
  const handleConflict = (message: string) => {
    setNotice({ type: 'error', text: message });
    setDetailTick((t) => t + 1);
    setQueueTick((t) => t + 1);
  };

  const queueNotice = queue?.error ? { type: 'error' as const, text: `Не удалось загрузить очередь: ${queue.error}` } : null;
  const shownNotice = notice ?? queueNotice;

  const CHIP_TONE = {
    red: 'bg-red-700 text-white',
    orange: 'bg-orange-500 text-white',
    gray: 'bg-neutral-100 text-[#131B2E]',
  } as const;

  // Макет «Веб/Треб_панель»: заголовок 42 px, колонки 327 px + 40 px зазор + карточка, поля 24 px
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 text-neutral-800 antialiased">
      <header className="min-h-[42px] px-4 sm:px-6 py-1 flex items-center gap-3 shrink-0 border-b border-neutral-200">
        <h1 className="text-xl sm:text-2xl font-bold leading-tight text-neutral-800">
          Требует решения: {QUEUE_TABS.find((tab) => tab.id === queueTab)?.title}
        </h1>
        {isQueueLoading && <Spinner className="w-4 h-4 animate-spin text-red-700" />}
      </header>

      {shownNotice && (
        <div
          role="status"
          className={`mx-4 sm:mx-6 mt-2 px-4 py-2 rounded-xl text-xs border shrink-0 flex items-center justify-between ${
            shownNotice.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : shownNotice.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <span>{shownNotice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="ml-4 cursor-pointer" aria-label="Закрыть">
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 px-4 sm:px-6 pt-[10px] pb-4 flex flex-col lg:flex-row gap-4 lg:gap-10 overflow-y-auto lg:overflow-hidden">
        <section className="w-full lg:w-[327px] shrink-0 min-h-0 flex flex-col gap-[10px]">
          <div className="text-xs font-light text-neutral-800 uppercase">Очередь на подтверждение</div>

          <div role="tablist" aria-label="Тип заявок" className="flex flex-wrap items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1">
            {QUEUE_TABS.map((tab) => {
              const active = queueTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setQueueTab(tab.id);
                    setPage(1);
                    setSelectedId(null);
                  }}
                  className={`flex-1 whitespace-nowrap px-2 py-1 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    active ? 'bg-red-700 text-white shadow-sm' : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-[10px] min-h-0 flex-1 lg:overflow-y-auto">
            {!isQueueLoading && items.length === 0 && (
              <div className="bg-white rounded-xl p-6 border border-neutral-200 text-center text-xs text-neutral-500">
                {queueTab === 'new' ? 'Новых заявок нет' : queueTab === 'clarify' ? 'Нет заявок на уточнении' : 'Просроченных заявок нет'}
              </div>
            )}
            {items.map((item) => {
              const isSelected = activeId === item.id;
              const chip = remainingChip(item.planned_due_at);
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`bg-white rounded-xl p-[17px] flex flex-col gap-3 cursor-pointer border transition-colors ${
                    isSelected
                      ? 'border-red-700 shadow-[0_1px_1px_rgba(0,0,0,0.05)]'
                      : 'border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[11px] leading-[16px] font-normal ${CHIP_TONE[chip.tone]}`}>
                      {chip.label}
                    </span>
                    <span className="text-xs text-neutral-600">{formatDateTime(item.detected_at)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 shrink-0 rounded-lg border border-neutral-200 bg-neutral-100 flex items-center justify-center text-neutral-400">
                      <CameraIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-neutral-600">ID {item.id}</div>
                      <div className="text-sm text-[#131B2E] truncate leading-[22px]">{item.address ?? 'Адрес не определён'}</div>
                      <div className="text-xs text-neutral-600 pt-0.5 truncate">
                        {DEFECT_CLASS_LABEL[item.defect_class]} яма
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Как в макете: плашка «Показано 4 из 8» прижата к низу колонки */}
          <div className="mt-auto rounded-xl bg-white px-2 py-3 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
            <Pagination currentPage={page} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>
        </section>

        <main className="flex-1 min-w-0 min-h-[320px] lg:min-h-0 overflow-y-auto bg-white border border-[#DAE2FD] rounded-2xl shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
          {current?.detail ? (
            <RequestCard
              key={current.detail.id}
              detail={current.detail}
              events={current.events}
              onDecided={handleDecided}
              onConflict={handleConflict}
              onError={(text) => setNotice({ type: 'error', text })}
            />
          ) : current?.error ? (
            <div className="h-full flex items-center justify-center text-sm text-neutral-600 p-6">
              Не удалось загрузить заявку: {current.error}
            </div>
          ) : isDetailLoading ? (
            <div className="h-full flex items-center justify-center">
              <Spinner className="w-5 h-5 animate-spin text-red-700" />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center px-10">
              <Icon name="empty-tap" className="mb-4" />
              <h2 className="text-lg font-bold text-neutral-800">Выберите заявку из списка слева</h2>
              <p className="mt-2 max-w-[360px] text-xs font-light text-neutral-600">
                Нажмите на заявку из очереди, чтобы просмотреть фотофиксацию, параметры дефекта по ГОСТ и перевести в работу.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Карточка заявки с формой решения. Пересоздаётся (key) при смене заявки,
// поэтому начальные значения полей берутся прямо из detail.
// ---------------------------------------------------------------------------
interface RequestCardProps {
  detail: DispatcherRequestOut;
  events: EventOut[];
  onDecided: (id: number, text: string) => void;
  onConflict: (message: string) => void;
  onError: (text: string) => void;
}

function RequestCard({ detail, events, onDecided, onConflict, onError }: RequestCardProps) {
  const { streetGroups, contractors } = useReference();

  const [selectedClass, setSelectedClass] = useState<DefectClass>(detail.defect_class);
  const [selectedGroup, setSelectedGroup] = useState<StreetGroupCode | ''>(detail.street_group ?? '');
  const [selectedContractorId, setSelectedContractorId] = useState<number | ''>(detail.contractor?.id ?? '');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const submitting = useRef(false);

  const canDecide = detail.status.code === 'on_review' || detail.status.code === 'needs_clarification';
  const canAskClarification = detail.status.code === 'on_review';
  const remaining = remainingInfo(detail.planned_due_at);

  // Неактивных подрядчиков в выборе не показываем (кроме уже назначенного)
  const contractorOptions = contractors.filter((c) => c.is_active || c.id === detail.contractor?.id);

  const handleDecision = async (to: Decision) => {
    if (!canDecide || submitting.current) return;
    setFormError(null);

    if (to === 'rejected') {
      if (!note.trim()) return setFormError('Для отклонения заявки укажите комментарий.');
    }
    if (to === 'accepted' && !selectedGroup) {
      return setFormError('Чтобы принять заявку, выберите группу улицы.');
    }

    submitting.current = true;
    setIsSubmitting(true);
    try {
      // Каждый запрос возвращает полную карточку с новым version — берём его для следующего шага
      let version = detail.version;
      if (selectedClass !== detail.defect_class) {
        version = (await api.updateRequestClass(detail.id, selectedClass, version)).version;
      }
      if (selectedGroup && selectedGroup !== detail.street_group) {
        version = (await api.updateRequestStreetGroup(detail.id, selectedGroup, version)).version;
      }
      if (selectedContractorId !== '' && selectedContractorId !== detail.contractor?.id) {
        version = (await api.setRequestContractor(detail.id, selectedContractorId, version)).version;
      }
      const result = await api.updateRequestStatus(detail.id, {
        to,
        version,
        comment: note.trim() || undefined,
        reject_reason: to === 'rejected' ? defaultRejectReason(detail) : undefined,
      });
      onDecided(detail.id, `Заявка № ${detail.id} переведена в статус «${result.status.label}».`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        onConflict(err.message); // «заявку уже изменил другой диспетчер» и др. — текст с бэкенда
      } else {
        onError(errorText(err));
      }
    } finally {
      submitting.current = false;
      setIsSubmitting(false);
    }
  };

  const statusColor = STATUS_COLOR[detail.status.code];

  return (
    <div className="p-[25px] flex flex-col gap-3">
      <div className="border-b border-[#DAE2FD] pb-[17px] flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-normal text-[#131B2E]">Карточка заявки ID {detail.id}</h2>
          <span
            className="px-3 h-[15px] leading-[15px] rounded-xl text-[11px] font-light text-white"
            style={{ backgroundColor: statusColor }}
          >
            {detail.status.label}
          </span>
          <span className="text-xs font-light text-neutral-500">v.{detail.version}</span>
        </div>
        <p className="text-xs font-light text-neutral-600">
          Подано {formatDateTime(detail.detected_at).replace(' ', ' в ')}
        </p>
        {!canDecide && (
          <p className="text-xs text-amber-800">Решение по этой заявке уже принято — доступен только просмотр.</p>
        )}
        {detail.duplicate_of_id != null && (
          <p className="text-xs text-amber-800">Возможный дубликат заявки № {detail.duplicate_of_id}.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-5 flex flex-col gap-[7.5px]">
          <div className="text-sm text-neutral-800">Фото дефекта</div>
          {/* Ссылки на фото подписаны и живут 15 минут — не кэшируем */}
          <div className="h-[224px] rounded-xl border border-neutral-200 bg-neutral-100 overflow-hidden flex items-center justify-center">
            {detail.photo_before_url && !photoFailed ? (
              <img
                src={detail.photo_before_url}
                alt="Фото дефекта"
                onError={() => setPhotoFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center text-neutral-500 text-center">
                <ImageOffIcon className="w-10 h-10 mb-2" />
                <span className="text-xs uppercase font-bold leading-tight">
                  Фото временно
                  <br />
                  отсутствует
                </span>
              </div>
            )}
          </div>
          <div className="px-1 text-xs text-neutral-600">
            {/* Как в макете: «Заявитель: телефон ФИО» под фото. API отдаёт контакты не на всех статусах */}
            {detail.applicant && (
              <>
                Заявитель: {detail.applicant.phone} {detail.applicant.last_name} {detail.applicant.first_name}
              </>
            )}
          </div>
        </div>

        <div className="md:col-span-7 flex flex-col gap-[10px]">
          <div className="bg-neutral-100 rounded-xl p-3 flex flex-col gap-1">
            <div className="text-sm text-neutral-600">Адрес дефекта</div>
            <div className="text-xs font-light text-neutral-800">
              {detail.address ? `г. Томск, ${detail.address}` : 'Адрес не определён'}
            </div>
          </div>

          <div className="flex gap-3 items-start">
            <div className="flex-1 min-w-0 h-[79px] bg-neutral-100 rounded-xl px-3 pt-3 pb-[10px] flex flex-col gap-1">
              <div className="text-sm text-neutral-600 leading-tight">
                Плановая дата
                <br />
                устранения
              </div>
              <div className="text-xs font-light text-red-700">
                {detail.planned_due_at ? `${formatDateTime(detail.planned_due_at)} (${remaining.label})` : '—'}
              </div>
            </div>
            <FieldSelect
              label="Класс ямы"
              className="w-[171px] shrink-0"
              value={selectedClass}
              disabled={!canDecide}
              onChange={(v) => setSelectedClass(v as DefectClass)}
            >
              <option value="big">Большая</option>
              <option value="small">Маленькая</option>
            </FieldSelect>
          </div>

          <div className="flex gap-1 items-start">
            <FieldSelect
              label="Группа улицы"
              className="w-[171px] shrink-0"
              value={selectedGroup}
              disabled={!canDecide}
              onChange={(v) => setSelectedGroup(v as StreetGroupCode | '')}
            >
              <option value="">Не выбрана</option>
              {streetGroups.map((g) => (
                <option key={g.code} value={g.code}>
                  Категория {g.code}
                </option>
              ))}
            </FieldSelect>
            <FieldSelect
              label="Подрядчик"
              className="flex-1 min-w-0"
              value={selectedContractorId === '' ? '' : String(selectedContractorId)}
              disabled={!canDecide}
              onChange={(v) => setSelectedContractorId(v === '' ? '' : Number(v))}
            >
              <option value="">Не назначен</option>
              {contractorOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </FieldSelect>
          </div>

          <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-[15px] flex items-center gap-3">
            <Icon name="shield" className="w-[15px] h-[19px] text-red-700 shrink-0" />
            <span className="text-sm text-neutral-800">Рекомендованный статус: «{detail.recommendation.label}»</span>
          </div>
        </div>
      </div>

      <div className="bg-neutral-100 border border-neutral-200 rounded-xl p-[15px] text-sm text-black">
        {detail.citizen_comment ? `Комментарий заявителя: ${detail.citizen_comment}` : 'Комментарий заявителя отсутствует.'}
      </div>

      <div className="border-t border-neutral-200 pt-[11px] flex flex-col gap-[10px]">
        <div className="flex items-center gap-1.5 text-sm text-neutral-800">
          <Icon name="history" className="w-[14px] h-[14px] text-red-700" />
          <span>История заявки</span>
        </div>
        {events.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {events.map((h) => (
              <li key={h.id} className="flex items-center gap-2 text-xs font-light">
                <span className="w-1.5 h-1.5 rounded-full bg-red-700 shrink-0" />
                <span className="text-neutral-800">{formatTime(h.created_at)}</span>
                <span className="text-neutral-600">
                  — {describeEvent(h)} · {h.actor}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-xs font-light text-neutral-500">История пока пуста</div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <label htmlFor="decision-note" className="text-sm text-neutral-800">
          Добавьте комментарий:
        </label>
        <textarea
          id="decision-note"
          value={note}
          disabled={!canDecide}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Обязателен для статуса «Отклонено»"
          className="h-[46px] w-full resize-none rounded-md border-2 border-neutral-400 bg-white px-3 py-2 text-sm shadow-[0_4px_8px_rgba(0,0,0,0.15)] outline-none placeholder:text-neutral-400 focus:border-red-700 disabled:bg-neutral-100"
        />
      </div>

      {formError && <div className="text-xs text-red-700">{formError}</div>}

      <div className="border-t border-[#DAE2FD] pt-[11px] flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={isSubmitting || !canDecide}
          onClick={() => handleDecision('accepted')}
          className="h-[43px] w-full sm:w-[194px] rounded-xl bg-red-700 hover:bg-red-800 text-sm font-normal text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Подтвердить статус “Принято”
        </button>
        <button
          type="button"
          disabled={isSubmitting || !canAskClarification}
          onClick={() => handleDecision('needs_clarification')}
          className="h-[43px] w-full sm:w-[187px] rounded-xl bg-neutral-400 hover:bg-neutral-500 text-sm font-normal text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Запросить уточнение
        </button>
        <button
          type="button"
          disabled={isSubmitting || !canDecide}
          onClick={() => handleDecision('rejected')}
          className="h-[43px] w-full sm:w-[194px] rounded-xl bg-red-700 hover:bg-red-800 text-sm font-normal text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Отклонить заявку
        </button>
      </div>
    </div>
  );
}

// Поле-список по макету: подпись 14 px, рамка #9E9E9E, радиус 12, шеврон справа
function FieldSelect({
  label,
  value,
  onChange,
  disabled,
  className = '',
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-sm text-neutral-600">{label}</span>
      <span className="relative block">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-[45px] w-full appearance-none truncate rounded-xl border border-neutral-400 bg-white pl-[15px] pr-8 text-sm text-neutral-800/80 shadow-[0_2px_2px_rgba(0,0,0,0.04)] outline-none focus:border-red-700 disabled:bg-neutral-100"
        >
          {children}
        </select>
        <Icon name="chevron-down" className="pointer-events-none absolute right-[9px] top-1/2 h-3 w-3 -translate-y-1/2 text-neutral-800" />
      </span>
    </label>
  );
}
