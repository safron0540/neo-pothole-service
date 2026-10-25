import { 
  AlertCircle, 
  MapPin, 
  Route, 
  BarChart3, 
  HardHat, 
  Settings, 
  Users, 
  User,
  LogOut
} from 'lucide-react';
import logoSvg from "../assets/logo.svg";

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
}

export function Sidebar({ activeTab, onSelectTab, onLogout }: SidebarProps) {
  const menuItems = [
    { title: 'Требует решения', id: 'dispatcher', icon: AlertCircle },
    { title: 'Карта заявок', id: 'map', icon: MapPin },
    { title: 'Плановый ремонт', id: 'planned', icon: Route },
    { title: 'Отчеты', id: 'reports', icon: BarChart3 },
    { title: 'Управление подрядчиками', id: 'contractors', icon: HardHat },
    { title: 'Администрирование', id: 'admin', icon: Settings },
    { title: 'Пользователи', id: 'users', icon: Users },
  ];

  return (
    <aside className="w-64 bg-neutral-700 text-white flex flex-col justify-between shrink-0 shadow-lg z-30">
      <div>
        <div className="flex items-center gap-3 p-5 border-b border-neutral-600">
          <img 
            src={logoSvg} 
            alt="NEO-СЕРВИС" 
            className="w-8 h-9 shrink-0 object-contain drop-shadow-sm" 
          />
          <div className="text-xs font-bold uppercase leading-tight tracking-wide">
            NEO-СЕРВИС:<br />ЯМОЧНЫЙ РЕМОНТ
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-3 ${
                  isActive
                    ? 'bg-red-700 text-white shadow-sm font-semibold'
                    : 'text-neutral-300 hover:bg-neutral-600 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
                <span className="truncate">{item.title}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-neutral-600 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Иванова Е. А.</div>
          <div className="text-xs text-neutral-400">Старший диспетчер</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-red-700 text-white flex items-center justify-center shadow-sm">
            <User className="w-4 h-4" />
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Выйти"
            aria-label="Выйти"
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-600 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}