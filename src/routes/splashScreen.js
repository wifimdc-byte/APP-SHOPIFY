const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateAdmin } = require('../middleware/adminAuth');

const router = express.Router();

const splashDir = path.resolve(__dirname, '../../uploads/splash-screens');
fs.mkdirSync(splashDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, splashDir),
  filename: (_req, file, cb) => {
    // Sempre salvar como splash-screen.png
    const ext = path.extname(file.originalname || '.png') || '.png';
    cb(null, `splash-screen${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos'));
    }
  },
});

// GET - Obter URL da splash screen atual
router.get('/', async (req, res, next) => {
  try {
    const splashPath = path.join(splashDir, 'splash-screen.png');
    const splashExists = fs.existsSync(splashPath);
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
      splash: splashExists ? `${baseUrl}/uploads/splash-screens/splash-screen.png` : null,
      hasSplash: splashExists,
    });
  } catch (error) {
    next(error);
  }
});

// POST - Upload da splash screen
router.post('/', authenticateAdmin, upload.single('splash'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
      message: 'Splash screen atualizada com sucesso',
      splash: `${baseUrl}/uploads/splash-screens/splash-screen.png`,
      note: 'Uma nova build do app será necessária para aplicar as mudanças',
    });
  } catch (error) {
    next(error);
  }
});

// DELETE - Remover splash screen
router.delete('/', authenticateAdmin, async (req, res, next) => {
  try {
    const splashPath = path.join(splashDir, 'splash-screen.png');
    
    if (fs.existsSync(splashPath)) {
      fs.unlinkSync(splashPath);
    }
    
    res.json({ message: 'Splash screen removida com sucesso' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;














