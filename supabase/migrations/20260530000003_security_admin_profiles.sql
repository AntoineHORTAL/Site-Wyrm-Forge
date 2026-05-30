-- Security hardening (2026-05-30):
--   1. admin_users: enable RLS — blocks direct client access.
--      is_admin() is SECURITY DEFINER and bypasses RLS → zero functional impact.
--      service_role also bypasses RLS by default → Edge Functions unaffected.
--   2. profiles INSERT guard: RESTRICTIVE policy ensures every new row starts
--      as role='user' / tier='apprenti', regardless of permissive policies.
--      Prevents privilege escalation at account creation.

-- ── 1. admin_users ────────────────────────────────────────────────────────────

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_anon"
  ON admin_users FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY "deny_authenticated"
  ON admin_users FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ── 2. profiles INSERT guard ──────────────────────────────────────────────────

-- RESTRICTIVE = ANDed on top of any permissive INSERT policy.
-- Even if a permissive policy is broad, this check must pass:
--   • id must match the calling user (no inserting rows for others)
--   • role must be 'user' (no self-promotion to admin)
--   • tier must be 'apprenti' (no self-assignment of a paid tier)
CREATE POLICY "restrict_insert_privileges"
  ON profiles
  AS RESTRICTIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    id   = auth.uid()
    AND role = 'user'
    AND tier = 'apprenti'
  );
