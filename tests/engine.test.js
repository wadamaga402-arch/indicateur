// Tests du moteur VolScope : node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const E = require('../engine.js');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} ≠ ${b} (±${tol})`);
const randDigits = (n, weights) => {
  const out = new Array(n);
  const buf = crypto.randomBytes(n * 4);
  for (let i = 0; i < n; i++) {
    const u = buf.readUInt32LE(i * 4) / 2 ** 32;
    if (!weights) { out[i] = Math.floor(u * 10); continue; }
    let acc = 0, d = 9; for (let k = 0; k < 10; k++) { acc += weights[k]; if (u < acc) { d = k; break; } } out[i] = d;
  }
  return out;
};

test('dernier chiffre : respecte les décimales Deriv (zéros finaux inclus)', () => {
  assert.equal(E.lastDigit(1234.5, 2), 0);
  assert.equal(E.lastDigit(1253.24, 2), 4);
  assert.equal(E.lastDigit(6493.271, 3), 1);
  assert.equal(E.lastDigit(0.1 + 0.2, 2), 0);   // 0.30000000000000004 -> "0.30"
  assert.equal(E.lastDigit(838.33, 2), 3);
  assert.equal(E.lastDigit(9999.999, 2), 0);    // arrondi -> "10000.00"
});

test('règles des contrats Matches / Differs', () => {
  assert.equal(E.contractWins('MATCH', 3, 3), true);
  assert.equal(E.contractWins('MATCH', 3, 4), false);
  assert.equal(E.contractWins('DIFF', 3, 3), false);
  assert.equal(E.contractWins('DIFF', 3, 0), true);
  assert.throws(() => E.contractWins('BOTH', 3, 3));
  assert.equal(E.profitOf(true, 5, 8.334), 5 * 7.334);   // vidéo : 5 $ -> +36,67 $
  near(E.profitOf(true, 5, 8.334), 36.67, 0.01);
  assert.equal(E.profitOf(false, 5, 8.334), -5);
});

test('espérance et seuil de rentabilité', () => {
  near(E.expectedValue(0.1, 8.334), -0.1666, 1e-4, 'Matches au hasard');
  near(E.expectedValue(0.9, 1.09), -0.019, 1e-9, 'Differs au hasard');
  near(E.breakEven(8.334), 0.12, 1e-3);
});

test('chi² : p-values de référence (df = 9)', () => {
  near(E.chiSquareP(16.919, 9), 0.05, 5e-4);
  near(E.chiSquareP(21.666, 9), 0.01, 2e-4);
  near(E.chiSquareP(4.168, 9), 0.90, 2e-3);
  const u = E.chiSquare([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  assert.equal(u.chi2, 0); near(u.p, 1, 1e-12);
});

test('z-score et intervalle de Wilson', () => {
  near(E.zScore(20, 100), 10 / 3, 1e-12);
  near(E.zScore(10, 100), 0, 1e-12);
  const [lo, hi] = E.wilson(10, 100);
  near(lo, 0.0552, 5e-4); near(hi, 0.1744, 5e-4);
});

test('backtest = simulation naïve tick par tick (pas de regard vers le futur)', () => {
  const d = randDigits(3000);
  for (const strat of [{ contract: 'MATCH', rule: 'hot', window: 50, zMin: 1 }, { contract: 'DIFF', rule: 'cold', window: 25, zMin: 0 }, { contract: 'MATCH', rule: 'last', window: 1, zMin: 0 }]) {
    const bt = E.backtest(d, strat, 8.3, 0, d.length);
    let trades = 0, wins = 0;
    for (let t = 0; t <= d.length - 2; t++) {
      const dec = E.decide(d.slice(0, t + 1), strat);  // ne voit que le passé
      if (!dec) continue;
      trades++; if (E.contractWins(strat.contract, dec.barrier, d[t + 1])) wins++;
    }
    assert.equal(bt.trades, trades, E.stratName(strat));
    assert.equal(bt.wins, wins, E.stratName(strat));
  }
});

test('séquences déterministes : le moteur lit bien le chiffre suivant', () => {
  const rep = Array.from({ length: 500 }, (_, i) => Math.floor(i / 2) % 10); // 0,0,1,1,2,2...
  const r = E.backtest(rep, { contract: 'MATCH', rule: 'last', window: 1, zMin: 0 }, 8.3);
  near(r.winRate, 0.5, 0.01);
  const cyc = Array.from({ length: 500 }, (_, i) => i % 10);
  assert.equal(E.backtest(cyc, { contract: 'MATCH', rule: 'last', window: 1, zMin: 0 }, 8.3).wins, 0);
});

test('données au hasard (comme Deriv) : aucune stratégie validée', () => {
  for (let run = 0; run < 5; run++) {
    const d = randDigits(20000);
    const res = E.optimize(d, { MATCH: 8.3, DIFF: 1.09 });
    assert.equal(res.tested, 62);
    assert.equal(res.validated.length, 0, `run ${run}: ${res.validated.map(v => v.name).join(', ')}`);
  }
});

test('données biaisées (7 sort 20 %) : le moteur détecte et valide le vrai avantage', () => {
  const w = [0.08889, 0.08889, 0.08889, 0.08889, 0.08889, 0.08889, 0.08889, 0.2, 0.08889, 0.08888];
  const d = randDigits(20000, w);
  const res = E.optimize(d, { MATCH: 8.3, DIFF: 1.09 });
  assert.ok(res.validated.length > 0, 'aucune validée');
  assert.ok(res.validated.some(v => v.strat.contract === 'MATCH' && v.strat.rule === 'hot'));
  const dec = E.decide(d.slice(-500), { contract: 'MATCH', rule: 'hot', window: 500, zMin: 2 });
  assert.equal(dec && dec.barrier, 7);
});

test('classement : les stratégies sans assez de contrats passent en dernier', () => {
  const res = E.optimize(randDigits(10000), { MATCH: 8.3, DIFF: 1.09 });
  const firstSmall = res.rows.findIndex(r => r.train.trades < 300);
  if (firstSmall >= 0) assert.ok(res.rows.slice(firstSmall).every(r => r.train.trades < 300));
  assert.ok(res.rows[0].train.trades >= 300);
});

test('vérification de flux', () => {
  const now = 1_800_000_000;
  const ep = Array.from({ length: 50 }, (_, i) => now - 50 + i);
  assert.equal(E.checkFeed(ep, now, 1).ok, true);
  assert.equal(E.checkFeed(ep, now + 120, 1).ok, false);                  // flux figé
  assert.equal(E.checkFeed([...ep].reverse(), now, 1).ok, false);         // horodatage incohérent
  assert.equal(E.checkFeed(ep.map((e, i) => now - 100 + 2 * i), now, 1).ok, false); // mauvaise cadence
});

test('tests multiples (chiffres) : faux positifs ≤ 10 % sur 40 séries au hasard', () => {
  let fp = 0;
  for (let k = 0; k < 40; k++) if (E.optimize(randDigits(10000), { MATCH: 8.3, DIFF: 1.09 }).validated.length) fp++;
  assert.ok(fp <= 4, `faux positifs : ${fp}/40`);
});
