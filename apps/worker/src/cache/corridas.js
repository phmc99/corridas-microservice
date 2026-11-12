const { Redis } = require('ioredis');
const logger = require('../logger');

const redis = new Redis(process.env.REDIS_URL);

redis.on('error', (erro) => logger.warn('falha no redis', { erro: erro.message }));

// O status só avança, nesta ordem. Serve para um evento antigo, entregue de novo,
// não sobrescrever no cache um status mais novo.
const ORDEM_STATUS = { SOLICITADA: 0, ACEITA: 1, EM_ANDAMENTO: 2, FINALIZADA: 3 };

// Expira para o cache não crescer para sempre. Sem a chave, a API lê do MySQL.
const TTL_SEGUNDOS = 24 * 60 * 60;

// Ler e depois gravar não é atômico, mas o consumidor processa uma mensagem por vez
// (prefetch 1), então não há duas gravações da mesma corrida em paralelo neste worker.
async function salvarCorrida(corrida) {
  const chave = `corrida:${corrida.id}`;
  const atual = JSON.parse(await redis.get(chave));
  if (atual && ORDEM_STATUS[atual.status] > ORDEM_STATUS[corrida.status]) return false;

  await redis.set(chave, JSON.stringify(corrida), 'EX', TTL_SEGUNDOS);
  return true;
}

module.exports = { redis, salvarCorrida };
