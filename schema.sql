-- Run this in the Supabase SQL Editor before running the fetch script.

CREATE TABLE IF NOT EXISTS movies (
  id             SERIAL PRIMARY KEY,
  imdb_id        VARCHAR(20)    UNIQUE NOT NULL,
  title          TEXT           NOT NULL,
  year           VARCHAR(10),
  rated          VARCHAR(20),
  released       DATE,
  runtime_min    INTEGER,
  genre          TEXT[],
  director       TEXT,
  writer         TEXT,
  actors         TEXT,
  plot           TEXT,
  language       TEXT,
  country        TEXT,
  awards         TEXT,
  poster         TEXT,
  metascore      SMALLINT,
  imdb_rating    NUMERIC(3, 1),
  imdb_votes     INTEGER,
  type           VARCHAR(20),
  box_office     BIGINT,
  created_at     TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ratings (
  id        SERIAL  PRIMARY KEY,
  movie_id  INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  source    VARCHAR(100),
  value     VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_movies_imdb_id  ON movies (imdb_id);
CREATE INDEX IF NOT EXISTS idx_movies_type     ON movies (type);
CREATE INDEX IF NOT EXISTS idx_ratings_movie   ON ratings (movie_id);

-- ── Profiles (OAuth users) ────────────────────────────────────────────────────
-- Run AFTER enabling Google / Twitter providers in Supabase Auth dashboard.

CREATE TABLE IF NOT EXISTS profiles (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT,
  full_name   TEXT,
  avatar_url  TEXT,
  provider    TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create a profile row when a new OAuth user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, provider, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_app_meta_data->>'provider',
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Each user can only read and edit their own profile
CREATE POLICY "select_own_profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "update_own_profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);
