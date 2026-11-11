const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const jwt = require('jsonwebtoken');

const chavePublica = readFileSync(join(__dirname, 'chave-publica-teste.pem'));

function autenticar(req, res, next) {
  const [tipo, token] = (req.get('authorization') ?? '').split(' ');
  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Token ausente' });
  }

  try {
    // Fixar o algoritmo impede aceitar tokens com "alg: none" ou outro algoritmo.
    req.usuario = jwt.verify(token, chavePublica, { algorithms: ['RS256'] });
  } catch {
    return res.status(401).json({ erro: 'Token inválido' });
  }
  return next();
}

function exigirPerfil(perfil) {
  return (req, res, next) => {
    if (req.usuario.perfil !== perfil) {
      return res.status(403).json({ erro: 'Perfil sem permissão' });
    }
    return next();
  };
}

module.exports = { autenticar, exigirPerfil };
