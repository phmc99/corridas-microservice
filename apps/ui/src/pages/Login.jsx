import { useState } from 'react';
import { lerUsuario } from '../services/api';

export default function Login({ onEntrar }) {
  const [token, setToken] = useState('');
  const [erro, setErro] = useState('');

  function enviar(evento) {
    evento.preventDefault();
    const limpo = token.trim();
    if (!lerUsuario(limpo)?.perfil) return setErro('Token em formato inválido');
    onEntrar(limpo);
  }

  return (
    <form className="cartao" onSubmit={enviar}>
      <h2>Entrar</h2>
      <p className="dica">
        Cole um token de <code>apps/api/test/tokens-teste.json</code>. O perfil do token (passageiro ou motorista)
        define a tela.
      </p>
      <textarea value={token} onChange={(e) => setToken(e.target.value)} rows={5} placeholder="eyJhbGciOi..." />
      <button type="submit" disabled={!token.trim()}>
        Entrar
      </button>
      {erro && <p className="erro">{erro}</p>}
    </form>
  );
}
