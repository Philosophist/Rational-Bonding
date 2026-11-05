# Reasonance

An argument-mapping app: every statement (node) and every inference (arrow) is
a post, and an arrow can point at another arrow, so people can support or
contend the reasoning itself, not just the facts.

Steps 1 and 2 of the plan: the map editor and accounts. As a guest it saves
maps in the browser (`localStorage`). Signed in with the shared Rational
Bonding account, maps are also saved to the account (`rs_maps`), any item can
be posted publicly (`rs_posts`), and ratings of posted items are saved
privately with their dated history (`rs_ratings`, `rs_rating_history`). Only
the totals per post are public (`rs_post_stats`). The 3D sea of posts and the
feed come in later steps.

## Posting
- A draft lives only in your map. "Post it" publishes it under your username
  (or anonymously, if you tick "Post Anonymously"); posting an arrow
  also posts any draft ends it needs.
- **Every post is unique.** The same words (ignoring case, spacing, quotes and
  end punctuation), or the same arrow between the same two posts, can be
  posted only once (`rs_post_key`, a unique index). Statements, axioms and
  clarifications share words; questions and fallacies are compared on their
  own. If it's already posted, the map uses that post instead. A statement
  that shares most of its words with an existing one (`rs_similar`) is held
  back with "Is it one of these?" until its author picks one, adds a
  clarification, or says theirs is different.
- **Pulling from public posts:** signed in, the overview has "Add from public
  posts" (search), and a posted statement has "Bring in its posted reasons",
  so a private map can be built from what's already posted.
- **Views** are private unless shared, one by one ("Share my view publicly")
  or by default (the account menu). The history of a view is always private.
- You can edit a post's words until someone else rates it. Then they freeze
  (the database refuses the change), so nobody can change what people agreed
  with. Flipping an arrow is always allowed.
- Deleting: "Remove from map" keeps the post; "Delete the post itself" works
  only while nobody else has rated it and no arrow points at it.
- Undo never un-posts: `map.posts` (item id to post id) sits outside the undo
  snapshots.

## Rules of the map
- **One post, one statement.** A post that reads like several statements gets a
  warning and a one-click split into premises joined by a combined-premises
  node (`compoundParts`, `splitIntoPremises`). The example map follows this.
- **Direction:** arrows run from a claim out to its reasons, labelled Support,
  Contention, Question or Clarification:
  `'It rained' is supported by 'The sidewalk is wet'`.
- **Means the same** is a two-way arrow for rewordings and translations ("IOW = translation = means the same thing"): `'A' means the same thing as 'B'`. A rewording shares the support of what it rewords. ("Suggests" arrows were dropped; old maps load them as Questions.)
- **Unsupported claims** get an automatic post, in bright pink, joined by a
  Contention arrow: "'X' is not yet supported." It disappears once a Support
  arrow is added. It is drawn, not stored. In the social app it should appear
  only when no support exists anywhere, not just in one sandbox. **Axioms**
  keep a permanent one: "'X' is held as an axiom, with no support claimed."
- **Fallacy nodes** are definitions ("A Straw man fallacy is when an argument
  ..."), drawn in neon purple. Arrows to them are labelled "Fallacy":
  `'A' is an example of a Straw man fallacy`.
- **Examples:** the map menu has "Load an example here" (rain, bike lanes, round Earth). Loading one replaces the current map, and Undo brings it back.
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
| `app.js` | SVG board, panel, saving, import/export, the account and posting |
| `cloud.js` | Supabase calls: saved maps, posts, ratings, totals |
| `test/db/` | Database tests for the `rs_*` migration on a plain Postgres |
| `index.html`, `style.css` | The page |

Arrowheads are drawn as plain triangles, not SVG `<marker>` references, so
they show wherever the page is hosted.

## Testing
```
cd reasonance && npm test
# database rules, on any Postgres 15+ (a stub stands in for Supabase's auth):
PSQL="psql -h <socket dir> -p <port> -U postgres" sh test/db/run.sh
```

## Example posts
The three examples (rain, bike lanes, round Earth) are also real public
posts, signed by a "Claude" account, so the public system isn't empty
(`chess3d/supabase/migrations/20261105200000_reasonance_examples.sql`,
written by `node reasonance/tools/seed-examples.mjs`). The Claude account has
no email, phone or password and is banned from signing in; it only signs
these posts. To add more, write a new, later-dated migration the same way.
