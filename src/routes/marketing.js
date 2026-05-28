const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configuração de Upload
const marketingDir = path.resolve(__dirname, '../../uploads/marketing');
if (!fs.existsSync(marketingDir)) {
  fs.mkdirSync(marketingDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, marketingDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas'));
    }
  }
});

// Tabela para configurações (se não existir, cria)
const initTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_app_config (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error('Erro ao criar tabela de config:', error);
  }
};
initTable();

// --- ROTAS ---

// GET /api/marketing/splash - Obter configuração do Splash
router.get('/splash', async (req, res) => {
  try {
    console.log('\n🔵 ==========================================');
    console.log('🔵 [marketing/splash] ===== GET RECEBIDO =====');
    console.log('🔵 ==========================================');
    
    const result = await pool.query("SELECT value, updated_at FROM melhor_casas_app_config WHERE key = 'splash_promocional'");
    
    // Parsear o valor JSONB corretamente
    let config = { enabled: false, imageUrl: null };
    if (result.rows.length > 0 && result.rows[0].value) {
      console.log('📱 [marketing/splash] Valor bruto do banco:', JSON.stringify(result.rows[0].value, null, 2));
      console.log('📱 [marketing/splash] Tipo do valor:', typeof result.rows[0].value);
      console.log('📱 [marketing/splash] updated_at:', result.rows[0].updated_at);
      
      // Se o valor é uma string JSON, fazer parse
      if (typeof result.rows[0].value === 'string') {
        try {
          config = JSON.parse(result.rows[0].value);
          console.log('📱 [marketing/splash] Config parseada de string:', config);
        } catch (e) {
          console.error('❌ [marketing/splash] Erro ao fazer parse do JSON do splash:', e);
          config = { enabled: false, imageUrl: null };
        }
      } else {
        // Se já é um objeto, usar diretamente
        config = result.rows[0].value;
        console.log('📱 [marketing/splash] Config já é objeto:', config);
      }
      
      // Garantir que enabled seja boolean
      if (config.enabled !== undefined) {
        const originalEnabled = config.enabled;
        config.enabled = config.enabled === true || config.enabled === 'true' || config.enabled === 1 || config.enabled === '1' || config.enabled === 'True' || config.enabled === 'TRUE';
        if (originalEnabled !== config.enabled) {
          console.log('📱 [marketing/splash] enabled convertido de', originalEnabled, 'para', config.enabled);
        }
      }
    } else {
      console.log('📱 [marketing/splash] Nenhum registro encontrado no banco, usando padrão');
    }
    
    console.log('📱 [marketing/splash] Config final carregada do banco:', JSON.stringify(config, null, 2));
    console.log('🔵 ==========================================\n');
    
    // Verificar se a imagem existe no sistema de arquivos antes de retornar
    // IMPORTANTE: Não remover a configuração se o arquivo não existir temporariamente
    // O arquivo pode estar sendo processado ou pode ter sido movido
    if (config.imageUrl) {
      let imagePath = null;
      
      if (config.imageUrl.startsWith('/uploads')) {
        imagePath = path.resolve(__dirname, '../..', config.imageUrl);
      } else if (config.imageUrl.startsWith('http')) {
        // Se já é uma URL completa, extrair o pathname
        try {
          const urlObj = new URL(config.imageUrl);
          if (urlObj.pathname.startsWith('/uploads')) {
            imagePath = path.resolve(__dirname, '../..', urlObj.pathname);
          }
        } catch (e) {
          console.warn('⚠️ [marketing/splash] Erro ao parsear URL:', e);
        }
      }
      
      if (imagePath) {
        // Verificar se o arquivo existe
        if (!fs.existsSync(imagePath)) {
          console.warn('⚠️ [marketing/splash] Imagem não encontrada no servidor:', imagePath);
          console.warn('⚠️ [marketing/splash] Mantendo configuração mesmo sem arquivo (pode estar sendo processado)');
          // NÃO remover a configuração - apenas logar o warning
          // O arquivo pode estar sendo processado ou pode ter sido movido temporariamente
        }
        
        // Garantir URL completa para retorno (mesmo se o arquivo não existir)
        if (config.imageUrl.startsWith('/uploads')) {
          const protocol = req.get('x-forwarded-proto') || req.protocol;
          const host = req.get('host');
          config.imageUrl = `${protocol}://${host}${config.imageUrl}`;
        }
      }
    }
    
    res.json(config);
  } catch (error) {
    console.error('Erro ao buscar splash:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /api/marketing/splash - Salvar configuração do Splash
router.post('/splash', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    // FormData envia tudo como string, então precisamos verificar o valor exato
    const enabledRaw = req.body.enabled;
    let imageUrl = req.body.imageUrl; // Pode manter a URL antiga se não enviar nova

    console.log('📱 [marketing/splash] ===== POST RECEBIDO =====');
    console.log('📱 [marketing/splash] req.body completo:', JSON.stringify(req.body, null, 2));
    console.log('📱 [marketing/splash] enabled (raw):', enabledRaw, 'tipo:', typeof enabledRaw);
    console.log('📱 [marketing/splash] hasFile:', !!req.file);
    console.log('📱 [marketing/splash] imageUrlFromBody:', imageUrl);
    if (req.file) {
      console.log('📱 [marketing/splash] Arquivo recebido:', {
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
      });
    }

    // Se há um arquivo novo, usar o arquivo
    if (req.file) {
      imageUrl = `/uploads/marketing/${req.file.filename}`;
      console.log('📱 [marketing/splash] Novo arquivo recebido:', imageUrl);
      console.log('📱 [marketing/splash] Arquivo salvo em:', req.file.path);
      
      // Verificar se o arquivo realmente existe após o salvamento
      const fileExists = fs.existsSync(req.file.path);
      console.log('📱 [marketing/splash] Arquivo existe após salvamento?', fileExists);
      
      if (fileExists) {
        const stats = fs.statSync(req.file.path);
        console.log('📱 [marketing/splash] Estatísticas do arquivo:', {
          size: stats.size,
          isFile: stats.isFile(),
          created: stats.birthtime,
          modified: stats.mtime
        });
      } else {
        console.error('❌ [marketing/splash] ARQUIVO NÃO FOI SALVO! Caminho:', req.file.path);
        console.error('❌ [marketing/splash] Diretório existe?', fs.existsSync(marketingDir));
        console.error('❌ [marketing/splash] Diretório:', marketingDir);
      }
    } else {
      // Se não há arquivo novo, buscar a URL existente do banco primeiro
      const existing = await pool.query("SELECT value FROM melhor_casas_app_config WHERE key = 'splash_promocional'");
      let existingImageUrl = null;
      
      if (existing.rows.length > 0 && existing.rows[0].value) {
        const existingConfig = typeof existing.rows[0].value === 'string' 
          ? JSON.parse(existing.rows[0].value) 
          : existing.rows[0].value;
        existingImageUrl = existingConfig.imageUrl || null;
        console.log('📱 [marketing/splash] URL existente no banco:', existingImageUrl);
      }
      
      // Se há uma imageUrl fornecida no body (e não é blob), usar ela
      // Caso contrário, usar a existente do banco
      if (imageUrl && imageUrl.trim() !== '' && !imageUrl.startsWith('blob:')) {
        // Se a URL é completa (começa com http), manter a URL externa (Shopify, CDN, etc.)
        // Somente converter para pathname quando a URL apontar para /uploads do próprio servidor
        if (imageUrl.startsWith('http')) {
          try {
            const urlObj = new URL(imageUrl);
            if (urlObj.pathname && urlObj.pathname.startsWith('/uploads')) {
              // URL completa apontando para o próprio servidor uploads -> armazenar apenas o pathname
              imageUrl = urlObj.pathname;
              console.log('📱 [marketing/splash] URL do próprio servidor convertida para pathname:', imageUrl);
            } else {
              // URL externa (ex.: Shopify) - manter como está
              console.log('📱 [marketing/splash] URL externa detectada, mantendo completa:', imageUrl);
            }
          } catch (e) {
            console.warn('📱 [marketing/splash] Erro ao parsear URL completa, mantendo como está:', e);
          }
        }
        // Se a URL está vazia ou é apenas espaços, usar a existente
        if (imageUrl.trim() === '') {
          imageUrl = existingImageUrl;
        }
      } else {
        // Se não há imageUrl no body ou é blob, usar a existente do banco
        imageUrl = existingImageUrl;
      }
      
      console.log('📱 [marketing/splash] URL final a ser salva:', imageUrl);
    }

    // Garantir que enabled seja boolean
    // FormData sempre envia como string, então 'true' ou 'false'
    const enabledValue = enabledRaw === 'true' || enabledRaw === true || enabledRaw === '1' || enabledRaw === 1 || enabledRaw === 'True' || enabledRaw === 'TRUE';
    
    const config = {
      enabled: enabledValue,
      imageUrl: imageUrl || null,
      updatedAt: new Date().toISOString()
    };

    console.log('\n🟢 ==========================================');
    console.log('🟢 [marketing/splash] ===== SALVANDO CONFIG =====');
    console.log('🟢 ==========================================');
    console.log('📱 [marketing/splash] enabled recebido (raw):', enabledRaw, 'tipo:', typeof enabledRaw);
    console.log('📱 [marketing/splash] enabled processado:', enabledValue, 'tipo:', typeof enabledValue);
    console.log('📱 [marketing/splash] imageUrl final:', imageUrl);
    console.log('📱 [marketing/splash] Config completa:', JSON.stringify(config, null, 2));

    const configJson = JSON.stringify(config);
    console.log('📱 [marketing/splash] JSON a ser salvo:', configJson);
    
    const saveResult = await pool.query(`
      INSERT INTO melhor_casas_app_config (key, value, updated_at)
      VALUES ('splash_promocional', $1::jsonb, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = CURRENT_TIMESTAMP
      RETURNING value, updated_at
    `, [configJson]);
    
    console.log('\n✅ [marketing/splash] ===== CONFIG SALVA COM SUCESSO =====');
    console.log('✅ [marketing/splash] Valor retornado do banco após salvar:', JSON.stringify(saveResult.rows[0]?.value, null, 2));
    console.log('✅ [marketing/splash] updated_at:', saveResult.rows[0]?.updated_at);
    console.log('✅ ==========================================\n');

    // Retornar URL completa
    if (config.imageUrl && config.imageUrl.startsWith('/uploads')) {
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('host');
      config.imageUrl = `${protocol}://${host}${config.imageUrl}`;
    }

    res.json({ success: true, config });
  } catch (error) {
    console.error('Erro ao salvar splash:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/marketing/content-page - Obter configuração da Página de Conteúdo
router.get('/content-page', async (req, res) => {
  try {
    const result = await pool.query("SELECT value FROM melhor_casas_app_config WHERE key = 'content_page'");
    const config = result.rows[0]?.value || { 
      title: '', 
      text: '', 
      imageUrl: null, 
      buttonText: '', 
      buttonLink: '' 
    };
    
    if (config.imageUrl && config.imageUrl.startsWith('/uploads')) {
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('host');
      config.imageUrl = `${protocol}://${host}${config.imageUrl}`;
    }
    
    res.json(config);
  } catch (error) {
    console.error('Erro ao buscar content page:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Criar tabela de páginas de conteúdo (se não existir)
const initContentPagesTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS melhor_casas_content_pages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        text TEXT,
        image_url VARCHAR(500),
        button_text VARCHAR(100),
        button_link VARCHAR(500),
        fullscreen_image_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Adicionar a nova coluna se ela não existir, para não quebrar instalações existentes
    const columns = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'melhor_casas_content_pages' AND column_name = 'fullscreen_image_url'
    `);
    
    if (columns.rows.length === 0) {
      await pool.query(`
        ALTER TABLE melhor_casas_content_pages
        ADD COLUMN fullscreen_image_url VARCHAR(500)
      `);
      console.log('✅ Coluna fullscreen_image_url adicionada com sucesso.');
    }

    console.log('✅ Tabela de páginas de conteúdo inicializada');
  } catch (error) {
    console.error('Erro ao criar tabela de content pages:', error);
  }
};
initContentPagesTable();

// GET /api/marketing/content-pages - Listar todas as páginas de conteúdo
router.get('/content-pages', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, title, text, image_url, button_text, button_link, fullscreen_image_url,
             created_at, updated_at
      FROM melhor_casas_content_pages
      ORDER BY updated_at DESC
    `);
    
    const pages = result.rows.map(page => {
      const pageData = { ...page };
      const protocol = req.get('x-forwarded-proto') || req.protocol;
      const host = req.get('host');

      if (pageData.image_url && pageData.image_url.startsWith('/uploads')) {
        pageData.image_url = `${protocol}://${host}${pageData.image_url}`;
      }
      if (pageData.fullscreen_image_url && pageData.fullscreen_image_url.startsWith('/uploads')) {
        pageData.fullscreen_image_url = `${protocol}://${host}${pageData.fullscreen_image_url}`;
      }
      return pageData;
    });
    
    res.json({ success: true, pages });
  } catch (error) {
    console.error('Erro ao listar content pages:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/marketing/content-page/:id - Obter uma página de conteúdo específica
router.get('/content-page/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT id, name, title, text, image_url, button_text, button_link, fullscreen_image_url,
             created_at, updated_at
      FROM melhor_casas_content_pages
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Página de conteúdo não encontrada' });
    }
    
    const page = result.rows[0];
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');

    if (page.image_url && page.image_url.startsWith('/uploads')) {
      page.image_url = `${protocol}://${host}${page.image_url}`;
    }
    if (page.fullscreen_image_url && page.fullscreen_image_url.startsWith('/uploads')) {
      page.fullscreen_image_url = `${protocol}://${host}${page.fullscreen_image_url}`;
    }
    
    res.json({ success: true, page });
  } catch (error) {
    console.error('Erro ao buscar content page:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'fullscreenImage', maxCount: 1 }
]);

// POST /api/marketing/content-page - Criar nova página de conteúdo
router.post('/content-page', authenticateToken, uploadFields, async (req, res) => {
  try {
    const { name, title, text, buttonText, buttonLink } = req.body;
    let imageUrl = req.body.imageUrl;
    let fullscreenImageUrl = req.body.fullscreenImageUrl;

    if (req.files) {
      if (req.files.image) {
        imageUrl = `/uploads/marketing/${req.files.image[0].filename}`;
      }
      if (req.files.fullscreenImage) {
        fullscreenImageUrl = `/uploads/marketing/${req.files.fullscreenImage[0].filename}`;
      }
    }

    // Se imageUrl/fullscreenImageUrl foram fornecidas como URL completa (ex: Shopify),
    // manter a URL externa. Apenas converter para pathname quando a URL completa apontar
    // para /uploads do próprio servidor.
    const normalizeExternal = (url) => {
      if (!url) return url;
      try {
        if (url.startsWith('http')) {
          const u = new URL(url);
          if (u.pathname && u.pathname.startsWith('/uploads')) {
            return u.pathname;
          }
          return url; // URL externa
        }
        return url; // caminho relativo (/uploads/...)
      } catch (e) {
        console.warn('[marketing/content-page] Erro ao parsear URL:', e);
        return url;
      }
    };

    imageUrl = normalizeExternal(imageUrl);
    fullscreenImageUrl = normalizeExternal(fullscreenImageUrl);

    if (!name || !title) {
      return res.status(400).json({ error: 'Nome e título são obrigatórios' });
    }

    const result = await pool.query(`
      INSERT INTO melhor_casas_content_pages (name, title, text, image_url, button_text, button_link, fullscreen_image_url, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
      RETURNING id, name, title, text, image_url, button_text, button_link, fullscreen_image_url, created_at, updated_at
    `, [name, title, text || '', imageUrl || null, buttonText || '', buttonLink || '', fullscreenImageUrl || null]);

    const page = result.rows[0];
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    
    if (page.image_url && page.image_url.startsWith('/uploads')) {
      page.image_url = `${protocol}://${host}${page.image_url}`;
    }
    if (page.fullscreen_image_url && page.fullscreen_image_url.startsWith('/uploads')) {
      page.fullscreen_image_url = `${protocol}://${host}${page.fullscreen_image_url}`;
    }

    res.json({ success: true, page });
  } catch (error) {
    console.error('Erro ao criar content page:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /api/marketing/content-page/:id - Atualizar página de conteúdo
router.put('/content-page/:id', authenticateToken, uploadFields, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, title, text, buttonText, buttonLink } = req.body;
    let imageUrl = req.body.imageUrl;
    let fullscreenImageUrl = req.body.fullscreenImageUrl;

    if (req.files) {
      if (req.files.image) {
        imageUrl = `/uploads/marketing/${req.files.image[0].filename}`;
      }
      if (req.files.fullscreenImage) {
        fullscreenImageUrl = `/uploads/marketing/${req.files.fullscreenImage[0].filename}`;
      }
    }

    // Se não enviou nova imagem, manter a atual
    if (!req.files || (!req.files.image && !req.files.fullscreenImage)) {
      const current = await pool.query('SELECT image_url, fullscreen_image_url FROM melhor_casas_content_pages WHERE id = $1', [id]);
      if (current.rows.length > 0) {
        if (!req.body.imageUrl) {
          imageUrl = current.rows[0].image_url;
        }
        if (!req.body.fullscreenImageUrl) {
          fullscreenImageUrl = current.rows[0].fullscreen_image_url;
        }
      }
    } else {
        const current = await pool.query('SELECT image_url, fullscreen_image_url FROM melhor_casas_content_pages WHERE id = $1', [id]);
        if (current.rows.length > 0) {
            if (!req.files.image) {
                imageUrl = req.body.imageUrl || current.rows[0].image_url;
            }
            if (!req.files.fullscreenImage) {
                fullscreenImageUrl = req.body.fullscreenImageUrl || current.rows[0].fullscreen_image_url;
            }
        }
    }

    // Normalizar URLs externas como no POST: manter URLs completas (Shopify/CDN),
    // converter apenas URLs completas que apontem para /uploads do próprio servidor.
    const normalizeExternalPut = (url) => {
      if (!url) return url;
      try {
        if (url.startsWith('http')) {
          const u = new URL(url);
          if (u.pathname && u.pathname.startsWith('/uploads')) {
            return u.pathname;
          }
          return url;
        }
        return url;
      } catch (e) {
        console.warn('[marketing/content-page PUT] Erro ao parsear URL:', e);
        return url;
      }
    };

    imageUrl = normalizeExternalPut(imageUrl);
    fullscreenImageUrl = normalizeExternalPut(fullscreenImageUrl);


    const result = await pool.query(`
      UPDATE melhor_casas_content_pages
      SET name = $1, title = $2, text = $3, image_url = $4, button_text = $5, button_link = $6, fullscreen_image_url = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING id, name, title, text, image_url, button_text, button_link, fullscreen_image_url, created_at, updated_at
    `, [name, title, text || '', imageUrl || null, buttonText || '', buttonLink || '', fullscreenImageUrl || null, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Página de conteúdo não encontrada' });
    }

    const page = result.rows[0];
    const protocol = req.get('x-forwarded-proto') || req.protocol;
    const host = req.get('host');
    
    if (page.image_url && page.image_url.startsWith('/uploads')) {
      page.image_url = `${protocol}://${host}${page.image_url}`;
    }
    if (page.fullscreen_image_url && page.fullscreen_image_url.startsWith('/uploads')) {
      page.fullscreen_image_url = `${protocol}://${host}${page.fullscreen_image_url}`;
    }

    res.json({ success: true, page });
  } catch (error) {
    console.error('Erro ao atualizar content page:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /api/marketing/content-page/:id - Deletar página de conteúdo
router.delete('/content-page/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM melhor_casas_content_pages WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Página de conteúdo não encontrada' });
    }

    res.json({ success: true, message: 'Página de conteúdo deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar content page:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /api/marketing/content-page - Obter configuração padrão da Página de Conteúdo (compatibilidade)
// NOTA: Esta rota deve vir DEPOIS de /content-page/:id para evitar conflito de rotas
// Movida para o final do arquivo para manter compatibilidade com código antigo

// GET /api/marketing/splash/debug - Endpoint de debug para verificar o que está no banco
// Versão sem autenticação para facilitar debug (remover em produção se necessário)
router.get('/splash/debug', async (req, res) => {
  try {
    console.log('\n🔍 ==========================================');
    console.log('🔍 [marketing/splash/debug] ===== DEBUG =====');
    console.log('🔍 ==========================================');
    
    const result = await pool.query("SELECT key, value, updated_at FROM melhor_casas_app_config WHERE key = 'splash_promocional'");
    
    const debugInfo = {
      found: result.rows.length > 0,
      rowCount: result.rows.length,
      rawValue: result.rows.length > 0 ? result.rows[0].value : null,
      valueType: result.rows.length > 0 ? typeof result.rows[0].value : null,
      updatedAt: result.rows.length > 0 ? result.rows[0].updated_at : null,
      parsedValue: null
    };
    
    if (result.rows.length > 0 && result.rows[0].value) {
      if (typeof result.rows[0].value === 'string') {
        try {
          debugInfo.parsedValue = JSON.parse(result.rows[0].value);
        } catch (e) {
          debugInfo.parseError = e.message;
        }
      } else {
        debugInfo.parsedValue = result.rows[0].value;
      }
    }
    
    console.log('🔍 [marketing/splash/debug] Debug info:', JSON.stringify(debugInfo, null, 2));
    console.log('🔍 ==========================================\n');
    
    res.json({ success: true, debug: debugInfo });
  } catch (error) {
    console.error('❌ [marketing/splash/debug] Erro:', error);
    res.status(500).json({ error: 'Erro interno', details: error.message });
  }
});

module.exports = router;
