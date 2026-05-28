# 🚀 Guia de Deploy - Backend Melhor das Casas

Este guia mostra como fazer deploy do backend em diferentes plataformas de nuvem.

## 📋 Opções de Hospedagem

### 1. **Railway** (Recomendado - Mais Fácil) ⭐

**Vantagens:**
- ✅ Plano gratuito com $5 de crédito/mês
- ✅ Deploy automático via GitHub
- ✅ PostgreSQL incluso
- ✅ Muito fácil de configurar

**Passos:**

1. Acesse [railway.app](https://railway.app) e faça login com GitHub
2. Clique em "New Project" → "Deploy from GitHub repo"
3. Selecione o repositório `APP-SHOPIFY`
4. Railway detecta automaticamente que é Node.js
5. Adicione PostgreSQL: "New" → "Database" → "PostgreSQL"
6. Configure variáveis de ambiente:
   - `DB_HOST` → pegue do PostgreSQL (railway mostra)
   - `DB_PORT` → `5432`
   - `DB_NAME` → nome do banco
   - `DB_USER` → usuário do banco
   - `DB_PASSWORD` → senha do banco
   - `DB_SSL` → `true`
   - `PORT` → `3001` (ou deixe Railway definir)
   - Outras variáveis do seu `.env`
7. Railway faz deploy automático!

**URL do servidor:** Railway fornece uma URL tipo `https://seu-app.up.railway.app`

---

### 2. **Render** (Gratuito com limitações)

**Vantagens:**
- ✅ Plano gratuito (dorme após 15min de inatividade)
- ✅ PostgreSQL gratuito
- ✅ Deploy via GitHub

**Passos:**

1. Acesse [render.com](https://render.com) e faça login
2. "New" → "Web Service"
3. Conecte seu repositório GitHub
4. Configure:
   - **Name:** `melhor-das-casas-backend`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Adicione PostgreSQL: "New" → "PostgreSQL" (Free)
6. Configure variáveis de ambiente (mesmas do Railway)
7. Deploy!

**URL:** `https://melhor-das-casas-backend.onrender.com`

⚠️ **Nota:** No plano gratuito, o servidor "dorme" após 15min sem uso. Primeira requisição pode demorar ~30s.

---

### 3. **Fly.io** (Gratuito e rápido)

**Vantagens:**
- ✅ Gratuito (3 VMs pequenas)
- ✅ Não dorme
- ✅ Muito rápido

**Passos:**

1. Instale Fly CLI: `npm install -g flyctl`
2. Login: `flyctl auth login`
3. No diretório `backend/`, execute:
   ```bash
   flyctl launch
   ```
4. Siga as perguntas (use Dockerfile)
5. Configure secrets (variáveis de ambiente):
   ```bash
   flyctl secrets set DB_HOST=... DB_USER=... etc
   ```
6. Deploy: `flyctl deploy`

---

### 4. **DigitalOcean App Platform** (Pago mas barato)

**Custo:** ~$5-12/mês

**Vantagens:**
- ✅ Não dorme
- ✅ Muito estável
- ✅ PostgreSQL gerenciado

---

## 🔧 Configurações Necessárias

### Variáveis de Ambiente

Configure estas variáveis na plataforma escolhida:

```env
NODE_ENV=production
PORT=3001

# Database
DB_HOST=seu-host-postgres
DB_PORT=5432
DB_NAME=nome_do_banco
DB_USER=usuario
DB_PASSWORD=senha
DB_SSL=true

# Shopify
SHOPIFY_STORE_URL=sua-loja.myshopify.com
SHOPIFY_API_KEY=sua-api-key
SHOPIFY_API_SECRET=sua-api-secret

# JWT
JWT_SECRET=seu-jwt-secret-super-seguro

# App
APP_BASE_URL=https://seu-dominio.com
DEFAULT_REVIEW_COUNTRY=BR
DEFAULT_REVIEW_EMAIL=avaliacao@seu-dominio.com
```

### Atualizar URL no App Mobile

Após o deploy, atualize `mobile-v54/app.json`:

```json
"extra": {
  "apiUrl": "https://seu-backend.railway.app/api"
}
```

E gere um novo APK.

---

## 📦 Upload de Arquivos

Para uploads funcionarem na nuvem, você tem 3 opções:

### Opção 1: Storage na nuvem (Recomendado)
- **AWS S3** (mais usado)
- **Cloudflare R2** (mais barato)
- **DigitalOcean Spaces**

### Opção 2: Volume persistente
- Railway e Render oferecem volumes
- Arquivos ficam no servidor

### Opção 3: Serviço de upload separado
- **Cloudinary** (imagens)
- **Uploadcare**

---

## 🎯 Recomendação Final

**Para começar:** Use **Railway** (mais fácil, $5 grátis/mês)

**Para produção:** **DigitalOcean App Platform** ou **AWS** (mais estável)

**Para economizar:** **Fly.io** (gratuito, não dorme)

---

## 📝 Próximos Passos

1. Escolha uma plataforma
2. Faça o deploy seguindo os passos acima
3. Configure variáveis de ambiente
4. Rode migrations: `npm run migrate` (ou configure na plataforma)
5. Atualize URL no app mobile
6. Gere novo APK

Precisa de ajuda com alguma plataforma específica? Me avise!














