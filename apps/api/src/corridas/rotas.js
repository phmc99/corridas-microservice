const express = require('express');
const { exigirPerfil } = require('../auth/autenticacao');
const { buscarCorrida } = require('../cache/corridas');
const prisma = require('../database/prisma');
const { publicarEvento } = require('../mensageria/publicador');

const rotas = express.Router();

// Para cada novo status, o status em que a corrida precisa estar.
const STATUS_ANTERIOR = {
  ACEITA: 'SOLICITADA',
  EM_ANDAMENTO: 'ACEITA',
  FINALIZADA: 'EM_ANDAMENTO',
};

const textoValido = (valor) => typeof valor === 'string' && valor.trim() !== '' && valor.length <= 255;

function paraResposta({ idempotencyKey, ...corrida }) {
  return corrida;
}

// INT do MySQL vai até 2147483647; acima disso o Prisma lançaria erro.
function lerId(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id >= 1 && id <= 2147483647 ? id : null;
}

rotas.post('/', exigirPerfil('passageiro'), async (req, res) => {
  const { origem, destino } = req.body ?? {};
  const idempotencyKey = req.get('idempotency-key') ?? null;

  if (!textoValido(origem) || !textoValido(destino)) {
    return res.status(400).json({ erro: 'origem e destino são obrigatórios (até 255 caracteres)' });
  }
  if (idempotencyKey !== null && !textoValido(idempotencyKey)) {
    return res.status(400).json({ erro: 'Idempotency-Key inválida' });
  }

  const passageiroId = req.usuario.sub;
  let criada;
  try {
    criada = await prisma.corrida.create({ data: { passageiroId, origem, destino, idempotencyKey } });
  } catch (erro) {
    // P2002: violou o índice único, então esta chave já criou uma corrida.
    if (erro.code !== 'P2002') throw erro;
    const existente = await prisma.corrida.findUnique({
      where: { passageiroId_idempotencyKey: { passageiroId, idempotencyKey } },
    });
    return res.status(200).json(paraResposta(existente));
  }

  const corrida = paraResposta(criada);
  await publicarEvento('corrida.criada', corrida, req.correlationId);
  return res.status(201).json(corrida);
});

rotas.get('/', exigirPerfil('passageiro'), async (req, res) => {
  const corridas = await prisma.corrida.findMany({
    where: { passageiroId: req.usuario.sub },
    orderBy: { id: 'desc' },
    take: 100,
  });
  return res.json(corridas.map(paraResposta));
});

rotas.get('/:id', exigirPerfil('passageiro'), async (req, res) => {
  const id = lerId(req);
  if (id === null) return res.status(400).json({ erro: 'id inválido' });

  const corrida = (await buscarCorrida(id)) ?? (await prisma.corrida.findUnique({ where: { id } }));
  if (!corrida) return res.status(404).json({ erro: 'Corrida não encontrada' });
  if (corrida.passageiroId !== req.usuario.sub) {
    return res.status(403).json({ erro: 'Corrida de outro passageiro' });
  }
  return res.json(paraResposta(corrida));
});

rotas.patch('/:id/status', exigirPerfil('motorista'), async (req, res) => {
  const id = lerId(req);
  if (id === null) return res.status(400).json({ erro: 'id inválido' });

  const { status } = req.body ?? {};
  if (!Object.hasOwn(STATUS_ANTERIOR, status ?? '')) {
    return res.status(400).json({ erro: 'status deve ser ACEITA, EM_ANDAMENTO ou FINALIZADA' });
  }

  const atual = await prisma.corrida.findUnique({ where: { id } });
  if (!atual) return res.status(404).json({ erro: 'Corrida não encontrada' });

  const statusAnterior = STATUS_ANTERIOR[status];
  if (atual.status !== statusAnterior) {
    return res.status(409).json({ erro: `Corrida ${atual.status} não pode passar para ${status}` });
  }

  const motoristaId = req.usuario.sub;
  if (status !== 'ACEITA' && atual.motoristaId !== motoristaId) {
    return res.status(403).json({ erro: 'Corrida aceita por outro motorista' });
  }

  const dados = { status, motoristaId: status === 'ACEITA' ? motoristaId : atual.motoristaId, atualizadoEm: new Date() };

  // O status anterior no WHERE faz o banco decidir a disputa: se dois motoristas
  // aceitarem ao mesmo tempo, só um UPDATE altera a linha.
  const { count } = await prisma.corrida.updateMany({ where: { id, status: statusAnterior }, data: dados });
  if (count === 0) return res.status(409).json({ erro: 'Corrida alterada por outra requisição' });

  const corrida = paraResposta({ ...atual, ...dados });
  await publicarEvento('corrida.status_alterado', corrida, req.correlationId);
  return res.json(corrida);
});

module.exports = rotas;
