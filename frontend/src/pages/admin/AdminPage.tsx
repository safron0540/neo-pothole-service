import { useState, type FormEvent } from 'react';
import { Clock, BookOpen, Building, Check, Pencil, Wrench, Truck, Tractor, X, Loader2 } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { api, ApiError } from '../../api';
import { CONTRACTORS, DISTRICTS, STREET_GROUPS, type StreetGroup } from '../../data/reference';

interface StreetItem {
  id: number;
  name: string;
  district: string;
  group: StreetGroup;
}

const INITIAL_STREETS: StreetItem[] = [
  { id: 1, name: 'ул. Божова', district: 'Советский', group: 'А' },
  { id: 2, name: 'ул. Витимская', district: 'Ленинский', group: 'А' },
  { id: 3, name: 'ул. Демьяна Белого', district: 'Ленинский', group: 'Б' },
  { id: 4, name: 'ул. Весенняя', district: 'Кировский', group: 'Б' },
  { id: 5, name: 'ул. Кулагина', district: 'Советский', group: 'В' },
  { id: 6, name: 'пер. Богашевский', district: 'Советский', group: 'В' },
];

const GROUP_META: Record<StreetGroup, { title: string; subtitle: string; badge: string; badgeClass: string }> = {
  А: { title: 'КАТЕГОРИЯ «А»', subtitle: 'Магистральные трассы', badge: 'Категория А', badgeClass: 'bg-red-700 text-white' },
  Б: { title: 'КАТЕГОРИЯ «Б»', subtitle: 'Районные магистрали', badge: 'Категория Б', badgeClass: 'bg-[#B44C28] text-white' },
  В: { title: 'КАТЕГОРИЯ «В»', subtitle: 'Местное значение и проезды', badge: 'Категория В', badgeClass: 'bg-[#D9E2EC] text-[#334E68]' },
};

const CONTRACTOR_ICONS = [Wrench, Truck, Tractor];
const CONTRACTOR_ICON_STYLES = ['bg-red-50 text-red-600', 'bg-blue-50 text-blue-600', 'bg-orange-50 text-orange-600'];

const STREETS_PAGE_SIZE = 6;

type GroupValues = Record<StreetGroup, { deadline: string; maxPits: string }>;
type GroupErrors = Partial<Record<`${StreetGroup}-${'deadline' | 'maxPits'}`, string>>;
type Notice = { type: 'ok' | 'error' | 'info'; text: string } | null;

function validateInteger(raw: string, min: number, max: number, label: string): string | undefined {
  if (raw.trim() === '') return `${label}: введите число`;
  const n = Number(raw);
  if (!Number.isInteger(n)) return `${label}: нужно целое число`;
  if (n < min || n > max) return `${label}: от ${min} до ${max}`;
  return undefined;
}

export default function AdminPage() {
  const [activeSubTab, setActiveSubTab] = useState<'deadlines' | 'streets' | 'contractors'>('deadlines');

  // ---- Сроки ----
  const [groupValues, setGroupValues] = useState<GroupValues>({
    А: { deadline: '24', maxPits: '3' },
    Б: { deadline: '24', maxPits: '3' },
    В: { deadline: '24', maxPits: '3' },
  });
  const [groupErrors, setGroupErrors] = useState<GroupErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const setGroupField = (g: StreetGroup, field: 'deadline' | 'maxPits', value: string) => {
    setGroupValues((prev) => ({ ...prev, [g]: { ...prev[g], [field]: value } }));
    setGroupErrors((prev) => ({ ...prev, [`${g}-${field}`]: undefined }));
  };

  const handleSave = async () => {
    const errors: GroupErrors = {};
    STREET_GROUPS.forEach((g) => {
      const d = validateInteger(groupValues[g].deadline, 1, 720, 'Срок, ч');
      const m = validateInteger(groupValues[g].maxPits, 1, 50, 'Порог ям');
      if (d) errors[`${g}-deadline`] = d;
      if (m) errors[`${g}-maxPits`] = m;
    });
    setGroupErrors(errors);
    if (Object.keys(errors).length > 0) {
      setNotice({ type: 'error', text: 'Исправьте ошибки в выделенных полях.' });
      return;
    }

    setIsSaving(true);
    setNotice(null);
    try {
      for (const g of STREET_GROUPS) {
        await api.updateStreetGroup(g, Number(groupValues[g].deadline), Number(groupValues[g].maxPits));
      }
      setNotice({ type: 'ok', text: 'Сроки и пороги по категориям сохранены.' });
    } catch (err) {
      setNotice({
        type: err instanceof ApiError ? 'error' : 'info',
        text:
          err instanceof ApiError
            ? `Не удалось сохранить: ${err.message}`
            : 'Сервер недоступен — значения не отправлены и не сохранены в БД.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Улицы ----
  const [streets, setStreets] = useState<StreetItem[]>(INITIAL_STREETS);
  const [streetsPage, setStreetsPage] = useState(1);
  const [streetModal, setStreetModal] = useState<{ mode: 'add' | 'edit'; id?: number } | null>(null);
  const [streetForm, setStreetForm] = useState({ name: '', district: DISTRICTS[0] as string, group: 'А' as StreetGroup });
  const [streetErrors, setStreetErrors] = useState<{ name?: string }>({});

  const pagedStreets = streets.slice((streetsPage - 1) * STREETS_PAGE_SIZE, streetsPage * STREETS_PAGE_SIZE);

  const openStreetModal = (street?: StreetItem) => {
    setStreetErrors({});
    if (street) {
      setStreetForm({ name: street.name, district: street.district, group: street.group });
      setStreetModal({ mode: 'edit', id: street.id });
    } else {
      setStreetForm({ name: '', district: DISTRICTS[0], group: 'А' });
      setStreetModal({ mode: 'add' });
    }
  };

  const submitStreet = (e: FormEvent) => {
    e.preventDefault();
    const name = streetForm.name.trim();
    if (!name) return setStreetErrors({ name: 'Введите название улицы' });
    if (streets.some((s) => s.id !== streetModal?.id && s.name.toLowerCase() === name.toLowerCase())) {
      return setStreetErrors({ name: 'Такая улица уже есть в справочнике' });
    }

    if (streetModal?.mode === 'edit') {
      setStreets((prev) => prev.map((s) => (s.id === streetModal.id ? { ...s, ...streetForm, name } : s)));
    } else {
      setStreets((prev) => [{ id: Date.now(), ...streetForm, name }, ...prev]);
      setStreetsPage(1);
    }
    setStreetModal(null);
  };

  // ---- Подрядчики и зоны ----
  const [contractorDistricts, setContractorDistricts] = useState<Record<number, string>>({});

  const fieldBase =
    'w-20 h-10 px-3 bg-white border rounded-xl text-sm font-bold text-center outline-none focus:border-red-600';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 font-sans text-neutral-800 antialiased">
      <div className="flex-1 overflow-y-auto px-8 pt-7 pb-10 flex flex-col justify-between">
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Справочники и параметры системы</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Управление классификатором улиц, нормативными сроками по ГОСТ Р 50597-2017 и зонами подрядчиков
            </p>
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
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all ${
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
                <p className="text-xs text-neutral-400 mt-0.5">
                  Предельные сроки устранения ямочности и порог ям на участке 100 м для планового ремонта
                </p>
              </div>

              <div className="space-y-4 pt-2">
                {STREET_GROUPS.map((g) => {
                  const meta = GROUP_META[g];
                  const deadlineErr = groupErrors[`${g}-deadline`];
                  const pitsErr = groupErrors[`${g}-maxPits`];
                  return (
                    <div key={g} className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <span className={`${meta.badgeClass} text-xs font-bold px-3 py-1.5 rounded-lg`}>{meta.title}</span>
                          <span className="text-sm font-bold text-neutral-800">{meta.subtitle}</span>
                        </div>

                        <div className="flex items-center gap-5">
                          <label className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 font-medium">Время устранения дефекта</span>
                            <input
                              type="number"
                              min={1}
                              value={groupValues[g].deadline}
                              onChange={(e) => setGroupField(g, 'deadline', e.target.value)}
                              aria-invalid={!!deadlineErr}
                              className={`${fieldBase} ${deadlineErr ? 'border-red-500' : 'border-neutral-300'}`}
                            />
                            <span className="text-xs text-neutral-400">ч</span>
                          </label>

                          <label className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500 font-medium">Порог ям на 100 м</span>
                            <input
                              type="number"
                              min={1}
                              value={groupValues[g].maxPits}
                              onChange={(e) => setGroupField(g, 'maxPits', e.target.value)}
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
            <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold text-neutral-900">Классификатор улиц и распределение по районам</h2>
                <button
                  onClick={() => openStreetModal()}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  + Добавить улицу
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-200 text-neutral-400 uppercase font-semibold text-[10px] tracking-wider pb-3">
                      <th className="py-3 px-3">Название улицы</th>
                      <th className="py-3 px-3">Район</th>
                      <th className="py-3 px-3">Категория дороги</th>
                      <th className="py-3 px-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {pagedStreets.map((st) => (
                      <tr key={st.id} className="hover:bg-neutral-50/80 transition-colors">
                        <td className="py-3.5 px-3 font-bold text-neutral-900">{st.name}</td>
                        <td className="py-3.5 px-3 text-neutral-600 font-medium">{st.district}</td>
                        <td className="py-3.5 px-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${GROUP_META[st.group].badgeClass}`}>
                            {GROUP_META[st.group].badge}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <button
                            onClick={() => openStreetModal(st)}
                            aria-label={`Редактировать ${st.name}`}
                            className="text-neutral-400 hover:text-black cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination
                currentPage={streetsPage}
                totalItems={streets.length}
                pageSize={STREETS_PAGE_SIZE}
                onPageChange={setStreetsPage}
                itemLabel="улиц"
              />
              <p className="text-[11px] text-neutral-400 mt-3">
                Изменения справочника применяются сразу и пока хранятся только на экране: в контракте API нет эндпоинтов для улиц.
              </p>
            </div>
          )}

          {activeSubTab === 'contractors' && (
            <div className="space-y-4">
              {CONTRACTORS.map((c, i) => {
                const Icon = CONTRACTOR_ICONS[i % CONTRACTOR_ICONS.length];
                return (
                  <div key={c.id} className="bg-white rounded-3xl border border-neutral-200/80 p-5 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${CONTRACTOR_ICON_STYLES[i % CONTRACTOR_ICON_STYLES.length]}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-neutral-900 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} title="Цвет зоны на карте" />
                          {c.name}
                        </h3>
                        <div className="text-xs text-neutral-400 mt-1">Контакт: {c.contact}</div>
                      </div>
                    </div>

                    <div className="w-64">
                      <select
                        value={contractorDistricts[c.id] ?? ''}
                        onChange={(e) => setContractorDistricts((prev) => ({ ...prev, [c.id]: e.target.value }))}
                        className="w-full h-11 px-4 text-xs font-semibold bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                      >
                        <option value="">Выберите район...</option>
                        {DISTRICTS.map((d) => (
                          <option key={d} value={d}>
                            {d} район
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] text-neutral-400">
                Привязка районов хранится только на экране до подключения API. Границы зон на карте задаются в справочнике подрядчиков.
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
              disabled={isSaving}
              className="px-8 py-3.5 bg-red-700 hover:bg-red-800 text-white rounded-2xl text-sm font-bold shadow-md flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Сохранить параметры</span>
            </button>
          </div>
        )}
      </div>

      {streetModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-neutral-900">
                {streetModal.mode === 'edit' ? 'Редактирование улицы' : 'Новая улица'}
              </h3>
              <button onClick={() => setStreetModal(null)} aria-label="Закрыть" className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400">
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
                    setStreetErrors({});
                  }}
                  placeholder="ул. Ленина"
                  aria-invalid={!!streetErrors.name}
                  className={`w-full h-10 px-3 bg-neutral-50 border rounded-xl outline-none ${
                    streetErrors.name ? 'border-red-500' : 'border-neutral-200'
                  }`}
                />
                {streetErrors.name && <div className="text-red-600 font-medium mt-1">{streetErrors.name}</div>}
              </div>

              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Район</label>
                <select
                  value={streetForm.district}
                  onChange={(e) => setStreetForm({ ...streetForm, district: e.target.value })}
                  className="w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                >
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Категория дороги</label>
                <select
                  value={streetForm.group}
                  onChange={(e) => setStreetForm({ ...streetForm, group: e.target.value as StreetGroup })}
                  className="w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                >
                  {STREET_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      Категория {g}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStreetModal(null)}
                  className="flex-1 h-10 bg-neutral-100 hover:bg-neutral-200 rounded-xl font-semibold cursor-pointer"
                >
                  Отмена
                </button>
                <button type="submit" className="flex-1 h-10 bg-red-700 hover:bg-red-800 text-white rounded-xl font-bold cursor-pointer">
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
