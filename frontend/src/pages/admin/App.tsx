import { useEffect, useState } from 'react';
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
import { api, session, AUTH_EXPIRED_EVENT, IS_DEMO } from '../../api';

import { MenuIcon } from '../../components/UiIcons';
export default function App() {
  // Сессию восстанавливаем из localStorage, если токен ещё есть
  const [userRole, setUserRole] = useState<'dispatcher' | 'contractor' | null>(() =>
    session.accessToken ? session.role : null
  );
  const [activeTab, setActiveTab] = useState<'dispatcher' | 'map' | 'planned' | 'reports' | 'contractors' | 'admin' | 'users'>('dispatcher');

  const [focusRequestId, setFocusRequestId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false); // меню на узких экранах

  // Токен не удалось обновить (refresh тоже 401) — возвращаем на страницу входа
  useEffect(() => {
    const onExpired = () => {
      setUserRole(null);
      setActiveTab('dispatcher');
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const handleLogout = async () => {
    await api.logout();
    setUserRole(null);
    setActiveTab('dispatcher');
  };

  if (!userRole) {
    return <LoginPage onLogin={(role) => setUserRole(role)} />;
  }

  return (
    <div className="relative flex h-screen w-full bg-neutral-100 antialiased overflow-hidden">
      {IS_DEMO && (
        <div className="absolute bottom-3 right-3 z-[2000] px-3 py-1.5 rounded-full bg-neutral-800 text-white text-xs shadow-lg pointer-events-none">
          Демо-режим: изменения хранятся только в браузере
        </div>
      )}
      {userRole === 'contractor' ? (
        <ContractorPage onLogout={handleLogout} />
      ) : (
        <>
          <Sidebar
            activeTab={activeTab}
            onSelectTab={(tabId) => {
              setFocusRequestId(null);
              setActiveTab(tabId as typeof activeTab);
              setMenuOpen(false);
            }}
            onLogout={handleLogout}
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
          />

          <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
            <div className="lg:hidden flex h-12 shrink-0 items-center gap-3 bg-neutral-600 px-3 text-white">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Открыть меню"
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10 cursor-pointer"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
              <span className="text-xs font-light leading-tight">NEO-СЕРВИС: ЯМОЧНЫЙ РЕМОНТ</span>
            </div>
            {activeTab === 'dispatcher' && <DispatcherPage focusRequestId={focusRequestId} />}
            {activeTab === 'map' && (
              <MapPage
                onNavigateToRequest={(id) => {
                  setFocusRequestId(id);
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
    </div>
  );
}