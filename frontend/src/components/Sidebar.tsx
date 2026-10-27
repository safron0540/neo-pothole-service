import logoSvg from '../assets/logo.svg';
import { useMe, shortName } from '../data/useMe';
import { Icon } from './Icon';

import { CloseIcon, LogoutIcon } from './UiIcons';
interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  /** Узкие экраны (<1024 px): меню — выезжающая панель */
  open?: boolean;
  onClose?: () => void;
}

const MENU = [
  { title: 'Требуют решения', id: 'dispatcher', iconName: 'nav-requests' },
  { title: 'Карта заявок', id: 'map', iconName: 'nav-map' },
  { title: 'Плановый ремонт', id: 'planned', iconName: 'nav-planned' },
  { title: 'Отчеты', id: 'reports', iconName: 'nav-reports' },
  { title: 'Управление подрядчиками', id: 'contractors', iconName: 'nav-contractors' },
  { title: 'Администрирование', id: 'admin', iconName: 'nav-admin' },
  { title: 'Пользователи', id: 'users', iconName: 'nav-users' },
];

// Макет «Веб/Треб_панель»: колонка 240 px, #616161; отступы 32 / 16 / 11 / 8; пункты 34 px, радиус 8, зазор 10
export function Sidebar({ activeTab, onSelectTab, onLogout, open = false, onClose }: SidebarProps) {
  const me = useMe();

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[240px] shrink-0 bg-neutral-600 text-white flex flex-col justify-between pl-8 pr-[11px] pt-4 pb-2 overflow-y-auto transition-transform duration-200 lg:relative lg:z-30 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть меню"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white lg:hidden cursor-pointer"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

      <div>
        <div className="flex items-center gap-[5px]">
          <img src={logoSvg} alt="NEO-СЕРВИС" className="w-[27px] h-9 shrink-0 object-contain" />
          <div className="text-xs font-light leading-normal whitespace-nowrap">
            NEO-СЕРВИС:
            <br />
            ЯМОЧНЫЙ РЕМОНТ
          </div>
        </div>

        <nav className="mt-[26px] flex flex-col gap-[10px]">
          {MENU.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`h-[34px] w-full rounded-lg pl-2 pr-1 flex items-center gap-2 text-left text-sm font-normal text-white cursor-pointer transition-colors ${
                  isActive ? 'bg-red-700 shadow-[0_4px_4px_rgba(0,0,0,0.15)]' : 'hover:bg-white/10'
                }`}
              >
                <Icon name={item.iconName} className="h-6 w-6 shrink-0" />
                <span className="truncate">{item.title}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center justify-center gap-3 pl-2">
        <div className="text-right leading-tight">
          <div className="text-sm font-bold whitespace-nowrap">{shortName(me)}</div>
          <div className="text-xs font-normal whitespace-nowrap">{me?.role === 'contractor' ? 'Подрядчик' : 'Диспетчер'}</div>
        </div>
        <Icon name="user-avatar" />
      </div>

      <button
        type="button"
        onClick={onLogout}
        title="Выйти"
        aria-label="Выйти"
        className="absolute right-2 bottom-2.5 w-7 h-7 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
      >
        <LogoutIcon className="w-4 h-4" />
      </button>
      </aside>
    </>
  );
}
