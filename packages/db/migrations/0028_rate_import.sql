CREATE TABLE "rate_import_settings" (
	"property_id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"provider" text DEFAULT 'csv' NOT NULL,
	"provider_ref" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"auto_apply" boolean DEFAULT false NOT NULL,
	"floor_minor" integer,
	"ceiling_minor" integer,
	"max_change_bps" integer,
	"hold_hours" integer DEFAULT 48 NOT NULL,
	"mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rate_import_settings" ADD CONSTRAINT "rate_import_settings_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_import_settings" ADD CONSTRAINT "rate_import_settings_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_import_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_import_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "rate_import_settings" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "rate_import_settings" TO pms_app;
--> statement-breakpoint
ALTER TABLE "rate_import_settings" ADD CONSTRAINT rate_import_rails CHECK (
  (floor_minor IS NULL OR floor_minor >= 0)
  AND (ceiling_minor IS NULL OR ceiling_minor >= 0)
  AND (floor_minor IS NULL OR ceiling_minor IS NULL OR floor_minor <= ceiling_minor)
  AND (max_change_bps IS NULL OR max_change_bps >= 0)
  AND hold_hours >= 0
);
--> statement-breakpoint
ALTER TABLE "rate_import_settings" ADD CONSTRAINT rate_import_mapping CHECK (jsonb_typeof(mapping) = 'object');
