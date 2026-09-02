-- RLS for M6 tables (INV-10); a read-only reporting schema for BI tools (spec 11 §11.5).
--> statement-breakpoint
ALTER TABLE "fact_room_night" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fact_room_night" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fact_room_night" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "fact_booking" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fact_booking" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "fact_booking" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "agg_daily_kpi" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "agg_daily_kpi" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "agg_daily_kpi" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "budget" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "budget" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "budget" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "alert" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "alert" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "alert" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "report_schedule" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "report_schedule" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "report_schedule" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pms_app;
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS reporting;
--> statement-breakpoint
CREATE OR REPLACE VIEW reporting.daily_kpi AS
  SELECT k.org_id, k.property_id, p.title AS property, k.date, k.rooms_available, k.rooms_sold,
         CASE WHEN k.rooms_available > 0 THEN round(k.rooms_sold::numeric * 10000 / k.rooms_available) ELSE NULL END AS occupancy_bps,
         k.room_revenue_minor, k.total_revenue_minor, k.commission_minor, k.withheld_tax_minor,
         k.bookings_created, k.cancellations, k.arrivals, k.no_shows, k.direct_nights, k.currency, k.computed_at
  FROM agg_daily_kpi k JOIN property p ON p.id = k.property_id;
--> statement-breakpoint
CREATE OR REPLACE VIEW reporting.room_night AS
  SELECT org_id, property_id, booking_id, date, room_type_id, channel, status, room_revenue_minor, commission_minor, commission_estimated, withheld_tax_minor, lead_days, is_direct, currency
  FROM fact_room_night;
--> statement-breakpoint
CREATE OR REPLACE VIEW reporting.booking AS
  SELECT org_id, property_id, booking_id, channel, booked_date, arrival_date, departure_date, nights, status, total_minor, room_revenue_minor, commission_minor, lead_days, cancelled_date, currency
  FROM fact_booking;
--> statement-breakpoint
GRANT USAGE ON SCHEMA reporting TO pms_app;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA reporting TO pms_app;
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT alert_state CHECK (state IN ('open', 'acknowledged', 'actioned', 'resolved') AND severity IN ('info', 'warning', 'critical'));
--> statement-breakpoint
ALTER TABLE "report_schedule" ADD CONSTRAINT report_schedule_cadence CHECK (cadence IN ('daily', 'weekly', 'monthly') AND format IN ('csv', 'pdf'));
