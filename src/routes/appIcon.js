const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateAdmin } = require('../middleware/adminAuth');

const router = express.Router();

const iconsDir = path.resolve(__dirname, '../../uploads/app-icons');
fs.mkdirSync(iconsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, iconsDir),
  filename: (_req, file, cb) => {
    // Sempre salvar como icon.png e adaptive-icon.png
    const ext = path.extname(file.originalname || '.png') || '.png';
    cb(null, `icon${ext}`);
  },
});

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

// GET - Obter URL do ícone atual
router.get('/', async (req, res, next) => {
  try {
    const iconPath = path.join(iconsDir, 'icon.png');
    const adaptiveIconPath = path.join(iconsDir, 'adaptive-icon.png');
    
    const iconExists = fs.existsSync(iconPath);
    const adaptiveIconExists = fs.existsSync(adaptiveIconPath);
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
      icon: iconExists ? `${baseUrl}/uploads/app-icons/icon.png` : null,
      adaptiveIcon: adaptiveIconExists ? `${baseUrl}/uploads/app-icons/adaptive-icon.png` : null,
      hasIcon: iconExists,
      hasAdaptiveIcon: adaptiveIconExists,
    });
  } catch (error) {
    next(error);
  }
});

// POST - Upload do ícone
router.post('/', authenticateAdmin, upload.single('icon'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const iconPath = req.file.path;
    const adaptiveIconPath = path.join(iconsDir, 'adaptive-icon.png');
    
    // Copiar o ícone também como adaptive-icon
    fs.copyFileSync(iconPath, adaptiveIconPath);
    
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    res.json({
      message: 'Ícone atualizado com sucesso',
      icon: `${baseUrl}/uploads/app-icons/icon.png`,
      adaptiveIcon: `${baseUrl}/uploads/app-icons/adaptive-icon.png`,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE - Remover ícone
router.delete('/', authenticateAdmin, async (req, res, next) => {
  try {
    const iconPath = path.join(iconsDir, 'icon.png');
    const adaptiveIconPath = path.join(iconsDir, 'adaptive-icon.png');
    
    if (fs.existsSync(iconPath)) {
      fs.unlinkSync(iconPath);
    }
    if (fs.existsSync(adaptiveIconPath)) {
      fs.unlinkSync(adaptiveIconPath);
    }
    
    res.json({ message: 'Ícone removido com sucesso' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;














