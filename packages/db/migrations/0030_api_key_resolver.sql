-- An API key (`Authorization: Bearer otab_…`) arrives before any tenant context exists: map its
-- hash to (org, key, service account) and stamp last_used_at in the same round trip, at most
-- once a minute per key. SECURITY DEFINER so pms_app can call it without bypassing RLS anywhere
-- else (spec 04 §4.7a, the same pattern as resolve_webhook_token).
CREATE OR REPLACE FUNCTION resolve_api_key(p_hash text)
RETURNS TABLE (org_id uuid, api_key_id uuid, service_account_id uuid, key_name text, scopes jsonb, created_by uuid)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE AS $$
BEGIN
  UPDATE api_key k SET last_used_at = now()
    WHERE k.key_hash = p_hash AND k.revoked_at IS NULL
      AND (k.last_used_at IS NULL OR k.last_used_at < now() - interval '1 minute');
  RETURN QUERY
    SELECT k.org_id, k.id, k.service_account_id, sa.name, k.scopes,
      (SELECT g.created_by FROM "grant" g
        WHERE g.subject_type = 'service_account' AND g.subject_id = k.service_account_id
        ORDER BY g.created_at LIMIT 1)
    FROM api_key k JOIN service_account sa ON sa.id = k.service_account_id
    WHERE k.key_hash = p_hash AND k.revoked_at IS NULL
      AND (k.expires_at IS NULL OR k.expires_at > now()) AND sa.archived_at IS NULL
    LIMIT 1;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_api_key(text) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_api_key(text) TO pms_app;
