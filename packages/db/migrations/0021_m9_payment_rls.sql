ALTER TABLE "payment_rule" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_rule" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payment_rule" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "payment_schedule" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "payment_schedule" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payment_schedule" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "payment_rule", "payment_schedule" TO pms_app;
--> statement-breakpoint
ALTER TABLE "payment_rule" ADD CONSTRAINT payment_rule_trigger CHECK (trigger IN ('confirmation', 'before_arrival', 'after_arrival'));
--> statement-breakpoint
ALTER TABLE "payment_rule" ADD CONSTRAINT payment_rule_amount CHECK (amount_kind IN ('percent', 'fixed', 'remainder') AND amount_value >= 0 AND offset_days >= 0);
--> statement-breakpoint
ALTER TABLE "payment_schedule" ADD CONSTRAINT payment_schedule_state CHECK (state IN ('scheduled', 'paid', 'failed', 'cancelled') AND amount_minor >= 0);
