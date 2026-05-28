const { Storage } = require('@google-cloud/storage');

const BUCKET_NAME = 'pubsite_prod_9052168897379011814';

async function debugPlayCSV(serviceAccountJson, packageName, targetDate) {
  const credentials = typeof serviceAccountJson === 'string'
    ? JSON.parse(serviceAccountJson)
    : serviceAccountJson;

  const storage = new Storage({
    projectId: credentials.project_id,
    credentials,
  });

  const dateObj = new Date(targetDate);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');

  const prefix = `stats/installs/installs_${packageName}_${year}${month}_`;

  console.log(`\n📁 Buscando arquivos no Google Cloud Storage...`);
  console.log(`   Bucket: ${BUCKET_NAME}`);
  console.log(`   Prefix: ${prefix}\n`);

  try {
    const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix });

    if (!files.length) {
      console.error('❌ Nenhum arquivo encontrado neste mês.');
      process.exit(1);
    }

    console.log(`✅ Encontrados ${files.length} arquivo(s):\n`);
    files.forEach((f, i) => {
      console.log(`   ${i + 1}. ${f.name}`);
    });

    // Usar o arquivo overview se existir, senão usar o último
    const file = files.find(f => f.name.includes('overview.csv')) || files[files.length - 1];
    console.log(`\n📥 Baixando: ${file.name}\n`);

    const [buffer] = await file.download();

    // Tentar decodificações
    let csvData = buffer.toString('utf16le');
    if (!csvData.includes('Date') && !csvData.includes('date')) {
      csvData = buffer.toString('utf8');
    }

    const lines = csvData.split(/\r?\n/);
    console.log(`📊 Total de linhas: ${lines.length}\n`);

    // Mostrar cabeçalho
    const headers = lines[0].split('\t').length > 1 ? lines[0].split('\t') : lines[0].split(',');
    console.log('📋 Cabeçalhos encontrados:');
    headers.forEach((h, i) => {
      const clean = h.replace(/"/g, '').trim();
      console.log(`   [${i}] ${clean}`);
    });

    // Mostrar primeiras linhas de dados
    console.log('\n📊 Primeiras 5 linhas de dados:\n');
    for (let i = 1; i < Math.min(6, lines.length); i++) {
      const row = lines[i].split('\t').length > 1 ? lines[i].split('\t') : lines[i].split(',');
      const cleanRow = row.map(v => v.replace(/"/g, '').trim());
      console.log(`   Linha ${i}: ${cleanRow.join(' | ')}`);
    }

    // Procurar coluna de installs
    const cleanHeaders = headers.map(h => h.replace(/"/g, '').trim().toLowerCase());
    console.log('\n🔍 Procurando coluna de installs...\n');

    const searchTerms = [
      'daily user installs',
      'daily device installs',
      'installs',
      'downloads',
      'daily installs',
      'user installs',
      'device installs'
    ];

    let foundIndex = -1;
    for (const term of searchTerms) {
      foundIndex = cleanHeaders.findIndex(h => h.includes(term));
      if (foundIndex !== -1) {
        console.log(`✅ Encontrada coluna no índice [${foundIndex}]: "${headers[foundIndex].replace(/"/g, '').trim()}"`);
        break;
      }
    }

    if (foundIndex === -1) {
      console.error('❌ Coluna de installs não encontrada!');
      console.error('   Colunas disponíveis:');
      cleanHeaders.forEach((h, i) => {
        console.error(`   [${i}] ${h}`);
      });
      process.exit(1);
    }

    // Mostrar valores da coluna de installs
    console.log(`\n📈 Valores da coluna [${foundIndex}]:\n`);
    for (let i = 1; i < Math.min(10, lines.length); i++) {
      const row = lines[i].split('\t').length > 1 ? lines[i].split('\t') : lines[i].split(',');
      const date = row[0].replace(/"/g, '').trim();
      const installs = row[foundIndex].replace(/"/g, '').trim();
      console.log(`   ${date}: ${installs}`);
    }

    console.log('\n✅ Debug concluído!\n');
    console.log('Se você vir valores > 0 acima, a coluna está correta.');
    console.log('Se tiver zeros, confirme qual coluna tem os dados reais.\n');

  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  const playJson = process.env.PLAY_SERVICE_ACCOUNT_JSON;
  const packageName = process.env.PLAY_PACKAGE_NAME;

  if (!playJson || !packageName) {
    console.error('❌ PLAY_SERVICE_ACCOUNT_JSON e PLAY_PACKAGE_NAME não definidas');
    process.exit(1);
  }

  const targetDate = process.argv[2] || new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  
  try {
    const credentials = JSON.parse(playJson);
    debugPlayCSV(credentials, packageName, targetDate);
  } catch (e) {
    console.error('❌ Erro ao parsear PLAY_SERVICE_ACCOUNT_JSON:', e.message);
    process.exit(1);
  }
}

module.exports = { debugPlayCSV };
