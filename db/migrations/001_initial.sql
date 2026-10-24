BEGIN;

-- Fixed catalog of exactly 10,000 possible squares.
CREATE TABLE IF NOT EXISTS public.squares_catalog (
  square_id integer PRIMARY KEY CHECK (square_id BETWEEN 1 AND 10000)
);
INSERT INTO public.squares_catalog(square_id)
SELECT n FROM generate_series(1, 10000) AS n
ON CONFLICT DO NOTHING;

-- Only published stories are stored here. A catalog row may be published once.
CREATE TABLE IF NOT EXISTS public.squares (
  square_id integer PRIMARY KEY REFERENCES public.squares_catalog(square_id),
  name varchar(50) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
  story varchar(250) NOT NULL CHECK (char_length(btrim(story)) BETWEEN 1 AND 250),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Raw activation codes are never stored; only SHA-256 hashes are stored.
CREATE TABLE IF NOT EXISTS public.activation_codes (
  id bigserial PRIMARY KEY,
  square_id integer NOT NULL REFERENCES public.squares_catalog(square_id),
  code_hash char(64) NOT NULL UNIQUE,
  code_hint varchar(8) NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  is_revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  CHECK ((is_used = false AND used_at IS NULL) OR (is_used = true AND used_at IS NOT NULL))
);

-- A square can have at most one active unused code at a time.
CREATE UNIQUE INDEX IF NOT EXISTS activation_codes_one_active_code_per_square
  ON public.activation_codes(square_id)
  WHERE is_used = false AND is_revoked = false;
CREATE INDEX IF NOT EXISTS activation_codes_square_id_idx ON public.activation_codes(square_id);

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id bigserial PRIMARY KEY,
  event_type varchar(60) NOT NULL,
  square_id integer CHECK (square_id BETWEEN 1 AND 10000),
  actor varchar(100) NOT NULL DEFAULT 'admin',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_sessions_expire_idx ON public.app_sessions(expire);

COMMIT;
