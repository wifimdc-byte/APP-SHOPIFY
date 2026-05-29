import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar.jsx';
import EditorPage from './pages/EditorPage.jsx';
import MetricsPage from './pages/MetricsPage.jsx';
import CustomersPage from './pages/CustomersPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import AppIconPage from './pages/AppIconPage.jsx';
import SplashScreenPage from './pages/SplashScreenPage.jsx';
import MarketingPage from './pages/MarketingPage.jsx';
import HoursPage from './pages/HoursPage.jsx';
import CouponsPage from './pages/CouponsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import { useApi } from './context/ApiContext.jsx';

const App = () => {
  const { baseURL, setBaseURL, token, setToken } = useApi();
  const [activePage, setActivePage] = useState('editor');
  const [user, setUser] = useState(null);

  const isAuthenticated = Boolean(token);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
  };

  const renderPage = () => {
    if (!isAuthenticated) {
      return <LoginPage onLogin={handleLogin} />;
    }

    switch (activePage) {
      case 'editor':
        return <EditorPage />;
      case 'metrics':
        return <MetricsPage />;
      case 'customers':
        return <CustomersPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'app-icon':
        return <AppIconPage />;
      case 'splash-screen':
        return <SplashScreenPage />;
      case 'marketing':
        return <MarketingPage />;
      case 'hours':
        return <HoursPage />;
      case 'coupons':
        return <CouponsPage />;
      default:
        return <EditorPage />;
    }
  };

  // Se não estiver autenticado, mostrar apenas a página de login
  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        onPageChange={setActivePage}
        user={user}
        onLogout={handleLogout}
      />
      <main
        className="content"
        style={{
          marginLeft: 240, // Largura da sidebar
          padding: '24px',
          minHeight: '100vh',
        }}
      >
        {renderPage()}
      </main>
    </div>
  );
};

export default App;
