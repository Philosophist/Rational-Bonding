// Shared sign-in and username dialogs for Rational Bonding pages. They build
// their own <dialog> elements and bring a little CSS, so any page can use them:
//   import * as auth from '/accounts/auth.js';
//   import { openSignIn, openUsername, readLinkError } from '/accounts/signin.js';
// The page decides where its "Sign in" button goes.
import * as auth from './auth.js';

const el = (tag, props = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  return e;
};

const CSS = `
.rb-dialog { max-width: min(440px, calc(100vw - 24px)); width: 100%; border: 1px solid #36405c; border-radius: 14px;
  background: #121725; color: #eef2fb; padding: 18px; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
.rb-dialog::backdrop { background: rgba(0, 0, 0, 0.6); }
.rb-dialog h2 { margin: 0 0 10px; font-size: 18px; }
.rb-dialog .rb-sec { display: flex; flex-direction: column; gap: 8px; padding: 10px 0; border-top: 1px solid #222b42; }
.rb-dialog .rb-label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: #a5afc6; }
.rb-dialog .rb-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.rb-dialog .rb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 6px; }
.rb-dialog input { flex: 1; min-width: 0; background: #07090f; border: 1px solid #2a3350; border-radius: 8px; padding: 7px 9px; color: inherit; font: inherit; }
.rb-dialog button { background: #1a2134; color: inherit; border: 1px solid #36405c; border-radius: 999px; padding: 6px 12px; cursor: pointer; font: inherit; }
.rb-dialog button:hover { border-color: #2fe3e6; }
.rb-dialog button:disabled { opacity: 0.5; cursor: default; }
.rb-dialog button.rb-primary { background: linear-gradient(90deg, #2fe3e6, #3b6dff); color: #04121a; border: none; font-weight: 700; }
.rb-dialog button.rb-link { background: none; border: none; color: #2fe3e6; padding: 2px 0; text-align: left; }
.rb-dialog .rb-muted { color: #a5afc6; font-size: 13px; margin: 0; }
.rb-dialog .rb-msg { min-height: 1em; font-size: 14px; }
.rb-dialog .rb-msg.err { color: #ff9fb0; }
.rb-dialog .rb-msg.ok { color: #7dffb0; }
.rb-dialog details summary { cursor: pointer; color: #a5afc6; }
.rb-dialog .rb-close { position: absolute; top: 10px; right: 10px; padding: 2px 10px; }
`;
function ensureStyle() {
  if (document.getElementById('rb-signin-css')) return;
  document.head.append(el('style', { id: 'rb-signin-css', textContent: CSS }));
}
function dialog(id, title) {
  ensureStyle();
  let d = document.getElementById(id);
  if (!d) {
    d = el('dialog', { id, className: 'rb-dialog' });
    document.body.append(d);
  }
  d.replaceChildren(el('button', { className: 'rb-close', type: 'button', textContent: '×', title: 'Close', onclick: () => d.close() }), el('h2', { textContent: title }));
  return d;
}

// A sign-in or confirmation link that failed (expired, already used, or opened
// first by an email app's link scanner) comes back with the error in the URL.
// Read it, tidy the URL, and say what to do next.
export function readLinkError() {
  const params = new URLSearchParams(location.hash.slice(1) + '&' + location.search.slice(1));
  const desc = params.get('error_description');
  if (!desc) return null;
  const url = new URL(location.href);
  url.hash = '';
  for (const k of ['error', 'error_code', 'error_description', 'sb']) url.searchParams.delete(k);
  history.replaceState(null, '', url);
  return /expired|invalid/i.test(desc)
    ? 'That email link has expired or was already used. Some email apps open links by themselves, which uses them up. Type your email below for a new one, or type the code from the email.'
    : `That email link didn't work: ${desc}. Type your email below to get a new one.`;
}

export function openSignIn(note) {
  const d = dialog('rb-signin', 'Sign in to Rational Bonding');
  const m = auth.methods();
  const msg = el('div', { className: 'rb-msg', role: 'status' });
  const run = (fn) => async (e) => {
    e?.preventDefault?.();
    msg.textContent = '';
    msg.className = 'rb-msg';
    try {
      const out = await fn();
      if (out) { msg.textContent = out; msg.classList.add('ok'); } else d.close();
    } catch (err) {
      msg.textContent = err.message || String(err);
      msg.classList.add('err');
    }
  };
  if (typeof note === 'string') { msg.textContent = note; msg.classList.add('err'); }
  d.append(el('p', { className: 'rb-muted', textContent: 'One account works on every Rational Bonding page, including Cube Chess.' }));

  if (m.passkey) {
    d.append(el('section', { className: 'rb-sec' },
      el('button', { className: 'rb-primary', textContent: '🔑 Sign in with a passkey', onclick: run(async () => { await auth.signInWithPasskey(); }) }),
      el('p', { className: 'rb-muted', textContent: 'No password: your device’s fingerprint, face or PIN.' })));
  }
  if (m.providers.length) {
    d.append(el('section', { className: 'rb-sec' },
      el('div', { className: 'rb-label', textContent: 'Continue with' }),
      el('div', { className: 'rb-grid' },
        m.providers.map(([id, label]) => el('button', { textContent: label, onclick: run(async () => { await auth.signInWithProvider(id); return 'Redirecting…'; }) })))));
  }
  if (m.ethereum || m.solana) {
    d.append(el('section', { className: 'rb-sec' },
      el('div', { className: 'rb-label', textContent: 'Crypto wallet' }),
      el('div', { className: 'rb-grid' },
        m.ethereum && el('button', { textContent: 'Ethereum wallet', onclick: run(async () => { await auth.signInWithWallet('ethereum'); }) }),
        m.solana && el('button', { textContent: 'Solana wallet', onclick: run(async () => { await auth.signInWithWallet('solana'); }) }))));
  }
  if (m.email) {
    const email = el('input', { type: 'email', placeholder: 'you@example.com', autocomplete: 'username webauthn', required: true, 'aria-label': 'Email' });
    const code = el('input', { inputMode: 'numeric', placeholder: 'code from the email', autocomplete: 'one-time-code', maxLength: 10, 'aria-label': 'Code from the email' });
    let resend = null;
    const again = el('button', { type: 'button', className: 'rb-link', textContent: 'Send again' });
    let timer = 0;
    const cooldown = (secs) => {
      clearInterval(timer);
      const until = Date.now() + secs * 1000;
      const tick = () => {
        const left = Math.ceil((until - Date.now()) / 1000);
        again.disabled = left > 0;
        again.textContent = left > 0 ? `Send again in ${left}s` : 'Send again';
        if (left <= 0) clearInterval(timer);
      };
      tick();
      timer = setInterval(tick, 1000);
    };
    const codeBox = el('div', { hidden: true },
      el('form', { className: 'rb-row', onsubmit: run(async () => { await auth.verifyEmailCode(email.value.trim(), code.value.replace(/\s/g, '')); }) },
        code, el('button', { textContent: 'Verify' })),
      el('div', { className: 'rb-row' }, again));
    // Supabase lets each address ask for a new email once a minute.
    const sent = (fn) => {
      resend = fn;
      codeBox.hidden = false;
      cooldown(60);
      return `Email sent to ${email.value.trim()}. Click the link in it, or type its code here. It can take a minute, so check your spam folder too.`;
    };
    again.onclick = run(async () => {
      if (!email.reportValidity()) return 'Enter your email first.';
      const fn = resend || (() => auth.sendEmailCode(email.value.trim()));
      await fn();
      return sent(fn);
    });
    const pw = el('input', { type: 'password', placeholder: 'password (8+ characters)', autocomplete: 'current-password', minLength: 8, 'aria-label': 'Password' });
    d.append(el('section', { className: 'rb-sec' },
      el('div', { className: 'rb-label', textContent: 'Email' }),
      email,
      el('div', { className: 'rb-row' },
        el('button', { textContent: 'Email me a sign-in link', onclick: run(async () => {
          if (!email.reportValidity()) return 'Enter your email first.';
          const fn = () => auth.sendEmailCode(email.value.trim());
          await fn();
          return sent(fn);
        }) })),
      el('button', { type: 'button', className: 'rb-link', textContent: 'Have a code, or need the email again?', onclick: () => { codeBox.hidden = false; code.focus(); } }),
      codeBox,
      el('details', {},
        el('summary', { textContent: 'Use a password instead' }),
        el('div', { className: 'rb-sec' },
          pw,
          el('div', { className: 'rb-row' },
            el('button', { textContent: 'Sign in', onclick: run(async () => {
              try {
                await auth.signInWithPassword(email.value.trim(), pw.value);
              } catch (err) {
                if (!/not confirmed/i.test(err.message)) throw err;
                resend = () => auth.resendSignupEmail(email.value.trim());
                codeBox.hidden = false;
                return 'Your email isn’t confirmed yet. Click Send again for a new confirmation email, then click its link or type its code here.';
              }
            }) }),
            !m.signupDisabled && el('button', { textContent: 'Create account', onclick: run(async () => {
              if (!email.reportValidity()) return 'Enter your email first.';
              const r = await auth.signUpWithPassword(email.value.trim(), pw.value);
              return r.session ? null : sent(() => auth.resendSignupEmail(email.value.trim()));
            }) }),
            el('button', { className: 'rb-link', textContent: 'Forgot password?', onclick: run(async () => {
              await auth.sendPasswordReset(email.value.trim());
              return 'Password reset email sent.';
            }) }))))));
  }
  if (m.phone) {
    const phone = el('input', { type: 'tel', placeholder: '+1 555 123 4567', autocomplete: 'tel', 'aria-label': 'Phone' });
    const code = el('input', { inputMode: 'numeric', placeholder: 'code from the text', autocomplete: 'one-time-code', 'aria-label': 'Code from the text' });
    d.append(el('section', { className: 'rb-sec' },
      el('div', { className: 'rb-label', textContent: 'Phone' }),
      el('div', { className: 'rb-row' }, phone, el('button', { textContent: 'Text me a code', onclick: run(async () => { await auth.sendPhoneCode(phone.value.trim()); return 'Code sent.'; }) })),
      el('div', { className: 'rb-row' }, code, el('button', { textContent: 'Verify', onclick: run(async () => { await auth.verifyPhoneCode(phone.value.trim(), code.value.replace(/\s/g, '')); }) }))));
  }
  d.append(msg, el('p', { className: 'rb-muted' }, 'See the ', el('a', { href: '/privacy/', textContent: 'privacy page', style: 'color:#2fe3e6' }), ' for what is kept.'));
  if (!d.open) d.showModal();
}

function suggestName() {
  const u = auth.state.user;
  const base = (u?.user_metadata?.user_name || u?.user_metadata?.preferred_username || u?.email?.split('@')[0] || 'player').replace(/[^A-Za-z0-9_]/g, '');
  return (base.length >= 3 ? base : base + 'player').slice(0, 20);
}

// Choose (or change) the one username used on every Rational Bonding page.
export function openUsername() {
  const d = dialog('rb-username', auth.state.profile ? 'Change your username' : 'Choose a username');
  const input = el('input', { value: auth.state.profile?.username || suggestName(), maxLength: 20, autocomplete: 'username', 'aria-label': 'Username' });
  const msg = el('div', { className: 'rb-msg err', role: 'status' });
  d.append(
    el('p', { className: 'rb-muted', textContent: 'Shown on everything you post, here and in Cube Chess. 3–20 letters, numbers or _.' }),
    el('form', { className: 'rb-row', onsubmit: async (e) => {
      e.preventDefault();
      try {
        if (auth.state.profile) await auth.renameProfile(input.value.trim());
        else await auth.createProfile(input.value.trim());
        d.close();
      } catch (err) {
        msg.textContent = /duplicate|unique/i.test(err.message) ? 'That username is taken.' : /check/i.test(err.message) ? '3–20 letters, numbers or _.' : err.message;
      }
    } }, input, el('button', { className: 'rb-primary', textContent: 'Save' })),
    msg);
  if (!d.open) d.showModal();
  input.focus();
}
