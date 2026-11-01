# Turning on accounts (Supabase)

Until this is done the game runs in guest-only mode, exactly as before. It takes about 15 minutes, plus a few minutes for each social login you add.

Throughout, the game's address is assumed to be `https://philosophist.github.io/Rational-Bonding/chess3d/`. Use your own if it differs.

## 1. Create the project
1. Sign up at [supabase.com](https://supabase.com) (free) and click **New project**. Pick a region near your players and save the database password somewhere safe. You won't need it for the game.
2. Free projects pause after about a week with no activity. Opening the dashboard wakes them up.

## 2. Create the tables and rules
1. In the dashboard, open **SQL Editor → New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It's safe to run again later, for example after an update.

This creates player profiles, follows and saved games, with row-level security on every table. Players can't edit games directly. Every move, resignation and timeout goes through database functions that check it's really that player's turn and keep the clocks on the server.

## 3. Tell Supabase where the game lives
Go to **Authentication → URL Configuration**:
- **Site URL:** `https://philosophist.github.io/Rational-Bonding/chess3d/`
- **Redirect URLs:** add `https://philosophist.github.io/Rational-Bonding/chess3d/**`. If you test on your own computer, also add `http://localhost:8080/**`.

## 4. Switch on sign-in methods
All of these are under **Authentication → Sign In / Providers**, except passkeys. The game shows a button only for the methods you switch on.

### Email: on by default
- **Set up your own email sender (required for real players).** Supabase's built-in email only reaches your own team's addresses and is heavily rate-limited. Under **Authentication → Emails → SMTP Settings**, connect a free sender such as Resend, Brevo or Mailjet.
- **Sign-in codes:** to let players type a code instead of clicking the link, which helps when the email is opened on another device, edit **Authentication → Emails → Templates → Magic Link** and add `Your code: {{ .Token }}`.
- **Leave "Confirm email" on.**
- **Leaked password protection:** under **Authentication → Attack Protection**, turn on the check against known leaked passwords. It's available on paid plans.

### Passkeys: the open-standard, one-tap option (recommended)
Passkeys use the open **WebAuthn/FIDO2** standard. There's no password, and they can't be phished. They're as quick as "Sign in with Google" without involving a third party. Supabase added them as a beta in 2026.
1. Go to **Authentication → Passkeys** and turn them on.
2. **Relying Party ID:** `philosophist.github.io`
3. **Origins:** `https://philosophist.github.io`
4. **Display name:** `Cube Chess`

Players create an account any other way first. The game then offers to add a passkey, which they can also do later under **Profile → Security**. After that, "Sign in with a passkey" is one tap.

A passkey is tied to the domain. If you later move the game to another domain, such as rationalbonding.com, players will need to add a new passkey there.

### Social logins
Each provider needs an app registered with it. You get a **Client ID** and **Secret** to paste into Supabase. Every provider asks for a callback URL, which is always:
`https://<your-project-ref>.supabase.co/auth/v1/callback`

| Provider | Notes |
|---|---|
| **GitLab** | Open source; works with gitlab.com or your own GitLab. Create an app under User Settings → Applications with scopes `read_user` and `openid`. |
| **Keycloak** | Open-source identity server that you host yourself. Gives you fully self-run single sign-on. |
| Google | Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web). |
| Apple | Needs a paid Apple Developer account. |
| Microsoft (Azure) | Azure portal → App registrations. |
| GitHub | Settings → Developer settings → OAuth Apps. |
| Discord, Facebook, X/Twitter, Twitch, LinkedIn, Slack, Spotify, Notion, Zoom, Bitbucket, Figma, Kakao, WorkOS, Fly.io | Each provider's developer portal. Supabase's page for each one links to the steps. |

### Phone codes (optional, costs money)
Phone sign-in needs an SMS provider such as Twilio, MessageBird or Vonage. Turn on **Phone** and enter that provider's details.

### Crypto wallets (optional)
Turn on **Web3 → Ethereum** and/or **Solana** in the dashboard. Supabase doesn't tell the game these are on, so also set `WALLET_SIGN_IN = ['ethereum', 'solana']` in `config.js`. The buttons appear only for visitors who have a wallet installed.

## 5. Connect the game
In **Project Settings → API Keys**, copy the **Project URL** and the **publishable key**. On older projects, the "anon" key works too. Put them in [`config.js`](config.js):

```js
export const SUPABASE_URL = 'https://<your-project-ref>.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_...';
```

Both values are meant to be public. The database rules decide what each player can do. Never put the **secret** or **service_role** key in the game.

Commit and push, or tell Claude the two values and it will do it. GitHub Pages updates within a minute or two.

## What is and isn't enforced
- **Enforced by the database:** only you can edit your profile and follows. Only the player whose turn it is can move. Clocks and timeouts are timed by the server. Results can only be claimed by the right player. Nobody can edit, delete or forge an online game directly. Same-screen games are private to whoever saved them.
- **Checked by each player's browser:** whether a move is legal, and whether a claimed checkmate is real. Someone who modifies the game in their browser could send an illegal move. Their opponent's browser would refuse to show it and warn them. Full server-side move checking would need a Supabase Edge Function that runs the same rules engine, which can be added later.

## Testing locally (optional, for developers)
With Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli):
```
supabase init && supabase start
psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -f supabase/schema.sql
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<publishable key> SUPABASE_SERVICE_KEY=<secret key> npm run test:db
```
