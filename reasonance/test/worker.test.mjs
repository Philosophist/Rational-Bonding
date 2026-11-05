import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../hosting/worker.js';

const calls = [];
globalThis.fetch = async (url) => {
  calls.push(url);
  if (url.endsWith('/reasonance/hosting')) return new Response(null, { status: 301, headers: { location: 'https://rationalbonding.com/reasonance/hosting/' } });
  return new Response('ok:' + url, { status: 200, headers: { 'content-type': 'text/html' } });
};
const get = (u, method = 'GET') => worker.fetch(new Request(u, { method }));
const fetched = async (u) => { calls.length = 0; const r = await get(u); assert.equal(r.status, 200); return calls[0]; };
const moved = async (u) => { const r = await get(u); assert.ok(r.status === 301 || r.status === 302, `${u} gave ${r.status}`); return r.headers.get('location'); };

test('the app is served from the reasonance folder', async () => {
  assert.equal(await fetched('https://ourgument.com/'), 'https://rationalbonding.com/reasonance/');
  assert.equal(await fetched('https://ourgument.com/app.js'), 'https://rationalbonding.com/reasonance/app.js');
  assert.equal(await fetched('https://ourgument.com/?code=abc'), 'https://rationalbonding.com/reasonance/?code=abc');
});

test('shared sign-in code and images come from the site root', async () => {
  assert.equal(await fetched('https://ourgument.com/accounts/auth.js'), 'https://rationalbonding.com/accounts/auth.js');
  assert.equal(await fetched('https://ourgument.com/images/share.png'), 'https://rationalbonding.com/images/share.png');
  assert.equal(await fetched('https://ourgument.com/favicon.png'), 'https://rationalbonding.com/favicon.png');
});

test('redirects', async () => {
  assert.equal(await moved('https://www.ourgument.com/x?y=1'), 'https://ourgument.com/x?y=1');
  assert.equal(await moved('https://ourgument.com/reasonance/'), 'https://ourgument.com/');
  assert.equal(await moved('https://ourgument.com/reasonance/style.css'), 'https://ourgument.com/style.css');
  assert.equal(await moved('https://ourgument.com/privacy/'), 'https://rationalbonding.com/privacy/');
  assert.equal(await moved('https://ourgument.com/chess3d/'), 'https://rationalbonding.com/chess3d/');
  assert.equal(await moved('https://ourgument.com/hosting'), 'https://ourgument.com/hosting/');
});

test('only reads are passed on', async () => {
  assert.equal((await get('https://ourgument.com/', 'POST')).status, 405);
});
