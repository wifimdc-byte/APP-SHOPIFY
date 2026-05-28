const { fetchPlayInstalls } = require('./google-play-fetch');
const { fetchAppStoreSales } = require('./appstore-fetch');
const { upsertInstalls } = require('./persist');
const { parsePlayMetrics, parseAppStoreReport } = require('./parse');
const fs = require('fs');
const path = require('path');

// Carrega variáveis do .env
try {
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });
} catch (e) {
  // ignore
}

async function runAll() {
  // --- 1. CONFIGURAÇÕES DE DATAS ---
  const START_DATE_ANDROID = "2025-12-21";
  const START_DATE_APPLE = "2026-01-12";
  
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const endDate = yesterday.toISOString().slice(0, 10);

  // --- 2. TRATAMENTO DO JSON DO GOOGLE PLAY ---
  const playJsonRaw = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  const packageName = process.env.PLAY_PACKAGE_NAME;

  if (!playJsonRaw) {
    throw new Error('PLAY_SERVICE_ACCOUNT_JSON não definido no ambiente');
  }

  let playJson = JSON.parse(playJsonRaw);

  // Corrige quebras de linha da chave privada
  if (playJson.private_key) {
    playJson.private_key = playJson.private_key.replace(/\\n/g, '\n');
  }
  
    // --- 3. TRATAMENTO DA CHAVE APPLE ---
  function getAppleKey() {
    if (process.env.APPLE_PRIVATE_KEY) {
      return Buffer.from(process.env.APPLE_PRIVATE_KEY, 'base64').toString('utf8');
    }
    if (process.env.APPLE_P8_PATH) {
      try {
        const p = process.env.APPLE_P8_PATH;
        const resolvedPath = path.isAbsolute(p) ? p : path.resolve(__dirname, p);
        if (fs.existsSync(resolvedPath)) {
          return fs.readFileSync(resolvedPath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
        }
      } catch (err) {
        console.warn('⚠️ Erro ao ler arquivo .p8:', err.message);
      }
    }
    return null;
  }

  const appleKey = getAppleKey();

  const results = [];

  console.log(`🚀 Iniciando Coleta Melhor das Casas`);
  console.log(`📅 Data Final: ${endDate}\n`);

  // --- 4. COLETA GOOGLE PLAY ---
  if (playJson && packageName) {
    try {
      console.log(`📱 [Google Play] Coletando de ${START_DATE_ANDROID} até ${endDate}...`);
      const data = await fetchPlayInstalls(playJson, packageName, START_DATE_ANDROID, endDate);
      
      if (data && data.dailyPoints) {
        data.dailyPoints.forEach(point => {
          results.push({
            store: 'google',
            report_date: point.date,
            // Usamos sempre 'BR' para evitar duplicação por NULL na constraint
            country: 'BR',
            installs: point.installs,
            raw: { source: 'google_csv' }
          });
        });
        console.log(`✅ [Google Play] ${data.dailyPoints.length} dias processados.`);
      }
    } catch (err) {
      console.error('❌ Erro no Google Play:', err.message);
    }
  }

  // --- 5. COLETA APPLE APP STORE ---
  if (process.env.APPLE_ISSUER_ID && process.env.APPLE_KEY_ID && appleKey) {
    console.log(`\n🍎 [App Store] Coletando de ${START_DATE_APPLE} até ${endDate}...`);
    
    let currentLoopDate = new Date(START_DATE_APPLE + 'T12:00:00Z');
    const finalDate = new Date(endDate + 'T12:00:00Z');

    while (currentLoopDate <= finalDate) {
      const dateString = currentLoopDate.toISOString().slice(0, 10);
      
      const query = {
        'filter[frequency]': 'DAILY',
        'filter[reportDate]': dateString,
        'filter[reportType]': 'SALES',
        'filter[reportSubType]': 'SUMMARY',
        'filter[vendorNumber]': '93919240',
      };

      try {
        const res = await fetchAppStoreSales(process.env.APPLE_ISSUER_ID, process.env.APPLE_KEY_ID, appleKey, query);
        const parsed = parseAppStoreReport(res.data, res.headers || {});
        
        results.push({ 
          store: 'apple', 
          report_date: dateString, 
          // Usamos sempre 'BR' para evitar duplicação por NULL na constraint
          country: 'BR', 
          installs: parsed.installs, 
          raw: { source: 'apple_api_v1' } 
        });
        console.log(`   🍎 ${dateString}: ✅ ${parsed.installs}`);
      } catch (err) {
        if (err.response && err.response.status === 404) {
          // Relatório não disponível ou sem vendas
        } else {
          console.error(`   🍎 ${dateString}: ❌ Erro:`, err.message);
        }
      }

      currentLoopDate.setUTCDate(currentLoopDate.getUTCDate() + 1);
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // --- 6. PERSISTÊNCIA ---
  if (results.length) {
    try {
      console.log(`\n💾 Salvando ${results.length} registros no banco...`);
      await upsertInstalls(results);
      console.log('✨ Sincronização concluída!');
    } catch (err) {
      console.error('❌ Erro ao salvar no banco de dados:', err.message);
    }
  } else {
    console.log('⚠️ Nenhum dado para salvar.');
  }
}

runAll();

module.exports = { runAll };