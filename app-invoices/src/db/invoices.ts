import { text, pgTable, serial, timestamp } from "drizzle-orm/pg-core";

export const invoices = pgTable("invoices", {
    id: serial("id").primaryKey(),
    orderId: text().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});