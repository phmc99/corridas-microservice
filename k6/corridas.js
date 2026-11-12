// Teste de carga: passageiros solicitando corridas e acompanhando o status.
// Rodar com: docker compose run --rm k6
import http from 'k6/http';
import { check, sleep } from 'k6';

const API = __ENV.API_URL || 'http://api:3000';
const tokens = JSON.parse(open('/tokens/tokens-teste.json'));
const passageiros = [tokens.passageiro1, tokens.passageiro2];

export const options = {
  // Sobe até 20 usuários simultâneos, mantém por 1 minuto e desce.
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 20 },
    { duration: '10s', target: 0 },
  ],
  // O teste falha se mais de 1% das requisições der erro ou se o p95 passar de 500 ms.
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const token = passageiros[__VU % passageiros.length];
  const params = {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Chave nova a cada iteração: cada requisição cria uma corrida de verdade.
      'Idempotency-Key': crypto.randomUUID(),
      // Facilita achar as requisições do k6 nos logs.
      'X-Correlation-Id': `k6-${__VU}-${__ITER}`,
    },
  };

  const criada = http.post(`${API}/corridas`, JSON.stringify({ origem: 'Centro', destino: 'Barra da Tijuca' }), params);
  check(criada, { 'POST /corridas retorna 201': (r) => r.status === 201 });

  if (criada.status === 201) {
    const id = criada.json('id');
    const lida = http.get(`${API}/corridas/${id}`, { ...params, tags: { name: 'GET /corridas/:id' } });
    check(lida, { 'GET /corridas/:id retorna 200': (r) => r.status === 200 });
  }

  sleep(1);
}
