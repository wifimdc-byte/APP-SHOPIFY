const pool = require('../database/connection');

const DEFAULT_LAYOUT = {
  metadata: {
    theme: 'default',
    lastModifiedBy: null,
  },
  sections: [],
  banners: [],
};

const sanitizeLayoutPayload = (payload = {}) => {
  const safePayload = { ...DEFAULT_LAYOUT, ...payload };
  safePayload.sections = Array.isArray(payload.sections) ? payload.sections : [];
  safePayload.banners = Array.isArray(payload.banners) ? payload.banners : [];
  safePayload.metadata = {
    ...DEFAULT_LAYOUT.metadata,
    ...(typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata : {}),
  };
  return safePayload;
};

const mapTemplate = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  status: row.status,
  publishedAt: row.published_at,
  activeVersionId: row.active_version_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapVersion = (row) => (row ? {
  id: row.id,
  templateId: row.template_id,
  version: row.version,
  status: row.status,
  payload: row.payload || DEFAULT_LAYOUT,
  notes: row.notes,
  createdBy: row.created_by,
  createdAt: row.created_at,
} : null);

// Layout inicial aproximando o que o app já faz em HomeScreen.js
const getInitialAppLikeLayout = () =>
  sanitizeLayoutPayload({
    metadata: {
      theme: 'default',
      lastModifiedBy: 'system',
      heroLayout: 'banner principal fixo',
    },
    sections: [
      {
        id: 'section-featured',
        section_key: 'featured_collection',
        section_type: 'featured',
        title: 'Coleção em destaque',
        config: {
          // collectionId fica null para não sobrescrever a config do app
          collectionId: null,
          limit: 10,
        },
      },
      {
        id: 'section-secondary',
        section_key: 'secondary_collection',
        section_type: 'collection',
        title: 'Ofertas especiais',
        config: {
          collectionId: null,
          limit: 6,
        },
      },
    ],
    // banners começa vazio para o app continuar usando os banners locais
    banners: [],
  });

// Garante que existe pelo menos UM template publicado com payload inicial
// - Se já houver template publicado: só retorna o id
// - Se não houver publicado mas houver template criado (ex: "home v1" vazio):
//   publica uma versão inicial nesse template
// - Se não houver nenhum template: cria "Layout padrão do app" e publica
const ensureDefaultTemplate = async () => {
  console.log('[ensureDefaultTemplate] Verificando templates existentes...');
  // Já existe algum publicado?
  const published = await pool.query(
    'SELECT id FROM home_templates WHERE status = $1 LIMIT 1',
    ['published']
  );
  console.log('[ensureDefaultTemplate] Templates publicados encontrados:', published.rows.length);
  if (published.rows.length > 0) {
    console.log('[ensureDefaultTemplate] Retornando template publicado:', published.rows[0].id);
    return published.rows[0].id;
  }

  // Não há publicado. Ver se já existe algum template (ex: home v1 que você criou).
  const existing = await pool.query(
    'SELECT id FROM home_templates ORDER BY updated_at DESC LIMIT 1'
  );
  console.log('[ensureDefaultTemplate] Templates existentes (não publicados):', existing.rows.length);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let template;
    if (existing.rows.length > 0) {
      // Usar o template já criado (ex: home v1)
      const templateId = existing.rows[0].id;
      console.log('[ensureDefaultTemplate] Template existente encontrado, ID:', templateId);
      // Buscar versões usando o client da transação
      const versionsResult = await client.query(
        `SELECT * FROM home_template_versions WHERE template_id = $1 ORDER BY version DESC`,
        [templateId]
      );
      const versions = versionsResult.rows.map(mapVersion);
      console.log('[ensureDefaultTemplate] Versões encontradas:', versions.length);
      
      const detail = { versions };

      // Se já tiver payload não vazio em alguma versão, só publica a mais recente.
      const hasAnyPayload =
        detail.versions?.some(
          (v) =>
            v?.payload &&
            (Array.isArray(v.payload.sections) ? v.payload.sections.length > 0 : false) ||
            (Array.isArray(v.payload.banners) ? v.payload.banners.length > 0 : false)
        ) || false;

      let payloadToUse = hasAnyPayload
        ? detail.versions[0].payload // mais recente
        : getInitialAppLikeLayout();

      const versionNumber = await getNextVersionNumber(templateId);

      const versionResult = await client.query(
        `
          INSERT INTO home_template_versions (template_id, version, status, payload, created_by, notes)
          VALUES ($1, $2, 'published', $3::jsonb, $4, $5)
          RETURNING *
        `,
        [
          templateId,
          versionNumber,
          JSON.stringify(payloadToUse),
          'system',
          hasAnyPayload
            ? 'Versão publicada automaticamente a partir do template existente'
            : 'Versão inicial criada automaticamente com layout padrão do app',
        ]
      );
      const publishedVersion = versionResult.rows[0];

      const updateResult = await client.query(
        `
          UPDATE home_templates
          SET active_version_id = $1,
              status = 'published',
              published_at = NOW()
          WHERE id = $2
          RETURNING *
        `,
        [publishedVersion.id, templateId]
      );
      template = updateResult.rows[0];
    } else {
      // Nenhum template existe – criar um novo padrão
      const templateResult = await client.query(
        `
          INSERT INTO home_templates (name, description, status, created_by, updated_by, created_at, updated_at)
          VALUES ($1, $2, 'draft', $3, $3, NOW(), NOW())
          RETURNING *
        `,
        ['Layout padrão do app', 'Layout inicial espelhando a Home atual', 'system']
      );
      template = templateResult.rows[0];

      const initialPayload = getInitialAppLikeLayout();

      const versionResult = await client.query(
        `
          INSERT INTO home_template_versions (template_id, version, status, payload, created_by, notes)
          VALUES ($1, $2, 'published', $3::jsonb, $4, $5)
          RETURNING *
        `,
        [template.id, 1, JSON.stringify(initialPayload), 'system', 'Versão inicial criada automaticamente']
      );
      const publishedVersion = versionResult.rows[0];

      await client.query(
        `
          UPDATE home_templates
          SET active_version_id = $1,
              status = 'published',
              published_at = NOW()
          WHERE id = $2
        `,
        [publishedVersion.id, template.id]
      );
    }

    await client.query('COMMIT');
    console.log('[ensureDefaultTemplate] Template criado/publicado com sucesso:', template.id);
    return template.id;
  } catch (error) {
    console.error('[ensureDefaultTemplate] Erro ao criar template:', error);
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const listTemplates = async () => {
  // Garante que existe pelo menos um template baseado na Home atual
  try {
    console.log('[homeConfigService] Garantindo template padrão...');
    await ensureDefaultTemplate();
    console.log('[homeConfigService] Template padrão garantido');
  } catch (error) {
    console.error('[homeConfigService] Erro ao garantir template padrão:', error);
    // Continuar mesmo se houver erro
  }

  const { rows } = await pool.query(`
    SELECT ht.*, hv.version as active_version, hv.status as active_status
    FROM home_templates ht
    LEFT JOIN home_template_versions hv ON hv.id = ht.active_version_id
    ORDER BY ht.updated_at DESC
  `);
  
  console.log('[homeConfigService] Templates encontrados no banco:', rows.length);

  const draftResult = await pool.query(`
    SELECT DISTINCT ON (template_id)
      id, template_id, version, status, created_at
    FROM home_template_versions
    WHERE status = 'draft'
    ORDER BY template_id, created_at DESC
  `);

  const draftsByTemplate = draftResult.rows.reduce((acc, row) => {
    acc[row.template_id] = row;
    return acc;
  }, {});

  const mapped = rows.map((row) => ({
    ...mapTemplate(row),
    activeVersion: row.active_version,
    activeStatus: row.active_status,
    latestDraft: draftsByTemplate[row.id] || null,
  }));
  
  console.log('[homeConfigService] Templates mapeados:', mapped.length);
  return mapped;
};

const createTemplate = async ({ name, description, user }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const templateResult = await client.query(
      `
        INSERT INTO home_templates (name, description, status, created_by, updated_by)
        VALUES ($1, $2, 'draft', $3, $3)
        RETURNING *
      `,
      [name, description || null, user || 'system']
    );
    const template = templateResult.rows[0];

    const initialPayload = sanitizeLayoutPayload({
      metadata: { ...DEFAULT_LAYOUT.metadata, lastModifiedBy: user || 'system' },
    });

    const versionResult = await client.query(
      `
        INSERT INTO home_template_versions (template_id, version, status, payload, created_by, notes)
        VALUES ($1, $2, 'draft', $3::jsonb, $4, $5)
        RETURNING *
      `,
      [template.id, 1, JSON.stringify(initialPayload), user || 'system', 'Versão inicial']
    );

    await client.query('COMMIT');
    return {
      template: mapTemplate(template),
      draftVersion: mapVersion(versionResult.rows[0]),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const getTemplateById = async (templateId) => {
  const templateResult = await pool.query(
    'SELECT * FROM home_templates WHERE id = $1',
    [templateId]
  );
  if (templateResult.rows.length === 0) {
    return null;
  }
  const template = templateResult.rows[0];

  const versionsResult = await pool.query(
    `
      SELECT * FROM home_template_versions
      WHERE template_id = $1
      ORDER BY version DESC
    `,
    [templateId]
  );

  let versions = versionsResult.rows.map(mapVersion);
  let draftVersion = versions.find((v) => v.status === 'draft') || null;
  let publishedVersion =
    versions.find((v) => v.status === 'published' && v.id === template.active_version_id) ||
    versions.find((v) => v.status === 'published') ||
    null;

  // Se nenhuma versão tiver layout (sem sections/banners), injetar um layout inicial
  const hasAnyLayout =
    versions.length > 0 &&
    versions.some(
      (v) =>
        v?.payload &&
        ((Array.isArray(v.payload.sections) && v.payload.sections.length > 0) ||
          (Array.isArray(v.payload.banners) && v.payload.banners.length > 0))
    );

  if (!hasAnyLayout) {
    const initial = getInitialAppLikeLayout();
    // Se existir rascunho, usar nele, senão em qualquer versão
    if (draftVersion) {
      draftVersion = { ...draftVersion, payload: initial };
      versions = versions.map((v) => (v.id === draftVersion.id ? draftVersion : v));
    } else if (versions[0]) {
      versions[0] = { ...versions[0], payload: initial };
    } else {
      // Nenhuma versão - retornar apenas payload inicial como draft virtual
      draftVersion = mapVersion({
        id: null,
        template_id: template.id,
        version: 1,
        status: 'draft',
        payload: initial,
        notes: 'Layout inicial virtual',
        created_by: 'system',
        created_at: new Date(),
      });
      versions = [draftVersion];
    }
    if (!publishedVersion && versions[0]) {
      publishedVersion = versions[0];
    }
  }

  return {
    template: mapTemplate(template),
    versions,
    draftVersion,
    publishedVersion,
  };
};

const getNextVersionNumber = async (templateId) => {
  const result = await pool.query(
    'SELECT COALESCE(MAX(version), 0) + 1 as next FROM home_template_versions WHERE template_id = $1',
    [templateId]
  );
  return result.rows[0]?.next || 1;
};

const ensureDraftVersion = async (templateId, user) => {
  const existingDraft = await pool.query(
    `
      SELECT * FROM home_template_versions
      WHERE template_id = $1 AND status = 'draft'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [templateId]
  );
  if (existingDraft.rows.length > 0) {
    return existingDraft.rows[0];
  }

  const templateDetail = await getTemplateById(templateId);
  if (!templateDetail) {
    throw new Error('Template não encontrado');
  }
  const basePayload = templateDetail.publishedVersion?.payload || DEFAULT_LAYOUT;
  const versionNumber = await getNextVersionNumber(templateId);

  const result = await pool.query(
    `
      INSERT INTO home_template_versions (template_id, version, status, payload, created_by, notes)
      VALUES ($1, $2, 'draft', $3::jsonb, $4, $5)
      RETURNING *
    `,
    [templateId, versionNumber, JSON.stringify(basePayload), user || 'system', 'Rascunho criado automaticamente']
  );
  return result.rows[0];
};

const saveDraftPayload = async (templateId, payload, user, notes) => {
  const draft = await ensureDraftVersion(templateId, user);
  const sanitizedPayload = sanitizeLayoutPayload({
    ...payload,
    metadata: {
      ...payload?.metadata,
      lastModifiedBy: user || payload?.metadata?.lastModifiedBy || 'system',
      updatedAt: new Date().toISOString(),
    },
  });

  const result = await pool.query(
    `
      UPDATE home_template_versions
      SET payload = $1::jsonb,
          notes = COALESCE($2, notes)
      WHERE id = $3
      RETURNING *
    `,
    [JSON.stringify(sanitizedPayload), notes || draft.notes, draft.id]
  );

  await pool.query(
    `
      UPDATE home_templates
      SET updated_at = NOW(), updated_by = $1
      WHERE id = $2
    `,
    [user || 'system', templateId]
  );

  return mapVersion(result.rows[0]);
};

const publishVersion = async (templateId, versionId, user) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let targetVersionId = versionId;
    if (!targetVersionId) {
      const latestDraft = await client.query(
        `
          SELECT id FROM home_template_versions
          WHERE template_id = $1 AND status = 'draft'
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [templateId]
      );
      if (latestDraft.rows.length === 0) {
        throw new Error('Nenhum rascunho disponível para publicar');
      }
      targetVersionId = latestDraft.rows[0].id;
    }

    const versionResult = await client.query(
      `
        SELECT * FROM home_template_versions
        WHERE id = $1 AND template_id = $2
      `,
      [targetVersionId, templateId]
    );
    if (versionResult.rows.length === 0) {
      throw new Error('Versão não encontrada para este template');
    }

    // Marcar versões publicadas anteriores como "ready" (estado neutro permitido pelo CHECK)
    await client.query(
      `
        UPDATE home_template_versions
        SET status = 'ready'
        WHERE template_id = $1 AND status = 'published'
      `,
      [templateId]
    );

    await client.query(
      `
        UPDATE home_template_versions
        SET status = 'published'
        WHERE id = $1
      `,
      [targetVersionId]
    );

    const templateUpdate = await client.query(
      `
        UPDATE home_templates
        SET active_version_id = $1,
            status = 'published',
            published_at = NOW(),
            updated_at = NOW(),
            updated_by = $2
        WHERE id = $3
        RETURNING *
      `,
      [targetVersionId, user || 'system', templateId]
    );

    await client.query('COMMIT');
    return {
      template: mapTemplate(templateUpdate.rows[0]),
      publishedVersion: mapVersion(versionResult.rows[0]),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const duplicateFromActive = async (templateId, user) => {
  const templateDetail = await getTemplateById(templateId);
  if (!templateDetail) {
    throw new Error('Template não encontrado');
  }
  const payloadToClone = templateDetail.publishedVersion?.payload || DEFAULT_LAYOUT;
  const versionNumber = await getNextVersionNumber(templateId);

  const result = await pool.query(
    `
      INSERT INTO home_template_versions (template_id, version, status, payload, created_by, notes)
      VALUES ($1, $2, 'draft', $3::jsonb, $4, $5)
      RETURNING *
    `,
    [
      templateId,
      versionNumber,
      JSON.stringify({
        ...payloadToClone,
        metadata: {
          ...payloadToClone.metadata,
          lastDuplicatedBy: user || 'system',
          duplicatedAt: new Date().toISOString(),
        },
      }),
      user || 'system',
      'Rascunho duplicado do publicado',
    ]
  );
  return mapVersion(result.rows[0]);
};

const getPublishedLayout = async (templateId) => {
  // Garante que há um template publicado com layout inicial
  await ensureDefaultTemplate();

  const params = [];
  let query = `
    SELECT ht.*, hv.payload, hv.version
    FROM home_templates ht
    LEFT JOIN home_template_versions hv ON hv.id = ht.active_version_id
    WHERE ht.status = 'published'
  `;
  if (templateId) {
    params.push(templateId);
    query += ' AND ht.id = $1';
  }
  query += ' ORDER BY ht.published_at DESC NULLS LAST LIMIT 1';

  const result = await pool.query(query, params);
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0];
  return {
    template: mapTemplate(row),
    payload: row.payload || DEFAULT_LAYOUT,
    version: row.version,
  };
};

module.exports = {
  listTemplates,
  createTemplate,
  getTemplateById,
  saveDraftPayload,
  publishVersion,
  duplicateFromActive,
  getPublishedLayout,
};


