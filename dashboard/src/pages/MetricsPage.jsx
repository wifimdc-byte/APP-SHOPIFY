import React, { useState, useEffect } from 'react';
import { useApi } from '../hooks/useApi';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell, LineChart, Line
} from 'recharts';
import {
  Users, ShoppingBag, Activity, Calendar, RefreshCw, ArrowUp, ArrowDown,
  Eye, MousePointerClick, Search, Filter, Star, TrendingUp,
  Clock, XCircle, CheckCircle, Smartphone, Monitor, Trash2, AlertCircle,
  ChevronDown, ChevronUp, Ticket
} from 'lucide-react';

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088FE', '#00C49F', '#FF6B6B', '#4ECDC4'];

const Card = ({ title, value, subtext, icon: Icon, trend, trendValue, color = "blue" }) => (
  <div style={{
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    height: '100%'
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
      <div>
        <p style={{ color: '#64748b', fontSize: '14px', fontWeight: '500', margin: 0 }}>{title}</p>
        <h3 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: '4px 0' }}>{value}</h3>
      </div>
      <div style={{
        padding: '12px',
        borderRadius: '12px',
        backgroundColor: `var(--${color}-50, #eff6ff)`,
        color: `var(--${color}-600, #2563eb)`
      }}>
        <Icon size={24} />
      </div>
    </div>
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {trend && (
        <span style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: '12px',
          fontWeight: '600',
          color: trend === 'up' ? '#10b981' : '#ef4444',
          marginRight: '8px'
        }}>
          {trend === 'up' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          {trendValue}
        </span>
      )}
      <span style={{ color: '#94a3b8', fontSize: '12px' }}>{subtext}</span>
    </div>
  </div>
);

const EmptyState = ({ message }) => (
  <div style={{
    padding: '40px',
    textAlign: 'center',
    color: '#94a3b8'
  }}>
    <p style={{ fontSize: '14px', margin: 0 }}>{message}</p>
  </div>
);

const MetricsPage = () => {
  const [tokens, setTokens] = useState({ total: 0, today: 0, ios: 0, android: 0 });
  const { request } = useApi();
  const [loading, setLoading] = useState(true);
  const [activeUsers, setActiveUsers] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [dailyData, setDailyData] = useState([]);
  const [timeRange, setTimeRange] = useState('30d'); // 7d, 30d, 90d
  const [markingUnavailable, setMarkingUnavailable] = useState(false);
  const [markUnavailableResult, setMarkUnavailableResult] = useState(null);
  const [markUnavailableProgress, setMarkUnavailableProgress] = useState({ current: 0, total: 0, stage: '' });
  const [downloads, setDownloads] = useState({ total: 0, ios: 0, android: 0 });
  const [downloadsDailyData, setDownloadsDailyData] = useState([]);
  const [downloadsTimeRange, setDownloadsTimeRange] = useState('30');
  const [loadingDownloadsDaily, setLoadingDownloadsDaily] = useState(false);
  const [showDownloadsBreakdown, setShowDownloadsBreakdown] = useState(false);
  const [searchNoResultsTerms, setSearchNoResultsTerms] = useState([]);
  const [loadingNoResults, setLoadingNoResults] = useState(false);
  const [showNoResults, setShowNoResults] = useState(false);
  const [topSearchTerms, setTopSearchTerms] = useState([]);
  const [loadingTopSearch, setLoadingTopSearch] = useState(false);
  const [showTopSearch, setShowTopSearch] = useState(false);
  const [productViews, setProductViews] = useState([]);
  const [loadingProductViews, setLoadingProductViews] = useState(false);
  const [showProductViews, setShowProductViews] = useState(false);
  const [cartAdds, setCartAdds] = useState([]);
  const [loadingCartAdds, setLoadingCartAdds] = useState(false);
  const [showCartAdds, setShowCartAdds] = useState(false);
  const [rawEvents, setRawEvents] = useState([]); 
  const [loadingRawEvents, setLoadingRawEvents] = useState(false);
  const [activeUsersByPeriod, setActiveUsersByPeriod] = useState({ count: 0, days: 30 });
  const [loadingActiveUsers, setLoadingActiveUsers] = useState(false);
  const [isRefreshingDownloads, setIsRefreshingDownloads] = useState(false);
  const [couponStats, setCouponStats] = useState({
    totalUsed: 0,
    todayUsed: 0,
    last7DaysUsed: 0,
    last30DaysUsed: 0,
    repeatUsers: 0,
    fabClicksLast30Days: 0
  });
  const [loadingCouponStats, setLoadingCouponStats] = useState(false);
  const [couponDailyData, setCouponDailyData] = useState([]);
  const [couponDaysRange, setCouponDaysRange] = useState('30');
  const [loadingCouponDaily, setLoadingCouponDaily] = useState(false);


  const handleRefreshDownloads = async () => {
    const confirmed = confirm(
      'Isso irá buscar os dados mais recentes de instalações da Apple e Google. Pode levar alguns minutos. Deseja continuar?'
    );

    if (!confirmed) return;

    setIsRefreshingDownloads(true);

    try {
      const response = await request({
        url: '/downloads/refresh',
        method: 'POST',
      });

      alert(
        response.message ||
        'A coleta de dados foi iniciada. Atualize a página em alguns minutos para ver os novos dados.'
      );

    } catch (error) {
      console.error('Erro ao iniciar a coleta de downloads:', error);

      if (error.response?.status === 429) {
        alert('Já existe uma coleta em andamento. Aguarde alguns minutos antes de tentar novamente.');
      } else {
        alert(
          error.response?.data?.message ||
          'Falha ao iniciar a coleta de dados.'
        );
      }

    } finally {
      // ✅ garante que o botão sempre volte ao normal
      setIsRefreshingDownloads(false);
    }
  };



  // Função helper para fazer requisições com retry e backoff exponencial
  const requestWithRetry = React.useCallback(async (url, maxRetries = 3, initialDelay = 1000) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const data = await request({ url });
        return data;
      } catch (error) {
        // Se for erro 429 (rate limit) e ainda tiver tentativas, esperar e tentar novamente
        if (error.response?.status === 429 && attempt < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, attempt); // Backoff exponencial
          console.log(`[Retry] Rate limit atingido. Aguardando ${delay}ms antes de tentar novamente... (tentativa ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        // Se não for 429 ou acabaram as tentativas, lançar o erro
        throw error;
      }
    }
  }, [request]);

  // Função helper para buscar todos os eventos com paginação e rate limiting
  const fetchAllEvents = React.useCallback(async (eventName = null, delayBetweenRequests = 500) => {
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    
    if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7);
    if (timeRange === '30d') startDate.setDate(startDate.getDate() - 30);
    if (timeRange === '90d') startDate.setDate(startDate.getDate() - 90);
    startDate.setHours(0, 0, 0, 0);

    const startDateISO = startDate.toISOString();
    const endDateISO = endDate.toISOString();

    let allEvents = [];
    let offset = 0;
    const limit = 500;
    let hasMore = true;

    while (hasMore) {
      try {
        const url = `/analytics/events?startDate=${startDateISO}&endDate=${endDateISO}&limit=${limit}&offset=${offset}${eventName ? `&eventName=${eventName}` : ''}`;
        const data = await requestWithRetry(url);
        
        const events = data.events || [];
        allEvents = allEvents.concat(events);
        
        if (events.length < limit || allEvents.length >= (data.total || 0)) {
          hasMore = false;
        } else {
          offset += limit;
          // Adicionar delay entre requisições para evitar rate limiting
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenRequests));
          }
        }
      } catch (error) {
        console.error(`Erro ao buscar eventos (offset: ${offset}):`, error);
        // Se for erro 429 mesmo após retry, parar e retornar o que já foi coletado
        if (error.response?.status === 429) {
          console.warn('Rate limit atingido. Retornando eventos já coletados.');
          break;
        }
        throw error;
      }
    }
    
    return allEvents;
  }, [request, timeRange, requestWithRetry]);

  useEffect(() => {
    const loadAllRawEvents = async () => {
      // Ativa todos os loadings visuais
      setLoadingRawEvents(true);
      setLoadingTemporal(true);
      setLoadingSession(true);
      setLoadingRetention(true);
      setLoadingValue(true);
      setLoadingEngagement(true);

      try {
        console.log('🔄 Iniciando Master Fetch de todos os eventos...');
        // Busca sem filtro de eventName (null) para pegar tudo
        const events = await fetchAllEvents(null, 500); 
        console.log(`✅ Master Fetch concluído: ${events.length} eventos carregados.`);
        setRawEvents(events);
      } catch (error) {
        console.error("❌ Erro no Master Fetch:", error);
        // Em caso de erro, zera para evitar dados velhos
        setRawEvents([]); 
      } finally {
        setLoadingRawEvents(false);
        // Nota: Os loadings individuais (Temporal, Session, etc) serão desligados 
        // pelos useEffects de processamento abaixo assim que detectarem a mudança em rawEvents.
      }
    };

    loadAllRawEvents();
  }, [timeRange, fetchAllEvents]); // Só recarrega se mudar o período (7d, 30d, etc)

  // Busca dados de tempo real
  useEffect(() => {
    const fetchLive = async () => {
      try {
        const data = await request({ url: '/analytics/live' });
        setActiveUsers(data.activeUsers || 0);
      } catch (error) {
        console.error('Erro live metrics:', error);
      }
    };

    fetchLive();
    const interval = setInterval(fetchLive, 15000); // Poll a cada 15s
    return () => clearInterval(interval);
  }, [request]);
  
    useEffect(() => {
      const fetchTokens = async () => {
        try {
          const data = await request({ url: '/notifications/tokens/count' });
          setTokens({
            total: data.total || 0,
            today: data.today ?? 0,
            ios: data.byPlatform?.ios || 0,
            android: data.byPlatform?.android || 0,
          });
        } catch (error) {
          console.error('Erro ao buscar tokens:', error);
          setTokens({ total: 0, today: 0, ios: 0, android: 0 });
        }
      };

      fetchTokens();
      // Atualizar a cada 30 segundos
      const interval = setInterval(fetchTokens, 30000);
      return () => clearInterval(interval);
    }, [request]);

  // Busca dados de downloads (instalações reais do Google Play e App Store)
  useEffect(() => {
    const fetchDownloads = async () => {
      try {
        // Usar endpoint /downloads/total que retorna o total agregado diretamente
        const data = await request({ url: `/downloads/total?days=total` });
        
        let totalInstalls = 0;
        let androidInstalls = 0;
        let iosInstalls = 0;
        
        // O endpoint /downloads/total retorna { ok: true, total: number, breakdown: [...] }
        if (data.ok) {
          totalInstalls = Number(data.total) || 0;
          
          // Processar breakdown por loja
          if (data.breakdown && Array.isArray(data.breakdown)) {
            data.breakdown.forEach(store => {
              const installs = Number(store.installs) || 0;
              if (store.store === 'google') {
                androidInstalls = installs;
              } else if (store.store === 'apple') {
                iosInstalls = installs;
              }
            });
          }
        }
        
        console.log('📥 [MetricsPage] Downloads carregados:', { totalInstalls, iosInstalls, androidInstalls });
        
        setDownloads({
          total: totalInstalls,
          ios: iosInstalls,
          android: androidInstalls,
        });
      } catch (error) {
        console.error('❌ [MetricsPage] Erro ao buscar downloads reais:', error);
        console.error('❌ [MetricsPage] Detalhes do erro:', error.response?.data || error.message);
        setDownloads({ total: 0, ios: 0, android: 0 });
      }
    };

    fetchDownloads();

    // Atualizar a cada 60 segundos (reduz carga no servidor)
    const interval = setInterval(fetchDownloads, 60000);
    return () => clearInterval(interval);
  }, [request]);

  // Busca dados diários de downloads para gráfico
  useEffect(() => {
    const fetchDownloadsDaily = async () => {
      setLoadingDownloadsDaily(true);
      try {
        const data = await request({ url: `/downloads/daily?days=${downloadsTimeRange}` });
        if (data.ok && data.data) {
          const formattedData = data.data.map(item => {
            let dateStr = item.date;
            try {
              if (item.date && typeof item.date === 'string') {
                const dateOnly = item.date.split('T')[0];
                const [year, month, day] = dateOnly.split('-');
                if (day && month) {
                  dateStr = `${day}/${month}`;
                }
              }
            } catch (e) {
              console.error("Erro ao formatar data de downloads:", e);
            }
            return { ...item, date: dateStr };
          });
          setDownloadsDailyData(formattedData);
        }
      } catch (error) {
        console.error('Erro ao buscar downloads diários:', error);
        setDownloadsDailyData([]);
      } finally {
        setLoadingDownloadsDaily(false);
      }
    };

    fetchDownloadsDaily();
  }, [request, downloadsTimeRange]);

  // Buscar pessoas ativas por período
  useEffect(() => {
    const fetchActiveUsersByPeriod = async (days = 30) => {
      setLoadingActiveUsers(true);
      try {
        const data = await request({ url: `/analytics/active-users?days=${days}` });
        setActiveUsersByPeriod(prev => ({ ...prev, count: data.activeUsers || 0 }));
      } catch (error) {
        console.error('Erro ao buscar pessoas ativas por período:', error);
        setActiveUsersByPeriod(prev => ({ ...prev, count: 0 }));
      } finally {
        setLoadingActiveUsers(false);
      }
    };

    // Buscar com o período atual
    const days = activeUsersByPeriod.days || 30;
    fetchActiveUsersByPeriod(days);
  }, [request, activeUsersByPeriod.days]);

  // Buscar estatísticas de cupons rasgados
  useEffect(() => {
    const fetchCouponStats = async () => {
      setLoadingCouponStats(true);
      try {
        const data = await request({ url: '/coupon/stats' });
        setCouponStats({
          totalUsed: data.totalUsed || 0,
          todayUsed: data.todayUsed || 0,
          last7DaysUsed: data.last7DaysUsed || 0,
          last30DaysUsed: data.last30DaysUsed || 0,
          repeatUsers: data.repeatUsers || 0,
          fabClicksLast30Days: data.fabClicksLast30Days || 0,
        });
      } catch (error) {
        console.error('❌ [MetricsPage] Erro ao buscar estatísticas de cupons:', error);
        setCouponStats({
          totalUsed: 0,
          todayUsed: 0,
          last7DaysUsed: 0,
          last30DaysUsed: 0,
          repeatUsers: 0,
          fabClicksLast30Days: 0
        });
      } finally {
        setLoadingCouponStats(false);
      }
    };

    fetchCouponStats();

    // Atualizar a cada 60 segundos
    const interval = setInterval(fetchCouponStats, 60000);
    return () => clearInterval(interval);
  }, [request]);

  // Série diária de cupons usados
  useEffect(() => {
    const fetchCouponDaily = async () => {
      setLoadingCouponDaily(true);
      try {
        const data = await request({ url: `/coupon/daily?days=${couponDaysRange}` });
        if (data.ok && Array.isArray(data.daily)) {
          const formatted = data.daily.map(item => {
            let dateStr = '';
            try {
              if (item.date) {
                const dateOnly = typeof item.date === 'string'
                  ? item.date.split('T')[0].split(' ')[0]
                  : new Date(item.date).toISOString().split('T')[0];
                const [year, month, day] = dateOnly.split('-');
                if (year && month && day) {
                  dateStr = `${day}/${month}`;
                }
              }
            } catch (e) {
              console.error('Erro ao formatar data de cupons diários:', e, item);
              dateStr = '?';
            }
            return {
              date: dateStr,
              used: parseInt(item.used || 0, 10)
            };
          }).filter(item => item.date && item.date !== '?');
          setCouponDailyData(formatted);
        } else {
          setCouponDailyData([]);
        }
      } catch (error) {
        console.error('Erro ao buscar cupons diários:', error);
        setCouponDailyData([]);
      } finally {
        setLoadingCouponDaily(false);
      }
    };

    fetchCouponDaily();
  }, [request, couponDaysRange]);

  // Busca dados históricos
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999); // Incluir todo o dia de hoje
        const startDate = new Date();
        
        if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7);
        if (timeRange === '30d') startDate.setDate(startDate.getDate() - 30);
        if (timeRange === '90d') startDate.setDate(startDate.getDate() - 90);
        startDate.setHours(0, 0, 0, 0); // Começar do início do dia

        // Converter para ISO string uma vez para usar em todas as requisições
        const startDateISO = startDate.toISOString();
        const endDateISO = endDate.toISOString();

        // Fetch métricas usando endpoints existentes
        // Usar summary e events para calcular métricas de tráfego
        try {
          
          console.log('📊 [MetricsPage] Buscando dados:', {
            startDate: startDateISO,
            endDate: endDateISO,
            timeRange
          });
          
          const summaryRes = await request({ 
            url: `/analytics/summary?startDate=${startDateISO}&endDate=${endDateISO}` 
          });
          
          console.log('📊 [MetricsPage] Resposta do summary:', summaryRes);
          console.log('📊 [MetricsPage] Summary data:', summaryRes.summary);
          
          // Buscar eventos detalhados para calcular métricas (limite máximo é 500)
          const eventsRes = await request({ 
            url: `/analytics/events?startDate=${startDateISO}&endDate=${endDateISO}&limit=500` 
          });
          
          console.log('📊 [MetricsPage] Total de eventos retornados:', eventsRes.events?.length || 0);
          
          const events = eventsRes.events || [];
          const summary = summaryRes.summary || [];
          
          console.log('📊 [MetricsPage] Summary items:', summary);
          
          // Calcular métricas a partir dos eventos
          const eventCounts = {};
          summary.forEach(item => {
            eventCounts[item.eventName] = item.total;
            console.log(`📊 [MetricsPage] Evento: ${item.eventName} = ${item.total}`);
          });
          
          console.log('📊 [MetricsPage] EventCounts final:', eventCounts);
          
          // Não calcular DAU/WAU/MAU/Sessões aqui - usar apenas activeUsers do /live
          setMetrics({
            dau: 0, // Será substituído por activeUsers
            wau: 0, // Não disponível sem query específica
            mau: 0, // Não disponível sem query específica
            totalSessions: 0, // Não disponível sem query específica
            avgSessionDuration: 0, // Não disponível
            topScreens: [], // Será calculado se necessário
            avgTimePerScreen: 0,
            exitRate: 0,
            productViews: eventCounts['product_view'] || eventCounts['product_detail_view'] || 0,
            cartAdds: eventCounts['cart_add'] || 0,
            cartRemoves: eventCounts['cart_remove'] || 0,
            checkoutStarts: eventCounts['checkout_proceed_click'] || 0,
            checkoutAbandoned: eventCounts['checkout_abandoned'] || 0,
            ordersCompleted: eventCounts['order_completed'] || eventCounts['order_created'] || 0,
            bannerImpressions: eventCounts['banner_impression'] || 0,
            bannerClicks: eventCounts['banner_click'] || 0,
            bannerCTR: (eventCounts['banner_click'] || 0) / Math.max((eventCounts['banner_impression'] || 1), 1),
            pushSent: 0, // Não rastreado em analytics_events
            pushOpened: 0,
            pushClicked: 0,
            searchUsage: eventCounts['search'] || eventCounts['search_query'] || 0,
            searchNoResults: eventCounts['search_no_results'] || 0,
            filterUsage: eventCounts['filter_applied'] || 0,
            topSearchTerms: [], // Será calculado se necessário
            reviewsStarted: eventCounts['review_started'] || 0,
            reviewsCompleted: eventCounts['review_submitted'] || 0,
            reviewCompletionRate: (eventCounts['review_submitted'] || 0) / Math.max((eventCounts['review_started'] || 1), 1),
            avgRating: 0, // Não disponível
            avgLoadTime: 0,
            errorsPerScreen: 0,
            crashes: 0,
            platformDistribution: {}, // Será calculado se necessário
            // Oferta Especial
            specialOfferImpressions: eventCounts['special_offer_impression'] || 0,
            specialOfferClicks: eventCounts['special_offer_click'] || 0,
            specialOfferViews: eventCounts['special_offer_view'] || 0,
            specialOfferCTR: (eventCounts['special_offer_click'] || 0) / Math.max((eventCounts['special_offer_impression'] || 1), 1),
            specialOfferViewRate: (eventCounts['special_offer_view'] || 0) / Math.max((eventCounts['special_offer_click'] || 1), 1)
          });
        } catch (error) {
          console.error('Erro ao buscar métricas:', error);
          setMetrics(null);
        }

        // Fetch Daily Series
        try {
          const dailyRes = await request({ 
            url: `/analytics/daily?startDate=${startDateISO}&endDate=${endDateISO}` 
          });
          
          console.log('📊 [MetricsPage] Daily response:', dailyRes);
          
          // Transformar dados para o gráfico
          const formattedDaily = (dailyRes.daily || []).map(item => {
            // Formatar data: garantir formato DD/MM
            let dateStr = '';
            try {
              if (item.date) {
                // Se for string no formato YYYY-MM-DD, extrair diretamente
                if (typeof item.date === 'string') {
                  // Remover qualquer parte de timestamp (T00:00:00.000Z)
                  const dateOnly = item.date.split('T')[0].split(' ')[0];
                  
                  // Verificar se é formato YYYY-MM-DD
                  if (dateOnly.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const [year, month, day] = dateOnly.split('-');
                    dateStr = `${day}/${month}`;
                  } else {
                    // Tentar parsear como Date
                    const dateObj = new Date(item.date);
                    if (!isNaN(dateObj.getTime())) {
                      const day = String(dateObj.getDate()).padStart(2, '0');
                      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                      dateStr = `${day}/${month}`;
                    } else {
                      console.warn('📊 [MetricsPage] Data inválida:', item.date);
                      dateStr = '?';
                    }
                  }
                } else {
                  // Se for Date object ou outro tipo
                  const dateObj = new Date(item.date);
                  if (!isNaN(dateObj.getTime())) {
                    const day = String(dateObj.getDate()).padStart(2, '0');
                    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
                    dateStr = `${day}/${month}`;
                  } else {
                    console.warn('📊 [MetricsPage] Data inválida (tipo):', item.date, typeof item.date);
                    dateStr = '?';
                  }
                }
              }
            } catch (error) {
              console.error('📊 [MetricsPage] Erro ao formatar data:', error, item);
              dateStr = '?';
            }
            
            return {
              date: dateStr,
              visitors: parseInt(item.unique_visitors || 0),
              sessions: parseInt(item.total_sessions || 0),
              orders: parseInt(item.total_orders || 0),
              pageViews: parseInt(item.page_views || 0),
              downloads: parseInt(item.downloads || 0),
              downloadsAndroid: parseInt(item.downloadsAndroid || 0),
              downloadsIOS: parseInt(item.downloadsIOS || 0),
              downloadsOther: parseInt(item.downloadsOther || 0)
            };
          }).filter(item => item.date && item.date !== '?' && item.date !== 'Erro' && item.date !== 'Inválida');
          
          console.log('📊 [MetricsPage] Daily formatado:', formattedDaily);
          setDailyData(formattedDaily);
        } catch (dailyError) {
          console.error('Erro ao buscar daily series:', dailyError);
          setDailyData([]);
        }

      } catch (error) {
        console.error('Erro ao buscar dados:', error);
        // Se endpoint não existir, usar dados vazios
        setMetrics(null);
        setDailyData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [request, timeRange]);

  // Busca termos de buscas sem resultado
  useEffect(() => {
    const fetchSearchNoResults = async () => {
      setLoadingNoResults(true);
      try {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = new Date();
        
        if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7);
        if (timeRange === '30d') startDate.setDate(startDate.getDate() - 30);
        if (timeRange === '90d') startDate.setDate(startDate.getDate() - 90);
        startDate.setHours(0, 0, 0, 0);

        const startDateISO = startDate.toISOString();
        const endDateISO = endDate.toISOString();

        // Buscar até 500 eventos de search_no_results
        const data = await request({ 
          url: `/analytics/events?startDate=${startDateISO}&endDate=${endDateISO}&eventName=search_no_results&limit=500` 
        });

        const events = data.events || [];
        
        // Agrupar termos de busca e contar ocorrências
        const termCounts = {};
        events.forEach(event => {
          const searchQuery = event.metadata?.searchQuery || event.metadata?.search_query || '';
          if (searchQuery && searchQuery.trim()) {
            const term = searchQuery.trim().toLowerCase();
            termCounts[term] = (termCounts[term] || 0) + 1;
          }
        });

        // Converter para array e ordenar por contagem
        const sortedTerms = Object.entries(termCounts)
          .map(([term, count]) => ({ term, count }))
          .sort((a, b) => b.count - a.count);

        setSearchNoResultsTerms(sortedTerms);
      } catch (error) {
        console.error('Erro ao buscar buscas sem resultado:', error);
        setSearchNoResultsTerms([]);
      } finally {
        setLoadingNoResults(false);
      }
    };

    fetchSearchNoResults();
  }, [request, timeRange]);

  // Busca termos mais buscados (em geral)
  useEffect(() => {
    const fetchTopSearchTerms = async () => {
      setLoadingTopSearch(true);
      try {
        // Buscar todos os eventos de search usando a função helper
        const allEvents = await fetchAllEvents('search', 500);

        // Agrupar termos de busca e contar ocorrências
        const termCounts = {};
        allEvents.forEach(event => {
          const searchQuery = event.metadata?.searchQuery || event.metadata?.search_query || '';
          if (searchQuery && searchQuery.trim()) {
            const term = searchQuery.trim().toLowerCase();
            termCounts[term] = (termCounts[term] || 0) + 1;
          }
        });

        // Converter para array e ordenar por contagem
        const sortedTerms = Object.entries(termCounts)
          .map(([term, count]) => ({ term, count }))
          .sort((a, b) => b.count - a.count);

        setTopSearchTerms(sortedTerms);
      } catch (error) {
        console.error('Erro ao buscar termos mais buscados:', error);
        setTopSearchTerms([]);
      } finally {
        setLoadingTopSearch(false);
      }
    };

    fetchTopSearchTerms();
  }, [fetchAllEvents]);

  // Busca produtos mais visualizados
  useEffect(() => {
    const fetchProductViews = async () => {
      setLoadingProductViews(true);
      try {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = new Date();
        
        if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7);
        if (timeRange === '30d') startDate.setDate(startDate.getDate() - 30);
        if (timeRange === '90d') startDate.setDate(startDate.getDate() - 90);
        startDate.setHours(0, 0, 0, 0);

        const startDateISO = startDate.toISOString();
        const endDateISO = endDate.toISOString();

        // Buscar até 500 eventos de product_view
        const data = await request({ 
          url: `/analytics/events?startDate=${startDateISO}&endDate=${endDateISO}&eventName=product_view&limit=500` 
        });

        const events = data.events || [];
        
        // Agrupar por productId e contar ocorrências
        const productCounts = {};
        events.forEach(event => {
          const productId = event.productId || event.metadata?.productId;
          if (productId) {
            const id = String(productId);
            if (!productCounts[id]) {
              productCounts[id] = {
                id: id,
                count: 0,
                name: event.metadata?.productName || 'Produto desconhecido',
                price: event.metadata?.productPrice || null,
                lastViewed: event.createdAt
              };
            }
            productCounts[id].count += 1;
            // Atualizar última visualização se for mais recente
            if (new Date(event.createdAt) > new Date(productCounts[id].lastViewed)) {
              productCounts[id].lastViewed = event.createdAt;
            }
          }
        });

        // Converter para array e ordenar por contagem
        const sortedProducts = Object.values(productCounts)
          .sort((a, b) => b.count - a.count);

        setProductViews(sortedProducts);
      } catch (error) {
        console.error('Erro ao buscar visualizações de produto:', error);
        setProductViews([]);
      } finally {
        setLoadingProductViews(false);
      }
    };

    fetchProductViews();
  }, [request, timeRange]);

  // Busca produtos mais adicionados ao carrinho
  useEffect(() => {
    const fetchCartAdds = async () => {
      setLoadingCartAdds(true);
      try {
        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        const startDate = new Date();
        
        if (timeRange === '7d') startDate.setDate(startDate.getDate() - 7);
        if (timeRange === '30d') startDate.setDate(startDate.getDate() - 30);
        if (timeRange === '90d') startDate.setDate(startDate.getDate() - 90);
        startDate.setHours(0, 0, 0, 0);

        const startDateISO = startDate.toISOString();
        const endDateISO = endDate.toISOString();

        // Buscar até 500 eventos de cart_add
        const data = await request({ 
          url: `/analytics/events?startDate=${startDateISO}&endDate=${endDateISO}&eventName=cart_add&limit=500` 
        });

        const events = data.events || [];
        
        // Agrupar por productId e contar ocorrências
        const productCounts = {};
        events.forEach(event => {
          const productId = event.productId || event.metadata?.originalProductId;
          if (productId) {
            const id = String(productId);
            if (!productCounts[id]) {
              productCounts[id] = {
                id: id,
                count: 0,
                totalQuantity: 0,
                totalValue: 0,
                name: null, // Será buscado do banco
                price: event.cartValue || event.metadata?.price || null,
                lastAdded: event.createdAt
              };
            }
            productCounts[id].count += 1;
            productCounts[id].totalQuantity += (event.productQuantity || 1);
            productCounts[id].totalValue += (event.cartValue || event.metadata?.price || 0);
            // Atualizar última adição se for mais recente
            if (new Date(event.createdAt) > new Date(productCounts[id].lastAdded)) {
              productCounts[id].lastAdded = event.createdAt;
            }
          }
        });

        // Buscar nomes dos produtos do banco
        const productIds = Object.keys(productCounts);
        const productsWithNames = await Promise.all(
          productIds.map(async (id) => {
            try {
              const productData = await request({ url: `/products/${id}` });
              const product = productData.product || productData;
              return {
                ...productCounts[id],
                name: product?.nome || 'Produto desconhecido',
                price: productCounts[id].price || product?.preco_varejo || null
              };
            } catch (error) {
              // Silenciar erro 404 (produto não encontrado) para não poluir o console
              if (error.response?.status !== 404) {
                console.error(`Erro ao buscar produto ${id}:`, error);
              }
              return {
                ...productCounts[id],
                name: `Produto ID ${id} (não encontrado)`
              };
            }
          })
        );

        // Converter para array e ordenar por contagem
        const sortedProducts = productsWithNames
          .sort((a, b) => b.count - a.count);

        setCartAdds(sortedProducts);
      } catch (error) {
        console.error('Erro ao buscar adições ao carrinho:', error);
        setCartAdds([]);
      } finally {
        setLoadingCartAdds(false);
      }
    };

    fetchCartAdds();
  }, [request, timeRange]);

  const handleMarkUnavailable = async () => {
    if (!confirm('Tem certeza que deseja marcar produtos deletados no Shopify como indisponíveis? Esta ação não pode ser desfeita.')) {
      return;
    }

    setMarkingUnavailable(true);
    setMarkUnavailableResult(null);
    setMarkUnavailableProgress({ current: 0, total: 0, stage: 'Buscando produtos do Shopify...' });
    
    try {
      // Simular progresso enquanto a requisição está sendo processada
      let progressCounter = 0;
      const progressInterval = setInterval(() => {
        progressCounter += 50;
        setMarkUnavailableProgress(prev => {
          if (prev.total === 0) {
            // Estimar progresso baseado no tempo (assumindo ~2000 produtos)
            const estimatedTotal = 2000;
            const current = Math.min(progressCounter, estimatedTotal);
            return { 
              current, 
              total: estimatedTotal, 
              stage: current < estimatedTotal ? 'Buscando produtos do Shopify...' : 'Verificando produtos...' 
            };
          }
          return prev;
        });
      }, 300);
      
      const result = await request({
        url: '/products/mark-unavailable-deleted',
        method: 'POST'
      });
      
      clearInterval(progressInterval);
      
      // Atualizar com valores reais
      setMarkUnavailableProgress({ 
        current: result.totalShopifyProducts || 0, 
        total: result.totalShopifyProducts || 0, 
        stage: 'Concluído!' 
      });
      
      setMarkUnavailableResult({
        success: true,
        message: result.message || 'Produtos marcados com sucesso',
        unavailableCount: result.unavailableCount || 0,
        totalShopifyProducts: result.totalShopifyProducts || 0,
        totalInDb: result.totalInDb || 0
      });
      
      setTimeout(() => {
        alert(`✅ ${result.unavailableCount || 0} produtos foram marcados como indisponíveis.\n\nTotal de produtos no Shopify: ${result.totalShopifyProducts || 0}\nTotal de produtos no banco: ${result.totalInDb || 0}`);
      }, 500);
    } catch (error) {
      console.error('Erro ao marcar produtos como indisponíveis:', error);
      setMarkUnavailableResult({
        success: false,
        message: error.response?.data?.error || error.message || 'Erro ao marcar produtos como indisponíveis'
      });
      setMarkUnavailableProgress({ current: 0, total: 0, stage: 'Erro' });
      alert(`❌ Erro: ${error.response?.data?.error || error.message || 'Erro ao marcar produtos como indisponíveis'}`);
    } finally {
      setTimeout(() => {
        setMarkingUnavailable(false);
        setMarkUnavailableProgress({ current: 0, total: 0, stage: '' });
      }, 1000);
    }
  };


  if (loading && !metrics) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <RefreshCw className="spin" size={32} color="#3c0166" />
      </div>
    );
  }

  const m = metrics || {};

  return (
    <div style={{ padding: '0px', maxWidth: '1600px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '800', color: '#1e293b', marginBottom: '8px' }}>Métricas</h1>
          <p style={{ color: '#64748b' }}>Análise de tráfego, uso e comportamento do app</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
            <button
              onClick={handleMarkUnavailable}
              disabled={markingUnavailable}
              style={{
                border: 'none',
                background: markingUnavailable ? '#94a3b8' : '#ef4444',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '6px',
                cursor: markingUnavailable ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s',
                opacity: markingUnavailable ? 0.6 : 1
              }}
              title="Marcar produtos deletados no Shopify como indisponíveis"
            >
              {markingUnavailable ? (
                <>
                  <RefreshCw 
                    size={16} 
                    style={{ 
                      animation: 'spin 1s linear infinite',
                      display: 'inline-block'
                    }} 
                  />
                  {markUnavailableProgress.total > 0 ? (
                    <span>
                      {markUnavailableProgress.current.toLocaleString()}/{markUnavailableProgress.total.toLocaleString()}
                    </span>
                  ) : (
                    <span>Processando...</span>
                  )}
                </>
              ) : (
                <>
                  <Trash2 size={16} />
                  Marcar Produtos Deletados
                </>
              )}
            </button>
            {markingUnavailable && markUnavailableProgress.stage && (
              <span style={{ 
                fontSize: '11px', 
                color: '#64748b',
                marginTop: '-4px',
                textAlign: 'right'
              }}>
                {markUnavailableProgress.stage}
              </span>
            )}
          </div>
          
          <button
            onClick={handleRefreshDownloads}
            disabled={isRefreshingDownloads}
            style={{
              border: 'none',
              background: isRefreshingDownloads ? '#94a3b8' : '#10b981',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: isRefreshingDownloads ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
              opacity: isRefreshingDownloads ? 0.6 : 1
            }}
            title="Buscar dados de instalações das lojas de aplicativos"
          >
            {isRefreshingDownloads ? (
              <>
                <RefreshCw size={16} className="spin" />
                <span>Coletando...</span>
              </>
            ) : (
              <>
                <Smartphone size={16} />
                <span>Coletar Instalações</span>
              </>
            )}
          </button>

          <button
            onClick={() => window.location.reload()}
            style={{
              border: 'none',
              background: '#3c0166',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={16} />
            Atualizar
          </button>
          
          <div style={{ display: 'flex', gap: '12px', backgroundColor: 'white', padding: '4px', borderRadius: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            {['7d', '30d', '90d'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                style={{
                  border: 'none',
                  background: timeRange === range ? '#3c0166' : 'transparent',
                  color: timeRange === range ? 'white' : '#64748b',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  transition: 'all 0.2s'
                }}
              >
                {range === '7d' ? '7 Dias' : range === '30d' ? '30 Dias' : '3 M'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Seção 1: Visão Geral - Acesso & Audiência */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Acesso & Audiência</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            padding: '32px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            border: '2px solid #e0e7ff',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: '-50px', right: '-50px', width: '200px', height: '200px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }}></div>
            <div style={{ position: 'absolute', bottom: '-30px', left: '-30px', width: '150px', height: '150px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }}></div>
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                <div>
                  <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', fontWeight: '500', margin: 0, marginBottom: '8px' }}>Pessoas Ativas no App</p>
                  <h3 style={{ fontSize: '48px', fontWeight: '800', color: '#fff', margin: 0, lineHeight: '1' }}>{activeUsers || 0}</h3>
                </div>
                <div style={{
                  padding: '16px',
                  borderRadius: '16px',
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)'
                }}>
                  <Users size={32} color="#fff" />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  animation: 'pulse 2s infinite'
                }}></div>
                <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '13px', fontWeight: '500' }}>
                  Usuários ativos agora (últimos 5 minutos)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Seção: Instalações Reais */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Instalações</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
          <Card
            title="Instalações Totais"
            value={downloads.total.toLocaleString()}
            subtext="installs do app"
            icon={Smartphone}
            color="blue"
          />
          <Card
            title="Instalações iOS"
            value={downloads.ios.toLocaleString()}
            subtext="App Store"
            icon={Smartphone}
            color="purple"
          />
          <Card
            title="Instalações Android"
            value={downloads.android.toLocaleString()}
            subtext="Google Play"
            icon={Smartphone}
            color="green"
          />
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            height: '100%'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <p style={{ color: '#64748b', fontSize: '14px', fontWeight: '500', margin: 0 }}>Pessoas Ativas</p>
                <h3 style={{ fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: '4px 0' }}>
                  {loadingActiveUsers ? '...' : activeUsersByPeriod.count.toLocaleString()}
                </h3>
              </div>
              <div style={{
                padding: '12px',
                borderRadius: '12px',
                backgroundColor: '#eff6ff',
                color: '#3b82f6'
              }}>
                <Users size={24} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveUsersByPeriod(prev => ({ ...prev, days: 15 }))}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: activeUsersByPeriod.days === 15 ? '#3b82f6' : '#f1f5f9',
                    color: activeUsersByPeriod.days === 15 ? 'white' : '#64748b',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '12px',
                    transition: 'all 0.2s'
                  }}
                >
                  15 dias
                </button>
                <button
                  onClick={() => setActiveUsersByPeriod(prev => ({ ...prev, days: 30 }))}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: activeUsersByPeriod.days === 30 ? '#3b82f6' : '#f1f5f9',
                    color: activeUsersByPeriod.days === 30 ? 'white' : '#64748b',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '12px',
                    transition: 'all 0.2s'
                  }}
                >
                  30 dias
                </button>
              </div>
              <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                últimos {activeUsersByPeriod.days} dias
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Seção: Cupons Rasgados */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Cupons Diários</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
          <Card
            title="Cupons Rasgados (Total)"
            value={loadingCouponStats ? '...' : couponStats.totalUsed.toLocaleString()}
            subtext="total de cupons utilizados"
            icon={Ticket}
            color="purple"
          />
          <Card
            title="Cupons Rasgados Hoje"
            value={loadingCouponStats ? '...' : couponStats.todayUsed.toLocaleString()}
            subtext="cupons utilizados hoje"
            icon={Ticket}
            color="blue"
          />
          <Card
            title="Últimos 7 Dias"
            value={loadingCouponStats ? '...' : couponStats.last7DaysUsed.toLocaleString()}
            subtext="cupons nos últimos 7 dias"
            icon={Ticket}
            color="green"
          />
          <Card
            title="Últimos 30 Dias"
            value={loadingCouponStats ? '...' : couponStats.last30DaysUsed.toLocaleString()}
            subtext="cupons nos últimos 30 dias"
            icon={Ticket}
            color="orange"
          />
          <Card
            title="Clientes que Reutilizaram"
            value={loadingCouponStats ? '...' : couponStats.repeatUsers.toLocaleString()}
            subtext="usaram o cupom em mais de um dia"
            icon={Users}
            color="teal"
          />
          <Card
            title="Cliques no FAB"
            value={loadingCouponStats ? '...' : couponStats.fabClicksLast30Days.toLocaleString()}
            subtext="últimos 30 dias"
            icon={MousePointerClick}
            color="amber"
          />
        </div>
      </div>

      {/* Gráfico: Cupons por Dia */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Cupons por Dia</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '24px' }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                Cupons Utilizados por Dia
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setCouponDaysRange('15')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: couponDaysRange === '15' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: couponDaysRange === '15' ? '#eef2ff' : 'transparent',
                    color: couponDaysRange === '15' ? '#6366f1' : '#64748b',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  15 dias
                </button>
                <button
                  onClick={() => setCouponDaysRange('30')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: couponDaysRange === '30' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: couponDaysRange === '30' ? '#eef2ff' : 'transparent',
                    color: couponDaysRange === '30' ? '#6366f1' : '#64748b',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  30 dias
                </button>
                <button
                  onClick={() => setCouponDaysRange('90')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: couponDaysRange === '90' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: couponDaysRange === '90' ? '#eef2ff' : 'transparent',
                    color: couponDaysRange === '90' ? '#6366f1' : '#64748b',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  90 dias
                </button>
              </div>
            </div>

            {loadingCouponDaily ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Carregando gráfico...</div>
            ) : couponDailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={couponDailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                    labelStyle={{ color: '#1e293b' }}
                  />
                  <Bar
                    dataKey="used"
                    fill="#8b5cf6"
                    name="Cupons usados"
                  />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Nenhum cupom utilizado no período selecionado
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seção: Gráficos de Downloads */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Downloads por Dia</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '24px' }}>
          {/* Gráfico de Downloads por Dia */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                Instalações por Dia {showDownloadsBreakdown ? '(iOS vs Android)' : '(Total)'}
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setDownloadsTimeRange('15')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: downloadsTimeRange === '15' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: downloadsTimeRange === '15' ? '#eef2ff' : 'transparent',
                    color: downloadsTimeRange === '15' ? '#6366f1' : '#64748b',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  15 dias
                </button>
                <button
                  onClick={() => setDownloadsTimeRange('30')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: downloadsTimeRange === '30' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: downloadsTimeRange === '30' ? '#eef2ff' : 'transparent',
                    color: downloadsTimeRange === '30' ? '#6366f1' : '#64748b',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  30 dias
                </button>
                <button
                  onClick={() => setDownloadsTimeRange('90')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: downloadsTimeRange === '90' ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: downloadsTimeRange === '90' ? '#eef2ff' : 'transparent',
                    color: downloadsTimeRange === '90' ? '#6366f1' : '#64748b',
                    fontWeight: '500',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  90 dias
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={() => setShowDownloadsBreakdown(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: !showDownloadsBreakdown ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                  background: !showDownloadsBreakdown ? '#eff6ff' : 'transparent',
                  color: !showDownloadsBreakdown ? '#3b82f6' : '#64748b',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Total Geral
              </button>
              <button
                onClick={() => setShowDownloadsBreakdown(true)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  border: showDownloadsBreakdown ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                  background: showDownloadsBreakdown ? '#eff6ff' : 'transparent',
                  color: showDownloadsBreakdown ? '#3b82f6' : '#64748b',
                  fontWeight: '500',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                iOS vs Android
              </button>
            </div>

            {loadingDownloadsDaily ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Carregando gráfico...</div>
            ) : downloadsDailyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={showDownloadsBreakdown ? downloadsDailyData : downloadsDailyData.map(d => ({ ...d, total: (d.apple || 0) + (d.google || 0) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" style={{ fontSize: '12px' }} />
                  <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                    labelStyle={{ color: '#1e293b' }}
                  />
                  {showDownloadsBreakdown ? (
                    <>
                      <Bar dataKey="apple" fill="#8b5cf6" name="iOS" />
                      <Bar dataKey="google" fill="#10b981" name="Android" />
                    </>
                  ) : (
                    <Bar 
                      dataKey="total" 
                      fill="#6366f1" 
                      name="Total"
                    />
                  )}
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Nenhum dado disponível para este período
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Gráfico de Visitantes e Sessões */}
      {dailyData.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '24px', marginBottom: '32px' }}>
          <div style={{ 
            backgroundColor: 'white', 
            padding: '28px', 
            borderRadius: '16px', 
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', margin: 0, marginBottom: '4px' }}>Visitantes Únicos</h3>
                <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                  {dailyData.reduce((sum, d) => sum + d.visitors, 0).toLocaleString()} visitantes no período
                </p>
              </div>
              <div style={{
                padding: '12px',
                borderRadius: '12px',
                backgroundColor: '#eff6ff',
                color: '#2563eb'
              }}>
                <Users size={24} />
              </div>
            </div>
            <div style={{ height: '320px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#667eea" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#764ba2" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#64748b', fontSize: 12}} 
                    dy={10}
                    interval={dailyData.length > 10 ? Math.floor(dailyData.length / 10) : 0}
                    angle={dailyData.length > 7 ? -45 : 0}
                    textAnchor={dailyData.length > 7 ? 'end' : 'middle'}
                    height={dailyData.length > 7 ? 60 : 30}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#64748b', fontSize: 12}}
                    width={50}
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: 'none', 
                      borderRadius: '12px', 
                      color: '#fff',
                      padding: '12px 16px',
                      boxShadow: '0 10px 20px rgba(0,0,0,0.15)'
                    }}
                    labelStyle={{ color: '#fff', fontWeight: '600', marginBottom: '8px' }}
                    itemStyle={{ color: '#fff', padding: '4px 0' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="visitors" 
                    stroke="#667eea" 
                    fillOpacity={1} 
                    fill="url(#colorVisitors)" 
                    strokeWidth={3}
                    dot={{ fill: '#667eea', r: 4 }}
                    activeDot={{ r: 6, fill: '#764ba2' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ 
            backgroundColor: 'white', 
            padding: '28px', 
            borderRadius: '16px', 
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', margin: 0, marginBottom: '4px' }}>Sessões por Dia</h3>
                <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
                  {dailyData.reduce((sum, d) => sum + d.sessions, 0).toLocaleString()} sessões no período
                </p>
              </div>
              <div style={{
                padding: '12px',
                borderRadius: '12px',
                backgroundColor: '#ecfdf5',
                color: '#10b981'
              }}>
                <Activity size={24} />
              </div>
            </div>
            <div style={{ height: '320px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#64748b', fontSize: 12}} 
                    dy={10}
                    interval={dailyData.length > 10 ? Math.floor(dailyData.length / 10) : 0}
                    angle={dailyData.length > 7 ? -45 : 0}
                    textAnchor={dailyData.length > 7 ? 'end' : 'middle'}
                    height={dailyData.length > 7 ? 60 : 30}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#64748b', fontSize: 12}}
                    width={50}
                  />
                  <RechartsTooltip 
                    cursor={{fill: '#f1f5f9', opacity: 0.3}}
                    contentStyle={{ 
                      backgroundColor: '#1e293b', 
                      border: 'none', 
                      borderRadius: '12px', 
                      color: '#fff',
                      padding: '12px 16px',
                      boxShadow: '0 10px 20px rgba(0,0,0,0.15)'
                    }}
                    labelStyle={{ color: '#fff', fontWeight: '600', marginBottom: '8px' }}
                    itemStyle={{ color: '#fff', padding: '4px 0' }}
                  />
                  <Bar 
                    dataKey="sessions" 
                    fill="#10b981" 
                    radius={[8, 8, 0, 0]} 
                    barSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', marginBottom: '32px' }}>
          <EmptyState message="Dados de visitantes e sessões não disponíveis no momento" />
        </div>
      )}



      {/* Seção: Total de Inscrições */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Total de Inscrições</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
          <Card
            title="Inscrições Totais"
            value={tokens.total.toLocaleString()}
            subtext="tokens de push (dispositivos que recebem notificação)"
            icon={Users}
            color="blue"
          />
          <Card
            title="Inscrições hoje"
            value={(tokens.today ?? 0).toLocaleString()}
            subtext="de 00:00 até agora (horário de Brasília)"
            icon={Calendar}
            color="amber"
          />
          <Card
            title="Inscrições iOS"
            value={tokens.ios.toLocaleString()}
            subtext="iOS"
            icon={Smartphone}
            color="purple"
          />
          <Card
            title="Inscrições Android"
            value={tokens.android.toLocaleString()}
            subtext="Android"
            icon={Smartphone}
            color="green"
          />
        </div>
      </div>

      {/* Gráfico de Inscrições por Dia */}
      {dailyData.length > 0 ? (
        <div style={{ 
          backgroundColor: 'white', 
          padding: '28px', 
          borderRadius: '16px', 
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          border: '1px solid #e2e8f0',
          marginBottom: '32px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', margin: 0, marginBottom: '4px' }}>Inscrições por Dia</h3>
            </div>
            <div style={{
              padding: '12px',
              borderRadius: '12px',
              backgroundColor: '#f0fdf4',
              color: '#16a34a'
            }}>
              <TrendingUp size={24} />
            </div>
          </div>
          <div style={{ height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDownloadsAndroid" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.2}/>
                  </linearGradient>
                  <linearGradient id="colorDownloadsIOS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.2}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12}} 
                  dy={10}
                  interval={dailyData.length > 10 ? Math.floor(dailyData.length / 10) : 0}
                  angle={dailyData.length > 7 ? -45 : 0}
                  textAnchor={dailyData.length > 7 ? 'end' : 'middle'}
                  height={dailyData.length > 7 ? 60 : 30}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12}}
                  width={50}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    padding: '8px 12px'
                  }}
                  labelStyle={{ color: '#1e293b', fontWeight: 600, marginBottom: '4px' }}
                  formatter={(value, name) => {
                    if (name === 'downloadsAndroid') return [value, 'Android'];
                    if (name === 'downloadsIOS') return [value, 'iOS'];
                    if (name === 'downloadsOther') return [value, 'Outros'];
                    return [value, 'Downloads'];
                  }}
                />
                <Legend 
                  wrapperStyle={{ paddingTop: '20px' }}
                  iconType="rect"
                  formatter={(value) => {
                    if (value === 'downloadsAndroid') return 'Android';
                    if (value === 'downloadsIOS') return 'iOS';
                    if (value === 'downloadsOther') return 'Outros';
                    return value;
                  }}
                />
                <Bar 
                  dataKey="downloadsAndroid" 
                  fill="url(#colorDownloadsAndroid)"
                  radius={[8, 8, 0, 0]}
                  name="downloadsAndroid"
                />
                <Bar 
                  dataKey="downloadsIOS" 
                  fill="url(#colorDownloadsIOS)"
                  radius={[8, 8, 0, 0]}
                  name="downloadsIOS"
                />
                {dailyData.some(d => (d.downloadsOther || 0) > 0) && (
                  <Bar 
                    dataKey="downloadsOther" 
                    fill="#94a3b8"
                    radius={[8, 8, 0, 0]}
                    name="downloadsOther"
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', marginBottom: '32px' }}>
          <EmptyState message="Dados de downloads não disponíveis no momento" />
        </div>
      )}

      {/* Seção 3: Intenção de Compra */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Intenção de Compra</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
          <Card
            title="Visualizações de Produto"
            value={m.productViews || 0}
            subtext="visualizações"
            icon={Eye}
            color="blue"
          />
          <Card
            title="Adições ao Carrinho"
            value={m.cartAdds || 0}
            subtext="produtos adicionados"
            icon={ShoppingBag}
            color="green"
          />
          <Card
            title="Remoções do Carrinho"
            value={m.cartRemoves || 0}
            subtext="produtos removidos"
            icon={XCircle}
            color="red"
          />
          <Card
            title="Inícios de Checkout"
            value={m.checkoutStarts || 0}
            subtext="checkouts iniciados"
            icon={CheckCircle}
            color="purple"
          />
          <Card
            title="Checkout Abandonado"
            value={m.checkoutAbandoned || 0}
            subtext="checkouts não finalizados"
            icon={XCircle}
            color="orange"
          />
          <Card
            title="Pedidos Concluídos"
            value={m.ordersCompleted || 0}
            subtext="pedidos finalizados"
            icon={CheckCircle}
            color="green"
          />
        </div>

        {/* Produtos mais visualizados */}
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid #dbeafe', marginTop: '24px' }}>
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: showProductViews ? '16px' : '0',
              cursor: 'pointer'
            }}
            onClick={() => setShowProductViews(!showProductViews)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                Produtos Mais Visualizados
              </h3>
              {productViews.length > 0 && (
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: '600', 
                  color: '#2563eb', 
                  backgroundColor: '#dbeafe', 
                  padding: '2px 8px', 
                  borderRadius: '12px' 
                }}>
                  {productViews.length} {productViews.length === 1 ? 'produto' : 'produtos'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {loadingProductViews && (
                <RefreshCw size={16} className="spin" style={{ color: '#64748b' }} />
              )}
              {showProductViews ? (
                <ChevronUp size={20} style={{ color: '#64748b' }} />
              ) : (
                <ChevronDown size={20} style={{ color: '#64748b' }} />
              )}
            </div>
          </div>
          {showProductViews && (
            <>
              {loadingProductViews && productViews.length === 0 ? (
                <EmptyState message="Carregando produtos visualizados..." />
              ) : productViews.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                    Produtos mais visualizados pelos usuários no período selecionado.
                  </p>
                  <div style={{ 
                    maxHeight: '500px', 
                    overflowY: 'auto', 
                    overflowX: 'hidden',
                    paddingRight: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                  className="custom-scrollbar"
                  >
                    {productViews.map((item, index) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#2563eb', minWidth: '24px' }}>#{index + 1}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{item.name}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>ID: {item.id}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#2563eb' }}>{item.count} {item.count === 1 ? 'vez' : 'vezes'}</span>
                          {item.price && (
                            <span style={{ fontSize: '12px', color: '#64748b' }}>R$ {parseFloat(item.price).toFixed(2).replace('.', ',')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState message="Nenhuma visualização de produto encontrada no período selecionado" />
              )}
            </>
          )}
        </div>

        {/* Produtos mais adicionados ao carrinho */}
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid #dcfce7', marginTop: '24px' }}>
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: showCartAdds ? '16px' : '0',
              cursor: 'pointer'
            }}
            onClick={() => setShowCartAdds(!showCartAdds)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                Produtos Mais Adicionados ao Carrinho
              </h3>
              {cartAdds.length > 0 && (
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: '600', 
                  color: '#16a34a', 
                  backgroundColor: '#dcfce7', 
                  padding: '2px 8px', 
                  borderRadius: '12px' 
                }}>
                  {cartAdds.length} {cartAdds.length === 1 ? 'produto' : 'produtos'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {loadingCartAdds && (
                <RefreshCw size={16} className="spin" style={{ color: '#64748b' }} />
              )}
              {showCartAdds ? (
                <ChevronUp size={20} style={{ color: '#64748b' }} />
              ) : (
                <ChevronDown size={20} style={{ color: '#64748b' }} />
              )}
            </div>
          </div>
          {showCartAdds && (
            <>
              {loadingCartAdds && cartAdds.length === 0 ? (
                <EmptyState message="Carregando produtos adicionados ao carrinho..." />
              ) : cartAdds.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                    Produtos mais adicionados ao carrinho pelos usuários no período selecionado.
                  </p>
                  <div style={{ 
                    maxHeight: '500px', 
                    overflowY: 'auto', 
                    overflowX: 'hidden',
                    paddingRight: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                  className="custom-scrollbar"
                  >
                    {cartAdds.map((item, index) => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#16a34a', minWidth: '24px' }}>#{index + 1}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{item.name}</div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>ID: {item.id}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#16a34a' }}>{item.count} {item.count === 1 ? 'vez' : 'vezes'}</span>
                          {item.totalQuantity > item.count && (
                            <span style={{ fontSize: '12px', color: '#64748b' }}>{item.totalQuantity} unidades</span>
                          )}
                          {item.price && (
                            <span style={{ fontSize: '12px', color: '#64748b' }}>R$ {parseFloat(item.price).toFixed(2).replace('.', ',')}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState message="Nenhuma adição ao carrinho encontrada no período selecionado" />
              )}
            </>
          )}
        </div>
      </div>

      {/* Seção 4: Campanhas & Push */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Campanhas & Push</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
          <Card
            title="Impressões do Banner"
            value={m.bannerImpressions || 0}
            subtext="impressões"
            icon={Eye}
            color="blue"
          />
          <Card
            title="Cliques no Banner"
            value={m.bannerClicks || 0}
            subtext="cliques"
            icon={MousePointerClick}
            color="green"
          />
          <Card
            title="CTR do Banner"
            value={m.bannerCTR ? `${(m.bannerCTR * 100).toFixed(2)}%` : '0%'}
            subtext="taxa de clique"
            icon={TrendingUp}
            color="purple"
          />
          <Card
            title="Push Enviadas"
            value={m.pushSent || 0}
            subtext="notificações"
            icon={Activity}
            color="orange"
          />
          <Card
            title="Push Abertas"
            value={m.pushOpened || 0}
            subtext="notificações abertas"
            icon={CheckCircle}
            color="green"
          />
          <Card
            title="Push com Clique"
            value={m.pushClicked || 0}
            subtext="notificações clicadas"
            icon={MousePointerClick}
            color="blue"
          />
        </div>
      </div>

      {/* Seção 5: Busca & Filtros */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Busca & Filtros</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '24px' }}>
          <Card
            title="Uso da Busca"
            value={m.searchUsage || 0}
            subtext="buscas realizadas"
            icon={Search}
            color="blue"
          />
          <Card
            title="Buscas Sem Resultado"
            value={m.searchNoResults || 0}
            subtext="buscas sem resultado"
            icon={XCircle}
            color="red"
          />
          <Card
            title="Uso de Filtros"
            value={m.filterUsage || 0}
            subtext="filtros aplicados"
            icon={Filter}
            color="purple"
          />
        </div>
        
        {/* Termos mais buscados (em geral) */}
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid #dbeafe', marginBottom: '24px' }}>
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: showTopSearch ? '16px' : '0',
              cursor: 'pointer'
            }}
            onClick={() => setShowTopSearch(!showTopSearch)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                Termos Mais Buscados
              </h3>
              {topSearchTerms.length > 0 && (
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: '600', 
                  color: '#2563eb', 
                  backgroundColor: '#dbeafe', 
                  padding: '2px 8px', 
                  borderRadius: '12px' 
                }}>
                  {topSearchTerms.length} {topSearchTerms.length === 1 ? 'termo' : 'termos'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {loadingTopSearch && (
                <RefreshCw size={16} className="spin" style={{ color: '#64748b' }} />
              )}
              {showTopSearch ? (
                <ChevronUp size={20} style={{ color: '#64748b' }} />
              ) : (
                <ChevronDown size={20} style={{ color: '#64748b' }} />
              )}
            </div>
          </div>
          {showTopSearch && (
            <>
              {loadingTopSearch && topSearchTerms.length === 0 ? (
                <EmptyState message="Carregando termos mais buscados..." />
              ) : topSearchTerms.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                    Termos mais buscados pelos usuários no período selecionado.
                  </p>
                  <div style={{ 
                    maxHeight: '500px', 
                    overflowY: 'auto', 
                    overflowX: 'hidden',
                    paddingRight: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                  className="custom-scrollbar"
                  >
                    {topSearchTerms.map((item, index) => (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#2563eb', minWidth: '24px' }}>#{index + 1}</span>
                          <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{item.term}</span>
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#2563eb' }}>{item.count} {item.count === 1 ? 'vez' : 'vezes'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState message="Nenhum termo de busca encontrado no período selecionado" />
              )}
            </>
          )}
        </div>

        {/* Buscas sem resultado */}
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid #fee2e2' }}>
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: showNoResults ? '16px' : '0',
              cursor: 'pointer'
            }}
            onClick={() => setShowNoResults(!showNoResults)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                Buscas Sem Resultado
              </h3>
              {searchNoResultsTerms.length > 0 && (
                <span style={{ 
                  fontSize: '12px', 
                  fontWeight: '600', 
                  color: '#dc2626', 
                  backgroundColor: '#fee2e2', 
                  padding: '2px 8px', 
                  borderRadius: '12px' 
                }}>
                  {searchNoResultsTerms.length} {searchNoResultsTerms.length === 1 ? 'termo' : 'termos'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {loadingNoResults && (
                <RefreshCw size={16} className="spin" style={{ color: '#64748b' }} />
              )}
              {showNoResults ? (
                <ChevronUp size={20} style={{ color: '#64748b' }} />
              ) : (
                <ChevronDown size={20} style={{ color: '#64748b' }} />
              )}
            </div>
          </div>
          {showNoResults && (
            <>
              {loadingNoResults && searchNoResultsTerms.length === 0 ? (
                <EmptyState message="Carregando buscas sem resultado..." />
              ) : searchNoResultsTerms.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                    Estes são os termos que os usuários buscaram mas não encontraram resultados. Considere adicionar produtos relacionados ou melhorar a busca.
                  </p>
                  <div style={{ 
                    maxHeight: '500px', 
                    overflowY: 'auto', 
                    overflowX: 'hidden',
                    paddingRight: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}
                  className="custom-scrollbar"
                  >
                    {searchNoResultsTerms.map((item, index) => (
                      <div key={index} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#dc2626', minWidth: '24px' }}>#{index + 1}</span>
                          <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: '500' }}>{item.term}</span>
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#dc2626' }}>{item.count} {item.count === 1 ? 'vez' : 'vezes'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState message="Nenhuma busca sem resultado encontrada no período selecionado" />
              )}
            </>
          )}
        </div>
      </div>

      {/* Seção 6: Oferta Especial */}
      <div style={{ marginBottom: '32px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', marginBottom: '16px' }}>Oferta Especial</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
          <Card
            title="Impressões"
            value={m.specialOfferImpressions || 0}
            subtext="vezes exibida"
            icon={Eye}
            color="blue"
          />
          <Card
            title="Cliques"
            value={m.specialOfferClicks || 0}
            subtext="cliques no card"
            icon={MousePointerClick}
            color="green"
          />
          <Card
            title="Visualizações"
            value={m.specialOfferViews || 0}
            subtext="página do produto acessada"
            icon={Eye}
            color="purple"
          />
          <Card
            title="CTR (Clique)"
            value={m.specialOfferCTR ? `${(m.specialOfferCTR * 100).toFixed(2)}%` : '0%'}
            subtext="taxa de clique"
            icon={TrendingUp}
            color="orange"
          />
          <Card
            title="Taxa de Visualização"
            value={m.specialOfferViewRate ? `${(m.specialOfferViewRate * 100).toFixed(2)}%` : '0%'}
            subtext="cliques que viraram visualizações"
            icon={CheckCircle}
            color="green"
          />
        </div>
      </div>

    </div>
  );
};

export default MetricsPage;