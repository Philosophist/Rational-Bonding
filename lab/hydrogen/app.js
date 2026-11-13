// The page: settings, a worker that runs the experiment, and playback of the recording in 3D.
import { DEFAULTS, FS_PER_AU, A0_NM, HARTREE_EV, VERSION } from './sim.js';
import { GRIDS, CURRENT, RAD, LPOT, CUMR, unpackLog } from './fields.js';
import { TEXTBOOK } from './compare.js';
import { Viewer } from './view3d.js';

const $ = id => document.getElementById(id);
const L = 'spdfghik';
const fmt = (x, d = 3) => (x === undefined || x === null || !isFinite(x)) ? '–' : (Math.abs(x) >= 1e-3 && Math.abs(x) < 1e4 ? x.toFixed(d) : x.toExponential(2));
const pct = x => (x * 100).toFixed(x < 0.01 ? 4 : 2) + '%';
const nm = a => a * A0_NM;

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------
const STOPS = [[0, 0, 0], [20, 30, 110], [59, 109, 255], [47, 227, 230], [255, 233, 77], [255, 255, 255]];
const LUT = new Uint8ClampedArray(256 * 3);
for (let i = 0; i < 256; i++) {
  const x = i / 255 * (STOPS.length - 1), k = Math.min(STOPS.length - 2, Math.floor(x)), f = x - k;
  for (let c = 0; c < 3; c++) LUT[3 * i + c] = STOPS[k][c] + f * (STOPS[k + 1][c] - STOPS[k][c]);
}
{ const g = $('legend').getContext('2d'), im = g.createImageData(180, 10);
  for (let x = 0; x < 180; x++) for (let y = 0; y < 10; y++) { const i = Math.round(x / 179 * 255), o = 4 * (y * 180 + x); im.data[o] = LUT[3 * i]; im.data[o + 1] = LUT[3 * i + 1]; im.data[o + 2] = LUT[3 * i + 2]; im.data[o + 3] = 255; }
  g.putImageData(im, 0, 0); }

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let worker = null, frames = [], result = null, cur = 0, playing = false, flags = [], settingsUsed = null, runStart = 0;
const view = { mode: 'cloud', scale: 'linear', showE: false, showJ: false };
const peakRun = new Float64Array(CUMR.length);        // densest point within each radius, over the run
const colRun = GRIDS.map(() => 0);                    // densest line of sight within each grid's sphere, over the run
const jMax = CURRENT.map(() => 0);                     // largest current on each current grid, over the run
const frameFs = () => DEFAULTS.dt * DEFAULTS.frameEvery * FS_PER_AU;
const pixR = GRIDS.map(g => { const r = new Float32Array(g.nx * g.nz); for (let iz = 0; iz < g.nz; iz++) for (let ix = 0; ix < g.nx; ix++) { const x = g.half * (ix + 0.5) / g.nx, z = g.half - 2 * g.half * (iz + 0.5) / g.nz; r[iz * g.nx + ix] = Math.hypot(x, z); } return r; });
const binOf = r => { let k = 0; while (k < CUMR.length - 1 && CUMR[k] < r) k++; return k; };

let viewer = null, capViewer = null;
try {
  viewer = new Viewer($('view'), LUT, { onChange: () => redraw() });
  capViewer = new Viewer($('captured'), LUT, { onChange: () => drawCaptured() });
  capViewer.maxR = 60; capViewer.R = 12;
} catch (e) { $('hud').textContent = e.message; }

function readSettings() {
  const num = id => +$(id).value, on = id => $(id).checked;
  return { startNm: num('startNm'), energyEv: num('energyEv'), widthNm: num('widthNm'), coulomb: on('coulomb'), recoil: on('recoil'), light: on('light'), fine: on('fine') };
}
function updateEstimate() {
  const s = readSettings();
  // measured: about 13 ms per step with spin in Chrome on one core (27 in Firefox), about 6 without
  const ms = (s.fine && s.coulomb ? 15 : 7.5) * DEFAULTS.tEndAu / DEFAULTS.dt;
  $('estimate').textContent = `about ${Math.round(ms / 60000)} min in Chrome, one CPU core (Firefox about twice as long)`;
}
document.querySelectorAll('#setup input').forEach(el => el.addEventListener('input', updateEstimate));
updateEstimate();

$('run').onclick = () => {
  if (worker) worker.terminate();
  frames = []; result = null; cur = 0; flags = []; playing = false; renderFlags();
  peakRun.fill(0); jMax.fill(0); colRun.fill(0);
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
    // run-wide references for the colour scale and the arrows
    const pk = new Float64Array(CUMR.length);
    m.dens.forEach((d, gi) => { const R = pixR[gi]; for (let i = 0; i < d.length; i++) if (d[i]) { const v = 10 ** unpackLog(d[i]), k = binOf(R[i]); if (v > pk[k]) pk[k] = v; } });
    for (let k = 1; k < pk.length; k++) pk[k] = Math.max(pk[k], pk[k - 1]);
    for (let k = 0; k < pk.length; k++) peakRun[k] = Math.max(peakRun[k], pk[k]);
    m.dens.forEach((d, gi) => { colRun[gi] = Math.max(colRun[gi], maxColumn(d, GRIDS[gi])); });
    m.cur.forEach((c, gi) => { for (let i = 0; i < c.length; i += 2) jMax[gi] = Math.max(jMax[gi], Math.hypot(c[i], c[i + 1])); });
    frames.push({ obs: m.obs, dens: m.dens, cum: m.cum, phi: m.phi, cur: m.cur });
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
    capGrids = m.grids.filter(g => g.log10);
    capBusy = false;
    drawCaptured();
    if (capWant !== null && capWant !== m.tau) requestCaptured(capWant);
  }
}

// ---------------------------------------------------------------------------
// Drawing one moment
// ---------------------------------------------------------------------------
function cumAt(cum, R) {          // share of the electron within R (log interpolation in R)
  if (R <= CUMR[0]) return cum[0];
  for (let k = 1; k < CUMR.length; k++) if (CUMR[k] >= R) { const f = Math.log(R / CUMR[k - 1]) / Math.log(CUMR[k] / CUMR[k - 1]); return cum[k - 1] + f * (cum[k] - cum[k - 1]); }
  return cum[cum.length - 1];
}
function peakAt(R) { return peakRun[binOf(R)] || 1; }
// The densest line of sight through the cloud inside a grid's sphere: looking across the axis
// (through it) or along it. The cloud is the same all round the axis, so the half-slice is enough.
function maxColumn(d, g) {
  const dx = g.half / g.nx, dz = 2 * g.half / g.nz, R2 = g.half * g.half;
  const along = new Float64Array(g.nx); let best = 0;
  for (let iz = 0; iz < g.nz; iz++) {
    const z = g.half - (iz + 0.5) * dz; let across = 0;
    for (let ix = 0; ix < g.nx; ix++) {
      const x = (ix + 0.5) * dx; if (x * x + z * z > R2) break;
      const v = d[iz * g.nx + ix]; if (!v) continue;
      const rho = 10 ** unpackLog(v); across += 2 * rho * dx; along[ix] += rho * dz;
    }
    if (across > best) best = across;
  }
  for (let ix = 0; ix < g.nx; ix++) if (along[ix] > best) best = along[ix];
  return best;
}
function columnAt(R) {            // from the smallest recorded grid that holds the zoom sphere
  let gi = 0; GRIDS.forEach((g, i) => { if (g.half >= R && g.half <= GRIDS[gi].half) gi = i; });
  return colRun[gi] || peakAt(R) * R;
}

let shownFrame = -1;
function redraw() {
  if (!viewer || !frames.length) return;
  const f = frames[cur], R = viewer.R;
  if (shownFrame !== cur) {
    viewer.setGrids(GRIDS.map((g, i) => ({ ...g, log10: Float32Array.from(f.dens[i], unpackLog) })));
    shownFrame = cur;
  }
  viewer.slice = view.mode === 'slice'; viewer.logMode = view.scale === 'log';
  // white: the densest point (flat cut) or the densest line of sight (3D glow) seen within this
  // zoom over the whole run. Fixed for the run, so brightness can be compared across time.
  const peak = peakAt(R), col = columnAt(R);
  viewer.white = viewer.slice ? peak : col;
  const segs = [];
  if (view.showE) fieldLines(f, R, segs);
  if (view.showJ) flowArrows(f, R, segs);
  segs.push(...axisMarks(R));
  viewer.setLines(new Float32Array(segs));
  viewer.draw();
  const share = cumAt(f.cum, R), inBox = f.obs.inBox;
  const unit = viewer.slice ? `${fmt(peak / A0_NM ** 3)} per nm³` : `${fmt(col / A0_NM ** 2)} per nm² along the line of sight`;
  $('hud').innerHTML = `t = ${f.obs.tFs.toFixed(2)} fs · sphere shown: ${fmt(nm(R) * 2, 2)} nm across<br>` +
    `inside it: <b>${pct(Math.min(share, inBox))}</b> of the electron (${pct(inBox)} still in the box)` +
    (view.showE ? '<br><span style="color:#e04dff">— electric field lines from the proton</span>' : '') +
    (view.showJ ? '<br><span style="color:#ffe94d">→ electron flow</span>' : '');
  $('legLo').textContent = view.scale === 'log' ? '10⁻¹⁰ of white' : 'none';
  $('legHi').textContent = 'white';
  $('legendNote').textContent = `${view.scale === 'log' ? 'Log scale: each colour step is ×10, so very faint parts show. ' : 'True amounts: brightness is proportional to the amount of electron. '}White = ${unit} (the most this zoom shows at any moment of the run, so brightness compares fairly across time).`;
}

// a faint line along the axis the electron came in on, and a marker at the proton
function axisMarks(R) {
  const c = [0.6, 0.65, 0.75, 0.35], m = [0.88, 0.3, 1, 0.9], s = R * 0.03;
  return [0, -R, 0, ...c, 0, R, 0, ...c,
    -s, 0, 0, ...m, s, 0, 0, ...m, 0, -s, 0, ...m, 0, s, 0, ...m, 0, 0, -s, ...m, 0, 0, s, ...m];
}

// Electric potential: proton +1/r plus the electron cloud's multipoles; field = −∇φ.
const PL = new Float64Array(LPOT + 1);
function potential(f, rho, y) {
  const r = Math.max(1e-4, Math.hypot(rho, y)), mu = y / r;
  let k = r < 16 ? (r - 0.1) / 0.2 : 80 + (r - 16) / 2, j = Math.max(0, Math.min(RAD.length - 2, Math.floor(k))), t = Math.max(0, Math.min(1, k - j));
  if (r > RAD[RAD.length - 1]) { j = RAD.length - 2; t = 1; }
  PL[0] = 1; PL[1] = mu;
  for (let l = 2; l <= LPOT; l++) PL[l] = ((2 * l - 1) * mu * PL[l - 1] - (l - 1) * PL[l - 2]) / l;
  let phi = 1 / r;
  const NR = RAD.length;
  for (let l = 0; l <= LPOT; l++) { const a = f.phi[l * NR + j], b = f.phi[l * NR + j + 1]; phi += (a + t * (b - a)) * PL[l]; }
  return phi;
}
function field(f, rho, y) {
  const d = Math.max(1e-4, 1e-3 * Math.hypot(rho, y));
  const er = -(potential(f, rho + d, y) - potential(f, Math.abs(rho - d), y)) / (2 * d);
  const ey = -(potential(f, rho, y + d) - potential(f, rho, y - d)) / (2 * d);
  return [er, ey];
}
function fieldLines(f, R, segs) {
  const seeds = 12, az = 6, col = [0.88, 0.3, 1, 0.75];
  const r0 = Math.min(0.5, 0.02 * R);
  for (let k = 0; k < seeds; k++) {
    const th = Math.acos(1 - 2 * (k + 0.5) / seeds);       // equal flux from the proton per line
    let rho = r0 * Math.sin(th), y = r0 * Math.cos(th), prev = null;
    const pts = [[rho, y]];
    for (let it = 0; it < 1500; it++) {
      const r = Math.hypot(rho, y), ds = Math.min(R / 120, 0.15 * r + 1e-3);
      let [er, ey] = field(f, rho, y); const e = Math.hypot(er, ey);
      if (!(e > 1e-12)) break;
      er /= e; ey /= e;
      if (prev && er * prev[0] + ey * prev[1] < -0.2) break;   // reached the charge it ends on
      // midpoint step
      let [mr, my] = field(f, Math.abs(rho + 0.5 * ds * er), y + 0.5 * ds * ey); const me = Math.hypot(mr, my);
      if (!(me > 1e-12)) break;
      rho = Math.abs(rho + ds * mr / me); y += ds * my / me; prev = [er, ey];
      pts.push([rho, y]);
      if (Math.hypot(rho, y) > R) break;
    }
    for (let a = 0; a < az; a++) {
      const ca = Math.cos(2 * Math.PI * a / az), sa = Math.sin(2 * Math.PI * a / az);
      for (let i = 1; i < pts.length; i++) segs.push(pts[i - 1][0] * ca, pts[i - 1][1], pts[i - 1][0] * sa, ...col, pts[i][0] * ca, pts[i][1], pts[i][0] * sa, ...col);
    }
  }
}
function flowArrows(f, R, segs) {
  let gi = CURRENT.length - 1; while (gi > 0 && CURRENT[gi].half < R * 0.9) gi--;
  const g = CURRENT[gi], c = f.cur[gi], cell = g.half / g.nx, jm = jMax[gi] || 1, col = [1, 0.91, 0.3, 0.9];
  for (let iz = 0; iz < g.nz; iz++) for (let ix = 0; ix < g.nx; ix++) {
    const x = g.half * (ix + 0.5) / g.nx, z = g.half - 2 * g.half * (iz + 0.5) / g.nz;
    if (Math.hypot(x, z) > R) continue;
    const k = 2 * (iz * g.nx + ix), jx = c[k], jz = c[k + 1], j = Math.hypot(jx, jz);
    if (j < 0.01 * jm) continue;
    const len = 1.8 * cell * j / jm, ux = jx / j, uz = jz / j;
    for (let a = 0; a < 4; a++) {
      const ca = Math.cos(Math.PI / 2 * a + 0.3), sa = Math.sin(Math.PI / 2 * a + 0.3);
      const P = (px, pz) => [px * ca, pz, px * sa];
      const tip = [x + ux * len, z + uz * len], h = 0.35 * len;
      const l1 = [tip[0] - h * (ux + 0.5 * uz), tip[1] - h * (uz - 0.5 * ux)], l2 = [tip[0] - h * (ux - 0.5 * uz), tip[1] - h * (uz + 0.5 * ux)];
      for (const [p, q] of [[[x, z], tip], [tip, l1], [tip, l2]]) segs.push(...P(...p), ...col, ...P(...q), ...col);
    }
  }
}

function show(i) {
  if (!frames.length) return;
  cur = Math.max(0, Math.min(frames.length - 1, i));
  redraw();
  $('scrub').value = cur;
  const o = frames[cur].obs;
  $('clock').textContent = `t = ${o.tFs.toFixed(2)} fs`;
  const rows = [
    ['Time', `${o.tFs.toFixed(2)} fs`],
    ['Still in the box', pct(o.inBox)],
    ['Energy', `${o.energyEv.toFixed(5)} eV`],
    ['Average distance from the proton', `${o.meanRNm.toFixed(3)} nm`],
  ];
  if (o.boundShare !== undefined) rows.push(['In bound shapes (no light needed)', fmt(o.boundShare)], ['Captured with a photon', fmt(o.captured)]);
  if (settingsUsed && settingsUsed.fine) rows.push(['Spin flipped', fmt(o.spinFlipped)]);
  $('stats').innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
}

// view controls
function seg(id, key, after) {
  $(id).querySelectorAll('button').forEach(b => { b.onclick = () => { $(id).querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); view[key] = b.dataset.v; after && after(); redraw(); }; });
}
seg('modeSeg', 'mode'); seg('scaleSeg', 'scale', () => drawCaptured());
$('showE').onchange = e => { view.showE = e.target.checked; redraw(); };
$('showJ').onchange = e => { view.showJ = e.target.checked; redraw(); };
$('zoomSeg').querySelectorAll('button').forEach(b => { b.onclick = () => viewer && viewer.zoomTo(+b.dataset.r); });
window.addEventListener('resize', () => { redraw(); drawCaptured(); });

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
    acc += (t - last) / 1000 * 2.4 * +$('speed').value / frameFs();
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
const viewState = () => viewer ? { ...view, yaw: viewer.yaw, pitch: viewer.pitch, sphereRadiusNm: nm(viewer.R) } : { ...view };
$('flag').onclick = () => {
  const o = frames[cur].obs;
  flags.push({ frame: cur, tFs: o.tFs, note: $('flagNote').value.trim(), view: viewState(), hud: $('hud').innerText, obs: o, still: still() });
  $('flagNote').value = '';
  renderFlags();
};
function renderFlags() {
  $('flags').innerHTML = flags.map((f, i) => `<li><a href="#" data-i="${i}">${f.tFs.toFixed(2)} fs</a>${f.note ? ': ' + f.note.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) : ''}</li>`).join('');
  $('flags').querySelectorAll('a').forEach(a => { a.onclick = e => { e.preventDefault(); playing = false; const f = flags[+a.dataset.i]; if (viewer && f.view) { viewer.yaw = f.view.yaw; viewer.pitch = f.view.pitch; viewer.R = f.view.sphereRadiusNm / A0_NM; } show(f.frame); }; });
}
function still() { redraw(); return $('view').toDataURL('image/png'); }
function keyMoments() {
  const T = frames.map(f => f.obs), closest = T.reduce((a, b, i) => (b.meanRNm < T[a].meanRNm ? i : a), 0);
  const picks = [['start', 0], ['closest approach', closest], ['halfway out', Math.round((closest + T.length - 1) / 2)], ['end', T.length - 1]];
  const keep = cur, out = [];
  for (const [name, i] of picks) { show(i); out.push({ name, frame: i, tFs: T[i].tFs, hud: $('hud').innerText, still: still() }); }
  show(keep);
  return out;
}
$('report').onclick = () => {
  if (!result) return;
  const rep = {
    what: 'Hydrogen Lab run report (rationalbonding.com/lab/hydrogen). Rerun exactly with: node lab/hydrogen/headless.mjs <this file>',
    version: VERSION, settings: result.settings, grid: result.grid, timing: result.timing,
    view: viewState(), currentFrame: cur,
    table: result.table.map(o => ({ tFs: +o.tFs.toFixed(4), inBox: o.inBox, energyEv: o.energyEv, meanRNm: o.meanRNm, boundShare: o.boundShare, captured: o.captured, lightEnergyEv: o.lightEnergyEv, spinFlipped: o.spinFlipped })),
    withinRadius: { radiiNm: Array.from(CUMR, nm), atKeyFrames: [0, Math.floor(frames.length / 4), Math.floor(frames.length / 2), frames.length - 1].map(i => ({ tFs: frames[i].obs.tFs, share: Array.from(frames[i].cum) })) },
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
const CAPGRIDS = [{ half: 60, nx: 80, nz: 160 }, { half: 8, nx: 64, nz: 128 }];
let capGrids = null, capBusy = false, capWant = null;
function requestCaptured(tau) {
  capWant = tau;
  if (capBusy || !worker) return;
  capBusy = true;
  worker.postMessage({ type: 'captured', grids: CAPGRIDS, tau });
}
function drawCaptured() {
  if (!capViewer || !capGrids || !capGrids.length) return;
  capViewer.setGrids(capGrids);
  let peak = -99; for (const g of capGrids) for (const v of g.log10) if (v > peak) peak = v;
  capViewer.logMode = view.scale === 'log'; capViewer.slice = view.mode === 'slice';
  capViewer.white = capViewer.slice ? 10 ** peak : 10 ** peak * capViewer.R;
  capViewer.setLines(new Float32Array(axisMarks(capViewer.R)));
  capViewer.draw();
  $('capHud').innerHTML = `sphere shown: ${fmt(nm(capViewer.R) * 2, 2)} nm across · ${view.scale === 'log' ? 'log scale' : 'true amounts'}, white = this cloud's own densest part`;
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
  chart($('spectrum'), r.capture.spectrum.perEv.map((y, i) => [(i + 0.5) / r.capture.spectrum.perEv.length * r.capture.spectrum.maxEv, y]), { color: '#ffe94d' });
  chart($('cascadeChart'), r.cascade.curve.filter(p => p.tNs > 0).map(p => [p.tNs, p.excited]), { logX: true, color: '#2fe3e6', yMax: 1 });
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
