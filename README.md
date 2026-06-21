# Microservice — Orders

Projeto de estudo de **arquitetura de microsserviços** com Node.js + TypeScript.
Atualmente contém um único serviço (`app-orders`) que expõe uma API HTTP, persiste
dados em PostgreSQL e publica eventos em uma fila RabbitMQ para serem consumidos por
outros serviços.

## Arquitetura

```
                 POST /orders
   Cliente  ──────────────────▶  app-orders (Fastify :3333)
                                      │
                       ┌──────────────┴───────────────┐
                       ▼                               ▼
              PostgreSQL (:5432)              RabbitMQ (:5672)
              grava o pedido                  publica "order-created"
              (Drizzle ORM)                   na fila "orders"
```

- **app-orders** — serviço de pedidos (HTTP + banco + publicação de mensagens).
- **contracts** — contratos (tipos) das mensagens trocadas entre serviços. Hoje:
  `OrderCreatedMessage`.
- **docker-compose.yml** (raiz) — sobe o **RabbitMQ** (broker de mensagens).
- **app-orders/docker-compose.yml** — sobe o **PostgreSQL**.

## Tecnologias

| Camada      | Ferramenta                          |
| ----------- | ----------------------------------- |
| HTTP        | Fastify 5 + `fastify-type-provider-zod` |
| Validação   | Zod 4                               |
| Banco       | PostgreSQL + Drizzle ORM / Drizzle Kit |
| Mensageria  | RabbitMQ + amqplib                  |
| Runtime     | Node.js (execução nativa de TypeScript) |

## Pré-requisitos

- [Node.js](https://nodejs.org) 22+ (executa `.ts` nativamente, sem build)
- [Docker](https://www.docker.com) + Docker Compose

## Como iniciar o projeto

> Os comandos abaixo são executados na **raiz** do repositório, salvo indicação.

### 1. Subir a infraestrutura (PostgreSQL + RabbitMQ)

```bash
# RabbitMQ (broker) — definido no docker-compose.yml da raiz
docker compose up -d

# PostgreSQL — definido dentro de app-orders
docker compose -f app-orders/docker-compose.yml up -d
```

Painéis disponíveis após subir:
- RabbitMQ Management: http://localhost:15672 (usuário/senha: `guest` / `guest`)
- PostgreSQL: `localhost:5432` (usuário/senha/db: `postgres` / `postgres` / `postgres`)

### 2. Configurar variáveis de ambiente

O serviço lê as variáveis de `app-orders/.env`. O arquivo já vem preenchido com os
valores padrão do Docker Compose:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres"
BROKER_URL="amqp://localhost:5672"
```

### 3. Instalar dependências

```bash
cd app-orders
npm install
```

### 4. Rodar as migrations do banco

As migrations já estão geradas em `src/db/migrations`. Aplique-as no banco com o
Drizzle Kit:

```bash
# dentro de app-orders
npx drizzle-kit migrate
```

> Para **gerar** uma nova migration após alterar o schema (`src/db/*.ts`):
> `npx drizzle-kit generate`. Para abrir o Drizzle Studio: `npx drizzle-kit studio`.

### 5. Iniciar o serviço

```bash
# dentro de app-orders

# desenvolvimento (recarrega ao salvar, carrega o .env automaticamente)
npm run dev

# produção
npm start
```

Ao iniciar, você verá no console:

```
[Orders] HTTP server running!
```

O servidor sobe em **http://localhost:3333**.

## Endpoints

### `GET /health`

Verifica se o serviço está no ar.

```bash
curl http://localhost:3333/health
# { "message": "OK" }
```

### `POST /orders`

Cria um pedido: grava no PostgreSQL e publica o evento `order-created` na fila
`orders` do RabbitMQ.

```bash
curl -X POST http://localhost:3333/orders \
  -H "Content-Type: application/json" \
  -d '{ "amount": 2, "title": "Camiseta", "price": 50 }'
# { "message": "Order created successfully" }
```

Corpo esperado (validado com Zod):

| Campo    | Tipo     | Descrição              |
| -------- | -------- | ---------------------- |
| `amount` | `number` | Quantidade do pedido   |
| `title`  | `string` | Título/descrição       |
| `price`  | `number` | Preço                  |

## Estrutura de pastas

```
microservice/
├── docker-compose.yml          # RabbitMQ (broker)
├── contracts/
│   └── messages/
│       └── order-created-message.ts   # contrato compartilhado da mensagem
└── app-orders/
    ├── docker-compose.yml      # PostgreSQL
    ├── Dockerfile              # imagem de produção do serviço
    ├── drizzle.config.ts       # config do Drizzle Kit
    ├── .env                    # variáveis de ambiente
    ├── broker/                 # integração com RabbitMQ
    │   ├── broker.ts           # conexão com o broker
    │   ├── channels/           # canais/filas
    │   └── messages/           # publicadores de mensagens
    └── src/
        ├── http/
        │   └── server.ts       # ponto de entrada (Fastify)
        └── db/
            ├── client.ts       # cliente Drizzle
            ├── order.ts        # tabela orders
            ├── costumers.ts    # tabela costumers
            └── migrations/     # migrations geradas
```

## Fluxo de um pedido

1. Cliente faz `POST /orders`.
2. O Fastify valida o corpo com Zod (`server.ts`).
3. `dispatchOrderCreatedMessage` publica o evento na fila `orders` do RabbitMQ.
4. O pedido é gravado na tabela `orders` via Drizzle.
5. O serviço responde `201 Created`.
