import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { Pagination } from '../../components/Pagination';
import { api } from '../../api';
import type { ContractorIn, ContractorOut, GeoMultiPolygon } from '../../api';
import { useReference } from '../../data/useReference';
import { useContractorDistricts } from '../../data/contractorDistricts';
import { useContractorContacts } from '../../data/useContractorContacts';
import { shortDistrict } from '../../utils/format';

import { Icon } from '../../components/Icon';
import { Dropdown } from '../../components/Dropdown';
import { CloseIcon } from '../../components/UiIcons';
// Показатели и история заявок появятся с этапом 2 API (отчёты, рейтинг): пока одинаковые для всех подрядчиков
const DEMO_STATS = {
  total: 142,
  closed: 138,
  inProgress: 4,
  onTimePercent: 96.4,
  onTimeCount: 137,
  delayedCount: 5,
  avgTimeHours: 18.4,
};

interface DemoTask {
  address: string;
  assigned: string;
  duration: string;
  overdueBy?: string;
  status: 'Выполнено' | 'В работе';
}

const DEMO_TASKS: DemoTask[] = [
  { assigned: '28.04.2025, 14:32', address: 'ул. Вершинина, 24', duration: '14 ч 20 мин', status: 'Выполнено' },
  { assigned: '26.04.2025, 09:15', address: 'Иркутский тракт, 19', duration: '19 ч 45 мин', status: 'Выполнено' },
  { assigned: '24.04.2025, 11:50', address: 'ул. Вершинина, 24', duration: '26 ч 10 мин', overdueBy: '+2 ч 10 мин', status: 'В работе' },
  { assigned: '22.04.2025, 16:00', address: 'ул. Вершинина, 24', duration: '12 ч 10 мин', status: 'В работе' },
];

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Неизвестная ошибка');

// Зона вводится как GeoJSON MultiPolygon, координаты [долгота, широта]
function parseZone(raw: string): { zone: GeoMultiPolygon | null } | { error: string } {
  if (!raw.trim()) return { zone: null };
  try {
    const value = JSON.parse(raw) as Partial<GeoMultiPolygon>;
    if (value.type !== 'MultiPolygon' || !Array.isArray(value.coordinates)) {
      return { error: 'Зона должна быть GeoJSON-объектом типа MultiPolygon.' };
    }
    return { zone: value as GeoMultiPolygon };
  } catch {
    return { error: 'Зона: некорректный JSON.' };
  }
}

export default function ContractorsPage() {
  const { contractors, districts, error: referenceError, reload } = useReference();

  const [period, setPeriod] = useState('Апрель 2025');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;

  // Пока подрядчик не выбран, справа подсказка «Выберите подрядчика из списка слева» (как в макете)
  const selected: ContractorOut | null = contractors.find((c) => c.id === selectedId) ?? null;
  const { assignments } = useContractorDistricts();
  const contacts = useContractorContacts();

  // Демо-история: строки повторяются по кругу, номера заявок меняются от страницы к странице
  const currentTasks = useMemo(
    () =>
      DEMO_TASKS.map((task, i) => ({
        ...task,
        id: i === 0 && page === 1 ? 'ID' : `№ ЗЯ-2024-${String(908 - (page - 1) * PAGE_SIZE - i * 4).padStart(4, '0')}`,
      })),
    [page]
  );

  // ---- Форма подрядчика ----
  const [modal, setModal] = useState(false); // окно «Новый подрядчик»
  const [form, setForm] = useState({ name: '', phone: '', email: '', zone: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Подтягиваем справочник при открытии страницы, чтобы видеть изменения других администраторов
  useEffect(() => {
    void reload();
  }, [reload]);

  const openModal = () => {
    setFormError(null);
    setForm({ name: '', phone: '', email: '', zone: '' });
    setModal(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormError('Введите название организации.');
    const parsed = parseZone(form.zone);
    if ('error' in parsed) return setFormError(parsed.error);

    const body: ContractorIn = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      zone: parsed.zone,
    };
    setSaving(true);
    try {
      const created = await api.createContractor(body);
      setSelectedId(created.id);
      await reload();
      setModal(false);
    } catch (err) {
      setFormError(errorText(err)); // например 422: зона пересекается с чужой
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none';
  const districtName = (c: ContractorOut) =>
    assignments[c.id] != null ? shortDistrict(districts.find((d) => d.id === assignments[c.id])?.name) : null;

  // Макет «Веб/Управ_Общий» и «Веб/Управ_Открытое»: поля 16, заголовок 32 px, колонки 4/8 с зазором 24
  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-neutral-100 text-neutral-800 antialiased px-4 pb-4">
      <div className="border-b border-neutral-200 py-4 sm:py-6 flex flex-wrap items-center justify-between gap-4 sm:gap-6 shrink-0">
        <div>
          <h1 className="page-title">Управление подрядчиками</h1>
          <p className="page-subtitle">
            Рейтинг эффективности, соблюдение регламентных сроков
            <br />и история выполнения заявок
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={openModal}
            className="h-10 rounded-lg bg-white px-4 text-sm font-bold text-neutral-800 shadow-[0_1px_1px_rgba(0,0,0,0.05)] hover:bg-neutral-200 cursor-pointer transition-colors"
          >
            + Добавить подрядчика
          </button>
          <label className="flex h-[52px] items-center gap-[13px] rounded-lg bg-white px-4 py-2.5 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
            <Icon name="calendar" className="h-4 w-[15px] shrink-0 text-red-700" />
            <span className="flex flex-col">
              <span className="text-xs font-light text-neutral-600">Отчётный период</span>
              <Dropdown
                value={period}
                onChange={setPeriod}
                ariaLabel="Отчётный период"
                wrapperClassName="relative block w-[124px] pt-0.5"
                className="bg-transparent text-sm leading-5 text-neutral-800"
              >
                <option value="Апрель 2025">Апрель 2025</option>
                <option value="Май 2025">Май 2025</option>
              </Dropdown>
            </span>
          </label>
        </div>
      </div>

      {referenceError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
          Не удалось загрузить подрядчиков: {referenceError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 items-start gap-x-6 gap-y-4 py-4">
        <section className="lg:col-span-4 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="section-label">Подрядные организации</span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-800">{contractors.length}</span>
          </div>

          <div className="flex flex-col gap-2">
            {contractors.map((c) => {
              const isSelected = selected?.id === c.id;
              const district = districtName(c);
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    setPage(1);
                  }}
                  className={`flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-[0_1px_1px_rgba(0,0,0,0.05)] cursor-pointer transition-colors ${
                    isSelected ? 'border-red-700' : 'border-transparent hover:border-neutral-300'
                  } ${c.is_active ? '' : 'opacity-80'}`}
                >
                  <div>
                    <h3 className="block-title truncate">{c.name}</h3>
                    <div className="flex items-center gap-1 pt-0.5 text-xs text-neutral-600">
                      <Icon name="map-pin" className="h-[13px] w-[9px] shrink-0 text-red-700" />
                      <span className="truncate">{district ?? 'Район не назначен'}</span>
                    </div>
                  </div>

                  {!c.is_active && (
                    <div className="flex items-center justify-between rounded-lg bg-neutral-100 px-[10px] pb-[10px] pt-3">
                      <div className="flex items-center gap-2 text-xs text-neutral-600">
                        <Icon name="info" className="h-[15px] w-[15px] shrink-0" />
                        <span>
                          Нет данных за
                          <br />
                          выбранный месяц
                        </span>
                      </div>
                      <span className="text-xs text-neutral-600">
                        Показатели не
                        <br />
                        рассчитываются
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {contractors.length === 0 && (
              <div className="rounded-xl bg-white p-6 text-center text-xs text-neutral-600 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">Подрядчиков пока нет</div>
            )}
          </div>
        </section>

        <main className="lg:col-span-8 min-w-0">
          {!selected ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl lg:min-h-[640px] bg-white px-8 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
              {/* В файлах SVG уже есть и серый круг, и красный значок-галочка */}
              <div className="relative mb-6">
                <Icon name="empty-contractor" />
                <Icon name="badge-check" className="absolute -bottom-1 -right-1" />
              </div>
              <h2 className="mb-2 text-lg font-bold text-neutral-800">Выберите подрядчика из списка слева</h2>
              <p className="max-w-[512px] text-center text-base leading-[26px] text-neutral-600">
                Нажмите на организацию для просмотра детальных показателей KPI (число заявок, доля в срок, среднее время устранения) и журнала выполненных работ за
                выбранный период
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 rounded-xl bg-white px-6 pb-4 pt-6 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-2">
                  <div>
                    <h2 className="text-xl font-bold leading-tight text-neutral-800">{selected.name}</h2>
                  </div>
                  <div className="text-right text-base leading-6 text-neutral-800">
                    <div>Контакт подрядчика: {contacts[selected.id] ?? '—'}</div>
                    <div className="text-red-700">{selected.phone || '—'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-3">
                  <div className="flex h-44 flex-col justify-between rounded-xl bg-neutral-100 p-4">
                    <div className="flex items-start justify-between text-sm leading-[normal] text-neutral-600">
                      <span>ВСЕГО ЗАЯВОК ЗА<br />ПЕРИОД</span>
                      <Icon name="ctr-kpi-requests" className="h-4 w-[15px] text-red-700" />
                    </div>
                    <div className="text-[32px] font-bold leading-[38px] text-neutral-800">{DEMO_STATS.total}</div>
                    <div className="flex items-center justify-between text-xs text-neutral-600">
                      <span>{DEMO_STATS.closed} закрыто</span>
                      <span className="text-red-700">{DEMO_STATS.inProgress} в работе</span>
                    </div>
                  </div>

                  <div className="flex h-44 flex-col justify-between rounded-xl bg-neutral-100 p-4">
                    <div className="flex items-start justify-between text-sm leading-[normal] text-neutral-600">
                      <span>ДОЛЯ ВЫПОЛНЕННЫХ<br />В СРОК</span>
                      <Icon name="ctr-kpi-on-time" className="h-[18px] w-3 text-red-700" />
                    </div>
                    <div className="text-[32px] font-bold leading-[38px] text-neutral-800">{DEMO_STATS.onTimePercent}%</div>
                    <div className="flex items-center justify-between text-xs text-neutral-600">
                      <span>{DEMO_STATS.onTimeCount} вовремя</span>
                      <span className="text-red-700">{DEMO_STATS.delayedCount} с задержкой</span>
                    </div>
                  </div>

                  <div className="flex h-44 flex-col justify-between rounded-xl bg-neutral-100 p-4">
                    <div className="flex items-start justify-between text-sm leading-[normal] text-neutral-600">
                      <span>СРЕДНЕЕ ВРЕМЯ<br />РЕМОНТА</span>
                      <Icon name="ctr-kpi-time" className="h-[13px] w-4 text-red-700" />
                    </div>
                    <div className="text-2xl font-bold leading-normal text-neutral-800">{DEMO_STATS.avgTimeHours} ч</div>
                    <div />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between pb-1">
                  <h3 className="text-lg font-bold leading-6 text-neutral-800">
                    История заявок
                    <br />
                    подрядчика
                  </h3>
                  <span className="text-sm text-neutral-600">({DEMO_STATS.total} заявки в {period.replace('Апрель', 'Апреле').replace('Май', 'Мае')})</span>
                </div>

                <div className="overflow-x-auto">
                  <div className="flex min-w-[680px] flex-col gap-2">
                    <div className="grid grid-cols-10 rounded-lg bg-neutral-100 px-4 py-2 section-label">
                      <div className="col-span-3">ID и дата назначения</div>
                      <div className="col-span-3">Адрес дефекта</div>
                      <div className="col-span-2 text-right">Время работ</div>
                      <div className="col-span-2 text-right">Статус заявки</div>
                    </div>

                    {currentTasks.map((task) => {
                      const overdue = !!task.overdueBy;
                      return (
                        <div
                          key={`${page}-${task.assigned}-${task.address}`}
                          className={`grid grid-cols-10 items-center rounded-xl px-4 py-[14px] shadow-[0_1px_1.5px_rgba(0,0,0,0.02)] ${
                            overdue ? 'bg-[rgba(255,218,214,0.2)]' : 'bg-neutral-100'
                          }`}
                        >
                          <div className="col-span-3">
                            <div className={`text-sm leading-5 ${overdue ? 'text-red-700' : 'text-neutral-800'}`}>{task.id}</div>
                            <div className="text-xs leading-4 text-neutral-600">{task.assigned}</div>
                          </div>
                          <div className="col-span-3 flex items-center gap-1.5 pr-2 text-sm text-neutral-800">
                            <Icon name="map-pin" className="h-[13px] w-[9px] shrink-0 text-red-700" />
                            <span className="truncate">{task.address}</span>
                          </div>
                          <div className="col-span-2 flex flex-col items-end gap-0.5 pt-0.5">
                            <span className={`text-sm leading-5 ${overdue ? 'text-red-700' : 'text-neutral-800'}`}>{task.duration}</span>
                            <span className="text-xs font-bold text-red-700">{overdue ? task.overdueBy : 'Норма: 24 ч'}</span>
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <span
                              className={`flex h-5 w-[90px] items-center justify-center rounded-xl text-xs font-light ${
                                task.status === 'Выполнено' ? 'bg-[#2E9E4F] text-white' : 'bg-[#F2B705] text-neutral-800'
                              }`}
                            >
                              {task.status}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Pagination
                  currentPage={page}
                  totalItems={DEMO_STATS.total}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                  itemLabel="заявок за выбранный период"
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-900">
                Новый подрядчик
              </h3>
              <button onClick={() => setModal(false)} aria-label="Закрыть" className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 font-bold">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3.5 text-xs" noValidate>
              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Название *</label>
                <input type="text" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ООО «ДорСтрой»" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-600 mb-1 font-medium">Телефон</label>
                  <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7 (999) 000-00-00" className={inputClass} />
                </div>
                <div>
                  <label className="block text-neutral-600 mb-1 font-medium">Email</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="info@company.ru" className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-neutral-600 mb-1 font-medium">
                  Зона (GeoJSON MultiPolygon, координаты [долгота, широта])
                </label>
                <textarea
                  rows={6}
                  value={form.zone}
                  onChange={(e) => setForm({ ...form, zone: e.target.value })}
                  placeholder='{"type":"MultiPolygon","coordinates":[[[[84.94,56.45],[84.97,56.45],[84.97,56.47],[84.94,56.47],[84.94,56.45]]]]}'
                  className="w-full p-3 font-mono text-xs bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                />
              </div>

              {formError && <div className="text-red-600 font-medium">{formError}</div>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(false)} className="flex-1 h-10 bg-neutral-100 hover:bg-neutral-200 rounded-xl font-bold cursor-pointer">
                  Отмена
                </button>
                <button type="submit" disabled={saving} className="flex-1 h-10 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold cursor-pointer disabled:opacity-60">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
