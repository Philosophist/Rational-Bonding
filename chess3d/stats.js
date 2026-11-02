// Personal stats from a player's saved games. Pure: takes game rows (as stored
// in the `games` table) and a player id.
import { category } from './clock.js';

const blank = () => ({ played: 0, wins: 0, losses: 0, draws: 0 });
const tally = (t, outcome) => {
  t.played++;
  t[outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws']++;
};

export function outcomeFor(game, me) {
  if (game.result === 'draw') return 'draw';
  const myColor = game.white === me ? 'white' : 'black';
  return game.result === myColor ? 'win' : 'loss';
}

// Only finished online games against someone else count.
export const counts = (g, me) =>
  g.kind === 'online' && g.status === 'finished' && g.result && (g.white === me || g.black === me) && g.white !== g.black;

export function computeStats(games, me) {
  const rated = games.filter((g) => counts(g, me)).sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
  const s = {
    total: blank(),
    byCategory: {},
    byMode: {},
    byColor: { white: blank(), black: blank() },
    winsBy: {},
    lossesBy: {},
    streak: { current: 0, best: 0, type: null },
    longest: 0,
    averageLength: 0,
    opponents: {},
  };
  let run = 0, plies = 0;
  for (const g of rated) {
    const o = outcomeFor(g, me);
    tally(s.total, o);
    const cat = category(g.time_control || { type: 'none' });
    tally((s.byCategory[cat] ??= blank()), o);
    tally((s.byMode[g.rules?.mode || 'classic'] ??= blank()), o);
    tally(s.byColor[g.white === me ? 'white' : 'black'], o);
    if (o === 'win') s.winsBy[g.reason] = (s.winsBy[g.reason] || 0) + 1;
    if (o === 'loss') s.lossesBy[g.reason] = (s.lossesBy[g.reason] || 0) + 1;
    run = o === 'win' ? run + 1 : 0;
    s.streak.best = Math.max(s.streak.best, run);
    const n = (g.moves || []).length;
    plies += n;
    s.longest = Math.max(s.longest, Math.ceil(n / 2));
    const opp = g.white === me ? g.black : g.white;
    if (opp) tally((s.opponents[opp] ??= blank()), o);
  }
  s.streak.current = run;
  s.averageLength = rated.length ? Math.round(plies / rated.length / 2) : 0;
  s.winRate = s.total.played ? Math.round((100 * s.total.wins) / s.total.played) : 0;
  return s;
}
