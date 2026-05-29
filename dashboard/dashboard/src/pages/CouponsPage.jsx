import { useState, useEffect } from 'react';
import { useApi } from '../context/ApiContext.jsx';

const CouponsPage = () => {
  const { baseURL, token } = useApi();
  const [loading, setLoading] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  
  // Estado da configuração
  const [config, setConfig] = useState({
    fabEnabled: true,
    fabIconUrl: '',
    howTo: ['', '', ''],
    couponTitle: 'CUPOM DIÁRIO',
    couponDiscountText: '10% OFF',
    couponBottomText: 'Mostre para o caixa',
    couponBottomSubtext: 'Válido apenas hoje',
    noteText: 'Limite de 1 uso por dia • Desconto máximo de R$ 20',
    // Novos campos para pré-divulgação e agendamento
    preLaunchEnabled: false,
    preLaunchImageUrl: '',
    fabScheduleEnabled: false,
    // formato datetime-local: 'YYYY-MM-DDTHH:MM'
    fabScheduleDateTime: ''
  });

  // Carregar configuração ao montar o componente
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoadingConfig(true);
      const response = await fetch(`${baseURL}/coupon/config`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setConfig({
          fabEnabled: data.fabEnabled !== undefined ? data.fabEnabled : true,
          fabIconUrl: data.fabIconUrl || '',
          howTo: data.howTo || ['', '', ''],
          couponTitle: data.couponTitle || 'CUPOM DIÁRIO',
          couponDiscountText: data.couponDiscountText || '10% OFF',
          couponBottomText: data.couponBottomText || 'Mostre para o caixa',
          couponBottomSubtext: data.couponBottomSubtext || 'Válido apenas hoje',
          noteText: data.noteText || 'Limite de 1 uso por dia • Desconto máximo de R$ 20',
          preLaunchEnabled: data.preLaunchEnabled ?? false,
          preLaunchImageUrl: data.preLaunchImageUrl || '',
          fabScheduleEnabled: data.fabScheduleEnabled ?? false,
          // normalizar ISO -> datetime-local
          fabScheduleDateTime: data.fabScheduleDateTime
            ? new Date(data.fabScheduleDateTime).toISOString().slice(0, 16)
            : ''
        });
      }
    } catch (err) {
      console.error('Erro ao carregar configuração:', err);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleResetCoupons = async () => {
    if (!window.confirm('Tem certeza que deseja resetar TODOS os cupons? Isso permitirá que todos os usuários utilizem o cupom novamente hoje.')) {
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`${baseURL}/coupon/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao resetar cupons');
      }

      setMessage(`✅ ${data.message || 'Cupons resetados com sucesso!'}`);
    } catch (err) {
      console.error('Erro ao resetar cupons:', err);
      setError(err.message || 'Erro ao resetar cupons');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`${baseURL}/coupon/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fabEnabled: config.fabEnabled,
          fabIconUrl: config.fabIconUrl || null,
          howTo: config.howTo,
          couponTitle: config.couponTitle,
          couponDiscountText: config.couponDiscountText,
          couponBottomText: config.couponBottomText,
          couponBottomSubtext: config.couponBottomSubtext,
          noteText: config.noteText,
          preLaunchEnabled: config.preLaunchEnabled,
          preLaunchImageUrl: config.preLaunchImageUrl || null,
          fabScheduleEnabled: config.fabScheduleEnabled,
          fabScheduleDateTime: config.fabScheduleDateTime || null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar configuração');
      }

      setMessage('✅ Configuração salva com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar configuração:', err);
      setError(err.message || 'Erro ao salvar configuração');
    } finally {
      setLoading(false);
    }
  };

  if (loadingConfig) {
    return (
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>
          🎫 Gerenciamento de Cupons Diários
        </h1>
        <p style={{ fontSize: 14, color: '#64748b' }}>Carregando...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: '#1e293b' }}>
        🎫 Gerenciamento de Cupons Diários
      </h1>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32 }}>
        Gerencie os cupons diários de desconto dos usuários
      </p>

      {/* Configurações */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: 24
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, color: '#1e293b' }}>
          ⚙️ Configurações do Cupom
        </h2>

        {message && (
          <div style={{
            padding: '12px 16px',
            marginBottom: 16,
            background: '#d1fae5',
            color: '#065f46',
            borderRadius: 8,
            fontSize: 14,
            border: '1px solid #6ee7b7'
          }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{
            padding: '12px 16px',
            marginBottom: 16,
            background: '#fee2e2',
            color: '#b91c1c',
            borderRadius: 8,
            fontSize: 14,
            border: '1px solid #fca5a5'
          }}>
            {error}
          </div>
        )}

        {/* FAB Enabled */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 14,
            fontWeight: 600,
            color: '#1e293b',
            marginBottom: 8
          }}>
            <input
              type="checkbox"
              checked={config.fabEnabled}
              onChange={(e) => setConfig({ ...config, fabEnabled: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            Ativar botão de cupom (FAB) no app
          </label>
          <p style={{ fontSize: 12, color: '#64748b', marginLeft: 30 }}>
            Quando desativado, o botão flutuante de cupom não aparecerá no app
          </p>
        </div>

        {/* Pré-divulgação */}
        <div style={{ marginBottom: 24, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 14,
            fontWeight: 600,
            color: '#1e293b',
            marginBottom: 8
          }}>
            <input
              type="checkbox"
              checked={config.preLaunchEnabled}
              onChange={(e) => setConfig({ ...config, preLaunchEnabled: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            Ativar pré-divulgação (mostrar imagem em vez do cupom)
          </label>
          <p style={{ fontSize: 12, color: '#64748b', marginLeft: 30, marginBottom: 8 }}>
            Antes do início da campanha, o FAB abre uma imagem de chamada com um botão de fechar, no lugar do cupom diário.
          </p>
          <div style={{ marginLeft: 30 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#64748b',
              marginBottom: 6
            }}>
              URL da imagem de pré-divulgação
            </label>
            <input
              type="text"
              value={config.preLaunchImageUrl}
              onChange={(e) => setConfig({ ...config, preLaunchImageUrl: e.target.value })}
              placeholder="https://exemplo.com/pre-campanha.png"
              style={{
                width: '100%',
                maxWidth: 480,
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit'
              }}
            />
            <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Essa imagem aparece em tela cheia com um “X” para fechar, quando o usuário toca no FAB.
            </p>
          </div>
        </div>

        {/* Agendamento do FAB */}
        <div style={{ marginBottom: 24, borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 14,
            fontWeight: 600,
            color: '#1e293b',
            marginBottom: 8
          }}>
            <input
              type="checkbox"
              checked={config.fabScheduleEnabled}
              onChange={(e) => setConfig({ ...config, fabScheduleEnabled: e.target.checked })}
              style={{ width: 18, height: 18, cursor: 'pointer' }}
            />
            Agendar ativação do cupom (horário de Brasília)
          </label>
          <p style={{ fontSize: 12, color: '#64748b', marginLeft: 30, marginBottom: 8 }}>
            A partir da data/hora configurada, a pré-divulgação é desativada automaticamente e o FAB passa a abrir o cupom diário normal.
          </p>
          <div style={{ marginLeft: 30 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#64748b',
              marginBottom: 6
            }}>
              Data e hora de início da campanha
            </label>
            <input
              type="datetime-local"
              value={config.fabScheduleDateTime}
              onChange={(e) => setConfig({ ...config, fabScheduleDateTime: e.target.value })}
              style={{
                padding: '8px 10px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit'
              }}
            />
          </div>
        </div>

        {/* FAB Icon URL */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            color: '#1e293b',
            marginBottom: 8
          }}>
            URL do Ícone do FAB
          </label>
          <input
            type="text"
            value={config.fabIconUrl}
            onChange={(e) => setConfig({ ...config, fabIconUrl: e.target.value })}
            placeholder="https://exemplo.com/icone-cupom.png"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: 14,
              fontFamily: 'inherit'
            }}
          />
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Deixe vazio para usar o ícone padrão. Use uma URL de imagem válida.
          </p>
        </div>

        {/* Como Usar */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            color: '#1e293b',
            marginBottom: 16
          }}>
            Como Usar (Instruções)
          </label>
          {[0, 1, 2].map((index) => (
            <div key={index} style={{ marginBottom: 12 }}>
              <label style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                color: '#64748b',
                marginBottom: 6
              }}>
                Passo {index + 1}
              </label>
              <input
                type="text"
                value={config.howTo[index] || ''}
                onChange={(e) => {
                  const newHowTo = [...config.howTo];
                  newHowTo[index] = e.target.value;
                  setConfig({ ...config, howTo: newHowTo });
                }}
                placeholder={`Texto do passo ${index + 1}`}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  fontSize: 14,
                  fontFamily: 'inherit'
                }}
              />
            </div>
          ))}
        </div>

        {/* Textos do Cupom */}
        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            color: '#1e293b',
            marginBottom: 16
          }}>
            Textos do Cupom
          </label>
          
          <div style={{ marginBottom: 12 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#64748b',
              marginBottom: 6
            }}>
              Título do Cupom
            </label>
            <input
              type="text"
              value={config.couponTitle}
              onChange={(e) => setConfig({ ...config, couponTitle: e.target.value })}
              placeholder="CUPOM DIÁRIO"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#64748b',
              marginBottom: 6
            }}>
              Texto do Desconto
            </label>
            <input
              type="text"
              value={config.couponDiscountText}
              onChange={(e) => setConfig({ ...config, couponDiscountText: e.target.value })}
              placeholder="10% OFF"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#64748b',
              marginBottom: 6
            }}>
              Texto Inferior (Principal)
            </label>
            <input
              type="text"
              value={config.couponBottomText}
              onChange={(e) => setConfig({ ...config, couponBottomText: e.target.value })}
              placeholder="Mostre para o caixa"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#64748b',
              marginBottom: 6
            }}>
              Texto Inferior (Secundário)
            </label>
            <input
              type="text"
              value={config.couponBottomSubtext}
              onChange={(e) => setConfig({ ...config, couponBottomSubtext: e.target.value })}
              placeholder="Válido apenas hoje"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit'
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              color: '#64748b',
              marginBottom: 6
            }}>
              Observação (Nota)
            </label>
            <input
              type="text"
              value={config.noteText}
              onChange={(e) => setConfig({ ...config, noteText: e.target.value })}
              placeholder="Limite de 1 uso por dia • Desconto máximo de R$ 20"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                fontSize: 14,
                fontFamily: 'inherit'
              }}
            />
          </div>
        </div>

        <button
          onClick={handleSaveConfig}
          disabled={loading}
          style={{
            padding: '12px 24px',
            background: loading ? '#94a3b8' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.target.style.background = '#2563eb';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.target.style.background = '#3b82f6';
            }
          }}
        >
          {loading ? '⏳ Salvando...' : '💾 Salvar Configurações'}
        </button>
      </div>

      {/* Resetar Cupons */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: 24
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#1e293b' }}>
          🔄 Resetar Cupons
        </h2>
        <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
          Esta ação irá resetar todos os cupons que foram utilizados hoje, permitindo que todos os usuários utilizem o cupom novamente.
        </p>

        <button
          onClick={handleResetCoupons}
          disabled={loading}
          style={{
            padding: '12px 24px',
            background: loading ? '#94a3b8' : '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            opacity: loading ? 0.6 : 1
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.target.style.background = '#dc2626';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.target.style.background = '#ef4444';
            }
          }}
        >
          {loading ? '⏳ Resetando...' : '🔄 Resetar Todos os Cupons'}
        </button>
      </div>

      {/* Informações */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#1e293b' }}>
          ℹ️ Informações
        </h2>
        <ul style={{ fontSize: 14, color: '#64748b', lineHeight: 1.8, paddingLeft: 20 }}>
          <li>Os cupons são resetados automaticamente todos os dias às 00:00</li>
          <li>Esta ação manual permite resetar todos os cupons utilizados hoje</li>
          <li>Após o reset, todos os usuários poderão utilizar o cupom novamente</li>
          <li>O limite de 1 uso por dia será aplicado novamente após o reset</li>
          <li>As configurações são aplicadas imediatamente no app após salvar</li>
        </ul>
      </div>
    </div>
  );
};

export default CouponsPage;
