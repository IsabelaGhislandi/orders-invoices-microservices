import "@opentelemetry/auto-instrumentations-node/register"
import { fastify } from "fastify";
import { fastifyCors } from "@fastify/cors";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import "../../broker/subscriber.ts"

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

app.listen({ host: "0.0.0.0", port: 3334 }).then(() => {
    console.log("[Orders] HTTP server running!");
});
