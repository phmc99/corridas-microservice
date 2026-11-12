// Lê o payload do JWT só para saber o perfil e o usuário a mostrar na tela.
// Quem valida a assinatura é a API: aqui não há verificação de segurança.
export function lerUsuario(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

// Chama a API pelo caminho /api (proxy do Vite em desenvolvimento, nginx no Docker).
// Lança um erro com a mensagem da API quando o status não é 2xx.
export async function chamarApi(token, metodo, caminho, corpo, cabecalhos = {}) {
  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...cabecalhos,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`${resposta.status}: ${dados.erro ?? 'erro na API'}`);
  return dados;
}
