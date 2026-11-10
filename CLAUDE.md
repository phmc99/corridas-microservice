# corridas

Desafio técnico (Full Stack / Platform Pleno, Prefeitura do Rio): versão simplificada do fluxo central do Taxi.Rio. Passageiros solicitam corridas, motoristas aceitam e o sistema acompanha o status em tempo quase real.

## Princípio: manter simples

O autor precisa explicar e defender cada linha em entrevista. Por isso:

- Preferir a solução mais direta que atende ao requisito.
- Não criar abstrações, camadas ou dependências sem necessidade concreta.
- Não adicionar funcionalidades além das listadas aqui.
- UI mínima: design não é avaliado.

## Fluxo

```
[React UI] --HTTP+JWT--> [API] --> MySQL (corridas: fonte da verdade)
                           |
                           +--publica evento--> [RabbitMQ] --> [Worker]
                                                                  |
                                     Redis (cache de status) <----+
                                     MongoDB (histórico/auditoria) <--+
```

| Componente | Responsabilidade |
| --- | --- |
| API (Express.js) | `POST /corridas` (cria), `PATCH /corridas/:id/status` (aceita/inicia/finaliza), `GET /corridas/:id` (lê usando cache). Autenticação via JWT. |
| Worker (Express.js) | Consome `corrida.criada` e `corrida.status_alterado`, atualiza o cache no Redis e grava o histórico no MongoDB. |
| UI (React) | Login com token, criar corrida, listar e acompanhar status. |

## Requisitos: fundação

- `docker compose up` sobe API, worker, UI, MySQL, Redis, MongoDB, RabbitMQ e Prometheus.
- JWT: token estático pré-gerado + JWKS ou chave pública.
  - Sem token: 401. Token inválido: 401. Token válido: 2xx.
  - Perfil no token: passageiro só cria e lê as próprias corridas; motorista só altera status. Fora disso: 403.
- Idempotência: repetir `POST /corridas` com a mesma `Idempotency-Key` não cria corrida duplicada.
- Worker tolerante a mensagem duplicada (entrega at-least-once).
- Testes automatizados: fluxo feliz e pelo menos dois cenários de falha.
- GitHub Actions: lint, testes e build das imagens a cada push/PR.

## Requisitos: operação

- Logs estruturados em JSON com `correlation_id`/`trace_id` atravessando API, broker e worker.
- Endpoint `/metrics` (formato Prometheus) na API e no worker, com taxa de requisições, latência (histograma), erros e tamanho/atraso da fila.
- Trace distribuído com OpenTelemetry de uma corrida da API até o worker (Jaeger ou Tempo no compose).
- Dois alertas, com os mesmos `groups` nestes dois arquivos:
  - `observability/alerts.yml`: regras do Prometheus, carregadas no compose e visíveis em `http://localhost:9090/alerts`.
  - `observability/alerts-prometheusrule.yaml`: as mesmas regras no formato `PrometheusRule`. Só o arquivo; não precisa rodar em lugar nenhum.
- Teste de carga com k6, com o script no repositório.

## Estrutura

```
apps/api/src/      auth, corridas, mensageria, cache, database/migrations, metricas
apps/worker/src/   consumidores, cache, historico, metricas
apps/ui/src/       pages, components, services
infra/             mysql, redis, mongodb, rabbitmq, prometheus
docs/
.github/workflows/
```

## Regras

- Nada de segredos reais no repositório. Chaves e tokens de exemplo devem ser claramente de teste.
- Tudo precisa rodar apenas com Docker instalado.
