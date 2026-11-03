// Turn on accounts by filling these in from your Supabase project
// (Project Settings → API). Both values are meant to be public: what players
// can do is enforced by the database rules in supabase/migrations/.
// Leave them empty and the game runs in guest-only mode. See SETUP.md.
export const SUPABASE_URL = 'https://lleyoffvdmmtgrvreiyx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_N0gTm_MBrTpcpYyFAvCyHQ_kvoxB-0F'; // the "publishable" key (or the legacy "anon" key)

// Crypto-wallet sign-in (Sign in with Ethereum / Solana). Supabase doesn't
// report whether it is enabled, so list the chains you enabled in the
// dashboard here, e.g. ['ethereum', 'solana']. Buttons only appear for
// visitors who have a matching wallet installed.
export const WALLET_SIGN_IN = [];
