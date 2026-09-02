-- RLS for M5 tables (INV-10); INV-12 no overlapping agreements; INV-13 a sent statement is immutable.
--> statement-breakpoint
ALTER TABLE "owner" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "owner" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "owner" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "owner_document" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "owner_document" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "owner_document" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "owner_agreement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "owner_agreement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "owner_agreement" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "owner_expense" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "owner_expense" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "owner_expense" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "owner_statement" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "owner_statement" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "owner_statement" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "owner_statement_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "owner_statement_line" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "owner_statement_line" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "owner_statement_night" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "owner_statement_night" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "owner_statement_night" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "owner_payout" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "owner_payout" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "owner_payout" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pms_app;
--> statement-breakpoint
-- INV-12: two agreements may not cover the same property (or the same unit) on the same date.
CREATE OR REPLACE FUNCTION owner_agreement_no_overlap() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE clash uuid;
BEGIN
  SELECT a.id INTO clash FROM owner_agreement a
  WHERE a.id <> NEW.id AND a.property_id = NEW.property_id
    AND a.effective_from < coalesce(NEW.effective_to, '9999-12-31'::date)
    AND NEW.effective_from < coalesce(a.effective_to, '9999-12-31'::date)
    AND (a.unit_ids IS NULL OR NEW.unit_ids IS NULL OR a.unit_ids ?| ARRAY(SELECT jsonb_array_elements_text(NEW.unit_ids)))
  LIMIT 1;
  IF clash IS NOT NULL THEN RAISE EXCEPTION 'agreement overlaps % on the same property/unit and dates (INV-12)', clash; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER owner_agreement_no_overlap BEFORE INSERT OR UPDATE ON "owner_agreement" FOR EACH ROW EXECUTE FUNCTION owner_agreement_no_overlap();
--> statement-breakpoint
-- INV-13: once sent, a statement's lines and nights never change; the row itself only moves state, dispute flag, payout and pdf fields.
CREATE OR REPLACE FUNCTION owner_statement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state IN ('sent', 'paid') THEN
    IF NEW.state NOT IN ('sent', 'paid') OR NEW.period_from <> OLD.period_from OR NEW.period_to <> OLD.period_to
       OR NEW.totals::text <> OLD.totals::text OR NEW.segments::text <> OLD.segments::text OR NEW.input_hash <> OLD.input_hash
       OR NEW.currency <> OLD.currency OR NEW.owner_id <> OLD.owner_id OR NEW.agreement_key <> OLD.agreement_key THEN
      RAISE EXCEPTION 'statement % is sent and immutable (INV-13)', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER owner_statement_immutable BEFORE UPDATE ON "owner_statement" FOR EACH ROW EXECUTE FUNCTION owner_statement_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION owner_statement_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT state INTO st FROM owner_statement WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
  IF st IN ('sent', 'paid') THEN RAISE EXCEPTION 'statement is sent; lines are immutable (INV-13)'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER owner_statement_line_guard BEFORE INSERT OR UPDATE OR DELETE ON "owner_statement_line" FOR EACH ROW EXECUTE FUNCTION owner_statement_line_guard();
--> statement-breakpoint
CREATE TRIGGER owner_statement_night_guard BEFORE INSERT OR UPDATE OR DELETE ON "owner_statement_night" FOR EACH ROW EXECUTE FUNCTION owner_statement_line_guard();
--> statement-breakpoint
ALTER TABLE "owner_statement" ADD CONSTRAINT owner_statement_state CHECK (state IN ('draft', 'approved', 'sent', 'paid', 'void') AND dispute_state IN ('none', 'open', 'resolved') AND period_from < period_to);
