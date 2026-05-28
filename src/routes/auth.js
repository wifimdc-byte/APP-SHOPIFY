const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const pool = require('../database/connection');
const shopifyService = require('../services/shopifyService');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

const getJwtSecret = () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_jwt_secret_key_here') {
    console.warn('⚠️ JWT_SECRET não configurado! Usando chave padrão (NÃO SEGURO PARA PRODUÇÃO)');
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';
  }
  return process.env.JWT_SECRET;
};

const router = express.Router();

// Rota de teste
router.get('/test', (req, res) => {
  res.json({ message: 'Auth route is working!' });
});

// Validar CPF/CNPJ
const validateCPFCNPJ = (value) => {
  const cleanValue = value.replace(/\D/g, '');
  
  if (cleanValue.length === 11) {
    // Validar CPF
    return true;
  } else if (cleanValue.length === 14) {
    // Validar CNPJ
    return true;
  }
  return false;
};

// Registro
router.post('/register', [
  body('cpf_cnpj').custom(validateCPFCNPJ).withMessage('CPF/CNPJ inválido'),
  body('nome').isLength({ min: 2 }).withMessage('Nome deve ter pelo menos 2 caracteres'),
  body('email').isEmail().withMessage('Email inválido'),
  body('senha').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres'),
  body('telefone').optional()
], async (req, res) => {
  try {
    console.log('📝 [register] ========== INÍCIO DO REGISTRO ==========');
    console.log('📝 [register] Body recebido:', {
      cpf_cnpj: req.body.cpf_cnpj ? req.body.cpf_cnpj.substring(0, 5) + '...' : 'não fornecido',
      nome: req.body.nome ? req.body.nome.substring(0, 10) + '...' : 'não fornecido',
      email: req.body.email || 'não fornecido',
      telefone: req.body.telefone || 'não fornecido',
      senhaLength: req.body.senha ? req.body.senha.length : 0
    });

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('❌ [register] Erros de validação:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { cpf_cnpj, nome, email, senha, telefone } = req.body;
    
    // Normalizar CPF/CNPJ (remover formatação)
    const cleanCpfCnpj = cpf_cnpj.replace(/\D/g, '');
    console.log('📝 [register] CPF/CNPJ normalizado:', cleanCpfCnpj.substring(0, 5) + '...');
    
    // Verificar se email já existe (Shopify valida apenas por email)
    console.log('📝 [register] Verificando se email já existe...');
    const existingUser = await pool.query(
      'SELECT id FROM melhor_casas_users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      console.warn('⚠️ [register] Email já cadastrado:', email);
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Verificar se CPF/CNPJ já existe
    console.log('📝 [register] Verificando se CPF/CNPJ já existe...');
    const existingCpf = await pool.query(
      'SELECT id FROM melhor_casas_users WHERE cpf_cnpj = $1',
      [cleanCpfCnpj]
    );

    if (existingCpf.rows.length > 0) {
      console.warn('⚠️ [register] CPF/CNPJ já cadastrado:', cleanCpfCnpj);
      return res.status(400).json({ error: 'CPF/CNPJ já cadastrado' });
    }
    
    console.log('✅ [register] Email e CPF não existem, prosseguindo...');

    // Hash da senha
    console.log('📝 [register] Gerando hash da senha...');
    const saltRounds = 10;
    const senhaHash = await bcrypt.hash(senha, saltRounds);
    console.log('✅ [register] Hash da senha gerado');

    // Determinar tipo de documento
    const tipoDocumento = cleanCpfCnpj.length === 11 ? 'CPF' : 'CNPJ';
    console.log('📝 [register] Tipo de documento:', tipoDocumento);

    // Criar usuário no banco local
    console.log('📝 [register] Criando usuário no banco local...');
    const result = await pool.query(
      `INSERT INTO melhor_casas_users (cpf_cnpj, nome, email, telefone, senha_hash, tipo_documento) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, cpf_cnpj, nome, email, tipo_documento, foto_url`,
      [cleanCpfCnpj, nome, email, telefone, senhaHash, tipoDocumento]
    );

    const user = result.rows[0];
    console.log('✅ [register] Usuário criado no banco local - ID:', user.id);

    // Garantir que a coluna shopify_customer_id existe
    try {
      await pool.query(`
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'melhor_casas_users' 
            AND column_name = 'shopify_customer_id'
          ) THEN
            ALTER TABLE melhor_casas_users ADD COLUMN shopify_customer_id VARCHAR(500);
          END IF;
        END $$;
      `);
    } catch (error) {
      console.warn('⚠️ [register] Erro ao verificar/criar coluna shopify_customer_id:', error.message);
    }

    // Criar customer na Shopify via Admin API (Storefront API não suporta criar customers)
    console.log('🛍️ [register] Iniciando criação de customer na Shopify...');
    // shopifyService já é uma instância exportada, não precisa de 'new'
    
    // Separar nome em firstName e lastName
    const nameParts = nome.trim().split(' ');
    const firstName = nameParts[0] || nome;
    const lastName = nameParts.slice(1).join(' ') || nome;
    
    console.log('🛍️ [register] Dados para Shopify:', { 
      email, 
      firstName, 
      lastName,
      phone: telefone || 'não fornecido'
    });
    
    const shopifyResult = await shopifyService.createCustomer({
      firstName,
      lastName,
      email,
      password: senha,
      phone: telefone
    });

    let shopifyCustomerId = null;
    if (shopifyResult.success) {
      shopifyCustomerId = shopifyResult.customer?.id;
      console.log('✅ [register] Customer criado na Shopify com sucesso!');
      console.log('✅ [register] Shopify Customer ID:', shopifyCustomerId);
      console.log('✅ [register] Email verificado?', shopifyResult.customer?.verifiedEmail);
      
      // Salvar shopify_customer_id no banco
      if (shopifyCustomerId) {
        try {
          await pool.query(
            'UPDATE melhor_casas_users SET shopify_customer_id = $1 WHERE id = $2',
            [shopifyCustomerId, user.id]
          );
          // Atualizar user object para incluir shopify_customer_id
          user.shopify_customer_id = shopifyCustomerId;
          console.log('✅ [register] shopify_customer_id salvo no banco');
        } catch (error) {
          console.error('❌ [register] Erro ao salvar shopify_customer_id:', error);
          console.error('❌ [register] Stack:', error.stack);
        }
      }
    } else {
      const errorMessages = shopifyResult.errors?.map(e => e.message || e).join(', ') || 'Erro desconhecido';
      const errorDetails = shopifyResult.errors?.map(e => JSON.stringify(e, null, 2)).join('\n') || 'Sem detalhes';
      console.error('❌ [register] ========== FALHA AO CRIAR CUSTOMER NA SHOPIFY ==========');
      console.error('❌ [register] Mensagens de erro:', errorMessages);
      console.error('❌ [register] Detalhes completos:', errorDetails);
      console.error('❌ [register] Status HTTP:', shopifyResult.errors?.[0]?.status || 'não disponível');
      // Não bloquear o registro se falhar no Shopify, mas logar o erro
      // O usuário já foi criado no banco, então pode fazer login normalmente
      console.warn('⚠️ [register] Continuando registro mesmo com falha na Shopify (usuário criado no banco local)');
    }

    // Gerar token JWT
    const token = jwt.sign(
      { userId: user.id, cpf_cnpj: user.cpf_cnpj },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: {
        id: user.id,
        cpf_cnpj: user.cpf_cnpj,
        nome: user.nome,
        email: user.email,
        tipo_documento: user.tipo_documento,
        foto_url: user.foto_url || null,
        shopify_customer_id: shopifyCustomerId
      },
      token,
      shopifyCreated: shopifyResult.success
    });
  } catch (error) {
    console.error('❌ [register] ========== ERRO NO REGISTRO ==========');
    console.error('❌ [register] Tipo do erro:', error.constructor.name);
    console.error('❌ [register] Mensagem:', error.message);
    console.error('❌ [register] Stack:', error.stack);
    
    if (error.response) {
      console.error('❌ [register] Erro HTTP - Status:', error.response.status);
      console.error('❌ [register] Erro HTTP - Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Login - Aceita CPF/CNPJ ou email
router.post('/login', [
  body('cpf_cnpj').optional(),
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('senha').notEmpty().withMessage('Senha é obrigatória')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cpf_cnpj, email, senha } = req.body;

    // Verificar se foi fornecido CPF/CNPJ ou email
    if (!cpf_cnpj && !email) {
      return res.status(400).json({ error: 'CPF/CNPJ ou email é obrigatório' });
    }

    let result;
    
    if (email) {
      // Buscar usuário por email
      result = await pool.query(
        'SELECT id, cpf_cnpj, nome, email, senha_hash, tipo_documento FROM melhor_casas_users WHERE email = $1',
        [email]
      );
    } else {
      // Buscar usuário por CPF/CNPJ (comparar com e sem formatação)
      const cleanCpfCnpj = cpf_cnpj.replace(/\D/g, '');
      result = await pool.query(
        'SELECT id, cpf_cnpj, nome, email, senha_hash, tipo_documento, foto_url FROM melhor_casas_users WHERE cpf_cnpj = $1 OR cpf_cnpj = $2',
        [cpf_cnpj, cleanCpfCnpj]
      );
    }

    let user = result.rows[0];

    if (!user) {
      if (email) {
        // Tentar obter Customer Access Token via Storefront API para verificar se conta existe no Shopify
        try {
          const tokenResult = await shopifyService.createCustomerAccessToken(email, senha);
          if (tokenResult.success && tokenResult.customerAccessToken) {
            // Conta existe na loja, mas não existe no app ainda
            return res.status(404).json({
              error: 'Encontramos sua conta, mas ela ainda não está sincronizada com o app. Termine seu cadastro para continuar.',
              shopifySyncRequired: true,
              code: 'SHOPIFY_ACCOUNT_NOT_SYNCED'
            });
          }
        } catch (error) {
          console.log('⚠️ [auth/login] Conta não encontrada no Shopify via Storefront API');
        }
      }
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    let senhaValida = await bcrypt.compare(senha, user.senha_hash);
    let syncedWithShopify = false;
    let customerAccessToken = null;
    let customerAccessTokenExpires = null;

    // Verificar status de verificação de email (opcional, não bloqueia login)
    let emailVerified = null;
    if (email) {
      try {
        const verificationStatus = await shopifyService.checkEmailVerificationStatus(email);
        emailVerified = verificationStatus.verified;
        console.log('📧 [auth/login] Status de verificação de email:', emailVerified);
      } catch (verificationError) {
        console.warn('⚠️ [auth/login] Erro ao verificar status de email (não crítico):', verificationError.message);
      }
    }

    // Tentar obter Customer Access Token via Storefront API (se tiver email)
    if (email) {
      try {
        console.log('🔐 [auth/login] Tentando obter Customer Access Token via Storefront API...');
        const tokenResult = await shopifyService.createCustomerAccessToken(email, senha);
        
        if (tokenResult.success && tokenResult.customerAccessToken) {
          customerAccessToken = tokenResult.customerAccessToken.accessToken;
          customerAccessTokenExpires = tokenResult.customerAccessToken.expiresAt;
          console.log('✅ [auth/login] Customer Access Token obtido via Storefront API');
          
          // Se senha não era válida no banco mas é válida no Shopify, sincronizar
          if (!senhaValida) {
            const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
            await pool.query(
              `UPDATE melhor_casas_users 
               SET senha_hash = $1, updated_at = NOW() 
               WHERE id = $2`,
              [senhaHash, user.id]
            );
            senhaValida = true;
            syncedWithShopify = true;
          }
        } else {
          console.log('⚠️ [auth/login] Não foi possível obter Customer Access Token:', tokenResult.errors);
        }
      } catch (tokenError) {
        console.error('❌ [auth/login] Erro ao obter Customer Access Token:', tokenError.message);
        // Continuar com login normal se falhar
      }
    }

    // Se senha não é válida e não conseguiu token via Storefront API, tentar buscar dados do cliente
    if (!senhaValida && email && !customerAccessToken) {
      // Tentar obter dados do cliente via Storefront API usando getCustomer
      // Mas primeiro precisamos do token, então se não conseguiu, não há como continuar
      console.log('⚠️ [auth/login] Senha inválida e não foi possível obter Customer Access Token via Storefront API');
    }

    if (!senhaValida) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Salvar Customer Access Token no banco se obtido
    if (customerAccessToken) {
      try {
        await pool.query(
          `UPDATE melhor_casas_users 
           SET shopify_customer_token = $1, 
               shopify_customer_token_expires = $2,
               updated_at = NOW()
           WHERE id = $3`,
          [customerAccessToken, customerAccessTokenExpires, user.id]
        );
        console.log('✅ [auth/login] Customer Access Token salvo no banco');
      } catch (tokenSaveError) {
        console.error('❌ [auth/login] Erro ao salvar Customer Access Token:', tokenSaveError.message);
        // Continuar mesmo se falhar ao salvar token
      }
    }

    // Gerar token JWT
    const token = jwt.sign(
      { userId: user.id, cpf_cnpj: user.cpf_cnpj },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Construir URL completa da foto se existir
    let fotoUrl = user.foto_url;
    if (fotoUrl && fotoUrl.startsWith('/uploads')) {
      const baseUrl = req.protocol + '://' + req.get('host');
      fotoUrl = baseUrl + fotoUrl;
    }

    res.json({
      message: 'Login realizado com sucesso',
      user: {
        id: user.id,
        cpf_cnpj: user.cpf_cnpj,
        nome: user.nome,
        email: user.email,
        telefone: user.telefone,
        tipo_documento: user.tipo_documento,
        foto_url: fotoUrl
      },
      token,
      shopifySynced: syncedWithShopify,
      customerAccessToken: customerAccessToken, // Retornar token para o app usar
      emailVerified: emailVerified // Status de verificação de email (null se não verificado)
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Esqueci minha senha - dispara email de recuperação via Shopify Storefront
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Email inválido')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    console.log('📧 [forgot-password] Iniciando fluxo de recuperação para:', normalizedEmail);

    // Opcional: verificar se existe usuário local, apenas para log
    try {
      const existing = await pool.query(
        'SELECT id FROM melhor_casas_users WHERE email = $1',
        [normalizedEmail]
      );
      if (existing.rows.length === 0) {
        console.log('📧 [forgot-password] Email não encontrado no banco local, prosseguindo mesmo assim.');
      } else {
        console.log('📧 [forgot-password] Usuário local encontrado, id:', existing.rows[0].id);
      }
    } catch (lookupError) {
      console.warn('⚠️ [forgot-password] Erro ao verificar usuário local (não bloqueia):', lookupError.message);
    }

    const result = await shopifyService.customerRecover(normalizedEmail);

    if (!result.success) {
      console.warn('⚠️ [forgot-password] customerRecover retornou erros:', result.errors);
      // Mesmo com erro, retornar mensagem genérica para não expor existência de conta
      return res.status(200).json({
        success: true,
        message: 'Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes.'
      });
    }

    console.log('✅ [forgot-password] Email de recuperação solicitado com sucesso para:', normalizedEmail);

    return res.json({
      success: true,
      message: 'Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha em instantes.'
    });
  } catch (error) {
    console.error('❌ [forgot-password] Erro:', error);
    return res.status(500).json({
      error: 'Erro ao iniciar recuperação de senha'
    });
  }
});

router.post('/sync-shopify', [
  body('email').isEmail().withMessage('Email inválido'),
  body('senha').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, senha } = req.body;

  try {
    let existingUser = await pool.query(
      'SELECT id, nome FROM melhor_casas_users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length === 0) {
      const customer = await shopifyService.getCustomerByEmail(email);
      if (!customer) {
        return res.status(404).json({ error: 'Conta não encontrada na Shopify' });
      }

      const fullName = `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || email.split('@')[0];
      const phone = customer.phone || customer.default_address?.phone || null;
      const cpfCnpj = `TEMP-${Date.now()}`;
      const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);
      const tipoDocumento = 'CPF';

      const created = await pool.query(
        `INSERT INTO melhor_casas_users (cpf_cnpj, nome, email, telefone, senha_hash, tipo_documento)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id`,
        [cpfCnpj, fullName, email, phone, senhaHash, tipoDocumento]
      );

      return res.json({ success: true, message: 'Usuário criado e senha sincronizada', userId: created.rows[0].id });
    }

    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

    await pool.query(
      `UPDATE melhor_casas_users 
       SET senha_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [senhaHash, existingUser.rows[0].id]
    );

    res.json({ success: true, message: 'Senha sincronizada com sucesso', userId: existingUser.rows[0].id });
  } catch (error) {
    console.error('Erro ao sincronizar senha com Shopify:', error);
    res.status(500).json({ error: 'Erro ao sincronizar senha' });
  }
});

// Endpoint de teste para verificar se rota admin está funcionando
router.get('/admin/test', (req, res) => {
  res.json({ message: 'Rota admin está funcionando', endpoint: '/api/auth/admin/login' });
});

// Login Admin (verifica se é admin antes de retornar token)
// Verificar status de verificação de email
router.get('/check-email-verification/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    console.log('📧 [check-email-verification] Verificando status para:', email);
    
    // shopifyService já é uma instância exportada, não precisa de 'new'
    const result = await shopifyService.checkEmailVerificationStatus(email);
    
    console.log('📧 [check-email-verification] Resultado:', result);
    
    res.json({
      verified: result.verified,
      customerId: result.customerId
    });
  } catch (error) {
    console.error('❌ [check-email-verification] Erro:', error);
    res.status(500).json({ 
      error: 'Erro ao verificar status de email',
      verified: false
    });
  }
});

router.post('/admin/login', [
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('cpf_cnpj').optional(),
  body('senha').notEmpty().withMessage('Senha é obrigatória')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { cpf_cnpj, email, senha } = req.body;

    if (!cpf_cnpj && !email) {
      return res.status(400).json({ error: 'CPF/CNPJ ou email é obrigatório' });
    }

    // Buscar usuário
    let result;
    if (email) {
      result = await pool.query(
        'SELECT id, cpf_cnpj, nome, email, senha_hash, tipo_documento FROM melhor_casas_users WHERE email = $1',
        [email]
      );
    } else {
      const cleanCpfCnpj = cpf_cnpj.replace(/\D/g, '');
      result = await pool.query(
        'SELECT id, cpf_cnpj, nome, email, senha_hash, tipo_documento, foto_url FROM melhor_casas_users WHERE cpf_cnpj = $1 OR cpf_cnpj = $2',
        [cpf_cnpj, cleanCpfCnpj]
      );
    }

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Verificar se é admin
    const adminEmails = process.env.ADMIN_EMAILS 
      ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
      : [];
    
    const adminCpfs = process.env.ADMIN_CPFS
      ? process.env.ADMIN_CPFS.split(',').map(c => c.replace(/\D/g, ''))
      : [];

    const userEmail = user.email?.toLowerCase();
    const userCpf = user.cpf_cnpj?.replace(/\D/g, '');

    // Log de debug para identificar problema
    console.log('[admin/login] Verificando acesso admin:', {
      userEmail,
      userCpf,
      adminEmails,
      adminCpfs,
      hasAdminEmails: adminEmails.length > 0,
      hasAdminCpfs: adminCpfs.length > 0,
      ADMIN_EMAILS_env: process.env.ADMIN_EMAILS ? 'configurado' : 'NÃO CONFIGURADO'
    });

    const isAdmin = 
      (userEmail && adminEmails.includes(userEmail)) ||
      (userCpf && adminCpfs.includes(userCpf));

    if (!isAdmin) {
      console.log('[admin/login] ❌ Acesso negado - usuário não é admin');
      return res.status(403).json({ 
        error: 'Acesso negado. Apenas administradores podem acessar o dashboard.',
        debug: process.env.NODE_ENV === 'development' ? {
          userEmail,
          adminEmails,
          hasAdminEmails: adminEmails.length > 0
        } : undefined
      });
    }

    console.log('[admin/login] ✅ Usuário é admin, permitindo acesso');

    // Gerar token JWT
    const token = jwt.sign(
      { userId: user.id, cpf_cnpj: user.cpf_cnpj, isAdmin: true },
      getJwtSecret(),
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login admin realizado com sucesso',
      user: {
        id: user.id,
        cpf_cnpj: user.cpf_cnpj,
        nome: user.nome,
        email: user.email,
        tipo_documento: user.tipo_documento,
        isAdmin: true
      },
      token
    });
  } catch (error) {
    console.error('Erro no login admin:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;

