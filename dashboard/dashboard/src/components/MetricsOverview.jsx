const MetricsOverview = ({ summary, daily }) => (
  <div className="card">
    <h2>Métricas (últimos dias)</h2>
    <div className="metrics">
      {summary.map((metric) => (
        <div key={metric.eventName} className="metric-pill">
          <strong>{metric.total}</strong>
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>{metric.eventName}</div>
        </div>
      ))}
      {summary.length === 0 && <p style={{ opacity: 0.6 }}>Nenhum evento registrado.</p>}
    </div>
    {daily.length > 0 && (
      <div style={{ marginTop: 16 }}>
        <small style={{ opacity: 0.7 }}>Últimos registros</small>
        <ul>
          {daily.slice(-5).map((row) => (
            <li key={`${row.date}-${row.eventName}`}>
              {new Date(row.date).toLocaleDateString('pt-BR')} • {row.eventName} → {row.total}
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

export default MetricsOverview;


















