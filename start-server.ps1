# Script para iniciar o servidor backend limpo
Write-Host "🔍 Verificando processos na porta 3001..." -ForegroundColor Yellow

# Encontrar e matar processos na porta 3001
$connections = netstat -ano | Select-String "3001" | Select-String "LISTENING"
if ($connections) {
    foreach ($conn in $connections) {
        $pid = ($conn -split '\s+')[-1]
        if ($pid) {
            Write-Host "🛑 Finalizando processo PID $pid..." -ForegroundColor Red
            taskkill /PID $pid /F 2>$null
        }
    }
}

Start-Sleep -Seconds 2

Write-Host "🚀 Iniciando servidor backend..." -ForegroundColor Green
cd $PSScriptRoot
node src/server.js














