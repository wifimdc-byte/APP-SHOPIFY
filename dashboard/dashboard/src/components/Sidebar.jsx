import { useState } from 'react';

const Sidebar = ({ activePage, onPageChange, user, onLogout }) => {
  const [showSettings, setShowSettings] = useState(false);
  const menuItems = [
    { id: 'editor', label: 'Editor & Templates', icon: '📝' },
    { id: 'metrics', label: 'Métricas', icon: '📊' },
    { id: 'customers', label: 'Clientes', icon: '👥' },
    { id: 'notifications', label: 'Notificações', icon: '🔔' },
    { id: 'app-icon', label: 'Ícone do App', icon: '🖼️' },
    { id: 'marketing', label: 'Marketing', icon: '📣' },
    { id: 'splash-screen', label: 'Tela de Splash', icon: '📱' },
    { id: 'hours', label: 'Horários', icon: '🕐' },
    { id: 'coupons', label: 'Cupons Diários', icon: '🎫' },
  ];

  return (
    <div
      style={{
        width: 240,
        minHeight: '100vh',
        background: '#1e293b',
        color: '#f1f5f9',
        padding: '20px 0',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ padding: '0 20px 20px', borderBottom: '1px solid rgba(148,163,184,0.2)' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Dashboard</h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.7 }}>Melhor das Casas</p>
        {user && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(148,163,184,0.2)' }}>
            <p style={{ margin: 0, fontSize: 11, opacity: 0.8 }}>👤 {user.nome || user.email}</p>
            <p style={{ margin: '4px 0 0', fontSize: 10, opacity: 0.6 }}>Admin</p>
          </div>
        )}
      </div>
      <nav style={{ flex: 1, padding: '20px 0' }}>
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onPageChange(item.id)}
            style={{
              width: '100%',
              padding: '12px 20px',
              background: activePage === item.id ? 'rgba(109,40,217,0.2)' : 'transparent',
              border: 'none',
              color: activePage === item.id ? '#e9d5ff' : '#cbd5e1',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (activePage !== item.id) {
                e.target.style.background = 'rgba(148,163,184,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (activePage !== item.id) {
                e.target.style.background = 'transparent';
              }
            }}
          >
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div style={{ padding: '0 20px', borderTop: '1px solid rgba(148,163,184,0.2)', paddingTop: '20px' }}>
        {onLogout && (
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              padding: '10px',
              background: 'rgba(239,68,68,0.2)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            🚪 Sair
          </button>
        )}
      </div>
    </div>
  );
};

export default Sidebar;

