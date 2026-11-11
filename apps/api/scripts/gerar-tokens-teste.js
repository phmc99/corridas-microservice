// Gera um par de chaves RSA de TESTE, grava só a chave pública e os tokens.
// A chave privada existe apenas durante esta execução e não vai para o repositório.
const { generateKeyPairSync } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const jwt = require('jsonwebtoken');

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const assinar = (sub, perfil, expiresIn = '10y') =>
  jwt.sign({ perfil }, privateKey, { algorithm: 'RS256', subject: sub, expiresIn });

const tokens = {
  passageiro1: assinar('passageiro-1', 'passageiro'),
  passageiro2: assinar('passageiro-2', 'passageiro'),
  motorista1: assinar('motorista-1', 'motorista'),
  motorista2: assinar('motorista-2', 'motorista'),
  expirado: assinar('passageiro-1', 'passageiro', -60),
};

const raiz = join(__dirname, '..');
writeFileSync(join(raiz, 'src/auth/chave-publica-teste.pem'), publicKey);
writeFileSync(join(raiz, 'test/tokens-teste.json'), `${JSON.stringify(tokens, null, 2)}\n`);
