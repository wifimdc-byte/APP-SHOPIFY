import { useState, useEffect } from 'react';
import { useApi } from '../context/ApiContext.jsx';
import axios from 'axios';

const MarketingPage = () => {
  const { baseURL, token } = useApi();
  const [activeTab, setActiveTab] = useState('splash');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState(null);

  // Splash State
  const [splashConfig, setSplashConfig] = useState({ enabled: false, imageUrl: null });
  
  // Content Page State
  const [contentPages, setContentPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [contentConfig, setContentConfig] = useState({ 
    name: '',
    title: '', 
    text: '', 
    imageUrl: null, 
    imageFile: null,
    fullscreenImageUrl: null,
    fullscreenImageFile: null,
    buttonText: '', 
    buttonLink: '' 
  });
  const [isEditing, setIsEditing] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const savedToken = token || localStorage.getItem('dashboard_token');
      const headers = { Authorization: `Bearer ${savedToken}` };

      const [splashRes, contentPagesRes] = await Promise.all([
        axios.get(`${baseURL}/marketing/splash`, { headers }),
        axios.get(`${baseURL}/marketing/content-pages`, { headers })
      ]);

      // Garantir que o estado seja atualizado corretamente com os dados do servidor
      // Limpar qualquer arquivo temporário ao carregar do servidor
      console.log('📱 [MarketingPage] Dados recebidos do servidor:', splashRes.data);
      const splashData = splashRes.data || {};
      setSplashConfig({
        enabled: splashData.enabled === true || splashData.enabled === 'true' || false,
        imageUrl: splashData.imageUrl || null,
        imageFile: null // Sempre limpar arquivo temporário ao carregar do servidor
      });
      console.log('📱 [MarketingPage] Estado atualizado:', {
        enabled: splashData.enabled === true || splashData.enabled === 'true' || false,
        imageUrl: splashData.imageUrl || null
      });
      if (contentPagesRes.data.pages) {
        setContentPages(contentPagesRes.data.pages);
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error);
      showToast('Erro ao carregar configurações', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleSplashSave = async (e) => {
    e.preventDefault();
    setUploading(true);
    try {
      const formData = new FormData();
      // Garantir que enabled seja enviado como string 'true' ou 'false'
      formData.append('enabled', splashConfig.enabled ? 'true' : 'false');
      
      console.log('📱 [MarketingPage] Salvando splash:', {
        enabled: splashConfig.enabled,
        hasImageFile: !!splashConfig.imageFile,
        imageUrl: splashConfig.imageUrl
      });
      
      // Se há um arquivo novo, enviar o arquivo
      if (splashConfig.imageFile) {
        formData.append('image', splashConfig.imageFile);
      } else if (splashConfig.imageUrl && !splashConfig.imageUrl.startsWith('blob:')) {
        // Se não há arquivo novo mas há uma imageUrl válida (não é blob temporário), manter a URL existente
        formData.append('imageUrl', splashConfig.imageUrl);
      }
      // Se não há nem arquivo nem URL válida, não enviar imageUrl (será null no backend)

      const savedToken = token || localStorage.getItem('dashboard_token');
      const response = await axios.post(`${baseURL}/marketing/splash`, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${savedToken}` 
        }
      });

      // Atualizar o estado com a resposta do servidor e limpar imageFile
      setSplashConfig({
        enabled: response.data.config.enabled,
        imageUrl: response.data.config.imageUrl,
        imageFile: null // Limpar o arquivo temporário após salvar
      });
      showToast('Configuração de Splash salva com sucesso!');
    } catch (error) {
      console.error('Erro ao salvar splash:', error);
      showToast('Erro ao salvar splash', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleContentSave = async (e) => {
    e.preventDefault();
    if (!contentConfig.name || !contentConfig.title) {
      showToast('Nome e título são obrigatórios', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', contentConfig.name);
      formData.append('title', contentConfig.title);
      formData.append('text', contentConfig.text);
      formData.append('buttonText', contentConfig.buttonText);
      formData.append('buttonLink', contentConfig.buttonLink);
      
      if (contentConfig.imageFile) {
        formData.append('image', contentConfig.imageFile);
      } else {
        formData.append('imageUrl', contentConfig.imageUrl || '');
      }

      if (contentConfig.fullscreenImageFile) {
        formData.append('fullscreenImage', contentConfig.fullscreenImageFile);
      } else {
        formData.append('fullscreenImageUrl', contentConfig.fullscreenImageUrl || '');
      }

      const savedToken = token || localStorage.getItem('dashboard_token');
      const url = isEditing && selectedPageId 
        ? `${baseURL}/marketing/content-page/${selectedPageId}`
        : `${baseURL}/marketing/content-page`;
      
      const method = isEditing ? 'put' : 'post';
      const response = await axios[method](url, formData, {
        headers: { 
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${savedToken}` 
        }
      });

      await fetchConfigs(); // Recarregar lista
      setContentConfig({ name: '', title: '', text: '', imageUrl: null, imageFile: null, fullscreenImageUrl: null, fullscreenImageFile: null, buttonText: '', buttonLink: '' });
      setSelectedPageId(null);
      setIsEditing(false);
      showToast(`Página de conteúdo ${isEditing ? 'atualizada' : 'criada'} com sucesso!`);
    } catch (error) {
      showToast('Erro ao salvar página de conteúdo', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleEditPage = async (pageId) => {
    try {
      const savedToken = token || localStorage.getItem('dashboard_token');
      const headers = { Authorization: `Bearer ${savedToken}` };
      const response = await axios.get(`${baseURL}/marketing/content-page/${pageId}`, { headers });
      
      const page = response.data.page;
      setContentConfig({
        name: page.name,
        title: page.title,
        text: page.text || '',
        imageUrl: page.image_url,
        imageFile: null,
        fullscreenImageUrl: page.fullscreen_image_url,
        fullscreenImageFile: null,
        buttonText: page.button_text || '',
        buttonLink: page.button_link || ''
      });
      setSelectedPageId(pageId);
      setIsEditing(true);
    } catch (error) {
      showToast('Erro ao carregar página', 'error');
    }
  };

  const handleDeletePage = async (pageId) => {
    if (!confirm('Tem certeza que deseja deletar esta página de conteúdo?')) {
      return;
    }

    try {
      const savedToken = token || localStorage.getItem('dashboard_token');
      const headers = { Authorization: `Bearer ${savedToken}` };
      await axios.delete(`${baseURL}/marketing/content-page/${pageId}`, { headers });
      
      await fetchConfigs();
      if (selectedPageId === pageId) {
        setContentConfig({ name: '', title: '', text: '', imageUrl: null, imageFile: null, fullscreenImageUrl: null, fullscreenImageFile: null, buttonText: '', buttonLink: '' });
        setSelectedPageId(null);
        setIsEditing(false);
      }
      showToast('Página de conteúdo deletada com sucesso!');
    } catch (error) {
      showToast('Erro ao deletar página de conteúdo', 'error');
    }
  };

  const handleNewPage = () => {
    setContentConfig({ name: '', title: '', text: '', imageUrl: null, imageFile: null, fullscreenImageUrl: null, fullscreenImageFile: null, buttonText: '', buttonLink: '' });
    setSelectedPageId(null);
    setIsEditing(false);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Carregando...</div>;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, color: '#1e293b' }}>Marketing & Campanhas</h1>
        <p style={{ margin: '8px 0 0', color: '#64748b' }}>Gerencie popups promocionais e páginas de conteúdo.</p>
      </div>

      {toast && (
        <div style={{
          padding: '12px 16px', marginBottom: 24, borderRadius: 8,
          background: toast.type === 'success' ? '#d1fae5' : '#fee2e2',
          color: toast.type === 'success' ? '#065f46' : '#991b1b',
          border: `1px solid ${toast.type === 'success' ? '#a7f3d0' : '#fecaca'}`
        }}>
          {toast.message}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid #e2e8f0' }}>
        <button
          onClick={() => setActiveTab('splash')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'splash' ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === 'splash' ? '#6366f1' : '#64748b',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          Splash Promocional (Modal)
        </button>
        <button
          onClick={() => setActiveTab('content')}
          style={{
            padding: '12px 24px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'content' ? '2px solid #6366f1' : '2px solid transparent',
            color: activeTab === 'content' ? '#6366f1' : '#64748b',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          Página de Conteúdo
        </button>
      </div>

      {activeTab === 'splash' && (
        <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <form onSubmit={handleSplashSave}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={splashConfig.enabled}
                  onChange={(e) => setSplashConfig({ ...splashConfig, enabled: e.target.checked })}
                  style={{ width: 20, height: 20 }}
                />
                <span style={{ fontSize: 16, fontWeight: 500 }}>Ativar Modal Promocional (1x ao dia)</span>
              </label>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Imagem do Banner (Vertical)</label>
              {splashConfig.imageUrl && (
                <div style={{ marginBottom: 12, width: 200, height: 355, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                  <img src={splashConfig.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    // Criar URL temporária para preview
                    const previewUrl = URL.createObjectURL(file);
                    setSplashConfig({ 
                      ...splashConfig, 
                      imageFile: file,
                      imageUrl: previewUrl
                    });
                  }
                }}
              />
              {splashConfig.imageFile && (
                <p style={{ fontSize: 12, color: '#10b981', marginTop: 4 }}>
                  ✓ Novo arquivo selecionado. Clique em "Salvar Configuração" para aplicar.
                </p>
              )}
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Ou cole uma URL da imagem (ex.: Shopify/CDN)</label>
                <input
                  type="text"
                  value={splashConfig.imageUrl && !splashConfig.imageFile ? splashConfig.imageUrl : ''}
                  onChange={(e) => setSplashConfig({ ...splashConfig, imageUrl: e.target.value, imageFile: null })}
                  placeholder="https://..."
                  style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Recomendado: 1080x1920px (9:16)</p>
            </div>

            <button
              type="submit"
              disabled={uploading}
              style={{
                padding: '12px 24px',
                background: '#6366f1',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 500,
                cursor: uploading ? 'not-allowed' : 'pointer',
                opacity: uploading ? 0.7 : 1
              }}
            >
              {uploading ? 'Salvando...' : 'Salvar Configuração'}
            </button>
          </form>
        </div>
      )}

      {activeTab === 'content' && (
        <div>
          <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Páginas de Conteúdo</h2>
              <button
                type="button"
                onClick={handleNewPage}
                style={{
                  padding: '8px 16px',
                  background: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                + Nova Página
              </button>
            </div>

            {contentPages.length > 0 ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {contentPages.map(page => (
                  <div key={page.id} style={{ 
                    padding: 16, 
                    border: '1px solid #e2e8f0', 
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{page.name}</div>
                      <div style={{ fontSize: 14, color: '#64748b' }}>{page.title}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                        ID: {page.id} • Criada em: {new Date(page.created_at).toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleEditPage(page.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#6366f1',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 14
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePage(page.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 14
                        }}
                      >
                        Deletar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>
                Nenhuma página de conteúdo criada ainda. Clique em "Nova Página" para criar uma.
              </p>
            )}
          </div>

          <div className="card" style={{ background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 600 }}>
              {isEditing ? 'Editar Página de Conteúdo' : 'Criar Nova Página de Conteúdo'}
            </h3>
            <p style={{ marginBottom: 24, color: '#64748b', fontSize: 14 }}>
              {isEditing 
                ? 'Edite os dados da página de conteúdo. Use o ID desta página ao enviar notificações.'
                : 'Crie uma nova página de conteúdo. Você receberá um ID que poderá usar ao enviar notificações.'}
            </p>
            <form onSubmit={handleContentSave}>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Nome da Página (Identificação Interna) *</label>
                <input
                  type="text"
                  value={contentConfig.name}
                  onChange={(e) => setContentConfig({ ...contentConfig, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  placeholder="Ex: Promoção de Verão 2024"
                  required
                />
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Este nome é apenas para identificação interna. O ID gerado será usado nas notificações.
                </p>
              </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Título da Página</label>
              <input
                type="text"
                value={contentConfig.title}
                onChange={(e) => setContentConfig({ ...contentConfig, title: e.target.value })}
                style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                placeholder="Ex: Promoção de Verão"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Texto do Conteúdo</label>
              <textarea
                value={contentConfig.text}
                onChange={(e) => setContentConfig({ ...contentConfig, text: e.target.value })}
                style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #cbd5e1', minHeight: 120 }}
                placeholder="Digite o texto detalhado..."
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Imagem de Capa</label>
              {contentConfig.imageUrl && (
                <div style={{ marginBottom: 12, maxWidth: 400, height: 200, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                  <img src={contentConfig.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setContentConfig({ 
                      ...contentConfig, 
                      imageFile: file,
                      imageUrl: URL.createObjectURL(file) 
                    });
                  }
                }}
              />
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Ou cole uma URL da imagem (ex.: Shopify/CDN)</label>
                <input
                  type="text"
                  value={contentConfig.imageUrl && !contentConfig.imageFile ? contentConfig.imageUrl : ''}
                  onChange={(e) => setContentConfig({ ...contentConfig, imageUrl: e.target.value, imageFile: null })}
                  placeholder="https://..."
                  style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Imagem de Tela Cheia</label>
              {contentConfig.fullscreenImageUrl && (
                <div style={{ marginBottom: 12, width: 200, height: 355, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                  <img src={contentConfig.fullscreenImageUrl} alt="Fullscreen Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    setContentConfig({ 
                      ...contentConfig, 
                      fullscreenImageFile: file,
                      fullscreenImageUrl: URL.createObjectURL(file) 
                    });
                  }
                }}
              />
              <div style={{ marginTop: 8 }}>
                <label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>Ou cole uma URL da imagem de tela cheia</label>
                <input
                  type="text"
                  value={contentConfig.fullscreenImageUrl && !contentConfig.fullscreenImageFile ? contentConfig.fullscreenImageUrl : ''}
                  onChange={(e) => setContentConfig({ ...contentConfig, fullscreenImageUrl: e.target.value, fullscreenImageFile: null })}
                  placeholder="https://..."
                  style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                />
              </div>
              <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Recomendado: 1080x1920px (9:16)</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Texto do Botão</label>
                <input
                  type="text"
                  value={contentConfig.buttonText}
                  onChange={(e) => setContentConfig({ ...contentConfig, buttonText: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  placeholder="Ex: Ver Ofertas"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Link do Botão (Opcional)</label>
                <input
                  type="text"
                  value={contentConfig.buttonLink}
                  onChange={(e) => setContentConfig({ ...contentConfig, buttonLink: e.target.value })}
                  style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="submit"
                disabled={uploading}
                style={{
                  padding: '12px 24px',
                  background: '#6366f1',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 500,
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  opacity: uploading ? 0.7 : 1
                }}
              >
                {uploading ? 'Salvando...' : (isEditing ? 'Atualizar Página' : 'Criar Página')}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleNewPage}
                  style={{
                    padding: '12px 24px',
                    background: '#64748b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
            {isEditing && selectedPageId && (
              <div style={{ marginTop: 16, padding: 12, background: '#f1f5f9', borderRadius: 6 }}>
                <strong>ID desta página:</strong> <code style={{ background: '#fff', padding: '2px 6px', borderRadius: 4 }}>{selectedPageId}</code>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                  Use este ID ao enviar notificações do tipo "Página de Conteúdo"
                </p>
              </div>
            )}
          </form>
        </div>
        </div>
      )}
    </div>
  );
};

export default MarketingPage;
