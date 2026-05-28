const zlib = require('zlib');

// Mantendo sua função de extração numérica original
function _extractNumericValue(obj) {
  if (obj == null) return null;
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'string') {
    const n = Number(obj);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof obj === 'object') {
    if ('int64Value' in obj) return Number(obj.int64Value);
    if ('doubleValue' in obj) return Number(obj.doubleValue);
    if ('integerValue' in obj) return Number(obj.integerValue);
    if ('value' in obj && (typeof obj.value === 'number' || typeof obj.value === 'string')) return _extractNumericValue(obj.value);
    for (const k of Object.keys(obj)) {
      const v = _extractNumericValue(obj[k]);
      if (v != null) return v;
    }
  }
  return null;
}

function parsePlayMetrics(data) {
  try {
    if (!data) return { installs: null };

    // --- ADIÇÃO PARA TRATAR O CSV DO GOOGLE PLAY QUE APARECEU NO SEU LOG ---
    if (typeof data === 'string' || Buffer.isBuffer(data)) {
      const text = data.toString('utf8');
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length >= 2) {
        const header = lines[0].split(',');
        // No seu log apareceu: "using coluna [6]: Daily User Installs"
        const idx = header.findIndex(h => h.includes('Daily User Installs'));
        if (idx !== -1) {
          const lastLine = lines[lines.length - 1].split(',');
          const val = parseInt(lastLine[idx], 10);
          return { installs: isNaN(val) ? 0 : val };
        }
      }
    }

    // --- SUA LÓGICA ORIGINAL DE JSON (Protobuf/API) ---
    if (Array.isArray(data.metricSeries) && data.metricSeries.length) {
      let total = 0;
      for (const series of data.metricSeries) {
        const points = series.points || series.timeSeries || series.values || [];
        if (Array.isArray(points)) {
          for (const p of points) {
            const v = _extractNumericValue(p.value || p);
            if (v != null) total += v;
          }
        }
      }
      return { installs: total };
    }

    let total = 0;
    (function walk(o) {
      if (o == null) return;
      if (typeof o === 'number') { total += o; return; }
      if (typeof o === 'string') { const n = Number(o); if (Number.isFinite(n)) total += n; return; }
      if (typeof o === 'object') {
        for (const k in o) walk(o[k]);
      }
    })(data);
    return { installs: total || null };
  } catch (err) {
    return { installs: null };
  }
}

// Sua função original de split (útil para CSVs por vírgula)
function _splitCsvLine(line) {
  const res = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; } else { inQuotes = !inQuotes; }
      continue;
    }
    if (ch === ',' && !inQuotes) { res.push(cur); cur = ''; continue; }
    cur += ch;
  }
  res.push(cur);
  return res;
}

function parseAppStoreReport(buffer, headers = {}) {
  try {
    if (!buffer) return { installs: null };

    let text;
    try {
      // Apple sempre manda GZIP. Tenta descompactar primeiro.
      text = zlib.gunzipSync(buffer).toString('utf8');
    } catch (e) {
      text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
    }

    // Normalização para evitar o erro de "Coluna não encontrada"
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return { installs: 0 };

    // Limpa o cabeçalho de caracteres invisíveis e divide por TABULAÇÃO
    const header = lines[0].replace(/^\uFEFF/, '').split('\t').map(h => h.trim());
    
    const unitsIdx = header.indexOf('Units');
    const productTypeIdx = header.indexOf('Product Type Identifier');

    if (unitsIdx === -1) {
      // Se não achou 'Units' exato, tenta busca parcial (case insensitive)
      const unitsAltIdx = header.findIndex(h => h.toLowerCase().includes('units'));
      if (unitsAltIdx === -1) {
        console.warn("⚠️ Coluna 'Units' não encontrada.");
        return { installs: 0 };
      }
    }

    let totalInstalls = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const type = cols[productTypeIdx] ? cols[productTypeIdx].trim() : '';
      
      // Filtro para instalações reais (ignora updates/redownloads)
      if (type === '1' || type === '1F') {
        const n = parseInt(cols[unitsIdx], 10);
        if (!Number.isNaN(n)) totalInstalls += n;
      }
    }

    return { installs: totalInstalls };

  } catch (err) {
    console.error('❌ Erro no parse da Apple:', err.message);
    return { installs: null };
  }
}

module.exports = { parsePlayMetrics, parseAppStoreReport };