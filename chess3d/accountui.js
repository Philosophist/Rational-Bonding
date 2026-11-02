// Account panels and dialogs: sign-in, username, profile (stats, games,
// following, find players, security) and challenges. Talks to account.js; the
// game itself is reached through the hooks main.js passes in.
import * as acct from './account.js';
import { computeStats, outcomeFor } from './stats.js';
import { PRESETS, DAILY_DAYS, tcLabel, tcKey, parseTcKey } from './clock.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter((k) => k !== null && k !== undefined && k !== false));
  return e;
};
const REASONS = {
  checkmate: 'checkmate', resignation: 'resignation', timeout: 'time', stalemate: 'stalemate',
  'insufficient material': 'insufficient material', '50-move rule': '50-move rule',
  'timeout vs insufficient material': 'time vs insufficient material',
};
const CATS = ['bullet', 'blitz', 'rapid', 'daily', 'untimed'];
const pct = (t) => (t.played ? Math.round((100 * t.wins) / t.played) : 0);
const wld = (t) => `${t.wins}W ${t.losses}L ${t.draws}D`;

let hooks;
let names = {}; // id -> username cache
let myGames = [];
let unwatchMine = null;

export async function setup(h) {
  hooks = h;
  if (!acct.configured()) return; // guest-only site: no account UI at all
  $('account-box').hidden = false;
  $('account-status').textContent = 'Connecting…';
  try {
    await acct.init();
  } catch (e) {
    $('account-status').textContent = `Accounts unavailable: ${e.message}`;
    return;
  }
  acct.onChange(onAccountChange);
  onAccountChange(acct.state);
  wireDialogs();
}

export const signedIn = () => !!(acct.state.user && acct.state.profile);
export const me = () => acct.state.user?.id;
export const nameOf = (id) => names[id]?.username || '…';

async function onAccountChange(s) {
  unwatchMine?.();
  unwatchMine = null;
  const box = $('account-body');
  box.innerHTML = '';
  if (!s.user) {
    $('account-status').textContent = '';
    box.append(
      el('p', { className: 'guest-note', textContent: 'Playing as a guest: you have no profile and your games aren’t saved.' }),
      el('button', { className: 'primary', textContent: 'Sign in or create an account', onclick: openAuth }),
    );
    hooks.accountChanged();
    return;
  }
  if (!s.profile) {
    $('account-status').textContent = '';
    box.append(el('p', { textContent: 'One more step: choose a username.' }), el('button', { className: 'primary', textContent: 'Choose username', onclick: openUsername }));
    openUsername();
    hooks.accountChanged();
    return;
  }
  names[s.user.id] = s.profile;
  $('account-status').textContent = '';
  box.append(
    el('div', { className: 'acct-row' },
      el('strong', { textContent: '@' + s.profile.username }),
      el('span', { className: 'acct-actions' },
        el('button', { textContent: 'Profile', onclick: () => openProfile(s.user.id) }),
        el('button', { textContent: 'Sign out', onclick: () => acct.signOut() }))),
    el('div', { id: 'acct-live' }),
  );
  unwatchMine = acct.watchMine((row) => {
    hooks.gameUpdated(row);
    refreshLive();
  });
  await refreshLive();
  hooks.accountChanged();
}

// Challenges and games in progress, shown under the account name.
async function refreshLive() {
  const box = $('acct-live');
  if (!box || !signedIn()) return;
  try {
    myGames = await acct.gamesOf(me(), 200);
  } catch (e) {
    box.textContent = e.message;
    return;
  }
  Object.assign(names, await acct.profilesById(myGames.flatMap((g) => [g.white, g.black]).filter((id) => !names[id])));
  box.innerHTML = '';
  const pending = myGames.filter((g) => g.status === 'pending' && g.kind === 'online');
  const active = myGames.filter((g) => g.status === 'active' && g.kind === 'online');
  for (const g of pending) {
    const opp = g.white === me() ? g.black : g.white;
    const mine = g.created_by === me();
    const desc = `${tcLabel(g.time_control)} · ${g.rules.mode === 'relative' ? 'Relative' : 'Classic'} · you play ${g.white === me() ? 'White' : 'Black'}`;
    box.append(el('div', { className: 'acct-item' },
      el('div', {}, mine ? 'Challenge sent to ' : 'Challenge from ', el('b', { textContent: '@' + nameOf(opp) }), el('div', { className: 'muted', textContent: desc })),
      mine
        ? el('button', { textContent: 'Cancel', onclick: () => act(() => acct.answerChallenge(g.id, false)) })
        : el('span', {},
          el('button', { className: 'primary', textContent: 'Accept', onclick: () => act(async () => hooks.openGame(await acct.answerChallenge(g.id, true))) }),
          el('button', { textContent: 'Decline', onclick: () => act(() => acct.answerChallenge(g.id, false)) }))));
  }
  for (const g of active) {
    const opp = g.white === me() ? g.black : g.white;
    const myTurn = (g.moves.length % 2 === 0) === (g.white === me());
    box.append(el('div', { className: 'acct-item' + (myTurn ? ' my-turn' : '') },
      el('div', {}, 'vs ', el('b', { textContent: '@' + nameOf(opp) }), el('div', { className: 'muted', textContent: `${tcLabel(g.time_control)} · ${myTurn ? 'your move' : 'their move'}` })),
      el('button', { className: myTurn ? 'primary' : '', textContent: 'Open', onclick: () => hooks.openGame(g) })));
  }
}

async function act(fn) {
  try {
    await fn();
  } catch (e) {
    hooks.notify(e.message);
  }
  refreshLive();
}

// ---------------------------------------------------------------- sign-in dialog
function openAuth() {
  const d = $('auth-dialog');
  const body = $('auth-body');
  body.innerHTML = '';
  const m = acct.methods();
  const msg = el('div', { className: 'auth-msg' });
  const run = (fn) => async (e) => {
    e?.preventDefault?.();
    msg.textContent = '';
    msg.className = 'auth-msg';
    try {
      const out = await fn();
      if (out) {
        msg.textContent = out;
        msg.classList.add('ok');
      } else d.close();
    } catch (err) {
      msg.textContent = err.message || String(err);
      msg.classList.add('err');
    }
  };

  if (m.passkey) {
    body.append(el('section', { className: 'auth-sec' },
      el('button', { className: 'primary wide', textContent: '🔑 Sign in with a passkey', onclick: run(async () => { await acct.signInWithPasskey(); }) }),
      el('p', { className: 'muted', textContent: 'No password: your device’s fingerprint, face or PIN. Built on the open WebAuthn standard. New here? Create an account below, then add a passkey from your profile.' })));
  }
  if (m.providers.length) {
    body.append(el('section', { className: 'auth-sec' },
      el('div', { className: 'auth-label', textContent: 'Continue with' }),
      el('div', { className: 'provider-grid' },
        ...m.providers.map(([id, label]) => el('button', { textContent: label, onclick: run(async () => { await acct.signInWithProvider(id); return 'Redirecting…'; }) })))));
  }
  if (m.ethereum || m.solana) {
    body.append(el('section', { className: 'auth-sec' },
      el('div', { className: 'auth-label', textContent: 'Crypto wallet' }),
      el('div', { className: 'provider-grid' },
        m.ethereum && el('button', { textContent: 'Ethereum wallet', onclick: run(() => acct.signInWithWallet('ethereum')) }),
        m.solana && el('button', { textContent: 'Solana wallet', onclick: run(() => acct.signInWithWallet('solana')) }))));
  }
  if (m.email) {
    const email = el('input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'username webauthn', required: true });
    const code = el('input', { inputMode: 'numeric', placeholder: 'code from the email', autocomplete: 'one-time-code' });
    const codeRow = el('form', { className: 'row', hidden: true }, code, el('button', { textContent: 'Verify' }));
    codeRow.onsubmit = run(() => acct.verifyEmailCode(email.value.trim(), code.value.trim()));
    const pw = el('input', { type: 'password', placeholder: 'password (8+ characters)', autocomplete: 'current-password', minLength: 8 });
    body.append(el('section', { className: 'auth-sec' },
      el('div', { className: 'auth-label', textContent: 'Email' }),
      email,
      el('div', { className: 'row' },
        el('button', { textContent: 'Email me a sign-in link', onclick: run(async () => {
          if (!email.reportValidity()) return 'Enter your email first.';
          await acct.sendEmailCode(email.value.trim());
          codeRow.hidden = false;
          return 'Check your email and click the link. If the email shows a code, you can type it here instead.';
        }) })),
      codeRow,
      el('details', {},
        el('summary', { textContent: 'Use a password instead' }),
        pw,
        el('div', { className: 'row' },
          el('button', { textContent: 'Sign in', onclick: run(async () => { await acct.signInWithPassword(email.value.trim(), pw.value); }) }),
          !m.signupDisabled && el('button', { textContent: 'Create account', onclick: run(async () => {
            const r = await acct.signUpWithPassword(email.value.trim(), pw.value);
            return r.session ? null : 'Check your email to confirm your account.';
          }) }),
          el('button', { className: 'link', textContent: 'Forgot password?', onclick: run(async () => {
            await acct.sendPasswordReset(email.value.trim());
            return 'Password reset email sent.';
          }) })))));
  }
  if (m.phone) {
    const phone = el('input', { type: 'tel', placeholder: '+1 555 123 4567', autocomplete: 'tel' });
    const code = el('input', { inputMode: 'numeric', placeholder: 'code from the text', autocomplete: 'one-time-code' });
    body.append(el('section', { className: 'auth-sec' },
      el('div', { className: 'auth-label', textContent: 'Phone' }),
      el('div', { className: 'row' }, phone, el('button', { textContent: 'Text me a code', onclick: run(async () => { await acct.sendPhoneCode(phone.value.trim()); return 'Code sent.'; }) })),
      el('div', { className: 'row' }, code, el('button', { textContent: 'Verify', onclick: run(() => acct.verifyPhoneCode(phone.value.trim(), code.value.trim())) }))));
  }
  body.append(msg);
  d.showModal();
}

// ---------------------------------------------------------------- username
function openUsername() {
  const d = $('username-dialog');
  const input = $('username-input');
  const msg = $('username-msg');
  msg.textContent = '';
  input.value = acct.state.profile?.username || suggestName();
  $('username-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      if (acct.state.profile) await acct.renameProfile(input.value.trim());
      else await acct.createProfile(input.value.trim());
      d.close();
      if (acct.methods().passkey) offerPasskey();
    } catch (err) {
      msg.textContent = /duplicate|unique/i.test(err.message) ? 'That username is taken.' : /check/i.test(err.message) ? '3–20 letters, numbers or _.' : err.message;
    }
  };
  if (!d.open) d.showModal();
}
function suggestName() {
  const u = acct.state.user;
  const base = (u?.user_metadata?.user_name || u?.user_metadata?.preferred_username || u?.email?.split('@')[0] || 'player').replace(/[^A-Za-z0-9_]/g, '');
  return (base.length >= 3 ? base : base + 'player').slice(0, 20);
}

async function offerPasskey() {
  try {
    if ((await acct.listPasskeys()).length) return;
  } catch {
    return;
  }
  if (confirm('Add a passkey? Next time you can sign in with your fingerprint, face or PIN, no password.')) {
    try {
      await acct.registerPasskey();
      hooks.notify('Passkey added.');
    } catch (e) {
      hooks.notify(e.message);
    }
  }
}

// ---------------------------------------------------------------- profile
async function openProfile(id) {
  const d = $('profile-dialog');
  const body = $('profile-body');
  body.innerHTML = 'Loading…';
  if (!d.open) d.showModal();
  const self = id === me();
  const [profile, games, follows, followers, myFollows] = await Promise.all([
    acct.getProfile(id), acct.gamesOf(id), acct.following(id), acct.followerCount(id), self ? null : acct.following(me()),
  ]);
  if (!profile) {
    body.textContent = 'Player not found.';
    return;
  }
  names[id] = profile;
  Object.assign(names, await acct.profilesById(games.flatMap((g) => [g.white, g.black]).filter((x) => !names[x])));
  const s = computeStats(games, id);
  const iFollow = !self && myFollows.some((p) => p.id === id);

  const header = el('div', { className: 'pf-head' },
    el('h2', { textContent: '@' + profile.username }),
    el('div', { className: 'muted', textContent: `Joined ${new Date(profile.created_at).toLocaleDateString()} · ${followers} follower${followers === 1 ? '' : 's'} · following ${follows.length}` }),
    el('div', { className: 'row' },
      self && el('button', { textContent: 'Change username', onclick: () => { d.close(); openUsername(); } }),
      !self && el('button', { className: iFollow ? '' : 'primary', textContent: iFollow ? 'Unfollow' : 'Follow', onclick: async () => {
        await (iFollow ? acct.unfollow(id) : acct.follow(id)).catch((e) => hooks.notify(e.message));
        openProfile(id);
      } }),
      !self && el('button', { textContent: 'Challenge', onclick: () => openChallenge(id) })));

  const tabs = el('div', { className: 'tabs pf-tabs' });
  const pane = el('div', { className: 'pf-pane' });
  const views = {
    Stats: () => statsView(s),
    Games: () => gamesView(games, id),
    Following: () => peopleView(follows),
    ...(self ? { 'Find players': () => findView(), Security: () => securityView() } : {}),
  };
  for (const [name, fn] of Object.entries(views)) {
    const b = el('button', { textContent: name, onclick: () => {
      tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      pane.innerHTML = '';
      pane.append(fn());
    } });
    tabs.append(b);
  }
  body.innerHTML = '';
  body.append(header, tabs, pane);
  tabs.firstChild.click();
}

function statsView(s) {
  const card = (label, value, sub) => el('div', { className: 'stat' }, el('div', { className: 'stat-v', textContent: value }), el('div', { className: 'stat-l', textContent: label }), sub && el('div', { className: 'muted', textContent: sub }));
  const t = s.total;
  if (!t.played) return el('p', { className: 'muted', textContent: 'No finished games yet. Challenge someone you follow to get started. (Aborted games and same-screen games don’t count.)' });
  const table = (title, rows) => el('div', { className: 'stat-table' }, el('h3', { textContent: title }),
    el('table', {}, ...rows.map(([k, v]) => el('tr', {}, el('td', { textContent: k }), el('td', { textContent: wld(v) }), el('td', { textContent: pct(v) + '%' })))));
  const reasons = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${REASONS[r] || r} ${n}`).join(' · ') || '—';
  const opps = Object.entries(s.opponents).sort((a, b) => b[1].played - a[1].played).slice(0, 5);
  return el('div', {},
    el('div', { className: 'stat-cards' },
      card('Games', t.played),
      card('Win rate', s.winRate + '%', wld(t)),
      card('Best win streak', s.streak.best, `current ${s.streak.current}`),
      card('Average game', `${s.averageLength} moves`, `longest ${s.longest}`)),
    el('div', { className: 'stat-grid' },
      table('By time control', CATS.filter((c) => s.byCategory[c]).map((c) => [c[0].toUpperCase() + c.slice(1), s.byCategory[c]])),
      table('By mode', Object.entries(s.byMode).map(([k, v]) => [k === 'relative' ? 'Relative' : 'Classic', v])),
      table('By colour', [['White', s.byColor.white], ['Black', s.byColor.black]]),
      opps.length ? table('Most played', opps.map(([id, v]) => ['@' + nameOf(id), v])) : null),
    el('p', { className: 'muted', textContent: `Wins by: ${reasons(s.winsBy)}` }),
    el('p', { className: 'muted', textContent: `Losses by: ${reasons(s.lossesBy)}` }));
}

function gamesView(games, id) {
  const shown = games.filter((g) => ['finished', 'active', 'aborted'].includes(g.status));
  if (!shown.length) return el('p', { className: 'muted', textContent: 'No saved games yet.' });
  return el('div', { className: 'game-list' }, ...shown.map((g) => {
    const local = g.kind === 'local';
    const opp = g.white === id ? g.black : g.white;
    const res = g.status === 'active' ? 'in progress' : g.status === 'aborted' ? 'aborted'
      : local ? (g.result === 'draw' ? 'draw' : `${g.result} won`) : ({ win: 'won', loss: 'lost', draw: 'draw' })[outcomeFor(g, id)];
    const why = g.reason ? ` by ${REASONS[g.reason] || g.reason}` : '';
    return el('div', { className: 'game-row' },
      el('div', {},
        el('b', { textContent: local ? 'Same screen' : `vs @${nameOf(opp)}` }),
        el('div', { className: 'muted', textContent: `${new Date(g.updated_at).toLocaleDateString()} · ${tcLabel(g.time_control)} · ${g.rules.mode === 'relative' ? 'Relative' : 'Classic'} · ${Math.ceil(g.moves.length / 2)} moves · ${res}${g.status === 'finished' ? why : ''}` })),
      el('span', {},
        g.status === 'active' && id === me() && el('button', { className: 'primary', textContent: 'Resume', onclick: () => { $('profile-dialog').close(); hooks.openGame(g); } }),
        el('button', { textContent: 'Replay', onclick: () => {
          $('profile-dialog').close();
          hooks.reviewGame(g, local ? 'Same-screen game' : `@${nameOf(g.white)} (White) vs @${nameOf(g.black)} (Black)`);
        } })));
  }));
}

function peopleView(list) {
  if (!list.length) return el('p', { className: 'muted', textContent: 'Not following anyone yet.' });
  return el('div', { className: 'game-list' }, ...list.map((p) => {
    names[p.id] = p;
    return el('div', { className: 'game-row' },
      el('b', { textContent: '@' + p.username }),
      el('span', {},
        el('button', { textContent: 'Profile', onclick: () => openProfile(p.id) }),
        p.id !== me() && el('button', { className: 'primary', textContent: 'Challenge', onclick: () => openChallenge(p.id) })));
  }));
}

function findView() {
  const q = el('input', { placeholder: 'Search usernames…', autocomplete: 'off' });
  const out = el('div');
  let t;
  q.oninput = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const found = (await acct.findPlayers(q.value)).filter((p) => p.id !== me());
      out.innerHTML = '';
      out.append(found.length ? peopleView(found) : el('p', { className: 'muted', textContent: q.value ? 'No one found.' : '' }));
    }, 250);
  };
  setTimeout(() => q.focus(), 0);
  return el('div', {}, q, out);
}

function securityView() {
  const box = el('div', {}, el('p', { className: 'muted', textContent: 'Loading…' }));
  (async () => {
    box.innerHTML = '';
    const m = acct.methods();
    if (m.passkey) {
      let keys = [];
      try {
        keys = await acct.listPasskeys();
      } catch {}
      box.append(el('h3', { textContent: 'Passkeys' }),
        el('p', { className: 'muted', textContent: 'Sign in with your fingerprint, face or a security key. Phishing-resistant, and nothing to remember.' }),
        ...keys.map((k) => el('div', { className: 'game-row' },
          el('span', { textContent: `${k.friendly_name || 'Passkey'} · added ${new Date(k.created_at).toLocaleDateString()}${k.last_used_at ? ` · last used ${new Date(k.last_used_at).toLocaleDateString()}` : ''}` }),
          el('button', { textContent: 'Remove', onclick: async () => { await acct.deletePasskey(k.id).catch((e) => hooks.notify(e.message)); openProfile(me()); } }))),
        el('button', { className: 'primary', textContent: 'Add a passkey', onclick: async () => {
          try {
            await acct.registerPasskey();
            hooks.notify('Passkey added.');
          } catch (e) {
            hooks.notify(e.message);
          }
          openProfile(me());
        } }));
    }
    const pw = el('input', { type: 'password', placeholder: 'new password (8+ characters)', autocomplete: 'new-password', minLength: 8 });
    box.append(el('h3', { textContent: 'Password' }),
      el('div', { className: 'row' }, pw, el('button', { textContent: 'Set password', onclick: async () => {
        try {
          await acct.setPassword(pw.value);
          hooks.notify('Password updated.');
          pw.value = '';
        } catch (e) {
          hooks.notify(e.message);
        }
      } })),
      el('p', { className: 'muted', textContent: `Signed in as ${acct.state.user.email || acct.state.user.phone || 'this account'}.` }));
  })();
  return box;
}

// ---------------------------------------------------------------- challenge
export function openChallenge(opponentId, preset = {}) {
  const d = $('challenge-dialog');
  $('challenge-who').textContent = '@' + nameOf(opponentId);
  const tcSel = $('challenge-tc');
  fillTcSelect(tcSel, true);
  tcSel.value = tcKey(preset.timeControl || hooks.currentTimeControl());
  if (!tcSel.value) tcSel.value = 'none';
  $('challenge-color').value = preset.color || 'random';
  const rules = preset.rules || hooks.currentRules();
  $('challenge-rules').textContent = `Rules: ${rules.mode === 'relative' ? 'Relative' : 'Classic'} (from the Game rules panel)`;
  $('challenge-msg').textContent = '';
  $('challenge-form').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await acct.challenge(opponentId, $('challenge-color').value, rules, parseTcKey(tcSel.value));
      d.close();
      $('profile-dialog').close();
      hooks.notify(`Challenge sent to @${nameOf(opponentId)}.`);
      refreshLive();
    } catch (err) {
      $('challenge-msg').textContent = err.message;
    }
  };
  d.showModal();
}

export function fillTcSelect(sel, withDaily) {
  sel.innerHTML = '';
  sel.add(new Option('No clock', 'none'));
  for (const { group, controls } of PRESETS) {
    const og = document.createElement('optgroup');
    og.label = group;
    for (const [b, i] of controls) og.append(new Option(tcLabel({ type: 'live', base: b, inc: i }), tcKey({ type: 'live', base: b, inc: i })));
    sel.append(og);
  }
  if (withDaily) {
    const og = document.createElement('optgroup');
    og.label = 'Daily';
    for (const d of DAILY_DAYS) og.append(new Option(tcLabel({ type: 'daily', days: d }), tcKey({ type: 'daily', days: d })));
    sel.append(og);
  }
}

function wireDialogs() {
  for (const id of ['auth-dialog', 'profile-dialog', 'challenge-dialog', 'username-dialog']) {
    const d = $(id);
    d.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => d.close()));
  }
}

export { openProfile, refreshLive };
