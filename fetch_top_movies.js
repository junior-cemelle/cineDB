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

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Curated list of 60 widely recognised titles ───────────────────────────────
const TOP_MOVIES = [
  // Drama
  { id: 'tt0111161', label: 'The Shawshank Redemption' },
  { id: 'tt0068646', label: 'The Godfather' },
  { id: 'tt0071562', label: 'The Godfather Part II' },
  { id: 'tt0108052', label: "Schindler's List" },
  { id: 'tt0120689', label: 'The Green Mile' },
  { id: 'tt0253474', label: 'The Pianist' },
  { id: 'tt0317248', label: 'City of God' },
  { id: 'tt0118799', label: 'Life is Beautiful' },
  { id: 'tt0211915', label: 'Amélie' },
  { id: 'tt0095765', label: 'Cinema Paradiso' },
  { id: 'tt6751668', label: 'Parasite' },
  // Action / Thriller
  { id: 'tt0468569', label: 'The Dark Knight' },
  { id: 'tt0372784', label: 'Batman Begins' },
  { id: 'tt1345836', label: 'The Dark Knight Rises' },
  { id: 'tt0133093', label: 'The Matrix' },
  { id: 'tt0172495', label: 'Gladiator' },
  { id: 'tt0407887', label: 'The Departed' },
  { id: 'tt0120815', label: 'Saving Private Ryan' },
  { id: 'tt0110413', label: 'Léon: The Professional' },
  { id: 'tt0482571', label: 'The Prestige' },
  { id: 'tt1877830', label: 'The Batman' },
  // Sci-Fi
  { id: 'tt0816692', label: 'Interstellar' },
  { id: 'tt1375666', label: 'Inception' },
  { id: 'tt0083658', label: 'Blade Runner' },
  { id: 'tt0078748', label: 'Alien' },
  { id: 'tt0081505', label: 'The Shining' },
  { id: 'tt0088763', label: 'Back to the Future' },
  { id: 'tt0103064', label: 'Terminator 2' },
  { id: 'tt1745960', label: 'Top Gun: Maverick' },
  // Marvel / Superhero
  { id: 'tt0848228', label: 'The Avengers' },
  { id: 'tt2395427', label: 'Avengers: Age of Ultron' },
  { id: 'tt4154756', label: 'Avengers: Infinity War' },
  { id: 'tt4154796', label: 'Avengers: Endgame' },
  { id: 'tt2015381', label: 'Guardians of the Galaxy' },
  { id: 'tt3896198', label: 'Guardians of the Galaxy Vol. 2' },
  { id: 'tt9362722', label: 'Spider-Man: No Way Home' },
  // Animation / Family
  { id: 'tt0114709', label: 'Toy Story' },
  { id: 'tt0245429', label: 'Spirited Away' },
  { id: 'tt0096283', label: 'My Neighbor Totoro' },
  { id: 'tt0095327', label: 'Grave of the Fireflies' },
  // Epic / Fantasy
  { id: 'tt0120737', label: 'LotR: The Fellowship of the Ring' },
  { id: 'tt0167261', label: 'LotR: The Two Towers' },
  { id: 'tt0167260', label: 'LotR: The Return of the King' },
  // Crime
  { id: 'tt0110912', label: 'Pulp Fiction' },
  { id: 'tt0137523', label: 'Fight Club' },
  { id: 'tt0099685', label: 'Goodfellas' },
  { id: 'tt1853728', label: 'Django Unchained' },
  { id: 'tt0102926', label: 'The Silence of the Lambs' },
  // Classic
  { id: 'tt0050083', label: '12 Angry Men' },
  { id: 'tt0034583', label: 'Casablanca' },
  { id: 'tt0038650', label: "It's a Wonderful Life" },
  { id: 'tt0047478', label: 'Seven Samurai' },
  { id: 'tt0060196', label: 'The Good, the Bad and the Ugly' },
  // Star Wars
  { id: 'tt0076759', label: 'Star Wars: A New Hope' },
  { id: 'tt0080684', label: 'Star Wars: The Empire Strikes Back' },
  { id: 'tt0086190', label: 'Star Wars: Return of the Jedi' },
  // Others
  { id: 'tt0120586', label: 'American History X' },
  { id: 'tt0073486', label: "One Flew Over the Cuckoo's Nest" },
  { id: 'tt0050825', label: 'Paths of Glory' },
  { id: 'tt0361748', label: 'Inglourious Basterds' },
  { id: 'tt0110357', label: 'The Lion King' },
];

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

// ── Fetch + upsert ────────────────────────────────────────────────────────────
async function fetchDetail(imdbId) {
  const { data } = await axios.get('http://www.omdbapi.com/', {
    params: { i: imdbId, apikey: OMDB_KEY },
    timeout: 10_000,
  });
  if (data.Response === 'False') throw new Error(data.Error || 'Not found');
  return data;
}

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
  const total = TOP_MOVIES.length;
  console.log(`Fetching ${total} curated top movies from OMDB...\n`);

  let ok = 0, fail = 0;

  for (const [i, { id, label }] of TOP_MOVIES.entries()) {
    const prefix = `[${String(i + 1).padStart(2, '0')}/${total}] ${id}`;
    try {
      const raw = await fetchDetail(id);
      await upsertMovie(raw);
      console.log(`${prefix}  ✓  ${raw.Title} (${raw.Year})`);
      ok++;
    } catch (err) {
      console.error(`${prefix}  ✗  ${label} — ${err.message}`);
      fail++;
    }
    if (i < total - 1) await sleep(250);
  }

  console.log(`\nDone. ${ok} inserted/updated, ${fail} failed.`);
}

main().catch(err => { console.error(err); process.exit(1); });
