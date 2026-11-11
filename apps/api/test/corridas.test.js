// Testes de integração: rodam contra MySQL, Redis e RabbitMQ reais do docker compose.
// docker compose run --rm api npm test
const assert = require('node:assert/strict');
const { generateKeyPairSync, randomUUID } = require('node:crypto');
const { once } = require('node:events');
const { after, before, test } = require('node:test');
const amqp = require('amqplib');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { redis } = require('../src/cache/corridas');
const { EXCHANGE } = require('../src/mensageria/publicador');
const tokens = require('./tokens-teste.json');

const { passageiro1, passageiro2, motorista1, motorista2, expirado } = tokens;
const CORPO = { origem: 'Centro', destino: 'Barra da Tijuca' };

let servidor;
let urlBase;
let conexaoAmqp;
const eventos = [];

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function chamar(metodo, caminho, { token, corpo, headers = {} } = {}) {
  const resposta = await fetch(urlBase + caminho, {
    method: metodo,
    headers: {
      ...(token && { authorization: `Bearer ${token}` }),
      ...(corpo !== undefined && { 'content-type': 'application/json' }),
      ...headers,
    },
    body: typeof corpo === 'string' ? corpo : corpo && JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  const json = resposta.headers.get('content-type')?.includes('json') ? JSON.parse(texto) : texto;
  return { status: resposta.status, corpo: json, headers: resposta.headers };
}

const criarCorrida = (token = passageiro1, headers) => chamar('POST', '/corridas', { token, corpo: CORPO, headers });
const alterarStatus = (id, status, token = motorista1) => chamar('PATCH', `/corridas/${id}/status`, { token, corpo: { status } });

async function corridaAceita(motorista = motorista1) {
  const { corpo } = await criarCorrida();
  await alterarStatus(corpo.id, 'ACEITA', motorista);
  return corpo.id;
}

async function eventoDe(corridaId, tipo) {
  for (let i = 0; i < 50; i += 1) {
    const evento = eventos.find((e) => e.corrida.id === corridaId && e.tipo === tipo);
    if (evento) return evento;
    await esperar(50);
  }
  return assert.fail(`evento ${tipo} da corrida ${corridaId} não chegou`);
}

before(async () => {
  servidor = app.listen(0);
  await once(servidor, 'listening');
  urlBase = `http://127.0.0.1:${servidor.address().port}`;
  if (redis.status !== 'ready') await once(redis, 'ready');

  // Fila temporária só do teste, que recebe uma cópia de cada evento.
  conexaoAmqp = await amqp.connect(process.env.RABBITMQ_URL);
  const canal = await conexaoAmqp.createChannel();
  await canal.assertExchange(EXCHANGE, 'topic', { durable: true });
  const { queue } = await canal.assertQueue('', { exclusive: true });
  await canal.bindQueue(queue, EXCHANGE, 'corrida.*');
  await canal.consume(queue, (msg) => eventos.push(JSON.parse(msg.content)), { noAck: true });
});

after(async () => {
  await conexaoAmqp.close();
  await new Promise((resolve) => { servidor.close(resolve); });
});

test('fluxo feliz: cria, aceita, inicia e finaliza publicando os eventos', async () => {
  const criada = await criarCorrida(passageiro1, { 'x-correlation-id': 'teste-correlacao' });
  assert.equal(criada.status, 201);
  assert.equal(criada.corpo.status, 'SOLICITADA');
  assert.equal(criada.corpo.passageiroId, 'passageiro-1');
  assert.equal(criada.corpo.idempotencyKey, undefined);
  assert.equal(criada.headers.get('x-correlation-id'), 'teste-correlacao');

  const { id } = criada.corpo;
  const eventoCriada = await eventoDe(id, 'corrida.criada');
  assert.equal(eventoCriada.correlation_id, 'teste-correlacao');
  assert.ok(eventoCriada.evento_id);

  const aceita = await alterarStatus(id, 'ACEITA');
  assert.equal(aceita.status, 200);
  assert.equal(aceita.corpo.motoristaId, 'motorista-1');
  assert.equal((await alterarStatus(id, 'EM_ANDAMENTO')).status, 200);
  const finalizada = await alterarStatus(id, 'FINALIZADA');
  assert.equal(finalizada.status, 200);
  assert.equal(finalizada.corpo.status, 'FINALIZADA');

  const lida = await chamar('GET', `/corridas/${id}`, { token: passageiro1 });
  assert.equal(lida.status, 200);
  assert.equal(lida.corpo.status, 'FINALIZADA');

  const listada = await chamar('GET', '/corridas', { token: passageiro1 });
  assert.equal(listada.status, 200);
  assert.ok(listada.corpo.some((c) => c.id === id));
});

test('401 sem token, com token expirado ou assinatura inválida', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const assinadoPorOutraChave = jwt.sign({ perfil: 'passageiro' }, privateKey, { algorithm: 'RS256', subject: 'passageiro-1' });
  const semAssinatura = jwt.sign({ perfil: 'passageiro' }, null, { algorithm: 'none', subject: 'passageiro-1' });

  for (const token of [undefined, 'lixo', expirado, assinadoPorOutraChave, semAssinatura]) {
    assert.equal((await chamar('POST', '/corridas', { token, corpo: CORPO })).status, 401);
  }
  assert.equal((await chamar('GET', '/corridas/1')).status, 401);
  assert.equal((await chamar('PATCH', '/corridas/1/status', { corpo: { status: 'ACEITA' } })).status, 401);
});

test('401 tem prioridade sobre JSON malformado', async () => {
  assert.equal((await chamar('POST', '/corridas', { corpo: '{quebrado' })).status, 401);
});

test('403 quando o perfil não permite a operação', async () => {
  const { corpo } = await criarCorrida();
  assert.equal((await criarCorrida(motorista1)).status, 403);
  assert.equal((await alterarStatus(corpo.id, 'ACEITA', passageiro1)).status, 403);
  assert.equal((await chamar('GET', `/corridas/${corpo.id}`, { token: motorista1 })).status, 403);
  assert.equal((await chamar('GET', '/corridas', { token: motorista1 })).status, 403);
});

test('403 ao ler corrida de outro passageiro, e a listagem só traz as próprias', async () => {
  const { corpo } = await criarCorrida(passageiro1);
  assert.equal((await chamar('GET', `/corridas/${corpo.id}`, { token: passageiro2 })).status, 403);
  const lista = await chamar('GET', '/corridas', { token: passageiro2 });
  assert.ok(lista.corpo.every((c) => c.passageiroId === 'passageiro-2'));
});

test('403 quando outro motorista tenta avançar a corrida', async () => {
  const id = await corridaAceita(motorista1);
  assert.equal((await alterarStatus(id, 'EM_ANDAMENTO', motorista2)).status, 403);
});

test('idempotência: repetir a chave não duplica corrida nem evento', async () => {
  const headers = { 'idempotency-key': randomUUID() };
  const primeira = await criarCorrida(passageiro1, headers);
  const repetida = await criarCorrida(passageiro1, headers);
  assert.equal(primeira.status, 201);
  assert.equal(repetida.status, 200);
  assert.equal(repetida.corpo.id, primeira.corpo.id);

  await eventoDe(primeira.corpo.id, 'corrida.criada');
  await esperar(200);
  assert.equal(eventos.filter((e) => e.corrida.id === primeira.corpo.id).length, 1);
});

test('idempotência: requisições simultâneas criam uma só corrida', async () => {
  const headers = { 'idempotency-key': randomUUID() };
  const respostas = await Promise.all(Array.from({ length: 5 }, () => criarCorrida(passageiro1, headers)));
  assert.equal(respostas.filter((r) => r.status === 201).length, 1);
  assert.equal(respostas.filter((r) => r.status === 200).length, 4);
  assert.equal(new Set(respostas.map((r) => r.corpo.id)).size, 1);
});

test('idempotência: a mesma chave em passageiros diferentes cria corridas diferentes', async () => {
  const headers = { 'idempotency-key': randomUUID() };
  const a = await criarCorrida(passageiro1, headers);
  const b = await criarCorrida(passageiro2, headers);
  assert.equal(b.status, 201);
  assert.notEqual(a.corpo.id, b.corpo.id);
});

test('sem Idempotency-Key cada requisição cria uma corrida', async () => {
  const a = await criarCorrida();
  const b = await criarCorrida();
  assert.equal(b.status, 201);
  assert.notEqual(a.corpo.id, b.corpo.id);
});

test('409 em transição inválida', async () => {
  const { corpo } = await criarCorrida();
  assert.equal((await alterarStatus(corpo.id, 'FINALIZADA')).status, 409);
  assert.equal((await alterarStatus(corpo.id, 'EM_ANDAMENTO')).status, 409);
});

test('409 para o segundo motorista em aceite simultâneo', async () => {
  const { corpo } = await criarCorrida();
  const respostas = await Promise.all([
    alterarStatus(corpo.id, 'ACEITA', motorista1),
    alterarStatus(corpo.id, 'ACEITA', motorista2),
  ]);
  assert.deepEqual(respostas.map((r) => r.status).sort(), [200, 409]);
});

test('400 em dados inválidos e 404 em corrida inexistente', async () => {
  const token = passageiro1;
  assert.equal((await chamar('POST', '/corridas', { token, corpo: { origem: 'Centro' } })).status, 400);
  assert.equal((await chamar('POST', '/corridas', { token, corpo: { ...CORPO, destino: 'x'.repeat(256) } })).status, 400);
  assert.equal((await chamar('POST', '/corridas', { token, corpo: '{quebrado' })).status, 400);
  assert.equal((await chamar('POST', '/corridas', { token })).status, 400);
  assert.equal((await chamar('GET', '/corridas/abc', { token })).status, 400);
  assert.equal((await chamar('GET', '/corridas/99999999999', { token })).status, 400);
  assert.equal((await chamar('GET', '/corridas/2147483000', { token })).status, 404);

  const { corpo } = await criarCorrida();
  for (const status of ['CANCELADA', 'SOLICITADA', 'constructor', 1, undefined]) {
    assert.equal((await chamar('PATCH', `/corridas/${corpo.id}/status`, { token: motorista1, corpo: { status } })).status, 400);
  }
  assert.equal((await alterarStatus(2147483000, 'ACEITA')).status, 404);
});

test('GET usa o cache do Redis quando existe', async () => {
  // Id que não existe no MySQL: a resposta só pode ter vindo do cache.
  const id = 2147483001;
  const noCache = { id, passageiroId: 'passageiro-1', status: 'ACEITA' };
  await redis.set(`corrida:${id}`, JSON.stringify(noCache));
  try {
    const dono = await chamar('GET', `/corridas/${id}`, { token: passageiro1 });
    assert.equal(dono.status, 200);
    assert.deepEqual(dono.corpo, noCache);
    assert.equal((await chamar('GET', `/corridas/${id}`, { token: passageiro2 })).status, 403);
  } finally {
    await redis.del(`corrida:${id}`);
  }
});

test('/metrics expõe requisições, latência e tamanho da fila', async () => {
  await criarCorrida();
  const { status, corpo } = await chamar('GET', '/metrics');
  assert.equal(status, 200);
  assert.match(corpo, /http_requests_total\{method="POST",route="\/corridas",status="201"\}/);
  assert.match(corpo, /http_request_duration_seconds_bucket/);
  assert.match(corpo, /eventos_publicados_total\{tipo="corrida.criada",resultado="sucesso"\}/);
  assert.match(corpo, /rabbitmq_fila_mensagens \d+/);
});
