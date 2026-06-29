# Microservice — Orders & Invoices

Projeto de estudo de **arquitetura de microsserviços** com Node.js + TypeScript.
São dois serviços que se comunicam de forma assíncrona via RabbitMQ:

- **app-orders** — recebe pedidos por HTTP, grava no PostgreSQL e **publica** o evento
  `order-created` na fila `orders`.
- **app-invoices** — **consome** a fila `orders` e processa os pedidos recebidos.

Todo o tráfego é instrumentado com **OpenTelemetry** e as traces são visualizadas no
**Jaeger**.

## Arquitetura

```
                POST /orders
  Cliente  ──────────────────▶  app-orders (Fastify :3333)
                                     │
                      ┌──────────────┼───────────────┐
                      ▼              ▼               ▼
            PostgreSQL (:5432)   RabbitMQ (:5672)   Jaeger (:4318)
            grava o pedido       publica            recebe as
            (Drizzle ORM)        "order-created"    traces (OTLP)
                                     │
                                     ▼  consome a fila "orders"
                            app-invoices (Fastify :3334)
                                     │
                                     ▼
                            PostgreSQL invoices (:5483)
```

- **app-orders** — serviço de pedidos (HTTP + banco + publicação de mensagens).
- **app-invoices** — serviço de faturas (HTTP + banco + consumo de mensagens).
- **contracts** — contratos (tipos) das mensagens trocadas entre serviços. Hoje:
  `OrderCreatedMessage`.
- **docker-compose.yml** (raiz) — sobe o **RabbitMQ** (broker) e o **Jaeger** (tracing).
- **app-orders/docker-compose.yml** — sobe o **PostgreSQL** do orders.
- **app-invoices/docker-compose.yml** — sobe o **PostgreSQL** do invoices.

## Tecnologias

| Camada      | Ferramenta                              |
| ----------- | --------------------------------------- |
| HTTP        | Fastify 5 + `fastify-type-provider-zod` |
| Validação   | Zod 4                                   |
| Banco       | PostgreSQL + Drizzle ORM / Drizzle Kit  |
| Mensageria  | RabbitMQ + amqplib                      |
| Observabilidade | OpenTelemetry + Jaeger              |
| Runtime     | Node.js 22+ (execução nativa de TypeScript) |

## Pré-requisitos

- [Node.js](https://nodejs.org) 22+ (executa `.ts` nativamente, sem build)
- [Docker](https://www.docker.com) + Docker Compose

## Como iniciar o projeto

> Os comandos abaixo indicam em qual diretório devem ser executados.

### 1. Subir a infraestrutura

```bash
# Na raiz: RabbitMQ (broker) + Jaeger (tracing)
docker compose up -d

# PostgreSQL do orders
docker compose -f app-orders/docker-compose.yml up -d

# PostgreSQL do invoices
docker compose -f app-invoices/docker-compose.yml up -d
```

Painéis disponíveis após subir:

| Serviço             | URL / Endereço                                  | Credenciais             |
| ------------------- | ----------------------------------------------- | ----------------------- |
| RabbitMQ Management  | http://localhost:15672                          | `guest` / `guest`       |
| Jaeger UI            | http://localhost:16686                          | —                       |
| PostgreSQL (orders)  | `localhost:5432` (db `postgres`)                | `postgres` / `postgres` |
| PostgreSQL (invoices)| `localhost:5483` (db `invoices`)                | `postgres` / `postgres` |

### 2. Configurar variáveis de ambiente

Cada serviço lê suas variáveis de um arquivo `.env` no próprio diretório
(`app-orders/.env` e `app-invoices/.env`). Esse arquivo **não** é versionado.
Crie cada um com o conteúdo abaixo.

**`app-orders/.env`**

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
BROKER_URL="amqp://localhost:5672"

OTEL_TRACES_EXPORTER="otlp"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
OTEL_SERVICE_NAME="orders"
OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,fastify,pg,amqplib
```

**`app-invoices/.env`**

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5483/invoices"
BROKER_URL="amqp://localhost:5672"

OTEL_TRACES_EXPORTER="otlp"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
OTEL_SERVICE_NAME="invoices"
OTEL_NODE_ENABLED_INSTRUMENTATIONS=http,fastify,pg,amqplib
```

### 3. Instalar dependências

Repita em **cada** serviço:

```bash
cd app-orders   # depois, repita em app-invoices
npm install
```

### 4. Rodar as migrations do banco

As migrations já estão geradas em `src/db/migrations`. Aplique-as em cada serviço
com o Drizzle Kit (a partir do diretório do serviço):

```bash
# dentro de app-orders e, depois, dentro de app-invoices
npx drizzle-kit migrate
```

> Para **gerar** uma nova migration após alterar o schema (`src/db/*.ts`):
> `npx drizzle-kit generate`. Para abrir o Drizzle Studio: `npx drizzle-kit studio`.

### 5. Iniciar os serviços

Em terminais separados, dentro de cada diretório:

```bash
# dentro de app-orders / app-invoices

# desenvolvimento (recarrega ao salvar, carrega o .env automaticamente)
npm run dev

# produção
npm start
```

Ao iniciar, cada serviço imprime no console:

```
[Orders] HTTP server running!
```

- **app-orders** sobe em **http://localhost:3333**
- **app-invoices** sobe em **http://localhost:3334**

## Endpoints

### `GET /health` (orders e invoices)

Verifica se o serviço está no ar.

```bash
curl http://localhost:3333/health   # orders
curl http://localhost:3334/health   # invoices
# { "message": "OK" }
```

### `POST /orders` (app-orders)

Cria um pedido: grava no PostgreSQL e publica o evento `order-created` na fila
`orders` do RabbitMQ — que é então consumido pelo **app-invoices**.

```bash
curl -X POST http://localhost:3333/orders \
  -H "Content-Type: application/json" \
  -d '{ "amount": 2, "title": "Camiseta", "price": 50 }'
# { "message": "Order created successfully", "orderId": 1 }
```

Corpo esperado (validado com Zod):

| Campo    | Tipo     | Descrição              |
| -------- | -------- | ---------------------- |
| `amount` | `number` | Quantidade do pedido   |
| `title`  | `string` | Título/descrição       |
| `price`  | `number` | Preço                  |

## Observabilidade (Jaeger)

Os dois serviços são instrumentados automaticamente pelo
`@opentelemetry/auto-instrumentations-node` (carregado no topo de cada `server.ts`)
e exportam as traces via OTLP para o Jaeger configurado no `docker-compose.yml` da raiz.

Após disparar requisições, acesse a **Jaeger UI** em http://localhost:16686, selecione
o serviço (`orders` ou `invoices`) e visualize as traces — incluindo a propagação
através do RabbitMQ entre os serviços.

## Estrutura de pastas

```
microservice/
├── docker-compose.yml             # RabbitMQ (broker) + Jaeger (tracing)
├── contracts/
│   └── messages/
│       └── order-created-message.ts   # contrato compartilhado da mensagem
├── app-orders/                    # serviço PRODUTOR
│   ├── docker-compose.yml         # PostgreSQL (orders)
│   ├── Dockerfile                 # imagem de produção do serviço
│   ├── drizzle.config.ts          # config do Drizzle Kit
│   ├── .env                       # variáveis de ambiente (não versionado)
│   ├── broker/                    # integração com RabbitMQ
│   │   ├── broker.ts              # conexão com o broker
│   │   ├── channels/              # canais/filas
│   │   └── messages/              # publicadores de mensagens
│   └── src/
│       ├── http/server.ts         # ponto de entrada (Fastify)
│       ├── tracer/tracer.ts       # tracer OpenTelemetry
│       └── db/                    # cliente Drizzle, tabelas e migrations
└── app-invoices/                  # serviço CONSUMIDOR
    ├── docker-compose.yml         # PostgreSQL (invoices)
    ├── broker/
    │   └── subscriber.ts          # consumidor da fila "orders"
    └── src/
        ├── http/server.ts         # ponto de entrada (Fastify)
        └── db/                    # cliente Drizzle, tabelas e migrations
```

## Fluxo de um pedido

1. Cliente faz `POST /orders` no **app-orders**.
2. O Fastify valida o corpo com Zod (`server.ts`).
3. O pedido é gravado na tabela `orders` via Drizzle.
4. `dispatchOrderCreatedMessage` publica o evento `order-created` na fila `orders`.
5. O **app-orders** responde `201 Created`.
6. O **app-invoices** consome a mensagem da fila (`broker/subscriber.ts`) e a processa.
7. Toda a jornada é registrada como traces no **Jaeger**.
```