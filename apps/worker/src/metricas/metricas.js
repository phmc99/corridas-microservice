const { Counter, Gauge, Histogram, register } = require('prom-client');

const eventosConsumidos = new Counter({
  name: 'eventos_consumidos_total',
  help: 'Eventos consumidos da fila, por tipo e resultado (processado, duplicado, invalido, falha)',
  labelNames: ['tipo', 'resultado'],
});

const duracaoProcessamento = new Histogram({
  name: 'evento_processamento_duracao_seconds',
  help: 'Tempo para processar um evento (cache + histórico), em segundos',
  labelNames: ['tipo'],
});

const atrasoEvento = new Histogram({
  name: 'evento_atraso_seconds',
  help: 'Tempo entre a publicação do evento pela API e o fim do processamento no worker',
  labelNames: ['tipo'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 60, 300],
});

const mensagensNaFila = new Gauge({
  name: 'rabbitmq_fila_mensagens',
  help: 'Mensagens prontas aguardando consumo na fila de eventos',
});

module.exports = { atrasoEvento, duracaoProcessamento, eventosConsumidos, mensagensNaFila, register };
