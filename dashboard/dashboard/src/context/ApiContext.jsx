import { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import axios from 'axios';

export const ApiContext = createContext(null);

export const ApiProvider = ({ children }) => {
  const [baseURL, setBaseURL] = useState(() => {
    const saved = localStorage.getItem('dashboard_baseURL');
    console.log('[ApiContext] Init baseURL:', saved || 'Default');
    return saved || 'https://app-shopify-hayo.onrender.com/api';
  });
  
  const [token, setToken] = useState(() => {
    const saved = localStorage.getItem('dashboard_token');
    console.log('[ApiContext] Init token:', saved ? 'Presente' : 'Ausente');
    return saved || '';
  });

  // Salvar no localStorage quando mudar
  const handleSetBaseURL = (url) => {
    setBaseURL(url);
    localStorage.setItem('dashboard_baseURL', url);
  };

  const handleSetToken = (newToken) => {
    console.log('[ApiContext] Set token:', newToken ? 'Definindo novo token' : 'Limpando token');
    setToken(newToken);
    if (newToken) {
      localStorage.setItem('dashboard_token', newToken);
    } else {
      localStorage.removeItem('dashboard_token');
    }
  };

  const client = useMemo(() => {
    console.log('[ApiContext] Recreating axios client. Token exists?', !!token);
    const instance = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    // Adicionar interceptor para logar a saída (apenas para debug, pode ser removido em produção)
    instance.interceptors.request.use(config => {
      // Não logar requests de produtos para reduzir poluição no console
      if (!config.url?.includes('/products/')) {
        console.log(`[Axios] Request: ${config.method?.toUpperCase()} ${config.url}`);
      }
      return config;
    });

    // Interceptor de resposta para tratar 401 (Token expirado)
    instance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          console.warn('[Axios] 401 Detectado - Token inválido ou expirado');
          // Opcional: Disparar evento de logout ou limpar token
          // handleSetToken(null); // Não podemos chamar handleSetToken dentro do useMemo facilmente sem refatorar
          // Vamos apenas logar por enquanto, a UI deve tratar
        }
        return Promise.reject(error);
      }
    );

    return instance;
  }, [baseURL, token]);

  const request = useCallback(
    async (config) => {
      try {
        // Garantir que token está atualizado se passado explicitamente (raro, mas possível)
        // Não logar requests de produtos para reduzir poluição no console
        if (!config.url?.includes('/products/')) {
          console.log('[useApi] Request start:', config.url);
        }
        const response = await client.request(config);
        return response.data;
      } catch (error) {
        // Não logar erros 404 (produtos não encontrados são esperados)
        if (error.response?.status !== 404) {
          console.error('[useApi] Error:', error.message);
        }
        throw error;
      }
    },
    [client]
  );

  const value = {
    baseURL,
    setBaseURL: handleSetBaseURL,
    token,
    setToken: handleSetToken,
    request,
  };

  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
};

export const useApi = () => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within ApiProvider');
  }
  return context;
};
