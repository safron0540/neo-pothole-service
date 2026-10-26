import { useEffect, useState, type FormEvent } from 'react';
import { Clock, BookOpen, Building, Check, Pencil, Trash2, Wrench, Truck, Tractor, X, Loader2 } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { api, ApiError } from '../../api';
import type { GeoLineString, StreetGroupCode, StreetOut } from '../../api';
import { useReference } from '../../data/useReference';

const GROUP_META: Partial<Record<StreetGroupCode, { subtitle: string; badgeClass: string }>> = {
  А: { subtitle: 'Магистральные трассы', badgeClass: 'bg-red-700 text-white' },
  Б: { subtitle: 'Районные магистрали', badgeClass: 'bg-orange-500 text-white' },
  В: { subtitle: 'Местное значение и проезды', badgeClass: 'bg-neutral-200 text-neutral-700' },
};
const DEFAULT_BADGE = 'bg-neutral-200 text-neutral-800';
const groupBadge = (code: StreetGroupCode | null) => (code ? GROUP_META[code]?.badgeClass ?? DEFAULT_BADGE : DEFAULT_BADGE);

const CONTRACTOR_ICONS = [Wrench, Truck, Tractor];
const CONTRACTOR_ICON_STYLES = ['bg-red-50 text-red-600', 'bg-blue-50 text-blue-600', 'bg-orange-50 text-orange-600'];

const STREETS_PAGE_SIZE = 6;

type Notice = { type: 'ok' | 'error' | 'info'; text: string } | null;
type FieldEdits = Partial<Record<StreetGroupCode, { deadline?: string; maxPits?: string }>>;

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Неизвестная ошибка');

function validateInteger(raw: string, min: number, max: number, label: string): string | undefined {
  if (raw.trim() === '') return `${label}: введите число`;
  const n = Number(raw);
  if (!Number.isInteger(n)) return `${label}: нужно целое число`;
  if (n < min || n > max) return `${label}: от ${min} до ${max}`;
  return undefined;
}

export default function AdminPage() {
  const { districts, streetGroups, contractors, error: referenceError, reload } = useReference();
  const [activeSubTab, setActiveSubTab] = useState<'deadlines' | 'streets' | 'contractors'>('deadlines');

  // ---------------- Сроки по группам улиц ----------------
  // Показываем значения с сервера; то, что правит пользователь, лежит в edits поверх них
  const [edits, setEdits] = useState<FieldEdits>({});
  const [groupErrors, setGroupErrors] = useState<Record<string, string | undefined>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const deadlineOf = (code: StreetGroupCode, server: number) => edits[code]?.deadline ?? String(server);
  const maxPitsOf = (code: StreetGroupCode, server: number) => edits[code]?.maxPits ?? String(server);

  const setGroupField = (code: StreetGroupCode, field: 'deadline' | 'maxPits', value: string) => {
    setEdits((prev) => ({ ...prev, [code]: { ...prev[code], [field]: value } }));
    setGroupErrors((prev) => ({ ...prev, [`${code}-${field}`]: undefined }));
  };

  const handleSave = async () => {
    const errors: Record<string, string | undefined> = {};
    streetGroups.forEach((g) => {
      const d = validateInteger(deadlineOf(g.code, g.deadline_hours), 1, 720, 'Срок, ч');
      const m = validateInteger(maxPitsOf(g.code, g.max_pits), 1, 50, 'Порог ям');
      if (d) errors[`${g.code}-deadline`] = d;
      if (m) errors[`${g.code}-maxPits`] = m;
    });
    setGroupErrors(errors);
    if (Object.keys(errors).length > 0) {
      setNotice({ type: 'error', text: 'Исправьте ошибки в выделенных полях.' });
      return;
    }

    setIsSaving(true);
    setNotice(null);
    try {
      for (const g of streetGroups) {
        await api.updateStreetGroup(
          g.code,
          Number(deadlineOf(g.code, g.deadline_hours)),
          Number(maxPitsOf(g.code, g.max_pits))
        );
      }
      await reload();
      setEdits({});
      setNotice({ type: 'ok', text: 'Сроки и пороги по категориям сохранены.' });
    } catch (err) {
      setNotice({ type: 'error', text: `Не удалось сохранить: ${errorText(err)}` });
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------- Улицы ----------------
  const [streetsPage, setStreetsPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [streetsTick, setStreetsTick] = useState(0);
  const streetsKey = `${streetsPage}|${search}|${streetsTick}`;
  const [streetsResult, setStreetsResult] = useState<{
    key: string;
    items: StreetOut[];
    total: number;
    error?: string;
  } | null>(null);

  // Поиск с задержкой, чтобы не слать запрос на каждую букву
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setStreetsPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (activeSubTab !== 'streets') return;
    let cancelled = false;
    api
      .getStreets({ q: search || undefined, limit: STREETS_PAGE_SIZE, offset: (streetsPage - 1) * STREETS_PAGE_SIZE })
      .then((data) => !cancelled && setStreetsResult({ key: streetsKey, items: data.items, total: data.total }))
      .catch((err: unknown) => !cancelled && setStreetsResult({ key: streetsKey, items: [], total: 0, error: errorText(err) }));
    return () => {
      cancelled = true;
    };
  }, [activeSubTab, streetsKey, search, streetsPage]);

  const streetsLoading = streetsResult?.key !== streetsKey;
  const streets = streetsResult?.items ?? [];

  const [streetModal, setStreetModal] = useState<{ mode: 'add' | 'edit'; id?: number } | null>(null);
  const [streetForm, setStreetForm] = useState<{
    name: string;
    districtId: string;
    group: StreetGroupCode | '';
    geometry: string;
  }>({ name: '', districtId: '', group: '', geometry: '' });
  const [streetError, setStreetError] = useState<string | null>(null);
  const [streetSaving, setStreetSaving] = useState(false);

  const openStreetModal = (street?: StreetOut) => {
    setStreetError(null);
    if (street) {
      setStreetForm({
        name: street.name,
        districtId: String(street.district_id),
        group: street.street_group ?? '',
        geometry: '',
      });
      setStreetModal({ mode: 'edit', id: street.id });
    } else {
      setStreetForm({ name: '', districtId: '', group: '', geometry: '' });
      setStreetModal({ mode: 'add' });
    }
  };

  const submitStreet = async (e: FormEvent) => {
    e.preventDefault();
    const name = streetForm.name.trim();
    if (!name) return setStreetError('Введите название улицы');

    if (streetForm.districtId === '') return setStreetError('Выберите район.');
    const district_id = Number(streetForm.districtId);
    const street_group = streetForm.group === '' ? null : streetForm.group;

    // Геометрия обязательна только при создании (в PATCH её нет)
    let geometry: GeoLineString | null = null;
    if (streetModal?.mode !== 'edit') {
      try {
        const parsed = JSON.parse(streetForm.geometry) as Partial<GeoLineString>;
        if (parsed.type !== 'LineString' || !Array.isArray(parsed.coordinates)) throw new Error('bad');
        geometry = parsed as GeoLineString;
      } catch {
        return setStreetError('Укажите геометрию улицы как GeoJSON LineString.');
      }
    }

    setStreetSaving(true);
    try {
      if (streetModal?.mode === 'edit' && streetModal.id != null) {
        await api.updateStreet(streetModal.id, { name, district_id, street_group });
      } else if (geometry) {
        await api.createStreet({ name, district_id, street_group, geometry });
      }
      setStreetModal(null);
      setStreetsTick((t) => t + 1);
    } catch (err) {
      setStreetError(errorText(err)); // 409/422: текст с бэкенда
    } finally {
      setStreetSaving(false);
    }
  };

  const deleteStreet = async (street: StreetOut) => {
    if (!confirm(`Удалить улицу «${street.name}»?`)) return;
    try {
      await api.deleteStreet(street.id);
      if (streets.length === 1 && streetsPage > 1) setStreetsPage(streetsPage - 1);
      setStreetsTick((t) => t + 1);
    } catch (err) {
      setNotice({ type: 'error', text: errorText(err) });
    }
  };

  // ---------------- Районы ----------------
  const [newDistrict, setNewDistrict] = useState('');
  const [editingDistrict, setEditingDistrict] = useState<{ id: number; name: string } | null>(null);
  const [districtError, setDistrictError] = useState<string | null>(null);

  const runDistrictAction = async (action: () => Promise<unknown>) => {
    setDistrictError(null);
    try {
      await action();
      await reload();
      setStreetsTick((t) => t + 1);
    } catch (err) {
      // например 409: район используется в заявках
      setDistrictError(err instanceof ApiError ? err.message : errorText(err));
    }
  };

  const addDistrict = async () => {
    const name = newDistrict.trim();
    if (!name) return;
    await runDistrictAction(() => api.createDistrict(name));
    setNewDistrict('');
  };

  const saveDistrict = async () => {
    if (!editingDistrict || !editingDistrict.name.trim()) return;
    await runDistrictAction(() => api.updateDistrict(editingDistrict.id, editingDistrict.name.trim()));
    setEditingDistrict(null);
  };

  const fieldBase = 'w-20 h-10 px-3 bg-white border rounded-xl text-sm font-bold text-center outline-none focus:border-red-600';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 text-neutral-800 antialiased">
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-6 flex flex-col justify-between">
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Справочники и параметры системы</h1>
            <p className="text-xs text-neutral-400 mt-1 font-light">
              Управление классификатором улиц, нормативными сроками по ГОСТ Р 50597-2017 и зонами подрядчиков
            </p>
            {referenceError && (
              <p className="text-xs text-red-600 mt-1">Не удалось загрузить справочники: {referenceError}</p>
            )}
          </div>

          <div className="flex items-center gap-2 mb-6 border-b border-neutral-200 pb-2">
            {[
              { id: 'deadlines' as const, icon: Clock, title: 'Сроки устранения по категориям' },
              { id: 'streets' as const, icon: BookOpen, title: 'Улицы и районы' },
              { id: 'contractors' as const, icon: Building, title: 'Подрядчики и зоны' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer transition-all ${
                  activeSubTab === tab.id ? 'bg-white text-red-700 shadow-sm border border-neutral-200' : 'text-neutral-500 hover:text-black'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.title}</span>
              </button>
            ))}
          </div>

          {activeSubTab === 'deadlines' && (
            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm space-y-5">
              <div>
                <h2 className="text-sm font-bold text-neutral-900">Нормативы устранения дефектов по ГОСТ Р 50597-2017</h2>
                <p className="text-xs text-neutral-400 mt-0.5 font-light">
                  Предельные сроки устранения ямочности и порог ям на участке 100 м для планового ремонта
                </p>
              </div>

              <div className="space-y-4 pt-2">
                {streetGroups.length === 0 && <div className="text-xs text-neutral-400 font-light">Группы улиц загружаются…</div>}
                {streetGroups.map((g) => {
                  const meta = GROUP_META[g.code];
                  const deadlineErr = groupErrors[`${g.code}-deadline`];
                  const pitsErr = groupErrors[`${g.code}-maxPits`];
                  return (
                    <div key={g.code} className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <span className={`${meta?.badgeClass ?? DEFAULT_BADGE} text-xs font-bold px-3 py-1.5 rounded-lg`}>
                            КАТЕГОРИЯ «{g.code}»
                          </span>
                          {meta && <span className="text-sm font-bold text-neutral-800">{meta.subtitle}</span>}
                        </div>

                        <div className="flex items-center gap-5">
                          <label className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 font-medium">Время устранения дефекта</span>
                            <input
                              type="number"
                              min={1}
                              value={deadlineOf(g.code, g.deadline_hours)}
                              onChange={(e) => setGroupField(g.code, 'deadline', e.target.value)}
                              aria-invalid={!!deadlineErr}
                              className={`${fieldBase} ${deadlineErr ? 'border-red-500' : 'border-neutral-300'}`}
                            />
                            <span className="text-xs text-neutral-400 font-light">ч</span>
                          </label>

                          <label className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 font-medium">Порог ям на 100 м</span>
                            <input
                              type="number"
                              min={1}
                              value={maxPitsOf(g.code, g.max_pits)}
                              onChange={(e) => setGroupField(g.code, 'maxPits', e.target.value)}
                              aria-invalid={!!pitsErr}
                              className={`${fieldBase} ${pitsErr ? 'border-red-500' : 'border-neutral-300'}`}
                            />
                          </label>
                        </div>
                      </div>
                      {(deadlineErr || pitsErr) && (
                        <div className="text-xs text-red-600 font-medium mt-2 text-right">
                          {[deadlineErr, pitsErr].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSubTab === 'streets' && (
            <div className="space-y-6">
              <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5 gap-4">
                  <h2 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                    Классификатор улиц и распределение по районам
                    {streetsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-red-700" />}
                  </h2>
                  <div className="flex items-center gap-2">
                    <input
                      type="search"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Поиск по названию"
                      className="h-9 px-3 text-xs bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-red-600"
                    />
                    <button
                      onClick={() => openStreetModal()}
                      className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-sm font-bold cursor-pointer"
                    >
                      + Добавить улицу
                    </button>
                  </div>
                </div>

                {streetsResult?.error && <div className="text-xs text-red-600 mb-3">Не удалось загрузить улицы: {streetsResult.error}</div>}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 text-neutral-400 uppercase font-semibold text-xs tracking-wider pb-3">
                        <th className="py-3 px-3">Название улицы</th>
                        <th className="py-3 px-3">Район</th>
                        <th className="py-3 px-3">Категория дороги</th>
                        <th className="py-3 px-3 text-right">Действия</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {streets.map((st) => (
                        <tr key={st.id} className="hover:bg-neutral-50/80 transition-colors">
                          <td className="py-3.5 px-3 font-bold text-neutral-900">{st.name}</td>
                          <td className="py-3.5 px-3 text-neutral-600 font-medium">
                            {districts.find((d) => d.id === st.district_id)?.name ?? '—'}
                          </td>
                          <td className="py-3.5 px-3">
                            {st.street_group ? (
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${groupBadge(st.street_group)}`}>
                                Категория {st.street_group}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-3.5 px-3 text-right">
                            <div className="inline-flex items-center gap-3">
                              <button
                                onClick={() => openStreetModal(st)}
                                aria-label={`Редактировать ${st.name}`}
                                className="text-neutral-400 hover:text-black cursor-pointer font-bold"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteStreet(st)}
                                aria-label={`Удалить ${st.name}`}
                                className="text-neutral-400 hover:text-red-700 cursor-pointer font-bold"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!streetsLoading && streets.length === 0 && (
                    <div className="py-8 text-center text-xs text-neutral-400 font-light">Улицы не найдены</div>
                  )}
                </div>

                <Pagination
                  currentPage={streetsPage}
                  totalItems={streetsResult?.total ?? 0}
                  pageSize={STREETS_PAGE_SIZE}
                  onPageChange={setStreetsPage}
                  itemLabel="улиц"
                />
              </div>

              <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm">
                <h2 className="text-sm font-bold text-neutral-900 mb-4">Районы</h2>
                <ul className="divide-y divide-neutral-100 text-xs">
                  {districts.map((d) => (
                    <li key={d.id} className="py-2.5 flex items-center justify-between gap-3">
                      {editingDistrict?.id === d.id ? (
                        <input
                          autoFocus
                          value={editingDistrict.name}
                          onChange={(e) => setEditingDistrict({ id: d.id, name: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && saveDistrict()}
                          className="h-9 flex-1 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-red-600"
                        />
                      ) : (
                        <span className="font-semibold text-neutral-800">{d.name}</span>
                      )}
                      <div className="flex items-center gap-3">
                        {editingDistrict?.id === d.id ? (
                          <>
                            <button onClick={saveDistrict} aria-label="Сохранить" className="text-emerald-700 cursor-pointer font-bold">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingDistrict(null)} aria-label="Отмена" className="text-neutral-400 cursor-pointer font-bold">
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditingDistrict({ id: d.id, name: d.name })}
                              aria-label={`Переименовать ${d.name}`}
                              className="text-neutral-400 hover:text-black cursor-pointer font-bold"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => confirm(`Удалить район «${d.name}»?`) && runDistrictAction(() => api.deleteDistrict(d.id))}
                              aria-label={`Удалить ${d.name}`}
                              className="text-neutral-400 hover:text-red-700 cursor-pointer font-bold"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center gap-2 mt-4">
                  <input
                    value={newDistrict}
                    onChange={(e) => setNewDistrict(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDistrict()}
                    placeholder="Название нового района"
                    className="h-9 flex-1 px-3 text-xs bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-red-600"
                  />
                  <button onClick={addDistrict} className="h-9 px-4 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-sm font-bold cursor-pointer">
                    + Добавить район
                  </button>
                </div>
                {districtError && <div className="text-xs text-red-600 font-medium mt-2">{districtError}</div>}
              </div>
            </div>
          )}

          {activeSubTab === 'contractors' && (
            <div className="space-y-4">
              {contractors.map((c, i) => {
                const Icon = CONTRACTOR_ICONS[i % CONTRACTOR_ICONS.length];
                return (
                  <div key={c.id} className="bg-white rounded-3xl border border-neutral-200/80 p-5 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${CONTRACTOR_ICON_STYLES[i % CONTRACTOR_ICON_STYLES.length]}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                          {c.name}
                          {!c.is_active && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-neutral-200 text-neutral-600">отключён</span>
                          )}
                        </h3>
                        <div className="text-xs text-neutral-400 mt-1 font-light">
                          {[c.phone, c.email].filter(Boolean).join(' · ') || 'Контакты не указаны'}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full ${
                        c.zone ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {c.zone ? 'Зона задана' : 'Зона не задана'}
                    </span>
                  </div>
                );
              })}
              {contractors.length === 0 && <div className="text-xs text-neutral-400 font-light">Подрядчиков пока нет</div>}
              <p className="text-xs text-neutral-400">
                Подрядчиков и границы их зон (GeoJSON) редактируют в разделе «Подрядчики».
              </p>
            </div>
          )}
        </div>

        {activeSubTab === 'deadlines' && (
          <div className="flex flex-col items-center gap-3 pt-8">
            {notice && (
              <div
                role="status"
                className={`px-4 py-2.5 rounded-xl text-xs font-medium border ${
                  notice.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : notice.type === 'ok'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {notice.text}
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || streetGroups.length === 0}
              className="px-8 py-3.5 bg-red-700 hover:bg-red-800 text-white rounded-2xl text-sm font-bold shadow-md flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Сохранить параметры</span>
            </button>
          </div>
        )}
        {activeSubTab === 'streets' && notice?.type === 'error' && (
          <div className="pt-4 text-xs font-medium text-red-700 text-center">{notice.text}</div>
        )}
      </div>

      {streetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-900">
                {streetModal.mode === 'edit' ? 'Редактирование улицы' : 'Новая улица'}
              </h3>
              <button onClick={() => setStreetModal(null)} aria-label="Закрыть" className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={submitStreet} className="space-y-3.5 text-xs" noValidate>
              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Название улицы *</label>
                <input
                  type="text"
                  autoFocus
                  value={streetForm.name}
                  onChange={(e) => {
                    setStreetForm({ ...streetForm, name: e.target.value });
                    setStreetError(null);
                  }}
                  placeholder="ул. Ленина"
                  aria-invalid={!!streetError}
                  className={`w-full h-10 px-3 bg-neutral-50 border rounded-xl outline-none ${streetError ? 'border-red-500' : 'border-neutral-200'}`}
                />
              </div>

              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Район *</label>
                <select
                  value={streetForm.districtId}
                  onChange={(e) => setStreetForm({ ...streetForm, districtId: e.target.value })}
                  className="w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                >
                  <option value="">Выберите район…</option>
                  {districts.map((d) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Категория дороги</label>
                <select
                  value={streetForm.group}
                  onChange={(e) => setStreetForm({ ...streetForm, group: e.target.value as StreetGroupCode | '' })}
                  className="w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                >
                  <option value="">Не указана</option>
                  {streetGroups.map((g) => (
                    <option key={g.code} value={g.code}>
                      Категория {g.code}
                    </option>
                  ))}
                </select>
              </div>

              {streetModal.mode === 'add' && (
                <div>
                  <label className="block text-neutral-600 mb-1 font-medium">
                    Геометрия * (GeoJSON LineString, координаты [долгота, широта])
                  </label>
                  <textarea
                    rows={4}
                    value={streetForm.geometry}
                    onChange={(e) => setStreetForm({ ...streetForm, geometry: e.target.value })}
                    placeholder='{"type":"LineString","coordinates":[[84.95,56.46],[84.96,56.47]]}'
                    className="w-full p-3 font-mono text-xs bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                  />
                </div>
              )}

              {streetError && <div className="text-red-600 font-medium">{streetError}</div>}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStreetModal(null)}
                  className="flex-1 h-10 bg-neutral-100 hover:bg-neutral-200 rounded-xl font-bold cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={streetSaving}
                  className="flex-1 h-10 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold cursor-pointer disabled:opacity-60"
                >
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
