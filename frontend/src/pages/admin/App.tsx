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

export default function App() {
  // Сессию восстанавливаем из localStorage, если токен ещё есть
  const [userRole, setUserRole] = useState<'dispatcher' | 'contractor' | null>(() =>
    session.accessToken ? session.role : null
  );
  const [activeTab, setActiveTab] = useState<'dispatcher' | 'map' | 'planned' | 'reports' | 'contractors' | 'admin' | 'users'>('dispatcher');

  const [focusRequestId, setFocusRequestId] = useState<number | null>(null);

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
            }}
            onLogout={handleLogout}
          />

          <div className="flex-1 flex flex-col h-full overflow-hidden">
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