// The page: settings, a worker that runs the experiment, and playback of the recording.
import { VIEWS } from './run.js';
import { DEFAULTS, FS_PER_AU, A0_NM, HARTREE_EV, VERSION } from './sim.js';
import { TEXTBOOK } from './compare.js';

const $ = id => document.getElementById(id);
const L = 'spdfghik';
const fmt = (x, d = 3) => (x === undefined || x === null || !isFinite(x)) ? '–' : (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e4 ? x.toFixed(d) : x.toExponential(2));
const pct = x => (x * 100).toFixed(x < 0.01 ? 4 : 2) + '%';

// ---------------------------------------------------------------------------
// Colours: log10 density, one colour step per factor of 10
// ---------------------------------------------------------------------------
const DECADES = 10;
const STOPS = [[0, 0, 0], [20, 30, 110], [59, 109, 255], [47, 227, 230], [255, 233, 77], [255, 255, 255]];
const LUT = new Uint8ClampedArray(256 * 3);
for (let i = 0; i < 256; i++) {
  const x = i / 255 * (STOPS.length - 1), k = Math.min(STOPS.length - 2, Math.floor(x)), f = x - k;
  for (let c = 0; c < 3; c++) LUT[3 * i + c] = STOPS[k][c] + f * (STOPS[k + 1][c] - STOPS[k][c]);
}
{ const g = $('legend').getContext('2d'), im = g.createImageData(180, 10);
  for (let x = 0; x < 180; x++) for (let y = 0; y < 10; y++) { const i = Math.round(x / 179 * 255), o = 4 * (y * 180 + x); im.data[o] = LUT[3 * i]; im.data[o + 1] = LUT[3 * i + 1]; im.data[o + 2] = LUT[3 * i + 2]; im.data[o + 3] = 255; }
  g.putImageData(im, 0, 0); }

// Draw a half-slice image (x ≥ 0) mirrored into the full slice through the axis.
function draw(canvas, img, nx, nz, top) {
  const g = canvas.getContext('2d'), off = new OffscreenCanvas(2 * nx, nz), og = off.getContext('2d'), im = og.createImageData(2 * nx, nz);
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const v = img ? img[iz * nx + ix] : -99, t = Math.max(0, Math.min(1, (v - (top - DECADES)) / DECADES)), i = Math.round(t * 255);
    for (const X of [nx + ix, nx - 1 - ix]) { const o = 4 * (iz * 2 * nx + X); im.data[o] = LUT[3 * i]; im.data[o + 1] = LUT[3 * i + 1]; im.data[o + 2] = LUT[3 * i + 2]; im.data[o + 3] = 255; }
  }
  og.putImageData(im, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(off, 0, 0, canvas.width, canvas.height);
  // proton marker and scale bar
  g.strokeStyle = 'rgba(224,77,255,0.9)'; g.lineWidth = 1;
  const cx = canvas.width / 2, cy = canvas.height / 2;
  g.beginPath(); g.moveTo(cx - 5, cy); g.lineTo(cx + 5, cy); g.moveTo(cx, cy - 5); g.lineTo(cx, cy + 5); g.stroke();
}
function scaleBar(canvas, halfA0) {
  const g = canvas.getContext('2d'), nmPerPx = 2 * halfA0 * A0_NM / canvas.width;
  const target = canvas.width * 0.25 * nmPerPx, nice = [0.1, 0.2, 0.5, 1, 2, 5][[0.1, 0.2, 0.5, 1, 2, 5].findIndex((v, i, a) => i === a.length - 1 || a[i + 1] > target)];
  const w = nice / nmPerPx;
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(4, canvas.height - 34, Math.max(w, 44) + 12, 28);
  g.fillStyle = '#e8ecf4'; g.fillRect(10, canvas.height - 14, w, 2);
  g.font = '12px system-ui'; g.fillText(`${nice} nm`, 10, canvas.height - 20);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let worker = null, frames = [], result = null, cur = 0, playing = false, flags = [], topWide = -3, topNear = -3, settingsUsed = null, runStart = 0;
const rate = { fs: 2.4 };            // fs of electron time per second of playback at 1×
const frameFs = () => DEFAULTS.dt * DEFAULTS.frameEvery * FS_PER_AU;

function readSettings() {
  const num = id => +$(id).value, on = id => $(id).checked;
  return { startNm: num('startNm'), energyEv: num('energyEv'), widthNm: num('widthNm'), coulomb: on('coulomb'), recoil: on('recoil'), light: on('light'), fine: on('fine') };
}
function updateEstimate() {
  const s = readSettings();
  // measured on a 2020s laptop-class CPU core in Chrome/Node: ~6 ms per step without spin, ~12.5 with
  const ms = (s.fine && s.coulomb ? 12.5 : 6) * DEFAULTS.tEndAu / DEFAULTS.dt;
  $('estimate').textContent = `about ${Math.round(ms / 60000 * 10) / 10 || '<1'} min, one CPU core`;
}
document.querySelectorAll('#setup input').forEach(el => el.addEventListener('input', updateEstimate));
updateEstimate();

$('run').onclick = () => {
  if (worker) worker.terminate();
  frames = []; result = null; cur = 0; flags = []; playing = false; renderFlags();
  $('results').classList.add('hidden');
  ['play', 'back', 'fwd', 'scrub', 'flag', 'report'].forEach(id => { $(id).disabled = true; });
  settingsUsed = readSettings();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = onMessage;
  worker.onerror = e => { $('status').textContent = 'The run stopped with an error: ' + (e.message || e); };
  runStart = performance.now();
  $('status').textContent = 'Setting up the grid…';
  worker.postMessage({ type: 'run', settings: settingsUsed });
  $('run').textContent = 'Run again';
};

function onMessage(ev) {
  const m = ev.data;
  if (m.type === 'frame') {
    frames.push({ obs: m.obs, wide: m.wide, near: m.near });
    // each view's brightest colour is the highest density it has shown so far (rounded up to ×10)
    let mw = -99, mn = -99;
    for (const v of m.wide) if (v > mw) mw = v;
    for (const v of m.near) if (v > mn) mn = v;
    topWide = Math.max(m.i === 0 ? -99 : topWide, Math.ceil(mw)); topNear = Math.max(m.i === 0 ? -99 : topNear, Math.ceil(mn));
    $('legendTop').textContent = `brightest: 10^${topWide} (whole) and 10^${topNear} (near) per a₀³`;
    if (m.i === 0) for (const id of ['scrub', 'back', 'fwd', 'play', 'flag']) $(id).disabled = false;
    $('scrub').max = frames.length - 1;
    if (!playing && cur >= frames.length - 2) show(frames.length - 1);
  } else if (m.type === 'progress') {
    $('progress').style.width = (m.p * 100).toFixed(1) + '%';
    const el = (performance.now() - runStart) / 1000, left = m.p > 0.01 ? el / m.p - el : NaN;
    $('status').textContent = `Computing: ${(m.p * 100).toFixed(0)}% · ${el.toFixed(0)} s so far${isFinite(left) ? `, about ${Math.round(left)} s to go` : ''}. You can already scrub what is done.`;
  } else if (m.type === 'done') {
    result = m.result;
    $('progress').style.width = '100%';
    $('status').textContent = `Done: ${(result.timing.runMs / 1000).toFixed(0)} s for ${result.timing.steps.toLocaleString()} steps (${result.timing.msPerStep.toFixed(1)} ms each), ${result.grid.points.toLocaleString()} grid points.`;
    $('report').disabled = false;
    showResults();
  } else if (m.type === 'captured') {
    if (m.img) draw($('captured'), m.img, 64, 128, Math.ceil(Math.max(...m.img)));
    scaleBar($('captured'), VIEWS.near.half);
    capturedBusy = false;
    if (capturedWant !== null && capturedWant !== m.tau) requestCaptured(capturedWant);
  }
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------
function show(i) {
  if (!frames.length) return;
  cur = Math.max(0, Math.min(frames.length - 1, i));
  const f = frames[cur];
  draw($('wide'), f.wide, VIEWS.wide.nx, VIEWS.wide.nz, topWide); scaleBar($('wide'), VIEWS.wide.half);
  draw($('near'), f.near, VIEWS.near.nx, VIEWS.near.nz, topNear); scaleBar($('near'), VIEWS.near.half);
  $('scrub').value = cur;
  const o = f.obs;
  $('clock').textContent = `t = ${o.tFs.toFixed(2)} fs`;
  const rows = [
    ['Time', `${o.tFs.toFixed(2)} fs`],
    ['Still in the box', pct(o.inBox)],
    ['Energy', `${o.energyEv.toFixed(5)} eV`],
    ['Average distance', `${o.meanRNm.toFixed(3)} nm`],
  ];
  if (o.boundShare !== undefined) rows.push(['In bound shapes (no light)', fmt(o.boundShare)], ['Captured with a photon', fmt(o.captured)]);
  if (settingsUsed && settingsUsed.fine) rows.push(['Spin flipped', fmt(o.spinFlipped)]);
  $('stats').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
}
$('scrub').oninput = e => { playing = false; $('play').textContent = 'Play'; show(+e.target.value); };
$('back').onclick = () => { playing = false; $('play').textContent = 'Play'; show(cur - 1); };
$('fwd').onclick = () => { playing = false; $('play').textContent = 'Play'; show(cur + 1); };
$('play').onclick = () => {
  playing = !playing; $('play').textContent = playing ? 'Pause' : 'Play';
  if (playing && cur >= frames.length - 1) show(0);
  last = performance.now(); acc = 0;
};
let last = 0, acc = 0;
function tick(t) {
  if (playing) {
    acc += (t - last) / 1000 * rate.fs * +$('speed').value / frameFs();
    const n = Math.floor(acc);
    if (n > 0) { acc -= n; show(cur + n); if (cur >= frames.length - 1 && result) { playing = false; $('play').textContent = 'Play'; } }
  }
  last = t;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------------------------------------------------------------------------
// Flags and the report
// ---------------------------------------------------------------------------
$('flag').onclick = () => {
  const o = frames[cur].obs;
  flags.push({ frame: cur, tFs: o.tFs, note: $('flagNote').value.trim(), obs: o, stills: stills() });
  $('flagNote').value = '';
  renderFlags();
};
function renderFlags() {
  $('flags').innerHTML = flags.map((f, i) => `<li><a href="#" data-i="${i}">${f.tFs.toFixed(2)} fs</a>${f.note ? ': ' + f.note.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) : ''}</li>`).join('');
  $('flags').querySelectorAll('a').forEach(a => { a.onclick = e => { e.preventDefault(); playing = false; show(flags[+a.dataset.i].frame); }; });
}
function stills() { return { wide: $('wide').toDataURL('image/png'), near: $('near').toDataURL('image/png') }; }
function keyMoments() {
  const T = frames.map(f => f.obs), closest = T.reduce((a, b, i) => (b.meanRNm < T[a].meanRNm ? i : a), 0);
  const picks = [['start', 0], ['closest approach', closest], ['halfway out', Math.round((closest + T.length - 1) / 2)], ['end', T.length - 1]];
  const keep = cur, out = [];
  for (const [name, i] of picks) { show(i); out.push({ name, frame: i, tFs: T[i].tFs, ...stills() }); }
  show(keep);
  return out;
}
$('report').onclick = () => {
  if (!result) return;
  const rep = {
    what: 'Hydrogen Lab run report (rationalbonding.com/lab/hydrogen). Rerun exactly with: node lab/hydrogen/headless.mjs <this file>',
    version: VERSION, settings: result.settings, grid: result.grid, timing: result.timing,
    view: { colourDecades: DECADES, wideTopLog10: topWide, nearTopLog10: topNear, wideHalfNm: VIEWS.wide.half * A0_NM, nearHalfNm: VIEWS.near.half * A0_NM, currentFrame: cur },
    table: result.table.map(o => ({ tFs: +o.tFs.toFixed(4), inBox: o.inBox, energyEv: o.energyEv, meanRNm: o.meanRNm, boundShare: o.boundShare, captured: o.captured, lightEnergyEv: o.lightEnergyEv, spinFlipped: o.spinFlipped })),
    start: { energyEv: result.start.energyEv, boundShare: result.start.boundShare, perL: result.start.perL },
    capture: result.capture && { total: result.capture.total, byState: result.capture.byState, spectrum: result.capture.spectrum },
    textbook: result.textbook, lifetimes: result.lifetimes, cascade: result.cascade, bound: result.bound,
    flags, keyMoments: keyMoments(),
    browser: navigator.userAgent, cores: navigator.hardwareConcurrency,
  };
  const blob = new Blob([JSON.stringify(rep, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `hydrogen-run-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
};

// ---------------------------------------------------------------------------
// Results after the run
// ---------------------------------------------------------------------------
let capturedBusy = false, capturedWant = null;
function requestCaptured(tau) {
  capturedWant = tau;
  if (capturedBusy || !worker) return;
  capturedBusy = true;
  worker.postMessage({ type: 'captured', nx: 64, nz: 128, half: VIEWS.near.half, tau });
}
$('tau').oninput = e => { const tau = +e.target.value * 10; $('tauLabel').textContent = `${(tau * FS_PER_AU).toFixed(1)} fs after`; requestCaptured(tau); };

function showResults() {
  $('results').classList.remove('hidden');
  const r = result, end = r.table[r.table.length - 1];
  if (!r.capture) {
    $('capSummary').textContent = r.settings.light ? 'With the Coulomb pull off there is nothing to be bound to.' : `Light is switched off. Without a way to carry energy away, the electron cannot be captured: ${pct(end.inBox)} is still in the box and ${pct(end.gone)} has left; the part in bound shapes stayed at ${fmt(end.boundShare)}.`;
    $('capTable').querySelector('tbody').innerHTML = '';
    return;
  }
  const c = r.capture, tot = c.total;
  $('capSummary').innerHTML = `Share of this pass that ended bound, with a photon given off: <b>${fmt(tot)}</b>. The rest scattered and left (${pct(end.gone)} has reached the edge so far). The part of the starting wave already sitting in bound shapes was ${fmt(r.start.boundShare)}; Schrödinger's equation alone never changes it.`;
  $('capTable').querySelector('tbody').innerHTML = c.byState.filter(x => x.P > tot * 1e-3).sort((a, b) => b.P - a.P)
    .map(x => `<tr><td>${x.n}${L[x.l]}</td><td>${fmt(x.P)}</td><td>${(x.P / tot * 100).toFixed(1)}%</td></tr>`).join('');
  $('textbook').textContent = r.textbook ? `Textbook method (stationary free waves and the Milne relation, a separate code) for shells up to n = 6 at ${r.textbook.energyEv.toFixed(3)} eV: ${fmt(r.textbook.expected)}. This run, same shells: ${fmt(r.textbook.simulated)} (ratio ${r.textbook.ratio.toFixed(3)}).` : '';
  // spectrum
  chart($('spectrum'), r.capture.spectrum.perEv.map((y, i) => [(i + 0.5) / r.capture.spectrum.perEv.length * r.capture.spectrum.maxEv, y]), { xLabel: 'eV', log: false, color: '#ffe94d' });
  // cascade
  chart($('cascadeChart'), r.cascade.curve.filter(p => p.tNs > 0).map(p => [p.tNs, p.excited]), { xLabel: 'ns', logX: true, color: '#2fe3e6', yMax: 1 });
  $('lineTable').querySelector('tbody').innerHTML = r.cascade.lines.filter(x => x.perCapture > 1e-3).slice(0, 12)
    .map(x => `<tr><td>${x.from} → ${x.to}</td><td>${x.nm < 1000 ? x.nm.toFixed(2) + ' nm' : (x.nm / 1000).toFixed(3) + ' µm'}</td><td>${x.perCapture.toFixed(3)}</td></tr>`).join('');
  const lt = (n, l) => r.lifetimes.find(x => x.n === n && x.l === l)?.tauNs;
  const E = (n, l) => r.bound.find(x => x.n === n && x.l === l)?.Eev;
  const mu = 1836.15267343 / 1837.15267343;
  const checks = [
    ['1s energy', `${fmt(E(1, 0), 6)} eV`, `${(-mu * HARTREE_EV / 2).toFixed(6)} eV (Bohr, with recoil)`],
    ['2p energy', `${fmt(E(2, 1), 6)} eV`, `${(-mu * HARTREE_EV / 8).toFixed(6)} eV`],
    ['2p lifetime', `${fmt(lt(2, 1), 4)} ns`, `${TEXTBOOK.lifetimesNs['2p']} ns`],
    ['3p lifetime', `${fmt(lt(3, 1), 3)} ns`, `${TEXTBOOK.lifetimesNs['3p']} ns`],
    ['3d lifetime', `${fmt(lt(3, 2), 2)} ns`, `${TEXTBOOK.lifetimesNs['3d']} ns`],
    ['4f lifetime', `${fmt(lt(4, 3), 2)} ns`, `${TEXTBOOK.lifetimesNs['4f']} ns`],
    ['Probability kept (no edge)', 'see "Still in the box"', 'exactly 1 until the wave reaches the edge'],
  ];
  if (r.settings.fine) checks.splice(2, 0, ['Energy levels include', 'spin and relativity', 'Dirac, without the Lamb shift']);
  $('checkTable').querySelector('tbody').innerHTML = checks.map(x => `<tr><td>${x[0]}</td><td>${x[1]}</td><td>${x[2]}</td></tr>`).join('');
  requestCaptured(0); $('tauLabel').textContent = '0.0 fs after';
}

function chart(canvas, pts, { logX = false, color = '#2fe3e6', yMax } = {}) {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, pad = 34;
  g.clearRect(0, 0, W, H); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (!pts.length) return;
  const xs = pts.map(p => logX ? Math.log10(p[0]) : p[0]), x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ym = yMax || Math.max(...pts.map(p => p[1])) || 1;
  const X = x => pad + (x - x0) / (x1 - x0 || 1) * (W - pad - 8), Y = y => H - pad + 4 - y / ym * (H - pad - 12);
  g.strokeStyle = '#1f2433'; g.fillStyle = '#9aa3b5'; g.font = '11px system-ui';
  for (let k = 0; k <= 4; k++) { const x = x0 + (x1 - x0) * k / 4; g.beginPath(); g.moveTo(X(x), 8); g.lineTo(X(x), H - pad + 4); g.stroke(); const lab = logX ? String(+(10 ** x).toPrecision(2)) : x.toFixed(1); g.fillText(lab, Math.min(X(x) - 10, W - 8 - g.measureText(lab).width), H - pad + 18); }
  g.fillText(fmt(ym), 2, 14);
  g.strokeStyle = color; g.lineWidth = 1.5; g.beginPath();
  pts.forEach((p, i) => { const x = X(logX ? Math.log10(p[0]) : p[0]), y = Y(p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.stroke();
}
void HARTREE_EV;
