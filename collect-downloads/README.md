Collect Downloads

Instruções e scripts para coletar dados de instalação/installs do Google Play e App Store Connect.

Credenciais / env vars necessárias:

- `PLAY_SERVICE_ACCOUNT_JSON` : conteúdo do JSON da service account (recomendado: base64 ou caminho seguro)
- `PLAY_PACKAGE_NAME` : package name do app (ex: com.example.app)
- `APPLE_PRIVATE_KEY` : conteúdo da chave `.p8` (recomendado: base64)
- `APPLE_KEY_ID` : Key ID criado no App Store Connect
- `APPLE_ISSUER_ID` : Issuer ID do App Store Connect
- `DATABASE_URL` : connection string para o banco Postgres

Links úteis (criar credenciais nessas páginas):

- Google Cloud / Service Accounts: https://console.cloud.google.com/iam-admin/serviceaccounts
- Google Play Console — API access: https://play.google.com/console (Settings -> API access)
- Play Developer Reporting API docs: https://developers.google.com/play/developer-reporting
- App Store Connect (Users and Access -> Keys): https://appstoreconnect.apple.com/
- App Store Connect API docs (Sales & Trends): https://developer.apple.com/documentation/appstoreconnectapi

Instalação de dependências (no `backend/`):

```bash
npm install googleapis axios jsonwebtoken pg node-cron
```

Exemplos de uso:

- `node run-all.js` — executa coletores e persiste resultados (usa `DATABASE_URL`).
- `node cron-example.js` — exemplo de agendamento diário.
