# CLAUDE.md

Guidance for Claude (and other contributors) working on this repository. For
what is done and what comes next, see [ROADMAP.md](ROADMAP.md).

## What this is
**Rational Bonding** is Steve's ("Steve The Philosophist", GitHub `Philosophist`)
edutainment brand: games and stories that make ideas click. This repository *is*
the website **https://rationalbonding.com**, served by GitHub Pages from the
`master` branch, repository root.

Steve wants Claude to manage everything that goes up on the site, so he has as
little work as possible, as long as security isn't weakened. He isn't a
developer:
- Explain things plainly, give exact clicks and values for dashboards, and
  never assume he knows SQL, DNS or Git.
- He may ask Claude to speak a little like Dream from *Crystal Society*:
  dreamy imagery, lightly. Keep facts plain and never let the style blur
  instructions.

## Workflow rules
- **Changes go through pull requests**, drafts first. Nothing reaches `master`
  until Steve says so ("merge it"), and merging is what publishes the site and
  applies database migrations. Never merge without his explicit go-ahead in the
  current conversation.
- **Never commit secrets.** That means the Supabase secret / `service_role`
  key, wallet seeds or private keys, OAuth client secrets, or tokens. The
  Supabase *publishable* key and *public* donation addresses are fine: they're
  meant to be public.
- **Rule changes:** after any change to game rules, bump `RULES_VERSION` in
  `chess3d/rules.js`. Online players on different versions then get a warning.
- **Database changes** go in a **new, later-dated** file in
  `chess3d/supabase/migrations/`. Never edit a migration that has already run.
- **Alchem Fighter belongs to another Claude session.** It is being rebuilt on
  branch `claude/atomic-space-fighter-game-ihpb71` (`prototype/`, `docs/`).
  Don't change `alchemfighter/`, `prototype/`, `docs/`, `Alchem_Fighter_GODOT/`,
  `scripts/`, `styles/` or `aframe-glow-master/` beyond what Steve asks for.
- **Netlify is retired.** Steve wants nothing hosted there. The blog was moved
  into this repo (`blog/`).
- **CDN scripts:** pin exact versions in `<script>`/import-map URLs.
- **One account for everything.** Every Rational Bonding game and page uses the
  same Supabase project through `accounts/config.js`, so one sign-up and one
  username work everywhere. Pages on rationalbonding.com share the signed-in
  session automatically (same origin, same Supabase project, default storage
  key). For a new game: import from `/accounts/config.js`, reuse the
  `profiles` table for usernames, and give the game its own tables
  (e.g. `alchem_scores`) through a new migration. Don't create a second
  Supabase project or a second profiles table. A game hosted elsewhere (such
  as itch.io) can use the same account but needs its own sign-in there, plus
  its URL in Supabase's Redirect URLs.
- **Privacy page:** `privacy/` describes what the site collects. Update it in the
  same PR whenever a change collects new data, adds a service, or changes
  what's public.

## Site layout
| Path | What |
|---|---|
| `index.html`, `site.css`, `site.js` | Homepage: the hub that points to every project (add a card for each new one), plus "Buy me a coffee" |
| `site-config.js` | Public donation details (Monero address, Cash App `$youngidealist`) and the privacy contact email. Empty values are hidden. |
| `accounts/config.js` | The shared Rational Bonding account settings (Supabase URL, publishable key, wallet chains) used by every game |
| `privacy/` | Privacy policy, linked from every footer and the sign-in dialog |
| `blog/more-ways/` | "More ways (ref links) to hook me up": referral links (Wise), each explained and disclosed as a referral, with `rel="sponsored"` |
| `blog/` | *The Philosophist's Blog*: plain HTML, no build step. See "Adding a blog post" below. |
| `chess/` | Short link that forwards to `chess3d/`, keeping `?join=` codes |
| `chess3d/` | Cube Chess 8×8×8, the game (see below) |
| `alchemfighter/` | Alchem Fighter project page. The new version should be published under it (e.g. `alchemfighter/play/`) and linked from the page. |
| `alchemfighter/vr/` | Steve's early attempt: the original A-Frame VR scene, linked from the project page |
| `CNAME` | `rationalbonding.com`, the custom domain for GitHub Pages |
| `images/`, `favicon.png` | Site images, including `rational-bonding-logo.png` |

Brand look: black background with the logo's cyan `#2fe3e6`, magenta `#e04dff`,
blue `#3b6dff` and yellow `#ffe94d` (see `site.css`).

### Adding a blog post
1. Copy `blog/the-tale-of-the-beer-tycoon/` to `blog/<slug>/` and edit it.
2. Add a card to `blog/index.html`.
3. Put images in `blog/images/`, resized to about 1400 px.

The old source for the blog was Steve's Nuxt/Netlify CMS repo
`Philosophist/awake-template` (archived; don't revive it).

## Cube Chess (`chess3d/`)
Static ES modules with no build step: three.js 0.160.0 and PeerJS 1.5.4 from
jsDelivr, and supabase-js 2.118.0 loaded only when accounts are configured.

| File | Role |
|---|---|
| `rules.js` | Rules engine, with no DOM code. Coordinates are x = file a–h, y = rank 1–8, z = level A–H; squares are named like `e2B`. |
| `clock.js` | chess.com-style time controls and clock maths (pure) |
| `stats.js` | Personal stats computed from game rows (pure) |
| `main.js` | three.js client: cube grid, pieces, picking, panels, the facing picker, clocks, game modes |
| `net.js` | Guest online play over WebRTC (PeerJS). The host is authoritative; guests reclaim their seat after a reload. |
| `account.js`, `accountui.js` | Supabase accounts, profiles, follows, challenges, saved games, replays, stats UI |
| `config.js` | Re-exports `SUPABASE_URL`, `SUPABASE_KEY` and `WALLET_SIGN_IN` from `/accounts/config.js`. Empty values there would mean guest-only. |
| `supabase/migrations/` | Database schema, row-level security and game functions |
| `SETUP.md` | Steve's step-by-step Supabase setup guide |

### Rules, briefly
Full details are in `chess3d/README.md` and the in-game rules panel.

**Setup.** White's back rank is on edge y=0, z=0, with its pawns one step
diagonally inward (y=1, z=1). Black mirrors this on edge y=7, z=7. There's no
en passant, by design.

**Classic mode**
- Rook: axes, plus flat diagonals to the edge (toggle).
- Bishop: 20 diagonals (flat and corner to corner).
- Queen: 26 directions.
- Knight: 24 leaps.
- Pawn: forward along rank and level. Up-forward moves and captures go 1 square,
  or 2 on the first move. It captures on any diagonal with a forward component
  and promotes on the far edge (y and z both enemy-side).
- Castling: the rook moves 2 squares, and the king lands just past it, in line
  or one diagonal step inward.

**Relative mode**
- Each piece has a facing `o = [dx, dy, dz, turned]`. Only four square frames
  exist on the grid: the board's own, or the board turned 45° about one axis.
  So a piece faces along an axis (square or turned ◇) or a flat diagonal, never
  corner to corner.
- Both armies start facing each other across the diagonal: White →8H, Black →1A.
- Rook: its own three axes.
- Bishop: the diagonals of its own frame (toggle, on).
- Knight: 2+1 along its own axes (toggle, on).
- Pawn: forward along its facing *and* its own up and down (`frameUp`), 1 square
  or 2 on the first move. It captures forward + sideways (or up/down), never
  backwards. By default it may face any direction (toggle off: only toward the enemy).
- After a piece whose moves depend on facing moves, the player picks its new
  facing by clicking labelled blocks around it.

**Time controls**
- Bullet, Blitz, Rapid, Daily (account games only) and Custom.
- Clocks start after each side's first move, and a game can be aborted before
  then. Increments are added after each move.
- Timeout against insufficient material is a draw.

### Accounts (Supabase)
- Project "Space Chess" (to be renamed "Rational Bonding" in the dashboard; it serves every project), ref `lleyoffvdmmtgrvreiyx`, URL
  `https://lleyoffvdmmtgrvreiyx.supabase.co`.
- **GitHub integration:** working directory `chess3d`, production branch
  `master`, deploy to production on. Merged migrations apply automatically.
- **Security model:** RLS is on every table, and profiles and follows are
  public to read.
  - Online games change only through `SECURITY DEFINER` functions:
    `challenge`, `answer_challenge`, `make_move`, `resign`, `abort_game` and
    `claim_timeout`.
  - Those functions check whose turn it is, and the server keeps the clocks.
  - Same-screen games are private to their owner.
  - Move *legality* is checked only in the browsers. An Edge Function running
    `rules.js` is on the roadmap.
- **Sign-in:** passkeys, email link or code, email and password, all Supabase
  OAuth providers (open-source GitLab and Keycloak listed first), phone and
  Web3. The UI shows only what `/auth/v1/settings` reports as enabled. Web3
  isn't reported there, so it uses `WALLET_SIGN_IN`.
- **Guests:** can play same-screen and link games, but have no profile and
  nothing is saved.

### Testing
```
cd chess3d && npm install
npm test        # rules, clock and stats unit tests
npm run test:db # needs a Supabase stack: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
```
- **Local Supabase:** in the cloud sandbox, Docker works once you start
  `dockerd`. Then run `supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,postgres-meta`
  in a directory whose `supabase/migrations` holds the migrations.
- **Realtime warm-up:** realtime needs a few seconds after its first
  subscription on a fresh stack.
- **Browser checks:** use Playwright with the CDN routed to local npm copies of
  three, peerjs and qrcode-generator. Headless needs
  `--use-gl=swiftshader --enable-unsafe-swiftshader`. WebAuthn can be tested
  with a CDP virtual authenticator. Guest online play needs a local PeerServer
  on 127.0.0.1, because the public PeerJS cloud is blocked in the sandbox.
- **Sandbox network:** it blocks supabase.com, rationalbonding.com, DNS lookups
  and the GitHub Pages API. Say so, and don't guess results.

## Hosting and accounts (where things live)
- **Domain:** bought through Google Workspace, registered at **eNom** (Registrar
  Lock on; expires 2027-03-02). Leave the eNom settings alone.
- **DNS:** managed at **Cloudflare** (name servers `ryleigh`/`lex.ns.cloudflare.com`).
  - Records are four `A` records on `@` (185.199.108–111.153) and a `CNAME`
    from `www` to `philosophist.github.io`, all **DNS only** (grey cloud).
  - Email: sign-in emails are sent by **Brevo** (SMTP `smtp-relay.brevo.com:587`,
    sender `no-reply@rationalbonding.com`, "Rational Bonding"). Its domain
    records (`brevo-code` TXT, DKIM, `_dmarc`) are in Cloudflare, DNS only. The
    domain *sends* mail, so never add `v=spf1 -all`. Steps are in
    `chess3d/SETUP.md` under "Sending sign-in emails with Brevo". The SMTP key
    lives only in Supabase.
  - Also recommended: the GitHub domain-verification TXT.
- **GitHub Pages:** custom domain `rationalbonding.com` ("DNS check successful").
  Tick Enforce HTTPS once the certificate is issued.
- **Donations:**
  - Monero, a primary address held in Steve's Cake Wallet. Only the public
    address is in the repo.
  - Cash App `$youngidealist`.
  - Steve also has a BTC wallet in Cake if ever wanted.
