import { useState } from 'react';
import StatusBadge from '../components/StatusBadge';
import { chamarApi } from '../services/api';

const ACOES = [
  { status: 'ACEITA', texto: 'Aceitar' },
  { status: 'EM_ANDAMENTO', texto: 'Iniciar' },
  { status: 'FINALIZADA', texto: 'Finalizar' },
];

// A API não tem rota para o motorista listar corridas, então ele informa o id.
export default function Motorista({ token }) {
  const [id, setId] = useState('');
  const [corrida, setCorrida] = useState(null);
  const [erro, setErro] = useState('');

  async function alterarStatus(status) {
    setErro('');
    try {
      setCorrida(await chamarApi(token, 'PATCH', `/corridas/${id}/status`, { status }));
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <section className="cartao">
      <h2>Atender corrida</h2>
      <p className="dica">Informe o número da corrida que aparece na tela do passageiro.</p>
      <div className="linha">
        <input placeholder="Número da corrida" inputMode="numeric" value={id} onChange={(e) => setId(e.target.value)} />
        {ACOES.map((acao) => (
          <button key={acao.status} onClick={() => alterarStatus(acao.status)} disabled={!id}>
            {acao.texto}
          </button>
        ))}
      </div>
      {erro && <p className="erro">{erro}</p>}
      {corrida && !erro && (
        <p className="rota" style={{ marginTop: 16 }}>
          Corrida #{corrida.id}: {corrida.origem} → {corrida.destino} <StatusBadge status={corrida.status} />
        </p>
      )}
    </section>
  );
}
