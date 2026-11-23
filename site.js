import { SITE } from './site-config.js';

const $ = (id) => document.getElementById(id);
$('year').textContent = new Date().getFullYear();

// A standard (4…) or sub- (8…) address is 95 characters; an integrated one 106.
const MONERO = /^[48][1-9A-HJ-NP-Za-km-z]{94}$|^4[1-9A-HJ-NP-Za-km-z]{105}$/;
const CASHTAG = /^\$[A-Za-z][A-Za-z0-9_-]{0,19}$/;

let any = false;
if (MONERO.test(SITE.monero || '')) {
  any = true;
  const uri = `monero:${SITE.monero}?tx_description=${encodeURIComponent('Coffee for Rational Bonding')}`;
  $('monero-card').hidden = false;
  $('monero-addr').textContent = SITE.monero;
  $('monero-open').href = uri;
  if (window.qrcode) {
    const qr = window.qrcode(0, 'M');
    qr.addData(uri);
    qr.make();
    $('monero-qr').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }
  $('monero-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(SITE.monero);
      $('monero-copy').textContent = 'Copied!';
    } catch {
      getSelection().selectAllChildren($('monero-addr'));
    }
    setTimeout(() => ($('monero-copy').textContent = 'Copy address'), 1500);
  };
}
if (CASHTAG.test(SITE.cashApp || '')) {
  any = true;
  $('cash-card').hidden = false;
  $('cash-link').href = `https://cash.app/${SITE.cashApp}`;
  $('cash-link').textContent = `Cash App ${SITE.cashApp}`;
}
// Liberapay and Ko-fi names: letters, numbers, dot, dash and underscore.
const HANDLE = /^[A-Za-z0-9_.-]{1,40}$/;
const PAGES = [
  ['liberapay', (u) => `https://liberapay.com/${u}/donate`],
  ['kofi', (u) => `https://ko-fi.com/${u}`],
];
for (const [key, url] of PAGES) {
  const name = (SITE[key] || '').trim();
  if (!HANDLE.test(name)) continue;
  any = true;
  $(`${key}-card`).hidden = false;
  $(`${key}-link`).href = url(encodeURIComponent(name));
}
$('support-soon').hidden = any;
