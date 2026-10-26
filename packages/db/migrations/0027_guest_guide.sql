CREATE TABLE "property_guide" (
	"property_id" uuid NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"org_id" uuid NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_guide_property_id_locale_pk" PRIMARY KEY("property_id","locale")
);
--> statement-breakpoint
ALTER TABLE "property_guide" ADD CONSTRAINT "property_guide_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_guide" ADD CONSTRAINT "property_guide_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_guide" ADD CONSTRAINT "property_guide_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_guide" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "property_guide" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "property_guide" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "property_guide" TO pms_app;
--> statement-breakpoint
ALTER TABLE "property_guide" ADD CONSTRAINT property_guide_locale CHECK (locale ~ '^[a-z]{2}$');
--> statement-breakpoint
ALTER TABLE "property_guide" ADD CONSTRAINT property_guide_sections CHECK (jsonb_typeof(sections) = 'array');
