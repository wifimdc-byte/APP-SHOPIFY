const express = require('express');
const { body, validationResult, query } = require('express-validator');
const pool = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
const cartService = require('../services/cartService');
const shopifyService = require('../services/shopifyService');

const router = express.Router();

// Obter carrinho do usuário
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const cart = cartService.getCart(userId);

    // Enriquecer com dados dos produtos
    if (cart.items && cart.items.length > 0) {
      const productIds = cart.items.map(item => item.product_id);
      const productsResult = await pool.query(
        `SELECT id, codigo, nome, preco_varejo, preco_atacado, preco_exclusivo, 
                COALESCE(quantidade_minima_atacado, 2) as quantidade_minima_atacado, 
                imagem_url, COALESCE(estoque, 0) as estoque, 
                COALESCE(disponivel, true) as disponivel
         FROM melhor_casas_products 
         WHERE id = ANY($1)`,
        [productIds]
      );

      const productsMap = new Map(productsResult.rows.map(p => [p.id, p]));

      // ✅ CORREÇÃO: Buscar imagens das variantes quando disponíveis
      // Agrupar produtos por código para evitar múltiplas chamadas ao Shopify
      const productsToFetch = new Set();
      const itemsWithVariants = cart.items.filter(item => {
        const product = productsMap.get(item.product_id);
        if (product && item.variant_id) {
          productsToFetch.add(product.codigo);
          return true;
        }
        return false;
      });

      // Buscar produtos do Shopify em batch (apenas os que têm variantes)
      const shopifyProductsMap = new Map();
      if (productsToFetch.size > 0) {
        await Promise.all(Array.from(productsToFetch).map(async (codigo) => {
          try {
            const shopifyProduct = await shopifyService.getProduct(codigo);
            if (shopifyProduct) {
              shopifyProductsMap.set(codigo, shopifyProduct);
            }
          } catch (error) {
            console.warn(`⚠️ [cart] Erro ao buscar produto ${codigo} do Shopify:`, error.message);
          }
        }));
      }

      cart.items = cart.items.map(item => {
        const product = productsMap.get(item.product_id);
        if (!product) {
          console.warn(`⚠️ [cart] Produto ${item.product_id} não encontrado no banco`);
          return null;
        }

        // Determinar preço baseado na quantidade e tipo de usuário
        let precoUnitario = product.preco_varejo;
        if (item.quantidade >= product.quantidade_minima_atacado) {
          precoUnitario = product.preco_atacado;
        }
        // Se usuário tem preço exclusivo (pode adicionar lógica aqui)
        // precoUnitario = product.preco_exclusivo;

        // ✅ Buscar imagem da variante se o item tiver variant_id
        let imagemUrl = product.imagem_url; // Imagem padrão do produto
        
        if (item.variant_id) {
          const shopifyProduct = shopifyProductsMap.get(product.codigo);
          if (shopifyProduct && shopifyProduct.variants && shopifyProduct.images) {
            // Encontrar a variante específica
            const variant = shopifyProduct.variants.find(v => v.id.toString() === item.variant_id.toString());
            if (variant && variant.image_id) {
              // Encontrar a imagem associada à variante
              const variantImage = shopifyProduct.images.find(img => img.id === variant.image_id);
              if (variantImage && variantImage.src) {
                imagemUrl = variantImage.src;
                console.log(`✅ [cart] Imagem da variante encontrada para item ${item.product_id}, variante ${item.variant_id}`);
              }
            }
          }
        }

        return {
          ...item,
          product_id: item.product_id, // Garantir que product_id está presente
          nome: product.nome, // Adicionar nome diretamente no item para facilitar
          preco_exclusivo: product.preco_exclusivo,
          preco_varejo: product.preco_varejo,
          preco_atacado: product.preco_atacado,
          produto: {
            id: product.id,
            codigo: product.codigo,
            nome: product.nome,
            imagem_url: imagemUrl, // ✅ Usar imagem da variante se disponível
            estoque: product.estoque,
            disponivel: product.disponivel
          },
          preco_unitario: precoUnitario,
          subtotal: precoUnitario * item.quantidade
        };
      }).filter(item => item !== null);

      // Recalcular total
      cart.total = cart.items.reduce((sum, item) => sum + item.subtotal, 0);
    }

    res.json({
      success: true,
      cart
    });
  } catch (error) {
    console.error('Erro ao buscar carrinho:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Adicionar item ao carrinho
router.post('/items', authenticateToken, [
  body('product_id').notEmpty().withMessage('ID do produto é obrigatório'),
  body('quantidade').isInt({ min: 1 }).withMessage('Quantidade deve ser maior que 0'),
  body('variant_id').optional(),
  body('variant_title').optional().isString(),
  body('wedding_list_id').optional().isInt({ min: 1 }),
  body('list_item_id').optional().isInt({ min: 1 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const product_id = parseInt(req.body.product_id);
    const quantidade = parseInt(req.body.quantidade);
    const variant_idRaw = req.body.variant_id || null;
    const variant_id = variant_idRaw != null ? String(variant_idRaw) : null;
    const variant_title = req.body.variant_title || null;

    if (!product_id || isNaN(product_id)) {
      return res.status(400).json({ error: 'ID do produto inválido' });
    }

    if (!quantidade || isNaN(quantidade) || quantidade < 1) {
      return res.status(400).json({ error: 'Quantidade inválida' });
    }

    // Verificar se produto existe e está disponível
    const productResult = await pool.query(
      `SELECT id, codigo, nome, preco_varejo, preco_atacado, preco_exclusivo, 
              COALESCE(quantidade_minima_atacado, 2) as quantidade_minima_atacado, 
              COALESCE(estoque, 0) as estoque, 
              COALESCE(disponivel, true) as disponivel
       FROM melhor_casas_products 
       WHERE id = $1 AND COALESCE(disponivel, true) = true`,
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado ou indisponível' });
    }

    const product = productResult.rows[0];

    // Verificar estoque
    const estoque = product.estoque || 0;
    if (estoque <= 0) {
      return res.status(400).json({ 
        error: 'Produto esgotado'
      });
    }
    if (estoque < quantidade) {
      return res.status(400).json({ 
        error: 'Estoque insuficiente', 
        estoque_disponivel: estoque 
      });
    }

    // Obter ou criar carrinho
    let cart = cartService.getCart(userId);

    // Verificar se item já existe no carrinho (comparar variant_id como string)
    const existingItemIndex = cart.items.findIndex(item => {
      if (variant_id) {
        const itemVariantStr = item.variant_id != null ? String(item.variant_id) : null;
        return item.product_id === product_id && itemVariantStr === variant_id;
      } else {
        return item.product_id === product_id && (item.variant_id == null || item.variant_id === '');
      }
    });

    if (existingItemIndex >= 0) {
      // Atualizar quantidade e mover para o topo
      const newQuantity = cart.items[existingItemIndex].quantidade + quantidade;
      
      // Verificar estoque novamente
      const estoque = product.estoque || 0;
      if (estoque > 0 && estoque < newQuantity) {
        return res.status(400).json({ 
          error: 'Estoque insuficiente para a quantidade solicitada', 
          estoque_disponivel: estoque 
        });
      }

      // Remover item do índice atual e adicionar no início
      const updatedItem = cart.items.splice(existingItemIndex, 1)[0];
      updatedItem.quantidade = newQuantity;
      
      // Preservar ou atualizar informações de lista de casamento se fornecidas
      if (req.body.wedding_list_id && req.body.list_item_id) {
        updatedItem.wedding_list_id = parseInt(req.body.wedding_list_id);
        updatedItem.list_item_id = parseInt(req.body.list_item_id);
        console.log(`🎁 [cart] Item atualizado com informações de lista de casamento: lista ${updatedItem.wedding_list_id}, item ${updatedItem.list_item_id}`);
      }
      
      // Atualizar variante se fornecida
      if (variant_id) {
        updatedItem.variant_id = variant_id;
        updatedItem.variant_title = variant_title;
      }
      
      cart.items.unshift(updatedItem);
    } else {
      // Adicionar novo item no início (topo)
      const newItem = {
        product_id,
        quantidade,
        variant_id: variant_id || null,
        variant_title: variant_title || null
      };
      
      // Adicionar informações de lista de casamento se fornecidas
      if (req.body.wedding_list_id && req.body.list_item_id) {
        newItem.wedding_list_id = parseInt(req.body.wedding_list_id);
        newItem.list_item_id = parseInt(req.body.list_item_id);
        console.log(`🎁 [cart] Item adicionado com informações de lista de casamento: lista ${newItem.wedding_list_id}, item ${newItem.list_item_id}`);
      }
      
      if (variant_id) {
        console.log(`🔄 [cart] Item adicionado com variante: ${variant_id} (${variant_title || 'sem título'})`);
      }
      
      cart.items.unshift(newItem);
    }

    // Calcular total do carrinho antes de retornar
    if (cart.items && cart.items.length > 0) {
      const productIds = cart.items.map(item => item.product_id);
      const productsResult = await pool.query(
        `SELECT id, preco_varejo, preco_atacado, 
                COALESCE(quantidade_minima_atacado, 2) as quantidade_minima_atacado
         FROM melhor_casas_products 
         WHERE id = ANY($1)`,
        [productIds]
      );

      const productsMap = new Map(productsResult.rows.map(p => [p.id, p]));

      cart.items = cart.items.map(item => {
        const product = productsMap.get(item.product_id);
        if (!product) return null;

        let precoUnitario = product.preco_varejo;
        if (item.quantidade >= product.quantidade_minima_atacado) {
          precoUnitario = product.preco_atacado;
        }

        return {
          ...item,
          preco_unitario: precoUnitario,
          subtotal: precoUnitario * item.quantidade
        };
      }).filter(item => item !== null);

      // Recalcular total
      cart.total = cart.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    } else {
      cart.total = 0;
    }

    // Salvar carrinho
    cartService.setCart(userId, cart);

    res.status(201).json({
      success: true,
      message: 'Item adicionado ao carrinho',
      cart
    });
  } catch (error) {
    console.error('❌ Erro ao adicionar item ao carrinho');
    console.error('❌ Mensagem:', error.message);
    console.error('❌ Stack:', error.stack);
    console.error('❌ User ID:', req.user?.id);
    console.error('❌ Product ID:', req.body.product_id);
    console.error('❌ Quantidade:', req.body.quantidade);
    
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Atualizar quantidade de item no carrinho
router.put('/items/:product_id', authenticateToken, [
  body('quantidade').isInt({ min: 1 }).withMessage('Quantidade deve ser maior que 0'),
  body('variant_id').optional()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.id;
    const product_id = parseInt(req.params.product_id);
    const { quantidade, variant_id: variant_idRaw } = req.body;
    const variant_id = variant_idRaw != null ? String(variant_idRaw) : null;

    const cart = cartService.getCart(userId);
    if (!cart || !cart.items) {
      return res.status(404).json({ error: 'Carrinho não encontrado' });
    }

    // ✅ CORREÇÃO: Considerar variant_id ao buscar item (comparar como string)
    const itemIndex = cart.items.findIndex(item => {
      if (variant_id) {
        const itemVariantStr = item.variant_id != null ? String(item.variant_id) : null;
        return item.product_id === product_id && itemVariantStr === variant_id;
      } else {
        return item.product_id === product_id && (item.variant_id == null || item.variant_id === '');
      }
    });
    
    if (itemIndex === -1) {
      return res.status(404).json({ error: 'Item não encontrado no carrinho' });
    }

    // Verificar estoque
    const productResult = await pool.query(
      'SELECT COALESCE(estoque, 0) as estoque FROM melhor_casas_products WHERE id = $1',
      [product_id]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    const estoque = productResult.rows[0].estoque || 0;
    if (estoque > 0 && estoque < quantidade) {
      return res.status(400).json({ 
        error: 'Estoque insuficiente', 
        estoque_disponivel: estoque 
      });
    }

    // Atualizar quantidade e mover para o topo
    const updatedItem = cart.items.splice(itemIndex, 1)[0];
    updatedItem.quantidade = quantidade;
    cart.items.unshift(updatedItem);
    cartService.setCart(userId, cart);

    res.json({
      success: true,
      message: 'Quantidade atualizada',
      cart
    });
  } catch (error) {
    console.error('Erro ao atualizar item do carrinho:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Remover item do carrinho
router.delete('/items/:product_id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const product_id = parseInt(req.params.product_id);
    const variant_idRaw = req.query.variant_id || req.body.variant_id || null;
    // ✅ CORREÇÃO: Normalizar para string para comparação (query vem como string, item pode ser number)
    const variant_id = variant_idRaw != null ? String(variant_idRaw) : null;

    const cart = cartService.getCart(userId);
    if (!cart || !cart.items) {
      return res.status(404).json({ error: 'Carrinho não encontrado' });
    }

    // ✅ CORREÇÃO: Considerar variant_id ao remover item (comparar como string)
    const itemsBefore = cart.items.length;
    cart.items = cart.items.filter(item => {
      if (variant_id) {
        const itemVariantStr = item.variant_id != null ? String(item.variant_id) : null;
        return !(item.product_id === product_id && itemVariantStr === variant_id);
      } else {
        return !(item.product_id === product_id && (item.variant_id == null || item.variant_id === ''));
      }
    });
    
    const itemsAfter = cart.items.length;
    console.log(`🗑️ [cart] Item removido: ${itemsBefore} -> ${itemsAfter} itens (product_id: ${product_id}, variant_id: ${variant_id || 'null'})`);
    
    // Recalcular total após remoção
    if (cart.items.length > 0) {
      const productIds = cart.items.map(item => item.product_id);
      const productsResult = await pool.query(
        `SELECT id, preco_varejo, preco_atacado, 
                COALESCE(quantidade_minima_atacado, 2) as quantidade_minima_atacado
         FROM melhor_casas_products 
         WHERE id = ANY($1)`,
        [productIds]
      );

      const productsMap = new Map(productsResult.rows.map(p => [p.id, p]));

      cart.items = cart.items.map(item => {
        const product = productsMap.get(item.product_id);
        if (!product) return null;

        let precoUnitario = product.preco_varejo;
        if (item.quantidade >= product.quantidade_minima_atacado) {
          precoUnitario = product.preco_atacado;
        }

        return {
          ...item,
          preco_unitario: precoUnitario,
          subtotal: precoUnitario * item.quantidade
        };
      }).filter(item => item !== null);

      cart.total = cart.items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
    } else {
      cart.total = 0;
    }
    
    cartService.setCart(userId, cart);

    res.json({
      success: true,
      message: 'Item removido do carrinho',
      cart // ✅ Retornar carrinho atualizado
    });
  } catch (error) {
    console.error('Erro ao remover item do carrinho:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpar carrinho
router.delete('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    cartService.deleteCart(userId);

    res.json({
      success: true,
      message: 'Carrinho limpo com sucesso'
    });
  } catch (error) {
    console.error('Erro ao limpar carrinho:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Endpoint administrativo: Verificar carrinho de um usuário específico
router.get('/admin/user/:userId', authenticateAdmin, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId);
    
    if (!targetUserId || isNaN(targetUserId)) {
      return res.status(400).json({ error: 'ID do usuário inválido' });
    }

    const cart = cartService.getCart(targetUserId);
    
    // Verificar se o carrinho tem itens
    const hasItems = cart && cart.items && cart.items.length > 0;
    
    res.json({
      success: true,
      userId: targetUserId,
      hasItems: hasItems,
      itemCount: hasItems ? cart.items.length : 0,
      total: hasItems ? cart.total : 0
    });
  } catch (error) {
    console.error('Erro ao verificar carrinho do usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;

