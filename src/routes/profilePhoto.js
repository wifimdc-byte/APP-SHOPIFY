const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../database/connection');

const router = express.Router();

// Usar memória em vez de disco para persistência garantida no banco
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

// POST - Upload de foto de perfil
router.post('/', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }

    const userId = req.user.id;
    
    console.log('📸 [profilePhoto] Processando imagem em memória...');

    // Processar imagem: redimensionar e converter para buffer
    const processedBuffer = await sharp(req.file.buffer)
      .resize(400, 400, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality: 80 }) // Qualidade um pouco menor para economizar espaço no banco
      .toBuffer();
    
    // Converter para Base64 Data URI
    const base64Image = `data:image/jpeg;base64,${processedBuffer.toString('base64')}`;
    
    console.log('📸 [profilePhoto] Imagem convertida para Base64. Tamanho:', base64Image.length, 'chars');

    // Atualizar foto_url no banco de dados com a string Base64
    await pool.query(
      'UPDATE melhor_casas_users SET foto_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [base64Image, userId]
    );

    console.log('✅ [profilePhoto] Foto salva no banco de dados com sucesso!');

    res.json({
      message: 'Foto de perfil atualizada com sucesso',
      foto_url: base64Image
    });
  } catch (error) {
    console.error('❌ [profilePhoto] Erro ao fazer upload da foto:', error);
    res.status(500).json({ error: 'Erro ao fazer upload da foto de perfil' });
  }
});

// DELETE - Remover foto de perfil
router.delete('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Remover do banco
    await pool.query(
      'UPDATE melhor_casas_users SET foto_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
    
    res.json({ message: 'Foto de perfil removida com sucesso' });
  } catch (error) {
    console.error('Erro ao remover foto:', error);
    res.status(500).json({ error: 'Erro ao remover foto de perfil' });
  }
});

module.exports = router;
