const express = require('express');
const { tamanhoDaFila } = require('./consumidores/eventos-corrida');
const logger = require('./logger');
const { mensagensNaFila, register } = require('./metricas/metricas');

// O worker não tem rotas de negócio. O Express serve só o /metrics para o Prometheus.
const app = express();

app.get('/metrics', async (req, res) => {
  try {
    mensagensNaFila.set(await tamanhoDaFila());
  } catch (erro) {
    logger.warn('falha ao medir a fila', { erro: erro.message });
  }
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

module.exports = app;
