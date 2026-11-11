const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');
const logger = require('../logger');
const { eventosPublicados } = require('../metricas/metricas');

const EXCHANGE = 'corridas.eventos';
const FILA = 'corridas.worker';

let canalPromise = null;

async function conectar() {
  const conexao = await amqp.connect(process.env.RABBITMQ_URL, { timeout: 2000 });
  // Ao perder a conexão, descarta o canal para a próxima publicação reconectar.
  const descartar = () => { canalPromise = null; };
  const registrarErro = (erro) => logger.error('falha no rabbitmq', { erro: erro.message });

  conexao.on('error', registrarErro);
  conexao.on('close', descartar);

  // Canal com confirmação: o broker avisa quando recebeu a mensagem.
  const canal = await conexao.createConfirmChannel();
  canal.on('error', registrarErro);
  canal.on('close', descartar);

  await canal.assertExchange(EXCHANGE, 'topic', { durable: true });
  // A fila é criada aqui também para não perder eventos publicados antes de o worker subir.
  await canal.assertQueue(FILA, { durable: true });
  await canal.bindQueue(FILA, EXCHANGE, 'corrida.*');
  return canal;
}

function obterCanal() {
  if (!canalPromise) {
    canalPromise = conectar().catch((erro) => {
      canalPromise = null;
      throw erro;
    });
  }
  return canalPromise;
}

// Nunca lança erro: a corrida já foi gravada no MySQL, que é a fonte da verdade.
async function publicarEvento(tipo, corrida, correlationId) {
  const eventoId = randomUUID();
  const evento = {
    evento_id: eventoId,
    tipo,
    correlation_id: correlationId,
    ocorrido_em: new Date().toISOString(),
    corrida,
  };

  try {
    const canal = await obterCanal();
    await new Promise((resolve, reject) => {
      canal.publish(EXCHANGE, tipo, Buffer.from(JSON.stringify(evento)), {
        persistent: true,
        contentType: 'application/json',
        messageId: eventoId,
        correlationId,
      }, (erro) => (erro ? reject(erro) : resolve()));
    });
    eventosPublicados.inc({ tipo, resultado: 'sucesso' });
    logger.info('evento publicado', { tipo, evento_id: eventoId, corrida_id: corrida.id, correlation_id: correlationId });
  } catch (erro) {
    eventosPublicados.inc({ tipo, resultado: 'falha' });
    logger.error('falha ao publicar evento', {
      erro: erro.message, tipo, evento_id: eventoId, corrida_id: corrida.id, correlation_id: correlationId,
    });
  }
}

async function tamanhoDaFila() {
  const canal = await obterCanal();
  const { messageCount } = await canal.checkQueue(FILA);
  return messageCount;
}

module.exports = { EXCHANGE, publicarEvento, tamanhoDaFila };
