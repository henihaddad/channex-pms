CREATE TABLE "booking_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"provider_event_id" text NOT NULL,
	"kind" text NOT NULL,
	"provider" text DEFAULT 'airbnb' NOT NULL,
	"thread_id" uuid,
	"booking_id" uuid,
	"state" text DEFAULT 'open' NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolution" jsonb,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"respond_by" timestamp with time zone,
	"provider_inserted_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_request" ADD CONSTRAINT "booking_request_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_request" ADD CONSTRAINT "booking_request_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_request" ADD CONSTRAINT "booking_request_thread_id_message_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_thread"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_request" ADD CONSTRAINT "booking_request_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_request" ADD CONSTRAINT "booking_request_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_request_provider_idx" ON "booking_request" USING btree ("property_id","provider_event_id");--> statement-breakpoint
CREATE INDEX "booking_request_org_idx" ON "booking_request" USING btree ("org_id","state","respond_by");--> statement-breakpoint
ALTER TABLE "booking_request" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_request" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking_request" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
