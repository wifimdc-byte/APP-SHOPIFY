import { useCallback, useEffect, useMemo, useState } from 'react';
import TemplateList from '../components/TemplateList.jsx';
import TemplateEditor from '../components/TemplateEditor.jsx';
import { useApi } from '../context/ApiContext.jsx';

const EditorPage = () => {
  const { baseURL, token, request } = useApi();
  const [templates, setTemplates] = useState([]);
  const [activeTemplateId, setActiveTemplateId] = useState(null);
  const [templateDetail, setTemplateDetail] = useState(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTemplates = useCallback(async () => {
    if (!token) {
      console.log('[EditorPage] Sem token, não buscando templates');
      setTemplates([]);
      return;
    }
    console.log('[EditorPage] Buscando templates...', { tokenLength: token.length });
    setLoadingTemplates(true);
    try {
      const data = await request({ url: '/home-config/templates' });
      console.log('[EditorPage] Resposta completa:', JSON.stringify(data, null, 2));
      const templatesArray = Array.isArray(data.templates) ? data.templates : (data.templates ? [data.templates] : []);
      console.log('[EditorPage] Templates processados:', templatesArray.length);
      setTemplates(templatesArray);
      if (templatesArray.length > 0 && !activeTemplateId) {
        console.log('[EditorPage] Selecionando primeiro template:', templatesArray[0].id);
        setActiveTemplateId(templatesArray[0].id);
      }
    } catch (error) {
      console.error('[EditorPage] Erro ao buscar templates:', error);
      console.error('[EditorPage] Status:', error.response?.status);
      console.error('[EditorPage] Dados do erro:', error.response?.data);
      console.error('[EditorPage] Mensagem:', error.message);
      const errorMsg = error.response?.data?.error || error.response?.data?.message || error.message;
      showToast(`Erro ao carregar templates: ${errorMsg}`, 'error');
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }, [request, token, activeTemplateId]);

  const fetchTemplateDetail = useCallback(
    async (templateId) => {
      if (!templateId) return;
      try {
        const data = await request({ url: `/home-config/templates/${templateId}` });
        setTemplateDetail(data);
      } catch (error) {
        console.error(error);
        showToast('Erro ao carregar template', 'error');
      }
    },
    [request]
  );

  const handleCreateTemplate = async () => {
    const name = window.prompt('Nome do novo template');
    if (!name) return;
    try {
      await request({
        method: 'POST',
        url: '/home-config/templates',
        data: { name },
      });
      showToast('Template criado');
      fetchTemplates();
    } catch (error) {
      console.error(error);
      showToast('Erro ao criar template', 'error');
    }
  };

  const handleSelectTemplate = (templateId) => {
    setActiveTemplateId(templateId);
  };

  useEffect(() => {
    if (activeTemplateId) {
      fetchTemplateDetail(activeTemplateId);
    }
  }, [activeTemplateId, fetchTemplateDetail]);

  useEffect(() => {
    console.log('[EditorPage] useEffect disparado', { token: !!token, baseURL });
    if (token) {
      fetchTemplates();
    } else {
      console.log('[EditorPage] Sem token, limpando templates');
      setTemplates([]);
      setActiveTemplateId(null);
      setTemplateDetail(null);
    }
  }, [token, baseURL, fetchTemplates]);

  const handleSaveLayout = async (payload) => {
    if (!activeTemplateId) return;
    setSavingLayout(true);
    try {
      await request({
        method: 'PUT',
        url: `/home-config/templates/${activeTemplateId}/layout`,
        data: payload,
      });
      showToast('Rascunho salvo');
      fetchTemplateDetail(activeTemplateId);
    } catch (error) {
      console.error(error);
      showToast('Erro ao salvar rascunho', 'error');
    } finally {
      setSavingLayout(false);
    }
  };

  const handlePublish = async (payload) => {
    if (!activeTemplateId) return;
    try {
      await handleSaveLayout(payload);
      await request({
        method: 'POST',
        url: `/home-config/templates/${activeTemplateId}/publish`,
        data: {},
      });
      showToast('Template publicado');
      fetchTemplates();
      fetchTemplateDetail(activeTemplateId);
    } catch (error) {
      console.error(error);
      showToast('Erro ao publicar', 'error');
    }
  };

  const handleUploadBanner = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const data = await request({
      method: 'POST',
      url: '/home-config/media/banner',
      data: formData,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  };

  const draftVersion = useMemo(() => {
    if (!templateDetail) return null;
    return templateDetail.draftVersion || templateDetail.publishedVersion;
  }, [templateDetail]);

  return (
    <div>
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            background: toast.type === 'error' ? '#fee2e2' : '#ecfdf5',
            color: toast.type === 'error' ? '#b91c1c' : '#047857',
            padding: '12px 16px',
            borderRadius: 12,
            boxShadow: '0 10px 20px rgba(0,0,0,0.15)',
            zIndex: 1000,
          }}
        >
          {toast.message}
        </div>
      )}

      <div className="grid" style={{ marginBottom: 24 }}>
        <TemplateList
          templates={templates}
          activeTemplateId={activeTemplateId}
          onSelect={handleSelectTemplate}
          onCreate={handleCreateTemplate}
          loading={loadingTemplates}
        />
        <TemplateEditor
          template={templateDetail?.template}
          draftVersion={draftVersion}
          onSaveLayout={handleSaveLayout}
          onPublish={handlePublish}
          onUploadBanner={handleUploadBanner}
          saving={savingLayout}
          baseURL={baseURL}
        />
      </div>
    </div>
  );
};

export default EditorPage;

