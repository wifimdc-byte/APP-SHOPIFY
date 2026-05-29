import { useEffect, useState } from 'react';

const DetailedEventsTable = ({ request, token }) => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [eventFilter, setEventFilter] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 50;

  const fetchEvents = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });
      if (eventFilter) {
        params.append('eventName', eventFilter);
      }
      console.log('[DetailedEventsTable] Buscando eventos:', params.toString());
      const data = await request({ url: `/analytics/events?${params.toString()}` });
      console.log('[DetailedEventsTable] Eventos recebidos:', data);
      setEvents(data.events || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('[DetailedEventsTable] Erro ao buscar eventos:', error);
      console.error('[DetailedEventsTable] Resposta do erro:', error.response?.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchEvents();
    }
  }, [token, eventFilter, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCurrency = (value) => {
    if (!value) return '-';
    return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR');
  };

  return (
    <div className="card">
      <h2>Eventos Detalhados</h2>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Filtrar por evento (ex: cart_add, checkout_proceed_click)"
          value={eventFilter}
          onChange={(e) => {
            setEventFilter(e.target.value);
            setPage(0);
          }}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db' }}
        />
        <button className="secondary" onClick={fetchEvents} disabled={loading}>
          {loading ? 'Carregando...' : 'Atualizar'}
        </button>
      </div>

      {loading && events.length === 0 ? (
        <p>Carregando eventos...</p>
      ) : events.length === 0 ? (
        <p style={{ opacity: 0.7 }}>Nenhum evento encontrado</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>Data/Hora</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>Evento</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>Nome</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>Email</th>
                  <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>Valor</th>
                  <th style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>Qtd Produto</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600 }}>ID Checkout / Produto</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px' }}>{formatDate(event.createdAt)}</td>
                    <td style={{ padding: '10px' }}>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          fontSize: 11,
                        }}
                      >
                        {event.eventName}
                      </span>
                    </td>
                    <td style={{ padding: '10px' }}>{event.userName || '-'}</td>
                    <td style={{ padding: '10px' }}>{event.userEmail || '-'}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {event.cartValue ? formatCurrency(event.cartValue) : '-'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{event.productQuantity || '-'}</td>
                    <td style={{ padding: '10px' }}>
                      {event.eventName === 'cart_add' 
                        ? (event.productId || '-') 
                        : (event.checkoutId || '-')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
              Mostrando {page * limit + 1} - {Math.min((page + 1) * limit, total)} de {total} eventos
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="secondary"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                Anterior
              </button>
              <button
                className="secondary"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * limit >= total || loading}
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DetailedEventsTable;

