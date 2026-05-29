import { useState, useEffect } from 'react';
import { useApi } from '../context/ApiContext.jsx';
import axios from 'axios';
import { Clock, Save, RefreshCw, Store } from 'lucide-react';

const DAY_LABELS = {
  mon: 'Segunda-feira',
  tue: 'Terça-feira',
  wed: 'Quarta-feira',
  thu: 'Quinta-feira',
  fri: 'Sexta-feira',
  sat: 'Sábado',
  sun: 'Domingo',
};

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const HoursPage = () => {
  const { baseURL, token, request } = useApi();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchStores = async () => {
    setLoading(true);
    try {
      const savedToken = token || localStorage.getItem('dashboard_token');
      const response = await axios.get(`${baseURL}/hours`, {
        headers: { Authorization: `Bearer ${savedToken}` }
      });
      setStores(response.data || []);
    } catch (error) {
      console.error('Erro ao buscar lojas:', error);
      showToast('Erro ao carregar horários', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const handleHoursChange = (storeId, day, value) => {
    setStores(prev => prev.map(store => {
      if (store.store_id === storeId) {
        const newHours = { ...store.hours };
        // Converter string para array se necessário
        if (value.trim() === '') {
          newHours[day] = [];
        } else {
          // Aceitar formato "08:00-20:00" ou "08:00-20:00, 14:00-18:00"
          const slots = value.split(',').map(s => s.trim()).filter(s => s);
          newHours[day] = slots;
        }
        return { ...store, hours: newHours };
      }
      return store;
    }));
  };

  const handleStoreInfoChange = (storeId, field, value) => {
    setStores(prev => prev.map(store => {
      if (store.store_id === storeId) {
        return { ...store, [field]: value };
      }
      return store;
    }));
  };

  const saveStore = async (store) => {
    setSaving(prev => ({ ...prev, [store.store_id]: true }));
    try {
      const savedToken = token || localStorage.getItem('dashboard_token');
      await axios.put(
        `${baseURL}/hours/${store.store_id}`,
        {
          hours: store.hours,
          store_name: store.store_name,
          address: store.address,
          city: store.city,
          state: store.state,
        },
        {
          headers: { Authorization: `Bearer ${savedToken}` }
        }
      );
      showToast(`Horários de ${store.store_name} salvos com sucesso!`, 'success');
    } catch (error) {
      console.error('Erro ao salvar horários:', error);
      showToast('Erro ao salvar horários', 'error');
    } finally {
      setSaving(prev => ({ ...prev, [store.store_id]: false }));
    }
  };

  const formatHoursForInput = (slots) => {
    if (!slots || slots.length === 0) return '';
    return slots.join(', ');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <RefreshCw className="spin" size={32} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#1F2937' }}>
            Horários de Funcionamento
          </h1>
          <p style={{ margin: '8px 0 0', color: '#6B7280', fontSize: '16px' }}>
            Gerencie os horários de funcionamento de cada loja
          </p>
        </div>
        <button
          onClick={fetchStores}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            backgroundColor: '#6A1B9A',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
          }}
        >
          <RefreshCw size={18} />
          Atualizar
        </button>
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '16px 20px',
            backgroundColor: toast.type === 'success' ? '#10B981' : '#EF4444',
            color: '#fff',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span>{toast.message}</span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {stores.map(store => (
          <div
            key={store.store_id}
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                  <Store size={24} color="#6A1B9A" />
                  <input
                    type="text"
                    value={store.store_name || ''}
                    onChange={(e) => handleStoreInfoChange(store.store_id, 'store_name', e.target.value)}
                    placeholder="Nome da loja"
                    style={{
                      fontSize: '20px',
                      fontWeight: '700',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      width: '100%',
                      maxWidth: '400px',
                    }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <input
                    type="text"
                    value={store.address || ''}
                    onChange={(e) => handleStoreInfoChange(store.store_id, 'address', e.target.value)}
                    placeholder="Endereço completo"
                    style={{
                      fontSize: '14px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      padding: '8px 12px',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <input
                      type="text"
                      value={store.city || ''}
                      onChange={(e) => handleStoreInfoChange(store.store_id, 'city', e.target.value)}
                      placeholder="Cidade"
                      style={{
                        fontSize: '14px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        flex: 1,
                      }}
                    />
                    <input
                      type="text"
                      value={store.state || ''}
                      onChange={(e) => handleStoreInfoChange(store.store_id, 'state', e.target.value)}
                      placeholder="Estado"
                      maxLength={2}
                      style={{
                        fontSize: '14px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        width: '80px',
                        textTransform: 'uppercase',
                      }}
                    />
                  </div>
                </div>
              </div>
              <button
                onClick={() => saveStore(store)}
                disabled={saving[store.store_id]}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  backgroundColor: saving[store.store_id] ? '#9CA3AF' : '#6A1B9A',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: saving[store.store_id] ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                }}
              >
                {saving[store.store_id] ? (
                  <>
                    <RefreshCw className="spin" size={18} />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save size={18} />
                    Salvar
                  </>
                )}
              </button>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '20px' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: '600', color: '#374151' }}>
                Horários de Funcionamento
              </h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                {DAY_ORDER.map(day => (
                  <div
                    key={day}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 1fr',
                      gap: '12px',
                      alignItems: 'center',
                    }}
                  >
                    <label style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                      {DAY_LABELS[day]}:
                    </label>
                    <input
                      type="text"
                      value={formatHoursForInput(store.hours?.[day])}
                      onChange={(e) => handleHoursChange(store.store_id, day, e.target.value)}
                      placeholder="Ex: 08:00-20:00 ou 08:00-12:00, 14:00-18:00"
                      style={{
                        fontSize: '14px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '8px 12px',
                      }}
                    />
                  </div>
                ))}
              </div>
              <p style={{ marginTop: '16px', fontSize: '12px', color: '#6B7280' }}>
                <strong>Formato:</strong> Use "HH:MM-HH:MM" para um período ou "HH:MM-HH:MM, HH:MM-HH:MM" para múltiplos períodos. Deixe em branco para fechado.
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HoursPage;
