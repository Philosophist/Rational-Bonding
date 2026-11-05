# Reasonance

An argument-mapping app: every statement (node) and every inference (arrow) is
a post, and an arrow can point at another arrow, so people can support or
contend the reasoning itself, not just the facts.

Step 1 of the plan: the map editor. It runs as a guest and saves maps in the
browser (`localStorage`). Accounts, shared posts, the 3D sea of posts and the
feed come in later steps.

## Rules of the map
- **One post, one statement.** A post that reads like several statements gets a
  warning and a one-click split into premises joined by a combined-premises
  node (`compoundParts`, `splitIntoPremises`). The example map follows this.
- **Direction:** arrows run from a claim out to its reasons, labelled Support,
  Contention, Question or Clarification:
  `'It rained' is supported by 'The sidewalk is wet'`.
- **Unsupported claims** get an automatic post, in bright pink, joined by a
  Contention arrow: "'X' is not yet supported." It disappears once a Support
  arrow is added. It is drawn, not stored. In the social app it should appear
  only when no support exists anywhere, not just in one sandbox. **Axioms**
  keep a permanent one: "'X' is held as an axiom, with no support claimed."
- **Fallacy nodes** are definitions ("A Straw man fallacy is when an argument
  ..."), drawn in neon purple. Arrows to them are labelled "Fallacy":
  `'A' is an example of a Straw man fallacy`.
- **Connecting:** select a post, then Shift- or Ctrl-click a second post or arrow label. The panel offers each arrow type; the arrow points from the first pick to the second.
- **Combined premises** nodes join premises numbered 1, 2a, 2b... On the map a combined-premises node is a small round plus sign; hover or click it to see its words.
- **Ratings** on any post: stance, confidence 0–100 (decimals allowed, with a
  log-scale slider) and 1–5 star relevance. Every change is kept with its date.

- **Copying:** the panel has a Copy text button for every post, and the words of
  the selected post can be selected by hand (drag it by its edge instead).

## Files
| File | Role |
|---|---|
| `model.js` | The map rules, with no DOM code |
| `fallacies.js` | The built-in fallacy library |
| `app.js` | SVG board, panel, saving, import/export |
| `index.html`, `style.css` | The page |

Arrowheads are drawn as plain triangles, not SVG `<marker>` references, so
they show wherever the page is hosted.

## Testing
```
cd reasonance && npm test
```
