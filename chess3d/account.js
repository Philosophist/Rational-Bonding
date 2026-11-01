// Accounts, profiles, follows and saved games on Supabase.
// Loads nothing (and the game stays guest-only) unless config.js is filled in.
import { SUPABASE_URL, SUPABASE_KEY, WALLET_SIGN_IN } from './config.js';

const SDK = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';

// Sign-in providers Supabase supports, open-source-friendly ones first.
export const PROVIDERS = [
  ['gitlab', 'GitLab'], ['keycloak', 'Keycloak'], ['google', 'Google'], ['apple', 'Apple'],
  ['azure', 'Microsoft'], ['github', 'GitHub'], ['discord', 'Discord'], ['facebook', 'Facebook'],
  ['x', 'X'], ['twitter', 'Twitter'], ['twitch', 'Twitch'], ['linkedin_oidc', 'LinkedIn'], ['slack_oidc', 'Slack'],
  ['spotify', 'Spotify'], ['notion', 'Notion'], ['zoom', 'Zoom'], ['bitbucket', 'Bitbucket'], ['figma', 'Figma'],
  ['kakao', 'Kakao'], ['workos', 'WorkOS'], ['fly', 'Fly.io'], ['snapchat', 'Snapchat'],
];

let sb = null;
let settings = null;
let serverOffset = 0; // server clock minus ours, in ms
const listeners = new Set();
export const state = { enabled: false, user: null, profile: null };

const cfg = () => window.CHESS3D_SUPABASE || { url: SUPABASE_URL, key: SUPABASE_KEY, wallets: WALLET_SIGN_IN };
export const configured = () => !!(cfg().url && cfg().key);
export const client = () => sb;
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(state));
const redirect = () => location.origin + location.pathname;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.supabase?.createClient) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('could not load the Supabase library'));
    document.head.appendChild(s);
  });
}

const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function init() {
  if (!configured()) return state;
  const { url, key } = cfg();
  await loadScript(SDK);
  sb = window.supabase.createClient(url, key, { auth: { detectSessionInUrl: true, flowType: 'pkce' } });
  state.enabled = true;
  try {
    settings = await (await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })).json();
  } catch {
    settings = { external: { email: true } };
  }
  sb.auth.onAuthStateChange((_event, session) => {
    // Never await Supabase calls inside this callback; defer instead.
    setTimeout(() => setUser(session?.user || null), 0);
  });
  const { data } = await sb.auth.getSession();
  await setUser(data.session?.user || null);
  syncServerClock();
  return state;
}

async function setUser(user) {
  if (user?.id === state.user?.id && (state.profile || !user)) return;
  state.user = user;
  state.profile = user ? await getProfile(user.id) : null;
  emit();
}

export async function syncServerClock() {
  if (!sb) return;
  const t0 = Date.now();
  const { data, error } = await sb.rpc('server_time');
  if (!error && data) serverOffset = new Date(data).getTime() - (t0 + Date.now()) / 2;
}
// A server timestamp in our clock's terms.
export const toLocalTime = (ts) => (ts ? new Date(ts).getTime() - serverOffset : Date.now());

// ---------------------------------------------------------------- sign-in methods
export function methods() {
  const ext = settings?.external || {};
  return {
    passkey: !!settings?.passkeys_enabled && !!window.PublicKeyCredential,
    providers: PROVIDERS.filter(([id]) => ext[id]),
    email: ext.email !== false,
    phone: !!ext.phone,
    ethereum: (cfg().wallets || []).includes('ethereum') && !!window.ethereum,
    solana: (cfg().wallets || []).includes('solana') && !!window.solana,
    signupDisabled: !!settings?.disable_signup,
  };
}

export const signInWithPasskey = async () => check(await sb.auth.signInWithPasskey());
export const signInWithProvider = async (provider) =>
  check(await sb.auth.signInWithOAuth({ provider, options: { redirectTo: redirect() } }));
export const sendEmailCode = async (email) =>
  check(await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect(), shouldCreateUser: true } }));
export const verifyEmailCode = async (email, token) => check(await sb.auth.verifyOtp({ email, token, type: 'email' }));
export const sendPhoneCode = async (phone) => check(await sb.auth.signInWithOtp({ phone }));
export const verifyPhoneCode = async (phone, token) => check(await sb.auth.verifyOtp({ phone, token, type: 'sms' }));
export const signInWithPassword = async (email, password) => check(await sb.auth.signInWithPassword({ email, password }));
export const signUpWithPassword = async (email, password) =>
  check(await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } }));
export const sendPasswordReset = async (email) => check(await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect() }));
export const setPassword = async (password) => check(await sb.auth.updateUser({ password }));
export const signInWithWallet = async (chain) =>
  check(await sb.auth.signInWithWeb3({ chain, statement: 'Sign in to Cube Chess' }));
export async function signOut() {
  await sb.auth.signOut();
  state.user = null;
  state.profile = null;
  emit();
}

export const registerPasskey = async () => check(await sb.auth.registerPasskey());
export const listPasskeys = async () => check(await sb.auth.passkey.list());
export const deletePasskey = async (passkeyId) => check(await sb.auth.passkey.delete({ passkeyId }));

// ---------------------------------------------------------------- profiles & follows
export async function getProfile(id) {
  const { data } = await sb.from('profiles').select('*').eq('id', id).maybeSingle();
  return data;
}
export async function createProfile(username) {
  const p = check(await sb.from('profiles').insert({ id: state.user.id, username }).select().single());
  state.profile = p;
  emit();
  return p;
}
export async function renameProfile(username) {
  const p = check(await sb.from('profiles').update({ username }).eq('id', state.user.id).select().single());
  state.profile = p;
  emit();
  return p;
}
export async function findPlayers(text) {
  const q = text.replace(/[^A-Za-z0-9_]/g, '');
  if (!q) return [];
  return check(await sb.from('profiles').select('id, username').ilike('username', `${q}%`).order('username').limit(12));
}
export async function profilesById(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const rows = check(await sb.from('profiles').select('id, username').in('id', list));
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}
export async function following(id) {
  const rows = check(await sb.from('follows').select('followee, profiles!follows_followee_fkey(id, username)').eq('follower', id));
  return rows.map((r) => r.profiles).filter(Boolean);
}
export async function followerCount(id) {
  const { count } = await sb.from('follows').select('*', { count: 'exact', head: true }).eq('followee', id);
  return count || 0;
}
export const follow = async (id) => check(await sb.from('follows').insert({ follower: state.user.id, followee: id }));
export const unfollow = async (id) => check(await sb.from('follows').delete().eq('follower', state.user.id).eq('followee', id));

// ---------------------------------------------------------------- games
export async function gamesOf(id, limit = 500) {
  return check(await sb.from('games').select('*').or(`white.eq.${id},black.eq.${id}`).order('updated_at', { ascending: false }).limit(limit));
}
export const getGame = async (id) => check(await sb.from('games').select('*').eq('id', id).single());
export const challenge = async (opponent, myColor, rules, timeControl) =>
  check(await sb.rpc('challenge', { opponent, my_color: myColor, rules, time_control: timeControl }));
export const answerChallenge = async (gameId, accept) => check(await sb.rpc('answer_challenge', { game_id: gameId, accept }));
export const makeMove = async (gameId, ply, move, claimResult = null, claimReason = null) =>
  check(await sb.rpc('make_move', { game_id: gameId, ply, move, claim_result: claimResult, claim_reason: claimReason }));
export const resign = async (gameId) => check(await sb.rpc('resign', { game_id: gameId }));
export const abortGame = async (gameId) => check(await sb.rpc('abort_game', { game_id: gameId }));
export const claimTimeout = async (gameId, winnerCanMate) =>
  check(await sb.rpc('claim_timeout', { game_id: gameId, winner_can_mate: winnerCanMate }));
export async function saveLocalGame(row) {
  const me = state.user.id;
  return check(await sb.from('games').insert({ ...row, kind: 'local', white: me, black: me, created_by: me }).select().single());
}

// Live updates for one game, or for every game I play in.
export function watchGame(id, fn) {
  const ch = sb.channel(`game-${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `id=eq.${id}` }, (p) => fn(p.new))
    .subscribe();
  return () => sb.removeChannel(ch);
}
export function watchMine(fn) {
  const me = state.user.id;
  const ch = sb.channel(`mine-${me}`);
  for (const side of ['white', 'black'])
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `${side}=eq.${me}` }, (p) => fn(p.new));
  ch.subscribe();
  return () => sb.removeChannel(ch);
}
