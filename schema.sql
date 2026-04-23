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
