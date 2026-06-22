import "@opentelemetry/auto-instrumentations-node/register"
import { fastify } from "fastify";
import { fastifyCors } from "@fastify/cors";
import { z } from "zod";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { trace } from "@opentelemetry/api";
import { orders } from "../db/order.ts";
import { db } from "../db/client.ts";
import { tracer } from "../tracer/tracer.ts";
import { setTimeout } from "node:timers/promises"
import { dispatchOrderCreatedMessage } from "../../broker/messages/order-created.ts";

const app = fastify().withTypeProvider<ZodTypeProvider>();

//Validação
app.setSerializerCompiler(serializerCompiler);
app.setValidatorCompiler(validatorCompiler);

app.register(fastifyCors, {
    origin: "*",
});

app.get('/health', async (request, reply) => {
    return reply.status(200).send({
        message: "OK",
    });
})
 
app.post('/orders', {
    schema: {
        body: z.object({
            amount: z.number(),
            title: z.string(),
            price: z.number(),
        }),
    },
}, async (request, reply) => {
    const { amount, title, price } = request.body;
    console.log('Creating order...', amount, title, price);
    const [order] = await db.insert(orders).values({
        amount,
        customerId: 1,
    }).returning({ id: orders.id });
    const orderId = order.id;
    const span = tracer.startSpan("eu acho q pode tar dando merda aqui");
    try {
        span.setAttribute("order_id", orderId);
        await setTimeout(2000); 
        dispatchOrderCreatedMessage({
            orderId: String(orderId),
            amount,
            customer: { id: 1 },
        });
    } finally {
        span.end();
    }
    trace.getActiveSpan()?.setAttribute("order_id", orderId);
    dispatchOrderCreatedMessage({
        orderId: String(orderId),
        amount,
        customer: {
            id: 1,
        },
    });
    return reply.status(201).send({
        message: "Order created successfully",
        orderId,
    });
});

app.listen({ host: "0.0.0.0", port: 3333 }).then(() => {
    console.log("[Orders] HTTP server running!");
});
