const jwt = require('jsonwebtoken');
const axios = require('axios');

/**
 * Gera o Token JWT blindado contra erros de formatação e fuso horário.
 */
function createAppleJWT(issuerId, keyId, privateKey) {
  // 1. Limpeza Profunda: Garante que a chave seja uma string e resolve 
  // quebras de linha que o .env ou o Windows podem ter bagunçado.
  const cleanKey = privateKey
    .toString()
    .replace(/\\n/g, '\n') // Converte literal '\n' em quebra de linha real
    .replace(/\r\n/g, '\n') // Normaliza Windows para Unix
    .trim();

  const now = Math.floor(Date.now() / 1000);

  // 2. Configuração do Payload
  const payload = {
    iss: issuerId,
    iat: now - 60,         // "iat" recuado em 60s evita o erro de "token do futuro"
    exp: now + (15 * 60),  // 15 minutos de validade (seguro dentro do limite de 20)
    aud: 'appstoreconnect-v1',
  };

  const signOptions = {
    algorithm: 'ES256',
    header: {
      alg: 'ES256',
      kid: keyId,
      typ: 'JWT'
    }
  };

  try {
    return jwt.sign(payload, cleanKey, signOptions);
  } catch (err) {
    console.error('❌ Erro ao assinar o JWT. Verifique se o arquivo .p8 é válido.');
    throw err;
  }
}

/**
 * Busca o relatório de vendas/downloads.
 */
async function fetchAppStoreSales(issuerId, keyId, privateKey, query) {
  const token = createAppleJWT(issuerId, keyId, privateKey);
  const url = 'https://api.appstoreconnect.apple.com/v1/salesReports';

  try {
    const res = await axios.get(url, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/a-gzip, application/json' 
      },
      params: query,
      responseType: 'arraybuffer', // Crucial para não corromper o GZIP da Apple
      timeout: 30000 
    });

    return { data: res.data, headers: res.headers };

  } catch (err) {
    // Tratamento para ler o erro JSON dentro do ArrayBuffer
    if (err.response && err.response.data) {
      const errorString = Buffer.from(err.response.data).toString('utf8');
      try {
        const errorJson = JSON.parse(errorString);
        console.error(`🍎 Erro Apple ${err.response.status}:`, JSON.stringify(errorJson, null, 2));
      } catch (e) {
        console.error(`🍎 Erro Apple ${err.response.status}:`, errorString);
      }
    } else {
      console.error(`❌ Erro na requisição:`, err.message);
    }
    throw err;
  }
}

module.exports = { fetchAppStoreSales, createAppleJWT };