import { useState } from 'react';
import { UserPlus, X } from 'lucide-react';
import { Pagination } from '../../components/Pagination';

interface UserItem {
  id: number;
  initials: string;
  avatarBg: string;
  avatarText: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'Диспетчер' | 'Подрядчик';
}

const INITIAL_USERS: UserItem[] = [
  {
    id: 1,
    initials: 'ЕИ',
    avatarBg: 'bg-red-700',
    avatarText: 'text-white',
    fullName: 'Иванова Елена Алексеевна',
    email: 'e.ivanova@mos-service.ru',
    phone: '+7 (926) 430-11-22',
    role: 'Диспетчер',
  },
  {
    id: 2,
    initials: 'СП',
    avatarBg: 'bg-neutral-200',
    avatarText: 'text-neutral-700',
    fullName: 'Петров Сергей Михайлович',
    email: 's.petrov@mos-service.ru',
    phone: '+7 (903) 819-44-01',
    role: 'Диспетчер',
  },
  {
    id: 3,
    initials: 'ВС',
    avatarBg: 'bg-orange-100',
    avatarText: 'text-orange-800',
    fullName: 'Соколов Виктор Павлович',
    email: 'v.sokolov@dorstroy-lider.ru',
    phone: '+7 (915) 302-88-75',
    role: 'Подрядчик',
  },
  {
    id: 4,
    initials: 'АС',
    avatarBg: 'bg-orange-100',
    avatarText: 'text-orange-800',
    fullName: 'Смирнов Андрей Николаевич',
    email: 'a.smirnov@avtodor-sever.ru',
    phone: '+7 (985) 674-12-90',
    role: 'Подрядчик',
  },
];

export default function UsersPage() {
  const [users, setUsers] = useState<UserItem[]>(INITIAL_USERS);
  const [roleFilter, setRoleFilter] = useState<'all' | 'dispatcher' | 'contractor'>('all');

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState<'Диспетчер' | 'Подрядчик'>('Диспетчер');

  const filteredUsers = users.filter((u) => {
    if (roleFilter === 'dispatcher') return u.role === 'Диспетчер';
    if (roleFilter === 'contractor') return u.role === 'Подрядчик';
    return true;
  });

  const pagedUsers = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Вы действительно хотите деактивировать пользователя ${name}?`)) {
      setUsers(users.filter((u) => u.id !== id));
    }
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newEmail.trim()) return;

    const initials = newFullName.split(' ').map((p) => p[0]).join('').substring(0, 2).toUpperCase();
    const newUser: UserItem = {
      id: Date.now(),
      initials: initials || 'НП',
      avatarBg: newRole === 'Диспетчер' ? 'bg-neutral-200' : 'bg-orange-100',
      avatarText: newRole === 'Диспетчер' ? 'text-neutral-700' : 'text-orange-800',
      fullName: newFullName,
      email: newEmail,
      phone: newPhone || '+7 (000) 000-00-00',
      role: newRole,
    };

    setUsers([newUser, ...users]);
    setIsModalOpen(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-100 font-sans text-neutral-800 antialiased">
      <header className="px-8 pt-7 pb-4 flex items-start justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 leading-tight">Пользователи системы</h1>
          <p className="text-xs text-neutral-400 mt-1">Реестр учетных записей сотрудников и роли доступа</p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white text-xs font-bold rounded-2xl shadow-md flex items-center gap-2 cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Добавить сотрудника</span>
        </button>
      </header>

      <div className="px-8 pb-4 shrink-0">
        <div className="bg-white rounded-2xl border border-neutral-200/80 p-1.5 inline-flex items-center gap-1 shadow-sm text-xs">
          <button
            onClick={() => { setRoleFilter('all'); setPage(1); }}
            className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition-all ${
              roleFilter === 'all' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500'
            }`}
          >
            Все (24)
          </button>
          <button
            onClick={() => { setRoleFilter('dispatcher'); setPage(1); }}
            className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition-all ${
              roleFilter === 'dispatcher' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500'
            }`}
          >
            Диспетчеры (6)
          </button>
          <button
            onClick={() => { setRoleFilter('contractor'); setPage(1); }}
            className={`px-4 py-2 rounded-xl font-bold cursor-pointer transition-all ${
              roleFilter === 'contractor' ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-500'
            }`}
          >
            Подрядчики (18)
          </button>
        </div>
      </div>

      <div className="flex-1 px-8 pb-8 overflow-hidden flex flex-col">
        <div className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm p-6 flex-1 flex flex-col justify-between overflow-hidden">
          <div className="overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-100 text-neutral-400 uppercase font-semibold text-[10px] tracking-wider pb-3">
                  <th className="py-2 px-3">Сотрудник</th>
                  <th className="py-2 px-3 text-center">Роль</th>
                  <th className="py-2 px-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pagedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-50/70 transition-colors">
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-3.5">
                        <div className={`w-11 h-11 rounded-full ${user.avatarBg} ${user.avatarText} flex items-center justify-center font-bold text-xs shrink-0 shadow-sm`}>
                          {user.initials}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-neutral-900">{user.fullName}</div>
                          <div className="text-neutral-400 text-xs mt-0.5">{user.email}</div>
                          <div className="text-neutral-400 text-xs">{user.phone}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                        user.role === 'Диспетчер' ? 'bg-blue-50 text-blue-900' : 'bg-orange-50 text-orange-800'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.role === 'Диспетчер' ? 'bg-blue-900' : 'bg-orange-600'}`}></span>
                        <span>{user.role}</span>
                      </span>
                    </td>

                    <td className="py-4 px-3 text-right">
                      <button
                        onClick={() => handleDelete(user.id, user.fullName)}
                        className="px-6 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <h3 className="text-base font-bold text-neutral-900">Новый сотрудник</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-full hover:bg-neutral-100 text-neutral-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-neutral-600 mb-1 font-medium">ФИО сотрудника *</label>
                <input
                  type="text"
                  required
                  placeholder="Иванов Иван Иванович"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                />
              </div>

              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Email (Логин) *</label>
                <input
                  type="email"
                  required
                  placeholder="user@mos-service.ru"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                />
              </div>

              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Телефон</label>
                <input
                  type="tel"
                  placeholder="+7 (999) 000-00-00"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none"
                />
              </div>

              <div>
                <label className="block text-neutral-600 mb-1 font-medium">Роль в системе *</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full h-10 px-3 bg-neutral-50 border border-neutral-200 rounded-xl outline-none font-semibold"
                >
                  <option value="Диспетчер">Диспетчер</option>
                  <option value="Подрядчик">Подрядчик</option>
                </select>
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-neutral-200 rounded-xl font-semibold text-neutral-600"
                >
                  Отмена
                </button>
                <button type="submit" className="flex-1 py-2.5 bg-red-700 text-white rounded-xl font-bold cursor-pointer">
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