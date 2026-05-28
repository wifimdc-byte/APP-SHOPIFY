// Middleware para capturar erros e logs de todas as rotas
const errorLogs = require('../routes/debug').getErrorLogs ? require('../routes/debug').getErrorLogs() : [];

function errorLogger(req, res, next) {
  // Capturar informações da requisição
  const originalSend = res.send;
  const originalJson = res.json;
  
  res.send = function(data) {
    if (res.statusCode >= 400) {
      console.error('❌ Erro na resposta:', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        body: req.body,
        query: req.query,
        params: req.params,
        response: typeof data === 'string' ? data.substring(0, 500) : data
      });
    }
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    if (res.statusCode >= 400) {
      console.error('❌ Erro na resposta JSON:', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        body: req.body,
        query: req.query,
        params: req.params,
        response: data
      });
    }
    return originalJson.call(this, data);
  };
  
  next();
}

module.exports = errorLogger;


