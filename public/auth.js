// ── CineDB shared auth module ─────────────────────────────────────────────────
// Requires: Supabase CDN loaded before this script.
// Usage: await CINEDB.init() once, then use helper methods.

const CINEDB = (() => {
  let _sb = null;

  async function init() {
    if (_sb) return _sb;
    const cfg = await fetch('/config').then(r => r.json());
    _sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { flowType: 'pkce' },
    });
    return _sb;
  }

  const client = () => _sb;

  async function getSession() {
    const { data } = await _sb.auth.getSession();
    return data.session;
  }

  // Redirects to login if no active session. Returns session or null.
  async function requireAuth() {
    const session = await getSession();
    if (!session) { window.location.replace('/login.html'); return null; }
    return session;
  }

  // Redirects to catalog if already authenticated (for login page).
  async function redirectIfAuthed() {
    const session = await getSession();
    if (session) window.location.replace('/');
  }

  async function signInWith(provider) {
    const redirectTo = window.location.origin; // no trailing slash — Twitter PKCE validation is strict
    return _sb.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
  }

  async function signOut() {
    await _sb.auth.signOut();
    window.location.replace('/login.html');
  }

  async function getProfile(userId) {
    const { data } = await _sb.from('profiles').select('*').eq('id', userId).single();
    return data;
  }

  async function updateProfile(userId, fields) {
    return _sb.from('profiles')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', userId);
  }

  return { init, client, getSession, requireAuth, redirectIfAuthed, signInWith, signOut, getProfile, updateProfile };
})();
