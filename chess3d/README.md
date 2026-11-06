# Cube Chess 8×8×8

A 3D chess game played in an 8×8×8 cube, in the browser, against a friend online or on the same screen.

**Play:** open `chess3d/index.html` from the site (e.g. `https://rationalbonding.com/chess3d/` once this is on the published branch). It's static HTML/JS, so it works on GitHub Pages with no server.

## Accounts (optional)
Once accounts are turned on (see **[SETUP.md](SETUP.md)**), players can sign in to get:
- **a profile** with a username, and the ability to **follow** other players and **challenge** them
- **saved games**: online games against other players, plus same-screen games, with a move-by-move **replay**
- **personal stats**: win rate, results by time control, mode and colour, how games were won and lost, streaks, game length, and most-played opponents
- **Daily games** (days per move), so you can play a move and come back tomorrow

**Ways to sign in:**
- **passkeys** (the open WebAuthn standard: fingerprint, face or PIN, no password)
- an emailed sign-in link or code
- email and password
- GitLab, Keycloak, Google, Apple, Microsoft, GitHub, Discord and the other Supabase providers
- phone codes
- Ethereum or Solana wallets

Only the methods you switch on in Supabase are shown.

Guests can still play everything except Daily games. They have no profile, and their games aren't saved.

Account games are stored in Supabase. The server checks that each move comes from the player whose turn it is, and keeps the clocks itself, so nobody can fake their time.

## Time controls
These match chess.com's options, chosen in the **Game rules** panel or when sending a challenge:
- **Bullet:** 30 sec, 1 min, 1 | 1, 2 | 1
- **Blitz:** 3 min, 3 | 2, 5 min, 5 | 5
- **Rapid:** 10 min, 10 | 5, 15 | 10, 20 min, 30 min, 60 min
- **Daily** (account games only): 1, 2, 3, 5, 7 or 14 days per move
- **Custom:** any number of minutes plus an increment, or no clock

The rules follow chess.com:
- Clocks start once each side has made its first move. Until then either player can **abort**, and the game doesn't count.
- The increment is added after each move.
- Running out of time loses the game. It's a draw instead if the opponent couldn't possibly checkmate, for example with only a king, or a king and one bishop or knight.

## Playing online
1. Click **Online → Create game**. You get a 6-letter room code and an invite link.
2. Send the link to your friend (or have them type the code and click **Join**).
3. The host plays White first. **New game** starts a rematch with colours swapped.

Connections are peer-to-peer (WebRTC via [PeerJS](https://peerjs.com); its free public server only introduces the two browsers). If either player refreshes, the game reconnects and resyncs. The host's browser keeps the game, so the host should keep the tab open (a refresh is fine).

Some strict corporate or mobile networks block peer-to-peer connections; if joining hangs at "Connecting…", try a different network.

## Controls
- Click a piece to highlight its moves: green dots = moves, red bubbles = captures. Selecting an opponent's piece shows its moves in blue, so you can check threats. A selected pawn also puts small red-pink dots on the empty squares it attacks, where it could capture if an enemy stepped there. In Relative mode the selected piece's own board (the plane of its facing and its left and right, tilted through the cube when it faces a diagonal) is drawn in bright neon teal lines. With nothing selected, the board the side to move's king stands on (the starting diagonal) stays visible, a little dimmer.
- Drag to orbit, scroll (or pinch on a trackpad) to zoom toward the pointer, right-drag to pan.
- Keyboard: <kbd>+</kbd> / <kbd>−</kbd> (or Page Up / Page Down) zoom, arrow keys or <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> pan, <kbd>Q</kbd> / <kbd>E</kbd> turn around the cube. Hold a key to keep moving. In a replay, ← and → still step through the moves.
- The **+** and **−** buttons at the top right of the view zoom too.
- The **⌖** button under them (or <kbd>R</kbd> / Home) glides back to the starting view.
- Selecting a piece turns the camera to frame it and every square it can reach. Turn this off with "Turn the camera to a piece when you select it" in the game options.
- **Focus level** (or <kbd>[</kbd> <kbd>]</kbd>, <kbd>0</kbd> for all) fades the other levels so one layer is easy to read.
- The **Level map** button at the bottom left opens all 8 levels as flat boards (hidden by default; the page remembers if you leave it open). A selected piece's moves are filled in there too: green moves and red captures for your piece, blue for a preview. You can click squares there too.

## Rules
Squares are named file + rank + level, e.g. `e1A` (levels go A to H, bottom to top).

- **Setup:** White's back rank is on the bottom near edge (rank 1, level A), with its pawns one step diagonally toward the enemy (rank 2, level B). Black mirrors this on the opposite edge (rank 8, level H; pawns on rank 7, level G). The pieces keep their usual order, so the kings face each other along the e-file.
- **Rook:** any distance along one axis (6 directions), and, in Classic mode by default, any distance along a flat diagonal, where two coordinates change but never all three (12 more). The diagonal move can be switched off in the rules panel.
- **Bishop:** any distance along any diagonal: within a flat plane (including planes that cross levels) or corner to corner through the cube (20 directions). Unlike flat chess, a bishop can change square colour.
- **Queen:** rook + bishop, so any straight line (26 directions).
- **King:** one step in any of 26 directions.
- **Castling** works the same on both sides. The rook moves two squares along the back rank toward the king, and the king jumps to just past it. The king can land in line with the rook, or one diagonal step off that line: one square up a rank or up a level as well, onto an empty square.
  - King side, White: rook h1A→f1A, king lands on g1A, g2A or g1B.
  - Queen side, White: rook a1A→c1A, king lands on b1A, b2A or b1B.
  - Neither piece may have moved, every square between them must be empty, and the king may not be in check, pass through an attacked square on its way to the rook's new square, or land in check.
- **Knight:** 2 along one axis and 1 along another (24 jumps).
- **Pawn:** forward means both up the ranks and up the levels toward the enemy. It moves straight 1 step (2 on its first move) along either, and can't capture straight ahead. It captures one diagonal step (any bishop direction) that goes forward on at least one of those axes, e.g. forward a rank while dropping a level. So two pawns meeting head-on across levels can take each other instead of just blocking.
  - **Up-forward** (forward a rank and up a level at once, toward the enemy edge; down-forward for Black) is both forward and diagonal. Along it a pawn can move *or* capture 1 square, or 2 squares on its first move if the square in between is empty.
  - It promotes on reaching the enemy's back-rank edge.
- Check, checkmate, stalemate, insufficient material and the 50-move rule all apply.
- There is deliberately **no en passant**.

## Rule modes
Pick these in the **Game rules** panel. New games start in **Relative** mode; Classic is one click away, and the panel remembers your last choice. Rules can be changed until the first move. Online, the host picks them.

### Classic
All pieces use the board's own axes, as described above.
- Toggle: **Rooks also slide along flat diagonals** (on by default).

### Relative
Every piece faces a direction, and space is relative to it. Its own three straight axes are its facing and the two directions square to it. Both armies start facing each other across the cube's diagonal: White faces up the ranks and levels at once (→8H), and Black faces back down (→1A).

- On a cube grid only four sets of three square axes exist. One is the board's own axes. The other three are the board turned 45° about one axis: that axis stays, and the other two become the diagonals of the cross-section. Facing along an axis, a piece can be square to the board or turned 45° (◇); facing a flat diagonal, it is turned. A piece may also face a corner (all three coordinates change). No square frame exists then: its own lines are the corner line plus the six touching directions square to it, which form a hexagon. So every one of the 26 king directions is a facing.
- A piece facing a flat diagonal, such as the starting facing, has as its straight lines the file and the two diagonals of its rank/level plane. Those diagonals are straight lines for it.
- **Rook:** any distance along its own three axes.
- **Pawn:** like Classic, a pawn has several forwards: straight ahead along its facing, and its own up and down. It moves 1 square along any of them, or 2 on its first move. From the start, facing the diagonal, its up (a rank back, a level up) and its down (a rank on, a level down) reach the edge of the cube after one square. It captures one diagonal step that combines one of those forwards with a sideways step (or, for its facing, an up or down step), never backwards. By default it may face any direction; switch off **Pawns may face any direction** to let it face only toward the enemy. It promotes on the enemy's back-rank edge as usual.
- **Bishop** (toggle **Bishops move on every line except their own axes**, on by default): it slides along every straight line of touching cubes (face, edge or corner contact, the king's 26 steps) except its own axes. That is 20 directions (18 facing a corner). Square to the board it is the classic bishop. From the start, facing the diagonal, it moves toward h8H and a8H and back, up and down the levels, along the ranks, and more, but not along its forward axis (toward 8H), its sideways (toward a/h) or its up/down. Nothing skips a square.
- **Corner facings:** a rook slides along its corner line and the six hexagon directions; a pawn moves along its facing and its own up/down and captures on the six touching squares nearest straight ahead; a knight leaps 2 along one of those lines and 1 along a perpendicular one.
- **View options** (this device only): *Show move paths* outlines the chain of touching cubes for each move of the selected piece. Knights jump, so they get a solid line to each landing square and a dotted L (two squares along one of their own axes, then one at right angles), with the cubes of the L outlined. *Show the hexagon* highlights the six touching cubes and the triangle grid around a corner-facing piece.
- **Knight** (toggle **Knights leap along their own axes**, on by default): 2 along one of its own axes and 1 along another. Facing the starting diagonal, its forward is a diagonal step and only its left/right stays a single board axis, so it leaps like (1, 2, 2), (2, 1, 1) or, with both legs diagonal, (0, 1, 3).
- After you move a piece whose moves depend on its facing, labelled blocks appear around it, one for each way it can face. Click one to preview where it could go next. For a straight facing, click the same block again to turn it 45° (◇). Then confirm, or press Enter. Queens and kings move as in Classic and keep their facing.
- Other toggles: **Turned rooks keep the board's straight lines too**, and **Pawns may face any direction**.
- Move notation adds the new facing, e.g. `e2B-e3C →8`: files a/h, ranks 1/8, levels A/H.

## Development
```
npm test        # rules, clock and stats tests (Node 18+)
npm run serve   # local static server on :8080
```
- `rules.js` is the rules engine, with no DOM code. `clock.js` handles time controls and `stats.js` computes stats; both are pure modules.
- `main.js` is the three.js client. `net.js` handles guest link play.
- `account.js` and `accountui.js` handle accounts.
- The database is defined by the migrations in `supabase/migrations/`. Supabase's GitHub integration applies them when they reach master.
- `npm run test:db` runs the database security tests against a Supabase instance (see SETUP.md).
