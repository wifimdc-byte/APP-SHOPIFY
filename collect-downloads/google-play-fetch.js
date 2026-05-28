const { Storage } = require('@google-cloud/storage');

// SEU BUCKET (Mantenha o seu original)
const BUCKET_NAME = 'pubsite_prod_9052168897379011814'; 

async function fetchPlayInstalls(serviceAccountJson, packageName, startDate, endDate) {
  const credentials = typeof serviceAccountJson === 'string' 
    ? JSON.parse(serviceAccountJson) 
    : serviceAccountJson;

  const storage = new Storage({
    projectId: credentials.project_id,
    credentials,
  });

  // Gerar lista de meses a buscar
  const months = new Set();
  const [startYear, startMonth] = startDate.split('-').slice(0, 2).map(x => parseInt(x));
  const [endYear, endMonth] = endDate.split('-').slice(0, 2).map(x => parseInt(x));
  
  let year = startYear;
  let month = startMonth;
  
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const monthStr = String(month).padStart(2, '0');
    months.add(`${year}${monthStr}`);
    month++;
    if (month > 12) { month = 1; year++; }
  }

  console.log(`[Google Play] Buscando meses: ${Array.from(months).join(', ')}`);

  const dailyPoints = []; // Acumular pontos diários aqui
  let totalInstalls = 0;

  for (const monthKey of months) {
    const prefix = `stats/installs/installs_${packageName}_${monthKey}_`;
    
    try {
      const [files] = await storage.bucket(BUCKET_NAME).getFiles({ prefix });
      
      if (!files.length) continue;

      // Prioriza o arquivo 'overview.csv'
      const file = files.find(f => f.name.includes('overview.csv')) || files[files.length - 1];
      console.log(`[Google Play] Lendo: ${file.name}`);
      
      const [buffer] = await file.download();
      
      let csvData = buffer.toString('utf16le');
      if (!csvData.includes('Date')) {
          csvData = buffer.toString('utf8');
      }

      const lines = csvData.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) continue;

      const separator = lines[0].includes('\t') ? '\t' : ',';
      const headers = lines[0].split(separator).map(h => h.replace(/"/g, '').trim());

      const dateIdx = 0;
      let installIdx = headers.findIndex(h => h.toLowerCase().includes('daily user installs'));
      if (installIdx === -1) installIdx = headers.findIndex(h => h.toLowerCase().includes('daily device installs'));

      if (installIdx === -1) {
        console.warn(`[Google Play] Coluna de installs não encontrada em ${monthKey}`);
        continue;
      }

      let monthTotal = 0;
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(separator);
        if (row.length <= installIdx) continue;

        const rowDate = row[dateIdx].replace(/"/g, '').trim(); 
        const installs = parseInt(row[installIdx].replace(/"/g, ''), 10) || 0;
        
        if (rowDate >= startDate && rowDate <= endDate) {
          dailyPoints.push({ date: rowDate, installs: installs });
          totalInstalls += installs;
          monthTotal += installs;
        }
      }
      if (monthTotal > 0) {
        console.log(`[Google Play] Mês ${monthKey}: +${monthTotal} installs`);
      }
      
    } catch (err) {
      console.warn(`[Google Play] Erro no mês ${monthKey}:`, err.message);
    }
  }

  console.log(`[Google Play] Total: ${totalInstalls} (${dailyPoints.length} dias)`);

  // Retorna no formato que o run-all.js espera
  return { dailyPoints };
}

module.exports = { fetchPlayInstalls };