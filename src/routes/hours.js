const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
const holidayService = require('../services/holidayService');

// Dados padrão das lojas (baseado no HTML fornecido)
const DEFAULT_STORES = [
  {
    id: 'carioca',
    name: 'Carioca (Centro)',
    city: 'Rio de Janeiro',
    state: 'RJ',
    address: 'Av. Alm. Barroso, 25 - Centro, Rio de Janeiro - RJ, 20031-003',
    hours: {
      mon: ['08:00-20:00'],
      tue: ['08:00-20:00'],
      wed: ['08:00-20:00'],
      thu: ['08:00-20:00'],
      fri: ['08:00-20:00'],
      sat: ['08:00-16:00'],
      sun: []
    }
  },
  {
    id: 'madureira',
    name: 'Madureira',
    city: 'Rio de Janeiro',
    state: 'RJ',
    address: 'R. Dagmar da Fonseca, 54 - Madureira, Rio de Janeiro - RJ, 21351-040',
    hours: {
      mon: ['08:30-19:30'],
      tue: ['08:30-19:30'],
      wed: ['08:30-19:30'],
      thu: ['08:30-19:30'],
      fri: ['08:30-19:30'],
      sat: ['08:30-19:30'],
      sun: []
    }
  },
  {
    id: 'bonsucesso',
    name: 'Bonsucesso',
    city: 'Rio de Janeiro',
    state: 'RJ',
    address: 'Praça das Nações, 88a - Bonsucesso, Rio de Janeiro - RJ, 21041-010',
    hours: {
      mon: ['08:30-20:00'],
      tue: ['08:30-20:00'],
      wed: ['08:30-20:00'],
      thu: ['08:30-20:00'],
      fri: ['08:30-20:00'],
      sat: ['08:30-19:00'],
      sun: []
    }
  },
  {
    id: 'nilopolis',
    name: 'Nilópolis',
    city: 'Nilópolis',
    state: 'RJ',
    address: 'Av. Getúlio Vargas, 1496 - Centro, Nilópolis - RJ, 26525-022',
    hours: {
      mon: ['09:00-20:00'],
      tue: ['09:00-20:00'],
      wed: ['09:00-20:00'],
      thu: ['09:00-20:00'],
      fri: ['09:00-20:00'],
      sat: ['09:00-20:00'],
      sun: []
    }
  },
  {
    id: 'santacruz',
    name: 'Santa Cruz',
    city: 'Rio de Janeiro',
    state: 'RJ',
    address: 'R. Felipe Cardoso, 615 - Santa Cruz, Rio de Janeiro - RJ, 23510-006',
    hours: {
      mon: ['08:30-20:00'],
      tue: ['08:30-20:00'],
      wed: ['08:30-20:00'],
      thu: ['08:30-20:00'],
      fri: ['08:30-20:00'],
      sat: ['08:30-20:00'],
      sun: []
    }
  },
  {
    id: 'mesquita',
    name: 'Mesquita',
    city: 'Mesquita',
    state: 'RJ',
    address: 'Rod. Pres. Dutra, 10521 - Jacutinga, Mesquita - RJ, 26574-751',
    hours: {
      mon: ['09:00-20:00'],
      tue: ['09:00-20:00'],
      wed: ['09:00-20:00'],
      thu: ['09:00-20:00'],
      fri: ['09:00-20:00'],
      sat: ['09:00-20:00'],
      sun: ['08:00-16:00']
    }
  },
  {
    id: 'saomateus',
    name: 'São Mateus (SP)',
    city: 'São Paulo',
    state: 'SP',
    address: 'Av. Mateo Bei, 2832 - São Mateus, São Paulo - SP, 03949-200',
    hours: {
      mon: ['09:00-19:30'],
      tue: ['09:00-19:30'],
      wed: ['09:00-19:30'],
      thu: ['09:00-19:30'],
      fri: ['09:00-19:30'],
      sat: ['09:00-19:30'],
      sun: ['09:00-17:00']
    }
  }
];

// Função para inicializar lojas padrão
const initDefaultStores = async () => {
  try {
    for (const store of DEFAULT_STORES) {
      const existing = await pool.query(
        'SELECT id FROM melhor_casas_store_hours WHERE store_id = $1',
        [store.id]
      );

      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO melhor_casas_store_hours (store_id, store_name, address, city, state, hours)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [store.id, store.name, store.address, store.city, store.state, JSON.stringify(store.hours)]
        );
      }
    }
  } catch (error) {
    console.error('Erro ao inicializar lojas padrão:', error);
  }
};

// GET /api/hours - Buscar todos os horários (público)
router.get('/', async (req, res) => {
  try {
    console.log('📥 [hours] GET /api/hours - Buscando horários...');
    
    // Verificar se a tabela existe, se não, criar
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'melhor_casas_store_hours'
      )
    `);
    
    if (!tableCheck.rows[0]?.exists) {
      console.log('⚠️ [hours] Tabela não existe, criando...');
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS melhor_casas_store_hours (
            id SERIAL PRIMARY KEY,
            store_id VARCHAR(50) UNIQUE NOT NULL,
            store_name VARCHAR(255) NOT NULL,
            address TEXT,
            city VARCHAR(100),
            state VARCHAR(2),
            hours JSONB NOT NULL DEFAULT '{}'::JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_store_hours_store_id ON melhor_casas_store_hours(store_id)');
        console.log('✅ [hours] Tabela criada com sucesso!');
      } catch (createError) {
        console.error('❌ [hours] Erro ao criar tabela:', createError);
        return res.status(500).json({ 
          error: 'Erro ao criar tabela de horários',
          message: createError.message 
        });
      }
    }

    const result = await pool.query(
      'SELECT store_id, store_name, address, city, state, hours FROM melhor_casas_store_hours ORDER BY store_name'
    );

    console.log(`✅ [hours] ${result.rows.length} lojas encontradas no banco`);

    // Se não houver lojas, inicializar com padrões
    if (result.rows.length === 0) {
      console.log('🔄 [hours] Nenhuma loja encontrada, inicializando lojas padrão...');
      await initDefaultStores();
      const newResult = await pool.query(
        'SELECT store_id, store_name, address, city, state, hours FROM melhor_casas_store_hours ORDER BY store_name'
      );
      console.log(`✅ [hours] ${newResult.rows.length} lojas padrão inicializadas`);
      return res.json(newResult.rows.map(row => {
        try {
          return {
            ...row,
            hours: typeof row.hours === 'string' ? JSON.parse(row.hours) : (row.hours || {})
          };
        } catch (parseError) {
          console.error('❌ [hours] Erro ao parsear hours:', parseError, 'Row:', row);
          return {
            ...row,
            hours: {}
          };
        }
      }));
    }

    const stores = result.rows.map(row => {
      try {
        return {
          ...row,
          hours: typeof row.hours === 'string' ? JSON.parse(row.hours) : (row.hours || {})
        };
      } catch (parseError) {
        console.error('❌ [hours] Erro ao parsear hours:', parseError, 'Row:', row);
        return {
          ...row,
          hours: {}
        };
      }
    });

    console.log('✅ [hours] Retornando', stores.length, 'lojas');
    res.json(stores);
  } catch (error) {
    console.error('❌ [hours] Erro ao buscar horários:', error);
    console.error('❌ [hours] Stack:', error.stack);
    res.status(500).json({ 
      error: 'Erro ao buscar horários',
      message: error.message 
    });
  }
});

// GET /api/hours/:storeId - Buscar horário de uma loja específica
router.get('/:storeId', async (req, res) => {
  try {
    const { storeId } = req.params;
    const result = await pool.query(
      'SELECT store_id, store_name, address, city, state, hours FROM melhor_casas_store_hours WHERE store_id = $1',
      [storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    const store = result.rows[0];
    res.json({
      ...store,
      hours: typeof store.hours === 'string' ? JSON.parse(store.hours) : store.hours
    });
  } catch (error) {
    console.error('Erro ao buscar horário da loja:', error);
    res.status(500).json({ error: 'Erro ao buscar horário da loja' });
  }
});

// PUT /api/hours/:storeId - Atualizar horário de uma loja (admin)
router.put('/:storeId', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    const { hours, store_name, address, city, state } = req.body;

    if (!hours) {
      return res.status(400).json({ error: 'Horários são obrigatórios' });
    }

    // Validar estrutura de hours
    const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    for (const day of validDays) {
      if (!hours.hasOwnProperty(day)) {
        return res.status(400).json({ error: `Dia ${day} é obrigatório` });
      }
      if (!Array.isArray(hours[day])) {
        return res.status(400).json({ error: `Horários do dia ${day} devem ser um array` });
      }
    }

    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (hours) {
      updateFields.push(`hours = $${paramIndex}`);
      updateValues.push(JSON.stringify(hours));
      paramIndex++;
    }

    if (store_name) {
      updateFields.push(`store_name = $${paramIndex}`);
      updateValues.push(store_name);
      paramIndex++;
    }

    if (address) {
      updateFields.push(`address = $${paramIndex}`);
      updateValues.push(address);
      paramIndex++;
    }

    if (city) {
      updateFields.push(`city = $${paramIndex}`);
      updateValues.push(city);
      paramIndex++;
    }

    if (state) {
      updateFields.push(`state = $${paramIndex}`);
      updateValues.push(state);
      paramIndex++;
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(storeId);

    const result = await pool.query(
      `UPDATE melhor_casas_store_hours 
       SET ${updateFields.join(', ')} 
       WHERE store_id = $${paramIndex}
       RETURNING store_id, store_name, address, city, state, hours`,
      updateValues
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    const updated = result.rows[0];
    res.json({
      ...updated,
      hours: typeof updated.hours === 'string' ? JSON.parse(updated.hours) : updated.hours
    });
  } catch (error) {
    console.error('Erro ao atualizar horário:', error);
    res.status(500).json({ error: 'Erro ao atualizar horário' });
  }
});

// POST /api/hours - Criar nova loja (admin)
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { store_id, store_name, address, city, state, hours } = req.body;

    if (!store_id || !store_name || !hours) {
      return res.status(400).json({ error: 'store_id, store_name e hours são obrigatórios' });
    }

    // Validar estrutura de hours
    const validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    for (const day of validDays) {
      if (!hours.hasOwnProperty(day)) {
        return res.status(400).json({ error: `Dia ${day} é obrigatório` });
      }
      if (!Array.isArray(hours[day])) {
        return res.status(400).json({ error: `Horários do dia ${day} devem ser um array` });
      }
    }

    const result = await pool.query(
      `INSERT INTO melhor_casas_store_hours (store_id, store_name, address, city, state, hours)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING store_id, store_name, address, city, state, hours`,
      [store_id, store_name, address || null, city || null, state || null, JSON.stringify(hours)]
    );

    const created = result.rows[0];
    res.status(201).json({
      ...created,
      hours: typeof created.hours === 'string' ? JSON.parse(created.hours) : created.hours
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Loja com este ID já existe' });
    }
    console.error('Erro ao criar loja:', error);
    res.status(500).json({ error: 'Erro ao criar loja' });
  }
});

// DELETE /api/hours/:storeId - Deletar loja (admin)
router.delete('/:storeId', authenticateAdmin, async (req, res) => {
  try {
    const { storeId } = req.params;
    const result = await pool.query(
      'DELETE FROM melhor_casas_store_hours WHERE store_id = $1 RETURNING store_id',
      [storeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Loja não encontrada' });
    }

    res.json({ message: 'Loja deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar loja:', error);
    res.status(500).json({ error: 'Erro ao deletar loja' });
  }
});

// GET /api/hours/holidays/upcoming - Buscar feriados próximos (público)
router.get('/holidays/upcoming', async (req, res) => {
  try {
    const dias = parseInt(req.query.days) || 60;
    console.log(`📅 [hours/holidays] Buscando feriados próximos (${dias} dias)`);
    
    const feriados = holidayService.getFeriadosProximos(dias);
    
    console.log(`✅ [hours/holidays] ${feriados.length} feriados encontrados`);
    res.json({ holidays: feriados });
  } catch (error) {
    console.error('❌ [hours/holidays] Erro ao buscar feriados:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar feriados',
      message: error.message 
    });
  }
});

module.exports = router;
