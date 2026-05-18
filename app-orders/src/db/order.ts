import { integer, pgEnum, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { costumers } from "./costumers.ts";

export const orderStatusEnum = pgEnum("order_status", ["pending", "paid", "canceled"]);

export const orders = pgTable("orders", {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").notNull().references(() => costumers.id),
    amount: integer("amount").notNull(),
    status: orderStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});