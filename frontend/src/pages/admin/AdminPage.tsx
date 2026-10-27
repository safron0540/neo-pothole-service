import { useEffect, useState, type FormEvent } from 'react';
import { Pagination } from '../../components/Pagination';
import { api } from '../../api';
import type { GeoLineString, StreetGroupCode, StreetOut } from '../../api';
import { IconSelect } from '../../components/IconSelect';
import { useReference } from '../../data/useReference';
import { useContractorDistricts } from '../../data/contractorDistricts';
import { useContractorContacts } from '../../data/useContractorContacts';
import { shortDistrict } from '../../utils/format';

import { Icon } from '../../components/Icon';
import { CloseIcon, Spinner } from '../../components/UiIcons';
const GROUP_META: Partial<Record<StreetGroupCode, { subtitle: string; badgeClass: string }>> = {
  А: { subtitle: 'Магистральные трассы', badgeClass: 'bg-red-700 text-white' },
  Б: { subtitle: 'Районные магистрали', badgeClass: 'bg-orange-500 text-white' },
  В: { subtitle: 'Местное значение и проезды', badgeClass: 'bg-neutral-200 text-neutral-700' },
};
const DEFAULT_BADGE = 'bg-neutral-200 text-neutral-800';

const TILE_ICON_NAMES = ['tile-tools', 'tile-truck', 'tile-excavator'];
const CONTRACTOR_TILE = ['bg-[#FFDAD4]', 'bg-[#DBE1FF]', 'bg-[#FFDBD0]'];

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

  // ---------------- Подрядчики и зоны: выбор района ----------------
  const contacts = useContractorContacts();
  const { assignments, save: saveAssignments } = useContractorDistricts();
  const [draft, setDraft] = useState<Record<number, number>>(assignments);

  const setContractorDistrict = (contractorId: number, value: string) =>
    setDraft((prev) => {
      const next = { ...prev };
      if (value === '') delete next[contractorId];
      else next[contractorId] = Number(value);
      return next;
    });

  const handleSaveContractors = () => {
    saveAssignments(draft);
    setNotice({ type: 'ok', text: 'Параметры подрядчиков сохранены.' });
  };

  const fieldBase = 'w-20 h-10 px-3 bg-white border rounded-xl text-sm font-bold text-center outline-none focus:border-red-700';

  const tabs = [
    { id: 'deadlines' as const, iconName: 'tab-deadlines', title: 'Сроки устранения по категориям' },
    { id: 'streets' as const, iconName: 'tab-streets', title: 'Улицы и районы' },
    { id: 'contractors' as const, iconName: 'tab-contractors-zones', title: 'Подрядчики и зоны' },
  ];

  const noticeBox = notice && (
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
  );

  const saveButton = (onClick: () => void, busy = false, disabled = false) => (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="flex items-center gap-2 rounded-xl bg-red-700 px-6 py-2.5 text-sm font-bold text-white shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1)] transition-colors hover:bg-red-800 disabled:opacity-60 cursor-pointer"
    >
      {busy ? <Spinner className="h-4 w-4 animate-spin" /> : <Icon name="save-check" className="h-[9px] w-3" />}
      <span>Сохранить параметры</span>
    </button>
  );

  // Макет «Веб/Админ_*»: поля 16, заголовок 32 px, вкладки 64 px, карточки с зазором 14–16
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 text-neutral-800 antialiased">
      <div className="flex-1 overflow-y-auto p-4 flex flex-col">
        <div className="pb-4">
          <h1 className="text-2xl font-bold leading-tight tracking-[-0.6px] text-neutral-800 sm:text-[32px] sm:leading-[38px] sm:tracking-[-0.8px]">Справочники и параметры системы</h1>
          <p className="mt-1 max-w-[768px] text-sm text-neutral-600">
            Управление классификатором улиц, нормативными сроками устранения дефектов, районами и зонами ответственности подрядных организаций.
          </p>
          {referenceError && <p className="mt-1 text-xs text-red-700">Не удалось загрузить справочники: {referenceError}</p>}
        </div>

        <div role="tablist" className="flex min-h-[64px] flex-wrap items-start gap-2 pb-[5px]">
          {tabs.map((tab) => {
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-base font-normal cursor-pointer transition-colors ${
                  active
                    ? 'border-neutral-100 bg-white text-red-700 shadow-[0_4px_4px_rgba(0,0,0,0.15)]'
                    : 'border-transparent text-neutral-800 hover:bg-white/60'
                }`}
              >
                <Icon name={tab.iconName} className="h-[15px] w-[15px]" />
                <span>{tab.title}</span>
              </button>
            );
          })}
        </div>

        <div className={`flex flex-col gap-4 ${activeSubTab === 'deadlines' ? 'flex-1' : ''}`}>
          {activeSubTab === 'deadlines' && (
            <div className="bg-white rounded-xl p-6 shadow-[0_1px_1px_rgba(0,0,0,0.05)] space-y-5">
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
                      <div className="flex flex-wrap items-center justify-between gap-4">
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
            <div className="flex flex-col gap-4 rounded-xl bg-white p-4 shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <h2 className="flex items-center gap-2 text-sm font-bold text-neutral-800">
                  Классификатор улиц и распределение по районам
                  {streetsLoading && <Spinner className="h-3.5 w-3.5 animate-spin text-red-700" />}
                </h2>
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Поиск по названию"
                    className="h-9 rounded-lg bg-neutral-100 px-3 text-xs outline-none focus:ring-1 focus:ring-red-700"
                  />
                  <button
                    onClick={() => openStreetModal()}
                    className="flex h-9 items-center gap-2 rounded-lg bg-neutral-100 px-4 text-xs font-bold text-neutral-800 hover:bg-neutral-200 cursor-pointer transition-colors"
                  >
                    <Icon name="plus-circle" className="h-[15px] w-[15px]" />
                    <span>+ Добавить улицу</span>
                  </button>
                </div>
              </div>

              {streetsResult?.error && <div className="text-xs text-red-700">Не удалось загрузить улицы: {streetsResult.error}</div>}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#F2F3FF] text-[11px] font-bold uppercase leading-[14px] tracking-[0.55px] text-neutral-600">
                      <th className="rounded-l-xl px-4 py-3 w-[38%]">Название улицы / участка</th>
                      <th className="px-4 py-3">Район</th>
                      <th className="px-4 py-3">Категория дороги</th>
                      <th className="rounded-r-xl px-4 py-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {streets.map((st) => (
                      <tr key={st.id} className="border-b border-neutral-200 transition-colors hover:bg-neutral-100/50">
                        <td className="px-4 py-5">
                          <span className="flex items-center gap-3 font-bold text-neutral-800">
                            <Icon name="ruler" className="h-[9px] w-[15px] shrink-0 text-neutral-600" />
                            {st.name}
                          </span>
                        </td>
                        <td className="px-4 py-5 text-neutral-800">{shortDistrict(districts.find((d) => d.id === st.district_id)?.name)}</td>
                        <td className="px-4 py-5">
                          {st.street_group ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFDAD4] px-2.5 py-0.5 text-[11px] font-bold text-neutral-800">
                              <span className={`h-1.5 w-1.5 rounded-full ${st.street_group === 'А' ? 'bg-red-700' : 'bg-neutral-800'}`} />
                              Категория {st.street_group}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-5 text-right">
                          <button
                            onClick={() => openStreetModal(st)}
                            aria-label={`Редактировать ${st.name}`}
                            className="inline-flex text-neutral-600 hover:text-neutral-900 cursor-pointer"
                          >
                            <Icon name="edit" className="h-[14px] w-[14px]" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!streetsLoading && streets.length === 0 && <div className="py-8 text-center text-xs text-neutral-500">Улицы не найдены</div>}
              </div>

              <Pagination
                currentPage={streetsPage}
                totalItems={streetsResult?.total ?? 0}
                pageSize={STREETS_PAGE_SIZE}
                onPageChange={setStreetsPage}
                itemLabel="улиц"
              />
            </div>
          )}

          {activeSubTab === 'contractors' && (
            <div className="flex flex-col gap-[14px]">
              {contractors.map((c, i) => {
                                return (
                  <div key={c.id} className="flex min-h-[80px] flex-col gap-3 rounded-xl bg-white p-5 sm:flex-row sm:items-center sm:justify-between shadow-[0_1px_1px_rgba(0,0,0,0.05)]">
                    <div className="flex items-center gap-[14px]">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${CONTRACTOR_TILE[i % CONTRACTOR_TILE.length]}`}>
                        <Icon name={TILE_ICON_NAMES[i % TILE_ICON_NAMES.length]} className="h-5 w-5 text-neutral-900" />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 text-base font-bold leading-6 text-neutral-800">
                          {c.name}
                          {!c.is_active && <span className="rounded bg-neutral-200 px-2 py-0.5 text-[11px] font-bold text-neutral-600">отключён</span>}
                        </div>
                        <div className="flex items-center gap-4 pt-1 text-xs text-neutral-600">
                          <span className="flex items-center gap-1.5">
                            <Icon name="contact" className="h-[13px] w-[13px] text-red-700" />
                            Контакт подрядчика: {contacts[c.id] ?? '—'}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Icon name="phone" className="h-3 w-3 text-red-700" />
                            {c.phone || '—'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <IconSelect
                      iconName="field-district"
                      className="w-full shrink-0 sm:w-[208px]"
                      ariaLabel={`Район для ${c.name}`}
                      value={draft[c.id] != null ? String(draft[c.id]) : ''}
                      onChange={(v) => setContractorDistrict(c.id, v)}
                      placeholder="Выберите район..."
                    >
                      {districts.map((d) => (
                        <option key={d.id} value={String(d.id)}>
                          {d.name}
                        </option>
                      ))}
                    </IconSelect>
                  </div>
                );
              })}
              {contractors.length === 0 && <div className="text-xs text-neutral-500">Подрядчиков пока нет</div>}
            </div>
          )}
        </div>

        {(activeSubTab === 'deadlines' || activeSubTab === 'contractors') && (
          <div className="flex flex-col items-center gap-3 pt-4">
            {noticeBox}
            {activeSubTab === 'deadlines'
              ? saveButton(handleSave, isSaving, streetGroups.length === 0)
              : saveButton(handleSaveContractors, false, contractors.length === 0)}
          </div>
        )}
        {activeSubTab === 'streets' && notice?.type === 'error' && <div className="pt-4 flex justify-center">{noticeBox}</div>}
      </div>

      {streetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-900">
                {streetModal.mode === 'edit' ? 'Редактирование улицы' : 'Новая улица'}
              </h3>
              <button onClick={() => setStreetModal(null)} aria-label="Закрыть" className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 font-bold">
                <CloseIcon className="w-5 h-5" />
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
