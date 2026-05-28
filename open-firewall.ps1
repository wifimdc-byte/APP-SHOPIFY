# Script para abrir porta 3001 no firewall do Windows
# Execute como Administrador

Write-Host "🔓 Abrindo porta 3001 no firewall..." -ForegroundColor Yellow

# Verificar se a regra já existe
$existingRule = netsh advfirewall firewall show rule name="Backend API Port 3001" 2>$null

if ($existingRule) {
    Write-Host "✅ Regra de firewall já existe" -ForegroundColor Green
} else {
    # Criar regra de entrada
    netsh advfirewall firewall add rule name="Backend API Port 3001" dir=in action=allow protocol=TCP localport=3001
    Write-Host "✅ Regra de firewall criada com sucesso!" -ForegroundColor Green
}

Write-Host ""
Write-Host "📱 Agora o servidor está acessível na rede local:" -ForegroundColor Cyan
Write-Host "   http://192.168.0.175:3001/api" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  Certifique-se de que:" -ForegroundColor Yellow
Write-Host "   1. O celular está na mesma rede Wi-Fi" -ForegroundColor White
Write-Host "   2. O servidor está rodando (npm run start)" -ForegroundColor White
Write-Host "   3. O IP 192.168.0.175 está correto" -ForegroundColor White














