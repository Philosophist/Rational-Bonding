// Serves Ourgument at https://ourgument.com from the files GitHub Pages already
// publishes at https://rationalbonding.com/reasonance/. It runs as a
// Cloudflare Worker named "ourgument"; Steve pastes this file into the
// dashboard (steps in reasonance/hosting/README.md). It stores nothing.
//
//   ourgument.com/              -> rationalbonding.com/reasonance/
//   ourgument.com/app.js        -> rationalbonding.com/reasonance/app.js
//   ourgument.com/accounts/...  -> rationalbonding.com/accounts/...  (shared sign-in code)
//   ourgument.com/images/...    -> rationalbonding.com/images/...
//   ourgument.com/privacy/ etc. -> redirect to the page on rationalbonding.com
//   www.ourgument.com/...       -> redirect to ourgument.com/...
//   ourgument.com/reasonance/x  -> redirect to ourgument.com/x

const ORIGIN = 'https://rationalbonding.com';
const HOME = 'ourgument.com';
const SHARED = ['/accounts/', '/images/', '/favicon.png'];
const SITE_PAGES = ['/privacy', '/blog', '/chess', '/chess3d', '/alchemfighter'];

const starts = (path, p) => path === p || path.startsWith(p.endsWith('/') ? p : p + '/');

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const go = (to, status = 301) => Response.redirect(to, status);

    if (url.hostname !== HOME) return go(`https://${HOME}${path}${url.search}`);
    if (starts(path, '/reasonance')) return go(`https://${HOME}${path.slice('/reasonance'.length) || '/'}${url.search}`);
    if (SITE_PAGES.some((p) => starts(path, p))) return go(`${ORIGIN}${path}${url.search}`, 302);
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

    const target = SHARED.some((p) => starts(path, p)) ? path : '/reasonance' + path;
    const res = await fetch(`${ORIGIN}${target}${url.search}`, {
      method: request.method,
      headers: { accept: request.headers.get('accept') || '*/*' },
      redirect: 'manual',
    });
    // GitHub Pages adds a trailing slash with a redirect; keep it on ourgument.com.
    const loc = res.headers.get('location');
    if (loc && res.status >= 300 && res.status < 400) {
      const l = new URL(loc, ORIGIN);
      if (l.hostname === new URL(ORIGIN).hostname && starts(l.pathname, '/reasonance')) {
        return go(`https://${HOME}${l.pathname.slice('/reasonance'.length) || '/'}${l.search}`);
      }
      return go(l.href, 302);
    }
    return new Response(res.body, res);
  },
};
