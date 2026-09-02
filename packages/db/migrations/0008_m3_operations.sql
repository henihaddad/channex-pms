CREATE TABLE "access_credential" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"unit_id" uuid,
	"type" text NOT NULL,
	"value_enc" text NOT NULL,
	"value_masked" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_to" timestamp with time zone NOT NULL,
	"provider_ref" text,
	"delivery_state" text DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" text,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text
);
--> statement-breakpoint
CREATE TABLE "booking_acknowledgement" (
	"org_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"revision_id" text NOT NULL,
	"acknowledged_by" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_acknowledgement_booking_id_revision_id_pk" PRIMARY KEY("booking_id","revision_id")
);
--> statement-breakpoint
CREATE TABLE "checklist" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"task_type" text DEFAULT 'changeover' NOT NULL,
	"items" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crew" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"service_area" text,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"lat" text,
	"lng" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "crew_member" (
	"org_id" uuid NOT NULL,
	"crew_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'cleaner' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crew_member_crew_id_user_id_pk" PRIMARY KEY("crew_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "daily_close" (
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"posted_lines" integer DEFAULT 0 NOT NULL,
	"flagged_folios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"runs" integer DEFAULT 1 NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_close_property_id_business_date_pk" PRIMARY KEY("property_id","business_date")
);
--> statement-breakpoint
CREATE TABLE "folio" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"booking_id" uuid,
	"label" text DEFAULT 'Main' NOT NULL,
	"currency" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "folio_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"folio_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"posting_key" text,
	"invoice_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"folio_id" uuid NOT NULL,
	"number" text NOT NULL,
	"kind" text DEFAULT 'invoice' NOT NULL,
	"currency" text NOT NULL,
	"total_minor" bigint NOT NULL,
	"fx_rate" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" text,
	"credits_invoice_id" uuid,
	"pdf_ref" text
);
--> statement-breakpoint
CREATE TABLE "invoice_sequence" (
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"prefix" text NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_sequence_property_id_year_pk" PRIMARY KEY("property_id","year")
);
--> statement-breakpoint
CREATE TABLE "maintenance_issue" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_id" uuid,
	"task_id" uuid,
	"reported_by" uuid,
	"reported_via" text DEFAULT 'staff' NOT NULL,
	"severity" text DEFAULT 'normal' NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"description" text NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"blocks_availability" boolean DEFAULT false NOT NULL,
	"assignee_id" uuid,
	"vendor" text,
	"cost_minor" bigint,
	"rebill_to_owner" boolean DEFAULT false NOT NULL,
	"owner_expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'staff' NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"folio_id" uuid NOT NULL,
	"method" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"state" text DEFAULT 'captured' NOT NULL,
	"reason" text,
	"provider_ref" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "saved_view" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"surface" text DEFAULT 'reservations' NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stay_state" (
	"org_id" uuid NOT NULL,
	"booking_room_id" uuid PRIMARY KEY NOT NULL,
	"booking_id" uuid NOT NULL,
	"state" text DEFAULT 'expected' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_out_at" timestamp with time zone,
	"no_show_reason" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turnover_task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"window_from" text NOT NULL,
	"window_to" text NOT NULL,
	"is_same_day" boolean DEFAULT false NOT NULL,
	"departing_booking_id" uuid,
	"arriving_booking_id" uuid,
	"state" text DEFAULT 'planned' NOT NULL,
	"assignee_id" uuid,
	"crew_id" uuid,
	"sequence" integer,
	"travel_minutes_estimate" integer,
	"checklist_id" uuid,
	"progress" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"duration_actual_minutes" integer,
	"escalated_level" text,
	"last_change" text,
	"accepted_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"inspected_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_block" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"room_type_id" uuid NOT NULL,
	"unit_id" uuid,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"reason" text NOT NULL,
	"reduces_availability" boolean DEFAULT true NOT NULL,
	"note" text,
	"owner_id" uuid,
	"maintenance_issue_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD COLUMN "vcc_balance_minor" bigint;--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD COLUMN "vcc_effective_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_instrument" ADD COLUMN "vcc_effective_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "access_credential" ADD CONSTRAINT "access_credential_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_credential" ADD CONSTRAINT "access_credential_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_credential" ADD CONSTRAINT "access_credential_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_credential" ADD CONSTRAINT "access_credential_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_acknowledgement" ADD CONSTRAINT "booking_acknowledgement_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_acknowledgement" ADD CONSTRAINT "booking_acknowledgement_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist" ADD CONSTRAINT "checklist_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew" ADD CONSTRAINT "crew_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_member" ADD CONSTRAINT "crew_member_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_member" ADD CONSTRAINT "crew_member_crew_id_crew_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."crew"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_member" ADD CONSTRAINT "crew_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_close" ADD CONSTRAINT "daily_close_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_close" ADD CONSTRAINT "daily_close_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio" ADD CONSTRAINT "folio_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio" ADD CONSTRAINT "folio_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio" ADD CONSTRAINT "folio_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_line" ADD CONSTRAINT "folio_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folio_line" ADD CONSTRAINT "folio_line_folio_id_folio_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_folio_id_folio_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequence" ADD CONSTRAINT "invoice_sequence_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_sequence" ADD CONSTRAINT "invoice_sequence_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_issue" ADD CONSTRAINT "maintenance_issue_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_issue" ADD CONSTRAINT "maintenance_issue_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_issue" ADD CONSTRAINT "maintenance_issue_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_folio_id_folio_id_fk" FOREIGN KEY ("folio_id") REFERENCES "public"."folio"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_view" ADD CONSTRAINT "saved_view_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_state" ADD CONSTRAINT "stay_state_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stay_state" ADD CONSTRAINT "stay_state_booking_room_id_booking_room_id_fk" FOREIGN KEY ("booking_room_id") REFERENCES "public"."booking_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnover_task" ADD CONSTRAINT "turnover_task_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnover_task" ADD CONSTRAINT "turnover_task_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turnover_task" ADD CONSTRAINT "turnover_task_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_block" ADD CONSTRAINT "unit_block_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_block" ADD CONSTRAINT "unit_block_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_block" ADD CONSTRAINT "unit_block_room_type_id_room_type_id_fk" FOREIGN KEY ("room_type_id") REFERENCES "public"."room_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_block" ADD CONSTRAINT "unit_block_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_credential_booking_idx" ON "access_credential" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "folio_booking_idx" ON "folio" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "folio_line_folio_idx" ON "folio_line" USING btree ("folio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "folio_line_posting_key_idx" ON "folio_line" USING btree ("posting_key");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_number_idx" ON "invoice" USING btree ("property_id","number");--> statement-breakpoint
CREATE INDEX "maintenance_issue_property_idx" ON "maintenance_issue" USING btree ("property_id","state");--> statement-breakpoint
CREATE INDEX "note_subject_idx" ON "note" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "payment_folio_idx" ON "payment" USING btree ("folio_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turnover_task_key_idx" ON "turnover_task" USING btree ("unit_id","date","type");--> statement-breakpoint
CREATE INDEX "turnover_task_property_date_idx" ON "turnover_task" USING btree ("property_id","date");--> statement-breakpoint
CREATE INDEX "turnover_task_assignee_idx" ON "turnover_task" USING btree ("assignee_id","date");--> statement-breakpoint
CREATE INDEX "unit_block_property_dates_idx" ON "unit_block" USING btree ("property_id","date_from","date_to");