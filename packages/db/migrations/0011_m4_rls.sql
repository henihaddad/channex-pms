-- RLS for M4 tables (INV-10); MSG-6 at the storage layer: a note has no direction and no delivery state, so nothing that delivers can select it.
--> statement-breakpoint
ALTER TABLE "message_thread" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "message_thread" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "message_thread" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "message" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "message" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "message" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "attachment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "attachment" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "attachment" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "message_template" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "message_template" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "message_template" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "automation_rule" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "automation_rule" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "automation_rule" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "automation_run" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "automation_run" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "automation_run" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "review" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "review" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
ALTER TABLE "review_response" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "review_response" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "review_response" USING (org_id = app_org_id()) WITH CHECK (org_id = app_org_id());
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pms_app;
--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT message_note_never_deliverable CHECK (
  (kind = 'note' AND direction IS NULL AND delivery_state IS NULL AND provider_message_id IS NULL)
  OR (kind = 'guest_message' AND direction IN ('inbound', 'outbound') AND delivery_state IN ('queued', 'sent', 'failed', 'received')));
--> statement-breakpoint
ALTER TABLE "message_thread" ADD CONSTRAINT message_thread_state CHECK (state IN ('open', 'closed', 'no_reply_needed'));
--> statement-breakpoint
ALTER TABLE "review" ADD CONSTRAINT review_rating_range CHECK (rating BETWEEN 0 AND 10);
