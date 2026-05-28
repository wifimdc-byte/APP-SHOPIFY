const jwt = require('jsonwebtoken');
const axios = require('axios');

// ----------------------------------------------------
// COLE AQUI O CONTEÚDO DO ARQUIVO .p8 DIRETO (Com crases ` `)
// ----------------------------------------------------
const PRIVATE_KEY_CONTENT = `-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQgESHSqfo1i2lpVRGe
+MHIL8XZCzcyeoX3sZQYdeo6vQ+gCgYIKoZIzj0DAQehRANCAASQ2MGddN97dLXQ
Noczxva4vqU6YJftF2sYPcj4/HVjg44nOtovPs/At9uDpCo8thvXVr178iAclbFH
0d1VMfNw
-----END PRIVATE KEY-----`;
// ----------------------------------------------------

// SEUS DADOS
const ISSUER_ID = "38bef1ba-3756-45c5-92e4-b169f09f708b";
const KEY_ID = "UMV4KKB7FX"; // O ID novo do seu log anterior

async function testeFinal() {
    console.log('🔥 Teste sem leitura de arquivo (Hardcoded Key String)...');
    
    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
        {
            iss: ISSUER_ID,
            iat: now,
            exp: now + 900, // 15 min
            aud: "appstoreconnect-v1"
        },
        PRIVATE_KEY_CONTENT,
        {
            algorithm: "ES256",
            header: { alg: "ES256", kid: KEY_ID, typ: "JWT" }
        }
    );

    try {
        console.log('📡 Enviando requisição...');
        const res = await axios.get('https://api.appstoreconnect.apple.com/v1/apps?limit=1', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ SUCESSO ABSOLUTO! O problema era a leitura do arquivo.');
        console.log(res.data);
    } catch (err) {
        console.error('❌ Falha 401.');
        if (err.response) console.log(err.response.data);
        
        console.log('\n👇 DIAGNÓSTICO FINAL:');
        console.log('Se deu erro aqui, o problema é sua conta Apple Developer.');
        console.log('Verifique:');
        console.log('1. A anuidade de $99 expirou? (Isso bloqueia a API)');
        console.log('2. O Issuer ID copiado não é desse time.');
    }
}

testeFinal();