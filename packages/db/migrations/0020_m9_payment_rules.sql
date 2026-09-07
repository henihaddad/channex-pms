CREATE TABLE "payment_rule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"trigger" text DEFAULT 'confirmation' NOT NULL,
	"offset_days" integer DEFAULT 0 NOT NULL,
	"amount_kind" text DEFAULT 'remainder' NOT NULL,
	"amount_value" integer DEFAULT 0 NOT NULL,
	"property_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"channels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_schedule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"rule_id" uuid,
	"name" text NOT NULL,
	"due_on" date NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"state" text DEFAULT 'scheduled' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_rule" ADD CONSTRAINT "payment_rule_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_schedule" ADD CONSTRAINT "payment_schedule_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_rule_org_idx" ON "payment_rule" USING btree ("org_id","position");--> statement-breakpoint
CREATE INDEX "payment_schedule_due_idx" ON "payment_schedule" USING btree ("state","due_on");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_schedule_booking_rule_idx" ON "payment_schedule" USING btree ("booking_id","rule_id","due_on");