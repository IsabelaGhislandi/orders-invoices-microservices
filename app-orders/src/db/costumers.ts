import { date, pgTable, serial, text } from "drizzle-orm/pg-core";

export const costumers = pgTable("costumers", {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    country: text("country").notNull(),
    dateOfBirth: date({mode: "date"}),
});