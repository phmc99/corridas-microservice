const { MongoClient } = require('mongodb');

const cliente = new MongoClient(process.env.MONGODB_URL);
const colecao = cliente.db('corridas').collection('historico_eventos');

async function conectar() {
  await cliente.connect();
  // Para consultar o histórico de uma corrida em ordem.
  await colecao.createIndex({ corrida_id: 1, ocorrido_em: 1 });
}

// O evento_id vira o _id, que o MongoDB já garante ser único.
// Retorna false se o evento já estava gravado (mensagem duplicada).
async function registrarEvento(evento) {
  try {
    await colecao.insertOne({
      _id: evento.evento_id,
      tipo: evento.tipo,
      corrida_id: evento.corrida.id,
      status: evento.corrida.status,
      correlation_id: evento.correlation_id,
      ocorrido_em: new Date(evento.ocorrido_em),
      registrado_em: new Date(),
      corrida: evento.corrida,
    });
    return true;
  } catch (erro) {
    // 11000: chave duplicada.
    if (erro.code === 11000) return false;
    throw erro;
  }
}

module.exports = { cliente, colecao, conectar, registrarEvento };
