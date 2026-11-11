const { randomUUID } = require('node:crypto');
const express = require('express');
const { autenticar } = require('./auth/autenticacao');
const rotasCorridas = require('./corridas/rotas');
const logger = require('./logger');
const { tamanhoDaFila } = require('./mensageria/publicador');
const { mensagensNaFila, register, registrarRequisicao } = require('./metricas/metricas');

const app = express();

app.use((req, res, next) => {
  req.correlationId = req.get('x-correlation-id') || randomUUID();
  res.set('x-correlation-id', req.correlationId);
  const inicio = performance.now();

  res.on('finish', () => {
    const segundos = (performance.now() - inicio) / 1000;
    // Usa o padrão da rota (/corridas/:id), não a URL, para não criar uma série por corrida.
    const rota = req.route ? (req.baseUrl + req.route.path).replace(/\/$/, '') : 'desconhecida';
    registrarRequisicao(req.method, rota, res.statusCode, segundos);
    logger.info('requisicao', {
      correlation_id: req.correlationId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duracao_ms: Math.round(segundos * 1000),
    });
  });

  next();
});

app.get('/metrics', async (req, res) => {
  try {
    mensagensNaFila.set(await tamanhoDaFila());
  } catch (erro) {
    logger.warn('falha ao medir a fila', { erro: erro.message, correlation_id: req.correlationId });
  }
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

// Autentica antes de ler o corpo: requisição sem token recebe 401 mesmo com JSON malformado.
app.use('/corridas', autenticar, express.json(), rotasCorridas);

app.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

// eslint-disable-next-line no-unused-vars -- o Express identifica o tratador de erros pelos 4 parâmetros
app.use((erro, req, res, next) => {
  // Erros do express.json (ex.: JSON malformado) já trazem um status 4xx.
  if (erro.status >= 400 && erro.status < 500) {
    return res.status(erro.status).json({ erro: 'Requisição inválida' });
  }
  logger.error('erro inesperado', { erro: erro.message, correlation_id: req.correlationId });
  return res.status(500).json({ erro: 'Erro interno' });
});

module.exports = app;
