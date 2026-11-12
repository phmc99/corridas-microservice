import { useState } from 'react';
import Login from './pages/Login';
import Motorista from './pages/Motorista';
import Passageiro from './pages/Passageiro';
import { lerUsuario } from './services/api';

export default function App() {
  // sessionStorage é por aba: dá para abrir passageiro e motorista lado a lado.
  const [token, setToken] = useState(() => sessionStorage.getItem('token'));
  const usuario = token ? lerUsuario(token) : null;

  function entrar(novoToken) {
    sessionStorage.setItem('token', novoToken);
    setToken(novoToken);
  }

  function sair() {
    sessionStorage.removeItem('token');
    setToken(null);
  }

  return (
    <>
      <header className="topo">
        <h1 className="marca">
          <span>■</span> Corridas
        </h1>
        {usuario && (
          <div className="usuario">
            <span>
              {usuario.perfil === 'motorista' ? 'Motorista' : 'Passageiro'}: <strong>{usuario.sub}</strong>
            </span>
            <button className="secundario" onClick={sair}>
              Sair
            </button>
          </div>
        )}
      </header>
      <main className="conteudo">
        {!usuario && <Login onEntrar={entrar} />}
        {usuario?.perfil === 'motorista' && <Motorista token={token} />}
        {usuario?.perfil === 'passageiro' && <Passageiro token={token} />}
      </main>
    </>
  );
}
