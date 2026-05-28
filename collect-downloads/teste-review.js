const {google} = require('googleapis');
// Verifique se o nome do seu arquivo JSON está correto aqui
const serviceAccount = require('./app-downloads-485712-af07a2852d9d.json'); 

async function testeReviews() {
  console.log("=== TESTE DE LEITURA DE REVIEWS (TEMPO REAL) ===");
  
  const auth = new google.auth.GoogleAuth({
    credentials: serviceAccount,
    scopes: ['https://www.googleapis.com/auth/androidpublisher']
  });

  const client = await auth.getClient();
  const play = google.androidpublisher({ version: 'v3', auth: client });
  const packageName = 'com.melhordascasas.app'; // Seu ID correto

  try {
    console.log(`Buscando avaliações para: ${packageName}...`);
    
    const res = await play.reviews.list({
      packageName: packageName,
      maxResults: 5 // Traz só as 5 últimas para teste
    });

    console.log("✅ SUCESSO! Conexão estabelecida com o app.");
    
    if (res.data.reviews && res.data.reviews.length > 0) {
      console.log(`🎉 Encontramos ${res.data.reviews.length} avaliações!`);
      console.log("Exemplo da primeira avaliação:", res.data.reviews[0].comments[0].userComment.text);
    } else {
      console.log("⚠️ A conexão funcionou (Status 200), mas a lista de reviews voltou vazia.");
      console.log("Isso significa que o app existe para a API, mas talvez não tenha comentários de texto ainda.");
    }
    
  } catch (err) {
    console.log("❌ ERRO:");
    console.log(err.message);
    if (err.response) {
        console.log("Status:", err.response.status);
        console.log("Permissões necessárias: 'Responder a avaliações' no Console.");
    }
  }
}

testeReviews();