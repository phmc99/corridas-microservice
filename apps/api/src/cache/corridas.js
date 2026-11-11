const { Redis } = require('ioredis');
const logger = require('../logger');

// Sem fila offline: com o Redis fora do ar, o comando falha na hora em vez de segurar a requisição.
const redis = new Redis(process.env.REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
});

redis.on('error', (erro) => logger.warn('falha no redis', { erro: erro.message }));

// A API só lê o cache. Quem escreve é o worker, a partir dos eventos.
// Se o Redis falhar, retorna null e a leitura cai no MySQL.
async function buscarCorrida(id) {
  try {
    const valor = await redis.get(`corrida:${id}`);
    return valor ? JSON.parse(valor) : null;
  } catch (erro) {
    logger.warn('falha ao ler cache', { erro: erro.message, corrida_id: id });
    return null;
  }
}

module.exports = { buscarCorrida, redis };
