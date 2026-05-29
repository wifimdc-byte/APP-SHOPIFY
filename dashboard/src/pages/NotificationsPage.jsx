import { useState, useEffect } from 'react';
import { useApi } from '../context/ApiContext.jsx';
import NotificationSender from '../components/NotificationSender.jsx';

const NotificationsPage = () => {
  const { token, request } = useApi();
  const [sendingNotification, setSendingNotification] = useState(false);
  const [toast, setToast] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [cartUsers, setCartUsers] = useState([]);
  const [loadingCartUsers, setLoadingCartUsers] = useState(false);
  const [showCartUsers, setShowCartUsers] = useState(false);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchTokens = async () => {
    setLoadingTokens(true);
    try {
      const data = await request({ url: '/notifications/tokens' });
      setTokens(data.tokens || []);
    } catch (error) {
      console.error('Erro ao buscar tokens:', error);
      showToast('Erro ao carregar tokens', 'error');
    } finally {
      setLoadingTokens(false);
    }
  };

  useEffect(() => {
    if (showTokens) {
      fetchTokens();
    }
  }, [showTokens]);

  const fetchCartUsers = async () => {
    setLoadingCartUsers(true);
    try {
      // Buscar eventos de cart_add das últimas 48 horas
      const endDate = new Date();
      const startDate = new Date();
      startDate.setHours(startDate.getHours() - 48);
      
      const startDateISO = startDate.toISOString();
      const endDateISO = endDate.toISOString();

      console.log('[NotificationsPage] Buscando usuários com carrinho...', {
        startDate: startDateISO,
        endDate: endDateISO
      });

      // Função helper para buscar todos os eventos com paginação
      const fetchAllEvents = async (eventName) => {
        let allEvents = [];
        let offset = 0;
        const limit = 500;
        let hasMore = true;

        while (hasMore) {
          try {
            const data = await request({ 
              url: `/analytics/events?startDate=${startDateISO}&endDate=${endDateISO}&eventName=${eventName}&limit=${limit}&offset=${offset}` 
            });

            const events = data.events || [];
            allEvents = allEvents.concat(events);
            
            console.log(`[NotificationsPage] Buscados ${events.length} eventos de ${eventName} (offset: ${offset}, total: ${allEvents.length})`);
            
            if (events.length < limit || allEvents.length >= (data.total || 0)) {
              hasMore = false;
            } else {
              offset += limit;
              // Delay entre requisições para evitar rate limiting
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (error) {
            console.error(`[NotificationsPage] Erro ao buscar eventos ${eventName} (offset: ${offset}):`, error);
            // Se for erro 429, parar e retornar o que já foi coletado
            if (error.response?.status === 429) {
              console.warn('[NotificationsPage] Rate limit atingido. Retornando eventos já coletados.');
              break;
            }
            throw error;
          }
        }
        
        return allEvents;
      };

      // Buscar todos os eventos com paginação
      const [cartAddEvents, checkoutEvents, orderEvents] = await Promise.all([
        fetchAllEvents('cart_add'),
        fetchAllEvents('checkout_proceed_click'),
        fetchAllEvents('order_completed')
      ]);

      console.log('[NotificationsPage] Eventos coletados:', {
        cartAdd: cartAddEvents.length,
        checkout: checkoutEvents.length,
        order: orderEvents.length
      });

      // IDs de usuários que já finalizaram
      const completedUserIds = new Set([
        ...checkoutEvents.map(e => e.userId).filter(Boolean),
        ...orderEvents.map(e => e.userId).filter(Boolean)
      ]);

      console.log('[NotificationsPage] Usuários que já finalizaram:', completedUserIds.size);

      // Agrupar usuários com carrinho (que não finalizaram)
      const usersWithCart = new Map();
      let eventsWithoutUserId = 0;
      
      cartAddEvents.forEach(event => {
        const userId = event.userId;
        if (!userId) {
          eventsWithoutUserId++;
          console.warn('[NotificationsPage] Evento cart_add sem userId:', {
            eventId: event.id,
            createdAt: event.createdAt,
            deviceId: event.deviceId
          });
          return;
        }
        
        if (!completedUserIds.has(userId)) {
          if (!usersWithCart.has(userId)) {
            usersWithCart.set(userId, {
              userId: userId,
              userName: event.userName || event.userEmail || `Usuário ${userId}`,
              userEmail: event.userEmail,
              lastCartAdd: event.createdAt,
              cartItemsCount: 0
            });
          }
          const user = usersWithCart.get(userId);
          user.cartItemsCount += (event.productQuantity || 1);
          // Atualizar última adição se for mais recente
          if (new Date(event.createdAt) > new Date(user.lastCartAdd)) {
            user.lastCartAdd = event.createdAt;
          }
        }
      });

      if (eventsWithoutUserId > 0) {
        console.warn(`[NotificationsPage] ${eventsWithoutUserId} eventos cart_add sem userId foram ignorados`);
      }

      let usersArray = Array.from(usersWithCart.values())
        .sort((a, b) => new Date(b.lastCartAdd) - new Date(a.lastCartAdd));

      console.log('[NotificationsPage] Usuários com carrinho encontrados (antes da verificação):', usersArray.length);
      
      // Verificar estado atual do carrinho de cada usuário
      console.log('[NotificationsPage] Verificando estado atual dos carrinhos...');
      const usersWithActiveCart = [];
      
      for (const user of usersArray) {
        try {
          // Verificar se o carrinho ainda tem itens
          const cartCheck = await request({
            url: `/cart/admin/user/${user.userId}`
          });
          
          if (cartCheck.hasItems && cartCheck.itemCount > 0) {
            usersWithActiveCart.push({
              ...user,
              currentItemCount: cartCheck.itemCount,
              currentTotal: cartCheck.total
            });
          } else {
            console.log(`[NotificationsPage] Usuário ${user.userId} não tem mais itens no carrinho`);
          }
          
          // Pequeno delay para evitar rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`[NotificationsPage] Erro ao verificar carrinho do usuário ${user.userId}:`, error);
          // Em caso de erro, manter o usuário na lista (pode ser erro de API, não necessariamente carrinho vazio)
          usersWithActiveCart.push(user);
        }
      }

      console.log('[NotificationsPage] Usuários com carrinho ativo (após verificação):', usersWithActiveCart.length);
      if (usersWithActiveCart.length > 0) {
        console.log('[NotificationsPage] Primeiros usuários:', usersWithActiveCart.slice(0, 3).map(u => ({
          userId: u.userId,
          userName: u.userName,
          items: u.currentItemCount || u.cartItemsCount,
          lastAdd: u.lastCartAdd
        })));
      }

      setCartUsers(usersWithActiveCart);
    } catch (error) {
      console.error('Erro ao buscar usuários com carrinho:', error);
      showToast('Erro ao buscar usuários com carrinho', 'error');
      setCartUsers([]);
    } finally {
      setLoadingCartUsers(false);
    }
  };

  const handleSendToCartUsers = async () => {
    if (cartUsers.length === 0) {
      showToast('Nenhum usuário com carrinho encontrado', 'error');
      return;
    }

    const userIds = cartUsers.map(u => String(u.userId));
    const title = '🛒 Você deixou itens no carrinho!';
    const body = 'Complete sua compra e aproveite nossos produtos com os melhores preços!';

    await handleSendNotification({
      title,
      body,
      userIds,
      data: {
        type: 'general',
        target: { screen: 'Cart' }
      }
    });
  };

  const handleSendNotification = async ({ title, body, userIds, data }) => {
    try {
      setSendingNotification(true);
      const result = await request({
        method: 'POST',
        url: '/notifications/send',
        data: { title, body, userIds, data },
      });
      
      if (result.summary?.requested === 0) {
        showToast('⚠️ Nenhum token encontrado. Certifique-se de que o app está instalado e o usuário está logado.', 'error');
      } else {
        showToast(`Notificação enviada: ${result.summary?.success || 0} sucesso, ${result.summary?.errors || 0} erros`);
      }
      
      // Atualizar lista de tokens após envio
      if (showTokens) {
        fetchTokens();
      }
    } catch (error) {
      console.error(error);
      showToast('Erro ao enviar notificação', 'error');
    } finally {
      setSendingNotification(false);
    }
  };

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
      
      <div style={{ marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => {
            setShowTokens(!showTokens);
            if (!showTokens) {
              fetchTokens();
            }
          }}
          style={{
            padding: '10px 20px',
            background: showTokens ? '#6366f1' : '#e2e8f0',
            color: showTokens ? '#fff' : '#475569',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {showTokens ? '👁️ Ocultar Tokens' : '👁️ Ver Tokens Registrados'}
        </button>
        
        <button
          onClick={() => {
            setShowCartUsers(!showCartUsers);
            if (!showCartUsers) {
              fetchCartUsers();
            }
          }}
          style={{
            padding: '10px 20px',
            background: showCartUsers ? '#10b981' : '#e2e8f0',
            color: showCartUsers ? '#fff' : '#475569',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {showCartUsers ? '🛒 Ocultar Carrinhos' : '🛒 Ver Usuários com Carrinho'}
        </button>
      </div>

      {showCartUsers && (
        <div
          className="card"
          style={{
            padding: 24,
            marginBottom: 24,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #dbeafe',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
              Usuários com Itens no Carrinho ({cartUsers.length})
            </h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={fetchCartUsers}
                disabled={loadingCartUsers}
                style={{
                  padding: '8px 16px',
                  background: loadingCartUsers ? '#94a3b8' : '#6366f1',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  cursor: loadingCartUsers ? 'not-allowed' : 'pointer',
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                {loadingCartUsers ? '🔄 Atualizando...' : '🔄 Atualizar'}
              </button>
              {cartUsers.length > 0 && (
                <button
                  onClick={handleSendToCartUsers}
                  disabled={loadingCartUsers || sendingNotification}
                  style={{
                    padding: '8px 16px',
                    background: sendingNotification ? '#94a3b8' : '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    cursor: sendingNotification ? 'not-allowed' : 'pointer',
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {sendingNotification ? 'Enviando...' : '📤 Enviar Notificação para Todos'}
                </button>
              )}
            </div>
          </div>
          
          {loadingCartUsers ? (
            <p style={{ color: '#64748b' }}>Carregando usuários com carrinho...</p>
          ) : cartUsers.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
              <p style={{ margin: 0, fontSize: 14 }}>
                ✅ Nenhum usuário com carrinho abandonado encontrado.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                Buscando usuários que adicionaram itens ao carrinho nas últimas 48 horas e não finalizaram a compra.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                💡 Dica: Certifique-se de que o usuário está logado ao adicionar itens ao carrinho. 
                Eventos sem userId não são contabilizados. O sistema verifica automaticamente se o carrinho ainda tem itens.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>ID</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Nome</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Email</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Itens (Atual)</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Última Adição</th>
                  </tr>
                </thead>
                <tbody>
                  {cartUsers.map((user) => {
                    const currentItemCount = user.currentItemCount !== undefined ? user.currentItemCount : user.cartItemsCount;
                    const isVerified = user.currentItemCount !== undefined;
                    return (
                      <tr key={user.userId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', color: '#1e293b' }}>{user.userId}</td>
                        <td style={{ padding: '8px 12px', color: '#1e293b' }}>{user.userName}</td>
                        <td style={{ padding: '8px 12px', color: '#1e293b' }}>{user.userEmail || '-'}</td>
                        <td style={{ padding: '8px 12px', color: '#1e293b', fontWeight: 600 }}>
                          {currentItemCount}
                          {isVerified && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: '#10b981' }} title="Carrinho verificado">
                              ✓
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 12 }}>
                          {new Date(user.lastCartAdd).toLocaleString('pt-BR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showTokens && (
        <div
          className="card"
          style={{
            padding: 24,
            marginBottom: 24,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          }}
        >
          <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600, color: '#1e293b' }}>
            Tokens Registrados ({tokens.length})
          </h2>
          
          {loadingTokens ? (
            <p style={{ color: '#64748b' }}>Carregando...</p>
          ) : tokens.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
              <p style={{ margin: 0, fontSize: 14 }}>
                ⚠️ Nenhum token registrado ainda.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 13 }}>
                Para registrar tokens, o usuário precisa:
              </p>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20, textAlign: 'left', display: 'inline-block' }}>
                <li>Ter o app instalado (APK standalone, não Expo Go)</li>
                <li>Estar logado no app</li>
                <li>Ter permissões de notificação ativadas</li>
              </ul>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>ID</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Token</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Plataforma</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Standalone</th>
                    <th style={{ padding: '8px 12px', textAlign: 'left', color: '#64748b', fontWeight: 600 }}>Último Uso</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', color: '#1e293b' }}>{token.id}</td>
                      <td style={{ padding: '8px 12px', color: '#1e293b', fontFamily: 'monospace', fontSize: 11 }}>
                        {token.token}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#1e293b' }}>{token.platform || 'N/A'}</td>
                      <td style={{ padding: '8px 12px', color: '#1e293b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: token.isStandalone ? '#d1fae5' : '#fee2e2',
                              color: token.isStandalone ? '#065f46' : '#991b1b',
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                          >
                            {token.isStandalone ? '✅ Sim' : '❌ Não'}
                          </span>
                          {!token.isStandalone && (
                            <button
                              onClick={async () => {
                                if (confirm('Marcar este token como standalone? Isso permitirá que ele receba notificações.')) {
                                  try {
                                    await request({
                                      method: 'PATCH',
                                      url: `/notifications/tokens/${token.id}/standalone`,
                                      data: { isStandalone: true },
                                    });
                                    showToast('Token marcado como standalone', 'success');
                                    fetchTokens();
                                  } catch (error) {
                                    console.error('Erro ao atualizar token:', error);
                                    showToast('Erro ao atualizar token', 'error');
                                  }
                                }
                              }}
                              style={{
                                padding: '4px 8px',
                                background: '#6366f1',
                                color: '#fff',
                                border: 'none',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 11,
                                fontWeight: 500,
                              }}
                            >
                              Marcar como Standalone
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#64748b', fontSize: 12 }}>
                        {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString('pt-BR') : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <NotificationSender onSend={handleSendNotification} sending={sendingNotification} />
    </div>
  );
};

export default NotificationsPage;

