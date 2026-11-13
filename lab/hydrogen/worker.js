// Runs the experiment off the page's main thread and streams the recording back.
import { runExperiment } from './run.js';
import { compareTextbook } from './compare.js';

let last = null, lastRho = null;
self.onmessage = async ev => {
  const m = ev.data;
  if (m.type === 'run') {
    let lastP = 0;
    const res = runExperiment(m.settings, {
      onFrame: f => self.postMessage({ type: 'frame', ...f }, [f.wide.buffer, f.near.buffer]),
      onProgress: p => { if (p - lastP > 0.002 || p === 1) { lastP = p; self.postMessage({ type: 'progress', p }); } },
      now: () => performance.now(),
    });
    last = res._sim || null; lastRho = res.rho || null;
    delete res._sim; delete res.rho;
    if (res.capture) res.textbook = await compareTextbook(res);
    self.postMessage({ type: 'done', result: res });
  } else if (m.type === 'captured' && last && lastRho) {
    // the captured electron's cloud, τ a.u. after the collision
    const img = last.capturedImage(m.nx, m.nz, m.half, lastRho, m.tau);
    self.postMessage({ type: 'captured', img, tau: m.tau, key: m.key }, img ? [img.buffer] : []);
  }
};
