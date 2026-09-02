CREATE TABLE "announcement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"org_id" uuid,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoice" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"currency" text NOT NULL,
	"draft" jsonb NOT NULL,
	"subtotal_minor" integer NOT NULL,
	"vat_minor" integer NOT NULL,
	"total_minor" integer NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"provider_ref" text,
	"pdf_url" text,
	"failure_reason" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_export" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"requested_by" uuid,
	"state" text DEFAULT 'requested' NOT NULL,
	"bundle" text,
	"bytes" integer,
	"counts" jsonb,
	"ready_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flag" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"org_id" uuid,
	"enabled" boolean DEFAULT false NOT NULL,
	"rollout_percent" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impersonation_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"state" text DEFAULT 'requested' NOT NULL,
	"write_approved" boolean DEFAULT false NOT NULL,
	"break_glass" boolean DEFAULT false NOT NULL,
	"second_operator_id" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"transcript" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"operator_id" uuid NOT NULL,
	"org_id" uuid,
	"action" text NOT NULL,
	"subject" jsonb NOT NULL,
	"detail" jsonb,
	"request_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"currency" text NOT NULL,
	"tiers" jsonb NOT NULL,
	"add_ons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"annual_discount_bps" integer DEFAULT 0 NOT NULL,
	"quotas" jsonb NOT NULL,
	"trial_days" integer DEFAULT 14 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "platform_job_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"org_id" uuid,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by" uuid,
	"state" text DEFAULT 'requested' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_operator" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"manifest" jsonb NOT NULL,
	"endpoint_url" text NOT NULL,
	"secret_enc" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"cursor_at" timestamp with time zone,
	"cursor_id" uuid,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"breaker_open_until" timestamp with time zone,
	"installed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plugin_delivery" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"plugin_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_status" integer,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"annual" boolean DEFAULT false NOT NULL,
	"add_ons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"customer_ref" text,
	"payment_method" jsonb,
	"billing_email" text,
	"billing_name" text,
	"vat_id" text,
	"country" text NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"trial_ends_on" date,
	"payment_failed_on" date,
	"dunning_retries" integer DEFAULT 0 NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_access_grant" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"granted_by" uuid NOT NULL,
	"write_allowed" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_record" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"date" date NOT NULL,
	"active_units" integer NOT NULL,
	"properties" integer NOT NULL,
	"rooms" integer DEFAULT 0 NOT NULL,
	"users" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_invoice" ADD CONSTRAINT "billing_invoice_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_export" ADD CONSTRAINT "data_export_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_session" ADD CONSTRAINT "impersonation_session_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_operator" ADD CONSTRAINT "platform_operator_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin" ADD CONSTRAINT "plugin_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_delivery" ADD CONSTRAINT "plugin_delivery_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_delivery" ADD CONSTRAINT "plugin_delivery_plugin_id_plugin_id_fk" FOREIGN KEY ("plugin_id") REFERENCES "public"."plugin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_access_grant" ADD CONSTRAINT "support_access_grant_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoice_org_period_idx" ON "billing_invoice" USING btree ("org_id","period_from");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flag_key_org_idx" ON "feature_flag" USING btree ("key","org_id");--> statement-breakpoint
CREATE INDEX "impersonation_org_idx" ON "impersonation_session" USING btree ("org_id","state");--> statement-breakpoint
CREATE INDEX "operator_audit_org_idx" ON "operator_audit_log" USING btree ("org_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_org_key_idx" ON "plugin" USING btree ("org_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_delivery_event_idx" ON "plugin_delivery" USING btree ("plugin_id","event_id");--> statement-breakpoint
CREATE INDEX "plugin_delivery_due_idx" ON "plugin_delivery" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_record_org_date_idx" ON "usage_record" USING btree ("org_id","date");