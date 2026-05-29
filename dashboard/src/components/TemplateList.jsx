const statusColors = {
  published: '#22c55e',
  draft: '#f59e0b',
  archived: '#94a3b8',
};

const TemplateList = ({ templates, activeTemplateId, onSelect, onCreate, loading }) => {
  return (
    <div className="card">
      <h2>
        Templates
        <button className="secondary" onClick={onCreate} disabled={loading}>
          + Criar
        </button>
      </h2>
      <div className="list">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`template-item ${template.id === activeTemplateId ? 'active' : ''}`}
            onClick={() => onSelect(template.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{template.name}</strong>
              <span
                className="status-chip"
                style={{ background: `${statusColors[template.status] || '#ddd'}22`, color: statusColors[template.status] }}
              >
                {template.status}
              </span>
            </div>
            <small>Atualizado em {new Date(template.updatedAt).toLocaleString('pt-BR')}</small>
            {template.latestDraft && (
              <small style={{ display: 'block', color: '#6d28d9' }}>
                Rascunho v{template.latestDraft.version} ({new Date(template.latestDraft.created_at).toLocaleDateString('pt-BR')})
              </small>
            )}
          </div>
        ))}
        {templates.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <p style={{ opacity: 0.7, marginBottom: 12 }}>Nenhum template ainda.</p>
            <p style={{ fontSize: 12, opacity: 0.6 }}>
              Clique em "+ Criar" para criar seu primeiro template ou verifique se o token JWT está correto.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TemplateList;


