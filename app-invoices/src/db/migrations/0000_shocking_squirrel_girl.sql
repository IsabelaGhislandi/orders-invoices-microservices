CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
