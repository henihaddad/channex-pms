-- RLS for M2 tables (INV-10); INV-8 and INV-11 as triggers.
ALTER TABLE "unit" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "unit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "unit" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "property_template" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "property_template" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "property_template" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "property_provisioning" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "property_provisioning" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "property_provisioning" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "season" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "season" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "season" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "policy" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "policy" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "policy" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "tax_set" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tax_set" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tax_set" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "photo" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "photo" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "photo" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "availability_rule" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "availability_rule" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "availability_rule" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "bulk_operation" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bulk_operation" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "bulk_operation" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "channel_account" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channel_account" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "channel_account" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "channel_connection" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channel_connection" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "channel_connection" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "channel_mapping" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channel_mapping" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "channel_mapping" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "channel_event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "channel_event" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "channel_event" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pms_app;
--> statement-breakpoint
-- INV-8: a mapping may not reference a rate plan of another property than its connection.
CREATE OR REPLACE FUNCTION channel_mapping_same_property() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE conn_property uuid; plan_property uuid;
BEGIN
  SELECT property_id INTO conn_property FROM channel_connection WHERE id = NEW.connection_id;
  SELECT property_id INTO plan_property FROM rate_plan WHERE id = NEW.rate_plan_id;
  IF conn_property IS DISTINCT FROM plan_property THEN RAISE EXCEPTION 'channel_mapping crosses properties (INV-8)'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER channel_mapping_same_property BEFORE INSERT OR UPDATE ON "channel_mapping" FOR EACH ROW EXECUTE FUNCTION channel_mapping_same_property();
--> statement-breakpoint
-- INV-9: a room type or rate plan referenced by an active mapping cannot be archived.
CREATE OR REPLACE FUNCTION rate_plan_archive_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL AND EXISTS (SELECT 1 FROM channel_mapping m JOIN channel_connection c ON c.id = m.connection_id WHERE m.rate_plan_id = NEW.id AND m.status = 'active' AND c.is_active) THEN
    RAISE EXCEPTION 'rate plan is mapped on an active channel; unmap first (INV-9)';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER rate_plan_archive_guard BEFORE UPDATE ON "rate_plan" FOR EACH ROW EXECUTE FUNCTION rate_plan_archive_guard();
--> statement-breakpoint
-- INV-11: a single_unit property has exactly one room type with count_of_rooms = 1.
CREATE OR REPLACE FUNCTION single_unit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; n int;
BEGIN
  SELECT p.kind INTO kind FROM property p WHERE p.id = NEW.property_id;
  IF kind = 'single_unit' THEN
    SELECT count(*) INTO n FROM room_type WHERE property_id = NEW.property_id AND archived_at IS NULL AND id <> NEW.id;
    IF n > 0 OR NEW.count_of_rooms <> 1 THEN RAISE EXCEPTION 'single_unit property has exactly one room type with one room (INV-11)'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER single_unit_guard BEFORE INSERT OR UPDATE ON "room_type" FOR EACH ROW EXECUTE FUNCTION single_unit_guard();
