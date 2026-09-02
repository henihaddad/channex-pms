-- Webhook receiver needs to map a path token to (org, property, secret) before any tenant context exists.
-- SECURITY DEFINER so pms_app can call it without bypassing RLS anywhere else (spec 05 §5.5.1).
CREATE OR REPLACE FUNCTION resolve_webhook_token(p_token text)
RETURNS TABLE (org_id uuid, property_id uuid, webhook_secret_enc text)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT p.org_id, p.id, p.webhook_secret_enc FROM property p WHERE p.webhook_token = p_token AND p.archived_at IS NULL LIMIT 1
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_webhook_token(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_webhook_token(text) TO pms_app;
