import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { readFileSync } from 'fs';

// ── Config ────────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);

const OMDB_KEY     = env.OMDB_API_KEY;
const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_KEY;

if (!OMDB_KEY || !SUPABASE_URL || SUPABASE_URL.includes('YOUR_PROJECT')) {
  console.error('Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY in .env before running.');
  process.exit(1);
}

// CLI: node fetch_movies.js --limit=250
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 50;

// OMDB search returns 10 results per page. Each page counts as 1 request,
// then we make 1 more per movie for full details.  Free tier = 1000 req/day.
const OMDB_PAGE_SIZE = 10;

// Search terms shuffled on each run so no single term dominates.
// OMDB matches against title so short common words yield broad results.
const SEARCH_TERMS = [
  'love', 'war', 'man', 'dark', 'star', 'night', 'fire',
  'world', 'king', 'dead', 'city', 'black', 'last', 'blood',
  'time', 'girl', 'lost', 'run', 'house', 'day',
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function parseRuntime(str) {
  const m = (str || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function parseDate(str) {
  if (!str || str === 'N/A') return null;
  const d = new Date(str);
  return isNaN(d) ? null : d.toISOString().split('T')[0];
}

function parseBoxOffice(str) {
  if (!str || str === 'N/A') return null;
  const num = parseInt(str.replace(/[^0-9]/g, ''), 10);
  return isNaN(num) ? null : num;
}

function parseVotes(str) {
  if (!str || str === 'N/A') return null;
  const n = parseInt(str.replace(/,/g, ''), 10);
  return isNaN(n) ? null : n;
}

function parseCSV(str) {
  if (!str || str === 'N/A') return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function nullable(str) {
  return (!str || str === 'N/A') ? null : str;
}

// ── Phase 1: discover IMDb IDs via search ─────────────────────────────────────
// Round-robin across shuffled terms: fetch one page per term per cycle so
// results are spread across all terms rather than exhausting one first.
async function discoverIds(limit) {
  const seen  = new Set();
  const ids   = [];
  const terms = shuffle(SEARCH_TERMS);

  // Track next page to fetch and whether the term still has results
  const state = new Map(terms.map(t => [t, { page: 1, done: false }]));

  console.log(`Discovering up to ${limit} movie IDs (round-robin across ${terms.length} terms)...\n`);
  console.log(`  Term order: ${terms.join(', ')}\n`);

  while (ids.length < limit) {
    let anyActive = false;

    for (const term of terms) {
      if (ids.length >= limit) break;

      const s = state.get(term);
      if (s.done) continue;
      anyActive = true;

      let data;
      try {
        const res = await axios.get('http://www.omdbapi.com/', {
          params: { s: term, type: 'movie', page: s.page, apikey: OMDB_KEY },
          timeout: 10_000,
        });
        data = res.data;
      } catch (err) {
        console.warn(`  "${term}" p${s.page} network error: ${err.message}`);
        s.done = true;
        continue;
      }

      if (data.Response === 'False') {
        s.done = true;
        continue;
      }

      for (const item of data.Search || []) {
        if (!seen.has(item.imdbID)) {
          seen.add(item.imdbID);
          ids.push(item.imdbID);
        }
      }

      const total = parseInt(data.totalResults, 10) || 0;
      if (s.page * OMDB_PAGE_SIZE >= total) {
        s.done = true;
      } else {
        s.page++;
      }

      await sleep(150);
    }

    if (!anyActive) break; // all terms exhausted
  }

  console.log(`Discovered ${ids.length} unique IDs.\n`);
  return ids.slice(0, limit);
}

// ── Phase 2: fetch full detail for one ID ─────────────────────────────────────
async function fetchDetail(imdbId) {
  const { data } = await axios.get('http://www.omdbapi.com/', {
    params: { i: imdbId, apikey: OMDB_KEY },
    timeout: 10_000,
  });
  if (data.Response === 'False') throw new Error(data.Error || 'Not found');
  return data;
}

// ── Phase 3: upsert movie + ratings ──────────────────────────────────────────
async function upsertMovie(raw) {
  const movie = {
    imdb_id:     raw.imdbID,
    title:       raw.Title,
    year:        nullable(raw.Year),
    rated:       nullable(raw.Rated),
    released:    parseDate(raw.Released),
    runtime_min: parseRuntime(raw.Runtime),
    genre:       parseCSV(raw.Genre),
    director:    nullable(raw.Director),
    writer:      nullable(raw.Writer),
    actors:      nullable(raw.Actors),
    plot:        nullable(raw.Plot),
    language:    nullable(raw.Language),
    country:     nullable(raw.Country),
    awards:      nullable(raw.Awards),
    poster:      nullable(raw.Poster),
    metascore:   raw.Metascore && raw.Metascore !== 'N/A' ? parseInt(raw.Metascore, 10) : null,
    imdb_rating: parseFloat(raw.imdbRating) || null,
    imdb_votes:  parseVotes(raw.imdbVotes),
    type:        nullable(raw.Type),
    box_office:  parseBoxOffice(raw.BoxOffice),
  };

  const { data: inserted, error: movieErr } = await supabase
    .from('movies')
    .upsert(movie, { onConflict: 'imdb_id' })
    .select('id')
    .single();

  if (movieErr) throw movieErr;

  if (Array.isArray(raw.Ratings) && raw.Ratings.length > 0) {
    await supabase.from('ratings').delete().eq('movie_id', inserted.id);
    const { error: ratErr } = await supabase.from('ratings').insert(
      raw.Ratings.map(r => ({ movie_id: inserted.id, source: r.Source, value: r.Value }))
    );
    if (ratErr) throw ratErr;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const ids = await discoverIds(LIMIT);

  let ok = 0, fail = 0;
  const total = ids.length;

  for (const [i, id] of ids.entries()) {
    const prefix = `[${String(i + 1).padStart(String(total).length, '0')}/${total}] ${id}`;
    try {
      const raw = await fetchDetail(id);
      await upsertMovie(raw);
      console.log(`${prefix}  ✓  ${raw.Title} (${raw.Year})`);
      ok++;
    } catch (err) {
      console.error(`${prefix}  ✗  ${err.message}`);
      fail++;
    }
    if (i < total - 1) await sleep(250);
  }

  console.log(`\nDone. ${ok} inserted/updated, ${fail} failed.`);
  console.log(`Pages available in your API: ${Math.ceil(ok / 20)} (at 20 per page)`);
}

main().catch(err => { console.error(err); process.exit(1); });
