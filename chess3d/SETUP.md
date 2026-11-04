# Turning on accounts (Supabase)

Until this is done the game runs in guest-only mode, exactly as before. It takes about 15 minutes, plus a few minutes for each social login you add.

Throughout, the game's address is assumed to be `https://rationalbonding.com/chess3d/`. Use your own if it differs.

## 1. Create the project
1. Sign up at [supabase.com](https://supabase.com) (free) and click **New project**. Pick a region near your players and save the database password somewhere safe. You won't need it for the game.
2. Free projects pause after about a week with no activity. Opening the dashboard wakes them up.

## 2. Create the tables and rules (automatically, from GitHub)
The database's structure and security rules live in this repository, in [`supabase/migrations/`](supabase/migrations). Each file is one step of changes, called a migration. Supabase's GitHub integration applies them for you, so there's nothing to paste.

1. In the dashboard, open **Project Settings → Integrations → GitHub** and connect **Philosophist/Rational-Bonding**.
2. **Supabase directory** (the folder that contains `supabase/`): `chess3d`
3. **Production branch:** `master`. Turn on the option to **deploy changes to production** when that branch changes.
4. When the pull request that adds the game's accounts is merged, Supabase runs the migration. Check that **Table Editor** lists `profiles`, `follows` and `games`.
5. If the tables don't appear, the integration didn't pick it up. Paste the migration file into **SQL Editor → New query** and click **Run**. It's safe to run more than once.

Supabase may change the exact labels on that settings page over time. What matters is the directory (`chess3d`) and the branch (`master`).

The migration creates player profiles, follows and saved games, with row-level security on every table. Players can't edit games directly. Every move, resignation and timeout goes through database functions that check it's really that player's turn and keep the clocks on the server.

**Who can change the database:** only what reaches `master`. Because you decide which pull requests are merged, every change to the database's rules passes through you first.

## 3. Tell Supabase where the game lives
Go to **Authentication → URL Configuration**:
- **Site URL:** `https://rationalbonding.com/`
- **Redirect URLs:** add `https://rationalbonding.com/**`. That one entry covers every game and page on the site, since they all share one Rational Bonding account. If you test on your own computer, also add `http://localhost:8080/**`.

## 4. Switch on sign-in methods
All of these are under **Authentication → Sign In / Providers**, except passkeys. The game shows a button only for the methods you switch on.

### Email: on by default
- **Set up your own email sender (required for real players).** Supabase's built-in email only reaches your own team's addresses and is heavily rate-limited. Rational Bonding uses **Brevo**: follow [Sending sign-in emails with Brevo](#sending-sign-in-emails-with-brevo) below.
- **Sign-in codes (needed):** the game offers a box for the code from the email, which helps when the email is opened on another device. Add the code to **both** of these templates in [Authentication → Emails → Templates](https://supabase.com/dashboard/project/lleyoffvdmmtgrvreiyx/auth/templates):
  - **Confirm signup**: a brand-new player's first email
  - **Magic Link**: a returning player's sign-in email

  In each, add this line just above the link: `<p>Your code: <strong>{{ .Token }}</strong></p>`. Without it, new players are asked for a code their email doesn't have.
- **Leave "Confirm email" on.**
- **Leaked password protection:** under **Authentication → Attack Protection**, turn on the check against known leaked passwords. It's available on paid plans.

### Passkeys: the open-standard, one-tap option (recommended)
Passkeys use the open **WebAuthn/FIDO2** standard. There's no password, and they can't be phished. They're as quick as "Sign in with Google" without involving a third party. Supabase added them as a beta in 2026.
1. Go to **Authentication → Passkeys** and turn them on.
2. **Relying Party ID:** `rationalbonding.com`
3. **Origins:** `https://rationalbonding.com`
4. **Display name:** `Cube Chess`

Players create an account any other way first. The game then offers to add a passkey, which they can also do later under **Profile → Security**. After that, "Sign in with a passkey" is one tap.

A passkey is tied to the domain. If the game ever moves to another domain, players will need to add a new passkey there.

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
Turn on **Web3 → Ethereum** and/or **Solana** in the dashboard. Supabase doesn't tell the game these are on, so also set `WALLET_SIGN_IN = ['ethereum', 'solana']` in [`accounts/config.js`](../accounts/config.js). The buttons appear only for visitors who have a wallet installed.

## 5. Connect the game
In **Project Settings → API Keys**, copy the **Project URL** and the **publishable key**. On older projects, the "anon" key works too. Put them in [`accounts/config.js`](../accounts/config.js), the shared Rational Bonding account settings that every game uses:

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
cd chess3d && supabase init && supabase start   # applies supabase/migrations/ automatically
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=<publishable key> SUPABASE_SERVICE_KEY=<secret key> npm run test:db
```

## Sending sign-in emails with Brevo
Brevo sends every Rational Bonding sign-in email: links, codes, confirmations and password resets, for all games, since they share one account system. The free plan sends up to 300 emails a day. Brevo is based in France, so the data stays under EU privacy law.

### 1. Make the Brevo account
1. Sign up at [brevo.com](https://www.brevo.com) with the free plan. Use your own name and "Rational Bonding" as the company.
2. Confirm your email address, and finish any profile questions Brevo asks. Brevo can take a day to activate sending on a new account.

### 2. Prove you own rationalbonding.com
1. In Brevo, open **Senders, Domains & Dedicated IPs → Domains** (under your account name, top right) and click **Add a domain**. Enter `rationalbonding.com`.
2. Choose to set up the records yourself (not "Authenticate automatically"). Brevo then lists some DNS records: a `brevo-code` TXT record, two DKIM records, and a DMARC record.
3. In **Cloudflare → rationalbonding.com → DNS → Records**, add each one exactly as Brevo shows it: same type, name and value.
   - Set every record to **DNS only** (grey cloud). An orange cloud breaks them.
   - Cloudflare adds `.rationalbonding.com` to names by itself, so if Brevo shows `brevo1._domainkey.rationalbonding.com`, typing `brevo1._domainkey` is enough.
   - **DMARC:** if you already have a `_dmarc` record, edit it rather than adding a second one. `v=DMARC1; p=quarantine; rua=mailto:...` (whatever Brevo suggests) is fine. Once emails are arriving well for a few weeks, you can tighten it to `p=reject`.
   - **SPF:** don't add `v=spf1 -all`. That's only for a domain that sends no email at all. If you already added it, delete it, or change it to whatever SPF value Brevo shows, if it shows one.
4. Back in Brevo, click **Authenticate this email domain**. It can take from a few minutes to a few hours to turn green.

### 3. Add the sender
In Brevo, open **Senders, Domains & Dedicated IPs → Senders** and add:
- **From name:** `Rational Bonding`
- **From email:** `no-reply@rationalbonding.com`

This address doesn't need a real inbox. Brevo trusts it because the domain is authenticated.

### 4. Get the SMTP key
In Brevo, open **SMTP & API → SMTP**:
- Note the **SMTP server** (`smtp-relay.brevo.com`), **port** (`587`) and **login** (it looks like `xxxxxx@smtp-brevo.com`).
- Click **Generate a new SMTP key**, name it `Supabase`, and copy it. It's shown only once.
- The key is a password. Paste it only into Supabase. Never put it in the repository or send it in chat.

### 5. Connect Supabase
In Supabase, open **Authentication → Emails → SMTP Settings** and turn on **Enable custom SMTP**:

| Field | Value |
|---|---|
| Sender email | `no-reply@rationalbonding.com` |
| Sender name | `Rational Bonding` |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | your Brevo SMTP login (`...@smtp-brevo.com`) |
| Password | the SMTP key from step 4 |
| Minimum interval between emails | leave the default |

Save. Then, under **Authentication → Rate Limits**, raise **emails sent per hour** to about `100`. Supabase keeps it low until custom SMTP is on.

### 6. Privacy and tracking
Brevo may add open tracking (a tiny image) and click tracking (rewritten links) to emails. Our privacy page promises no tracking, and rewritten sign-in links can break. In Brevo, look under **Transactional → Settings** (or the SMTP settings) for open and click tracking, and switch both off.

### 7. Test
Open https://rationalbonding.com/chess3d/, choose **Sign in or create an account**, and ask for an email link with an address that isn't on your Supabase team. The email should arrive from "Rational Bonding" within a minute. If it doesn't, check its status in Brevo under **Transactional → Logs**. Also look in the spam folder: a new domain can land there for its first few days.

