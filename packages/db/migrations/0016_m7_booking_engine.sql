CREATE TABLE "booking_engine_settings" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"connection_id" uuid,
	"guarantee" jsonb DEFAULT '{"kind":"pay_at_property"}'::jsonb NOT NULL,
	"taxes" jsonb DEFAULT '{"vatBps":0,"cityTaxPerPersonNightMinor":0,"cityTaxMaxNights":null}'::jsonb NOT NULL,
	"theme" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" text,
	"attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lat" text,
	"lng" text,
	"access_reveal_hours" integer DEFAULT 24 NOT NULL,
	"analytics_snippet" text,
	"abandonment_emails" boolean DEFAULT false NOT NULL,
	"house_manual" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_hold" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"arrival_date" date NOT NULL,
	"departure_date" date NOT NULL,
	"rooms" integer DEFAULT 1 NOT NULL,
	"adults" integer NOT NULL,
	"children" integer DEFAULT 0 NOT NULL,
	"child_ages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quote" jsonb NOT NULL,
	"promo_code" text,
	"extras" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"guest_enc" text,
	"consent_marketing" boolean DEFAULT false NOT NULL,
	"state" text DEFAULT 'held' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"idempotency_key" text,
	"booking_id" uuid,
	"payment_intent_id" text,
	"recovery_mailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extra" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price_minor" integer NOT NULL,
	"per" text DEFAULT 'stay' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "pre_checkin" (
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"arrival_time" text,
	"id_document_ref" text,
	"preferences" text,
	"guests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_code" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid,
	"code" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"stay_from" date,
	"stay_to" date,
	"min_nights" integer,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"single_use" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_plan" ADD COLUMN "direct_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_engine_settings" ADD CONSTRAINT "booking_engine_settings_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_engine_settings" ADD CONSTRAINT "booking_engine_settings_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_hold" ADD CONSTRAINT "booking_hold_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_hold" ADD CONSTRAINT "booking_hold_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_hold" ADD CONSTRAINT "booking_hold_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_hold" ADD CONSTRAINT "booking_hold_rate_plan_id_rate_plan_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra" ADD CONSTRAINT "extra_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra" ADD CONSTRAINT "extra_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_session" ADD CONSTRAINT "guest_session_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_session" ADD CONSTRAINT "guest_session_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_checkin" ADD CONSTRAINT "pre_checkin_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pre_checkin" ADD CONSTRAINT "pre_checkin_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code" ADD CONSTRAINT "promo_code_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_code" ADD CONSTRAINT "promo_code_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_hold_room_type_idx" ON "booking_hold" USING btree ("room_type_id","state","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_hold_idempotency_idx" ON "booking_hold" USING btree ("org_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "extra_property_idx" ON "extra" USING btree ("property_id","active");--> statement-breakpoint
CREATE INDEX "guest_session_booking_idx" ON "guest_session" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_code_org_code_idx" ON "promo_code" USING btree ("org_id","code");