const jwt = require('jsonwebtoken');
const fs = require('fs');
const axios = require('axios');
const zlib = require('zlib'); // Para descompactar o arquivo automaticamente

// --- CONFIGURAÇÕES ---
const KEY_ID = 'UMV4KKB7FX';
const ISSUER_ID = '38bef1ba-3756-45c5-92e4-b169f09f708b';
const PRIVATE_KEY = fs.readFileSync('./secrets/AuthKey_UMV4KKB7FX.p8'); 
const VENDOR_NUMBER = '93919240'; 

// --- 1. GERAÇÃO DO TOKEN COM AJUSTE DE TEMPO ---
function generateToken() {
    const now = Math.floor(Date.now() / 1000); // tempo atual em segundos
    
    const payload = {
        iss: ISSUER_ID,
        iat: now - 30,         // Criado há 30 segundos atrás (segurança contra atraso de servidor)
        exp: now + (10 * 60),  // Expira em 10 minutos (mais curto é mais seguro)
        aud: 'appstoreconnect-v1'
    };

    return jwt.sign(payload, PRIVATE_KEY, {
        algorithm: 'ES256',
        header: {
            alg: 'ES256',
            kid: KEY_ID,
            typ: 'JWT'
        }
    });
}

// --- 2. REQUISIÇÃO E DESCOMPACTAÇÃO ---
async function getDownloadsReport() {
    const token = generateToken();
    const url = 'https://api.appstoreconnect.apple.com/v1/salesReports';
    
    const params = {
        'filter[frequency]': 'DAILY',
        'filter[reportDate]': '2026-01-25', // Use uma data de 3-4 dias atrás para garantir que existe
        'filter[reportSubType]': 'SUMMARY',
        'filter[reportType]': 'SALES',
        'filter[vendorNumber]': VENDOR_NUMBER
    };

    try {
        console.log("Iniciando requisição...");
        const response = await axios.get(url, {
            params,
            headers: { 'Authorization': `Bearer ${token}` },
            responseType: 'stream'
        });

        // A Apple envia um .gz, vamos salvar direto como .csv descompactado
        const outputPath = './relatorio_final.csv';
        const gunzip = zlib.createGunzip();
        const dest = fs.createWriteStream(outputPath);

        response.data.pipe(gunzip).pipe(dest);

        dest.on('finish', () => {
            console.log('✅ Sucesso! Relatório salvo e descompactado em:', outputPath);
        });

    } catch (error) {
        // Se der erro 401 ou 404, o código abaixo extrai a mensagem real do stream
        if (error.response && error.response.data) {
            let errorData = '';
            error.response.data.on('data', (chunk) => { errorData += chunk; });
            error.response.data.on('end', () => {
                console.error('❌ Detalhes do Erro na Apple:', errorData);
            });
        } else {
            console.error('❌ Erro de conexão:', error.message);
        }
    }
}

getDownloadsReport();