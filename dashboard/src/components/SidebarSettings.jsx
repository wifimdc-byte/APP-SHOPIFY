const SidebarSettings = ({ baseURL, token, onBaseURLChange, onTokenChange }) => (
  <aside className="sidebar">
    <div>
      <h1>Melhor das Casas</h1>
      <p style={{ opacity: 0.8, margin: 0 }}>Dashboard de templates</p>
    </div>

    <div>
      <label htmlFor="base-url">API Base URL</label>
      <input
        id="base-url"
        value={baseURL}
        onChange={(e) => onBaseURLChange(e.target.value)}
        placeholder="https://app-shopify-hayo.onrender.com/api"
      />
    </div>

    <div>
      <label htmlFor="token">Token JWT (admin)</label>
      <input
        id="token"
        type="password"
        value={token}
        onChange={(e) => onTokenChange(e.target.value)}
        placeholder="Bearer token"
      />
    </div>
  </aside>
);

export default SidebarSettings;





