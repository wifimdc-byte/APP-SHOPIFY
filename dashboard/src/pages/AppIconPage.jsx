import { useState, useEffect } from 'react';
import { useApi } from '../context/ApiContext.jsx';
import axios from 'axios';

const AppIconPage = () => {
  const { request, baseURL, token } = useApi();
  const [iconUrl, setIconUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchIcon = async () => {
    setLoading(true);
    try {
      const data = await request({ url: '/app-icon' });
      if (data.icon) {
        setIconUrl(data.icon);
      }
    } catch (error) {
      console.error('Erro ao buscar ícone:', error);
      showToast('Erro ao carregar ícone atual', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIcon();
  }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      showToast('Por favor, selecione um arquivo de imagem', 'error');
      return;
    }

    // Validar tamanho (5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast('O arquivo deve ter no máximo 5MB', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('icon', file);

      // Usar axios diretamente para FormData
      const savedToken = token || localStorage.getItem('dashboard_token') || '';
      
      const response = await axios.post(
        `${baseURL}/app-icon`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: savedToken ? `Bearer ${savedToken}` : '',
          },
        }
      );

      if (response.data.icon) {
        setIconUrl(response.data.icon);
        showToast('Ícone atualizado com sucesso! Uma nova build do app será necessária para aplicar as mudanças.', 'success');
      }
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      showToast(
        error.response?.data?.error || 'Erro ao fazer upload do ícone',
        'error'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja remover o ícone?')) return;

    setUploading(true);
    try {
      await request({
        method: 'DELETE',
        url: '/app-icon',
      });
      setIconUrl(null);
      showToast('Ícone removido com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao remover ícone:', error);
      showToast('Erro ao remover ícone', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: '#1e293b' }}>
          Ícone do App
        </h1>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 14 }}>
          Gerencie o ícone do aplicativo. Após atualizar, será necessário gerar uma nova build do app.
        </p>
      </div>

      {toast && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 24,
            borderRadius: 8,
            background: toast.type === 'success' ? '#d1fae5' : '#fee2e2',
            color: toast.type === 'success' ? '#065f46' : '#991b1b',
            fontSize: 14,
            border: `1px solid ${toast.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          }}
        >
          {toast.message}
        </div>
      )}

      <div
        className="card"
        style={{
          padding: 32,
          marginBottom: 24,
        }}
      >
        <h2 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
          Ícone Atual
        </h2>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: '#64748b' }}>Carregando...</p>
          </div>
        ) : iconUrl ? (
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <img
              src={iconUrl}
              alt="Ícone do app"
              style={{
                width: 120,
                height: 120,
                borderRadius: 24,
                objectFit: 'cover',
                border: '2px solid #e2e8f0',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              }}
            />
            <p style={{ marginTop: 16, color: '#64748b', fontSize: 14 }}>
              {iconUrl}
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            <p>Nenhum ícone configurado</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              background: '#6366f1',
              color: '#fff',
              borderRadius: 8,
              cursor: uploading ? 'not-allowed' : 'pointer',
              fontSize: 14,
              fontWeight: 500,
              opacity: uploading ? 0.6 : 1,
              pointerEvents: uploading ? 'none' : 'auto',
            }}
          >
            {uploading ? 'Enviando...' : iconUrl ? 'Atualizar Ícone' : 'Enviar Ícone'}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </label>

          {iconUrl && (
            <button
              onClick={handleDelete}
              disabled={uploading}
              style={{
                padding: '12px 24px',
                background: '#ef4444',
                color: '#fff',
                borderRadius: 8,
                border: 'none',
                cursor: uploading ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 500,
                opacity: uploading ? 0.6 : 1,
              }}
            >
              Remover Ícone
            </button>
          )}
        </div>

        <div
          style={{
            marginTop: 32,
            padding: 16,
            background: '#f1f5f9',
            borderRadius: 8,
            fontSize: 13,
            color: '#475569',
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, marginBottom: 8 }}>ℹ️ Informações:</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Formato recomendado: PNG com fundo transparente</li>
            <li>Tamanho recomendado: 1024x1024 pixels</li>
            <li>Tamanho máximo: 5MB</li>
            <li>Após atualizar, gere uma nova build do app para aplicar as mudanças</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AppIconPage;

