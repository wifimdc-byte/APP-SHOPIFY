const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { runAll: runDownloadCollector } = require('../../collect-downloads/run-all');

let isSyncing = false;

// POST /api/downloads/refresh - Aciona a coleta de dados
router.post('/refresh', (req, res) => {
  if (isSyncing) {
    return res.status(429).json({
      ok: false,
      message: 'A sincronização já está em andamento. Tente novamente em alguns minutos.'
    });
  }

  res.status(202).json({ 
    ok: true, 
    message: 'A coleta de dados foi iniciada. Os dados serão atualizados em breve.' 
  });

  // Roda o script em background
  isSyncing = true;
  console.log('🔄 Iniciando coleta de downloads via API...');
  
  runDownloadCollector()
    .then(() => {
      console.log('✅ Coleta de downloads concluída com sucesso.');
    })
    .catch(err => {
      console.error('❌ Erro durante a coleta de downloads via API:', err);
    })
    .finally(() => {
      isSyncing = false;
      console.log('🏁 Processo de coleta de downloads finalizado.');
    });
});


// GET /api/downloads/summary?days=30
router.get('/summary', async (req, res) => {
  try {
    const daysParam = req.query.days || '30';

    let fromDate = null;

    if (daysParam !== 'total') {
      const days = parseInt(daysParam, 10);
      fromDate = new Date(Date.now() - days * 24 * 3600 * 1000)
        .toISOString()
        .slice(0,10);
    }

    const q = `
      SELECT store, COALESCE(SUM(installs),0)::bigint AS installs, COUNT(*) FILTER (WHERE installs IS NULL) AS raw_rows
      FROM app_store_installs
      WHERE ($1::date IS NULL OR report_date >= $1)
      GROUP BY store
      ORDER BY store
    `;
    const r = await pool.query(q, [fromDate]);
    res.json({ ok: true, data: r.rows });
  } catch (err) {
    console.error('Error /api/downloads/summary', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// GET /api/downloads/total?days=30 - Total agregado de todos os períodos
router.get('/total', async (req, res) => {
  try {
    const daysParam = req.query.days || '30';

    let fromDate = null;

    if (daysParam !== 'total') {
      const days = parseInt(daysParam, 10);
      fromDate = new Date(Date.now() - days * 24 * 3600 * 1000)
        .toISOString()
        .slice(0,10);
    }


    const q = `
      SELECT 
        'total' as store,
        COALESCE(SUM(installs),0)::bigint AS installs
      FROM app_store_installs
      WHERE ($1::date IS NULL OR report_date >= $1)
    `;
    const r = await pool.query(q, [fromDate]);
    const total = r.rows[0]?.installs || 0;
    
    // Também retornar breakdown por store
    const breakdown = await pool.query(`
      SELECT store, COALESCE(SUM(installs),0)::bigint AS installs
      FROM app_store_installs
      WHERE ($1::date IS NULL OR report_date >= $1)
      GROUP BY store
      ORDER BY store
    `, [fromDate]);

    res.json({ 
      ok: true, 
      total: total,
      breakdown: breakdown.rows
    });
  } catch (err) {
    console.error('Error /api/downloads/total', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// GET /api/downloads/daily?days=30 - Dados diários para gráfico
router.get('/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const fromDate = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0,10);

    const q = `
      SELECT 
        report_date,
        store,
        installs
      FROM app_store_installs
      WHERE ($1::date IS NULL OR report_date >= $1)
      ORDER BY report_date, store
    `;
    const r = await pool.query(q, [fromDate]);
    
    // Transformar em formato para gráfico: { date, google, apple }
    const dataMap = new Map();
    r.rows.forEach(row => {
      if (!dataMap.has(row.report_date)) {
        dataMap.set(row.report_date, { date: row.report_date });
      }
      const entry = dataMap.get(row.report_date);
      entry[row.store] = row.installs || 0;
    });

    const data = Array.from(dataMap.values());
    
    res.json({ 
      ok: true, 
      data: data
    });
  } catch (err) {
    console.error('Error /api/downloads/daily', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

module.exports = router;
