// node --test tests/trend-engine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const T = require('../trend-engine.js');
const near = (a, b, t, m) => assert.ok(Math.abs(a - b) <= t, `${m || ''} ${a} ≠ ${b}`);

function rng(n) { const b = crypto.randomBytes(n * 4); return i => b.readUInt32LE(i * 4) / 2 ** 32; }
function gauss(u1, u2) { return Math.sqrt(-2 * Math.log(u1 || 1e-12)) * Math.cos(2 * Math.PI * u2); }
// marche aléatoire arrondie à 2 décimales (comme un indice Volatility)
function randomWalk(n, opts) {
  opts = opts || {}; const r = rng(2 * n); const p = new Array(n); let x = 1000, prev = 0;
  for (let i = 0; i < n; i++) {
    let e = gauss(r(2 * i), r(2 * i + 1)) * 0.5;
    if (opts.ar) { e = opts.ar * prev + e; prev = e; }   // rendements autocorrélés = vraie tendance exploitable
    x += e + (opts.drift || 0); p[i] = Math.round(x * 100) / 100;
  }
  return p;
}
const PAY = { 1: { 1: 1.95, '-1': 1.95 }, 5: { 1: 1.95, '-1': 1.95 }, 10: { 1: 1.95, '-1': 1.95 } };
for (const h of [1, 5, 10]) PAY[h][-1] = PAY[h]['-1'];

test('indicateurs : EMA, moyenne/écart-type glissants, max/min précédents, RSI', () => {
  const e = T.ema([1, 2, 3], 3); near(e[1], 1.5, 1e-12); near(e[2], 2.25, 1e-12);
  const r = T.rollingMeanStd([1, 2, 3, 4], 2); assert.ok(isNaN(r.mean[0])); near(r.mean[3], 3.5, 1e-12); near(r.std[3], 0.5, 1e-12);
  const mm = T.prevMaxMin([5, 1, 7, 3, 2], 2); assert.ok(isNaN(mm.max[1])); assert.equal(mm.max[2], 5); assert.equal(mm.min[2], 1); assert.equal(mm.max[4], 7); assert.equal(mm.min[4], 3);
  near(T.rsi([1, 2, 3, 4, 5, 6], 5), 100, 1e-9);
  near(T.rsi([1, 2, 1, 2, 1, 2, 1], 6), 50, 1e-9);
});

test('règles Rise/Fall : égalité = perdu', () => {
  assert.equal(T.riseFallWins(1, 100, 100.01), true);
  assert.equal(T.riseFallWins(1, 100, 100), false);
  assert.equal(T.riseFallWins(-1, 100, 99.99), true);
  assert.equal(T.riseFallWins(-1, 100, 100), false);
  assert.throws(() => T.riseFallWins(0, 1, 2));
  assert.equal(T.profit(true, 10, 1.95), 9.5); assert.equal(T.profit(false, 10, 1.95), -10);
});

test('métriques : drawdown max et pertes consécutives sur une série connue', () => {
  const m = T.metrics([1, -1, -1, -1, 2, -1, 0.5]);
  assert.equal(m.trades, 7); assert.equal(m.wins, 3); assert.equal(m.maxConsecLosses, 3);
  near(m.maxDrawdown, 3, 1e-12); near(m.net, -0.5, 1e-12); near(m.profitFactor, 3.5 / 4, 1e-12);
});

test('signaux causaux : modifier le futur ne change pas le passé', () => {
  const p = randomWalk(3000);
  for (const s of T.grid().filter(s => s.H === 1)) {
    const a = T.buildSignals(p, s);
    const q = p.slice(); for (let i = 2000; i < q.length; i++) q[i] += 50 * Math.sin(i);
    const b = T.buildSignals(q, s);
    for (let i = 0; i < 2000; i++) assert.equal(a[i], b[i], `${T.describe(s)} @${i}`);
  }
});

test('backtest = simulation naïve (entrée t+1, sortie t+1+H, sans chevauchement)', () => {
  const p = randomWalk(4000);
  for (const s of [{ type: 'ema', fast: 10, slow: 50, m: 0, H: 5 }, { type: 'meanrev', n: 50, k: 2, H: 1 }, { type: 'breakout', n: 20, H: 10 }]) {
    const bt = T.backtest(p, s, PAY[s.H]);
    let t = T.warmup(s), n = 0, w = 0;
    while (t + 1 + s.H < p.length) {
      const side = T.buildSignals(p.slice(0, t + 1), s)[t];   // ne voit que le passé
      if (!side) { t++; continue; }
      n++; if (T.riseFallWins(side, p[t + 1], p[t + 1 + s.H])) w++; t += 1 + s.H;
    }
    assert.equal(bt.trades, n, T.describe(s)); assert.equal(bt.wins, w, T.describe(s));
  }
});

test('marché au hasard : aucune stratégie validée (5 essais × toutes les stratégies)', () => {
  for (let k = 0; k < 5; k++) {
    const res = T.optimize(randomWalk(20000), PAY);
    assert.equal(res.rows.length, T.grid().length);
    assert.equal(res.validated.length, 0, res.validated.map(v => v.name).join(', '));
  }
});

test('marché avec vraie tendance (rendements autocorrélés) : le moteur la détecte et la valide', () => {
  const res = T.optimize(randomWalk(20000, { ar: 0.35 }), PAY);
  assert.ok(res.validated.length > 0, 'rien de validé');
  assert.ok(res.validated.some(v => v.strat.type === 'momentum' || v.strat.type === 'ema' || v.strat.type === 'breakout'));
});

test('analyse en direct : refuse quand il manque quelque chose', () => {
  const p = randomWalk(1000), s = { type: 'ema', fast: 5, slow: 20, m: 0, H: 5 };
  assert.equal(T.analyze({ prices: p, strat: s, payout: PAY[5], stake: 1, feedOk: false }).signal, 'NO TRADE');
  assert.equal(T.analyze({ prices: p.slice(0, 30), strat: s, payout: PAY[5], stake: 1, feedOk: true }).signal, 'NO TRADE');
  assert.equal(T.analyze({ prices: p, strat: s, payout: null, stake: 1, feedOk: true }).signal, 'NO TRADE');
  const r = T.analyze({ prices: p, strat: s, payout: PAY[5], stake: 2, feedOk: true, onlyValidated: false });
  assert.ok(['BUY', 'SELL', 'NO TRADE'].includes(r.signal));
  if (r.signal !== 'NO TRADE') { near(r.gain, 1.9, 1e-9); assert.equal(r.loss, 2); assert.ok(r.reason && r.scenario && isFinite(r.invalidation)); assert.equal(r.prob, 0.5); }
  const r2 = T.analyze({ prices: p, strat: s, payout: PAY[5], stake: 1, feedOk: true, onlyValidated: true });
  assert.equal(r2.signal, 'NO TRADE');  // non testée -> refusée
});

test('tests multiples : taux de faux positifs ≤ 10 % sur 40 marchés au hasard (correction de Bonferroni)', () => {
  let falsePos = 0;
  for (let k = 0; k < 40; k++) if (T.optimize(randomWalk(10000), PAY).validated.length) falsePos++;
  assert.ok(falsePos <= 4, `faux positifs : ${falsePos}/40`);
});
