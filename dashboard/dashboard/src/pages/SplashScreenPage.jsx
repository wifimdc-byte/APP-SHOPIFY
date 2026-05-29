import { useState, useEffect } from 'react';
import { useApi } from '../context/ApiContext.jsx';
import axios from 'axios';

const SplashScreenPage = () => {
  const { request, baseURL, token } = useApi();
  const [splashUrl, setSplashUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSplash = async () => {
    setLoading(true);
    try {
      const data = await request({ url: '/splash-screen' });
      if (data.splash) {
        setSplashUrl(data.splash);
      }
    } catch (error) {
      console.error('Erro ao buscar splash screen:', error);
      showToast('Erro ao carregar splash screen atual', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSplash();
  }, []);

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      showToast('Por favor, selecione um arquivo de imagem', 'error');
      return;
    }

    // Validar tamanho (10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast('O arquivo deve ter no máximo 10MB', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('splash', file);

      // Usar axios diretamente para FormData
      const savedToken = token || localStorage.getItem('dashboard_token') || '';
      
      const response = await axios.post(
        `${baseURL}/splash-screen`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            Authorization: savedToken ? `Bearer ${savedToken}` : '',
          },
        }
      );

      if (response.data.splash) {
        setSplashUrl(response.data.splash);
        showToast('Splash screen atualizada com sucesso! Uma nova build do app será necessária para aplicar as mudanças.', 'success');
      }
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      showToast(
        error.response?.data?.error || 'Erro ao fazer upload da splash screen',
        'error'
      );
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja remover a splash screen?')) return;

    setUploading(true);
    try {
      await request({
        method: 'DELETE',
        url: '/splash-screen',
      });
      setSplashUrl(null);
      showToast('Splash screen removida com sucesso', 'success');
    } catch (error) {
      console.error('Erro ao remover splash screen:', error);
      showToast('Erro ao remover splash screen', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: '#1e293b' }}>
          Splash Screen
        </h1>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 14 }}>
          Gerencie a tela inicial (splash screen) do aplicativo. Após atualizar, será necessário gerar uma nova build do app.
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
          Splash Screen Atual
        </h2>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: '#64748b' }}>Carregando...</p>
          </div>
        ) : splashUrl ? (
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div
              style={{
                display: 'inline-block',
                width: '100%',
                maxWidth: 400,
                aspectRatio: '9/16', // Proporção típica de celular
                border: '2px solid #e2e8f0',
                borderRadius: 16,
                overflow: 'hidden',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                background: '#f8fafc',
              }}
            >
              <img
                src={splashUrl}
                alt="Splash screen"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </div>
            <p style={{ marginTop: 16, color: '#64748b', fontSize: 14, wordBreak: 'break-all' }}>
              {splashUrl}
            </p>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
            <p>Nenhuma splash screen configurada</p>
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
            {uploading ? 'Enviando...' : splashUrl ? 'Atualizar Splash Screen' : 'Enviar Splash Screen'}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              disabled={uploading}
            />
          </label>

          {splashUrl && (
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
              Remover Splash Screen
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
          <p style={{ margin: 0, fontWeight: 600, marginBottom: 8 }}>ℹ️ Informações sobre Splash Screen:</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><strong>Tamanho recomendado:</strong> 1242x2688 pixels (iPhone) ou 1080x1920 pixels (Android)</li>
            <li><strong>Proporção:</strong> 9:16 (portrait/vertical)</li>
            <li><strong>Formato:</strong> PNG ou JPG</li>
            <li><strong>Tamanho máximo:</strong> 10MB</li>
            <li><strong>Dica:</strong> A imagem será redimensionada automaticamente para caber na tela, mantendo a proporção</li>
            <li><strong>Importante:</strong> Após atualizar, gere uma nova build do app para aplicar as mudanças</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SplashScreenPage;














