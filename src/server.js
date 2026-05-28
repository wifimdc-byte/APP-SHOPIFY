const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Carregar debug primeiro para capturar todos os erros
const debugRoutes = require('./routes/debug');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const userRoutes = require('./routes/users');
const orderRoutes = require('./routes/orders');
const shopifyRoutes = require('./routes/shopify');
const cartRoutes = require('./routes/cart');
const homeConfigRoutes = require('./routes/homeConfig');
const analyticsRoutes = require('./routes/analytics');
const notificationsRoutes = require('./routes/notifications');
const appIconRoutes = require('./routes/appIcon');
const downloadsRoutes = require('./routes/downloads');
const splashScreenRoutes = require('./routes/splashScreen');
const profilePhotoRoutes = require('./routes/profilePhoto');
const marketingRoutes = require('./routes/marketing');
const hoursRoutes = require('./routes/hours');
const weddingListsRoutes = require('./routes/weddingLists');
const couponRoutes = require('./routes/coupon');
const autoSyncService = require('./services/autoSyncService');
const newProductsSyncService = require('./services/newProductsSyncService');
const ratingsSyncService = require('./services/ratingsSyncService');
const bulkSyncService = require('./services/bulkSyncService');
const orderNotificationScheduler = require('./services/orderNotificationScheduler');
const pool = require('./database/connection');

// Migração automática: adicionar colunas barcode e sku se não existirem
async function runMigrations() {
  try {
    console.log('🔄 Verificando migrações pendentes...');
    
    // Verificar se coluna barcode existe
    const checkBarcode = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_products' AND column_name = 'barcode'
    `);
    
    if (checkBarcode.rows.length === 0) {
      await pool.query(`ALTER TABLE melhor_casas_products ADD COLUMN barcode VARCHAR(100)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_barcode ON melhor_casas_products(barcode)`);
      console.log('✅ Coluna barcode adicionada!');
    }
    
    // Verificar se coluna sku existe
    const checkSku = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_products' AND column_name = 'sku'
    `);
    
    if (checkSku.rows.length === 0) {
      await pool.query(`ALTER TABLE melhor_casas_products ADD COLUMN sku VARCHAR(100)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_products_sku ON melhor_casas_products(sku)`);
      console.log('✅ Coluna sku adicionada!');
    }
    
    // Verificar se tabela de cupons diários existe
    const checkCouponsTable = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'melhor_casas_daily_coupons'
    `);
    
    if (checkCouponsTable.rows.length === 0) {
      console.log('🔄 Criando tabela melhor_casas_daily_coupons...');
      await pool.query(`
        CREATE TABLE melhor_casas_daily_coupons (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES melhor_casas_users(id) ON DELETE CASCADE,
          date DATE NOT NULL,
          used BOOLEAN DEFAULT false,
          used_at TIMESTAMP,
          discount_value DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id, date)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_daily_coupons_user_date 
        ON melhor_casas_daily_coupons(user_id, date)
      `);
      console.log('✅ Tabela melhor_casas_daily_coupons criada!');
    }
    
    // Verificar se tabela de configuração de cupons existe
    const checkCouponConfigTable = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'melhor_casas_coupon_config'
    `);
    
    if (checkCouponConfigTable.rows.length === 0) {
      console.log('🔄 Criando tabela melhor_casas_coupon_config...');
      await pool.query(`
        CREATE TABLE melhor_casas_coupon_config (
          id SERIAL PRIMARY KEY,
          fab_enabled BOOLEAN DEFAULT true,
          fab_icon_url VARCHAR(500),
          how_to_step1 TEXT DEFAULT 'Vá até a loja mais próxima',
          how_to_step2 TEXT DEFAULT 'Mostre essa tela para o caixa na hora da compra',
          how_to_step3 TEXT DEFAULT 'Ganhe 10% de desconto 🎉',
          coupon_title VARCHAR(100) DEFAULT 'CUPOM DIÁRIO',
          coupon_discount_text VARCHAR(50) DEFAULT '10% OFF',
          coupon_bottom_text VARCHAR(200) DEFAULT 'Mostre para o caixa',
          coupon_bottom_subtext VARCHAR(200) DEFAULT 'Válido apenas hoje',
          note_text VARCHAR(500) DEFAULT 'Limite de 1 uso por dia • Desconto máximo de R$ 20',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Inserir registro padrão
      await pool.query(`
        INSERT INTO melhor_casas_coupon_config (
          fab_enabled, 
          how_to_step1, 
          how_to_step2, 
          how_to_step3,
          coupon_title,
          coupon_discount_text,
          coupon_bottom_text,
          coupon_bottom_subtext,
          note_text
        ) VALUES (
          true,
          'Vá até a loja mais próxima',
          'Mostre essa tela para o caixa na hora da compra',
          'Ganhe 10% de desconto 🎉',
          'CUPOM DIÁRIO',
          '10% OFF',
          'Mostre para o caixa',
          'Válido apenas hoje',
          'Limite de 1 uso por dia • Desconto máximo de R$ 20'
        )
      `);
      console.log('✅ Tabela melhor_casas_coupon_config criada!');
    }
    
    // Verificar se tabela app_store_installs existe e tem constraint correta
    const checkAppStoreInstallsTable = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'app_store_installs'
    `);
    
    if (checkAppStoreInstallsTable.rows.length === 0) {
      console.log('🔄 Criando tabela app_store_installs...');
      await pool.query(`
        CREATE TABLE app_store_installs (
          id serial PRIMARY KEY,
          store varchar NOT NULL,
          report_date date NOT NULL,
          country varchar,
          installs integer,
          raw jsonb,
          created_at timestamptz DEFAULT now(),
          CONSTRAINT uk_store_date_country UNIQUE (store, report_date, country)
        )
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_app_store_installs_store_date 
        ON app_store_installs (store, report_date)
      `);
      console.log('✅ Tabela app_store_installs criada!');
    } else {
      // Verificar se a constraint existe
      const checkConstraint = await pool.query(`
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'app_store_installs' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name = 'uk_store_date_country'
      `);
      
      if (checkConstraint.rows.length === 0) {
        console.log('🔄 Adicionando constraint UNIQUE à tabela app_store_installs...');
        try {
          await pool.query(`
            ALTER TABLE app_store_installs 
            ADD CONSTRAINT uk_store_date_country UNIQUE (store, report_date, country)
          `);
          console.log('✅ Constraint uk_store_date_country adicionada!');
        } catch (constraintError) {
          // Se der erro (pode ser por duplicatas), tentar criar sem constraint primeiro
          console.log('⚠️ Erro ao adicionar constraint (pode haver duplicatas):', constraintError.message);
          console.log('💡 Execute o script cleanup-duplicates.js para limpar duplicatas antes de adicionar a constraint');
        }
      }
    }
    
    console.log('✅ Migrações verificadas!');
  } catch (error) {
    console.error('⚠️ Erro nas migrações (não fatal):', error.message);
  }
}

// Executar migrações
runMigrations();

const app = express();

// Configurar trust proxy para funcionar corretamente com express-rate-limit em produção (Render, etc)
// Isso é necessário quando há um proxy reverso (como Render) que define X-Forwarded-For
app.set('trust proxy', true);
const PORT = process.env.PORT || 3001;

// Middleware de compressão (reduz tamanho das respostas em até 70%)
app.use(compression());

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // Desativar CSP estrito para permitir imagens inline/externas se necessário
}));
app.use(cors({
  origin: '*', // Permitir todas as origens em desenvolvimento
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Rate limiting - prevenir sobrecarga do servidor
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 300, // máximo 300 requisições por IP por minuto (aumentado para suportar filtros rápidos)
  message: 'Muitas requisições deste IP, tente novamente em alguns instantes.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Pular rate limit para health checks e rotas específicas se necessário
    return req.path === '/api/health' || req.path === '/';
  },
});

// Rate limiting mais restritivo para rotas de autenticação
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 tentativas de login por IP a cada 15 minutos
  // Responder sempre em JSON para evitar erros de parse no app
  message: {
    error: 'Muitas tentativas de login, tente novamente em 15 minutos.',
  },
  skipSuccessfulRequests: true,
});

// Aplicar rate limiting global
app.use('/api/', limiter);

// ==========================================
// ACTIVE USERS TRACKING (In-Memory)
// ==========================================
// Map para armazenar usuários ativos: IP/ID -> Timestamp
global.activeUsers = new Map();

// Limpar usuários inativos periodicamente (a cada 1 minuto)
setInterval(() => {
  try {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    let removedCount = 0;
    
    for (const [key, lastActive] of global.activeUsers.entries()) {
      if (lastActive < fiveMinutesAgo) {
        global.activeUsers.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`[ActiveUsers] Removidos ${removedCount} usuários inativos. Restantes: ${global.activeUsers.size}`);
    }
  } catch (err) {
    console.error('Erro ao limpar usuários inativos:', err);
  }
}, 60 * 1000); // Executar a cada 1 minuto

// Middleware para rastrear atividade
app.use((req, res, next) => {
  try {
    const now = Date.now();
    // Tenta pegar ID do usuário se decodificado (após auth middleware, mas aqui roda antes globalmente)
    // Então usamos IP como identificador base, ou header se disponível
    const identifier = req.headers['x-user-id'] || req.ip || 'unknown';
    
    // Ignorar requests de health check, static files e dashboard/admin
    const isDashboardRequest = req.path.includes('/api/') && (
      req.path.includes('/analytics/live') || 
      req.path.includes('/analytics/events') ||
      req.path.includes('/products/mark-unavailable') ||
      req.path.includes('/notifications/send') ||
      req.path.includes('/notifications/tokens')
    );
    
    if (!req.path.includes('/health') && 
        !req.path.includes('/uploads') && 
        !isDashboardRequest) {
        global.activeUsers.set(identifier, now);
    }
  } catch (err) {
    console.error('Erro no tracking de usuários ativos:', err);
  }
  next();
});

// Middleware de logging personalizado para capturar erros e requisições
app.use((req, res, next) => {
  // Log de todas as requisições
  console.log('📥 [SERVER] Nova requisição:', {
    method: req.method,
    path: req.path,
    url: req.url,
    ip: req.ip || req.connection.remoteAddress,
    headers: {
      authorization: req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : 'não fornecido',
      'content-type': req.headers['content-type']
    }
  });
  
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data) {
    if (res.statusCode >= 400) {
      console.error('❌ [SERVER] Erro HTTP:', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        body: req.body,
        query: req.query,
        params: req.params,
        responseData: typeof data === 'string' ? data.substring(0, 500) : data
      });
    } else {
      console.log('✅ [SERVER] Resposta enviada:', {
        method: req.method,
        path: req.path,
        status: res.statusCode
      });
    }
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    if (res.statusCode >= 400) {
      console.error('❌ [SERVER] Erro HTTP JSON:', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        body: req.body,
        query: req.query,
        params: req.params,
        response: data
      });
    } else {
      console.log('✅ [SERVER] Resposta JSON enviada:', {
        method: req.method,
        path: req.path,
        status: res.statusCode
      });
    }
    return originalJson.call(this, data);
  };
  
  // Capturar erros não tratados
  const originalStatus = res.status;
  res.status = function(code) {
    if (code >= 500) {
      console.error('❌ [SERVER] Erro 5xx detectado:', {
        method: req.method,
        path: req.path,
        status: code,
        stack: new Error().stack
      });
    }
    return originalStatus.call(this, code);
  };
  
  next();
});

app.use(morgan('combined'));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
// Servir arquivos estáticos de uploads
const uploadsPath = path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    // Garantir que imagens sejam servidas com o Content-Type correto
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    }
    // Headers CORS para permitir acesso de qualquer origem
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano
  }
}));

// Handler específico para requisições HEAD em uploads (alguns clientes precisam disso)
app.head('/uploads/*', (req, res) => {
  try {
    // Remover /uploads do início do path
    const relativePath = req.path.replace(/^\/uploads\//, '');
    const filePath = path.join(uploadsPath, relativePath);
    
    console.log('📥 [HEAD] Verificando arquivo:', {
      originalPath: req.path,
      relativePath: relativePath,
      fullPath: filePath,
      exists: fs.existsSync(filePath)
    });
    
    if (fs.existsSync(filePath)) {
      // Verificar se é um arquivo (não diretório)
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        // Definir headers apropriados
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.png') {
          res.setHeader('Content-Type', 'image/png');
        } else if (ext === '.jpg' || ext === '.jpeg') {
          res.setHeader('Content-Type', 'image/jpeg');
        } else if (ext === '.gif') {
          res.setHeader('Content-Type', 'image/gif');
        }
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).end();
      } else {
        res.status(404).end();
      }
    } else {
      console.warn('⚠️ [HEAD] Arquivo não encontrado:', filePath);
      res.status(404).end();
    }
  } catch (error) {
    console.error('❌ [HEAD] Erro ao verificar arquivo:', error);
    res.status(500).end();
  }
});

console.log('📁 Servindo arquivos estáticos de:', uploadsPath);

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);

// Debug: Log todas as rotas registradas (apenas em desenvolvimento)
if (process.env.NODE_ENV === 'development') {
  console.log('📋 Rotas de produtos registradas:');
  productRoutes.stack.forEach((r) => {
    if (r.route) {
      console.log(`   ${Object.keys(r.route.methods).join(', ').toUpperCase()} ${r.route.path}`);
    }
  });
}
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/shopify', shopifyRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/debug', debugRoutes);
app.use('/api/home-config', homeConfigRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/app-icon', appIconRoutes);
app.use('/api/downloads', downloadsRoutes);
app.use('/api/splash-screen', splashScreenRoutes);
app.use('/api/users/profile/photo', profilePhotoRoutes);
app.use('/api/marketing', marketingRoutes);
app.use('/api/hours', hoursRoutes);
app.use('/api/wedding-lists', weddingListsRoutes);
app.use('/api/coupon', couponRoutes);

// Garantir que a coluna foto_url existe na tabela melhor_casas_users
(async () => {
  try {
    console.log('🔄 Verificando se coluna foto_url existe na tabela melhor_casas_users...');
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'melhor_casas_users' 
      AND column_name = 'foto_url'
    `);
    
    if (columnCheck.rows.length === 0) {
      console.log('📝 Coluna foto_url não existe, criando...');
      await pool.query(`
        ALTER TABLE melhor_casas_users 
        ADD COLUMN foto_url VARCHAR(500) NULL
      `);
      console.log('✅ Coluna foto_url criada com sucesso!');
    } else {
      console.log('✅ Coluna foto_url já existe na tabela melhor_casas_users');
    }

    // Verificar se foto_url é TEXT para suportar Base64
    try {
      const typeCheck = await pool.query(`
        SELECT data_type 
        FROM information_schema.columns 
        WHERE table_name = 'melhor_casas_users' AND column_name = 'foto_url'
      `);
      
      if (typeCheck.rows.length > 0 && typeCheck.rows[0].data_type !== 'text') {
        console.log('🔄 Alterando coluna foto_url para TEXT...');
        await pool.query('ALTER TABLE melhor_casas_users ALTER COLUMN foto_url TYPE TEXT');
        console.log('✅ Coluna foto_url alterada para TEXT com sucesso!');
      } else {
        console.log('✅ Coluna foto_url já é TEXT ou compatível');
      }
    } catch (error) {
      console.error('❌ Erro ao verificar/alterar coluna foto_url:', error.message);
    }

    // Verificar shopify_customer_token
    const tokenCheck = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'melhor_casas_users'
      AND column_name = 'shopify_customer_token'
    `);

    if (tokenCheck.rows.length === 0) {
      console.log('📝 Colunas shopify_customer_token não existem, criando...');
      await pool.query(`
        ALTER TABLE melhor_casas_users
        ADD COLUMN shopify_customer_token TEXT NULL,
        ADD COLUMN shopify_customer_token_expires TIMESTAMP NULL
      `);
      console.log('✅ Colunas shopify_customer_token criadas com sucesso!');
    } else {
      console.log('✅ Colunas shopify_customer_token já existem');
    }
  } catch (error) {
    console.error('❌ Erro ao verificar/criar colunas:', error);
    // Não bloquear o servidor se houver erro, apenas logar
  }
})();

// Health check (raiz - para Render e outros serviços)
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Melhor das Casas API is running' });
});

app.head('/', (req, res) => {
  res.status(200).end();
});

// Health check (endpoint específico)
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Melhor das Casas API is running' });
});

// API root
app.get('/api', (req, res) => {
  res.json({ 
    message: 'Melhor das Casas API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      products: '/api/products',
      users: '/api/users',
      orders: '/api/orders',
      shopify: '/api/shopify',
      cart: '/api/cart',
      debug: '/api/debug/logs'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Erro na rota:', req.method, req.path);
  console.error('❌ Mensagem:', err.message);
  console.error('❌ Stack:', err.stack);
  console.error('❌ Body:', req.body);
  console.error('❌ Query:', req.query);
  console.error('❌ Params:', req.params);
  
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.error('❌ Rota não encontrada:', req.method, req.originalUrl);
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';
  
  // Encontrar o primeiro IP IPv4 não loopback
  for (const interfaceName in networkInterfaces) {
    const addresses = networkInterfaces[interfaceName];
    for (const addr of addresses) {
      if (addr.family === 'IPv4' && !addr.internal && addr.address.startsWith('192.168.')) {
        localIP = addr.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }
  
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 API available at http://localhost:${PORT}/api`);
  console.log(`🌐 Network API available at http://${localIP}:${PORT}/api`);
  
  // Iniciar sincronização automática de produtos
  // Só inicia se AUTO_SYNC_ENABLED não estiver definido como 'false'
  if (process.env.AUTO_SYNC_ENABLED !== 'false') {
    autoSyncService.start();
  } else {
    console.log('⚠️ [AutoSync] Sincronização automática desabilitada (AUTO_SYNC_ENABLED=false)');
  }
  
  // Iniciar sincronização de novos produtos apenas (a cada 30 minutos)
  // Só inicia se NEW_PRODUCTS_SYNC_ENABLED não estiver definido como 'false'
  if (process.env.NEW_PRODUCTS_SYNC_ENABLED !== 'false') {
    newProductsSyncService.start();
  } else {
    console.log('⚠️ [NewProductsSync] Sincronização de novos produtos desabilitada (NEW_PRODUCTS_SYNC_ENABLED=false)');
  }
  
  // Iniciar sincronização automática de ratings (a cada 6 horas por padrão)
  // Só inicia se RATINGS_SYNC_ENABLED não estiver definido como 'false'
  if (process.env.RATINGS_SYNC_ENABLED !== 'false') {
    ratingsSyncService.start();
  } else {
    console.log('⚠️ [RatingsSync] Sincronização de ratings desabilitada (RATINGS_SYNC_ENABLED=false)');
  }
  
  // Iniciar sincronização bulk completa (a cada 3 horas por padrão)
  // Sincroniza TODOS os produtos da loja usando bulk operations
  // Só inicia se BULK_SYNC_ENABLED não estiver definido como 'false'
  if (process.env.BULK_SYNC_ENABLED !== 'false') {
    bulkSyncService.start();
  } else {
    console.log('⚠️ [BulkSync] Sincronização bulk desabilitada (BULK_SYNC_ENABLED=false)');
  }
  
  // Iniciar scheduler de notificações automáticas de pedidos (a cada 5 minutos por padrão)
  // Só inicia se ORDER_NOTIFICATION_ENABLED não estiver definido como 'false'
  /*
  if (process.env.ORDER_NOTIFICATION_ENABLED !== 'false') {
    orderNotificationScheduler.start();
  } else {
    console.log('⚠️ [OrderNotificationScheduler] Notificações automáticas de pedidos desabilitadas (ORDER_NOTIFICATION_ENABLED=false)');
  }
  */
  console.log('⚠️ [OrderNotificationScheduler] Scheduler desativado permanentemente em favor de Webhooks.');
});

