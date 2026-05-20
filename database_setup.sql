-- ============================================================
-- Samudra Suraksha — Supabase Database Setup
-- Run these SQL statements in the Supabase SQL Editor
-- (Dashboard → SQL Editor → New Query)
--
-- Tables (already exist in your project):
--   user_reports      — citizen hazard reports
--   gov_alerts        — government-issued alerts
--   users_metadata    — officer profiles (role, state, department)
--   user_fcm_tokens   — FCM push notification device tokens
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. ROW LEVEL SECURITY — user_reports
-- ────────────────────────────────────────────────────────────

ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

-- Government portal officers can read ALL reports
CREATE POLICY "gov_portal: read all reports"
ON user_reports FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_metadata
    WHERE id = auth.uid()
    AND role = 'gov_portal'
  )
);

-- Government portal officers can update (verify/reject) reports
CREATE POLICY "gov_portal: update report status"
ON user_reports FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_metadata
    WHERE id = auth.uid()
    AND role = 'gov_portal'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_metadata
    WHERE id = auth.uid()
    AND role = 'gov_portal'
  )
);

-- Public users (citizen app) can INSERT their own reports
CREATE POLICY "public: insert own report"
ON user_reports FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Public users can only read their own reports
CREATE POLICY "public: read own reports"
ON user_reports FOR SELECT
TO authenticated
USING (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 2. ROW LEVEL SECURITY — gov_alerts
-- ────────────────────────────────────────────────────────────

ALTER TABLE gov_alerts ENABLE ROW LEVEL SECURITY;

-- Only gov_portal users can read alerts
CREATE POLICY "gov_portal: read alerts"
ON gov_alerts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_metadata
    WHERE id = auth.uid()
    AND role = 'gov_portal'
  )
);

-- Only gov_portal users can insert alerts
CREATE POLICY "gov_portal: insert alerts"
ON gov_alerts FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users_metadata
    WHERE id = auth.uid()
    AND role = 'gov_portal'
  )
);

-- Only gov_portal users can delete alerts
CREATE POLICY "gov_portal: delete alerts"
ON gov_alerts FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users_metadata
    WHERE id = auth.uid()
    AND role = 'gov_portal'
  )
);


-- ────────────────────────────────────────────────────────────
-- 3. ROW LEVEL SECURITY — users_metadata
-- ────────────────────────────────────────────────────────────

ALTER TABLE users_metadata ENABLE ROW LEVEL SECURITY;

-- Users can only read their own metadata
CREATE POLICY "users: read own metadata"
ON users_metadata FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Users can insert their own metadata (on signup)
CREATE POLICY "users: insert own metadata"
ON users_metadata FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- Users can update their own metadata
CREATE POLICY "users: update own metadata"
ON users_metadata FOR UPDATE
TO authenticated
USING (auth.uid() = id);


-- ────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY — user_fcm_tokens
-- ────────────────────────────────────────────────────────────

ALTER TABLE user_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Users can manage their own FCM tokens
CREATE POLICY "users: manage own fcm tokens"
ON user_fcm_tokens FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────
-- 5. HELPER: Add expires_at to gov_alerts if missing
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gov_alerts' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE gov_alerts
      ADD COLUMN expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours');
  END IF;
END $$;
