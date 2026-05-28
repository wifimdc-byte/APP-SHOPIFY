// ALTERNATIVAS PARA COLETAR DADOS DO APP STORE
// Execute: node collect-downloads/alternatives.js

const fs = require('fs');
const path = require('path');

console.log(`
╔══════════════════════════════════════════════════════════════════╗
║         ALTERNATIVAS PARA COLETAR DADOS DO APP STORE             ║
╚══════════════════════════════════════════════════════════════════╝

🔴 PROBLEMA ATUAL: API Key retorna 401 Unauthorized (falta de permissão)

✅ SOLUÇÕES ALTERNATIVAS:
\n`);

const options = [
  {
    num: 'A',
    title: 'Corrigir permissão da API Key (RECOMENDADO)',
    steps: [
      '1. Acesse: https://appstoreconnect.apple.com/',
      '2. Users and Access → Keys',
      '3. Procure por chave "TT89HULZB3"',
      '4. Verifique se status está "Active"',
      '5. Clique no nome da chave → Edit',
      '6. Confirme que "Sales & Trends" está MARCADO',
      '7. Save',
      '8. Aguarde 5-10 minutos',
      '9. Execute: node collect-downloads/test-appstore.js',
      '',
      'Se continuar 401:',
      '- Crie NOVA API Key:',
      '  a) Keys → "Generate Key"',
      '  b) Access level: "Finance"',
      '  c) Aguarde gerar',
      '  d) Download o arquivo .p8',
      '  e) Atualize .env com APPLE_KEY_ID e APPLE_P8_PATH',
      '  f) Teste novamente'
    ],
    difficulty: '⭐⭐ (Médio)',
    timeToFix: '10-15 min',
    dataAvailability: '✅ Completo (últimos 90 dias)'
  },
  {
    num: 'B',
    title: 'Importar CSV manualmente do App Store',
    steps: [
      '1. App Store Connect → Sales & Trends',
      '2. Abra report para "App" com dados desejados',
      '3. Filtro: Date range (ex: últimos 90 dias)',
      '4. Clique download → CSV',
      '5. Salve arquivo em: backend/collect-downloads/appstore-exports/',
      '6. Crie script que faz parse do CSV e insere em DB',
      '',
      'Exemplo estrutura CSV:',
      'Date,Units,Revenue,Country',
      '01/01/2026,50,100,BR',
      '01/02/2026,45,95,BR',
      '',
      'Vantagem: Não depende de API',
      'Desvantagem: Manual, precisa atualizar a cada período'
    ],
    difficulty: '⭐⭐⭐ (Médio-Alto)',
    timeToFix: '30 min (setup uma vez)',
    dataAvailability: '✅ Completo (último export)'
  },
  {
    num: 'C',
    title: 'Desabilitar iOS temporariamente (MAIS RÁPIDO)',
    steps: [
      '1. Edit: backend/collect-downloads/run-all.js',
      '2. Comente a seção Apple:',
      '',
      '// console.log("[Apple] Coletando dados...");',
      '// try {',
      '//   await appStoreFetch.collectDownloads();',
      '// } catch (err) {',
      '//   console.error("[Apple] Erro:", err.message);',
      '// }',
      '',
      '3. Dashboard mostrará apenas Android (838 installs)',
      '4. Revisite depois quando API resolver',
      '',
      'Vantagem: Solução rápida, não bloqueia resto do app',
      'Desvantagem: Sem dados iOS'
    ],
    difficulty: '⭐ (Muito Fácil)',
    timeToFix: '2 min',
    dataAvailability: '❌ Sem dados iOS'
  }
];

options.forEach(opt => {
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║ OPÇÃO ${opt.num}: ${opt.title}`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);
  console.log(`Dificuldade:    ${opt.difficulty}`);
  console.log(`Tempo estimado: ${opt.timeToFix}`);
  console.log(`Dados iOS:      ${opt.dataAvailability}\n`);
  
  console.log('Passos:\n');
  opt.steps.forEach(step => {
    if (step.startsWith(' ')) {
      console.log(`  ${step}`);
    } else {
      console.log(step);
    }
  });
  console.log('\n');
});

console.log(`
════════════════════════════════════════════════════════════════════
RECOMENDAÇÃO:
  Tente primeiro OPÇÃO A (5-10 min)
  Se continuar 401 → OPÇÃO B (30 min setup)
  Se precisar go live rápido → OPÇÃO C (2 min)
════════════════════════════════════════════════════════════════════

OUTRAS IDEIAS (menos diretas):
- Contatar Apple Support para debugar API Key
- Usar biblioteca pronta: npm install app-store-connect-api
- Coletar dados via Web scraping (frágil, não recomendado)
- Usar integração de terceiros (Sensor Tower, etc)

Status atual do Android: ✅ 838 installs coletados
Status atual do iOS: ❌ Bloqueado por 401

Quando tiver solução, execute:
  npm run collect:downloads

`);

console.log('\n📝 Logs anteriores salvos em:');
console.log('  - test-appstore.js (último teste)');
console.log('  - validate-p8.js (validação arquivo)');
console.log('  - debug-appstore-2.js (JWT comparison)');
