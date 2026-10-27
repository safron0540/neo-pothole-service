import { useEffect, useState, type FormEvent } from 'react';
import { Pagination } from '../../components/Pagination';
import { api } from '../../api';
import type { AnyRole, Role, UserOut } from '../../api';
import { useReference } from '../../data/useReference';
import { useMe } from '../../data/useMe';

import { Icon } from '../../components/Icon';
import { CloseIcon } from '../../components/UiIcons';
const ROLE_LABEL: Record<AnyRole, string> = { dispatcher: 'Диспетчер', contractor: 'Подрядчик', citizen: 'Гражданин' };
const PAGE_SIZE = 4;

const errorText = (err: unknown) => (err instanceof Error ? err.message : 'Неизвестная ошибка');

const fullName = (u: UserOut) => `${u.last_name} ${u.first_name}`.trim();
const initialsOf = (u: UserOut) => `${u.last_name[0] ?? ''}${u.first_name[0] ?? ''}`.toUpperCase() || '··';

export default function UsersPage() {
  const { contractors } = useReference();
  const me = useMe();

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
    Promise.all([
      api.getUsers({ role: 'dispatcher', is_active: true, limit: 200 }),
      api.getUsers({ role: 'contractor', is_active: true, limit: 200 }),
    ])
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

  // ---- Удаление ----
  // В контракте API v1 пользователя нельзя удалить физически: «Удалить» отключает учётную запись (is_active = false),
  // и она пропадает из списка.
  const deleteUser = async (user: UserOut) => {
    if (!confirm(`Удалить пользователя ${fullName(user)}?`)) return;
    setPageError(null);
    try {
      await api.updateUser(user.id, { is_active: false });
      setTick((t) => t + 1);
    } catch (err) {
      setPageError(errorText(err));
    }
  };

  const inputClass = 'w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none';

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 text-neutral-800 antialiased">
      <header className="px-4 pt-4 pb-3 flex flex-wrap items-start justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Пользователи системы</h1>
          <p className="text-xs text-neutral-400 mt-1 font-light">Реестр учетных записей сотрудников и роли доступа</p>
        </div>

        <button
          onClick={openCreate}
          className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white text-sm font-bold rounded-2xl shadow-md flex items-center gap-2 cursor-pointer"
        >
          <Icon name="user-plus" className="h-[11px] w-[14px]" />
          <span>+ Добавить сотрудника</span>
        </button>
      </header>

      {/* Вкладки в белом блоке на всю ширину, группа вкладок — в серой плашке (макет «Веб/Польз») */}
      <div className="px-4 pb-4 shrink-0">
        <div className="flex items-center rounded-xl border border-neutral-200 bg-white p-[13px] shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_2px_-1px_rgba(0,0,0,0.05)]">
          <div
            role="tablist"
            aria-label="Роль"
            className="inline-flex items-center gap-1 rounded-lg border border-[rgba(226,232,240,0.7)] bg-[rgba(241,245,249,0.9)] p-[5px]"
          >
            {([
              { id: 'all' as const, label: `Все (${users.length})` },
              { id: 'dispatcher' as const, label: `Диспетчеры (${dispatchersCount})` },
              { id: 'contractor' as const, label: `Подрядчики (${contractorsCount})` },
            ]).map((tab) => {
              const active = roleFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setRoleFilter(tab.id);
                    setPage(1);
                  }}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                    active ? 'bg-white font-bold text-[#212121]' : 'font-normal text-[#616161] hover:text-[#212121]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        {(pageError || result?.error) && (
          <div className="mt-3 text-xs font-medium text-red-600">
            {pageError ?? `Не удалось загрузить пользователей: ${result?.error}`}
          </div>
        )}
      </div>

      <div className="flex-1 px-4 pb-4 overflow-hidden flex flex-col">
        <div className="flex flex-1 flex-col justify-between overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05),0_1px_2px_-1px_rgba(0,0,0,0.05)]">
          <div className="overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-neutral-200 bg-[rgba(248,250,252,0.8)] text-[11px] font-bold uppercase tracking-[0.55px] text-[#212121]">
                  <th className="px-5 py-5 font-bold">Сотрудник</th>
                  <th className="px-4 py-5 font-bold">Роль</th>
                  <th className="px-5 py-5 text-right font-bold">Действия</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((user) => {
                  const isMe = me?.id === user.id;
                  const isDispatcher = user.role === 'dispatcher';
                  return (
                    <tr key={user.id} className="border-b border-neutral-200 transition-colors hover:bg-neutral-100/50">
                      <td className="px-5 py-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              isMe
                                ? 'bg-gradient-to-tr from-[#9F0E00] to-[#C42915] text-white'
                                : isDispatcher
                                ? 'bg-neutral-200 text-[#616161]'
                                : 'bg-[#FFE8DE] text-[#9E4123]'
                            }`}
                          >
                            {initialsOf(user)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] font-bold leading-[18px] text-[#212121]">{fullName(user)}</div>
                            <div className="pt-1 text-[11px] leading-[14px] text-[#212121]">{user.login}</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-5">
                        <span
                          className={`inline-flex h-[26px] items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-bold text-[#212121] ${
                            isDispatcher
                              ? 'border-[rgba(191,219,254,0.6)] bg-[#eff6ff]'
                              : 'border-[rgba(214,107,73,0.3)] bg-[#FFF3EE]'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${isDispatcher ? 'bg-[#212121]' : 'bg-orange-500'}`} />
                          {ROLE_LABEL[user.role]}
                        </span>
                      </td>

                      <td className="px-5 py-5 text-right">
                        <button
                          onClick={() => deleteUser(user)}
                          className="h-[29px] w-[165px] rounded-lg bg-red-700 text-[13px] font-bold text-white shadow-[0_1px_1px_rgba(196,41,21,0.3)] transition-colors hover:bg-red-800 cursor-pointer"
                        >
                          Удалить
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!isLoading && pagedUsers.length === 0 && (
              <div className="py-10 text-center text-xs text-neutral-500">Сотрудников нет</div>
            )}
          </div>

          <div className="border-t border-neutral-200 px-5 py-3">
            <Pagination
              currentPage={page}
              totalItems={filteredUsers.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="сотрудников"
            />
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border border-neutral-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-neutral-900">Новый сотрудник</h3>
              <button onClick={() => setIsModalOpen(false)} aria-label="Закрыть" className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400 font-bold">
                <CloseIcon className="w-5 h-5" />
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

    </div>
  );
}
