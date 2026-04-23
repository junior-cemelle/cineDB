import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const app = express();
const PORT = 8089;
const SEARCH_PAGE_SIZE = 10; // matches OMDB

app.use(cors());
app.use(express.static(join(__dirname, 'public')));

// ── Format helpers (reverse the transformations from the seeder) ───────────────
const orNA = (val) => (val == null ? 'N/A' : String(val));

function formatDate(iso) {
  if (!iso) return 'N/A';
  // iso is "YYYY-MM-DD" — parse as UTC to avoid timezone shifts
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  }); // "05 May 2017"
}

function formatVotes(n) {
  return n == null ? 'N/A' : n.toLocaleString('en-US');
}

function formatBoxOffice(n) {
  return n == null ? 'N/A' : '$' + n.toLocaleString('en-US');
}

// ── Response builders ─────────────────────────────────────────────────────────
function buildDetail(row, ratings) {
  return {
    Title:      orNA(row.title),
    Year:       orNA(row.year),
    Rated:      orNA(row.rated),
    Released:   formatDate(row.released),
    Runtime:    row.runtime_min != null ? `${row.runtime_min} min` : 'N/A',
    Genre:      row.genre?.length ? row.genre.join(', ') : 'N/A',
    Director:   orNA(row.director),
    Writer:     orNA(row.writer),
    Actors:     orNA(row.actors),
    Plot:       orNA(row.plot),
    Language:   orNA(row.language),
    Country:    orNA(row.country),
    Awards:     orNA(row.awards),
    Poster:     orNA(row.poster),
    Ratings:    ratings.map(r => ({ Source: r.source, Value: r.value })),
    Metascore:  row.metascore  != null ? String(row.metascore)  : 'N/A',
    imdbRating: row.imdb_rating != null ? String(row.imdb_rating) : 'N/A',
    imdbVotes:  formatVotes(row.imdb_votes),
    imdbID:     row.imdb_id,
    Type:       orNA(row.type),
    DVD:        'N/A',
    BoxOffice:  formatBoxOffice(row.box_office),
    Production: 'N/A',
    Website:    'N/A',
    Response:   'True',
  };
}

function buildSearchItem(row) {
  return {
    Title:  orNA(row.title),
    Year:   orNA(row.year),
    imdbID: row.imdb_id,
    Type:   orNA(row.type),
    Poster: orNA(row.poster),
  };
}

// ── XML serialiser ────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toXml(payload) {
  const header = '<?xml version="1.0" encoding="UTF-8"?>';

  if (payload.Response === 'False') {
    return `${header}\n<root response="False"><error>${esc(payload.Error)}</error></root>`;
  }

  if (payload.Search) {
    const items = payload.Search
      .map(m => `  <result title="${esc(m.Title)}" year="${esc(m.Year)}" imdbID="${esc(m.imdbID)}" type="${esc(m.Type)}" poster="${esc(m.Poster)}"/>`)
      .join('\n');
    return `${header}\n<root response="True" totalresults="${esc(payload.totalResults)}">\n${items}\n</root>`;
  }

  // Detail
  const ratingNodes = payload.Ratings
    .map(r => `    <rating source="${esc(r.Source)}" value="${esc(r.Value)}"/>`)
    .join('\n');

  const attrs = [
    `title="${esc(payload.Title)}"`,
    `year="${esc(payload.Year)}"`,
    `rated="${esc(payload.Rated)}"`,
    `released="${esc(payload.Released)}"`,
    `runtime="${esc(payload.Runtime)}"`,
    `genre="${esc(payload.Genre)}"`,
    `director="${esc(payload.Director)}"`,
    `writer="${esc(payload.Writer)}"`,
    `actors="${esc(payload.Actors)}"`,
    `plot="${esc(payload.Plot)}"`,
    `language="${esc(payload.Language)}"`,
    `country="${esc(payload.Country)}"`,
    `awards="${esc(payload.Awards)}"`,
    `poster="${esc(payload.Poster)}"`,
    `metascore="${esc(payload.Metascore)}"`,
    `imdbRating="${esc(payload.imdbRating)}"`,
    `imdbVotes="${esc(payload.imdbVotes)}"`,
    `imdbID="${esc(payload.imdbID)}"`,
    `type="${esc(payload.Type)}"`,
    `dvd="${esc(payload.DVD)}"`,
    `boxoffice="${esc(payload.BoxOffice)}"`,
    `production="${esc(payload.Production)}"`,
    `website="${esc(payload.Website)}"`,
    `response="True"`,
  ].join('\n         ');

  return (
    `${header}\n<root response="True">\n` +
    `  <movie ${attrs}>\n` +
    `    <ratings>\n${ratingNodes}\n    </ratings>\n` +
    `  </movie>\n</root>`
  );
}

// ── Send (JSON / XML / JSONP) ─────────────────────────────────────────────────
function send(res, payload, format = 'json', callback = null) {
  if (format === 'xml') {
    res.set('Content-Type', 'application/xml; charset=utf-8');
    return res.send(toXml(payload));
  }
  // Sanitise callback to letters/numbers/_ only to prevent XSS
  if (callback && /^\w+$/.test(callback)) {
    res.set('Content-Type', 'application/javascript; charset=utf-8');
    return res.send(`${callback}(${JSON.stringify(payload)})`);
  }
  res.json(payload);
}

const fail = (msg) => ({ Response: 'False', Error: msg });

// ── Handler: GET by IMDb ID or exact title ────────────────────────────────────
async function handleDetail(res, { i, t, type, y, r, callback }) {
  let query = supabase.from('movies').select('*');

  if (i) {
    // ID lookup — type/y ignored (OMDB behaviour)
    query = query.eq('imdb_id', i);
  } else {
    // Title lookup — case-insensitive exact match
    query = query.ilike('title', t);
    if (type) query = query.eq('type', type);
    if (y)    query = query.like('year', `${y}%`);
  }

  const { data: rows, error } = await query.limit(1);

  if (error || !rows?.length) {
    return send(res, fail('Movie not found!'), r, callback);
  }

  const row = rows[0];

  const { data: ratings = [] } = await supabase
    .from('ratings')
    .select('source, value')
    .eq('movie_id', row.id);

  send(res, buildDetail(row, ratings ?? []), r, callback);
}

// ── Handler: search by title fragment ────────────────────────────────────────
async function handleSearch(res, { s, type, y, r, page, callback }) {
  const pageNum = Math.max(1, Math.min(100, parseInt(page, 10) || 1));
  const from    = (pageNum - 1) * SEARCH_PAGE_SIZE;
  const to      = from + SEARCH_PAGE_SIZE - 1;

  let query = supabase
    .from('movies')
    .select('imdb_id, title, year, type, poster', { count: 'exact' })
    .ilike('title', `%${s}%`)
    .order('imdb_rating', { ascending: false, nullsFirst: false })
    .range(from, to);

  if (type) query = query.eq('type', type);
  if (y)    query = query.like('year', `${y}%`);

  const { data: rows, count, error } = await query;

  if (error || !rows?.length) {
    return send(res, fail('Movie not found!'), r, callback);
  }

  send(res, {
    Search:       rows.map(buildSearchItem),
    totalResults: String(count),
    Response:     'True',
  }, r, callback);
}

// ── Single route — API endpoint ───────────────────────────────────────────────
app.get('/api', async (req, res) => {
  const {
    i, t, s,
    type, y,
    plot = 'short',       // kept for compatibility; we store one plot version
    r = 'json',
    callback,
    page = '1',
    // apikey accepted but not validated (internal API)
  } = req.query;

  try {
    if (s !== undefined) {
      if (!String(s).trim()) return send(res, fail('No results for this search.'), r, callback);
      return await handleSearch(res, { s: String(s).trim(), type, y, r, page, callback });
    }

    if (i || t) {
      return await handleDetail(res, { i, t, type, y, plot, r, callback });
    }

    send(res, fail('Something went wrong.'), r, callback);
  } catch (err) {
    console.error(err);
    send(res, fail('Internal server error.'), r, callback);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nFrontend  →  http://localhost:${PORT}`);
  console.log(`API       →  http://localhost:${PORT}/api\n`);
  console.log('  By ID     /api?i=tt0111161');
  console.log('  By title  /api?t=Inception');
  console.log('  Search    /api?s=batman&page=1');
  console.log('  Filters   &type=movie  &y=2017  &r=xml\n');
});
