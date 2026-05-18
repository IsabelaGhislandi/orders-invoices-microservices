import amqp from "amqplib";

if (!process.env.BROKER_URL) {
    throw new Error("BROKER_URL is not set");
}

export const connect = await amqp.connect(process.env.BROKER_URL);
