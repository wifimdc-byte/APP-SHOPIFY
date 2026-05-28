const express = require('express');
const pool = require('../database/connection');

const router = express.Router();

// Armazenar últimos logs de erro
const errorLogs = [];
const MAX_LOGS = 200;

// Função para adicionar log
function addLog(message, type = 'error', stack = null) {
  const timestamp = new Date().toISOString();
  
  errorLogs.push({
    timestamp,
    message: typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message),
    type,
    stack: stack || null
  });
  
  // Manter apenas os últimos MAX_LOGS
  if (errorLogs.length > MAX_LOGS) {
    errorLogs.shift();
  }
}

// Interceptar console.error para capturar erros
const originalConsoleError = console.error;
console.error = function(...args) {
  const errorMessage = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  // Extrair stack se for um Error object
  let stack = null;
  if (args[0] instanceof Error) {
    stack = args[0].stack;
  }
  
  addLog(errorMessage, 'error', stack);
  originalConsoleError.apply(console, args);
};

// Interceptar console.log também para capturar logs importantes
const originalConsoleLog = console.log;
console.log = function(...args) {
  const message = args.map(arg => 
    typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
  ).join(' ');
  
  // Capturar apenas logs que contêm palavras-chave importantes
  if (message.includes('Erro') || message.includes('error') || message.includes('❌') || 
      message.includes('Erro ao') || message.includes('Stack:')) {
    addLog(message, 'error');
  } else if (message.includes('⚠️') || message.includes('Warning')) {
    addLog(message, 'warn');
  } else {
    addLog(message, 'info');
  }
  
  originalConsoleLog.apply(console, args);
};

// Rota para visualizar logs
router.get('/logs', (req, res) => {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Logs do Backend - Melhor das Casas</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 20px;
    }
    .header {
      background: #25053c;
      color: #fff;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .header h1 { margin-bottom: 10px; }
    .controls {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    button {
      background: #25053c;
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover { background: #3a0a5c; }
    .logs-container {
      background: #252526;
      border-radius: 8px;
      padding: 20px;
      max-height: 70vh;
      overflow-y: auto;
    }
    .log-entry {
      padding: 10px;
      margin-bottom: 10px;
      border-left: 3px solid #f44336;
      background: #2d2d30;
      border-radius: 4px;
    }
    .log-entry.error {
      border-left-color: #f44336;
      background: #3d1f1f;
    }
    .log-entry.warn {
      border-left-color: #ff9800;
      background: #3d2f1f;
    }
    .log-entry.info {
      border-left-color: #2196F3;
      background: #1f2d3d;
    }
    .timestamp {
      color: #858585;
      font-size: 12px;
      margin-bottom: 5px;
    }
    .message {
      color: #d4d4d4;
      white-space: pre-wrap;
      word-wrap: break-word;
    }
    .empty {
      text-align: center;
      color: #858585;
      padding: 40px;
    }
    .stats {
      display: flex;
      gap: 20px;
      margin-bottom: 20px;
    }
    .stat-box {
      background: #2d2d30;
      padding: 15px;
      border-radius: 8px;
      flex: 1;
    }
    .stat-label {
      color: #858585;
      font-size: 12px;
      margin-bottom: 5px;
    }
    .stat-value {
      color: #fff;
      font-size: 24px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 Logs do Backend - Melhor das Casas</h1>
    <p>Visualização de erros e logs em tempo real</p>
  </div>
  
  <div class="stats">
    <div class="stat-box">
      <div class="stat-label">Total de Logs</div>
      <div class="stat-value" id="totalLogs">0</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Última Atualização</div>
      <div class="stat-value" id="lastUpdate" style="font-size: 14px;">-</div>
    </div>
  </div>
  
  <div class="controls">
    <button onclick="refreshLogs()">🔄 Atualizar</button>
    <button onclick="clearLogs()">🗑️ Limpar</button>
    <button onclick="toggleAutoRefresh()" id="autoRefreshBtn">⏸️ Auto-refresh: OFF</button>
  </div>
  
  <div class="logs-container" id="logsContainer">
    <div class="empty">Carregando logs...</div>
  </div>

  <script>
    let autoRefresh = false;
    let autoRefreshInterval = null;

    function formatTimestamp(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleString('pt-BR');
    }

    function renderLogs(logs) {
      const container = document.getElementById('logsContainer');
      const totalLogsEl = document.getElementById('totalLogs');
      const lastUpdateEl = document.getElementById('lastUpdate');
      
      totalLogsEl.textContent = logs.length;
      lastUpdateEl.textContent = new Date().toLocaleTimeString('pt-BR');
      
      if (logs.length === 0) {
        container.innerHTML = '<div class="empty">Nenhum log de erro ainda</div>';
        return;
      }
      
      container.innerHTML = logs.reverse().map(log => \`
        <div class="log-entry \${log.type || 'error'}">
          <div class="timestamp">\${formatTimestamp(log.timestamp)}</div>
          <div class="message">\${escapeHtml(log.message)}</div>
          \${log.stack ? '<div class="message" style="margin-top: 10px; color: #ff6b6b; font-size: 12px;">' + escapeHtml(log.stack) + '</div>' : ''}
        </div>
      \`).join('');
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function refreshLogs() {
      fetch('/api/debug/logs/data')
        .then(res => res.json())
        .then(data => {
          renderLogs(data.logs || []);
        })
        .catch(err => {
          console.error('Erro ao carregar logs:', err);
        });
    }

    function clearLogs() {
      if (confirm('Tem certeza que deseja limpar os logs?')) {
        fetch('/api/debug/logs/clear', { method: 'POST' })
          .then(() => refreshLogs());
      }
    }

    function toggleAutoRefresh() {
      autoRefresh = !autoRefresh;
      const btn = document.getElementById('autoRefreshBtn');
      
      if (autoRefresh) {
        btn.textContent = '▶️ Auto-refresh: ON';
        autoRefreshInterval = setInterval(refreshLogs, 2000);
      } else {
        btn.textContent = '⏸️ Auto-refresh: OFF';
        if (autoRefreshInterval) {
          clearInterval(autoRefreshInterval);
        }
      }
    }

    // Carregar logs ao abrir a página
    refreshLogs();
    
    // Auto-refresh a cada 5 segundos por padrão
    setInterval(refreshLogs, 5000);
  </script>
</body>
</html>
  `;
  
  res.send(html);
});

// API para obter logs em JSON
router.get('/logs/data', (req, res) => {
  res.json({
    logs: errorLogs,
    total: errorLogs.length
  });
});

// Limpar logs
router.post('/logs/clear', (req, res) => {
  errorLogs.length = 0;
  res.json({ success: true, message: 'Logs limpos' });
});

// Rota para corrigir fotos de perfil antigas (quebradas)
router.get('/fix-profile-photos', async (req, res) => {
  try {
    console.log('🔧 Iniciando correção de fotos de perfil...');
    
    const result = await pool.query(`
      UPDATE melhor_casas_users 
      SET foto_url = NULL 
      WHERE foto_url LIKE '/uploads/%'
      RETURNING id, nome
    `);
    
    console.log(`✅ Correção concluída. ${result.rowCount} usuários atualizados.`);
    
    res.json({
      success: true,
      message: 'Fotos de perfil antigas removidas.',
      updatedCount: result.rowCount,
      updatedUsers: result.rows.map(u => ({ id: u.id, nome: u.nome }))
    });
  } catch (error) {
    console.error('❌ Erro ao corrigir fotos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Exportar funções e router
const debugModule = router;
debugModule.getErrorLogs = () => errorLogs;
debugModule.addLog = addLog;

module.exports = debugModule;

