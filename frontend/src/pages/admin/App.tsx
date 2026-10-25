import { useState } from 'react';
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
import { api } from '../../api';

export default function App() {
  const [userRole, setUserRole] = useState<'dispatcher' | 'contractor' | null>(null);
  const [activeTab, setActiveTab] = useState<'dispatcher' | 'map' | 'planned' | 'reports' | 'contractors' | 'admin' | 'users'>('dispatcher');

  const [focusRequestId, setFocusRequestId] = useState<number | null>(null);

  const handleLogout = () => {
    api.logout();
    setUserRole(null);
    setActiveTab('dispatcher');
  };

  if (!userRole) {
    return <LoginPage onLogin={(role) => setUserRole(role)} />;
  }

  return (
    <div className="relative flex h-screen w-full bg-neutral-100 font-sans antialiased overflow-hidden">
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