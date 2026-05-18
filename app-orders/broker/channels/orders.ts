import { connect } from "../broker.ts";

export const ordersChannel = await connect.createChannel();
await ordersChannel.assertQueue("orders", {
    durable: true,
});

