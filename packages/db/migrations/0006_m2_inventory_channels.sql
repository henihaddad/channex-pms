CREATE TABLE "availability_rule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"date_from" date,
	"date_to" date,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"input" jsonb NOT NULL,
	"cell_count" integer NOT NULL,
	"inverse" jsonb NOT NULL,
	"state" text DEFAULT 'applied' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "photo" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid,
	"storage_key" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text DEFAULT 'photo' NOT NULL,
	"channex_photo_id" text
);
--> statement-breakpoint
CREATE TABLE "policy" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"title" text NOT NULL,
	"cancellation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deposit" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"check_in_time" text DEFAULT '15:00' NOT NULL,
	"check_out_time" text DEFAULT '11:00' NOT NULL,
	"channex_policy_id" text
);
--> statement-breakpoint
CREATE TABLE "property_provisioning" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"step" text DEFAULT 'group' NOT NULL,
	"refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid,
	"name" text NOT NULL,
	"date_ranges" jsonb NOT NULL,
	"colour" text DEFAULT '#94a3b8' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_set" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"title" text NOT NULL,
	"taxes" jsonb NOT NULL,
	"channex_tax_set_id" text
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"floor" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"access" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'clean' NOT NULL,
	"is_system_managed" boolean DEFAULT false NOT NULL,
	"owner_agreement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"adapter_code" text NOT NULL,
	"label" text NOT NULL,
	"credentials_enc" text,
	"oauth_tokens_enc" text,
	"oauth_expires_at" timestamp with time zone,
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_connection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"channel_account_id" uuid,
	"adapter_code" text NOT NULL,
	"channex_channel_id" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings_enc" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"readiness" jsonb DEFAULT '{"ready":false,"issues":[]}'::jsonb NOT NULL,
	"last_error" text,
	"last_push_at" timestamp with time zone,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_event" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"connection_id" uuid,
	"property_id" uuid NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"message" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel_mapping" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"rate_plan_id" uuid NOT NULL,
	"ota_room_code" text NOT NULL,
	"ota_rate_code" text NOT NULL,
	"occupancy" text,
	"rate_type" text,
	"derived_option" jsonb,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_rule" ADD CONSTRAINT "availability_rule_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rule" ADD CONSTRAINT "availability_rule_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_rule" ADD CONSTRAINT "availability_rule_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_operation" ADD CONSTRAINT "bulk_operation_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_operation" ADD CONSTRAINT "bulk_operation_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo" ADD CONSTRAINT "photo_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy" ADD CONSTRAINT "policy_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_provisioning" ADD CONSTRAINT "property_provisioning_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_provisioning" ADD CONSTRAINT "property_provisioning_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_template" ADD CONSTRAINT "property_template_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_set" ADD CONSTRAINT "tax_set_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_set" ADD CONSTRAINT "tax_set_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit" ADD CONSTRAINT "unit_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_account" ADD CONSTRAINT "channel_account_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connection" ADD CONSTRAINT "channel_connection_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connection" ADD CONSTRAINT "channel_connection_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_connection" ADD CONSTRAINT "channel_connection_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_event" ADD CONSTRAINT "channel_event_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_event" ADD CONSTRAINT "channel_event_connection_id_channel_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_event" ADD CONSTRAINT "channel_event_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_mapping" ADD CONSTRAINT "channel_mapping_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_mapping" ADD CONSTRAINT "channel_mapping_connection_id_channel_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."channel_connection"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_mapping" ADD CONSTRAINT "channel_mapping_rate_plan_id_rate_plan_id_fk" FOREIGN KEY ("rate_plan_id") REFERENCES "public"."rate_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bulk_operation_property_idx" ON "bulk_operation" USING btree ("property_id","created_at");--> statement-breakpoint
CREATE INDEX "unit_property_idx" ON "unit" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "unit_room_type_idx" ON "unit" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "channel_connection_property_idx" ON "channel_connection" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "channel_event_property_idx" ON "channel_event" USING btree ("property_id","occurred_at");--> statement-breakpoint
CREATE INDEX "channel_mapping_connection_idx" ON "channel_mapping" USING btree ("connection_id");