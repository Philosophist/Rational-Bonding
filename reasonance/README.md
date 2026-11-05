# Reasonance

An argument-mapping app: every statement (node) and every inference (arrow) is
a post, and an arrow can point at another arrow, so people can support or
contend the reasoning itself, not just the facts.

Step 1 of the plan: the map editor. It runs as a guest and saves maps in the
browser (`localStorage`). Accounts, shared posts, the 3D sea of posts and the
feed come in later steps.

## Rules of the map
- **Direction:** arrows run from a claim out to its reasons. The label and
  sentence read from the reason: `'The sidewalk is wet' supports 'It rained'`.
- **Unsupported claims** show a standing contention, "No support has been given
  for this claim", until a support arrow is added. **Axioms** keep a permanent
  one: "Held as an axiom: no support is claimed."
- **Fallacy nodes** are definitions ("A Straw man fallacy is when an argument
  ..."). Arrows to them are always "example of" arrows:
  `'A' is an example of a Straw man fallacy`.
- **Combined premises** nodes join premises numbered 1, 2a, 2b...
- **Ratings** on any post: stance, confidence 0–100 (decimals allowed, with a
  log-scale slider) and 1–5 star relevance. Every change is kept with its date.

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
