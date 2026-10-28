# Cube Chess 8×8×8

A 3D chess game played in an 8×8×8 cube, in the browser, against a friend online or on the same screen.

**Play:** open `chess3d/index.html` from the site (e.g. `https://rationalbonding.com/chess3d/` once this is on the published branch). It's static HTML/JS, so it works on GitHub Pages with no server.

## Playing online
1. Click **Online → Create game**. You get a 6-letter room code and an invite link.
2. Send the link to your friend (or have them type the code and click **Join**).
3. The host plays White first. **New game** starts a rematch with colours swapped.

Connections are peer-to-peer (WebRTC via [PeerJS](https://peerjs.com); its free public server only introduces the two browsers). If either player refreshes, the game reconnects and resyncs. The host's browser keeps the game, so the host should keep the tab open (a refresh is fine).

Some strict corporate or mobile networks block peer-to-peer connections; if joining hangs at "Connecting…", try a different network.

## Controls
- Click a piece to highlight its moves: green dots = moves, red bubbles = captures. Selecting an opponent's piece shows its moves in blue, so you can check threats.
- Drag to orbit, scroll to zoom, right-drag to pan.
- **Focus level** (or <kbd>[</kbd> <kbd>]</kbd>, <kbd>0</kbd> for all) fades the other levels so one layer is easy to read.
- The **Level map** along the bottom shows all 8 levels as flat boards. You can click squares there too.

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
Pick these in the **Game rules** panel. They can be changed until the first move. Online, the host picks them.

### Classic
All pieces use the board's own axes, as described above.
- Toggle: **Rooks also slide along flat diagonals** (on by default).

### Relative
Every piece faces a direction, and space is relative to it. Its own three straight axes are its facing and the two directions square to it. Both armies start facing each other across the cube's diagonal: White faces up the ranks and levels at once (→8H), and Black faces back down (→1A).

- On a cube grid only four sets of three square axes exist. One is the board's own axes. The other three are the board turned 45° about one axis: that axis stays, and the other two become the diagonals of the cross-section. So a piece can face along an axis or a flat diagonal, but not corner to corner. Facing along an axis, it can be square to the board or turned 45° (◇).
- A piece facing a flat diagonal, such as the starting facing, has as its straight lines the file and the two diagonals of its rank/level plane. Those diagonals are straight lines for it.
- **Rook:** any distance along its own three axes.
- **Pawn:** straight ahead along its facing, 1 square (2 on its first move). It captures one step ahead-and-sideways in its own frame. By default it may only face toward the enemy. It promotes on the enemy's back-rank edge as usual.
- **Bishop** (toggle **Bishops move along their own diagonals**, on by default): it moves along every diagonal of its own frame, flat or corner to corner. Square to the board it is the classic bishop. Turned 45°, as every piece is at the start, the board's rank and level axes become diagonals for it, two squares at a time with nothing in between to block, and its corner-to-corner lines run like (1, 2, 0). A bishop has 20 directions in every frame and a rook has 6, so no facing makes one into the other.
- **Knight** (toggle **Knights leap along their own axes**, off by default): 2 along one of its own axes and 1 along another. With a diagonal axis that gives leaps like (2, 1, 1), and with both legs diagonal, (0, 1, 3).
- After you move a piece whose moves depend on its facing, you choose its new facing. The picker previews where it could go next. Queens and kings move as in Classic and keep their facing.
- Other toggles: **Turned rooks keep the board's straight lines too**, and **Pawns may face any direction**.
- Move notation adds the new facing, e.g. `e2B-e3C →8`: files a/h, ranks 1/8, levels A/H.

## Development
```
npm test        # rules engine tests (Node 18+)
npm run serve   # local static server on :8080
```
`rules.js` is the rules engine (no DOM), `main.js` is the three.js client, and `net.js` handles online play.
