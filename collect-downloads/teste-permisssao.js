const {google} = require('googleapis');
// Ajuste o caminho do seu JSON se necessário
const serviceAccount = require('./app-downloads-485712-af07a2852d9d.json'); 

async function verificarAcesso() {
  console.log("Autenticando...");
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/androidpublisher']
  });

  const client = await auth.getClient();
  const play = google.androidpublisher({ version: 'v3', auth: client });
  const packageName = 'com.melhordascasas.app';

  try {
    console.log(`Tentando acessar o app: ${packageName}...`);
    // Tenta apenas ler os dados básicos do app
    const res = await play.edits.insert({ packageName });
    console.log("✅ SUCESSO! Permissão confirmada.");
    console.log("O erro 404 na outra API é porque seu app ainda não tem dados de métricas gerados pelo Google.");
  } catch (err) {
    console.log("❌ FALHA DE PERMISSÃO!");
    console.log("Seu robô não tem acesso ao app no Play Console.");
    if (err.response) {
        console.log("Erro Google:", err.response.status, err.response.statusText);
    } else {
        console.log("Erro:", err.message);
    }
  }
}

verificarAcesso();