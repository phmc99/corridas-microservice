# corridas

Versão simplificada do fluxo central de um sistema de táxi: passageiros solicitam corridas, motoristas aceitam e o sistema acompanha o status em tempo quase real.

> **Status:** Fase 4. A API, o worker e a UI estão prontos e rodam com MySQL, Redis, MongoDB, RabbitMQ, Prometheus e Jaeger pelo `docker compose`. O teste de carga ainda não existe.

## Arquitetura

| Componente | Responsabilidade | Situação |
| --- | --- | --- |
| API (Node.js, Express 5, Prisma) | Cria, altera o status e consulta corridas. Autenticação via JWT. | Pronta |
| Worker (Node.js, Express 5) | Consome os eventos `corrida.criada` e `corrida.status_alterado`, atualiza o cache no Redis e grava o histórico no MongoDB. | Pronto |
| UI (React, Vite) | Login com token, criar corrida, listar e acompanhar status. | Pronta |
| Broker | RabbitMQ. | No compose |

## Como rodar

Pré-requisito: apenas [Docker](https://docs.docker.com/get-docker/) instalado.

```bash
docker compose up --build
```

A UI fica em `http://localhost:8080` e a API em `http://localhost:3000`. Ao subir, ela aplica as migrations do banco sozinha. O worker expõe só o `/metrics`, em `http://localhost:3001/metrics`. O Prometheus fica em `http://localhost:9090` e os alertas em `http://localhost:9090/alerts`. Os traces ficam no Jaeger, em `http://localhost:16686`.

Para rodar os testes contra os serviços do compose:

```bash
docker compose run --rm api npm test
```

```bash
docker compose run --rm worker npm test
```

## Monorepo

O repositório usa [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces): `apps/api`, `apps/worker` e `apps/ui` são pacotes separados, com um único `package-lock.json` e uma única configuração do ESLint na raiz.

```bash
npm install       # instala as dependências de todos os apps
npm run lint      # lint de todo o repositório
```

Os Dockerfiles ficam em cada app, mas o build parte da raiz (`context: .` no compose), porque precisa do `package-lock.json` de lá. Cada imagem instala só as dependências do próprio app (`npm ci --workspace`).

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

## UI

React com [Vite](https://vite.dev), em JavaScript, sem biblioteca de rotas nem de estado. Abra `http://localhost:8080`.

Para ver o fluxo completo, use duas abas (o token fica no `sessionStorage`, que é separado por aba):

1. Na primeira, entre com o token `passageiro1` de [`tokens-teste.json`](apps/api/test/tokens-teste.json) e solicite uma corrida. Ela aparece em "Acompanhando corrida N".
2. Na segunda, entre com `motorista1`, informe o id da corrida e clique em Aceitar, Iniciar e Finalizar.
3. A primeira aba mostra cada mudança de status em até um ou dois segundos, sem recarregar.

Como funciona:

- **Login:** a UI só lê o payload do JWT para saber o perfil e escolher a tela. Quem valida o token é a API.
- **Mesma origem:** no Docker, o nginx serve os arquivos estáticos e repassa `/api/*` para a API. Em desenvolvimento, o proxy do Vite faz o mesmo papel. Assim a API não precisa de CORS.
- **Acompanhamento:** polling. A lista (`GET /corridas`, lida do MySQL) é atualizada a cada 2 s, e a corrida acompanhada (`GET /corridas/:id`, lida do cache do Redis) a cada 1 s. A segunda mostra o resultado do caminho API → RabbitMQ → worker → Redis.
- **Idempotência:** cada envio do formulário leva uma `Idempotency-Key` gerada no navegador. Se o envio falhar, a nova tentativa reusa a mesma chave; ela só muda depois de uma criação bem-sucedida.
- **Motorista:** a API não tem rota para o motorista listar corridas, então ele informa o id.

Para rodar a UI fora do Docker, com a API do compose no ar:

```bash
npm run dev --workspace apps/ui
```

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
| Worker | O RabbitMQ entrega a mesma mensagem de novo | `evento_id` | `evento_id` usado como `_id` no MongoDB, que é único |

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
- A API só lê o cache. Quem escreve é o worker, com o objeto `corrida` do evento.
- A chave expira em 24 horas. Sem ela, a leitura cai no MySQL.
- Se o Redis estiver fora, a leitura cai no MySQL sem erro para o cliente.

## Worker

Consome a fila `corridas.worker` e, para cada evento:

1. grava o objeto `corrida` no Redis, na chave `corrida:{id}`;
2. grava o evento na coleção `historico_eventos` do MongoDB (banco `corridas`), com `_id` igual ao `evento_id`.

```json
{
  "_id": "47fff1ca-3818-4cd3-974f-3a0090f25998",
  "tipo": "corrida.criada",
  "corrida_id": 2,
  "status": "SOLICITADA",
  "correlation_id": "8086b17d-a971-40b2-bd5c-e8241f1f870e",
  "ocorrido_em": "2026-11-10T23:28:17.280Z",
  "registrado_em": "2026-11-10T23:28:17.301Z",
  "corrida": { "...": "..." }
}
```

O RabbitMQ entrega cada mensagem pelo menos uma vez, então a mesma mensagem pode chegar de novo. As duas etapas podem ser repetidas sem efeito colateral:

- **Histórico:** um `evento_id` repetido viola o `_id` e é ignorado. O worker dá `ack` e conta como `duplicado`.
- **Cache:** o status só avança (`SOLICITADA` → `ACEITA` → `EM_ANDAMENTO` → `FINALIZADA`). Um evento com status anterior ao que já está no cache não sobrescreve.
- **Ordem:** primeiro o cache, depois o histórico. Se o histórico falhar, a mensagem volta para a fila e as duas etapas rodam de novo. Na ordem inversa, a reentrega seria tratada como duplicada e o cache ficaria desatualizado.

Falhas:

| Situação | O que acontece |
| --- | --- |
| Redis ou MongoDB fora | `nack` com retorno para a fila, depois de 1 segundo. A mensagem é processada quando o serviço voltar. |
| Mensagem malformada (sem `evento_id` ou `corrida.id`) | Descartada e registrada em log. Reenviar só faria falhar de novo. |
| Conexão com o RabbitMQ perdida | O worker encerra e o Docker o reinicia (`restart: unless-stopped`). As mensagens sem `ack` voltam para a fila. |

O worker processa uma mensagem por vez (`prefetch 1`). Isso evita duas gravações da mesma corrida em paralelo no cache e mantém o código simples.

## Observabilidade

- **Logs:** JSON no stdout, com `timestamp`, `level`, `message`, `correlation_id` e `trace_id`. O `trace_id` é o do span ativo e leva direto ao trace no Jaeger. O `correlation_id` vem do cabeçalho `X-Correlation-Id` ou é gerado, volta na resposta e vai em cada evento publicado. Os logs não são o histórico: o histórico é gravado pelo worker a partir dos eventos.
- **Métricas** em `/metrics`:

| Métrica | O que mede |
| --- | --- |
| `http_requests_total` | Requisições por método, rota e status (taxa e erros). |
| `http_request_duration_seconds` | Histograma de latência. |
| `eventos_publicados_total` | Eventos publicados, por tipo e resultado (`sucesso` ou `falha`). |
| `rabbitmq_fila_mensagens` | Mensagens aguardando consumo na fila `corridas.worker`. |

No worker, em `http://localhost:3001/metrics`:

| Métrica | O que mede |
| --- | --- |
| `eventos_consumidos_total` | Eventos consumidos, por tipo e resultado (`processado`, `duplicado`, `invalido` ou `falha`). Dá a taxa e os erros. |
| `evento_processamento_duracao_seconds` | Histograma do tempo para gravar cache e histórico. |
| `evento_atraso_seconds` | Histograma do atraso entre a publicação pela API e o fim do processamento. |
| `rabbitmq_fila_mensagens` | Mensagens aguardando consumo na fila `corridas.worker`. |

Os logs do worker levam o `correlation_id` recebido no evento, então uma corrida pode ser seguida da requisição na API até a gravação no worker.

- **Prometheus:** coleta o `/metrics` da API (`job="api"`) e do worker (`job="worker"`) a cada 15 segundos. A configuração fica em `infra/prometheus/prometheus.yml`.
- **Trace distribuído:** OpenTelemetry na API e no worker, exportando por OTLP para o Jaeger. O `src/tracing.js` de cada app é carregado com `node --require` antes do resto, para instrumentar HTTP, Express, Prisma e ioredis na API, e ioredis e MongoDB no worker. Sem `OTEL_EXPORTER_OTLP_ENDPOINT` (como nos testes), o tracing fica desligado. O RabbitMQ não é instrumentado automaticamente: a API cria o span `publicar <tipo>` e grava o `traceparent` nos cabeçalhos da mensagem. O worker lê esse cabeçalho e abre `processar <tipo>` como filho dele. Uma corrida aparece como um trace só:

```
corridas-api    POST /corridas
corridas-api      request handler - /corridas
corridas-api        prisma:client:operation        (MySQL)
corridas-api        publicar corrida.criada
corridas-worker       processar corrida.criada
corridas-worker         get / set                  (Redis)
corridas-worker         insert historico_eventos   (MongoDB)
```

- **Alertas:** em `observability/alerts.yml`, carregados pelo Prometheus. O arquivo `observability/alerts-prometheusrule.yaml` tem os mesmos `groups` no formato `PrometheusRule`, só como arquivo.

| Alerta | Condição | Por quê |
| --- | --- | --- |
| `ApiTaxaDeErrosAlta` | Mais de 5% das respostas da API em 5xx por 5 minutos. | Erro do lado do servidor afeta o passageiro e o motorista diretamente. |
| `FilaDeEventosAcumulada` | Mais de 100 mensagens na fila `corridas.worker` por 5 minutos. | Worker parado ou lento: o cache de status e o histórico ficam atrasados. A API e o worker exportam a mesma métrica, por isso o `max`. |

## Testes

API:

- fluxo feliz, da criação à finalização, conferindo os eventos publicados;
- `401` sem token, com token expirado, com assinatura de outra chave e com `alg: none`;
- `403` por perfil, por corrida de outro passageiro e por motorista diferente;
- idempotência: repetição, requisições simultâneas e mesma chave em passageiros diferentes;
- `409` em transição inválida e em aceite simultâneo;
- `400` e `404`, leitura pelo cache e `/metrics`.

Worker:

- fluxo feliz: evento publicado no RabbitMQ chega ao cache e ao histórico;
- mensagem duplicada não grava o histórico duas vezes;
- evento antigo entregue depois não volta o status do cache;
- mensagem malformada é reconhecida como inválida.

## Decisões e limitações

- **Evento perdido com o broker fora.** A corrida é gravada e a API responde `201`, mas o evento se perde. Fica registrado em log e em `eventos_publicados_total{resultado="falha"}`. O MySQL continua correto, mas o histórico fica sem aquele evento. A correção seria uma tabela outbox, deixada de fora para manter a solução simples.
- **Cache levemente atrasado.** Como o cache é atualizado de forma assíncrona pelo worker, um `GET` logo depois de um `PATCH` pode mostrar o status anterior por alguns instantes.
- **Testes no ambiente de desenvolvimento.** Os testes usam o mesmo banco e o mesmo broker do compose. Os eventos que eles geram também vão para a fila `corridas.worker` e são processados pelo worker. Os testes do worker usam ids de corrida altos, que o MySQL não vai gerar, e apagam o que gravaram.


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
    test/            testes de integração
  ui/                interface React (Vite), servida pelo nginx no Docker
    src/             pages, components, services
infra/               configuração local de mysql, redis, mongodb, rabbitmq e prometheus
docs/                documentação
observability/       regras de alerta do Prometheus (e a versão PrometheusRule)
docker-compose.yml   ambiente local
package.json         workspaces do npm, lint e testes de todos os apps
eslint.config.js     configuração do ESLint para todo o repositório
```

## CI

O pipeline do GitHub Actions ficará em `.github/workflows/`. Ele vai usar os comandos da raiz: `npm run lint` e, com os serviços no ar, `npm test` em cada app.
