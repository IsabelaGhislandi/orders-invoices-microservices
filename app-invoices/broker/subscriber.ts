import { ordersChannel } from "./channels/orders.ts"

ordersChannel.consume('orders', async message => {
    if (!message) {
        return null
    }
    console.log(message?.content.toString()) //Vem como buffer converter
    ordersChannel.ack(message)
}, {
    noAck: false, // dizer q a mensagem foi recebida com sucesso automaticamente
})