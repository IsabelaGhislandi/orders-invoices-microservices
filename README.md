# Microservice — Orders & Invoices

**🌐 Language / Idioma:** [English](#english) · [Português](#português)

---

## English

A study project on **microservices architecture** with Node.js + TypeScript.
Two services communicate asynchronously through RabbitMQ, sitting behind a **Kong API
Gateway** and fully instrumented with **OpenTelemetry** (traces visualized in **Jaeger**).

- **app-orders** — receives orders over HTTP, stores them in PostgreSQL and **publishes**
  the `order-created` event to the `orders` queue.
- **app-invoices** — **consumes** the `orders` queue and processes the received orders.

### Architecture

```
                          ┌─────────────────────────────┐
   Client  ──────────────▶│  Kong API Gateway (:8000)   │
   POST /orders           │  routes /orders, /invoices  │
                          └──────────────┬──────────────┘
                                         ▼
                              app-orders (Fastify :3333)
                                         │
                       ┌─────────────────┼──────────────────┐
                       ▼                 ▼                  ▼
             PostgreSQL (:5432)   RabbitMQ (:5672)    Jaeger (:4318)
             stores the order     publishes           receives
             (Drizzle ORM)        "order-created"     traces (OTLP)
                                         │
                                         ▼  consumes the "orders" queue
                                app-invoices (Fastify :3334)
                                         │
                                         ▼
                                PostgreSQL invoices (:5483)
```

- **app-orders** — orders service (HTTP + database + message publishing).
- **app-invoices** — invoices service (HTTP + database + message consuming).
- **contracts** — message contracts (types) exchanged between services. Currently:
  `OrderCreatedMessage`.
- **docker/kong/config.yaml** — Kong declarative (DB-less) config: routes and CORS plugin.
- **docker-compose.yml** (root) — brings up **RabbitMQ** (broker), **Kong** (gateway) and **Jaeger** (tracing).
- **app-orders/docker-compose.yml** — brings up the orders **PostgreSQL**.
- **app-invoices/docker-compose.yml** — brings up the invoices **PostgreSQL**.
- **infra/** — [Pulumi](https://www.pulumi.com) program (TypeScript) for AWS provisioning (S3, ECR). Optional / experimental.

### Tech stack

| Layer           | Tool                                        |
| --------------- | ------------------------------------------- |
| API Gateway     | Kong 3.9 (DB-less / declarative)            |
| HTTP            | Fastify 5 + `fastify-type-provider-zod`     |
| Validation      | Zod 4                                        |
| Database        | PostgreSQL + Drizzle ORM / Drizzle Kit      |
| Messaging       | RabbitMQ + amqplib                          |
| Observability   | OpenTelemetry + Jaeger                       |
| Infrastructure  | Pulumi (AWS) — optional                      |
| Runtime         | Node.js 22+ (native TypeScript execution)   |

### Prerequisites

- [Node.js](https://nodejs.org) 22+ (runs `.ts` natively, no build step)
- [Docker](https://www.docker.com) + Docker Compose

### Getting started

> The commands below indicate which directory they should be run in.

#### 1. Start the infrastructure

```bash
# In the root: RabbitMQ (broker) + Kong (gateway) + Jaeger (tracing)
docker compose up -d

# Orders PostgreSQL
docker compose -f app-orders/docker-compose.yml up -d

# Invoices PostgreSQL
docker compose -f app-invoices/docker-compose.yml up -d
```

Panels available after startup:

| Service               | URL / Address                     | Credentials             |
| --------------------- | --------------------------------- | ----------------------- |
| Kong Proxy (gateway)  | http://localhost:8000             | —                       |
| Kong Admin API        | http://localhost:8001             | —                       |
| Kong Manager (GUI)    | http://localhost:8002             | —                       |
| RabbitMQ Management   | http://localhost:15672            | `guest` / `guest`       |
| Jaeger UI             | http://localhost:16686            | —                       |
| PostgreSQL (orders)   | `localhost:5432` (db `postgres`)  | `postgres` / `postgres` |
| PostgreSQL (invoices) | `localhost:5483` (db `invoices`)  | `postgres` / `postgres` |

#### 2. Configure environment variables

Each service reads its variables from a `.env` file in its own directory
(`app-orders/.env` and `app-invoices/.env`). This file is **not** versioned.
Create each one with the content below.

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

#### 3. Install dependencies

Repeat in **each** service:

```bash
cd app-orders   # then repeat in app-invoices
npm install
```

#### 4. Run database migrations

Migrations are already generated under `src/db/migrations`. Apply them in each service
with Drizzle Kit (from the service directory):

```bash
# inside app-orders and then inside app-invoices
npx drizzle-kit migrate
```

> To **generate** a new migration after changing the schema (`src/db/*.ts`):
> `npx drizzle-kit generate`. To open Drizzle Studio: `npx drizzle-kit studio`.

#### 5. Start the services

In separate terminals, inside each directory:

```bash
# inside app-orders / app-invoices

# development (reloads on save, loads .env automatically)
npm run dev

# production
npm start
```

On startup, each service prints to the console:

```
[Orders] HTTP server running!
```

- **app-orders** runs at **http://localhost:3333**
- **app-invoices** runs at **http://localhost:3334**
- Through the gateway, both are reachable at **http://localhost:8000**

### Endpoints

Requests can hit the services **directly** (ports 3333 / 3334) or **through the Kong
gateway** at port 8000 (`/orders` → orders, `/invoices` → invoices).

#### `GET /health` (orders and invoices)

Checks whether the service is up.

```bash
curl http://localhost:3333/health   # orders
curl http://localhost:3334/health   # invoices
# { "message": "OK" }
```

#### `POST /orders` (app-orders)

Creates an order: stores it in PostgreSQL and publishes the `order-created` event to the
RabbitMQ `orders` queue — which is then consumed by **app-invoices**.

```bash
# direct
curl -X POST http://localhost:3333/orders \
  -H "Content-Type: application/json" \
  -d '{ "amount": 2, "title": "T-shirt", "price": 50 }'

# through the Kong gateway
curl -X POST http://localhost:8000/orders \
  -H "Content-Type: application/json" \
  -d '{ "amount": 2, "title": "T-shirt", "price": 50 }'
# { "message": "Order created successfully", "orderId": 1 }
```

Expected body (validated with Zod):

| Field    | Type     | Description         |
| -------- | -------- | ------------------- |
| `amount` | `number` | Order quantity      |
| `title`  | `string` | Title/description   |
| `price`  | `number` | Price               |

### API Gateway (Kong)

Kong runs in **DB-less mode**, configured declaratively via `docker/kong/config.yaml`.
It exposes a single entry point (`http://localhost:8000`) and routes traffic to the
services, plus a CORS plugin allowing all origins.

| Route       | Forwards to                | Service      |
| ----------- | -------------------------- | ------------ |
| `/orders`   | `host.docker.internal:3333` | app-orders   |
| `/invoices` | `host.docker.internal:3334` | app-invoices |

> The gateway reaches host-machine services through `host.docker.internal`
> (`extra_hosts` in `docker-compose.yml`), so the services run on the host while Kong
> runs in a container.

### Observability (Jaeger)

Both services are automatically instrumented by
`@opentelemetry/auto-instrumentations-node` (loaded at the top of each `server.ts`)
and export traces via OTLP to the Jaeger configured in the root `docker-compose.yml`.

After firing some requests, open the **Jaeger UI** at http://localhost:16686, pick the
service (`orders` or `invoices`) and inspect the traces — including propagation across
RabbitMQ between the services.

### Folder structure

```
microservice/
├── docker-compose.yml             # RabbitMQ (broker) + Kong (gateway) + Jaeger (tracing)
├── docker/
│   └── kong/
│       └── config.yaml            # Kong declarative (DB-less) config
├── contracts/
│   └── messages/
│       └── order-created-message.ts   # shared message contract
├── infra/                         # Pulumi (AWS) — optional/experimental
│   └── index.ts
├── app-orders/                    # PRODUCER service
│   ├── docker-compose.yml         # PostgreSQL (orders)
│   ├── Dockerfile                 # production image
│   ├── drizzle.config.ts          # Drizzle Kit config
│   ├── .env                       # environment variables (not versioned)
│   ├── broker/                    # RabbitMQ integration
│   │   ├── broker.ts              # broker connection
│   │   ├── channels/              # channels/queues
│   │   └── messages/              # message publishers
│   └── src/
│       ├── http/server.ts         # entry point (Fastify)
│       ├── tracer/tracer.ts       # OpenTelemetry tracer
│       └── db/                    # Drizzle client, tables and migrations
└── app-invoices/                  # CONSUMER service
    ├── docker-compose.yml         # PostgreSQL (invoices)
    ├── broker/
    │   └── subscriber.ts          # "orders" queue consumer
    └── src/
        ├── http/server.ts         # entry point (Fastify)
        └── db/                    # Drizzle client, tables and migrations
```

### Order flow

1. Client sends `POST /orders` to **app-orders** (directly or via Kong).
2. Fastify validates the body with Zod (`server.ts`).
3. The order is stored in the `orders` table via Drizzle.
4. `dispatchOrderCreatedMessage` publishes the `order-created` event to the `orders` queue.
5. **app-orders** responds `201 Created`.
6. **app-invoices** consumes the message from the queue (`broker/subscriber.ts`) and processes it.
7. The whole journey is recorded as traces in **Jaeger**.

---

## Português

Projeto de estudo de **arquitetura de microsserviços** com Node.js + TypeScript.
Dois serviços se comunicam de forma assíncrona via RabbitMQ, ficam atrás de um **Kong API
Gateway** e são totalmente instrumentados com **OpenTelemetry** (traces visualizadas no **Jaeger**).

- **app-orders** — recebe pedidos por HTTP, grava no PostgreSQL e **publica** o evento
  `order-created` na fila `orders`.
- **app-invoices** — **consome** a fila `orders` e processa os pedidos recebidos.

### Arquitetura

```
                          ┌─────────────────────────────┐
   Cliente  ─────────────▶│  Kong API Gateway (:8000)   │
   POST /orders           │  roteia /orders, /invoices  │
                          └──────────────┬──────────────┘
                                         ▼
                              app-orders (Fastify :3333)
                                         │
                       ┌─────────────────┼──────────────────┐
                       ▼                 ▼                  ▼
             PostgreSQL (:5432)   RabbitMQ (:5672)    Jaeger (:4318)
             grava o pedido       publica             recebe as
             (Drizzle ORM)        "order-created"     traces (OTLP)
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
- **docker/kong/config.yaml** — config declarativa (DB-less) do Kong: rotas e plugin de CORS.
- **docker-compose.yml** (raiz) — sobe o **RabbitMQ** (broker), o **Kong** (gateway) e o **Jaeger** (tracing).
- **app-orders/docker-compose.yml** — sobe o **PostgreSQL** do orders.
- **app-invoices/docker-compose.yml** — sobe o **PostgreSQL** do invoices.
- **infra/** — programa [Pulumi](https://www.pulumi.com) (TypeScript) para provisionar AWS (S3, ECR). Opcional / experimental.

### Tecnologias

| Camada          | Ferramenta                                  |
| --------------- | ------------------------------------------- |
| API Gateway     | Kong 3.9 (DB-less / declarativo)            |
| HTTP            | Fastify 5 + `fastify-type-provider-zod`     |
| Validação       | Zod 4                                        |
| Banco           | PostgreSQL + Drizzle ORM / Drizzle Kit      |
| Mensageria      | RabbitMQ + amqplib                          |
| Observabilidade | OpenTelemetry + Jaeger                       |
| Infraestrutura  | Pulumi (AWS) — opcional                      |
| Runtime         | Node.js 22+ (execução nativa de TypeScript) |

### Pré-requisitos

- [Node.js](https://nodejs.org) 22+ (executa `.ts` nativamente, sem build)
- [Docker](https://www.docker.com) + Docker Compose

### Como iniciar o projeto

> Os comandos abaixo indicam em qual diretório devem ser executados.

#### 1. Subir a infraestrutura

```bash
# Na raiz: RabbitMQ (broker) + Kong (gateway) + Jaeger (tracing)
docker compose up -d

# PostgreSQL do orders
docker compose -f app-orders/docker-compose.yml up -d

# PostgreSQL do invoices
docker compose -f app-invoices/docker-compose.yml up -d
```

Painéis disponíveis após subir:

| Serviço               | URL / Endereço                    | Credenciais             |
| --------------------- | --------------------------------- | ----------------------- |
| Kong Proxy (gateway)  | http://localhost:8000             | —                       |
| Kong Admin API        | http://localhost:8001             | —                       |
| Kong Manager (GUI)    | http://localhost:8002             | —                       |
| RabbitMQ Management   | http://localhost:15672            | `guest` / `guest`       |
| Jaeger UI             | http://localhost:16686            | —                       |
| PostgreSQL (orders)   | `localhost:5432` (db `postgres`)  | `postgres` / `postgres` |
| PostgreSQL (invoices) | `localhost:5483` (db `invoices`)  | `postgres` / `postgres` |

#### 2. Configurar variáveis de ambiente

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

#### 3. Instalar dependências

Repita em **cada** serviço:

```bash
cd app-orders   # depois, repita em app-invoices
npm install
```

#### 4. Rodar as migrations do banco

As migrations já estão geradas em `src/db/migrations`. Aplique-as em cada serviço
com o Drizzle Kit (a partir do diretório do serviço):

```bash
# dentro de app-orders e, depois, dentro de app-invoices
npx drizzle-kit migrate
```

> Para **gerar** uma nova migration após alterar o schema (`src/db/*.ts`):
> `npx drizzle-kit generate`. Para abrir o Drizzle Studio: `npx drizzle-kit studio`.

#### 5. Iniciar os serviços

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
- Pelo gateway, ambos ficam acessíveis em **http://localhost:8000**

### Endpoints

As requisições podem chegar **direto** nos serviços (portas 3333 / 3334) ou **pelo
gateway Kong** na porta 8000 (`/orders` → orders, `/invoices` → invoices).

#### `GET /health` (orders e invoices)

Verifica se o serviço está no ar.

```bash
curl http://localhost:3333/health   # orders
curl http://localhost:3334/health   # invoices
# { "message": "OK" }
```

#### `POST /orders` (app-orders)

Cria um pedido: grava no PostgreSQL e publica o evento `order-created` na fila
`orders` do RabbitMQ — que é então consumido pelo **app-invoices**.

```bash
# direto
curl -X POST http://localhost:3333/orders \
  -H "Content-Type: application/json" \
  -d '{ "amount": 2, "title": "Camiseta", "price": 50 }'

# pelo gateway Kong
curl -X POST http://localhost:8000/orders \
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

### API Gateway (Kong)

O Kong roda em **modo DB-less**, configurado de forma declarativa via
`docker/kong/config.yaml`. Ele expõe um único ponto de entrada
(`http://localhost:8000`) e roteia o tráfego para os serviços, além de um plugin de
CORS liberando todas as origens.

| Rota        | Encaminha para              | Serviço      |
| ----------- | --------------------------- | ------------ |
| `/orders`   | `host.docker.internal:3333` | app-orders   |
| `/invoices` | `host.docker.internal:3334` | app-invoices |

> O gateway alcança os serviços da máquina host através do `host.docker.internal`
> (`extra_hosts` no `docker-compose.yml`), então os serviços rodam no host enquanto o
> Kong roda em container.

### Observabilidade (Jaeger)

Os dois serviços são instrumentados automaticamente pelo
`@opentelemetry/auto-instrumentations-node` (carregado no topo de cada `server.ts`)
e exportam as traces via OTLP para o Jaeger configurado no `docker-compose.yml` da raiz.

Após disparar requisições, acesse a **Jaeger UI** em http://localhost:16686, selecione
o serviço (`orders` ou `invoices`) e visualize as traces — incluindo a propagação
através do RabbitMQ entre os serviços.

### Estrutura de pastas

```
microservice/
├── docker-compose.yml             # RabbitMQ (broker) + Kong (gateway) + Jaeger (tracing)
├── docker/
│   └── kong/
│       └── config.yaml            # config declarativa (DB-less) do Kong
├── contracts/
│   └── messages/
│       └── order-created-message.ts   # contrato compartilhado da mensagem
├── infra/                         # Pulumi (AWS) — opcional/experimental
│   └── index.ts
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

### Fluxo de um pedido

1. Cliente faz `POST /orders` no **app-orders** (direto ou via Kong).
2. O Fastify valida o corpo com Zod (`server.ts`).
3. O pedido é gravado na tabela `orders` via Drizzle.
4. `dispatchOrderCreatedMessage` publica o evento `order-created` na fila `orders`.
5. O **app-orders** responde `201 Created`.
6. O **app-invoices** consome a mensagem da fila (`broker/subscriber.ts`) e a processa.
7. Toda a jornada é registrada como traces no **Jaeger**.
