import { useState, useCallback } from 'react';
import { useApi } from '../context/ApiContext.jsx';

const CustomersPage = () => {
  const { request } = useApi();
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetails, setCustomerDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState(null);

  const searchCustomers = useCallback(async (page = 1) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setError('Digite pelo menos 2 caracteres para pesquisar');
      return;
    }

    setLoading(true);
    setError('');
    setSelectedCustomer(null);
    setCustomerDetails(null);

    try {
      const data = await request({
        method: 'GET',
        url: `/users/admin/search?q=${encodeURIComponent(searchTerm)}&page=${page}&limit=20`
      });
      setCustomers(data.customers || []);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Erro ao pesquisar:', err);
      setError(err.response?.data?.error || 'Erro ao pesquisar clientes');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, request]);

  const loadCustomerDetails = useCallback(async (customerId) => {
    setDetailsLoading(true);
    setSelectedCustomer(customerId);
    setCustomerDetails(null);

    try {
      const data = await request({
        method: 'GET',
        url: `/users/admin/${customerId}`
      });
      setCustomerDetails(data);
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err);
      setError(err.response?.data?.error || 'Erro ao carregar detalhes do cliente');
    } finally {
      setDetailsLoading(false);
    }
  }, [request]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      searchCustomers();
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCpfCnpj = (value) => {
    if (!value) return '-';
    const clean = value.replace(/\D/g, '');
    if (clean.length === 11) {
      return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (clean.length === 14) {
      return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return value;
  };

  const formatPhone = (phone) => {
    if (!phone) return '-';
    const clean = phone.replace(/\D/g, '');
    if (clean.length === 11) {
      return clean.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (clean.length === 10) {
      return clean.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    }
    return phone;
  };

  const exportCustomersToCSV = async () => {
    try {
      const token = localStorage.getItem('dashboard_token');

      if (!token) {
        alert('Você precisa estar logado');
        return;
      }

      const response = await fetch(
        'https://app-shopify-hayo.onrender.com/api/users/admin/export',
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao exportar');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = 'clientes.csv';
      link.click();

      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Erro ao exportar clientes');
    }
  };



  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
        👥 Pesquisa de Clientes
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Pesquise por nome, email, telefone ou CPF/CNPJ
      </p>

      {/* Barra de Pesquisa */}
      <div style={{ 
        display: 'flex', 
        gap: 12, 
        marginBottom: 24,
        background: '#1e293b',
        padding: 16,
        borderRadius: 12
      }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Digite nome, email, telefone ou CPF..."
          style={{
            flex: 1,
            padding: '12px 16px',
            fontSize: 16,
            border: '1px solid #334155',
            borderRadius: 8,
            background: '#0f172a',
            color: '#f1f5f9',
            outline: 'none'
          }}
        />
        <button
          onClick={() => searchCustomers()}
          disabled={loading}
          style={{
            padding: '12px 24px',
            fontSize: 16,
            fontWeight: 600,
            background: loading ? '#475569' : '#7c3aed',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          {loading ? '⏳ Buscando...' : '🔍 Pesquisar'}
        </button>
        <button
          onClick={exportCustomersToCSV}
          style={{
            padding: '12px 20px',
            fontSize: 15,
            fontWeight: 600,
            background: '#059669',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer'
          }}
        >
          📄 Exportar CSV
        </button>

      </div>

      


      {error && (
        <div style={{
          padding: 12,
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: 8,
          color: '#fca5a5',
          marginBottom: 16
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Lista de Clientes */}
        <div style={{ flex: 1 }}>
          {customers.length > 0 && (
            <>
              <div style={{ 
                fontSize: 14, 
                color: '#94a3b8', 
                marginBottom: 12 
              }}>
                {pagination?.total || customers.length} cliente(s) encontrado(s)
              </div>

              <div style={{ 
                background: '#1e293b', 
                borderRadius: 12, 
                overflow: 'hidden' 
              }}>
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse',
                  fontSize: 14
                }}>
                  <thead>
                    <tr style={{ background: '#0f172a' }}>
                      <th style={{ padding: 12, textAlign: 'left', color: '#94a3b8' }}>Nome</th>
                      <th style={{ padding: 12, textAlign: 'left', color: '#94a3b8' }}>Email</th>
                      <th style={{ padding: 12, textAlign: 'left', color: '#94a3b8' }}>Telefone</th>
                      <th style={{ padding: 12, textAlign: 'left', color: '#94a3b8' }}>Cadastro</th>
                      <th style={{ padding: 12, textAlign: 'center', color: '#94a3b8' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr 
                        key={customer.id}
                        style={{ 
                          borderTop: '1px solid #334155',
                          background: selectedCustomer === customer.id ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
                          cursor: 'pointer'
                        }}
                        onClick={() => loadCustomerDetails(customer.id)}
                      >
                        <td style={{ padding: 12, color: '#f1f5f9' }}>
                          {customer.nome || '-'}
                        </td>
                        <td style={{ padding: 12, color: '#94a3b8' }}>
                          {customer.email || '-'}
                        </td>
                        <td style={{ padding: 12, color: '#94a3b8' }}>
                          {formatPhone(customer.telefone)}
                        </td>
                        <td style={{ padding: 12, color: '#64748b', fontSize: 12 }}>
                          {formatDate(customer.created_at)}
                        </td>
                        <td style={{ padding: 12, textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              loadCustomerDetails(customer.id);
                            }}
                            style={{
                              padding: '6px 12px',
                              fontSize: 12,
                              background: 'rgba(124, 58, 237, 0.2)',
                              color: '#c4b5fd',
                              border: '1px solid rgba(124, 58, 237, 0.3)',
                              borderRadius: 6,
                              cursor: 'pointer'
                            }}
                          >
                            Ver detalhes
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              {pagination && pagination.pages > 1 && (
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  gap: 8, 
                  marginTop: 16 
                }}>
                  {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => searchCustomers(pageNum)}
                      style={{
                        padding: '8px 12px',
                        fontSize: 14,
                        background: pageNum === pagination.page ? '#7c3aed' : '#334155',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer'
                      }}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {!loading && customers.length === 0 && searchTerm && !error && (
            <div style={{ 
              textAlign: 'center', 
              padding: 40, 
              color: '#64748b' 
            }}>
              Nenhum cliente encontrado
            </div>
          )}
        </div>

        {/* Detalhes do Cliente */}
        {(selectedCustomer || detailsLoading) && (
          <div style={{ 
            width: 400, 
            background: '#1e293b', 
            borderRadius: 12, 
            padding: 20,
            height: 'fit-content',
            position: 'sticky',
            top: 24
          }}>
            {detailsLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                ⏳ Carregando detalhes...
              </div>
            ) : customerDetails ? (
              <>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: 20
                }}>
                  <h3 style={{ margin: 0, fontSize: 18, color: '#f1f5f9' }}>📋 Detalhes do Cliente</h3>
                  <button
                    onClick={() => {
                      setSelectedCustomer(null);
                      setCustomerDetails(null);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: 20
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ 
                    fontSize: 12, 
                    color: '#64748b', 
                    margin: '0 0 8px',
                    textTransform: 'uppercase',
                    letterSpacing: 1
                  }}>
                    Informações Pessoais
                  </h4>
                  <div style={{ background: '#0f172a', borderRadius: 8, padding: 12, color: '#f1f5f9' }}>
                    <p style={{ margin: '0 0 8px', color: '#e2e8f0' }}>
                      <strong style={{ color: '#94a3b8' }}>Nome:</strong> {customerDetails.customer?.nome || '-'}
                    </p>
                    <p style={{ margin: '0 0 8px', color: '#e2e8f0' }}>
                      <strong style={{ color: '#94a3b8' }}>Email:</strong> {customerDetails.customer?.email || '-'}
                    </p>
                    <p style={{ margin: '0 0 8px', color: '#e2e8f0' }}>
                      <strong style={{ color: '#94a3b8' }}>Telefone:</strong> {formatPhone(customerDetails.customer?.telefone)}
                    </p>
                    <p style={{ margin: '0 0 8px', color: '#e2e8f0' }}>
                      <strong style={{ color: '#94a3b8' }}>{customerDetails.customer?.tipo_documento || 'CPF/CNPJ'}:</strong>{' '}
                      {formatCpfCnpj(customerDetails.customer?.cpf_cnpj)}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>
                      <strong>Cadastro:</strong> {formatDate(customerDetails.customer?.created_at)}
                    </p>
                  </div>
                </div>

                {/* Endereços */}
                {customerDetails.addresses?.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ 
                      fontSize: 12, 
                      color: '#64748b', 
                      margin: '0 0 8px',
                      textTransform: 'uppercase',
                      letterSpacing: 1
                    }}>
                      📍 Endereços ({customerDetails.addresses.length})
                    </h4>
                    <div style={{ 
                      maxHeight: 200, 
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}>
                      {customerDetails.addresses.map((addr, idx) => (
                        <div 
                          key={addr.id || idx}
                          style={{ 
                            background: '#0f172a', 
                            borderRadius: 8, 
                            padding: 12,
                            fontSize: 13,
                            color: '#e2e8f0',
                            border: addr.is_default ? '1px solid #7c3aed' : '1px solid #334155'
                          }}
                        >
                          {addr.is_default && (
                            <span style={{ 
                              fontSize: 10, 
                              background: '#7c3aed', 
                              color: 'white',
                              padding: '2px 6px',
                              borderRadius: 4,
                              marginBottom: 6,
                              display: 'inline-block'
                            }}>
                              PADRÃO
                            </span>
                          )}
                          <p style={{ margin: '4px 0', color: '#f1f5f9' }}>
                            {addr.endereco}, {addr.numero}
                            {addr.complemento && ` - ${addr.complemento}`}
                          </p>
                          <p style={{ margin: '4px 0', color: '#cbd5e1' }}>
                            {addr.bairro && `${addr.bairro} - `}
                            {addr.cidade}/{addr.estado}
                          </p>
                          <p style={{ margin: '4px 0', color: '#94a3b8' }}>
                            CEP: {addr.cep}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pedidos recentes */}
                {customerDetails.orders?.length > 0 && (
                  <div>
                    <h4 style={{ 
                      fontSize: 12, 
                      color: '#64748b', 
                      margin: '0 0 8px',
                      textTransform: 'uppercase',
                      letterSpacing: 1
                    }}>
                      📦 Últimos Pedidos ({customerDetails.orders.length})
                    </h4>
                    <div style={{ 
                      maxHeight: 200, 
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8
                    }}>
                      {customerDetails.orders.map((order, idx) => (
                        <div 
                          key={order.id || idx}
                          style={{ 
                            background: '#0f172a', 
                            borderRadius: 8, 
                            padding: 12,
                            fontSize: 13,
                            color: '#e2e8f0',
                            border: '1px solid #334155'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong style={{ color: '#f1f5f9' }}>#{order.shopify_order_number || order.id}</strong>
                            <span style={{ 
                              fontSize: 11, 
                              padding: '2px 8px', 
                              borderRadius: 4,
                              background: order.status === 'concluido' ? '#22c55e' : 
                                         order.status === 'enviado' ? '#3b82f6' : 
                                         order.status === 'pronto_retirada' ? '#f59e0b' : '#64748b',
                              color: 'white'
                            }}>
                              {order.status || 'pendente'}
                            </span>
                          </div>
                          <p style={{ margin: '4px 0', color: '#94a3b8', fontSize: 12 }}>
                            {formatDate(order.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Botões de ação */}
                <div style={{ 
                  marginTop: 20, 
                  display: 'flex', 
                  gap: 8,
                  borderTop: '1px solid #334155',
                  paddingTop: 16
                }}>
                  {customerDetails.customer?.email && (
                    <button
                      onClick={() => window.open(`mailto:${customerDetails.customer.email}`, '_blank')}
                      style={{
                        flex: 1,
                        padding: '10px',
                        fontSize: 13,
                        background: 'rgba(59, 130, 246, 0.2)',
                        color: '#93c5fd',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: 8,
                        cursor: 'pointer'
                      }}
                    >
                      ✉️ Enviar Email
                    </button>
                  )}
                  {customerDetails.customer?.telefone && (
                    <button
                      onClick={() => {
                        const phone = customerDetails.customer.telefone.replace(/\D/g, '');
                        window.open(`https://wa.me/55${phone}`, '_blank');
                      }}
                      style={{
                        flex: 1,
                        padding: '10px',
                        fontSize: 13,
                        background: 'rgba(34, 197, 94, 0.2)',
                        color: '#86efac',
                        border: '1px solid rgba(34, 197, 94, 0.3)',
                        borderRadius: 8,
                        cursor: 'pointer'
                      }}
                    >
                      💬 WhatsApp
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomersPage;
