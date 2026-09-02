-- RLS for M7 tables (INV-10); holds are well-formed; guest sessions are short-lived.
--> statement-breakpoint
ALTER TABLE "booking_engine_settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_engine_settings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking_engine_settings" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "booking_hold" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_hold" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking_hold" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "promo_code" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "promo_code" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "promo_code" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "extra" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "extra" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "extra" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "guest_session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "guest_session" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "guest_session" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "pre_checkin" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pre_checkin" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "pre_checkin" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pms_app;
--> statement-breakpoint
ALTER TABLE "booking_hold" ADD CONSTRAINT booking_hold_dates CHECK (arrival_date < departure_date AND rooms > 0 AND state IN ('held', 'converted', 'expired', 'released'));
--> statement-breakpoint
ALTER TABLE "promo_code" ADD CONSTRAINT promo_code_shape CHECK (kind IN ('percent', 'amount') AND value >= 0 AND (kind <> 'percent' OR value <= 100));
--> statement-breakpoint
ALTER TABLE "extra" ADD CONSTRAINT extra_per CHECK (per IN ('stay', 'night', 'person') AND price_minor >= 0);
