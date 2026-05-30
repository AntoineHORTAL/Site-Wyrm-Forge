-- Protection tables for Riot API Edge Functions.
-- All three tables are service_role-only: RLS blocks anon and authenticated entirely.
-- SQL functions use SECURITY DEFINER to perform atomic increments from Edge Functions.

-- ── 1. riot_cache ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS riot_cache (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cache_key     TEXT        NOT NULL UNIQUE,
  function_name TEXT        NOT NULL CHECK (function_name IN ('riot-rank','riot-matches','riot-match-detail','riot-rotation')),
  response_body JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  hit_count     INTEGER     NOT NULL DEFAULT 0,
  last_hit_at   TIMESTAMPTZ
);

CREATE INDEX idx_riot_cache_expires_at ON riot_cache (expires_at);
CREATE INDEX idx_riot_cache_fn_expires ON riot_cache (function_name, expires_at);

ALTER TABLE riot_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon"          ON riot_cache FOR ALL TO anon          USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON riot_cache FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ── 2. riot_rate_limits ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS riot_rate_limits (
  id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash         TEXT        NOT NULL,
  function_name   TEXT        NOT NULL CHECK (function_name IN ('riot-rank','riot-matches','riot-match-detail','riot-rotation')),
  window_start    TIMESTAMPTZ NOT NULL,
  request_count   INTEGER     NOT NULL DEFAULT 1,
  blocked_count   INTEGER     NOT NULL DEFAULT 0,
  last_request_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ip_hash, function_name, window_start)
);

CREATE INDEX idx_riot_rate_limits_window ON riot_rate_limits (window_start);

ALTER TABLE riot_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon"          ON riot_rate_limits FOR ALL TO anon          USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON riot_rate_limits FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Atomic upsert+increment for rate limiting.
-- Returns the new request_count for the current window.
CREATE OR REPLACE FUNCTION fn_riot_rate_increment(
  p_ip_hash       TEXT,
  p_function_name TEXT,
  p_window_start  TIMESTAMPTZ
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO riot_rate_limits (ip_hash, function_name, window_start, request_count, last_request_at)
  VALUES (p_ip_hash, p_function_name, p_window_start, 1, now())
  ON CONFLICT (ip_hash, function_name, window_start)
  DO UPDATE SET
    request_count   = riot_rate_limits.request_count + 1,
    last_request_at = now()
  RETURNING request_count INTO v_count;
  RETURN v_count;
END;
$$;

-- pg_cron: purge entries older than 5 minutes, every 5 minutes.
SELECT cron.schedule(
  'purge_riot_rate_limits',
  '*/5 * * * *',
  $$DELETE FROM public.riot_rate_limits WHERE window_start < now() - interval '5 minutes'$$
);

-- ── 3. riot_daily_quota ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS riot_daily_quota (
  id                BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date              DATE        NOT NULL UNIQUE DEFAULT current_date,
  calls_made        INTEGER     NOT NULL DEFAULT 0,
  calls_by_function JSONB       NOT NULL DEFAULT '{}',
  quota_limit       INTEGER     NOT NULL DEFAULT 1000,
  circuit_open      BOOLEAN     NOT NULL DEFAULT false,
  circuit_opened_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE riot_daily_quota ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny_anon"          ON riot_daily_quota FOR ALL TO anon          USING (false) WITH CHECK (false);
CREATE POLICY "deny_authenticated" ON riot_daily_quota FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Read today's circuit state. Always returns exactly one row.
-- Returns (false, 0, 1000) if today has no row yet (first call of the day).
CREATE OR REPLACE FUNCTION fn_riot_quota_check()
RETURNS TABLE(circuit_open BOOLEAN, calls_made INTEGER, quota_limit INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT q.circuit_open, q.calls_made, q.quota_limit
    FROM riot_daily_quota q
    WHERE q.date = current_date;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false::BOOLEAN, 0::INTEGER, 1000::INTEGER;
  END IF;
END;
$$;

-- Atomic increment of daily calls_made. Opens the circuit if quota_limit is reached.
-- Returns (calls_made, circuit_open) after the operation.
CREATE OR REPLACE FUNCTION fn_riot_quota_increment(
  p_calls         INTEGER,
  p_function_name TEXT
) RETURNS TABLE(calls_made INTEGER, circuit_open BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calls INTEGER;
  v_limit INTEGER;
  v_open  BOOLEAN;
BEGIN
  INSERT INTO riot_daily_quota (date, calls_made, calls_by_function)
  VALUES (
    current_date,
    p_calls,
    jsonb_build_object(p_function_name, p_calls)
  )
  ON CONFLICT (date) DO UPDATE SET
    calls_made        = riot_daily_quota.calls_made + p_calls,
    calls_by_function = jsonb_set(
      riot_daily_quota.calls_by_function,
      ARRAY[p_function_name],
      to_jsonb(
        COALESCE((riot_daily_quota.calls_by_function ->> p_function_name)::INTEGER, 0) + p_calls
      )
    )
  RETURNING riot_daily_quota.calls_made, riot_daily_quota.quota_limit, riot_daily_quota.circuit_open
    INTO v_calls, v_limit, v_open;

  IF NOT v_open AND v_calls >= v_limit THEN
    UPDATE riot_daily_quota
    SET circuit_open = true, circuit_opened_at = now()
    WHERE date = current_date;
    v_open := true;
  END IF;

  RETURN QUERY SELECT v_calls, v_open;
END;
$$;
