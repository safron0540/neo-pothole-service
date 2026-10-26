import { useState, useMemo, useEffect, type FormEvent } from 'react';
import { Calendar, MapPin, HardHat, Smartphone, Timer, Pencil, X } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { api } from '../../api';
import type { ContractorIn, ContractorOut, GeoMultiPolygon } from '../../api';
import { useReference } from '../../data/useReference';

// ДЕМО: показатели и история заявок появятся с этапом 2 API (отчёты, рейтинг).
// Пока одинаковые для всех подрядчиков — не использовать как реальные данные.
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
  id: string;
  dateAssigned: string;
  address: string;
  duration: string;
  normTime: string;
  isOverdue?: boolean;
  overdueTime?: string;
  status: 'Выполнено' | 'В работе';
}

const DEMO_TASKS: DemoTask[] = [
  { id: '№ ЗЯ-2024-0912', dateAssigned: '28.04.2025, 14:32', address: 'ул. Вершинина, 24', duration: '14 ч 20 мин', normTime: 'Норма: 24 ч', status: 'Выполнено' },
  { id: '№ ЗЯ-2024-0908', dateAssigned: '26.04.2025, 09:15', address: 'Иркутский тракт, 19', duration: '19 ч 45 мин', normTime: 'Норма: 24 ч', status: 'Выполнено' },
  { id: '№ ЗЯ-2024-0899', dateAssigned: '24.04.2025, 11:50', address: 'ул. Вершинина, 24', duration: '26 ч 10 мин', normTime: 'Норма: 24 ч', isOverdue: true, overdueTime: '+2 ч 10 мин', status: 'В работе' },
  { id: '№ ЗЯ-2024-0892', dateAssigned: '22.04.2025, 16:00', address: 'ул. Вершинина, 24', duration: '12 ч 10 мин', normTime: 'Норма: 24 ч', status: 'В работе' },
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
  const { contractors, error: referenceError, reload } = useReference();

  const [period, setPeriod] = useState('Апрель 2025');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 2;
  const [pageError, setPageError] = useState<string | null>(null);

  // Выбран указанный подрядчик, а пока ничего не выбрано — первый в списке
  const selected: ContractorOut | null = contractors.find((c) => c.id === selectedId) ?? contractors[0] ?? null;

  const currentTasks = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return DEMO_TASKS.slice(start, start + PAGE_SIZE);
  }, [page]);

  // ---- Форма подрядчика ----
  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; id?: number } | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', zone: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Подтягиваем справочник при открытии страницы, чтобы видеть изменения других администраторов
  useEffect(() => {
    void reload();
  }, [reload]);

  const openModal = (c?: ContractorOut) => {
    setFormError(null);
    if (c) {
      setForm({
        name: c.name,
        phone: c.phone ?? '',
        email: c.email ?? '',
        zone: c.zone ? JSON.stringify(c.zone, null, 2) : '',
      });
      setModal({ mode: 'edit', id: c.id });
    } else {
      setForm({ name: '', phone: '', email: '', zone: '' });
      setModal({ mode: 'add' });
    }
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
      if (modal?.mode === 'edit' && modal.id != null) await api.updateContractor(modal.id, body);
      else {
        const created = await api.createContractor(body);
        setSelectedId(created.id);
      }
      await reload();
      setModal(null);
    } catch (err) {
      setFormError(errorText(err)); // например 422: зона пересекается с чужой
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: ContractorOut) => {
    setPageError(null);
    try {
      await api.updateContractor(c.id, { is_active: !c.is_active });
      await reload();
    } catch (err) {
      setPageError(errorText(err));
    }
  };

  const remove = async (c: ContractorOut) => {
    if (!confirm(`Удалить подрядчика «${c.name}»?`)) return;
    setPageError(null);
    try {
      await api.deleteContractor(c.id);
      setSelectedId(null);
      await reload();
    } catch (err) {
      // 409: у подрядчика есть заявки — предлагаем отключить
      setPageError(`${errorText(err)} Если удалить нельзя, отключите подрядчика.`);
    }
  };

  const inputClass = 'w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 text-neutral-800 antialiased">
      <header className="px-4 pt-4 pb-3 flex items-start justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Управление подрядчиками</h1>
          <p className="text-xs text-neutral-400 mt-1 font-light">Подрядные организации, их зоны и история выполнения заявок</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => openModal()}
            className="px-4 py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm font-bold rounded-2xl shadow-md cursor-pointer"
          >
            + Добавить подрядчика
          </button>
          <div className="bg-white rounded-2xl border border-neutral-200/80 px-4 py-2 flex items-center gap-3 shadow-sm">
            <Calendar className="w-4 h-4 text-red-600" />
            <div className="text-left">
              <div className="text-xs text-neutral-400 font-medium">Отчётный период</div>
              <select value={period} onChange={(e) => setPeriod(e.target.value)} className="text-xs font-bold text-neutral-800 bg-transparent outline-none cursor-pointer">
                <option value="Апрель 2025">Апрель 2025</option>
                <option value="Май 2025">Май 2025</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {(pageError || referenceError) && (
        <div className="mx-8 mb-3 px-4 py-2.5 rounded-xl text-xs font-medium border bg-red-50 border-red-200 text-red-800">
          {pageError ?? `Не удалось загрузить подрядчиков: ${referenceError}`}
        </div>
      )}

      <div className="flex-1 px-4 pb-4 flex gap-6 overflow-hidden">
        <section className="w-[349px] flex flex-col shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Подрядные организации</span>
            <span className="text-xs font-bold text-neutral-600">{contractors.length}</span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {contractors.map((c) => {
              const isSelected = selected?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    setPage(1);
                  }}
                  className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer shadow-sm hover:shadow ${
                    isSelected ? 'border-red-600 ring-2 ring-red-100' : 'border-neutral-200/80'
                  } ${c.is_active ? '' : 'opacity-60'}`}
                >
                  <h3 className="text-sm font-bold text-neutral-900 leading-tight">{c.name}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-neutral-400 mt-1 font-light">
                    <MapPin className="w-3.5 h-3.5 text-red-600" />
                    <span>{c.zone ? 'Зона задана' : 'Зона не задана'}</span>
                    {!c.is_active && <span className="ml-auto font-bold text-neutral-500">отключён</span>}
                  </div>
                </div>
              );
            })}
            {contractors.length === 0 && (
              <div className="bg-white rounded-2xl p-6 border border-neutral-200 text-center text-xs text-neutral-400 font-light">
                Подрядчиков пока нет
              </div>
            )}
          </div>
        </section>

        {!selected ? (
          <main className="flex-1 bg-white rounded-3xl border border-neutral-200/80 shadow-sm flex flex-col items-center justify-center p-12 text-center">
            <div className="w-20 h-20 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 mb-4">
              <HardHat className="w-10 h-10" />
            </div>
            <h2 className="text-lg font-bold text-neutral-900 mb-2">Выберите подрядчика из списка слева</h2>
          </main>
        ) : (
          <main className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1">
            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">{selected.name}</h2>
                  <div className="text-xs mt-2 space-y-0.5">
                    <div className="text-neutral-500">Телефон: <span className="text-red-600 font-bold">{selected.phone || '—'}</span></div>
                    <div className="text-neutral-500">Email: <span className="text-neutral-800 font-semibold">{selected.email || '—'}</span></div>
                    <div className="text-neutral-500">Зона: <span className="text-neutral-800 font-semibold">{selected.zone ? `${selected.zone.coordinates.length} многоугольн.` : 'не задана'}</span></div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openModal(selected)} aria-label="Редактировать" className="h-9 px-3 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-sm font-bold flex items-center gap-1.5 cursor-pointer">
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Изменить</span>
                  </button>
                  <button
                    onClick={() => toggleActive(selected)}
                    className="h-9 px-3 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-sm font-bold cursor-pointer"
                  >
                    {selected.is_active ? 'Отключить' : 'Включить'}
                  </button>
                  <button onClick={() => remove(selected)} className="h-9 px-3 bg-red-700 hover:bg-red-800 text-white rounded-xl text-sm font-bold cursor-pointer">
                    Удалить
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-4 py-2.5 text-xs font-medium">
              Показатели и история ниже — демо-данные. Реальные придут с этапом 2 API (отчёты и рейтинг).
            </div>

            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex flex-col justify-between">
                  <div className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Всего заявок</div>
                  <div className="text-3xl font-extrabold text-neutral-900 my-2">{DEMO_STATS.total}</div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-neutral-500">{DEMO_STATS.closed} закрыто</span>
                    <span className="text-red-600 font-bold">{DEMO_STATS.inProgress} в работе</span>
                  </div>
                </div>

                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase tracking-wider">
                    <span>Доля в срок</span>
                    <Smartphone className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="text-3xl font-extrabold text-neutral-900 my-2">{DEMO_STATS.onTimePercent}%</div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-neutral-500">{DEMO_STATS.onTimeCount} вовремя</span>
                    <span className="text-red-600 font-bold">{DEMO_STATS.delayedCount} с задержкой</span>
                  </div>
                </div>

                <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs font-bold text-neutral-400 uppercase tracking-wider">
                    <span>Среднее время</span>
                    <Timer className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="text-3xl font-extrabold text-neutral-900 my-2">{DEMO_STATS.avgTimeHours} ч</div>
                  <div className="text-xs text-neutral-400 font-light">Норматив соблюден</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-neutral-900">История заявок подрядчика</h3>
                  <span className="text-xs text-neutral-400 font-light">({DEMO_STATS.total} заявки в {period})</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 text-neutral-400 uppercase font-semibold text-xs tracking-wider pb-2">
                        <th className="py-2.5 px-3">ID и дата</th>
                        <th className="py-2.5 px-3">Адрес</th>
                        <th className="py-2.5 px-3 text-center">Время работ</th>
                        <th className="py-2.5 px-3 text-right">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {currentTasks.map((t) => (
                        <tr key={t.id} className={`hover:bg-neutral-50/80 transition-colors ${t.isOverdue ? 'bg-red-50/40' : ''}`}>
                          <td className="py-3 px-3">
                            <div className={`font-bold ${t.isOverdue ? 'text-red-700' : 'text-neutral-800'}`}>{t.id}</div>
                            <div className="text-xs text-neutral-400 mt-0.5">{t.dateAssigned}</div>
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
                              <div className="text-xs font-bold text-red-600 mt-0.5">{t.overdueTime}</div>
                            ) : (
                              <div className="text-xs text-neutral-400 mt-0.5">{t.normTime}</div>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold text-white ${t.status === 'Выполнено' ? 'bg-emerald-600' : 'bg-amber-500'}`}>
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Pagination currentPage={page} totalItems={DEMO_TASKS.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="заявок" />
            </div>
          </main>
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-900">
                {modal.mode === 'edit' ? 'Редактирование подрядчика' : 'Новый подрядчик'}
              </h3>
              <button onClick={() => setModal(null)} aria-label="Закрыть" className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 font-bold">
                <X className="w-5 h-5" />
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
                <button type="button" onClick={() => setModal(null)} className="flex-1 h-10 bg-neutral-100 hover:bg-neutral-200 rounded-xl font-bold cursor-pointer">
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
