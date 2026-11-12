const amqp = require('amqplib');
const { salvarCorrida } = require('../cache/corridas');
const { registrarEvento } = require('../historico/eventos');
const logger = require('../logger');
const { atrasoEvento, duracaoProcessamento, eventosConsumidos } = require('../metricas/metricas');

// Os mesmos nomes da API. Os dois lados declaram, então tanto faz quem sobe primeiro.
const EXCHANGE = 'corridas.eventos';
const FILA = 'corridas.worker';
const ESPERA_ANTES_DE_REPROCESSAR_MS = 1000;

let canal = null;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function lerEvento(conteudo) {
  try {
    const evento = JSON.parse(conteudo);
    return evento?.evento_id && evento.corrida?.id ? evento : null;
  } catch {
    return null;
  }
}

// As duas etapas podem ser repetidas sem efeito colateral, então uma mensagem
// entregue de novo (at-least-once) não causa problema:
// - o cache não volta para um status anterior;
// - o histórico ignora um evento_id que já existe.
// O cache vem primeiro: se o histórico falhar, a mensagem volta para a fila e as duas
// etapas rodam de novo. Na ordem inversa, a reentrega seria vista como duplicada
// e o cache ficaria sem atualizar.
async function processarEvento(evento) {
  await salvarCorrida(evento.corrida);
  const novo = await registrarEvento(evento);
  return novo ? 'processado' : 'duplicado';
}

async function tratarMensagem(msg) {
  const evento = lerEvento(msg.content);
  if (!evento) {
    // Reenviar uma mensagem malformada só faria ela falhar de novo, então ela é descartada.
    eventosConsumidos.inc({ tipo: msg.fields.routingKey, resultado: 'invalido' });
    logger.error('mensagem inválida descartada', { message_id: msg.properties.messageId });
    canal.nack(msg, false, false);
    return;
  }

  const { tipo, evento_id: eventoId, correlation_id: correlationId } = evento;
  const campos = { tipo, evento_id: eventoId, corrida_id: evento.corrida.id, correlation_id: correlationId };
  const fimDuracao = duracaoProcessamento.startTimer({ tipo });

  try {
    const resultado = await processarEvento(evento);
    fimDuracao();
    atrasoEvento.observe({ tipo }, (Date.now() - new Date(evento.ocorrido_em)) / 1000);
    eventosConsumidos.inc({ tipo, resultado });
    logger.info(resultado === 'processado' ? 'evento processado' : 'evento duplicado ignorado', {
      ...campos, status: evento.corrida.status,
    });
    canal.ack(msg);
  } catch (erro) {
    eventosConsumidos.inc({ tipo, resultado: 'falha' });
    logger.error('falha ao processar evento', { ...campos, erro: erro.message });
    // Volta para a fila. A espera evita repetir sem parar enquanto o Redis ou o MongoDB estão fora.
    await esperar(ESPERA_ANTES_DE_REPROCESSAR_MS);
    canal.nack(msg, false, true);
  }
}

async function iniciarConsumo() {
  const conexao = await amqp.connect(process.env.RABBITMQ_URL);
  conexao.on('error', (erro) => logger.error('falha no rabbitmq', { erro: erro.message }));
  // Sem conexão não há o que fazer: o processo sai e o Docker reinicia o worker.
  // As mensagens sem ack voltam para a fila.
  conexao.on('close', () => {
    logger.error('conexão com o rabbitmq encerrada');
    process.exit(1);
  });

  canal = await conexao.createChannel();
  await canal.assertExchange(EXCHANGE, 'topic', { durable: true });
  await canal.assertQueue(FILA, { durable: true });
  await canal.bindQueue(FILA, EXCHANGE, 'corrida.*');
  // Uma mensagem por vez: simplifica o cache (ver cache/corridas.js).
  await canal.prefetch(1);
  await canal.consume(FILA, tratarMensagem);
  logger.info('consumindo eventos', { fila: FILA });

  return async function pararConsumo() {
    conexao.removeAllListeners('close');
    await conexao.close();
  };
}

async function tamanhoDaFila() {
  const { messageCount } = await canal.checkQueue(FILA);
  return messageCount;
}

module.exports = { EXCHANGE, iniciarConsumo, lerEvento, processarEvento, tamanhoDaFila };
