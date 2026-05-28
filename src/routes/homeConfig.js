const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const homeConfigService = require('../services/homeConfigService');

const router = express.Router();

const bannersDir = path.resolve(__dirname, '../../uploads/banners');
fs.mkdirSync(bannersDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, bannersDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || '.jpg') || '.jpg';
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos'));
    }
  },
});

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  return next();
};

router.get('/templates', authenticateToken, async (req, res, next) => {
  try {
    console.log('[homeConfig] GET /templates - Usuário autenticado:', req.user?.email || req.user?.nome);
    const templates = await homeConfigService.listTemplates();
    console.log('[homeConfig] Retornando templates:', templates.length);
    res.json({ templates });
  } catch (error) {
    console.error('[homeConfig] Erro ao listar templates:', error);
    next(error);
  }
});

router.post(
  '/templates',
  authenticateToken,
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  handleValidation,
  async (req, res, next) => {
    try {
      const { name, description } = req.body;
      const result = await homeConfigService.createTemplate({
        name,
        description,
        user: req.user?.email || req.user?.nome || 'dashboard',
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

router.get('/templates/:templateId', authenticateToken, async (req, res, next) => {
  try {
    const detail = await homeConfigService.getTemplateById(req.params.templateId);
    if (!detail) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

router.put(
  '/templates/:templateId/layout',
  authenticateToken,
  body('sections').optional().isArray(),
  body('banners').optional().isArray(),
  handleValidation,
  async (req, res, next) => {
    try {
      const payload = req.body.payload || {
        sections: req.body.sections,
        banners: req.body.banners,
        metadata: req.body.metadata,
      };
      const version = await homeConfigService.saveDraftPayload(
        req.params.templateId,
        payload,
        req.user?.email || req.user?.nome || 'dashboard',
        req.body.notes
      );
      res.json({ draftVersion: version });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/templates/:templateId/draft', authenticateToken, async (req, res, next) => {
  try {
    const draft = await homeConfigService.duplicateFromActive(
      req.params.templateId,
      req.user?.email || req.user?.nome || 'dashboard'
    );
    res.status(201).json({ draft });
  } catch (error) {
    next(error);
  }
});

router.post('/templates/:templateId/publish', authenticateToken, async (req, res, next) => {
  try {
    const { versionId } = req.body;
    const result = await homeConfigService.publishVersion(
      req.params.templateId,
      versionId,
      req.user?.email || req.user?.nome || 'dashboard'
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/templates/:templateId/versions', authenticateToken, async (req, res, next) => {
  try {
    const detail = await homeConfigService.getTemplateById(req.params.templateId);
    if (!detail) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }
    res.json({ versions: detail.versions });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/media/banner',
  authenticateToken,
  upload.single('image'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Arquivo obrigatório' });
      }
      const publicPath = `/uploads/banners/${req.file.filename}`;
      res.status(201).json({
        url: publicPath,
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/published', async (req, res, next) => {
  try {
    const { templateId } = req.query;
    const data = await homeConfigService.getPublishedLayout(templateId);
    if (!data) {
      return res.status(404).json({ error: 'Nenhum template publicado' });
    }
    res.json(data);
  } catch (error) {
    next(error);
  }
});

module.exports = router;


