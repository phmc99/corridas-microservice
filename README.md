# corridas

Versão simplificada do fluxo central de um sistema de táxi: passageiros solicitam corridas, motoristas aceitam e o sistema acompanha o status em tempo quase real.

> **Status:** Fase 2. A API está pronta e roda com MySQL, Redis e RabbitMQ pelo `docker compose`. O worker, a UI, o MongoDB, o Prometheus e o tracing com OpenTelemetry ainda não existem.

## Arquitetura

| Componente | Responsabilidade | Situação |
| --- | --- | --- |
| API (Node.js, Express 5, Prisma) | Cria, altera o status e consulta corridas. Autenticação via JWT. | Pronta |
| Worker (Node.js) | Consome os eventos `corrida.criada` e `corrida.status_alterado`, atualiza o cache no Redis e grava o histórico no MongoDB. | A fazer |
| UI (React) | Login com token, criar corrida, listar e acompanhar status. | A fazer |
| Broker | RabbitMQ. | No compose |

## Como rodar

Pré-requisito: apenas [Docker](https://docs.docker.com/get-docker/) instalado.

```bash
docker compose up --build
```

A API fica em `http://localhost:3000`. Ao subir, ela aplica as migrations do banco sozinha.

Para rodar os testes contra os serviços do compose:

```bash
docker compose run --rm api npm test
```

## API

Todas as rotas de `/corridas` exigem `Authorization: Bearer <token>`.

| Método | Rota | Perfil | O que faz |
| --- | --- | --- | --- |
| `POST` | `/corridas` | passageiro | Cria uma corrida. Aceita o cabeçalho `Idempotency-Key`. |
| `GET` | `/corridas` | passageiro | Lista as corridas do próprio passageiro (as 100 mais recentes). |
| `GET` | `/corridas/:id` | passageiro | Lê uma corrida própria, usando o cache do Redis. |
| `PATCH` | `/corridas/:id/status` | motorista | Avança o status da corrida. |
| `GET` | `/metrics` | nenhum | Métricas no formato Prometheus. |

### Status da corrida
Corpo do `PATCH`: `{ "status": "ACEITA" }`, `"EM_ANDAMENTO"` ou `"FINALIZADA"`.

- Quem aceita a corrida vira o motorista dela. Só ele pode iniciar e finalizar.
- Uma transição fora dessa ordem retorna `409`.
- Se dois motoristas aceitarem ao mesmo tempo, um recebe `200` e o outro `409`. O `UPDATE` só altera a linha se o status ainda for o esperado, então o próprio banco decide a disputa.

### Respostas de erro

| Código | Quando |
| --- | --- |
| `400` | Corpo inválido, JSON malformado, `id` inválido ou status desconhecido. |
| `401` | Sem token, token expirado, assinatura inválida ou algoritmo diferente de RS256. |
| `403` | Perfil errado para a rota, corrida de outro passageiro ou corrida aceita por outro motorista. |
| `404` | Corrida inexistente. |
| `409` | Transição de status inválida ou corrida alterada por outra requisição. |

### Exemplo

Copie um token de [`apps/api/test/tokens-teste.json`](apps/api/test/tokens-teste.json) e use no Insomnia/Postman [`docs/corridas.postman_collection.json`](docs/corridas.postman_collection.json).

## Autenticação

- Tokens JWT assinados com RS256. A API valida com a chave pública [`chave-publica-teste.pem`](apps/api/src/auth/chave-publica-teste.pem).
- O perfil vai na claim `perfil` (`passageiro` ou `motorista`) e o usuário na claim `sub`.
- Os tokens de teste estão em [`tokens-teste.json`](apps/api/test/tokens-teste.json): `passageiro1`, `passageiro2`, `motorista1`, `motorista2` e um `expirado`. Os válidos duram 10 anos.
- A chave privada não está no repositório. O script `npm run gerar-tokens` (em `apps/api`) gera um par novo, grava a chave pública e os tokens, e descarta a privada.

Chaves e tokens são apenas de teste.

## Idempotência

Existem duas duplicações diferentes, cada uma tratada em um lugar:

| Camada | Duplicação | Identificador | Quem impede |
| --- | --- | --- | --- |
| API | O cliente repete o `POST` | `Idempotency-Key` | Índice único `(passageiro_id, idempotency_key)` no MySQL |
| Worker (próxima fase) | O RabbitMQ entrega a mesma mensagem de novo | `evento_id` | Índice único em `evento_id` no MongoDB |

Na API:

- Repetir o `POST` com a mesma chave devolve a corrida original com `200`, em vez de `201`, e não publica outro evento.
- A chave vale por passageiro: dois passageiros podem usar o mesmo valor.
- A API tenta gravar direto e trata o erro de chave duplicada. Consultar antes e gravar depois deixaria passar duas requisições simultâneas.
- O cabeçalho é opcional. Sem ele, cada `POST` cria uma corrida.
- A chave fica só no MySQL. Ela não aparece nas respostas, nos eventos nem no cache.

## Eventos

A API publica no exchange `corridas.eventos` (tipo `topic`), com as routing keys `corrida.criada` e `corrida.status_alterado`. A fila durável `corridas.worker` recebe os dois. A API já cria a fila, para não perder eventos publicados antes de o worker subir.

```json
{
  "evento_id": "47fff1ca-3818-4cd3-974f-3a0090f25998",
  "tipo": "corrida.criada",
  "correlation_id": "8086b17d-a971-40b2-bd5c-e8241f1f870e",
  "ocorrido_em": "2026-11-10T23:28:17.280Z",
  "corrida": { "id": 2, "passageiroId": "passageiro-1", "motoristaId": null, "status": "SOLICITADA", "...": "..." }
}
```

- As mensagens são persistentes, e a API espera a confirmação do broker antes de responder.
- O evento só é publicado depois que a corrida foi gravada no MySQL.
- Se o RabbitMQ cair, a API reconecta na publicação seguinte.

## Cache

- O `GET /corridas/:id` lê a chave `corrida:{id}` no Redis. Se não achar, lê do MySQL.
- A API só lê o cache. Quem vai escrever é o worker, com o objeto `corrida` do evento.
- Se o Redis estiver fora, a leitura cai no MySQL sem erro para o cliente.

## Observabilidade

- **Logs:** JSON no stdout, com `timestamp`, `level`, `message` e `correlation_id`. O `correlation_id` vem do cabeçalho `X-Correlation-Id` ou é gerado, volta na resposta e vai em cada evento publicado. Os logs não são o histórico: o histórico é gravado pelo worker a partir dos eventos.
- **Métricas** em `/metrics`:

| Métrica | O que mede |
| --- | --- |
| `http_requests_total` | Requisições por método, rota e status (taxa e erros). |
| `http_request_duration_seconds` | Histograma de latência. |
| `eventos_publicados_total` | Eventos publicados, por tipo e resultado (`sucesso` ou `falha`). |
| `rabbitmq_fila_mensagens` | Mensagens aguardando consumo na fila `corridas.worker`. |

## Testes

- fluxo feliz, da criação à finalização, conferindo os eventos publicados;
- `401` sem token, com token expirado, com assinatura de outra chave e com `alg: none`;
- `403` por perfil, por corrida de outro passageiro e por motorista diferente;
- idempotência: repetição, requisições simultâneas e mesma chave em passageiros diferentes;
- `409` em transição inválida e em aceite simultâneo;
- `400` e `404`, leitura pelo cache e `/metrics`.

## Decisões e limitações

- **Evento perdido com o broker fora.** A corrida é gravada e a API responde `201`, mas o evento se perde. Fica registrado em log e em `eventos_publicados_total{resultado="falha"}`. O MySQL continua correto, mas o histórico fica sem aquele evento. A correção seria uma tabela outbox, deixada de fora para manter a solução simples.
- **Cache levemente atrasado.** Como o cache é atualizado de forma assíncrona pelo worker, um `GET` logo depois de um `PATCH` pode mostrar o status anterior por alguns instantes.
- **Testes no ambiente de desenvolvimento.** Os testes usam o mesmo banco e o mesmo broker do compose. Os eventos que eles geram também vão para a fila `corridas.worker`.

## Estrutura de pastas

```
.github/workflows/   pipeline de CI (GitHub Actions)
apps/
  api/               API
    scripts/         geração dos tokens de teste
    src/             auth, corridas, mensageria, cache, database (schema e migrations), metricas
    test/            testes de integração e tokens de teste
  worker/            consumidor de eventos
    src/             consumidores, cache, historico, metricas
    test/
  ui/                interface React
    public/
    src/             pages, components, services
    test/
infra/               configuração local de mysql, redis, mongodb, rabbitmq e prometheus
docs/                documentação
docker-compose.yml   ambiente local
```

## CI

O pipeline do GitHub Actions ficará em `.github/workflows/`. A API já tem os comandos que ele vai usar: `npm run lint` e `npm test`.
