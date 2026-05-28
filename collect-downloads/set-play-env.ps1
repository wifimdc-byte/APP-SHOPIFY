param(
  [string]$FilePath = "./app-downloads-485712-af07a2852d9d.json"
)

if (-not (Test-Path $FilePath)) {
  Write-Error "Service account file not found: $FilePath"
  exit 2
}

$json = Get-Content -Raw $FilePath

# Export for current PowerShell session
$env:PLAY_SERVICE_ACCOUNT_JSON = $json
Write-Host "PLAY_SERVICE_ACCOUNT_JSON set for current session."

$env:PLAY_PACKAGE_NAME = "com.melhordascasas.app"  # <--- SEU ID AQUI

Write-Host "PLAY_SERVICE_ACCOUNT_JSON set for current session."
Write-Host "PLAY_PACKAGE_NAME set to com.melhordascasas.app" # <--- Aviso visual

$env:DATABASE_URL = "postgresql://app_melhordascasas_user:WpoQtLsghMeliM2rp2Zxfhz6i3rNY3M5@dpg-d4g6fic9c44c73d6u5n0-a.virginia-postgres.render.com/app_melhordascasas"

Write-Host "Variáveis de ambiente configuradas com sucesso."

try {
  $obj = $json | ConvertFrom-Json
  Write-Host "Detected client_email:" $obj.client_email
  Write-Host "Detected project_id:" $obj.project_id
} catch {
  Write-Warning "Could not parse JSON to show client_email/project_id."
}

Write-Host "Run: node run-all.js  (from backend/collect-downloads) after also setting DATABASE_URL and PLAY_PACKAGE_NAME"
