import { useState } from 'react';
import { User, HardHat, ArrowLeftRight, LogOut } from 'lucide-react';
import LoginPage from '../login/LoginPage';
import DispatcherPage from '../dispatcher/DispatcherPage';
import MapPage from '../dispatcher/MapPage';
import PlannedRepairPage from '../dispatcher/PlannedRepairPage';
import ReportsPage from '../reports/ReportsPage';
import ContractorsPage from './ContractorsPage';
import AdminPage from './AdminPage';
import UsersPage from './UsersPage';
import ContractorPage from '../contractor/ContractorPage';
import { Sidebar } from '../../components/Sidebar';

export default function App() {
  const [userRole, setUserRole] = useState<'dispatcher' | 'contractor' | null>(null);
  const [activeTab, setActiveTab] = useState<'dispatcher' | 'map' | 'planned' | 'reports' | 'contractors' | 'admin' | 'users'>('dispatcher');

  if (!userRole) {
    return <LoginPage onLogin={(role) => setUserRole(role)} />;
  }

  return (
    <div className="relative flex h-screen w-full bg-neutral-100 font-sans antialiased overflow-hidden">
      {userRole === 'contractor' ? (
        <ContractorPage onLogout={() => setUserRole(null)} />
      ) : (
        <>
          <Sidebar
            activeTab={activeTab}
            onSelectTab={(tabId) => setActiveTab(tabId as any)}
          />

          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {activeTab === 'dispatcher' && <DispatcherPage />}
            {activeTab === 'map' && (
              <MapPage
                onNavigateToRequest={() => {
                  setActiveTab('dispatcher');
                }}
              />
            )}
            {activeTab === 'planned' && <PlannedRepairPage />}
            {activeTab === 'reports' && <ReportsPage />}
            {activeTab === 'contractors' && <ContractorsPage />}
            {activeTab === 'admin' && <AdminPage />}
            {activeTab === 'users' && <UsersPage />}
          </div>
        </>
      )}

      <div className="fixed bottom-4 right-4 z-50 bg-white/95 backdrop-blur-sm border border-neutral-300 shadow-xl rounded-2xl p-2 flex items-center gap-2 text-xs">
        <span className="font-semibold text-neutral-500 pl-1">Текущая роль:</span>
        
        <button
          type="button"
          onClick={() => setUserRole(userRole === 'dispatcher' ? 'contractor' : 'dispatcher')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm ${
            userRole === 'dispatcher'
              ? 'bg-red-700 text-white hover:bg-red-800'
              : 'bg-amber-600 text-white hover:bg-amber-700'
          }`}
        >
          {userRole === 'dispatcher' ? (
            <>
              <User className="w-3.5 h-3.5" />
              <span>Диспетчер</span>
            </>
          ) : (
            <>
              <HardHat className="w-3.5 h-3.5" />
              <span>Подрядчик</span>
            </>
          )}
          <ArrowLeftRight className="w-3 h-3 ml-1 opacity-75" />
        </button>

        <button
          type="button"
          onClick={() => setUserRole(null)}
          title="Выйти на экран логина"
          className="text-neutral-400 hover:text-red-700 font-medium px-2 py-1 flex items-center gap-1 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Выйти</span>
        </button>
      </div>
    </div>
  );
}