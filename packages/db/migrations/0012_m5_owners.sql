CREATE TABLE "owner" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"type" text DEFAULT 'individual' NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tax_id_enc" text,
	"payout_details_ref" text,
	"payout_details_masked" text,
	"user_id" uuid,
	"group_id" uuid,
	"locale" text DEFAULT 'en' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "owner_agreement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"agreement_key" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"owner_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_ids" jsonb,
	"model" jsonb NOT NULL,
	"commission_basis" text NOT NULL,
	"deductibles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cleaning_fees" jsonb NOT NULL,
	"owner_stays" jsonb NOT NULL,
	"owner_stay_allowance_nights" integer,
	"payout" jsonb NOT NULL,
	"vat" jsonb NOT NULL,
	"currency" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"document_ref" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"storage_ref" text NOT NULL,
	"expires_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_expense" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"unit_id" uuid,
	"date" date NOT NULL,
	"category" text NOT NULL,
	"vendor" text,
	"description" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"receipt_ref" text,
	"rebillable" boolean DEFAULT true NOT NULL,
	"rebill_reason" text,
	"state" text DEFAULT 'submitted' NOT NULL,
	"submitted_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"reject_reason" text,
	"statement_id" uuid,
	"maintenance_issue_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_payout" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"provider_ref" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"initiated_by" uuid,
	"approved_by" uuid,
	"reference" text,
	"failure_reason" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_statement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"agreement_key" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"dispute_state" text DEFAULT 'none' NOT NULL,
	"dispute_thread_id" uuid,
	"currency" text NOT NULL,
	"totals" jsonb NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"anomalies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"pdf_ref" text,
	"previous_statement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_statement_line" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"agreement_version" integer NOT NULL,
	"booking_id" uuid,
	"expense_id" uuid,
	"block_id" uuid,
	"adjustment_id" text,
	"basis" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_statement_night" (
	"org_id" uuid NOT NULL,
	"statement_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"room_key" text NOT NULL,
	"date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "owner_statement_night_statement_id_room_key_date_pk" PRIMARY KEY("statement_id","room_key","date")
);
--> statement-breakpoint
ALTER TABLE "owner" ADD CONSTRAINT "owner_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner" ADD CONSTRAINT "owner_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner" ADD CONSTRAINT "owner_group_id_property_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."property_group"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_agreement" ADD CONSTRAINT "owner_agreement_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_agreement" ADD CONSTRAINT "owner_agreement_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_agreement" ADD CONSTRAINT "owner_agreement_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_document" ADD CONSTRAINT "owner_document_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_document" ADD CONSTRAINT "owner_document_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_expense" ADD CONSTRAINT "owner_expense_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_expense" ADD CONSTRAINT "owner_expense_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_expense" ADD CONSTRAINT "owner_expense_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payout" ADD CONSTRAINT "owner_payout_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payout" ADD CONSTRAINT "owner_payout_statement_id_owner_statement_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."owner_statement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_payout" ADD CONSTRAINT "owner_payout_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statement" ADD CONSTRAINT "owner_statement_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statement" ADD CONSTRAINT "owner_statement_owner_id_owner_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owner"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statement" ADD CONSTRAINT "owner_statement_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statement_line" ADD CONSTRAINT "owner_statement_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statement_line" ADD CONSTRAINT "owner_statement_line_statement_id_owner_statement_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."owner_statement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statement_line" ADD CONSTRAINT "owner_statement_line_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statement_night" ADD CONSTRAINT "owner_statement_night_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statement_night" ADD CONSTRAINT "owner_statement_night_statement_id_owner_statement_id_fk" FOREIGN KEY ("statement_id") REFERENCES "public"."owner_statement"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_statement_night" ADD CONSTRAINT "owner_statement_night_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "owner_org_idx" ON "owner" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_agreement_version_idx" ON "owner_agreement" USING btree ("agreement_key","version");--> statement-breakpoint
CREATE INDEX "owner_agreement_property_idx" ON "owner_agreement" USING btree ("property_id","effective_from");--> statement-breakpoint
CREATE INDEX "owner_agreement_owner_idx" ON "owner_agreement" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "owner_document_owner_idx" ON "owner_document" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "owner_expense_property_date_idx" ON "owner_expense" USING btree ("property_id","date");--> statement-breakpoint
CREATE INDEX "owner_expense_state_idx" ON "owner_expense" USING btree ("org_id","state");--> statement-breakpoint
CREATE INDEX "owner_payout_statement_idx" ON "owner_payout" USING btree ("statement_id");--> statement-breakpoint
CREATE INDEX "owner_statement_owner_idx" ON "owner_statement" USING btree ("owner_id","period_from");--> statement-breakpoint
CREATE INDEX "owner_statement_state_idx" ON "owner_statement" USING btree ("org_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_statement_period_idx" ON "owner_statement" USING btree ("agreement_key","period_from") WHERE state <> 'void';--> statement-breakpoint
CREATE UNIQUE INDEX "owner_statement_line_seq_idx" ON "owner_statement_line" USING btree ("statement_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_statement_night_once_idx" ON "owner_statement_night" USING btree ("room_key","date");