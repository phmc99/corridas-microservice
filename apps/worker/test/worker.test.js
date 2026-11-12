// Testes de integração: rodam contra Redis, MongoDB e RabbitMQ reais do docker compose.
// docker compose run --rm worker npm test
const assert = require('node:assert/strict');
const { randomInt, randomUUID } = require('node:crypto');
const { after, before, test } = require('node:test');
const amqp = require('amqplib');
const { redis } = require('../src/cache/corridas');
const { EXCHANGE, iniciarConsumo, lerEvento, processarEvento } = require('../src/consumidores/eventos-corrida');
const historico = require('../src/historico/eventos');

let pararConsumo;
const corridasDoTeste = [];

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Ids acima dos que o MySQL vai gerar no ambiente de desenvolvimento, para não colidir.
function novaCorrida(status = 'SOLICITADA') {
  const id = randomInt(1_000_000_000, 2_000_000_000);
  corridasDoTeste.push(id);
  return { id, passageiroId: 'passageiro-1', motoristaId: null, origem: 'Centro', destino: 'Barra', status };
}

function novoEvento(corrida, tipo = 'corrida.status_alterado') {
  return { evento_id: randomUUID(), tipo, correlation_id: randomUUID(), ocorrido_em: new Date().toISOString(), corrida };
}

const lerCache = async (id) => JSON.parse(await redis.get(`corrida:${id}`));
const contarHistorico = (id) => historico.colecao.countDocuments({ corrida_id: id });

before(async () => {
  await historico.conectar();
  pararConsumo = await iniciarConsumo();
});

after(async () => {
  await Promise.all(corridasDoTeste.map((id) => redis.del(`corrida:${id}`)));
  await historico.colecao.deleteMany({ corrida_id: { $in: corridasDoTeste } });
  await pararConsumo();
  await historico.cliente.close();
});

test('fluxo feliz: evento publicado atualiza o cache e grava o histórico', async () => {
  const corrida = novaCorrida();
  const evento = novoEvento(corrida, 'corrida.criada');

  const conexao = await amqp.connect(process.env.RABBITMQ_URL);
  const canal = await conexao.createConfirmChannel();
  canal.publish(EXCHANGE, evento.tipo, Buffer.from(JSON.stringify(evento)), { persistent: true });
  await canal.waitForConfirms();
  await conexao.close();

  let documento = null;
  for (let i = 0; i < 50 && !documento; i += 1) {
    await esperar(100);
    documento = await historico.colecao.findOne({ _id: evento.evento_id });
  }

  assert.ok(documento, 'o evento não foi gravado no histórico');
  assert.equal(documento.corrida_id, corrida.id);
  assert.equal(documento.correlation_id, evento.correlation_id);
  assert.deepEqual(await lerCache(corrida.id), corrida);
});

test('mensagem duplicada não grava o histórico de novo', async () => {
  const evento = novoEvento(novaCorrida());

  assert.equal(await processarEvento(evento), 'processado');
  assert.equal(await processarEvento(evento), 'duplicado');
  assert.equal(await contarHistorico(evento.corrida.id), 1);
});

test('evento antigo entregue depois não volta o status do cache', async () => {
  const corrida = novaCorrida();
  const aceita = novoEvento({ ...corrida, status: 'ACEITA', motoristaId: 'motorista-1' });
  const criada = novoEvento(corrida, 'corrida.criada');

  await processarEvento(aceita);
  await processarEvento(criada);

  assert.equal((await lerCache(corrida.id)).status, 'ACEITA');
  // O histórico guarda os dois: ele registra o que aconteceu, não o estado atual.
  assert.equal(await contarHistorico(corrida.id), 2);
});

test('mensagem malformada é reconhecida como inválida', () => {
  assert.equal(lerEvento(Buffer.from('não é json')), null);
  assert.equal(lerEvento(Buffer.from('{"tipo":"corrida.criada"}')), null);
  assert.ok(lerEvento(Buffer.from(JSON.stringify(novoEvento(novaCorrida())))));
});
