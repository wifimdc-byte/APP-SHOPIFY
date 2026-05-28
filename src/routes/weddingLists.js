const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../database/connection');
const crypto = require('crypto');

const router = express.Router();

// Configurar multer para upload de foto de capa (em memória)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos'));
    }
  },
});

// Função auxiliar para gerar código de compartilhamento único
const generateShareCode = (prefix = 'LIST') => {
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${randomPart}`;
};

// Função auxiliar para verificar se usuário é dono da lista
const isListOwner = async (listId, userId) => {
  const result = await pool.query(
    'SELECT user_id FROM melhor_casas_wedding_lists WHERE id = $1',
    [listId]
  );
  return result.rows.length > 0 && result.rows[0].user_id === userId;
};

// Função auxiliar para calcular progresso da lista
const calculateListProgress = async (listId) => {
  const result = await pool.query(
    `SELECT 
      SUM(quantidade_desejada) as total_desejado,
      SUM(quantidade_comprada) as total_comprado
     FROM melhor_casas_wedding_list_items
     WHERE list_id = $1`,
    [listId]
  );
  
  const totalDesejado = parseInt(result.rows[0]?.total_desejado || 0);
  const totalComprado = parseInt(result.rows[0]?.total_comprado || 0);
  const percentual = totalDesejado > 0 ? (totalComprado / totalDesejado) * 100 : 0;
  
  return {
    total_desejado: totalDesejado,
    total_comprado: totalComprado,
    percentual: Math.round(percentual * 100) / 100
  };
};

// GET /api/wedding-lists - Listar minhas listas
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Verificar se as tabelas existem
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'melhor_casas_wedding_lists'
      )
    `);
    
    if (!tableCheck.rows[0]?.exists) {
      console.error('❌ [weddingLists] Tabelas não encontradas. Execute o script de migração: node backend/create-wedding-lists-tables.js');
      return res.status(503).json({ 
        error: 'Sistema de listas não está configurado. Entre em contato com o suporte.',
        details: 'Tabelas do banco de dados não encontradas'
      });
    }
    
    const listsResult = await pool.query(
      `SELECT 
        wl.id,
        wl.nome,
        wl.descricao,
        wl.foto_capa_url,
        wl.data_evento,
        wl.codigo_compartilhamento,
        wl.publica,
        wl.created_at,
        wl.updated_at,
        COUNT(DISTINCT wli.id) as total_itens,
        COALESCE(SUM(wli.quantidade_comprada), 0) as total_comprado,
        COALESCE(SUM(wli.quantidade_desejada), 0) as total_desejado
      FROM melhor_casas_wedding_lists wl
      LEFT JOIN melhor_casas_wedding_list_items wli ON wl.id = wli.list_id
      WHERE wl.user_id = $1
      GROUP BY wl.id
      ORDER BY wl.created_at DESC`,
      [userId]
    );

    const lists = listsResult.rows.map(list => {
      const totalDesejado = parseInt(list.total_desejado || 0);
      const totalComprado = parseInt(list.total_comprado || 0);
      const percentual = totalDesejado > 0 ? (totalComprado / totalDesejado) * 100 : 0;

      return {
        id: list.id,
        nome: list.nome,
        descricao: list.descricao,
        foto_capa_url: list.foto_capa_url,
        data_evento: list.data_evento,
        codigo_compartilhamento: list.codigo_compartilhamento,
        publica: list.publica,
        total_itens: parseInt(list.total_itens || 0),
        progresso: {
          total_desejado: totalDesejado,
          total_comprado: totalComprado,
          percentual: Math.round(percentual * 100) / 100
        },
        created_at: list.created_at,
        updated_at: list.updated_at
      };
    });

    res.json({
      success: true,
      lists
    });
  } catch (error) {
    console.error('❌ [weddingLists] Erro ao listar listas:', error);
    console.error('❌ [weddingLists] Stack:', error.stack);
    console.error('❌ [weddingLists] Detalhes:', {
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

// GET /api/wedding-lists/:id - Detalhes da lista
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const listId = parseInt(req.params.id);
    const userId = req.user.id;

    const listResult = await pool.query(
      'SELECT * FROM melhor_casas_wedding_lists WHERE id = $1',
      [listId]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const list = listResult.rows[0];
    const isOwner = list.user_id === userId;

    // Se não for dono, retornar erro (ou permitir se for pública e compartilhada)
    if (!isOwner) {
      return res.status(403).json({ error: 'Acesso negado. Você não é o dono desta lista.' });
    }

    // Buscar itens da lista
    const itemsResult = await pool.query(
      `SELECT 
        wli.id,
        wli.product_id,
        wli.quantidade_desejada,
        wli.quantidade_comprada,
        wli.prioridade,
        wli.observacoes,
        wli.created_at,
        wli.updated_at,
        p.codigo,
        p.nome,
        p.imagem_url,
        p.preco_varejo,
        p.preco_atacado,
        p.estoque,
        p.disponivel
      FROM melhor_casas_wedding_list_items wli
      INNER JOIN melhor_casas_products p ON wli.product_id = p.id
      WHERE wli.list_id = $1
      ORDER BY wli.created_at DESC`,
      [listId]
    );

    const progresso = await calculateListProgress(listId);

    res.json({
      success: true,
      list: {
        id: list.id,
        nome: list.nome,
        descricao: list.descricao,
        foto_capa_url: list.foto_capa_url,
        data_evento: list.data_evento,
        codigo_compartilhamento: list.codigo_compartilhamento,
        publica: list.publica,
        progresso,
        items: itemsResult.rows,
        created_at: list.created_at,
        updated_at: list.updated_at
      }
    });
  } catch (error) {
    console.error('Erro ao buscar detalhes da lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/wedding-lists - Criar nova lista
router.post('/', authenticateToken, [
  body('nome').trim().notEmpty().withMessage('Nome da lista é obrigatório'),
  body('descricao').optional({ nullable: true, checkFalsy: true }).trim(),
  body('data_evento').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    // Se não foi fornecido, permitir
    if (!value || value === null || value === undefined || value === '') {
      return true;
    }
    // Validar formato ISO8601 (YYYY-MM-DD)
    const iso8601DateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!iso8601DateRegex.test(value)) {
      throw new Error('Data deve estar no formato ISO8601 (YYYY-MM-DD)');
    }
    // Validar se é uma data válida
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error('Data inválida');
    }
    return true;
  })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Erros de validação:', errors.array());
      return res.status(400).json({ 
        error: 'Dados inválidos',
        errors: errors.array() 
      });
    }

    const userId = req.user.id;
    const { nome, descricao, data_evento, codigo_compartilhamento_prefix } = req.body;

    // Gerar código de compartilhamento único (padrão: LIST, mas pode ser customizado)
    const prefix = codigo_compartilhamento_prefix && codigo_compartilhamento_prefix.trim() 
      ? codigo_compartilhamento_prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10)
      : 'LIST';
    let codigoCompartilhamento = generateShareCode(prefix);
    let codigoExiste = true;
    let tentativas = 0;
    
    while (codigoExiste && tentativas < 10) {
      const checkResult = await pool.query(
        'SELECT id FROM melhor_casas_wedding_lists WHERE codigo_compartilhamento = $1',
        [codigoCompartilhamento]
      );
      if (checkResult.rows.length === 0) {
        codigoExiste = false;
      } else {
        codigoCompartilhamento = generateShareCode();
        tentativas++;
      }
    }

    if (codigoExiste) {
      return res.status(500).json({ error: 'Erro ao gerar código de compartilhamento' });
    }

    const result = await pool.query(
      `INSERT INTO melhor_casas_wedding_lists 
       (user_id, nome, descricao, data_evento, codigo_compartilhamento, publica)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, nome, descricao || null, data_evento || null, codigoCompartilhamento, false]
    );

    res.status(201).json({
      success: true,
      list: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao criar lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PUT /api/wedding-lists/:id - Editar lista
router.put('/:id', authenticateToken, [
  body('nome').optional().notEmpty().withMessage('Nome não pode ser vazio'),
  body('descricao').optional(),
  body('data_evento').optional().isISO8601().withMessage('Data inválida')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const listId = parseInt(req.params.id);
    const userId = req.user.id;

    // Verificar se é dono
    if (!(await isListOwner(listId, userId))) {
      return res.status(403).json({ error: 'Acesso negado. Você não é o dono desta lista.' });
    }

    const { nome, descricao, data_evento } = req.body;
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (nome !== undefined) {
      updates.push(`nome = $${paramCount++}`);
      values.push(nome);
    }
    if (descricao !== undefined) {
      updates.push(`descricao = $${paramCount++}`);
      values.push(descricao);
    }
    if (data_evento !== undefined) {
      updates.push(`data_evento = $${paramCount++}`);
      values.push(data_evento);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(listId);

    const result = await pool.query(
      `UPDATE melhor_casas_wedding_lists 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    res.json({
      success: true,
      list: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao atualizar lista:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/wedding-lists/:id/upload-photo - Upload de foto de capa
router.post('/:id/upload-photo', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    const listId = parseInt(req.params.id);
    const userId = req.user.id;

    // Verificar se é dono
    if (!(await isListOwner(listId, userId))) {
      return res.status(403).json({ error: 'Acesso negado. Você não é o dono desta lista.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }

    // Processar imagem: redimensionar para 800x600
    const processedBuffer = await sharp(req.file.buffer)
      .resize(800, 600, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Converter para Base64 Data URI
    const base64Image = `data:image/jpeg;base64,${processedBuffer.toString('base64')}`;

    // Atualizar foto no banco
    await pool.query(
      'UPDATE melhor_casas_wedding_lists SET foto_capa_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [base64Image, listId]
    );

    res.json({
      success: true,
      message: 'Foto de capa atualizada com sucesso',
      foto_capa_url: base64Image
    });
  } catch (error) {
    console.error('Erro ao fazer upload da foto:', error);
    res.status(500).json({ error: 'Erro ao fazer upload da foto de capa' });
  }
});

// DELETE /api/wedding-lists/:id - Deletar lista
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const listId = parseInt(req.params.id);
    const userId = req.user.id;

    // Verificar se é dono
    if (!(await isListOwner(listId, userId))) {
      return res.status(403).json({ error: 'Acesso negado. Você não é o dono desta lista.' });
    }

    // Deletar registros relacionados primeiro (devido a constraints de foreign key)
    // A tabela melhor_casas_pending_checkouts não tem ON DELETE CASCADE/SET NULL
    try {
      await pool.query(
        'DELETE FROM melhor_casas_pending_checkouts WHERE wedding_list_id = $1',
        [listId]
      );
      console.log(`✅ [DELETE lista] Registros de pending_checkouts deletados para lista ${listId}`);
    } catch (pendingError) {
      console.warn(`⚠️ [DELETE lista] Erro ao deletar pending_checkouts (pode não existir):`, pendingError.message);
      // Continuar mesmo se falhar (pode não ter registros)
    }

    // Deletar a lista (as outras tabelas têm ON DELETE CASCADE)
    // melhor_casas_wedding_list_items, melhor_casas_wedding_list_purchases, melhor_casas_wedding_list_guests
    await pool.query('DELETE FROM melhor_casas_wedding_lists WHERE id = $1', [listId]);

    res.json({
      success: true,
      message: 'Lista deletada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar lista:', error);
    console.error('Detalhes do erro:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint
    });
    
    // Retornar mensagem mais específica se for erro de constraint
    if (error.code === '23503') {
      return res.status(400).json({ 
        error: 'Não é possível deletar a lista. Existem registros relacionados que precisam ser removidos primeiro.',
        details: error.detail
      });
    }
    
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/wedding-lists/:id/items - Listar itens da lista
router.get('/:id/items', authenticateToken, async (req, res) => {
  try {
    const listId = parseInt(req.params.id);
    const userId = req.user.id;

    // Verificar se é dono
    if (!(await isListOwner(listId, userId))) {
      return res.status(403).json({ error: 'Acesso negado. Você não é o dono desta lista.' });
    }

    const itemsResult = await pool.query(
      `SELECT 
        wli.id,
        wli.product_id,
        wli.quantidade_desejada,
        wli.quantidade_comprada,
        wli.prioridade,
        wli.observacoes,
        wli.created_at,
        wli.updated_at,
        p.codigo,
        p.nome,
        p.imagem_url,
        p.preco_varejo,
        p.preco_atacado,
        p.estoque,
        p.disponivel
      FROM melhor_casas_wedding_list_items wli
      INNER JOIN melhor_casas_products p ON wli.product_id = p.id
      WHERE wli.list_id = $1
      ORDER BY wli.created_at DESC`,
      [listId]
    );

    res.json({
      success: true,
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Erro ao listar itens:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/wedding-lists/:id/items - Adicionar item à lista
router.post('/:id/items', authenticateToken, [
  body('product_id').isInt({ min: 1 }).withMessage('ID do produto é obrigatório'),
  body('quantidade_desejada').isInt({ min: 1 }).withMessage('Quantidade desejada deve ser maior que 0'),
  body('prioridade').optional().isIn(['baixa', 'media', 'alta']).withMessage('Prioridade inválida'),
  body('observacoes').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const listId = parseInt(req.params.id);
    const userId = req.user.id;
    const { product_id, quantidade_desejada, prioridade, observacoes } = req.body;

    // Verificar se é dono
    if (!(await isListOwner(listId, userId))) {
      return res.status(403).json({ error: 'Acesso negado. Você não é o dono desta lista.' });
    }

    // Verificar se produto existe e está ativo
    const productResult = await pool.query(
      'SELECT id, disponivel FROM melhor_casas_products WHERE id = $1',
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    if (!productResult.rows[0].disponivel) {
      return res.status(400).json({ error: 'Produto não está disponível' });
    }

    // Verificar se item já existe na lista
    const existingItem = await pool.query(
      'SELECT id FROM melhor_casas_wedding_list_items WHERE list_id = $1 AND product_id = $2',
      [listId, product_id]
    );

    if (existingItem.rows.length > 0) {
      return res.status(400).json({ error: 'Este produto já está na lista' });
    }

    // Adicionar item
    const result = await pool.query(
      `INSERT INTO melhor_casas_wedding_list_items 
       (list_id, product_id, quantidade_desejada, prioridade, observacoes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [listId, product_id, quantidade_desejada, prioridade || 'media', observacoes || null]
    );

    // Buscar dados completos do produto
    const fullItemResult = await pool.query(
      `SELECT 
        wli.id,
        wli.product_id,
        wli.quantidade_desejada,
        wli.quantidade_comprada,
        wli.prioridade,
        wli.observacoes,
        wli.created_at,
        wli.updated_at,
        p.codigo,
        p.nome,
        p.imagem_url,
        p.preco_varejo,
        p.preco_atacado,
        p.estoque,
        p.disponivel
      FROM melhor_casas_wedding_list_items wli
      INNER JOIN melhor_casas_products p ON wli.product_id = p.id
      WHERE wli.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json({
      success: true,
      item: fullItemResult.rows[0]
    });
  } catch (error) {
    console.error('Erro ao adicionar item:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// PUT /api/wedding-lists/:id/items/:item_id - Editar item
router.put('/:id/items/:item_id', authenticateToken, [
  body('quantidade_desejada').optional().isInt({ min: 1 }).withMessage('Quantidade deve ser maior que 0'),
  body('prioridade').optional().isIn(['baixa', 'media', 'alta']).withMessage('Prioridade inválida'),
  body('observacoes').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const listId = parseInt(req.params.id);
    const itemId = parseInt(req.params.item_id);
    const userId = req.user.id;
    const { quantidade_desejada, prioridade, observacoes } = req.body;

    // Verificar se é dono
    if (!(await isListOwner(listId, userId))) {
      return res.status(403).json({ error: 'Acesso negado. Você não é o dono desta lista.' });
    }

    // Verificar se item pertence à lista
    const itemCheck = await pool.query(
      'SELECT id FROM melhor_casas_wedding_list_items WHERE id = $1 AND list_id = $2',
      [itemId, listId]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Item não encontrado nesta lista' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (quantidade_desejada !== undefined) {
      updates.push(`quantidade_desejada = $${paramCount++}`);
      values.push(quantidade_desejada);
    }
    if (prioridade !== undefined) {
      updates.push(`prioridade = $${paramCount++}`);
      values.push(prioridade);
    }
    if (observacoes !== undefined) {
      updates.push(`observacoes = $${paramCount++}`);
      values.push(observacoes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(itemId);

    await pool.query(
      `UPDATE melhor_casas_wedding_list_items 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}`,
      values
    );

    // Buscar item atualizado
    const updatedItemResult = await pool.query(
      `SELECT 
        wli.id,
        wli.product_id,
        wli.quantidade_desejada,
        wli.quantidade_comprada,
        wli.prioridade,
        wli.observacoes,
        wli.created_at,
        wli.updated_at,
        p.codigo,
        p.nome,
        p.imagem_url,
        p.preco_varejo,
        p.preco_atacado,
        p.estoque,
        p.disponivel
      FROM melhor_casas_wedding_list_items wli
      INNER JOIN melhor_casas_products p ON wli.product_id = p.id
      WHERE wli.id = $1`,
      [itemId]
    );

    res.json({
      success: true,
      item: updatedItemResult.rows[0]
    });
  } catch (error) {
    console.error('Erro ao atualizar item:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// DELETE /api/wedding-lists/:id/items/:item_id - Remover item
router.delete('/:id/items/:item_id', authenticateToken, async (req, res) => {
  try {
    const listId = parseInt(req.params.id);
    const itemId = parseInt(req.params.item_id);
    const userId = req.user.id;

    // Verificar se é dono
    if (!(await isListOwner(listId, userId))) {
      return res.status(403).json({ error: 'Acesso negado. Você não é o dono desta lista.' });
    }

    // Verificar se item pertence à lista
    const itemCheck = await pool.query(
      'SELECT id FROM melhor_casas_wedding_list_items WHERE id = $1 AND list_id = $2',
      [itemId, listId]
    );

    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Item não encontrado nesta lista' });
    }

    await pool.query('DELETE FROM melhor_casas_wedding_list_items WHERE id = $1', [itemId]);

    res.json({
      success: true,
      message: 'Item removido com sucesso'
    });
  } catch (error) {
    console.error('Erro ao remover item:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/wedding-lists/:id/generate-share-code - Gerar/regenerar código de compartilhamento
router.post('/:id/generate-share-code', authenticateToken, async (req, res) => {
  try {
    const listId = parseInt(req.params.id);
    const userId = req.user.id;

    // Verificar se é dono
    if (!(await isListOwner(listId, userId))) {
      return res.status(403).json({ error: 'Acesso negado. Você não é o dono desta lista.' });
    }

    // Gerar novo código (padrão: LIST, mas pode ser customizado)
    const { codigo_compartilhamento_prefix } = req.body;
    const prefix = codigo_compartilhamento_prefix && codigo_compartilhamento_prefix.trim() 
      ? codigo_compartilhamento_prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10)
      : 'LIST';
    
    let codigoCompartilhamento = generateShareCode(prefix);
    let codigoExiste = true;
    let tentativas = 0;
    
    while (codigoExiste && tentativas < 10) {
      const checkResult = await pool.query(
        'SELECT id FROM melhor_casas_wedding_lists WHERE codigo_compartilhamento = $1 AND id != $2',
        [codigoCompartilhamento, listId]
      );
      if (checkResult.rows.length === 0) {
        codigoExiste = false;
      } else {
        codigoCompartilhamento = generateShareCode(prefix);
        tentativas++;
      }
    }

    if (codigoExiste) {
      return res.status(500).json({ error: 'Erro ao gerar código de compartilhamento' });
    }

    // Atualizar código
    const result = await pool.query(
      'UPDATE melhor_casas_wedding_lists SET codigo_compartilhamento = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING codigo_compartilhamento',
      [codigoCompartilhamento, listId]
    );

    res.json({
      success: true,
      codigo_compartilhamento: result.rows[0].codigo_compartilhamento
    });
  } catch (error) {
    console.error('Erro ao gerar código de compartilhamento:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/wedding-lists/shared/:codigo - Buscar lista por código (público, sem auth)
router.get('/shared/:codigo', async (req, res) => {
  try {
    const codigo = req.params.codigo;

    const listResult = await pool.query(
      'SELECT * FROM melhor_casas_wedding_lists WHERE codigo_compartilhamento = $1',
      [codigo]
    );

    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'Lista não encontrada' });
    }

    const list = listResult.rows[0];

    // Buscar itens da lista
    const itemsResult = await pool.query(
      `SELECT 
        wli.id,
        wli.product_id,
        wli.quantidade_desejada,
        wli.quantidade_comprada,
        wli.prioridade,
        wli.observacoes,
        wli.created_at,
        wli.updated_at,
        p.codigo,
        p.nome,
        p.imagem_url,
        p.preco_varejo,
        p.preco_atacado,
        p.estoque,
        p.disponivel
      FROM melhor_casas_wedding_list_items wli
      INNER JOIN melhor_casas_products p ON wli.product_id = p.id
      WHERE wli.list_id = $1
      ORDER BY wli.created_at DESC`,
      [list.id]
    );

    const progresso = await calculateListProgress(list.id);

    // Calcular quantidade disponível para cada item
    const items = itemsResult.rows.map(item => {
      const quantidadeDisponivel = Math.max(0, item.quantidade_desejada - item.quantidade_comprada);
      return {
        ...item,
        quantidade_disponivel: quantidadeDisponivel,
        comprado: item.quantidade_comprada >= item.quantidade_desejada
      };
    });

    res.json({
      success: true,
      list: {
        id: list.id,
        nome: list.nome,
        descricao: list.descricao,
        foto_capa_url: list.foto_capa_url,
        data_evento: list.data_evento,
        codigo_compartilhamento: list.codigo_compartilhamento,
        progresso,
        items
      }
    });
  } catch (error) {
    console.error('Erro ao buscar lista compartilhada:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/wedding-lists/:id/purchases - Ver histórico de compras (apenas dono)
router.get('/:id/purchases', authenticateToken, async (req, res) => {
  try {
    const listId = parseInt(req.params.id);
    const userId = req.user.id;

    // Verificar se é dono
    if (!(await isListOwner(listId, userId))) {
      return res.status(403).json({ error: 'Acesso negado. Você não é o dono desta lista.' });
    }

    const purchasesResult = await pool.query(
      `SELECT 
        wlp.id,
        wlp.list_id,
        wlp.list_item_id,
        wlp.order_id,
        wlp.user_id,
        wlp.quantidade_comprada,
        wlp.mensagem_comprador,
        wlp.comprado_em,
        u.nome as comprador_nome,
        u.email as comprador_email,
        p.nome as produto_nome,
        p.imagem_url as produto_imagem
      FROM melhor_casas_wedding_list_purchases wlp
      INNER JOIN melhor_casas_users u ON wlp.user_id = u.id
      INNER JOIN melhor_casas_wedding_list_items wli ON wlp.list_item_id = wli.id
      INNER JOIN melhor_casas_products p ON wli.product_id = p.id
      WHERE wlp.list_id = $1
      ORDER BY wlp.comprado_em DESC`,
      [listId]
    );

    res.json({
      success: true,
      purchases: purchasesResult.rows
    });
  } catch (error) {
    console.error('Erro ao buscar compras:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;
