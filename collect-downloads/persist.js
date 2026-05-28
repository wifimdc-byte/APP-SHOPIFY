const { Client } = require('pg');

async function upsertInstalls(rows, opts = {}) {
  // rows: array of { store, report_date, country, installs, raw }
  const client = new Client({ 
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Necessário para conectar no Render de fora
    }
  });
  await client.connect();
  try {
    for (const r of rows) {
      // UPSERT: insert if not exists, update if exists (avoid duplicates)
      // A constraint única é (store, report_date, country), então precisamos usar os 3 campos no ON CONFLICT
      await client.query(
        `INSERT INTO app_store_installs (store, report_date, country, installs, raw)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (store, report_date, country) 
         DO UPDATE SET
          installs = EXCLUDED.installs,
          raw = EXCLUDED.raw`,
        [
          r.store,
          r.report_date,
          // Garante que nunca gravamos NULL em country,
          // para que a UNIQUE (store, report_date, country) realmente impeça duplicação
          r.country || 'BR',
          r.installs || 0,
          r.raw || {}
        ]
      );
    }
  } finally {
    await client.end();
  }
}

module.exports = { upsertInstalls };
