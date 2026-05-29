import { useState, useEffect } from 'react';
import { useApi } from '../context/ApiContext.jsx';
import axios from 'axios';

const NotificationSender = ({ onSend, sending }) => {
  const { baseURL, token } = useApi();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [userIds, setUserIds] = useState('');
  const [emoji, setEmoji] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [type, setType] = useState('general'); // general | order
  const [targetType, setTargetType] = useState('home'); // home | collection | order
  const [targetValue, setTargetValue] = useState('');
  const [contentPages, setContentPages] = useState([]);
  const [loadingPages, setLoadingPages] = useState(false);

  useEffect(() => {
    const fetchContentPages = async () => {
      if (targetType === 'content') {
        setLoadingPages(true);
        try {
          const savedToken = token || localStorage.getItem('dashboard_token');
          const response = await axios.get(`${baseURL}/marketing/content-pages`, {
            headers: { Authorization: `Bearer ${savedToken}` }
          });
          setContentPages(response.data.pages || []);
        } catch (error) {
          console.error('Erro ao carregar páginas de conteúdo:', error);
          setContentPages([]);
        } finally {
          setLoadingPages(false);
        }
      }
    };

    fetchContentPages();
  }, [targetType, baseURL, token]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const ids = userIds
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const data = {
      type,
      emoji: emoji || undefined,
      imageUrl: imageUrl || undefined,
    };

    if (targetType === 'collection' && targetValue) {
      data.target = { screen: 'Home', collectionId: targetValue };
    } else if (targetType === 'order' && targetValue) {
      data.target = { screen: 'OrderDetail', orderId: targetValue, orderNumber: targetValue };
      data.orderId = targetValue;
      data.orderNumber = targetValue;
      data.type = 'order';
    } else if (targetType === 'content' && targetValue) {
      data.target = { screen: 'ContentPage', contentPageId: targetValue };
    } else {
      data.target = { screen: 'Home' };
    }

    onSend({
      title,
      body,
      userIds: ids.length > 0 ? ids : undefined,
      data,
    });
  };

  return (
    <div className="card">
      <h2>Notificações push</h2>
      <form className="notification-form" onSubmit={handleSubmit}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" required />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Mensagem" required />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            placeholder="Emoji (opcional)"
            maxLength={2}
          />
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="URL da imagem quadrada (opcional)"
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="general">Geral</option>
            <option value="order">Pedido</option>
          </select>
          <select value={targetType} onChange={(e) => setTargetType(e.target.value)}>
            <option value="home">Ir para Início</option>
            <option value="collection">Ir para Collection</option>
            <option value="order">Ir para Pedido</option>
            <option value="content">Página de Conteúdo</option>
          </select>
        </div>
        {targetType === 'collection' && (
          <input
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="ID da collection"
            required
          />
        )}
        {targetType === 'order' && (
          <input
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder="# do pedido"
            required
          />
        )}
        {targetType === 'content' && (
          <div>
            {loadingPages ? (
              <div style={{ padding: '10px', textAlign: 'center', color: '#64748b' }}>
                Carregando páginas de conteúdo...
              </div>
            ) : contentPages.length > 0 ? (
              <select
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                required
                style={{ width: '100%', padding: '10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              >
                <option value="">Selecione uma página de conteúdo</option>
                {contentPages.map(page => (
                  <option key={page.id} value={page.id}>
                    {page.name} (ID: {page.id}) - {page.title}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ padding: '10px', background: '#fef3c7', borderRadius: 6, color: '#92400e' }}>
                Nenhuma página de conteúdo encontrada. Crie uma página em <strong>Marketing &gt; Página de Conteúdo</strong> primeiro.
              </div>
            )}
          </div>
        )}
        <input
          value={userIds}
          onChange={(e) => setUserIds(e.target.value)}
          placeholder="IDs de usuário (opcional, separados por vírgula)"
        />
        <button className="primary" type="submit" disabled={sending}>
          Enviar notificação
        </button>
      </form>
    </div>
  );
};

export default NotificationSender;


















