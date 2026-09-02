CREATE TABLE "attachment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"storage_ref" text NOT NULL,
	"provider_ref" text,
	"scan_state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_rule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"trigger" text NOT NULL,
	"offset_days" integer,
	"at_local_time" text,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"template_id" uuid NOT NULL,
	"quiet_from" text,
	"quiet_to" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"rule_version" integer NOT NULL,
	"property_id" uuid NOT NULL,
	"booking_id" uuid,
	"thread_id" uuid,
	"dedupe_key" text NOT NULL,
	"state" text NOT NULL,
	"reason" text,
	"scheduled_for" timestamp with time zone,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"message_id" uuid
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"direction" text,
	"author_type" text NOT NULL,
	"author_id" uuid,
	"body_enc" text NOT NULL,
	"provider_message_id" text,
	"delivery_state" text,
	"delivery_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"template_id" uuid,
	"automation_rule_id" uuid,
	"automation_rule_version" integer,
	"automation_rule_name" text,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_template" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"channel_scope" jsonb,
	"body" text NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_thread" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"provider_thread_id" text NOT NULL,
	"provider" text NOT NULL,
	"booking_id" uuid,
	"guest_id" uuid,
	"kind" text DEFAULT 'booking' NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"state_reason" text,
	"guest_name_enc" text,
	"guest_language" text,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"first_response_due_at" timestamp with time zone,
	"first_response_at" timestamp with time zone,
	"assignee_id" uuid,
	"snoozed_until" timestamp with time zone,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"automation_handover" boolean DEFAULT false NOT NULL,
	"provider_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"provider_review_id" text NOT NULL,
	"booking_id" uuid,
	"ota" text NOT NULL,
	"rating" integer NOT NULL,
	"body" text NOT NULL,
	"guest_name_enc" text,
	"inserted_at" timestamp with time zone NOT NULL,
	"can_respond" boolean DEFAULT true NOT NULL,
	"response_state" text DEFAULT 'pending' NOT NULL,
	"response_due_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_response" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid,
	"delivery_state" text DEFAULT 'queued' NOT NULL,
	"delivery_error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_thread_id_message_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_thread"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_rule" ADD CONSTRAINT "automation_rule_template_id_message_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_rule_id_automation_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_thread_id_message_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_thread"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_thread_id_message_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_thread"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_template" ADD CONSTRAINT "message_template_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_guest_id_guest_id_fk" FOREIGN KEY ("guest_id") REFERENCES "public"."guest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT "message_thread_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT "review_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_response" ADD CONSTRAINT "review_response_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_response" ADD CONSTRAINT "review_response_review_id_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."review"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_thread_idx" ON "attachment" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "automation_rule_org_idx" ON "automation_rule" USING btree ("org_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_run_dedupe_idx" ON "automation_run" USING btree ("org_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "automation_run_booking_idx" ON "automation_run" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_provider_idx" ON "message" USING btree ("thread_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "message_thread_time_idx" ON "message" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE INDEX "message_delivery_idx" ON "message" USING btree ("org_id","delivery_state");--> statement-breakpoint
CREATE UNIQUE INDEX "message_template_name_idx" ON "message_template" USING btree ("org_id","name","locale");--> statement-breakpoint
CREATE UNIQUE INDEX "message_thread_provider_idx" ON "message_thread" USING btree ("property_id","provider_thread_id");--> statement-breakpoint
CREATE INDEX "message_thread_inbox_idx" ON "message_thread" USING btree ("org_id","state","last_inbound_at");--> statement-breakpoint
CREATE INDEX "message_thread_booking_idx" ON "message_thread" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_provider_idx" ON "review" USING btree ("property_id","provider_review_id");--> statement-breakpoint
CREATE INDEX "review_org_idx" ON "review" USING btree ("org_id","response_state","inserted_at");--> statement-breakpoint
CREATE INDEX "review_response_review_idx" ON "review_response" USING btree ("review_id");