const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');


const router = express.Router();
const shopifyService = require('../services/shopifyService');

// ==========================================
// ADMIN: Pesquisa de Clientes
// ==========================================

// Pesquisar clientes (admin only)
router.get('/admin/search', authenticateAdmin, async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    console.log('🔍 [admin/search] Pesquisando clientes:', { q, page, limit });
    
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Digite pelo menos 2 caracteres para pesquisar' });
    }

    const searchTerm = `%${q.trim().toLowerCase()}%`;
    const searchTermNumbers = q.replace(/\D/g, ''); // Apenas números para CPF/telefone
    const hasNumbers = searchTermNumbers.length >= 3; // Só busca por número se tiver pelo menos 3 dígitos
    
    console.log('🔍 [admin/search] Termos:', { searchTerm, searchTermNumbers, hasNumbers });
    
    let result, countResult;
    
    if (hasNumbers) {
      // Pesquisa inclui números - buscar também por telefone e CPF
      const numbersPattern = `%${searchTermNumbers}%`;
      
      result = await pool.query(
        `SELECT DISTINCT
          u.id, 
          u.nome, 
          u.email, 
          COALESCE(u.telefone, (SELECT telefone FROM melhor_casas_user_addresses WHERE user_id = u.id AND telefone IS NOT NULL LIMIT 1)) as telefone,
          u.cpf_cnpj,
          u.tipo_documento,
          u.created_at
        FROM melhor_casas_users u
        WHERE 
          LOWER(u.nome) LIKE $1 OR 
          LOWER(u.email) LIKE $1 OR 
          REPLACE(REPLACE(COALESCE(u.telefone, ''), '-', ''), ' ', '') LIKE $2 OR
          u.cpf_cnpj LIKE $2 OR
          EXISTS (SELECT 1 FROM melhor_casas_user_addresses a WHERE a.user_id = u.id AND REPLACE(REPLACE(COALESCE(a.telefone, ''), '-', ''), ' ', '') LIKE $2)
        ORDER BY u.created_at DESC
        LIMIT $3 OFFSET $4`,
        [searchTerm, numbersPattern, parseInt(limit), parseInt(offset)]
      );
      
      countResult = await pool.query(
        `SELECT COUNT(DISTINCT u.id) FROM melhor_casas_users u
         WHERE 
          LOWER(u.nome) LIKE $1 OR 
          LOWER(u.email) LIKE $1 OR 
          REPLACE(REPLACE(COALESCE(u.telefone, ''), '-', ''), ' ', '') LIKE $2 OR
          u.cpf_cnpj LIKE $2 OR
          EXISTS (SELECT 1 FROM melhor_casas_user_addresses a WHERE a.user_id = u.id AND REPLACE(REPLACE(COALESCE(a.telefone, ''), '-', ''), ' ', '') LIKE $2)`,
        [searchTerm, numbersPattern]
      );
    } else {
      // Pesquisa só por texto - buscar apenas por nome e email
      result = await pool.query(
        `SELECT DISTINCT
          u.id, 
          u.nome, 
          u.email, 
          COALESCE(u.telefone, (SELECT telefone FROM melhor_casas_user_addresses WHERE user_id = u.id AND telefone IS NOT NULL LIMIT 1)) as telefone,
          u.cpf_cnpj,
          u.tipo_documento,
          u.created_at
        FROM melhor_casas_users u
        WHERE 
          LOWER(u.nome) LIKE $1 OR 
          LOWER(u.email) LIKE $1
        ORDER BY u.created_at DESC
        LIMIT $2 OFFSET $3`,
        [searchTerm, parseInt(limit), parseInt(offset)]
      );
      
      countResult = await pool.query(
        `SELECT COUNT(*) FROM melhor_casas_users u
         WHERE 
          LOWER(u.nome) LIKE $1 OR 
          LOWER(u.email) LIKE $1`,
        [searchTerm]
      );
    }
    
    const total = parseInt(countResult.rows[0].count);
    
    console.log(`✅ [admin/search] Encontrados ${result.rows.length} de ${total} clientes`);
    
    res.json({
      customers: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('❌ [admin/search] Erro:', error);
    res.status(500).json({ error: 'Erro ao pesquisar clientes' });
  }
});

router.get(
  '/admin/export',
  authenticateAdmin,
  async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT DISTINCT
          u.id, 
          u.nome, 
          u.email, 
          COALESCE(
            u.telefone,
            (
              SELECT telefone
              FROM melhor_casas_user_addresses
              WHERE user_id = u.id
                AND telefone IS NOT NULL
              LIMIT 1
            )
          ) AS telefone,
          u.cpf_cnpj,
          u.tipo_documento,
          u.created_at
        FROM melhor_casas_users u
        ORDER BY u.created_at DESC
      `);

      const customers = result.rows;

      if (!customers.length) {
        return res.status(404).json({ message: 'Nenhum cliente encontrado' });
      }

      const headers = Object.keys(customers[0]);

      const csv = [
        headers.join(';'),
        ...customers.map(c =>
          headers.map(h =>
            `"${String(c[h] ?? '').replace(/"/g, '""')}"`
          ).join(';')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=clientes.csv'
      );

      res.send(csv);
    } catch (error) {
      console.error('❌ [admin/export] Erro:', error);
      res.status(500).json({ error: 'Erro ao exportar clientes' });
    }
  }
);

// Buscar detalhes de um cliente específico (admin only)
router.get('/admin/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('🔍 [admin/customer] Buscando cliente:', id);
    
    // Buscar dados do cliente
    const userResult = await pool.query(
      `SELECT 
        id, nome, email, telefone, cpf_cnpj, tipo_documento,
        created_at, foto_url
      FROM melhor_casas_users WHERE id = $1`,
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }
    
    const customer = userResult.rows[0];
    
    // Buscar endereços
    let addresses = [];
    try {
      const addressesResult = await pool.query(
        `SELECT * FROM melhor_casas_user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
        [id]
      );
      addresses = addressesResult.rows;
      
      // Se cliente não tem telefone, pegar do primeiro endereço que tiver
      if (!customer.telefone && addresses.length > 0) {
        const addrWithPhone = addresses.find(a => a.telefone);
        if (addrWithPhone) {
          customer.telefone = addrWithPhone.telefone;
          console.log('📞 [admin/customer] Telefone obtido do endereço:', customer.telefone);
        }
      }
    } catch (addrError) {
      console.warn('⚠️ [admin/customer] Erro ao buscar endereços:', addrError.message);
    }
    
    // Buscar pedidos do banco local pelo email do cliente
    let orders = [];
    if (customer.email) {
      try {
        const ordersResult = await pool.query(
          `SELECT * FROM melhor_casas_orders WHERE customer_email = $1 ORDER BY created_at DESC LIMIT 10`,
          [customer.email]
        );
        orders = ordersResult.rows;
      } catch (ordersError) {
        console.warn('⚠️ [admin/customer] Erro ao buscar pedidos:', ordersError.message);
      }
    }
    
    console.log(`✅ [admin/customer] Cliente encontrado:`, customer.nome, '| Tel:', customer.telefone || 'sem telefone');
    
    res.json({
      customer,
      addresses,
      orders
    });
  } catch (error) {
    console.error('❌ [admin/customer] Erro:', error);
    res.status(500).json({ error: 'Erro ao buscar cliente' });
  }
});

// Perfil do usuário
router.get('/profile', authenticateToken, async (req, res) => {
  console.log('📥 [users/profile] Requisição recebida');
  
  try {
    const userId = req.user?.id || req.user?.userId;
    
    if (!userId) {
      console.error('❌ [users/profile] ID não encontrado');
      return res.status(500).json({ error: 'ID do usuário não encontrado' });
    }

    console.log('🔍 [users/profile] Buscando perfil para userId:', userId);
    
    // Buscar usuário e token shopify
    const result = await pool.query(
      'SELECT id, cpf_cnpj, nome, email, telefone, tipo_documento, COALESCE(foto_url, NULL) as foto_url, created_at, shopify_customer_id, shopify_customer_token FROM melhor_casas_users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      console.error('❌ [users/profile] Usuário não encontrado no banco');
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = result.rows[0];
    
    // Buscar tags no Shopify se tiver shopify_customer_id
    if (user.shopify_customer_id) {
      try {
        // Tentar obter token para usar a Storefront API primeiro (mais rápido/cacheado talvez)
        // Ou usar Admin API se tivermos ID
        const tags = await shopifyService.getCustomerTags(user.shopify_customer_id);
        if (tags) {
           user.tags = tags.split(',').map(t => t.trim());
        } else {
           user.tags = [];
        }
        console.log('✅ [users/profile] Tags carregadas:', user.tags);
      } catch (tagError) {
        console.error('❌ [users/profile] Erro ao buscar tags do Shopify:', tagError.message);
        user.tags = [];
      }
    } else {
      user.tags = [];
    }
    
    // Remover campos sensíveis ou internos da resposta
    delete user.shopify_customer_token;
    
    // Construir URL completa da foto se existir
    if (user.foto_url) {
      if (user.foto_url.startsWith('http://') || user.foto_url.startsWith('https://')) {
        // ok
      } else if (user.foto_url.startsWith('/uploads')) {
        const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
        const host = req.get('host') || req.get('x-forwarded-host') || 'app-shopify-hayo.onrender.com';
        const baseUrl = `${protocol}://${host}`;
        user.foto_url = baseUrl + user.foto_url;
      }
    }

    res.json({ user });
  } catch (error) {
    console.error('❌ [users/profile] Erro ao buscar perfil:', error);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Atualizar perfil
router.put('/profile', authenticateToken, [
  body('nome').optional().isLength({ min: 2 }).withMessage('Nome deve ter pelo menos 2 caracteres'),
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('telefone').optional().isMobilePhone('pt-BR').withMessage('Telefone inválido'),
  body('cpf_cnpj').optional().custom((value) => {
    if (!value) return true;
    const clean = value.replace(/\D/g, '');
    return clean.length === 11 || clean.length === 14;
  }).withMessage('CPF/CNPJ inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { nome, email, telefone, cpf_cnpj } = req.body;

    // Verificar se email já existe em outro usuário
    if (email) {
      const existingUser = await pool.query(
        'SELECT id FROM melhor_casas_users WHERE email = $1 AND id != $2',
        [email, userId]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email já está em uso por outro usuário' });
      }
    }

    // Construir query dinamicamente
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (nome !== undefined) {
      paramCount++;
      updates.push(`nome = $${paramCount}`);
      values.push(nome);
    }

    if (email !== undefined) {
      paramCount++;
      updates.push(`email = $${paramCount}`);
      values.push(email);
    }

    if (telefone !== undefined) {
      paramCount++;
      updates.push(`telefone = $${paramCount}`);
      values.push(telefone);
    }

    if (cpf_cnpj !== undefined) {
      // Verificar se CPF/CNPJ já existe em outro usuário
      const cleanCpfCnpj = cpf_cnpj.replace(/\D/g, '');
      const existingUser = await pool.query(
        'SELECT id FROM melhor_casas_users WHERE cpf_cnpj = $1 AND id != $2',
        [cleanCpfCnpj, userId]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'CPF/CNPJ já está em uso por outro usuário' });
      }

      // Determinar tipo de documento
      const tipoDocumento = cleanCpfCnpj.length === 11 ? 'CPF' : 'CNPJ';
      
      paramCount++;
      updates.push(`cpf_cnpj = $${paramCount}`);
      values.push(cleanCpfCnpj);
      
      paramCount++;
      updates.push(`tipo_documento = $${paramCount}`);
      values.push(tipoDocumento);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    paramCount++;
    values.push(userId);

    const query = `UPDATE melhor_casas_users SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING id, cpf_cnpj, nome, email, telefone, tipo_documento, foto_url`;
    const result = await pool.query(query, values);

    const updatedUser = result.rows[0];
    
    // Construir URL completa da foto se existir
    if (updatedUser.foto_url) {
      // Se já é uma URL completa (começa com http), usar como está
      if (updatedUser.foto_url.startsWith('http://') || updatedUser.foto_url.startsWith('https://')) {
        console.log('✅ [users/profile PUT] foto_url já é URL completa:', updatedUser.foto_url);
      } else if (updatedUser.foto_url.startsWith('/uploads')) {
        // Construir URL completa usando headers corretos
        const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
        const host = req.get('host') || req.get('x-forwarded-host') || 'app-shopify-hayo.onrender.com';
        const baseUrl = `${protocol}://${host}`;
        updatedUser.foto_url = baseUrl + updatedUser.foto_url;
        console.log('✅ [users/profile PUT] foto_url construída:', {
          original: updatedUser.foto_url,
          protocol,
          host,
          final: updatedUser.foto_url
        });
      }
    }

    res.json({ 
      message: 'Perfil atualizado com sucesso',
      user: updatedUser
    });
  } catch (error) {
    console.error('Erro ao atualizar perfil:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Favoritar produto
router.post('/favorites/:productId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    // Verificar se produto existe
    const productResult = await pool.query(
      'SELECT id FROM melhor_casas_products WHERE id = $1',
      [productId]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Verificar se já está favoritado
    const existingFavorite = await pool.query(
      'SELECT id FROM melhor_casas_user_favorites WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (existingFavorite.rows.length > 0) {
      return res.status(400).json({ error: 'Produto já está nos favoritos' });
    }

    // Adicionar aos favoritos
    await pool.query(
      'INSERT INTO melhor_casas_user_favorites (user_id, product_id) VALUES ($1, $2)',
      [userId, productId]
    );

    res.json({ message: 'Produto adicionado aos favoritos' });
  } catch (error) {
    console.error('Erro ao favoritar produto:', error);
    console.error('Detalhes do erro:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    });
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Remover dos favoritos
router.delete('/favorites/:productId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const result = await pool.query(
      'DELETE FROM melhor_casas_user_favorites WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Produto não encontrado nos favoritos' });
    }

    res.json({ message: 'Produto removido dos favoritos' });
  } catch (error) {
    console.error('Erro ao remover dos favoritos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar favoritos
router.get('/favorites', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT p.id, p.codigo, p.nome, p.descricao, p.preco_varejo, p.preco_atacado, 
              p.quantidade_minima_atacado, p.categoria, p.estoque, p.imagem_url,
              uf.created_at as favorited_at
       FROM melhor_casas_user_favorites uf
       JOIN melhor_casas_products p ON uf.product_id = p.id
       WHERE uf.user_id = $1
       ORDER BY uf.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit), parseInt(offset)]
    );

    // Contar total
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM melhor_casas_user_favorites WHERE user_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0].count);

    res.json({
      favorites: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Erro ao listar favoritos:', error);
    console.error('Detalhes do erro:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      position: error.position
    });
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Verificar se produto está favoritado
router.get('/favorites/:productId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { productId } = req.params;

    const result = await pool.query(
      'SELECT id FROM melhor_casas_user_favorites WHERE user_id = $1 AND product_id = $2',
      [userId, productId]
    );

    res.json({ isFavorite: result.rows.length > 0 });
  } catch (error) {
    console.error('Erro ao verificar favorito:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Endereços do usuário
// Listar endereços (com sincronização bidirecional com Shopify)
router.get('/addresses', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('🔍 [addresses GET] Listando endereços para usuário:', userId);
    
    // ✅ OTIMIZAÇÃO: Buscar endereços do banco PRIMEIRO (rápido)
    // Retornar imediatamente e sincronizar com Shopify em background
    const addressesResult = await pool.query(
      `SELECT id, nome, telefone, cep, endereco, numero, complemento, bairro, cidade, estado, 
              is_default, shopify_address_id, created_at, updated_at
       FROM melhor_casas_user_addresses 
       WHERE user_id = $1 
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );
    
    const addresses = addressesResult.rows.map(row => ({
      id: row.id,
      nome: row.nome,
      telefone: row.telefone,
      cep: row.cep,
      endereco: row.endereco,
      numero: row.numero,
      complemento: row.complemento,
      bairro: row.bairro,
      cidade: row.cidade,
      estado: row.estado,
      is_default: row.is_default || false,
      shopify_address_id: row.shopify_address_id,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
    
    // ✅ OTIMIZAÇÃO: Retornar endereços do banco imediatamente
    // Sincronização com Shopify acontece em background sem bloquear resposta
    console.log(`✅ [addresses GET] Retornando ${addresses.length} endereços do banco IMEDIATAMENTE (sincronização em background)`);
    res.json({ addresses });
    
    // ✅ OTIMIZAÇÃO: Sincronizar com Shopify em background (não bloqueia resposta)
    // Isso permite que o app carregue rápido mesmo quando precisa sincronizar
    // IMPORTANTE: A resposta já foi enviada acima, este código roda em background
    setImmediate(async () => {
      try {
        const userResult = await pool.query(
          'SELECT shopify_customer_token, shopify_customer_token_expires FROM melhor_casas_users WHERE id = $1',
          [userId]
        );
        
        if (userResult.rows.length > 0 && userResult.rows[0].shopify_customer_token) {
          const user = userResult.rows[0];
          const tokenExpired = user.shopify_customer_token_expires && 
                              new Date(user.shopify_customer_token_expires) <= new Date();
          
          if (!tokenExpired) {
            try {
              console.log('🔄 [addresses GET] Sincronizando endereços com Shopify em background...');
              
              // ✅ OTIMIZAÇÃO: Usar função leve que só busca endereços (sem pedidos)
              // Isso evita processar 50 pedidos desnecessariamente
              const customer = await shopifyService.getCustomerAddressesOnly(user.shopify_customer_token);
            
              if (customer && customer.addresses && customer.addresses.length > 0) {
                console.log(`✅ [addresses GET] Encontrados ${customer.addresses.length} endereços na Shopify`);
                
                // Para cada endereço da Shopify, verificar se existe no banco
                for (const shopifyAddr of customer.addresses) {
                  // Extrair ID sem query string
                  let rawId = shopifyAddr.id || '';
                  const shopifyAddressId = rawId.split('?')[0];
                  
                  console.log('🔍 [addresses GET] Processando endereço da Shopify:', {
                    id: shopifyAddressId,
                    firstName: shopifyAddr.firstName,
                    lastName: shopifyAddr.lastName,
                    city: shopifyAddr.city,
                    province: shopifyAddr.province,
                    address1: shopifyAddr.address1
                  });
                  
                  // Verificar se já existe no banco
                  const existingResult = await pool.query(
                    'SELECT id FROM melhor_casas_user_addresses WHERE user_id = $1 AND shopify_address_id = $2',
                    [userId, shopifyAddressId]
                  );
                  
                  // Formatar endereço da Shopify para formato do banco
                  // Tentar separar número do endereço (pode vir junto no address1)
                  let endereco = shopifyAddr.address1 || '';
                  let numero = '';
                  
                  // Se address1 contém vírgula, pode ter número separado
                  const addressParts = (shopifyAddr.address1 || '').split(',');
                  if (addressParts.length > 1) {
                    endereco = addressParts[0]?.trim() || '';
                    numero = addressParts.slice(1).join(',').trim();
                  } else {
                    // Tentar extrair número do final do endereço (padrão brasileiro: "Rua, 123")
                    const match = endereco.match(/,?\s*(\d+.*)$/);
                    if (match) {
                      endereco = endereco.substring(0, match.index).trim();
                      numero = match[1].trim();
                    }
                  }
                  
                  const nome = `${shopifyAddr.firstName || ''} ${shopifyAddr.lastName || ''}`.trim() || 'Nome não informado';
                  
                  if (existingResult.rows.length === 0) {
                    // Não existe no banco, criar
                    console.log('➕ [addresses GET] Criando endereço da Shopify no banco:', {
                      shopifyId: shopifyAddressId,
                      nome: nome,
                      cidade: shopifyAddr.city
                    });
                    
                    // Mapear estado para código de 2 letras
                    const stateMap = {
                      'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
                      'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES',
                      'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
                      'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR',
                      'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
                      'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC',
                      'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO'
                    };
                    
                    let estadoFinal = '';
                    const province = (shopifyAddr.province || '').trim();
                    console.log('🔍 [addresses GET] Province recebido da Shopify:', province);
                    
                    if (province.length === 2) {
                      estadoFinal = province.toUpperCase();
                    } else if (province.length > 2) {
                      // Tentar mapear nome completo para código
                      estadoFinal = stateMap[province] || province.substring(0, 2).toUpperCase();
                    }
                    
                    // Garantir que estadoFinal tenha exatamente 2 caracteres ou seja vazio
                    if (estadoFinal.length > 2) {
                      console.warn('⚠️ [addresses GET] EstadoFinal maior que 2 caracteres, truncando:', estadoFinal);
                      estadoFinal = estadoFinal.substring(0, 2);
                    }
                    
                    console.log('✅ [addresses GET] EstadoFinal final:', estadoFinal, '(tamanho:', estadoFinal.length, ')');
                    
                    await pool.query(
                      `INSERT INTO melhor_casas_user_addresses 
                       (user_id, nome, telefone, cep, endereco, numero, complemento, bairro, cidade, estado, shopify_address_id)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                       RETURNING id`,
                      [
                        userId,
                        nome,
                        shopifyAddr.phone || null,
                        shopifyAddr.zip || '',
                        endereco,
                        numero,
                        shopifyAddr.address2 || null,
                        '', // bairro não vem da Shopify diretamente
                        shopifyAddr.city || '',
                        estadoFinal || null, // Usar null se vazio para evitar erro
                        shopifyAddressId
                      ]
                    );
                  } else {
                    // Existe, atualizar dados
                    console.log('🔄 [addresses GET] Atualizando endereço existente da Shopify:', {
                      id: existingResult.rows[0].id,
                      shopifyId: shopifyAddressId
                    });
                    
                    // Mapear estado para código de 2 letras
                    const stateMap = {
                      'Acre': 'AC', 'Alagoas': 'AL', 'Amapá': 'AP', 'Amazonas': 'AM',
                      'Bahia': 'BA', 'Ceará': 'CE', 'Distrito Federal': 'DF', 'Espírito Santo': 'ES',
                      'Goiás': 'GO', 'Maranhão': 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
                      'Minas Gerais': 'MG', 'Pará': 'PA', 'Paraíba': 'PB', 'Paraná': 'PR',
                      'Pernambuco': 'PE', 'Piauí': 'PI', 'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN',
                      'Rio Grande do Sul': 'RS', 'Rondônia': 'RO', 'Roraima': 'RR', 'Santa Catarina': 'SC',
                      'São Paulo': 'SP', 'Sergipe': 'SE', 'Tocantins': 'TO'
                    };
                    
                    let estadoFinal = '';
                    const province = (shopifyAddr.province || '').trim();
                    
                    if (province.length === 2) {
                      estadoFinal = province.toUpperCase();
                    } else if (province.length > 2) {
                      estadoFinal = stateMap[province] || province.substring(0, 2).toUpperCase();
                    }
                    
                    // Garantir que estadoFinal tenha exatamente 2 caracteres ou seja vazio
                    if (estadoFinal.length > 2) {
                      estadoFinal = estadoFinal.substring(0, 2);
                    }
                    
                    await pool.query(
                      `UPDATE melhor_casas_user_addresses 
                       SET nome = $1, telefone = $2, cep = $3, endereco = $4, numero = $5, 
                           complemento = $6, cidade = $7, estado = $8, updated_at = CURRENT_TIMESTAMP
                       WHERE user_id = $9 AND shopify_address_id = $10`,
                      [
                        nome,
                        shopifyAddr.phone || null,
                        shopifyAddr.zip || '',
                        endereco,
                        numero,
                        shopifyAddr.address2 || null,
                        shopifyAddr.city || '',
                        estadoFinal || null,
                        userId,
                        shopifyAddressId
                      ]
                    );
                  }
                }
                
                console.log('✅ [addresses GET] Sincronização concluída em background');
              } else {
                console.log('ℹ️ [addresses GET] Nenhum endereço encontrado na Shopify');
              }
            } catch (syncError) {
              console.error('⚠️ [addresses GET] Erro ao sincronizar com Shopify em background:', syncError.message);
              // Erro em background não afeta a resposta já enviada
            }
          } else {
            console.log('⚠️ [addresses GET] Customer token expirado, pulando sincronização');
          }
        } else {
          console.log('⚠️ [addresses GET] Usuário não tem customer token');
        }
      } catch (bgError) {
        console.error('⚠️ [addresses GET] Erro no processamento em background:', bgError.message);
      }
    }); // Fim do setImmediate (background)
  } catch (error) {
    console.error('❌ [addresses GET] Erro ao listar endereços:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar endereço
router.post('/addresses', authenticateToken, async (req, res) => {
  try {
    console.log('📝 POST /addresses chamado');
    const userId = req.user.id;
    const { nome, telefone, cpf, cep, endereco, numero, complemento, bairro, cidade, estado, is_default } = req.body;
    console.log('📝 Dados recebidos:', { nome, endereco, numero, cidade, estado, cep, cpf });

    if (!nome || !endereco || !numero || !cidade || !estado || !cep) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, endereco, numero, cidade, estado, cep' });
    }

    // Se for definir como padrão, remover padrão dos outros
    if (is_default) {
      await pool.query(
        'UPDATE melhor_casas_user_addresses SET is_default = false WHERE user_id = $1',
        [userId]
      );
    }

    // Verificar se a coluna CPF existe, se não, adicionar
    try {
      await pool.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name = 'melhor_casas_user_addresses' AND column_name = 'cpf') THEN
            ALTER TABLE melhor_casas_user_addresses ADD COLUMN cpf VARCHAR(20);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name = 'melhor_casas_user_addresses' AND column_name = 'shopify_address_id') THEN
            ALTER TABLE melhor_casas_user_addresses ADD COLUMN shopify_address_id VARCHAR(500);
          ELSE
            -- Se já existe, aumentar tamanho se for menor que 500
            IF EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'melhor_casas_user_addresses' 
                       AND column_name = 'shopify_address_id' 
                       AND character_maximum_length < 500) THEN
              ALTER TABLE melhor_casas_user_addresses ALTER COLUMN shopify_address_id TYPE VARCHAR(500);
            END IF;
          END IF;
        END $$;
      `);
    } catch (error) {
      console.log('⚠️ Erro ao verificar/adicionar colunas (pode já existir):', error.message);
    }

    // Buscar dados do usuário para sincronização e CPF
    let cpfToUse = cpf || null;
    let shopifyAddressId = null;
    
    console.log('🔍 [addresses] Buscando dados do usuário para sincronização...');
    const userResult = await pool.query(
      'SELECT cpf_cnpj, shopify_customer_token, shopify_customer_token_expires FROM melhor_casas_users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      console.log('✅ [addresses] Usuário encontrado:', {
        hasCpf: !!user.cpf_cnpj,
        hasToken: !!user.shopify_customer_token,
        tokenExpires: user.shopify_customer_token_expires
      });
      
      // Se CPF não foi fornecido, buscar do usuário
      if (!cpfToUse && user.cpf_cnpj) {
        const userCpf = user.cpf_cnpj;
        if (!userCpf.startsWith('TEMP-')) {
          cpfToUse = userCpf;
          console.log('✅ [addresses] CPF do usuário preenchido automaticamente:', cpfToUse);
        }
      }
      
      // Sincronizar com Shopify se tiver customerAccessToken válido
      if (user.shopify_customer_token) {
        // Verificar se token não expirou
        const tokenExpired = user.shopify_customer_token_expires && 
                            new Date(user.shopify_customer_token_expires) <= new Date();
        
        if (tokenExpired) {
          console.warn('⚠️ [addresses] Customer token expirado. Token expira em:', user.shopify_customer_token_expires);
        } else {
          console.log('🔄 [addresses] Tentando sincronizar endereço com Shopify...');
          try {
            const shopifyAddress = await shopifyService.createCustomerAddress(
              user.shopify_customer_token,
              { nome, telefone, cpf: cpfToUse, cep, endereco, numero, complemento, bairro, cidade, estado }
            );
            
            // Extrair apenas o ID sem query string (remover ? e tudo depois)
            let rawId = shopifyAddress?.id || null;
            if (rawId) {
              // Separar o ID da query string se houver
              shopifyAddressId = rawId.split('?')[0];
              console.log('✅ [addresses] Endereço sincronizado com Shopify com sucesso! ID:', shopifyAddressId);
            } else {
              console.warn('⚠️ [addresses] Shopify retornou endereço mas sem ID');
            }
          } catch (shopifyError) {
            console.error('❌ [addresses] Erro ao sincronizar endereço com Shopify:', shopifyError.message);
            console.error('❌ [addresses] Stack:', shopifyError.stack);
            if (shopifyError.response?.data) {
              console.error('❌ [addresses] Resposta da API:', JSON.stringify(shopifyError.response.data, null, 2));
            }
            // Continuar mesmo se falhar a sincronização
          }
        }
      } else {
        console.log('ℹ️ [addresses] Usuário não tem shopify_customer_token. Endereço será salvo apenas no banco local.');
      }
    } else {
      console.warn('⚠️ [addresses] Usuário não encontrado no banco!');
    }

    // Salvar endereço no banco (com ou sem shopify_address_id)
    const result = await pool.query(
      `INSERT INTO melhor_casas_user_addresses 
       (user_id, nome, telefone, cpf, cep, endereco, numero, complemento, bairro, cidade, estado, is_default, shopify_address_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [userId, nome, telefone || null, cpfToUse, cep, endereco, numero, complemento || null, bairro, cidade, estado, is_default || false, shopifyAddressId]
    );

    console.log('✅ [addresses] Endereço salvo no banco:', {
      id: result.rows[0].id,
      shopifyId: result.rows[0].shopify_address_id || 'não sincronizado'
    });

    res.status(201).json({ address: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar endereço:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Atualizar endereço
router.put('/addresses/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { nome, telefone, cpf, cep, endereco, numero, complemento, bairro, cidade, estado, is_default } = req.body;

    console.log('✏️ [addresses PUT] Atualizando endereço:', { id, userId });

    // Verificar se o endereço pertence ao usuário e buscar shopify_address_id
    const checkResult = await pool.query(
      'SELECT id, shopify_address_id FROM melhor_casas_user_addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      console.warn('⚠️ [addresses PUT] Endereço não encontrado');
      return res.status(404).json({ error: 'Endereço não encontrado' });
    }

    const existingAddress = checkResult.rows[0];
    console.log('✅ [addresses PUT] Endereço encontrado:', {
      id: existingAddress.id,
      shopifyId: existingAddress.shopify_address_id || 'não tem'
    });

    // Se for definir como padrão, remover padrão dos outros
    if (is_default) {
      await pool.query(
        'UPDATE melhor_casas_user_addresses SET is_default = false WHERE user_id = $1 AND id != $2',
        [userId, id]
      );
    }

    // Verificar se a coluna CPF existe, se não, adicionar
    try {
      await pool.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                         WHERE table_name = 'melhor_casas_user_addresses' AND column_name = 'cpf') THEN
            ALTER TABLE melhor_casas_user_addresses ADD COLUMN cpf VARCHAR(20);
          END IF;
        END $$;
      `);
    } catch (error) {
      console.log('⚠️ Erro ao verificar/adicionar coluna CPF (pode já existir):', error.message);
    }

    // Se CPF não foi fornecido, buscar do usuário
    let cpfToUse = cpf || null;
    let shopifyAddressId = existingAddress?.shopify_address_id || null;
    
    // Buscar dados do usuário para sincronização
    const userResult = await pool.query(
      'SELECT cpf_cnpj, shopify_customer_token FROM melhor_casas_users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length > 0) {
      if (userResult.rows[0].cpf_cnpj && !cpfToUse) {
        const userCpf = userResult.rows[0].cpf_cnpj;
        if (!userCpf.startsWith('TEMP-')) {
          cpfToUse = userCpf;
          console.log('✅ CPF do usuário preenchido automaticamente na edição:', cpfToUse);
        }
      }
      
      // Sincronizar com Shopify se tiver customerAccessToken
      if (userResult.rows[0].shopify_customer_token) {
        if (shopifyAddressId) {
          // Buscar endereços atuais da Shopify para encontrar o ID correto
          try {
            console.log('🔍 [addresses PUT] Buscando endereços atuais da Shopify para encontrar ID correto...');
            const customer = await shopifyService.getCustomer(userResult.rows[0].shopify_customer_token);
            
            if (customer && customer.addresses && customer.addresses.length > 0) {
              // Procurar endereço correspondente pelos dados
              const matchingAddress = customer.addresses.find(addr => {
                const addrIdClean = addr.id?.split('?')[0];
                // Comparar pelo ID salvo OU pelos dados principais
                return addrIdClean === shopifyAddressId ||
                       (addr.zip === (cep || '').replace(/\D/g, '') && 
                        addr.city === cidade &&
                        (addr.address1 || '').includes(endereco));
              });
              
              if (matchingAddress) {
                // Usar o ID completo retornado pela Shopify (com query string se tiver)
                const correctId = matchingAddress.id || '';
                console.log('✅ [addresses PUT] Endereço correspondente encontrado na Shopify. ID completo:', correctId);
                
                // Atualizar endereço existente na Shopify com ID completo
                const shopifyAddress = await shopifyService.updateCustomerAddress(
                  userResult.rows[0].shopify_customer_token,
                  correctId,
                  { nome, telefone, cpf: cpfToUse, cep, endereco, numero, complemento, bairro, cidade, estado }
                );
                // Atualizar ID se mudou (limpar query string ao salvar no banco)
                if (shopifyAddress?.id) {
                  shopifyAddressId = shopifyAddress.id.split('?')[0];
                }
                console.log('✅ [addresses] Endereço atualizado na Shopify');
              } else {
                console.warn('⚠️ [addresses PUT] Endereço não encontrado na Shopify, tentando criar novo...');
                // Criar novo se não encontrou correspondente
                const shopifyAddress = await shopifyService.createCustomerAddress(
                  userResult.rows[0].shopify_customer_token,
                  { nome, telefone, cpf: cpfToUse, cep, endereco, numero, complemento, bairro, cidade, estado }
                );
                if (shopifyAddress?.id) {
                  shopifyAddressId = shopifyAddress.id.split('?')[0];
                }
              }
            } else {
              console.warn('⚠️ [addresses PUT] Nenhum endereço encontrado na Shopify');
            }
          } catch (shopifyError) {
            console.error('⚠️ [addresses] Erro ao atualizar endereço na Shopify:', shopifyError.message);
          }
        } else {
          // Criar novo endereço na Shopify
          try {
            const shopifyAddress = await shopifyService.createCustomerAddress(
              userResult.rows[0].shopify_customer_token,
              { nome, telefone, cpf: cpfToUse, cep, endereco, numero, complemento, bairro, cidade, estado }
            );
            // Extrair apenas o ID sem query string
            if (shopifyAddress?.id) {
              shopifyAddressId = shopifyAddress.id.split('?')[0];
            }
            console.log('✅ [addresses] Endereço criado na Shopify:', shopifyAddressId);
          } catch (shopifyError) {
            console.error('⚠️ [addresses] Erro ao criar endereço na Shopify:', shopifyError.message);
          }
        }
      }
    }

    const result = await pool.query(
      `UPDATE melhor_casas_user_addresses 
       SET nome = $1, telefone = $2, cpf = $3, cep = $4, endereco = $5, numero = $6, 
           complemento = $7, bairro = $8, cidade = $9, estado = $10, is_default = $11,
           shopify_address_id = $12, updated_at = CURRENT_TIMESTAMP
       WHERE id = $13 AND user_id = $14
       RETURNING *`,
      [nome, telefone || null, cpfToUse, cep, endereco, numero, complemento || null, bairro, cidade, estado, is_default || false, shopifyAddressId, id, userId]
    );

    res.json({ address: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar endereço:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Deletar endereço
router.delete('/addresses/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    console.log('🗑️ [addresses DELETE] Deletando endereço:', { id, userId });

    // Buscar endereço antes de deletar para sincronizar com Shopify
    const addressResult = await pool.query(
      'SELECT shopify_address_id FROM melhor_casas_user_addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (addressResult.rows.length === 0) {
      console.warn('⚠️ [addresses DELETE] Endereço não encontrado');
      return res.status(404).json({ error: 'Endereço não encontrado' });
    }

    let shopifyAddressId = addressResult.rows[0].shopify_address_id;
    console.log('🔍 [addresses DELETE] shopify_address_id original:', shopifyAddressId || 'não tem');

    // Limpar ID se tiver query string
    if (shopifyAddressId && shopifyAddressId.includes('?')) {
      shopifyAddressId = shopifyAddressId.split('?')[0];
      console.log('🔧 [addresses DELETE] ID limpo (removida query string):', shopifyAddressId);
    }

    // Deletar na Shopify se tiver ID
    if (shopifyAddressId) {
      try {
        // Buscar dados do endereço antes de deletar para fazer match
        const addressDataResult = await pool.query(
          'SELECT cep, cidade, endereco FROM melhor_casas_user_addresses WHERE id = $1 AND user_id = $2',
          [id, userId]
        );
        
        const userResult = await pool.query(
          'SELECT shopify_customer_token, shopify_customer_token_expires FROM melhor_casas_users WHERE id = $1',
          [userId]
        );
        
        if (userResult.rows.length > 0) {
          const user = userResult.rows[0];
          
          // Verificar se token não expirou
          const tokenExpired = user.shopify_customer_token_expires && 
                              new Date(user.shopify_customer_token_expires) <= new Date();
          
          if (user.shopify_customer_token && !tokenExpired) {
            // Buscar endereços atuais da Shopify para encontrar o ID correto
            try {
              console.log('🔍 [addresses DELETE] Buscando endereços atuais da Shopify para encontrar ID correto...');
              const customer = await shopifyService.getCustomer(user.shopify_customer_token);
              
              if (customer && customer.addresses && customer.addresses.length > 0) {
                const addressData = addressDataResult.rows[0];
                const cepClean = (addressData?.cep || '').replace(/\D/g, '');
                
                // Procurar endereço correspondente pelos dados ou ID
                const matchingAddress = customer.addresses.find(addr => {
                  const addrIdClean = addr.id?.split('?')[0];
                  return addrIdClean === shopifyAddressId ||
                         (addr.zip === cepClean && 
                          addr.city === addressData?.cidade &&
                          (addr.address1 || '').includes(addressData?.endereco || ''));
                });
                
                if (matchingAddress) {
                  // Usar o ID completo retornado pela Shopify (com query string se tiver)
                  const correctId = matchingAddress.id || '';
                  console.log('✅ [addresses DELETE] Endereço correspondente encontrado na Shopify. ID completo:', correctId);
                  
                  // Deletar usando ID completo (a função deleteCustomerAddress vai limpar se necessário)
                  const deletedId = await shopifyService.deleteCustomerAddress(
                    user.shopify_customer_token,
                    correctId
                  );
                  if (deletedId) {
                    console.log('✅ [addresses DELETE] Endereço deletado na Shopify com sucesso');
                  } else {
                    console.warn('⚠️ [addresses DELETE] Endereço não encontrado na Shopify (pode já ter sido deletado)');
                  }
                } else {
                  console.warn('⚠️ [addresses DELETE] Endereço não encontrado na lista da Shopify (pode já ter sido deletado)');
                }
              } else {
                console.warn('⚠️ [addresses DELETE] Nenhum endereço encontrado na Shopify');
              }
            } catch (deleteError) {
              // Se o erro for RESOURCE_NOT_FOUND, apenas logar e continuar
              if (deleteError.message.includes('invalid id') || deleteError.message.includes('RESOURCE_NOT_FOUND')) {
                console.warn('⚠️ [addresses DELETE] Endereço não existe mais na Shopify, continuando deleção do banco');
              } else {
                throw deleteError;
              }
            }
          } else {
            console.warn('⚠️ [addresses DELETE] Token expirado ou não encontrado, pulando deleção na Shopify');
          }
        } else {
          console.warn('⚠️ [addresses DELETE] Usuário não encontrado');
        }
      } catch (shopifyError) {
        console.error('❌ [addresses DELETE] Erro ao deletar endereço na Shopify:', shopifyError.message);
        console.error('❌ [addresses DELETE] Stack:', shopifyError.stack);
        if (shopifyError.response?.data) {
          console.error('❌ [addresses DELETE] Resposta da API:', JSON.stringify(shopifyError.response.data, null, 2));
        }
        // Continuar mesmo se falhar a sincronização - deletar do banco local mesmo assim
      }
    } else {
      console.log('ℹ️ [addresses DELETE] Endereço não tem shopify_address_id, deletando apenas do banco local');
    }

    // Deletar do banco local
    const result = await pool.query(
      'DELETE FROM melhor_casas_user_addresses WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    
    console.log('✅ [addresses DELETE] Endereço deletado do banco:', {
      id: result.rows[0]?.id,
      shopifyId: result.rows[0]?.shopify_address_id || 'não tinha'
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Endereço não encontrado' });
    }

    res.json({ message: 'Endereço excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir endereço:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Definir endereço como padrão
router.post('/addresses/:id/set-default', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Verificar se o endereço pertence ao usuário
    const checkResult = await pool.query(
      'SELECT id FROM melhor_casas_user_addresses WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Endereço não encontrado' });
    }

    // Remover padrão de todos os endereços do usuário
    await pool.query(
      'UPDATE melhor_casas_user_addresses SET is_default = false WHERE user_id = $1',
      [userId]
    );

    // Definir este como padrão
    const result = await pool.query(
      'UPDATE melhor_casas_user_addresses SET is_default = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    res.json({ address: result.rows[0] });
  } catch (error) {
    console.error('Erro ao definir endereço padrão:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar último endereço usado
router.get('/addresses/last-used', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Buscar o endereço padrão ou o mais recente
    const result = await pool.query(
      `SELECT * FROM melhor_casas_user_addresses 
       WHERE user_id = $1 
       ORDER BY is_default DESC, updated_at DESC, created_at DESC 
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum endereço encontrado' });
    }

    res.json({ address: result.rows[0] });
  } catch (error) {
    console.error('Erro ao buscar último endereço:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Salvar endereço usado no checkout
router.post('/addresses/checkout', authenticateToken, [
  body('endereco').notEmpty().withMessage('Endereço é obrigatório'),
  body('numero').notEmpty().withMessage('Número é obrigatório'),
  body('cidade').notEmpty().withMessage('Cidade é obrigatória'),
  body('estado').notEmpty().withMessage('Estado é obrigatório'),
  body('cep').notEmpty().withMessage('CEP é obrigatório')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const { endereco, numero, complemento, bairro, cidade, estado, cep } = req.body;

    // Verificar se já existe um endereço igual
    const existingResult = await pool.query(
      `SELECT id FROM melhor_casas_user_addresses 
       WHERE user_id = $1 AND endereco = $2 AND numero = $3 
       AND (complemento = $4 OR (complemento IS NULL AND $4 IS NULL))`,
      [userId, endereco, numero, complemento || null]
    );

    if (existingResult.rows.length > 0) {
      // Atualizar o existente
      await pool.query(
        `UPDATE melhor_casas_user_addresses 
         SET bairro = $1, cidade = $2, estado = $3, cep = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [bairro || '', cidade, estado, cep, existingResult.rows[0].id]
      );
      return res.json({ 
        success: true, 
        message: 'Endereço atualizado',
        address: { id: existingResult.rows[0].id, ...req.body }
      });
    } else {
      // Criar novo endereço
      const result = await pool.query(
        `INSERT INTO melhor_casas_user_addresses 
         (user_id, nome_completo, telefone, cep, endereco, numero, complemento, bairro, cidade, estado, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
         RETURNING *`,
        [userId, '', '', cep, endereco, numero, complemento || null, bairro || '', cidade, estado]
      );

      return res.json({ 
        success: true, 
        message: 'Endereço salvo',
        address: result.rows[0]
      });
    }
  } catch (error) {
    console.error('Erro ao salvar endereço do checkout:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ==========================================
// STOREFRONT API - Customer Orders
// ==========================================

// Buscar pedidos do cliente via Storefront API
router.get('/orders', authenticateToken, async (req, res) => {
  const requestId = Date.now();
  console.log(`📦 [users/orders:${requestId}] ========== INÍCIO ==========`);
  
  try {
    const userId = req.user?.id;
    
    console.log(`📦 [users/orders:${requestId}] Buscando pedidos do cliente via Storefront API...`);
    console.log(`📦 [users/orders:${requestId}] User ID:`, userId);
    console.log(`📦 [users/orders:${requestId}] req.user completo:`, req.user);
    
    if (!userId) {
      console.error(`❌ [users/orders:${requestId}] User ID não encontrado em req.user`);
      return res.status(400).json({ error: 'User ID não encontrado' });
    }
    
    // Buscar customerAccessToken do banco
    console.log(`📦 [users/orders:${requestId}] Buscando token do usuário no banco...`);
    let userResult;
    try {
      userResult = await pool.query(
        'SELECT shopify_customer_token, shopify_customer_token_expires FROM melhor_casas_users WHERE id = $1',
        [userId]
      );
      console.log(`📦 [users/orders:${requestId}] Resultado da query:`, userResult.rows.length > 0 ? 'Usuário encontrado' : 'Usuário não encontrado');
    } catch (dbError) {
      console.error(`❌ [users/orders:${requestId}] Erro na query do banco:`, dbError);
      console.error(`❌ [users/orders:${requestId}] Erro detalhado:`, {
        message: dbError.message,
        code: dbError.code,
        stack: dbError.stack
      });
      throw dbError;
    }

    if (userResult.rows.length === 0) {
      console.log(`❌ [users/orders:${requestId}] Usuário não encontrado no banco`);
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];
    console.log(`📦 [users/orders:${requestId}] Token existe?`, !!user.shopify_customer_token);
    console.log(`📦 [users/orders:${requestId}] Token expira em:`, user.shopify_customer_token_expires);
    
    if (!user.shopify_customer_token) {
      console.log('❌ [users/orders] Customer Access Token não encontrado');
      return res.status(400).json({ 
        error: 'Customer Access Token não encontrado. Faça login novamente.' 
      });
    }

    // Verificar se token expirou
    if (user.shopify_customer_token_expires) {
      const expiresAt = new Date(user.shopify_customer_token_expires);
      const now = new Date();
      console.log('📦 [users/orders] Verificando expiração:', {
        expiresAt: expiresAt.toISOString(),
        now: now.toISOString(),
        expired: expiresAt < now
      });
      if (expiresAt < now) {
        console.log('❌ [users/orders] Token expirado');
        return res.status(401).json({ 
          error: 'Customer Access Token expirado. Faça login novamente.' 
        });
      }
    }

    // Buscar pedidos via Storefront API
    console.log('📦 [users/orders] Chamando shopifyService.getCustomer...');
    console.log('📦 [users/orders] Token (primeiros 20 chars):', user.shopify_customer_token.substring(0, 20) + '...');
    
    let customer;
    try {
      customer = await shopifyService.getCustomer(user.shopify_customer_token);
      console.log('📦 [users/orders] getCustomer retornou:', customer ? 'Cliente encontrado' : 'null');
    } catch (getCustomerError) {
      console.error('❌ [users/orders] Erro em getCustomer:', getCustomerError);
      console.error('❌ [users/orders] Erro message:', getCustomerError.message);
      console.error('❌ [users/orders] Erro response:', getCustomerError.response?.data);
      console.error('❌ [users/orders] Erro status:', getCustomerError.response?.status);
      throw getCustomerError;
    }

    if (!customer) {
      console.log('⚠️ [users/orders] Cliente não encontrado no Shopify');
      return res.status(404).json({ error: 'Cliente não encontrado no Shopify' });
    }

    console.log(`✅ [users/orders] Cliente encontrado. Total de pedidos: ${customer.orders?.length || 0}`);
    console.log('📦 [users/orders] Estrutura do customer:', {
      hasId: !!customer.id,
      hasEmail: !!customer.email,
      hasOrders: !!customer.orders,
      ordersType: Array.isArray(customer.orders) ? 'array' : typeof customer.orders,
      ordersLength: customer.orders?.length
    });

    console.log('📦 [users/orders] Verificando status de "pronto para retirada" via Fulfillment Orders...');
    
    // PRIORIDADE MÁXIMA: Buscar status dos pedidos no banco de dados local
    // O webhook já atualiza o status quando recebe "pronto para retirada"
    const ordersData = (customer.orders || []).map(o => {
      const idMatch = o.id?.toString().match(/Order\/(\d+)/);
      return {
        shopifyId: idMatch ? idMatch[1] : null,
        orderNumber: o.orderNumber?.toString()
      };
    });

    const shopifyIds = ordersData.map(d => d.shopifyId).filter(Boolean);
    const orderNumbersList = ordersData.map(d => d.orderNumber).filter(Boolean);
    
    let dbOrdersByIdMap = new Map();
    let dbOrdersByNumberMap = new Map();
    
    if (shopifyIds.length > 0 || orderNumbersList.length > 0) {
      try {
        const dbOrders = await pool.query(
          `SELECT shopify_order_id, shopify_order_number, status, tracking_number, tracking_company, tracking_url 
           FROM melhor_casas_orders 
           WHERE (shopify_order_id = ANY($1) OR shopify_order_number = ANY($2))`,
          [shopifyIds, orderNumbersList]
        );
        
        for (const dbOrder of dbOrders.rows) {
          const orderData = {
            status: dbOrder.status,
            tracking_number: dbOrder.tracking_number,
            tracking_company: dbOrder.tracking_company,
            tracking_url: dbOrder.tracking_url
          };
          if (dbOrder.shopify_order_id) dbOrdersByIdMap.set(dbOrder.shopify_order_id.toString(), orderData);
          if (dbOrder.shopify_order_number) dbOrdersByNumberMap.set(dbOrder.shopify_order_number.toString(), orderData);
        }
        
        console.log(`📦 [users/orders] Sincronizado com banco local: ${dbOrders.rows.length} pedidos encontrados`);
      } catch (error) {
        console.error(`❌ [users/orders] Erro ao buscar pedidos no banco:`, error.message);
      }
    }
    
    // Para cada pedido, verificar status no banco primeiro (Fonte da Verdade para Retirada)
    const ordersWithStatus = [];
    for (const order of (customer.orders || [])) {
      const orderNumber = order.orderNumber?.toString();
      const idMatch = order.id?.toString().match(/Order\/(\d+)/);
      const shopifyId = idMatch ? idMatch[1] : null;
      
      // PRIORIDADE 1: Status do Banco Local (Atualizado pelo Webhook)
      const dbDataById = shopifyId ? dbOrdersByIdMap.get(shopifyId) : null;
      const dbDataByNumber = orderNumber ? dbOrdersByNumberMap.get(orderNumber) : null;
      const dbData = dbDataById || dbDataByNumber;
      const finalDbStatus = dbData?.status;
      
      // Dados de rastreio do banco local
      const trackingData = {
        trackingNumber: dbData?.tracking_number || null,
        trackingCompany: dbData?.tracking_company || null,
        trackingUrl: dbData?.tracking_url || null
      };

      if (finalDbStatus === 'pronto_retirada') {
        console.log(`✅ [users/orders] Pedido ${orderNumber} confirmado como "pronto_retirada" pelo banco local`);
        ordersWithStatus.push({
          ...order,
          fulfillmentStatus: 'ready_for_pickup',
          isReadyForPickup: true,
          ...trackingData
        });
        continue;
      }
      
      if (finalDbStatus === 'enviado') {
        console.log(`✅ [users/orders] Pedido ${orderNumber} confirmado como "enviado" pelo banco local`);
        ordersWithStatus.push({
          ...order,
          fulfillmentStatus: 'local_delivery',
          isLocalDelivery: true,
          ...trackingData
        });
        continue;
      }
      
      if (finalDbStatus === 'concluido') {
        console.log(`✅ [users/orders] Pedido ${orderNumber} confirmado como "concluido" pelo banco local`);
        ordersWithStatus.push({
          ...order,
          fulfillmentStatus: 'FULFILLED',
          isConcluded: true,
          ...trackingData
        });
        continue;
      }
      
      // PRIORIDADE 2: SEM fallback via Admin API
      // Evita rate limit do Shopify. O status vem do webhook e do banco local.
      ordersWithStatus.push({
        ...order,
        ...trackingData
      });
    }

    console.log('📦 [users/orders] Preparando resposta...');
    const response = {
      success: true,
      orders: ordersWithStatus,
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        defaultAddress: customer.defaultAddress,
        addresses: customer.addresses
      }
    };
    
    console.log('📦 [users/orders] Resposta preparada. Enviando...');
    console.log('📦 [users/orders] Total de pedidos na resposta:', response.orders.length);
    console.log(`📦 [users/orders:${requestId}] ========== SUCESSO ==========`);
    
    res.json(response);
  } catch (error) {
    console.error(`❌ [users/orders:${requestId}] ========== ERRO ==========`);
    console.error(`❌ [users/orders:${requestId}] Erro completo:`, error);
    console.error(`❌ [users/orders:${requestId}] Erro name:`, error.name);
    console.error(`❌ [users/orders:${requestId}] Erro message:`, error.message);
    console.error(`❌ [users/orders:${requestId}] Erro stack:`, error.stack);
    console.error(`❌ [users/orders:${requestId}] Erro response status:`, error.response?.status);
    console.error(`❌ [users/orders:${requestId}] Erro response data:`, JSON.stringify(error.response?.data, null, 2));
    console.error(`❌ [users/orders:${requestId}] Erro response headers:`, error.response?.headers);
    console.error(`❌ [users/orders:${requestId}] ========== FIM ERRO ==========`);
    
    // Enviar resposta de erro com mais detalhes
    const errorResponse = {
      error: 'Erro ao buscar pedidos',
      details: error.message,
      requestId: requestId
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = error.stack;
      errorResponse.responseData = error.response?.data;
    }
    
    res.status(500).json(errorResponse);
  }
});


// ==========================================
// EXCLUSÃO DE CONTA (Soft Delete / Tagging)
// ==========================================

// Solicitar exclusão de conta
router.post('/request-deletion', authenticateToken, async (req, res) => {
  const requestId = Date.now();
  console.log(`🗑️ [users/request-deletion:${requestId}] Requisição recebida`);

  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID não encontrado' });
    }

    // Buscar shopify_customer_id
    const userResult = await pool.query(
      'SELECT shopify_customer_id FROM melhor_casas_users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];
    if (!user.shopify_customer_id) {
      return res.status(400).json({ error: 'Usuário não vinculado ao Shopify' });
    }

    console.log(`🗑️ [users/request-deletion:${requestId}] Adicionando tag ao cliente ${user.shopify_customer_id}`);
    
    // Adicionar tag 'solicitou_exclusao' via Admin API
    await shopifyService.addCustomerTag(user.shopify_customer_id, 'solicitou_exclusao');

    // Opcional: Adicionar data de solicitação no banco local se tiver coluna, ou criar log
    // Por enquanto, confiamos na tag do Shopify

    res.json({ 
      success: true, 
      message: 'Solicitação de exclusão registrada. Sua conta será excluída em 30 dias.' 
    });

  } catch (error) {
    console.error(`❌ [users/request-deletion:${requestId}] Erro:`, error);
    res.status(500).json({ error: 'Erro ao processar solicitação de exclusão' });
  }
});

// Cancelar solicitação de exclusão (Reativar conta)
router.post('/cancel-deletion', authenticateToken, async (req, res) => {
  const requestId = Date.now();
  console.log(`🔄 [users/cancel-deletion:${requestId}] Requisição recebida`);

  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID não encontrado' });
    }

    // Buscar shopify_customer_id
    const userResult = await pool.query(
      'SELECT shopify_customer_id FROM melhor_casas_users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];
    if (!user.shopify_customer_id) {
      return res.status(400).json({ error: 'Usuário não vinculado ao Shopify' });
    }

    console.log(`🔄 [users/cancel-deletion:${requestId}] Removendo tag do cliente ${user.shopify_customer_id}`);
    
    // Remover tag 'solicitou_exclusao' via Admin API
    await shopifyService.removeCustomerTag(user.shopify_customer_id, 'solicitou_exclusao');

    res.json({ 
      success: true, 
      message: 'Conta reativada com sucesso.' 
    });

  } catch (error) {
    console.error(`❌ [users/cancel-deletion:${requestId}] Erro:`, error);
    res.status(500).json({ error: 'Erro ao reativar conta' });
  }
});

module.exports = router;







