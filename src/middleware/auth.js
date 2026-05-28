const jwt = require('jsonwebtoken');
const pool = require('../database/connection');

const authenticateToken = async (req, res, next) => {
  console.log('🔐 [auth] Middleware authenticateToken chamado');
  console.log('🔐 [auth] URL:', req.url);
  console.log('🔐 [auth] Method:', req.method);
  
  const authHeader = req.headers['authorization'];
  console.log('🔐 [auth] Authorization header:', authHeader ? `${authHeader.substring(0, 20)}...` : 'não encontrado');
  
  const token = authHeader && authHeader.split(' ')[1];
  console.log('🔐 [auth] Token extraído:', token ? `${token.substring(0, 20)}...` : 'não encontrado');

  if (!token) {
    console.error('❌ [auth] Token não fornecido');
    return res.status(401).json({ error: 'Token de acesso necessário' });
  }

  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_jwt_secret_key_here') {
      console.error('⚠️ JWT_SECRET não configurado! Usando chave padrão (NÃO SEGURO PARA PRODUÇÃO)');
      // Em desenvolvimento, usar uma chave padrão se não estiver configurado
      process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';
    }
    
    console.log('🔐 [auth] Verificando token JWT...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ [auth] Token decodificado:', { userId: decoded.userId, cpf_cnpj: decoded.cpf_cnpj });
    
    // Verificar se o usuário ainda existe - usar melhor_casas_users (mesma tabela usada no login)
    console.log('🔍 [auth] Buscando usuário no banco com userId:', decoded.userId);
    let userResult;
    try {
      console.log('🔍 [auth] Executando query para buscar usuário...');
      console.log('🔍 [auth] Pool status antes da query:', {
        totalCount: pool.totalCount,
        idleCount: pool.idleCount,
        waitingCount: pool.waitingCount
      });
      
      userResult = await pool.query(
        'SELECT id, cpf_cnpj, nome, email, tipo_documento FROM melhor_casas_users WHERE id = $1',
        [decoded.userId]
      );
      
      console.log('✅ [auth] Query executada. Rows encontradas:', userResult.rows.length);
    } catch (dbError) {
      console.error('❌ [auth] Erro ao buscar usuário no banco:', dbError);
      console.error('❌ [auth] Detalhes do erro DB:', {
        message: dbError.message,
        code: dbError.code,
        detail: dbError.detail,
        stack: dbError.stack,
        name: dbError.name
      });
      console.error('❌ [auth] Erro completo:', JSON.stringify(dbError, Object.getOwnPropertyNames(dbError), 2));
      
      // Tentar novamente após um pequeno delay
      console.log('🔄 [auth] Tentando novamente após 500ms...');
      await new Promise(resolve => setTimeout(resolve, 500));
      try {
        userResult = await pool.query(
          'SELECT id, cpf_cnpj, nome, email, tipo_documento FROM melhor_casas_users WHERE id = $1',
          [decoded.userId]
        );
        console.log('✅ [auth] Retry bem-sucedido. Rows encontradas:', userResult.rows.length);
      } catch (retryError) {
        console.error('❌ [auth] Erro no retry da query:', retryError);
        console.error('❌ [auth] Detalhes do erro no retry:', {
          message: retryError.message,
          code: retryError.code,
          detail: retryError.detail,
          stack: retryError.stack
        });
        return res.status(500).json({ error: 'Erro ao verificar usuário no banco de dados' });
      }
    }

    if (userResult.rows.length === 0) {
      console.error('[auth] Usuário não encontrado. userId:', decoded.userId);
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    req.user = {
      ...userResult.rows[0],
      id: userResult.rows[0].id, // Garantir que id está presente
      userId: userResult.rows[0].id, // Adicionar userId para compatibilidade
    };
    console.log('[auth] req.user definido:', { id: req.user.id, userId: req.user.userId, nome: req.user.nome });
    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    console.error('Header Authorization recebido:', req.headers['authorization']);
    console.error('Token (truncado):', token ? `${token.slice(0, 10)}...${token.slice(-6)}` : 'N/A');
    return res.status(403).json({ error: 'Token inválido', details: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

module.exports = { authenticateToken };






