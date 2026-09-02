-- RLS for M8 tenant tables (INV-10); plan catalogue seed (spec 12 §12.5); shape checks.
--> statement-breakpoint
ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscription" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "subscription" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "usage_record" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "usage_record" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "usage_record" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "billing_invoice" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "billing_invoice" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "billing_invoice" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "impersonation_session" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "impersonation_session" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "impersonation_session" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "support_access_grant" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "support_access_grant" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "support_access_grant" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "plugin" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plugin" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "plugin" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "plugin_delivery" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "plugin_delivery" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "plugin_delivery" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "data_export" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "data_export" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "data_export" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pms_app;
--> statement-breakpoint
ALTER TABLE "billing_invoice" ADD CONSTRAINT billing_invoice_state CHECK (state IN ('draft', 'open', 'paid', 'uncollectible', 'void') AND period_from < period_to);
--> statement-breakpoint
ALTER TABLE "impersonation_session" ADD CONSTRAINT impersonation_state CHECK (state IN ('requested', 'approved', 'active', 'ended', 'denied'));
--> statement-breakpoint
ALTER TABLE "plugin_delivery" ADD CONSTRAINT plugin_delivery_state CHECK (state IN ('pending', 'delivered', 'failed', 'dead'));
--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT organization_state CHECK (state IN ('trial', 'active', 'past_due', 'suspended', 'expired', 'offboarding'));
--> statement-breakpoint
INSERT INTO "plan" (id, key, name, currency, tiers, add_ons, annual_discount_bps, quotas, trial_days, active) VALUES ('0192a000-0000-7000-8000-000000000001', 'starter', 'Starter', 'EUR', '[{"fromUnits": 1, "unitMinor": 900}]', '[{"key": "priority_support", "name": "Priority support", "monthlyMinor": 4900}]', 1500, '{"properties": 10, "rooms": 25, "users": 5, "apiRequestsPerMinute": 120, "webhookEndpoints": 2, "retentionDays": 400, "storageMb": 2048}', 14, true) ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO "plan" (id, key, name, currency, tiers, add_ons, annual_discount_bps, quotas, trial_days, active) VALUES ('0192a000-0000-7000-8000-000000000002', 'growth', 'Growth', 'EUR', '[{"fromUnits": 1, "unitMinor": 800}, {"fromUnits": 51, "unitMinor": 650}, {"fromUnits": 201, "unitMinor": 500}]', '[{"key": "priority_support", "name": "Priority support", "monthlyMinor": 9900}]', 1500, '{"properties": 300, "rooms": 1000, "users": 50, "apiRequestsPerMinute": 600, "webhookEndpoints": 10, "retentionDays": 1100, "storageMb": 20480}', 14, true) ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO "plan" (id, key, name, currency, tiers, add_ons, annual_discount_bps, quotas, trial_days, active) VALUES ('0192a000-0000-7000-8000-000000000003', 'scale', 'Scale', 'EUR', '[{"fromUnits": 1, "unitMinor": 700}, {"fromUnits": 201, "unitMinor": 450}, {"fromUnits": 1001, "unitMinor": 300}]', '[{"key": "priority_support", "name": "Priority support", "monthlyMinor": 0}]', 2000, '{"properties": null, "rooms": null, "users": null, "apiRequestsPerMinute": 3000, "webhookEndpoints": 50, "retentionDays": null, "storageMb": null}', 14, true) ON CONFLICT (key) DO NOTHING;
