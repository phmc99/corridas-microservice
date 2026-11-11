const { Counter, Gauge, Histogram, register } = require('prom-client');

const labelNames = ['method', 'route', 'status'];

const requisicoes = new Counter({
  name: 'http_requests_total',
  help: 'Total de requisições HTTP',
  labelNames,
});

const latencia = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Latência das requisições HTTP em segundos',
  labelNames,
});

const eventosPublicados = new Counter({
  name: 'eventos_publicados_total',
  help: 'Eventos enviados ao RabbitMQ, por tipo e resultado',
  labelNames: ['tipo', 'resultado'],
});

const mensagensNaFila = new Gauge({
  name: 'rabbitmq_fila_mensagens',
  help: 'Mensagens prontas aguardando consumo na fila de eventos',
});

function registrarRequisicao(method, route, status, segundos) {
  const labels = { method, route, status };
  requisicoes.inc(labels);
  latencia.observe(labels, segundos);
}

module.exports = { eventosPublicados, mensagensNaFila, register, registrarRequisicao };
