import { useEffect, useState, type FormEvent } from 'react';
import { UserPlus, X } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { api } from '../../api';
import type { AnyRole, Role, UserOut } from '../../api';
import { useReference } from '../../data/useReference';

const ROLE_LABEL: Record<AnyRole, string> = { dispatcher: 'Диспетчер', contractor: 'Подрядчик', citizen: 'Гражданин' };
const PAGE_SIZE = 4;

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Неизвестная ошибка');

const fullName = (u: UserOut) => `${u.last_name} ${u.first_name}`.trim();
const initialsOf = (u: UserOut) => `${u.last_name[0] ?? ''}${u.first_name[0] ?? ''}`.toUpperCase() || '··';

export default function UsersPage() {
  const { contractors } = useReference();

  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all');
  const [page, setPage] = useState(1);
  const [tick, setTick] = useState(0);
  const [pageError, setPageError] = useState<string | null>(null);

  // Сотрудников немного — берём диспетчеров и подрядчиков разом (граждан в списке нет)
  // и фильтруем/листаем на клиенте
  const [result, setResult] = useState<{ tick: number; users: UserOut[]; error?: string } | null>(null);
  const isLoading = result?.tick !== tick;
  const users = result?.users ?? [];

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getUsers({ role: 'dispatcher', limit: 200 }), api.getUsers({ role: 'contractor', limit: 200 })])
      .then(([d, c]) => !cancelled && setResult({ tick, users: [...d.items, ...c.items] }))
      .catch((err: unknown) => !cancelled && setResult({ tick, users: [], error: errorText(err) }));
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const filteredUsers = users.filter((u) => roleFilter === 'all' || u.role === roleFilter);
  const dispatchersCount = users.filter((u) => u.role === 'dispatcher').length;
  const contractorsCount = users.filter((u) => u.role === 'contractor').length;
  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ---- Создание ----
  const [isModalOpen, setIsModalOpen] = useState(false);
  const emptyForm = { lastName: '', firstName: '', login: '', password: '', role: 'dispatcher' as Role, contractorId: '' };
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setForm(emptyForm);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.lastName.trim() || !form.firstName.trim() || !form.login.trim()) {
      return setFormError('Заполните фамилию, имя и логин.');
    }
    if (!form.password) return setFormError('Введите пароль.'); // требования к паролю проверяет бэкенд
    if (form.role === 'contractor' && !form.contractorId) return setFormError('Для подрядчика выберите организацию.');

    setSaving(true);
    try {
      await api.createUser({
        login: form.login.trim(),
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        role: form.role,
        password: form.password,
        contractor_id: form.role === 'contractor' ? Number(form.contractorId) : null,
      });
      setIsModalOpen(false);
      setTick((t) => t + 1);
    } catch (err) {
      setFormError(errorText(err)); // 409/422: текст с бэкенда
    } finally {
      setSaving(false);
    }
  };

  // ---- Отключение / включение (удаления в API нет) ----
  const toggleActive = async (user: UserOut) => {
    const action = user.is_active ? 'отключить' : 'включить';
    if (!confirm(`Вы действительно хотите ${action} пользователя ${fullName(user)}?`)) return;
    setPageError(null);
    try {
      await api.updateUser(user.id, { is_active: !user.is_active });
      setTick((t) => t + 1);
    } catch (err) {
      setPageError(errorText(err));
    }
  };

  // ---- Новый пароль ----
  const [resetTarget, setResetTarget] = useState<UserOut | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetDone, setResetDone] = useState<string | null>(null);

  const submitReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (!newPassword) return setResetError('Введите пароль.');
    try {
      await api.resetUserPassword(resetTarget.id, newPassword);
      setResetDone(`Пароль пользователя ${fullName(resetTarget)} изменён.`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      setResetError(errorText(err));
    }
  };

  const inputClass = 'w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 text-neutral-800 antialiased">
      <header className="px-4 pt-4 pb-3 flex items-start justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Пользователи системы</h1>
          <p className="text-xs text-neutral-400 mt-1 font-light">Реестр учетных записей сотрудников и роли доступа</p>
        </div>

        <button
          onClick={openCreate}
          className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm font-bold rounded-2xl shadow-md flex items-center gap-2 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Добавить сотрудника</span>
        </button>
      </header>

      <div className="px-4 pb-4 shrink-0">
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-1.5 inline-flex items-center gap-1 shadow-sm text-xs">
          {([
            { id: 'all' as const, label: `Все (${users.length})` },
            { id: 'dispatcher' as const, label: `Диспетчеры (${dispatchersCount})` },
            { id: 'contractor' as const, label: `Подрядчики (${contractorsCount})` },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setRoleFilter(tab.id);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition-all ${
                roleFilter === tab.id ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {(pageError || result?.error || resetDone) && (
          <div className={`mt-3 text-xs font-medium ${resetDone && !pageError && !result?.error ? 'text-emerald-700' : 'text-red-600'}`}>
            {pageError ?? (result?.error ? `Не удалось загрузить пользователей: ${result.error}` : resetDone)}
          </div>
        )}
      </div>

      <div className="flex-1 px-4 pb-4 overflow-hidden flex flex-col">
        <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 flex-1 flex flex-col justify-between overflow-hidden">
          <div className="overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-100 text-neutral-400 uppercase font-semibold text-xs tracking-wider pb-3">
                  <th className="py-2 px-3">Сотрудник</th>
                  <th className="py-2 px-3 text-center">Роль</th>
                  <th className="py-2 px-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pagedUsers.map((user) => (
                  <tr key={user.id} className={`hover:bg-neutral-50/70 transition-colors ${user.is_active ? '' : 'opacity-60'}`}>
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-3.5">
                        <div
                          className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-sm ${
                            user.role === 'dispatcher' ? 'bg-neutral-200 text-neutral-700' : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {initialsOf(user)}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-neutral-900">
                            {fullName(user)}
                            {!user.is_active && (
                              <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded bg-neutral-200 text-neutral-600">
                                отключён
                              </span>
                            )}
                          </div>
                          <div className="text-neutral-400 text-xs mt-0.5 font-light">{user.login}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-3 text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          user.role === 'dispatcher' ? 'bg-blue-50 text-blue-900' : 'bg-orange-50 text-orange-800'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${user.role === 'dispatcher' ? 'bg-blue-900' : 'bg-orange-600'}`}></span>
                        <span>{ROLE_LABEL[user.role]}</span>
                      </span>
                    </td>

                    <td className="py-4 px-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => {
                            setResetTarget(user);
                            setNewPassword('');
                            setResetError(null);
                            setResetDone(null);
                          }}
                          className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-xl text-sm font-bold cursor-pointer"
                        >
                          Сменить пароль
                        </button>
                        <button
                          onClick={() => toggleActive(user)}
                          className={`px-5 py-2 rounded-xl text-sm font-bold cursor-pointer text-white ${
                            user.is_active ? 'bg-red-700 hover:bg-red-800' : 'bg-emerald-700 hover:bg-emerald-800'
                          }`}
                        >
                          {user.is_active ? 'Отключить' : 'Включить'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!isLoading && pagedUsers.length === 0 && (
              <div className="py-10 text-center text-xs text-neutral-400 font-light">Сотрудников нет</div>
            )}
          </div>

          <Pagination
            currentPage={page}
            totalItems={filteredUsers.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            itemLabel="сотрудников"
          />
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-900">Новый сотрудник</h3>
              <button onClick={() => setIsModalOpen(false)} aria-label="Закрыть" className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs" noValidate>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-600 mb-1 font-medium">Фамилия *</label>
                  <input
                    type="text"
                    placeholder="Иванов"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-neutral-600 mb-1 font-medium">Имя *</label>
                  <input
                    type="text"
                    placeholder="Иван"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Логин *</label>
                <input
                  type="text"
                  placeholder="i.ivanov"
                  value={form.login}
                  onChange={(e) => setForm({ ...form, login: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Пароль *</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Роль в системе *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role, contractorId: '' })}
                  className={`${inputClass} font-semibold`}
                >
                  <option value="dispatcher">Диспетчер</option>
                  <option value="contractor">Подрядчик</option>
                </select>
              </div>

              {form.role === 'contractor' && (
                <div>
                  <label className="block text-neutral-600 mb-1 font-medium">Подрядная организация *</label>
                  <select
                    value={form.contractorId}
                    onChange={(e) => setForm({ ...form, contractorId: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Выберите организацию…</option>
                    {contractors
                      .filter((c) => c.is_active)
                      .map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {formError && <div className="text-red-600 font-medium">{formError}</div>}

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-neutral-200 rounded-xl font-bold text-neutral-600 cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-red-700 text-white rounded-xl font-bold cursor-pointer disabled:opacity-60"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-900">Новый пароль</h3>
              <button onClick={() => setResetTarget(null)} aria-label="Закрыть" className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 font-bold">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitReset} className="space-y-3.5 text-xs" noValidate>
              <p className="text-neutral-500">{fullName(resetTarget)}</p>
              <input
                type="password"
                autoFocus
                autoComplete="new-password"
                placeholder="Новый пароль"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
              />
              {resetError && <div className="text-red-600 font-medium">{resetError}</div>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="flex-1 py-2.5 border border-neutral-200 rounded-xl font-bold text-neutral-600 cursor-pointer"
                >
                  Отмена
                </button>
                <button type="submit" className="flex-1 py-2.5 bg-red-700 text-white rounded-xl font-bold cursor-pointer">
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
