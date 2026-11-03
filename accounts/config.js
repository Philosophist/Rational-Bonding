// The one Rational Bonding account system, shared by every game and page on
// rationalbonding.com. Every project imports these values from here, so they
// all use the same Supabase project: one sign-up, one username, and signing in
// on one page signs you in on the others (they share the browser's saved
// session, because they're all on the same domain).
//
// Both values are meant to be public: what people can do is enforced by the
// database rules in chess3d/supabase/migrations/. Never put the secret /
// service_role key here. Leave them empty and every game runs guest-only.
export const SUPABASE_URL = 'https://lleyoffvdmmtgrvreiyx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_N0gTm_MBrTpcpYyFAvCyHQ_kvoxB-0F'; // the "publishable" key (or the legacy "anon" key)

// Crypto-wallet sign-in (Sign in with Ethereum / Solana). Supabase doesn't
// report whether it is enabled, so list the chains you enabled in the
// dashboard here, e.g. ['ethereum', 'solana']. Buttons only appear for
// visitors who have a matching wallet installed.
export const WALLET_SIGN_IN = [];
