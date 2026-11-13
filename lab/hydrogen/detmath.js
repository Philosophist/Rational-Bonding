// Deterministic elementary functions.
// JavaScript's Math.exp / Math.sin / Math.cos may differ in the last digit between browsers. These
// use only + − × ÷ (which IEEE 754 fixes exactly), so every machine gets the same bits and a run
// is reproduced exactly from its settings. Accuracy is a few units in the last place.

const LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10, INV_LN2 = 1.44269504088896338700e+00;
const buf = new DataView(new ArrayBuffer(8));
function pow2(k) {                       // 2^k exactly, for -1022 <= k <= 1023
  buf.setUint32(0, (k + 1023) << 20); buf.setUint32(4, 0);
  return buf.getFloat64(0);
}
export function exp(x) {
  if (x !== x) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745.2) return 0;
  const k = Math.round(x * INV_LN2);     // Math.round is exact
  const r = (x - k * LN2_HI) - k * LN2_LO;
  // Taylor series of e^r, |r| <= 0.347: 18 terms reach below 1e-17.
  let s = 1, t = 1;
  for (let i = 1; i <= 18; i++) { t *= r / i; s += t; }
  if (k < -1021) return s * pow2(k + 600) * pow2(-600);
  if (k > 1023) return s * pow2(k - 1) * 2;
  return s * pow2(k);
}

const PIO2_1 = 1.57079632673412561417e+00, PIO2_1T = 6.07710050650619224932e-11;
const INV_PIO2 = 6.36619772367581382433e-01;
function reduce(x) {                     // x = q·π/2 + r, |r| <= π/4 (Cody–Waite; exact enough for |x| < 1e6)
  const q = Math.round(x * INV_PIO2);
  return [q, (x - q * PIO2_1) - q * PIO2_1T];
}
function sinK(r) { const r2 = r * r; let t = r, s = r; for (let i = 1; i <= 11; i++) { t *= -r2 / ((2 * i) * (2 * i + 1)); s += t; } return s; }
function cosK(r) { const r2 = r * r; let t = 1, s = 1; for (let i = 1; i <= 11; i++) { t *= -r2 / ((2 * i - 1) * (2 * i)); s += t; } return s; }
export function sincos(x) {
  const [q, r] = reduce(x), s = sinK(r), c = cosK(r);
  switch (((q % 4) + 4) % 4) {
    case 0: return [s, c];
    case 1: return [c, -s];
    case 2: return [-s, -c];
    default: return [-c, s];
  }
}
export const sin = x => sincos(x)[0];
export const cos = x => sincos(x)[1];
