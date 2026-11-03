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
- **PR #12 (open):**
  - a homepage for the Rational Bonding brand, with project cards
  - "Buy me a coffee", with Monero (QR code, copy button, wallet link) and
    Cash App
  - the blog brought home to `/blog/`
  - the `/chess/` short link
  - Alchem Fighter moved to `/alchemfighter/`
  - `CLAUDE.md` and this roadmap

## Waiting on Steve
1. **Merge PR #12:** the homepage, blog and donations go live.
2. **Enforce HTTPS** in the repository's Settings → Pages, once GitHub issues
   the certificate.
3. **Verify the domain on GitHub:** at github.com/settings/pages, click "Add a
   domain", then put the TXT record it shows into Cloudflare.
4. **Email anti-spoofing in Cloudflare:** add `TXT @ v=spf1 -all` and
   `TXT _dmarc v=DMARC1; p=reject;`.
5. **Supabase:**
   - URL configuration: Site URL `https://rationalbonding.com/chess3d/`,
     redirect `https://rationalbonding.com/**`.
   - Connect an email sender such as Resend, since Supabase's built-in email
     only reaches the project team.
   - Turn on whichever social logins he wants.
   - Send Claude the **publishable key**, which turns accounts on in
     `chess3d/config.js`.
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
- Fill in `chess3d/config.js` with the Supabase URL and key, and test signing in
  on the live site.
- After the domain is confirmed working, check the passkey and Supabase
  settings against `SETUP.md`.
- Launch page for the **illustrated *Tale of the Beer Tycoon*** (almost done:
  two pages left), linked from the blog post and the homepage.

## Ideas
- **Server-side move validation:** a Supabase Edge Function that runs `rules.js`.
- **Ratings** (Elo or Glicko) per time control, plus leaderboards.
- **Game features:** draw offers, takebacks in casual games, and
  first-move-timeout auto-aborts.
- **Security and accounts:** account deletion and data export; CAPTCHA on
  sign-up (hCaptcha or Turnstile).
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
  The old page references a `jquery.js` file that doesn't exist.
