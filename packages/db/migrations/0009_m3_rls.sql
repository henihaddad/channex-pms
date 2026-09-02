-- RLS for M3 tables (INV-10); INV-7 on access credentials; invoiced lines immutable; blocks well-formed.
--> statement-breakpoint
ALTER TABLE "unit_block" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "unit_block" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "unit_block" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "crew" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "crew" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "crew" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "crew_member" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "crew_member" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "crew_member" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "checklist" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "checklist" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "checklist" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "turnover_task" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "turnover_task" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "turnover_task" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "maintenance_issue" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "maintenance_issue" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "maintenance_issue" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "access_credential" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "access_credential" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "access_credential" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "note" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "note" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "note" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "folio" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "folio" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "folio" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "folio_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "folio_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "folio_line" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "payment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payment" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "invoice_sequence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice_sequence" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invoice_sequence" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "invoice" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "daily_close" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "daily_close" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "daily_close" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "saved_view" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "saved_view" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "saved_view" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "booking_acknowledgement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "booking_acknowledgement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking_acknowledgement" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "stay_state" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stay_state" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "stay_state" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pms_app;
--> statement-breakpoint
-- INV-7: no PAN-shaped value may be stored on a credential row (the sealed value is opaque; the mask and provider ref are checked).
ALTER TABLE "access_credential" ADD CONSTRAINT access_credential_no_pan CHECK (value_masked !~ '[0-9]{13,19}' AND coalesce(provider_ref, '') !~ '[0-9]{13,19}');
--> statement-breakpoint
ALTER TABLE "unit_block" ADD CONSTRAINT unit_block_dates CHECK (date_from < date_to);
--> statement-breakpoint
-- An invoiced folio line is part of a legal document: never updated or deleted, corrected by a credit note.
CREATE OR REPLACE FUNCTION folio_line_invoiced_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.invoice_id IS NOT NULL THEN RAISE EXCEPTION 'folio line is invoiced; issue a credit note instead'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER folio_line_invoiced_guard BEFORE UPDATE OR DELETE ON "folio_line" FOR EACH ROW EXECUTE FUNCTION folio_line_invoiced_guard();
