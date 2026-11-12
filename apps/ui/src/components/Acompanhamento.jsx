import { useEffect, useState } from 'react';
import { chamarApi } from '../services/api';
import StatusBadge, { ETAPAS, textoStatus } from './StatusBadge';

// Consulta GET /corridas/:id a cada segundo. Essa rota lê do cache do Redis,
// que o worker atualiza, então mostra o resultado do caminho completo do evento.
export default function Acompanhamento({ token, id }) {
  const [corrida, setCorrida] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    const carregar = () =>
      chamarApi(token, 'GET', `/corridas/${id}`)
        .then((dados) => {
          setCorrida(dados);
          setErro('');
        })
        .catch((e) => setErro(e.message));
    carregar();
    const intervalo = setInterval(carregar, 1000);
    return () => clearInterval(intervalo);
  }, [token, id]);

  // Etapas até a atual ficam marcadas como feitas.
  const atual = corrida ? ETAPAS.indexOf(corrida.status) : -1;

  return (
    <section className="cartao">
      <h2>Corrida #{id}</h2>
      {corrida && (
        <>
          <p className="rota">
            {corrida.origem} → {corrida.destino} <StatusBadge status={corrida.status} />
          </p>
          <p className="dica">{corrida.motoristaId ? `Motorista: ${corrida.motoristaId}` : 'Aguardando motorista'}</p>
          <ol className="etapas">
            {ETAPAS.map((etapa, i) => (
              <li key={etapa} className={i <= atual ? 'feita' : ''}>
                {textoStatus(etapa)}
              </li>
            ))}
          </ol>
        </>
      )}
      {erro && <p className="erro">{erro}</p>}
    </section>
  );
}
