#!/usr/bin/env node
// Script para desabilitar coleta iOS temporariamente
// Execute: node disable-ios-collection.js

const fs = require('fs');
const path = require('path');

const runAllPath = path.resolve(__dirname, 'run-all.js');
const content = fs.readFileSync(runAllPath, 'utf8');

// Verificar se já está desabilizado
if (content.includes('// DISABLED: Apple Store collection')) {
  console.log('✅ iOS já está desabilizado');
  process.exit(0);
}

// Comentar a seção Apple
const modified = content.replace(
  /\s+if \(process\.env\.APPLE_ISSUER_ID && process\.env\.APPLE_KEY_ID && appleKey\) \{[\s\S]*?^\s+\}/m,
  `
  // DISABLED: Apple Store collection (401 permission issue)
  // Re-enable after API Key is fixed
  /*
  if (process.env.APPLE_ISSUER_ID && process.env.APPLE_KEY_ID && appleKey) {
    try {
      console.log(\`\\n🍎 [App Store] Buscando dados para \${endDate}...\`);
      const query = {
        'filter[frequency]': 'DAILY',
        'filter[reportDate]': endDate,
        'filter[reportType]': 'SALES',
        'filter[reportSubType]': 'SUMMARY',
      };
      const res = await fetchAppStoreSales(process.env.APPLE_ISSUER_ID, process.env.APPLE_KEY_ID, appleKey, query);
      const parsed = parseAppStoreReport(res.data, res.headers || {});
      console.log(\`🍎 [App Store] Parsed installs:\`, parsed.installs);
      
      results.push({ store: 'apple', report_date: endDate, country: null, installs: parsed.installs, raw: { headers: res.headers, length: res.data.length } });
    } catch (err) {
      console.error('App Store fetch error', err.message || err);
    }
  }
  */
`
);

fs.writeFileSync(runAllPath, modified, 'utf8');
console.log('✅ iOS desabilizado em run-all.js');
console.log('   Dashboard mostrará apenas Android (838 installs)');
console.log('   Para reabilitar: remova os comentários em run-all.js');
