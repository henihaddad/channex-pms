CREATE TABLE "availability_day" (
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"date" date NOT NULL,
	"available" integer NOT NULL,
	"synced_available" integer,
	"sync_state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone,
	CONSTRAINT "availability_day_room_type_id_date_pk" PRIMARY KEY("room_type_id","date")
);
--> statement-breakpoint
CREATE TABLE "rate_day" (
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"values" jsonb NOT NULL,
	"synced_values" jsonb,
	"sync_state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone,
	CONSTRAINT "rate_day_rate_plan_id_date_pk" PRIMARY KEY("rate_plan_id","date")
);
--> statement-breakpoint
CREATE TABLE "rate_plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"channex_rate_plan_id" text,
	"title" text NOT NULL,
	"currency" text NOT NULL,
	"sell_mode" text DEFAULT 'per_room' NOT NULL,
	"parent_rate_plan_id" uuid,
	"derived_option" jsonb,
	"meal_plan" text,
	"tax_set_id" uuid,
	"policy_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "room_type" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"channex_room_type_id" text,
	"title" text NOT NULL,
	"count_of_rooms" integer DEFAULT 1 NOT NULL,
	"occ_adults" integer DEFAULT 2 NOT NULL,
	"occ_children" integer DEFAULT 0 NOT NULL,
	"occ_infants" integer DEFAULT 0 NOT NULL,
	"max_occupancy" integer DEFAULT 2 NOT NULL,
	"default_occupancy" integer DEFAULT 2 NOT NULL,
	"is_system_managed" boolean DEFAULT false NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload_hash" text,
	"date_from" date,
	"date_to" date,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"entries" integer DEFAULT 0 NOT NULL,
	"accepted" integer DEFAULT 0 NOT NULL,
	"rejected" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "sync_operation_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"channex_booking_id" text NOT NULL,
	"ota_reservation_code" text,
	"ota_name" text,
	"channel_connection_id" uuid,
	"status" text NOT NULL,
	"arrival_date" date NOT NULL,
	"departure_date" date NOT NULL,
	"currency" text NOT NULL,
	"total_amount_minor" bigint NOT NULL,
	"ota_commission_minor" bigint,
	"guest_id" uuid,
	"mapping_state" text DEFAULT 'mapped' NOT NULL,
	"ops_state" text DEFAULT 'expected' NOT NULL,
	"last_revision_id" uuid,
	"last_revision_inserted_at" text,
	"last_system_id" text,
	"acked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_channex_booking_id_unique" UNIQUE("channex_booking_id")
);
--> statement-breakpoint
CREATE TABLE "booking_revision" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"channex_revision_id" text NOT NULL,
	"system_id" text NOT NULL,
	"revision_type" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"normalised" jsonb NOT NULL,
	"diff_from_previous" jsonb,
	"inserted_at" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone,
	"acked_at" timestamp with time zone,
	CONSTRAINT "booking_revision_channex_revision_id_unique" UNIQUE("channex_revision_id"),
	CONSTRAINT "booking_revision_system_id_unique" UNIQUE("system_id")
);
--> statement-breakpoint
CREATE TABLE "booking_room" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"room_type_id" uuid,
	"rate_plan_id" uuid,
	"checkin_date" date NOT NULL,
	"checkout_date" date NOT NULL,
	"occupancy" jsonb NOT NULL,
	"guest_names" jsonb NOT NULL,
	"amount_minor" bigint NOT NULL,
	"assigned_unit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_room_day" (
	"org_id" uuid NOT NULL,
	"booking_room_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid,
	"date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	CONSTRAINT "booking_room_day_booking_room_id_date_pk" PRIMARY KEY("booking_room_id","date")
);
--> statement-breakpoint
CREATE TABLE "guest" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"name_enc" text NOT NULL,
	"surname_enc" text NOT NULL,
	"email_enc" text,
	"phone_enc" text,
	"country" text,
	"language" text,
	"dedupe_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"erased_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inbound_webhook" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"state" text DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "inbound_webhook_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "payment_instrument" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"type" text DEFAULT 'card' NOT NULL,
	"card_type" text,
	"masked_number" text,
	"expiry" text,
	"cardholder" text,
	"provider_token_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "webhook_token" text;--> statement-breakpoint
ALTER TABLE "property" ADD COLUMN "webhook_secret_enc" text;--> statement-breakpoint
ALTER TABLE "availability_day" ADD CONSTRAINT "availability_day_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_day" ADD CONSTRAINT "availability_day_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_day" ADD CONSTRAINT "availability_day_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_day" ADD CONSTRAINT "rate_day_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_day" ADD CONSTRAINT "rate_day_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_day" ADD CONSTRAINT "rate_day_rate_plan_id_rate_plan_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan" ADD CONSTRAINT "rate_plan_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan" ADD CONSTRAINT "rate_plan_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_plan" ADD CONSTRAINT "rate_plan_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type" ADD CONSTRAINT "room_type_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_type" ADD CONSTRAINT "room_type_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operation" ADD CONSTRAINT "sync_operation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operation" ADD CONSTRAINT "sync_operation_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_guest_id_guest_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_revision" ADD CONSTRAINT "booking_revision_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_revision" ADD CONSTRAINT "booking_revision_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_room" ADD CONSTRAINT "booking_room_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_room" ADD CONSTRAINT "booking_room_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_room" ADD CONSTRAINT "booking_room_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_room" ADD CONSTRAINT "booking_room_rate_plan_id_rate_plan_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_room_day" ADD CONSTRAINT "booking_room_day_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_room_day" ADD CONSTRAINT "booking_room_day_booking_room_id_booking_room_id_fk" FOREIGN KEY ("booking_room_id") REFERENCES "public"."booking_room"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_room_day" ADD CONSTRAINT "booking_room_day_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest" ADD CONSTRAINT "guest_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest" ADD CONSTRAINT "guest_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_webhook" ADD CONSTRAINT "inbound_webhook_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_webhook" ADD CONSTRAINT "inbound_webhook_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD CONSTRAINT "payment_instrument_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD CONSTRAINT "payment_instrument_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_day_pending_idx" ON "availability_day" USING btree ("property_id","sync_state");--> statement-breakpoint
CREATE INDEX "rate_day_pending_idx" ON "rate_day" USING btree ("property_id","sync_state");--> statement-breakpoint
CREATE INDEX "rate_plan_property_idx" ON "rate_plan" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "rate_plan_room_type_idx" ON "rate_plan" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "room_type_property_idx" ON "room_type" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "sync_operation_property_idx" ON "sync_operation" USING btree ("property_id","created_at");--> statement-breakpoint
CREATE INDEX "booking_property_arrival_idx" ON "booking" USING btree ("property_id","arrival_date");--> statement-breakpoint
CREATE INDEX "booking_mapping_idx" ON "booking" USING btree ("org_id","mapping_state");--> statement-breakpoint
CREATE INDEX "booking_revision_booking_idx" ON "booking_revision" USING btree ("booking_id","inserted_at");--> statement-breakpoint
CREATE INDEX "booking_revision_unacked_idx" ON "booking_revision" USING btree ("org_id","acked_at");--> statement-breakpoint
CREATE INDEX "booking_room_booking_idx" ON "booking_room" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "booking_room_day_property_date_idx" ON "booking_room_day" USING btree ("property_id","date");--> statement-breakpoint
CREATE INDEX "guest_dedupe_idx" ON "guest" USING btree ("org_id","dedupe_hash");--> statement-breakpoint
CREATE INDEX "inbound_webhook_state_idx" ON "inbound_webhook" USING btree ("state","received_at");--> statement-breakpoint
ALTER TABLE "property" ADD CONSTRAINT "property_webhook_token_unique" UNIQUE("webhook_token");