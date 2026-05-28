const jwt = require('jsonwebtoken');
const pool = require('../database/connection');

/**
 * Middleware para verificar se o usuário é admin
 * Lista de admins configurada via variável de ambiente ADMIN_EMAILS ou ADMIN_CPFS
 */
const authenticateAdmin = async (req, res, next) => {
  // Primeiro verifica autenticação normal
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso necessário' });
  }

  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_jwt_secret_key_here') {
      process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_change_in_production';
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Verificar se o usuário ainda existe
    const userResult = await pool.query(
      'SELECT id, cpf_cnpj, nome, email, tipo_documento FROM melhor_casas_users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    req.user = userResult.rows[0];

    // Verificar se é admin
    const adminEmails = process.env.ADMIN_EMAILS 
      ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
      : [];
    
    const adminCpfs = process.env.ADMIN_CPFS
      ? process.env.ADMIN_CPFS.split(',').map(c => c.replace(/\D/g, ''))
      : [];

    const userEmail = req.user?.email?.toLowerCase();
    const userCpf = req.user?.cpf_cnpj?.replace(/\D/g, '');

    const isAdmin = 
      (userEmail && adminEmails.includes(userEmail)) ||
      (userCpf && adminCpfs.includes(userCpf));

    if (!isAdmin) {
      return res.status(403).json({ 
        error: 'Acesso negado. Apenas administradores podem acessar esta área.' 
      });
    }

    req.user.isAdmin = true;
    next();
  } catch (error) {
    console.error('Erro na autenticação admin:', error);
    return res.status(403).json({ error: 'Token inválido' });
  }
};

module.exports = { authenticateAdmin };

