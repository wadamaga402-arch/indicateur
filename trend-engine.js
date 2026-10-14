/* Profit Analysis Engine — moteur directionnel BUY / SELL / NO TRADE pour les indices Volatility de Deriv.
 * Fonctions pures (aucun réseau, aucune donnée inventée) : navigateur + Node.
 *
 * Contrat évalué : Rise/Fall Deriv sur H ticks.
 *  - Décision au tick t (données jusqu'à t uniquement).
 *  - Entrée = tick t+1 (premier tick après l'achat), sortie = tick t+1+H.
 *  - BUY (Rise) gagne si sortie > entrée (strictement). SELL (Fall) gagne si sortie < entrée. Égalité = perdu.
 *  - Une seule position à la fois : après un trade on attend la sortie avant d'en ouvrir un autre.
 */
(function (root) {
  'use strict';
  const T = {};

  /* ---------------- Indicateurs (séries complètes, O(n)) ---------------- */
  T.ema = function (p, n) {
    const out = new Float64Array(p.length), a = 2 / (n + 1);
    if (!p.length) return out;
    out[0] = p[0];
    for (let i = 1; i < p.length; i++) out[i] = out[i - 1] + a * (p[i] - out[i - 1]);
    return out;
  };
  // moyenne et écart-type glissants sur n valeurs se terminant en i (NaN avant)
  T.rollingMeanStd = function (x, n) {
    const m = new Float64Array(x.length).fill(NaN), s = new Float64Array(x.length).fill(NaN);
    let sum = 0, sq = 0;
    for (let i = 0; i < x.length; i++) {
      sum += x[i]; sq += x[i] * x[i];
      if (i >= n) { sum -= x[i - n]; sq -= x[i - n] * x[i - n]; }
      if (i >= n - 1) { const mu = sum / n; m[i] = mu; s[i] = Math.sqrt(Math.max(0, sq / n - mu * mu)); }
    }
    return { mean: m, std: s };
  };
  T.diffs = function (p) { const d = new Float64Array(p.length); for (let i = 1; i < p.length; i++) d[i] = p[i] - p[i - 1]; return d; };
  // max / min des n prix PRÉCÉDENTS (i-n .. i-1), deque monotone
  T.prevMaxMin = function (p, n) {
    const mx = new Float64Array(p.length).fill(NaN), mn = new Float64Array(p.length).fill(NaN);
    const dq1 = [], dq2 = [];
    for (let i = 0; i < p.length; i++) {
      if (i >= n) { mx[i] = p[dq1[0]]; mn[i] = p[dq2[0]]; }
      while (dq1.length && p[dq1[dq1.length - 1]] <= p[i]) dq1.pop(); dq1.push(i);
      while (dq2.length && p[dq2[dq2.length - 1]] >= p[i]) dq2.pop(); dq2.push(i);
      while (dq1[0] <= i - n) dq1.shift();
      while (dq2[0] <= i - n) dq2.shift();
    }
    return { max: mx, min: mn };
  };
  T.rsi = function (p, n) { // RSI de Wilder, dernière valeur
    if (p.length < n + 1) return NaN;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++) { const d = p[i] - p[i - 1]; if (d > 0) g += d; else l -= d; }
    g /= n; l /= n;
    for (let i = n + 1; i < p.length; i++) { const d = p[i] - p[i - 1]; g = (g * (n - 1) + Math.max(d, 0)) / n; l = (l * (n - 1) + Math.max(-d, 0)) / n; }
    return l === 0 ? 100 : 100 - 100 / (1 + g / l);
  };

  /* ---------------- Stratégies ---------------- */
  // Chaque stratégie produit, pour chaque tick, +1 (BUY), -1 (SELL) ou 0 (NO TRADE), avec seulement le passé.
  T.warmup = function (s) {
    switch (s.type) {
      case 'ema': return 3 * s.slow + 1;
      case 'meanrev': return s.n + 101;
      case 'breakout': return s.n + 1;
      case 'momentum': return Math.max(s.n, 100) + 1;
    }
    return 100;
  };
  T.buildSignals = function (p, s) {
    const n = p.length, sig = new Int8Array(n), w = T.warmup(s);
    const d = T.diffs(p), vol = T.rollingMeanStd(d, 100).std; // volatilité par tick
    if (s.type === 'ema') {
      const f = T.ema(p, s.fast), sl = T.ema(p, s.slow);
      for (let i = w; i < n; i++) {
        const gap = f[i] - sl[i], thr = s.m * vol[i];
        if (gap > thr && f[i] > f[i - 1]) sig[i] = 1; else if (gap < -thr && f[i] < f[i - 1]) sig[i] = -1;
      }
    } else if (s.type === 'meanrev') {
      const r = T.rollingMeanStd(p, s.n);
      for (let i = w; i < n; i++) {
        if (!(r.std[i] > 0)) continue;
        const z = (p[i] - r.mean[i]) / r.std[i];
        if (z <= -s.k) sig[i] = 1; else if (z >= s.k) sig[i] = -1;
      }
    } else if (s.type === 'breakout') {
      const mm = T.prevMaxMin(p, s.n);
      for (let i = w; i < n; i++) { if (p[i] > mm.max[i]) sig[i] = 1; else if (p[i] < mm.min[i]) sig[i] = -1; }
    } else if (s.type === 'momentum') {
      let sum = 0;
      for (let i = 1; i < n; i++) {
        sum += d[i]; if (i > s.n) sum -= d[i - s.n];
        if (i < w || !(vol[i] > 0)) continue;
        const z = sum / (vol[i] * Math.sqrt(s.n));
        if (z > 0 && z >= s.k) sig[i] = 1; else if (z < 0 && z <= -s.k) sig[i] = -1;
      }
    } else throw new Error('stratégie inconnue ' + s.type);
    return sig;
  };
  T.describe = function (s) {
    const h = ` · horizon ${s.H} tick${s.H > 1 ? 's' : ''}`;
    switch (s.type) {
      case 'ema': return `Tendance EMA ${s.fast}/${s.slow}` + (s.m ? ` (écart ≥ ${s.m}σ)` : '') + h;
      case 'meanrev': return `Retour à la moyenne ${s.n} ticks, |z| ≥ ${s.k}` + h;
      case 'breakout': return `Cassure du plus haut/bas ${s.n} ticks` + h;
      case 'momentum': return `Momentum ${s.n} ticks, |z| ≥ ${s.k}` + h;
    }
  };
  T.reason = function (p, s, side) {
    const i = p.length - 1, d = T.diffs(p), vol = T.rollingMeanStd(d, 100).std[i];
    if (s.type === 'ema') { const f = T.ema(p, s.fast)[i], sl = T.ema(p, s.slow)[i]; return `EMA${s.fast} ${f.toFixed(3)} ${side > 0 ? '>' : '<'} EMA${s.slow} ${sl.toFixed(3)} (écart ${((f - sl) / vol).toFixed(2)}σ) et EMA${s.fast} ${side > 0 ? 'monte' : 'baisse'}`; }
    if (s.type === 'meanrev') { const r = T.rollingMeanStd(p, s.n); const z = (p[i] - r.mean[i]) / r.std[i]; return `Prix à ${z.toFixed(2)} écarts-types de sa moyenne ${s.n} ticks (${r.mean[i].toFixed(3)}) : pari sur un retour ${side > 0 ? 'vers le haut' : 'vers le bas'}`; }
    if (s.type === 'breakout') { const mm = T.prevMaxMin(p, s.n); return side > 0 ? `Prix ${p[i]} au-dessus du plus haut des ${s.n} ticks précédents (${mm.max[i]})` : `Prix ${p[i]} sous le plus bas des ${s.n} ticks précédents (${mm.min[i]})`; }
    if (s.type === 'momentum') { let sum = 0; for (let j = i - s.n + 1; j <= i; j++) sum += d[j]; return `Variation ${sum.toFixed(3)} sur ${s.n} ticks = ${(sum / (vol * Math.sqrt(s.n))).toFixed(2)}σ`; }
  };
  T.grid = function () {
    const g = [];
    for (const H of [1, 5, 10]) {
      for (const [fast, slow] of [[5, 20], [10, 50], [20, 100]]) for (const m of [0, 0.5]) g.push({ type: 'ema', fast, slow, m, H });
      for (const n of [20, 50, 100]) for (const k of [1.5, 2, 2.5]) g.push({ type: 'meanrev', n, k, H });
      for (const n of [20, 50, 100]) g.push({ type: 'breakout', n, H });
      for (const [n, k] of [[1, 0], [1, 1], [2, 0.5], [5, 1], [5, 2], [10, 1], [10, 2], [20, 2]]) g.push({ type: 'momentum', n, k, H });
    }
    return g; // 78 stratégies
  };
  T.key = s => JSON.stringify([s.type, s.fast, s.slow, s.m, s.n, s.k, s.H]);

  /* ---------------- Contrat Rise/Fall ---------------- */
  T.riseFallWins = function (side, entry, exit) {
    if (side === 1) return exit > entry;
    if (side === -1) return exit < entry;
    throw new Error('côté invalide');
  };
  T.profit = function (win, stake, payoutRatio) { return win ? stake * (payoutRatio - 1) : -stake; };

  /* ---------------- Statistiques de performance ---------------- */
  T.metrics = function (profits) {
    const n = profits.length;
    let wins = 0, sum = 0, peak = 0, eq = 0, maxDD = 0, run = 0, maxRun = 0, gp = 0, gl = 0;
    for (const x of profits) {
      sum += x; eq += x; if (eq > peak) peak = eq; if (peak - eq > maxDD) maxDD = peak - eq;
      if (x > 0) { wins++; run = 0; gp += x; } else { run++; if (run > maxRun) maxRun = run; gl -= x; }
    }
    const ev = n ? sum / n : 0;
    let v = 0; for (const x of profits) v += (x - ev) * (x - ev); v = n > 1 ? v / (n - 1) : 0;
    const se = n ? Math.sqrt(v / n) : 0;
    return { trades: n, wins, losses: n - wins, winRate: n ? wins / n : 0, net: sum, ev, se, lo: ev - 1.96 * se, hi: ev + 1.96 * se, maxDrawdown: maxDD, maxConsecLosses: maxRun, profitFactor: gl ? gp / gl : (gp ? Infinity : 0) };
  };


  // Quantile de la loi normale (algorithme d'Acklam, précision ~1e-9).
  function normInv(p) {
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425; let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  T.normInv = normInv;

  /* ---------------- Backtest ---------------- */
  // payout : {1: ratio BUY, -1: ratio SELL} (paiement total / mise), pour cet horizon.
  T.backtest = function (p, s, payout, from, to, sigCache) {
    to = to == null ? p.length : to;
    const sig = sigCache || T.buildSignals(p, s);
    const profits = [];
    let t = Math.max(from || 0, T.warmup(s));
    while (t + 1 + s.H < to) {
      const side = sig[t];
      if (!side) { t++; continue; }
      const entry = p[t + 1], exit = p[t + 1 + s.H];
      profits.push(T.riseFallWins(side, entry, exit) ? payout[side] - 1 : -1);
      t = t + 1 + s.H; // position fermée à t+1+H ; prochaine décision possible à ce tick
    }
    return T.metrics(profits);
  };
  // Optimisation sur 70 % (ancien), validation sur 30 % (récent, jamais vu).
  T.optimize = function (p, payouts, opts) {
    opts = opts || {};
    const split = Math.floor(p.length * (opts.split || 0.7)), minTrades = opts.minTrades || 200;
    const grid = T.grid().filter(s => payouts[s.H]);
    // Correction de Bonferroni : avec N stratégies testées, seuil unilatéral à 5 % / N.
    const zCrit = normInv(1 - 0.05 / Math.max(1, grid.length));
    const rows = grid.map(s => {
      const pay = payouts[s.H];
      const sig = T.buildSignals(p, s);
      const train = T.backtest(p, s, pay, 0, split, sig);
      const test = T.backtest(p, s, pay, split, p.length, sig);
      test.loAdj = test.ev - zCrit * test.se;
      const validated = train.trades >= minTrades && train.ev > 0 && test.trades >= minTrades && test.loAdj > 0;
      return { strat: s, name: T.describe(s), train, test, validated };
    });
    const k = r => (r.train.trades >= minTrades ? r.train.ev : -1e9 + r.train.trades);
    rows.sort((a, b) => k(b) - k(a));
    return { n: p.length, split, rows, zCrit, validated: rows.filter(r => r.validated) };
  };

  /* ---------------- Analyse en direct ---------------- */
  // Retourne une décision complète. Refuse (NO TRADE) dès qu'une condition manque.
  T.analyze = function (input) {
    const { prices, strat, payout, stake, feedOk, validation, onlyValidated } = input;
    const now = input.now || Date.now();
    const base = { time: now, strat, name: T.describe(strat), price: prices.length ? prices[prices.length - 1] : null, ticksUsed: prices.length };
    const no = why => Object.assign(base, { signal: 'NO TRADE', why });
    if (!feedOk) return no('Flux Deriv non vérifié (déconnexion, données figées ou incohérentes).');
    const need = T.warmup(strat) + 2;
    if (prices.length < need) return no(`Données insuffisantes : ${prices.length} ticks, ${need} nécessaires.`);
    if (!payout || !payout[1] || !payout[-1]) return no('Paiement Rise/Fall inconnu (proposal Deriv indisponible) : risque non calculable.');
    const sig = T.buildSignals(prices, strat), side = sig[sig.length - 1];
    const i = prices.length - 1, d = T.diffs(prices), vol = T.rollingMeanStd(d, 100).std[i];
    Object.assign(base, { vol });
    if (!side) return no('Conditions de la stratégie non remplies sur le dernier tick.');
    const pr = payout[side];
    const row = validation || null;
    let prob, probCI, probSrc;
    if (row && row.test.trades >= 100) {
      const k = row.test.wins, n = row.test.trades; prob = k / n; probCI = wilson(k, n); probSrc = `mesurée sur ${n} trades de test`;
    } else { prob = 0.5; probCI = null; probSrc = 'hypothèse marche aléatoire (pas de backtest)'; }
    const ev = (prob * pr - 1) * stake;
    const inval = prices[i] - side * 2 * vol * Math.sqrt(strat.H);
    Object.assign(base, {
      side, payoutRatio: pr, stake, gain: stake * (pr - 1), loss: stake, prob, probCI, probSrc, ev,
      reason: T.reason(prices, strat, side),
      scenario: `${side > 0 ? 'Rise' : 'Fall'} : le prix de sortie, ${strat.H} tick${strat.H > 1 ? 's' : ''} après l'entrée, ${side > 0 ? 'au-dessus' : 'en dessous'} du prix d'entrée`,
      invalidation: inval, validated: !!(row && row.validated)
    });
    if (onlyValidated && !base.validated) return Object.assign(base, { signal: 'NO TRADE', candidate: side > 0 ? 'BUY' : 'SELL', why: row ? `Signal ${side > 0 ? 'BUY' : 'SELL'} détecté mais stratégie non validée (espérance test ${row.test.ev.toFixed(3)} par $).` : 'Stratégie pas encore testée sur ce marché : lancer le backtest.' });
    return Object.assign(base, { signal: side > 0 ? 'BUY' : 'SELL' });
  };
  function wilson(k, n, z) { z = z || 1.96; const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [(c - m) / d, (c + m) / d]; }
  T.wilson = wilson;

  T.checkFeed = function (epochs, nowSec, expectedInterval) {
    const n = epochs.length; if (n < 2) return { ok: false, reason: 'pas assez de ticks' };
    let mono = true; for (let i = 1; i < n; i++) if (epochs[i] <= epochs[i - 1]) { mono = false; break; }
    const lagSec = nowSec - epochs[n - 1], interval = (epochs[n - 1] - epochs[0]) / (n - 1);
    const okI = expectedInterval ? Math.abs(interval - expectedInterval) <= expectedInterval * 0.5 : true;
    const ok = mono && Math.abs(lagSec) < 15 && okI;
    return { ok, lagSec, interval, reason: !mono ? 'horodatage non croissant' : Math.abs(lagSec) >= 15 ? `dernier tick vieux de ${lagSec.toFixed(0)} s` : !okI ? `cadence ${interval.toFixed(2)} s inattendue` : 'OK' };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = T; else root.PATrend = T;
})(typeof window !== 'undefined' ? window : globalThis);
