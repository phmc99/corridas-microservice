const TEXTOS = {
  SOLICITADA: 'Solicitada',
  ACEITA: 'Aceita',
  EM_ANDAMENTO: 'Em andamento',
  FINALIZADA: 'Finalizada',
};

export const ETAPAS = Object.keys(TEXTOS);

export function textoStatus(status) {
  return TEXTOS[status] ?? status;
}

export default function StatusBadge({ status }) {
  return <span className={`status status-${status}`}>{textoStatus(status)}</span>;
}
