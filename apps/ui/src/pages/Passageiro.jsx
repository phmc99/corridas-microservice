import { useEffect, useState } from 'react';
import Acompanhamento from '../components/Acompanhamento';
import StatusBadge from '../components/StatusBadge';
import { chamarApi } from '../services/api';

export default function Passageiro({ token }) {
  const [origem, setOrigem] = useState('');
  const [destino, setDestino] = useState('');
  // Se a criação falhar, o reenvio usa a mesma chave; ela só muda depois de um sucesso.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [enviando, setEnviando] = useState(false);
  const [corridas, setCorridas] = useState([]);
  const [acompanhando, setAcompanhando] = useState(null);
  const [erro, setErro] = useState('');
  const [erroLista, setErroLista] = useState('');

  // Atualiza a lista a cada 2 segundos (polling).
  useEffect(() => {
    const carregar = () =>
      chamarApi(token, 'GET', '/corridas')
        .then((dados) => {
          setCorridas(dados);
          setErroLista('');
        })
        .catch((e) => setErroLista(e.message));
    carregar();
    const intervalo = setInterval(carregar, 2000);
    return () => clearInterval(intervalo);
  }, [token]);

  async function solicitar(evento) {
    evento.preventDefault();
    setEnviando(true);
    setErro('');
    try {
      const corrida = await chamarApi(
        token,
        'POST',
        '/corridas',
        { origem, destino },
        { 'Idempotency-Key': idempotencyKey },
      );
      setCorridas((atuais) => [corrida, ...atuais.filter((c) => c.id !== corrida.id)]);
      setAcompanhando(corrida.id);
      setOrigem('');
      setDestino('');
      setIdempotencyKey(crypto.randomUUID());
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <form className="cartao" onSubmit={solicitar}>
        <h2>Para onde vamos?</h2>
        <div className="linha">
          <input placeholder="Origem" value={origem} onChange={(e) => setOrigem(e.target.value)} required />
          <input placeholder="Destino" value={destino} onChange={(e) => setDestino(e.target.value)} required />
          <button type="submit" disabled={enviando}>
            {enviando ? 'Solicitando...' : 'Solicitar corrida'}
          </button>
        </div>
        {erro && <p className="erro">{erro}</p>}
      </form>

      {acompanhando && <Acompanhamento token={token} id={acompanhando} />}

      <section className="cartao">
        <h2>Minhas corridas</h2>
        <p className="dica">Clique em uma corrida para acompanhar.</p>
        {erroLista && <p className="erro">{erroLista}</p>}
        <div className="tabela">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Origem</th>
                <th>Destino</th>
                <th>Motorista</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {corridas.map((c) => (
                <tr
                  key={c.id}
                  className={c.id === acompanhando ? 'selecionada' : ''}
                  onClick={() => setAcompanhando(c.id)}
                >
                  <td>{c.id}</td>
                  <td>{c.origem}</td>
                  <td>{c.destino}</td>
                  <td>{c.motoristaId ?? '—'}</td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              ))}
              {corridas.length === 0 && (
                <tr>
                  <td colSpan={5} className="vazio">
                    Nenhuma corrida ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
