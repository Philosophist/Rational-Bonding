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
- **Rook:** any distance along one axis (6 directions).
- **Bishop:** any distance diagonally within a plane (12 directions).
- **Queen:** any straight line, including the 8 space diagonals (26 directions).
- **King:** one step in any of 26 directions. Castles along its back rank under the normal rules.
- **Knight:** 2 along one axis and 1 along another (24 jumps).
- **Pawn:** forward means both up the ranks and up the levels toward the enemy. It moves 1 step (2 on its first move) along either. It captures one forward step plus one file sideways, or one step diagonally forward in both. It promotes on reaching the enemy's back-rank edge.
- Check, checkmate, stalemate, insufficient material and the 50-move rule all apply. There is no en passant.

## Development
```
npm test        # rules engine tests (Node 18+)
npm run serve   # local static server on :8080
```
`rules.js` is the rules engine (no DOM), `main.js` is the three.js client, and `net.js` handles online play.
