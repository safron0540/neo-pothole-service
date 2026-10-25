import { Search, Building2, Bell, User } from 'lucide-react';
import { TomskClock } from './TomskClock';

export function Header() {
  return (
    <header className="h-16 bg-white border-b border-neutral-200 px-8 flex items-center justify-between shrink-0 shadow-sm z-10">
      <div className="flex items-center gap-4 flex-1 max-w-2xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Быстрый поиск по номеру заявки, адресу или дефекту..."
            className="w-full h-10 pl-10 pr-4 text-xs bg-neutral-100 rounded-xl outline-none border border-transparent focus:border-red-600 transition-all placeholder:text-neutral-400"
          />
        </div>
        
        <div className="h-10 px-4 bg-neutral-100 rounded-xl text-xs flex items-center gap-2 text-neutral-600 border border-neutral-200 cursor-pointer">
          <Building2 className="w-4 h-4 text-neutral-500" />
          <span>Все районы</span>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <TomskClock />

        <button className="relative text-neutral-400 hover:text-neutral-800 transition-colors p-1 cursor-pointer">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-600 ring-2 ring-white"></span>
        </button>

        <div className="flex items-center gap-2.5 pl-3 border-l border-neutral-200">
          <div className="text-right">
            <div className="text-xs font-bold text-neutral-800">Иванова Е. А.</div>
            <div className="text-[11px] text-neutral-400">Старший диспетчер</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-red-700 text-white flex items-center justify-center shadow-sm">
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>
    </header>
  );
}