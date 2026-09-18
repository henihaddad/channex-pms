-- Spec 12 §12.5: a complimentary plan the operator grants from the tenants page (developers,
-- design partners). Priced at zero, no quotas, no trial, and never offered for self-service
-- (active = false), so it only ever reaches a tenant through an operator action.
INSERT INTO "plan" (id, key, name, currency, tiers, add_ons, annual_discount_bps, quotas, trial_days, active) VALUES ('0192a000-0000-7000-8000-000000000004', 'complimentary', 'Complimentary', 'EUR', '[{"fromUnits": 1, "unitMinor": 0}]', '[]', 0, '{"properties": null, "rooms": null, "users": null, "apiRequestsPerMinute": 3000, "webhookEndpoints": 50, "retentionDays": null, "storageMb": null}', 0, false) ON CONFLICT (key) DO NOTHING;
