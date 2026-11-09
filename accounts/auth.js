// The shared Rational Bonding sign-in: Supabase auth plus the `profiles`
// username, for any page on rationalbonding.com. Pages on the same domain
// share the saved session, so signing in here also signs you in to Cube Chess.
//
// Loads nothing, and the page stays guest-only, unless config.js is filled in.
// (Cube Chess still uses its own copy in chess3d/account.js.)
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
const listeners = new Set();
export const state = { enabled: false, user: null, profile: null };

// Tests can point a page at another stack by setting window.RB_SUPABASE first.
const cfg = () => window.RB_SUPABASE || { url: SUPABASE_URL, key: SUPABASE_KEY, wallets: WALLET_SIGN_IN };
export const configured = () => !!(cfg().url && cfg().key);
export const client = () => sb;
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
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

export const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function init() {
  if (!configured()) return state;
  if (sb) return state;
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
  return state;
}

async function setUser(user) {
  if (user?.id === state.user?.id && (state.profile || !user)) return;
  state.user = user;
  state.profile = user ? await getProfile(user.id) : null;
  emit();
}

const PASSKEY_HOST = /(^|\.)rationalbonding\.com$|^localhost$|^127\.0\.0\.1$/;

export function methods() {
  const ext = settings?.external || {};
  return {
    // Passkeys belong to rationalbonding.com, so other sites such as
    // ourgument.com (served by a Cloudflare Worker) don't offer them.
    passkey: !!settings?.passkeys_enabled && !!window.PublicKeyCredential && PASSKEY_HOST.test(location.hostname),
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
export const resendSignupEmail = async (email) =>
  check(await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirect() } }));
export const verifyEmailCode = async (email, token) => check(await sb.auth.verifyOtp({ email, token, type: 'email' }));
export const sendPhoneCode = async (phone) => check(await sb.auth.signInWithOtp({ phone }));
export const verifyPhoneCode = async (phone, token) => check(await sb.auth.verifyOtp({ phone, token, type: 'sms' }));
export const signInWithPassword = async (email, password) => check(await sb.auth.signInWithPassword({ email, password }));
export const signUpWithPassword = async (email, password) =>
  check(await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirect() } }));
export const sendPasswordReset = async (email) => check(await sb.auth.resetPasswordForEmail(email, { redirectTo: redirect() }));
export const signInWithWallet = async (chain) =>
  check(await sb.auth.signInWithWeb3({ chain, statement: 'Sign in to Rational Bonding' }));
export async function signOut() {
  await sb.auth.signOut();
  state.user = null;
  state.profile = null;
  emit();
}
export const registerPasskey = async () => check(await sb.auth.registerPasskey());
export const listPasskeys = async () => check(await sb.auth.passkey.list());

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
