import { MapPin, Route, BarChart3, HardHat, Settings, Users, User, LogOut } from 'lucide-react';
import logoSvg from '../assets/logo.svg';
import { useMe, shortName } from '../data/useMe';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
}

// Иконка «Требуют решения» из макета: четыре точки 2×2
function DotsGrid({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="5" cy="5" r="2" />
      <circle cx="11" cy="5" r="2" />
      <circle cx="5" cy="11" r="2" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}

const MENU = [
  { title: 'Требуют решения', id: 'dispatcher', icon: DotsGrid },
  { title: 'Карта заявок', id: 'map', icon: MapPin },
  { title: 'Плановый ремонт', id: 'planned', icon: Route },
  { title: 'Отчеты', id: 'reports', icon: BarChart3 },
  { title: 'Управление подрядчиками', id: 'contractors', icon: HardHat },
  { title: 'Администрирование', id: 'admin', icon: Settings },
  { title: 'Пользователи', id: 'users', icon: Users },
];

// Макет «Веб/Треб_панель»: колонка 240 px, #616161; отступы 32 / 16 / 11 / 8; пункты 34 px, радиус 8, зазор 10
export function Sidebar({ activeTab, onSelectTab, onLogout }: SidebarProps) {
  const me = useMe();

  return (
    <aside className="w-[240px] shrink-0 bg-neutral-600 text-white flex flex-col justify-between pl-8 pr-[11px] pt-4 pb-2 z-30">
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
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`h-[34px] w-full rounded-lg pl-2 pr-1 flex items-center gap-2 text-left text-sm font-normal text-white cursor-pointer transition-colors ${
                  isActive ? 'bg-red-700 shadow-[0_4px_4px_rgba(0,0,0,0.15)]' : 'hover:bg-white/10'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="truncate">{item.title}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex items-end justify-end gap-3 pl-2">
        <button
          type="button"
          onClick={onLogout}
          title="Выйти"
          aria-label="Выйти"
          className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
        <div className="text-right leading-tight">
          <div className="text-sm font-bold whitespace-nowrap">{shortName(me)}</div>
          <div className="text-xs font-normal whitespace-nowrap">{me?.role === 'contractor' ? 'Подрядчик' : 'Диспетчер'}</div>
        </div>
        <div className="w-8 h-8 shrink-0 rounded-full bg-red-700 flex items-center justify-center">
          <User className="w-3 h-3" />
        </div>
      </div>
    </aside>
  );
}
