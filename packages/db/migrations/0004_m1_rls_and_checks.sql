-- RLS for M1 tables (INV-10), INV-7 PAN check, append-only booking revisions.
ALTER TABLE "room_type" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "room_type" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "room_type" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "rate_plan" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_plan" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "rate_plan" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "availability_day" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "availability_day" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "availability_day" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "rate_day" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "rate_day" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "rate_day" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "sync_operation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sync_operation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "sync_operation" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "inbound_webhook" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "inbound_webhook" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "inbound_webhook" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "guest" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "guest" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "guest" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "booking" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "booking_revision" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_revision" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking_revision" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "booking_room" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_room" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking_room" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "booking_room_day" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_room_day" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking_room_day" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "payment_instrument" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_instrument" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payment_instrument" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pms_app;
--> statement-breakpoint
-- INV-7: no PAN-shaped value may be stored; masked numbers must contain a masking character.
ALTER TABLE "payment_instrument" ADD CONSTRAINT payment_instrument_no_pan CHECK (masked_number IS NULL OR (masked_number !~ '^[0-9 -]{13,19}$' AND masked_number ~ '[*xX]'));
--> statement-breakpoint
-- Booking revisions are append-only: raw_payload and system_id never change (BK-4).
CREATE OR REPLACE FUNCTION booking_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.raw_payload IS DISTINCT FROM OLD.raw_payload OR NEW.system_id IS DISTINCT FROM OLD.system_id OR NEW.channex_revision_id IS DISTINCT FROM OLD.channex_revision_id THEN
    RAISE EXCEPTION 'booking_revision is append-only';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER booking_revision_immutable BEFORE UPDATE ON "booking_revision" FOR EACH ROW EXECUTE FUNCTION booking_revision_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
--> statement-breakpoint
CREATE TRIGGER booking_revision_no_delete BEFORE DELETE ON "booking_revision" FOR EACH ROW EXECUTE FUNCTION forbid_delete();
