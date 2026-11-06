# Roadmap

What's done, what's waiting, and ideas for later. Background and conventions are
in [CLAUDE.md](CLAUDE.md).

## Done
- **Cube Chess 8×8×8** (`chess3d/`). Merged through PRs #6–#11.
  - **Board and interface:**
    - 3D cube grid with a dark-blue/ivory theme
    - move highlights, a level focus, and a 2D level map
    - guest online play by invite link, with chat and reconnects
  - **Classic rules:**
    - rook flat diagonals (toggle), 20-direction bishops
    - up-forward pawn moves
    - castling with an in-line or diagonal landing
  - **Relative mode:**
    - pieces face a direction and each moves along its own frame (rooks,
      bishops, knights and pawns, with toggles)
    - you choose a facing by clicking blocks
  - **Time controls:** chess.com-style, with server-kept clocks for account games.
  - **Accounts on Supabase:**
    - sign-in by passkey, email, OAuth, phone or wallet
    - profiles, follows and challenges
    - saved games with replays, and personal stats
    - Daily games
  - **Database rules:** the security rules are migration-based, applied by the
    GitHub integration.
- **rationalbonding.com on GitHub Pages:** the domain was moved off Netlify, and
  Cloudflare DNS points at GitHub.
- **PR #12 (merged 2026-11-03):**
  - a homepage for the Rational Bonding brand, with project cards
  - "Buy me a coffee", with Monero (QR code, copy button, wallet link) and
    Cash App
  - the blog brought home to `/blog/`
  - the `/chess/` short link
  - Alchem Fighter moved to `/alchemfighter/`
  - `CLAUDE.md` and this roadmap

## Waiting on Steve
1. **Merge the privacy and shared-account PR.**
2. **Enforce HTTPS** in the repository's Settings → Pages, once GitHub issues
   the certificate.
3. **Verify the domain on GitHub:** at github.com/settings/pages, click "Add a
   domain", then put the TXT record it shows into Cloudflare.
4. **Brevo for sign-in emails** (chosen 2026-11-03): follow "Sending sign-in
   emails with Brevo" in `chess3d/SETUP.md`. That covers the account, the
   domain records in Cloudflare, the sender, the SMTP key into Supabase,
   switching tracking off, and a test. Skip the old `v=spf1 -all` advice,
   because the domain now sends email.
5. **Supabase:**
   - URL configuration: Site URL `https://rationalbonding.com/`, redirect
     `https://rationalbonding.com/**` (one entry covers every game).
   - Rename the project from "Space Chess" to "Rational Bonding" (Project
     Settings → General). Cosmetic: the URL and keys don't change.
   - Email templates: say "Rational Bonding" rather than "Cube Chess".
   - Turn on whichever social logins he wants.
   - URL configuration and publishable key: done (the key is in
     `chess3d/config.js`).
   - Google sign-in needs its own Google Cloud OAuth client (Client ID and
     secret). Until that's set up, leave Google switched off, or its button
     will fail. On the consent screen use app name "Rational Bonding", home
     page `https://rationalbonding.com/` and privacy policy
     `https://rationalbonding.com/privacy/`.
   - Privacy contact: an address such as `privacy@rationalbonding.com`
     (Cloudflare Email Routing can forward it for free), then set
     `contactEmail` in `site-config.js`. Until then the page points to
     GitHub issues.
6. **Passkeys:** not in the dashboard yet (the beta is rolling out). Turn them
   on when "Passkeys" appears under Authentication: Relying Party ID
   `rationalbonding.com`, origin `https://rationalbonding.com`. The game hides
   the button until then.
7. **Delete the old Netlify sites.**
8. **Pick a game name** (ideas: Parallax, Facet, Gambit³, Lattice Kings,
   Voxel Gambit, Vantage).
9. **Optional:** a donation-only Monero subaddress. In Cake Wallet, open the
   Receive screen and look for the subaddress list. Then swap it in
   `site-config.js`.
10. **Optional:** let Claude check the live site by adding `rationalbonding.com`
    to the session's Allowed domains.

## Next for Claude, once unblocked
- Test signing in on the live site. The sandbox can't reach supabase.co, so this
  needs Steve's report, or `*.supabase.co` and `rationalbonding.com` added to
  the session's Allowed domains.
- Add more referral links to `blog/more-ways/` as Steve sends them.
- After the domain is confirmed working, check the passkey and Supabase
  settings against `SETUP.md`.
- Launch page for the **illustrated *Tale of the Beer Tycoon*** (almost done:
  two pages left), linked from the blog post and the homepage.

- **Self-service account deletion** (promised on the privacy page within 30
  days, handled by hand until then): a `delete_my_account()` function in a new
  migration, plus a button in the profile panel.

- **Ourgument** (argument-mapping app, formerly Reasonance, at `reasonance/`). Plan:
  https://claude.ai/artifact/KYaEnrF5TgaUmroiHLhaRf
  1. Map editor, guest-only, saving in the browser (done).
  2. Accounts and posts (done): `rs_*` tables by migration, shared sign-in
     (`accounts/auth.js`, `accounts/signin.js`), unique posts (matching what's
     already posted), anonymous posting, views private unless shared, dated
     history, public totals, maps saved to the account, pulling public posts
     into a private map. Later, Cube
     Chess could switch from its own `chess3d/account.js` to `accounts/auth.js`.
  3. The 3D sea of posts (three.js), clicking a post brings it into the map.
     Started: the signed-in home shows the sea behind the feed, and clicking
     an orb finds its post. Next: fly into an orb and see its arguments.
  4. Feed and search, belief sharing, "wants to know what you think" asks.
     Started: a newest-first feed with views given in place, and search.
  5. Curation settings (sliders, following someone's curation).
  6. Default blurs, phone-verified totals, rate limits, illegal-content
     reports. Then the opt-in, paid data tool and labelled sponsored posts.

## Ideas
- **Server-side move validation:** a Supabase Edge Function that runs `rules.js`.
- **Ratings** (Elo or Glicko) per time control, plus leaderboards.
- **Game features:** draw offers, takebacks in casual games, and
  first-move-timeout auto-aborts.
- **Security and accounts:** data export; CAPTCHA on sign-up (hCaptcha or
  Turnstile).
- **Rules experiments:**
  - a combined rook-bishop "turning" piece (names: Pivot, Vane, Gyre, Prism,
    Compass)
  - facings for queens and kings
  - an option to restrict Relative-mode pawn captures
- **Chess AI opponent** for solo play.
- **BTC donations** (Steve has a Cake BTC wallet). Note that BTC transactions
  are publicly visible, unlike Monero.
- **Blog:** more posts; categories as their own pages.
- **Alchem Fighter:** handled by the other session (prototype in `prototype/`).
  The first playable slice of the Level 1 hydrogen tutorial (beats 1 and 2) is in
  `alchemfighter/tutorial/`; beats 3 to 5 come next.
  When it's ready, publish it under `alchemfighter/` and add a Play button to
  the project page. The early VR scene (`alchemfighter/vr/`) references a
  `jquery.js` file that doesn't exist.
