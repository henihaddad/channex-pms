CREATE TABLE "agg_daily_kpi" (
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"date" date NOT NULL,
	"rooms_available" integer NOT NULL,
	"rooms_sold" integer NOT NULL,
	"room_revenue_minor" bigint NOT NULL,
	"total_revenue_minor" bigint NOT NULL,
	"commission_minor" bigint NOT NULL,
	"withheld_tax_minor" bigint NOT NULL,
	"bookings_created" integer NOT NULL,
	"cancellations" integer NOT NULL,
	"arrivals" integer NOT NULL,
	"no_shows" integer NOT NULL,
	"direct_nights" integer NOT NULL,
	"currency" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agg_daily_kpi_property_id_date_pk" PRIMARY KEY("property_id","date")
);
--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid,
	"type" text NOT NULL,
	"key" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"link" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"raised_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "budget" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"month" date NOT NULL,
	"room_revenue_minor" bigint NOT NULL,
	"occupancy_bps" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_booking" (
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"booking_id" uuid PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"booked_date" date NOT NULL,
	"arrival_date" date NOT NULL,
	"departure_date" date NOT NULL,
	"nights" integer NOT NULL,
	"status" text NOT NULL,
	"total_minor" bigint NOT NULL,
	"room_revenue_minor" bigint NOT NULL,
	"commission_minor" bigint DEFAULT 0 NOT NULL,
	"lead_days" integer NOT NULL,
	"cancelled_date" date,
	"currency" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_room_night" (
	"org_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"date" date NOT NULL,
	"room_type_id" uuid,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"room_revenue_minor" bigint NOT NULL,
	"commission_minor" bigint DEFAULT 0 NOT NULL,
	"commission_estimated" boolean DEFAULT false NOT NULL,
	"withheld_tax_minor" bigint DEFAULT 0 NOT NULL,
	"lead_days" integer,
	"is_direct" boolean DEFAULT false NOT NULL,
	"currency" text NOT NULL,
	CONSTRAINT "fact_room_night_booking_id_date_pk" PRIMARY KEY("booking_id","date")
);
--> statement-breakpoint
CREATE TABLE "report_schedule" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"report_key" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"recipients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cadence" text NOT NULL,
	"format" text DEFAULT 'csv' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agg_daily_kpi" ADD CONSTRAINT "agg_daily_kpi_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agg_daily_kpi" ADD CONSTRAINT "agg_daily_kpi_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_booking" ADD CONSTRAINT "fact_booking_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_booking" ADD CONSTRAINT "fact_booking_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_booking" ADD CONSTRAINT "fact_booking_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_room_night" ADD CONSTRAINT "fact_room_night_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_room_night" ADD CONSTRAINT "fact_room_night_property_id_property_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."property"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_room_night" ADD CONSTRAINT "fact_room_night_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedule" ADD CONSTRAINT "report_schedule_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agg_daily_kpi_org_date_idx" ON "agg_daily_kpi" USING btree ("org_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "alert_open_idx" ON "alert" USING btree ("org_id","type","key","raised_on");--> statement-breakpoint
CREATE INDEX "alert_state_idx" ON "alert" USING btree ("org_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_property_month_idx" ON "budget" USING btree ("property_id","month");--> statement-breakpoint
CREATE INDEX "fact_booking_property_booked_idx" ON "fact_booking" USING btree ("property_id","booked_date");--> statement-breakpoint
CREATE INDEX "fact_booking_property_arrival_idx" ON "fact_booking" USING btree ("property_id","arrival_date");--> statement-breakpoint
CREATE INDEX "fact_room_night_property_date_idx" ON "fact_room_night" USING btree ("property_id","date");--> statement-breakpoint
CREATE INDEX "fact_room_night_org_date_idx" ON "fact_room_night" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "report_schedule_org_idx" ON "report_schedule" USING btree ("org_id","enabled");