# corridas

Versão simplificada do fluxo central de um sistema de táxi: passageiros solicitam corridas, motoristas aceitam e o sistema acompanha o status em tempo quase real.

> **Status:** Fase 1. Só a estrutura de pastas existe. Ainda não há código, configuração nem `docker-compose.yml`, então o sistema ainda não roda.

## Arquitetura

| Componente | Responsabilidade |
| --- | --- |
| API (Node.js) | Cria, altera o status e consulta corridas. Autenticação via JWT. |
| Worker (Node.js) | Consome os eventos `corrida.criada` e `corrida.status_alterado`, atualiza o cache no Redis e grava o histórico no MongoDB. |
| UI (React) | Login com token, criar corrida, listar e acompanhar status. |
| Broker | RabbitMQ. |

## Endpoints da API

| Método | Rota | O que faz |
| --- | --- | --- |
| `POST` | `/corridas` | Cria uma corrida. |
| `PATCH` | `/corridas/:id/status` | Altera o status (aceita, inicia, finaliza). |
| `GET` | `/corridas/:id` | Lê uma corrida, usando o cache. |

Todas as rotas exigem um token JWT no cabeçalho `Authorization: Bearer <token>`.

## Como rodar

Pré-requisito: apenas [Docker](https://docs.docker.com/get-docker/) instalado.

Quando a configuração estiver pronta, o ambiente local completo (API, worker, UI, MySQL, Redis, MongoDB, RabbitMQ e Prometheus) vai subir com:

```bash
docker compose up
```

## Estrutura de pastas

```
.github/workflows/   pipeline de CI (GitHub Actions)
apps/
  api/               API
    src/             auth, corridas, mensageria, cache, database/migrations, metricas
    test/
  worker/            consumidor de eventos
    src/             consumidores, cache, historico, metricas
    test/
  ui/                interface React
    public/
    src/             pages, components, services
    test/
infra/               configuração local de mysql, redis, mongodb, rabbitmq e prometheus
docs/                documentação
```

## CI

O pipeline do GitHub Actions ficará em `.github/workflows/`.
