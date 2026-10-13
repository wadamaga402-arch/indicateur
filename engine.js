/* VolScope Engine — moteur d'analyse Matches/Differs.
 * Fonctions pures, sans accès réseau : utilisables dans le navigateur et testables sous Node.
 * Aucune donnée n'est générée ici : le moteur ne travaille que sur les ticks qu'on lui donne.
 */
(function (root) {
  'use strict';
  const E = {};

  /* ---------- Données ---------- */
  // Dernier chiffre d'une cotation, en respectant le nombre de décimales (pip) de Deriv.
  // 1234.50 avec pip=2 -> 0 (le zéro final compte).
  E.lastDigit = function (quote, pip) {
    const s = Number(quote).toFixed(pip);
    return s.charCodeAt(s.length - 1) - 48;
  };

  E.counts = function (digits, from, to) {
    const f = new Array(10).fill(0);
    for (let i = from || 0; i < (to == null ? digits.length : to); i++) f[digits[i]]++;
    return f;
  };

  /* ---------- Statistiques ---------- */
  function gammaln(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function gammp(a, x) { // gamma incomplète régularisée P(a,x)
    if (x <= 0) return 0;
    if (x < a + 1) {
      let ap = a, sum = 1 / a, del = sum;
      for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-14) break; }
      return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
  }
  // Test du chi² d'uniformité des 10 chiffres. p proche de 0 = distribution anormale.
  E.chiSquare = function (f) {
    const n = f.reduce((a, b) => a + b, 0); if (!n) return { chi2: 0, df: 9, p: 1, n: 0 };
    const e = n / 10; let chi2 = 0;
    for (const o of f) chi2 += (o - e) * (o - e) / e;
    return { chi2, df: 9, p: 1 - gammp(4.5, chi2 / 2), n };
  };
  E.chiSquareP = function (chi2, df) { return 1 - gammp(df / 2, chi2 / 2); };
  // Écart d'un chiffre par rapport au hasard (10 %), en écarts-types.
  E.zScore = function (k, n, p0) { p0 = p0 == null ? 0.1 : p0; return n ? (k - n * p0) / Math.sqrt(n * p0 * (1 - p0)) : 0; };
  // Intervalle de confiance de Wilson 95 % pour une proportion.
  E.wilson = function (k, n, z) {
    z = z || 1.96; if (!n) return [0, 1];
    const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [(c - m) / d, (c + m) / d];
  };

  /* ---------- Contrats Deriv ---------- */
  // DIGITMATCH : gagné si le dernier chiffre du tick de sortie (1 tick après l'entrée) == prédiction.
  // DIGITDIFF  : gagné s'il est différent.
  E.contractWins = function (contract, barrier, outDigit) {
    if (contract === 'MATCH') return outDigit === barrier;
    if (contract === 'DIFF') return outDigit !== barrier;
    throw new Error('contrat inconnu ' + contract);
  };
  E.baseProb = function (contract) { return contract === 'MATCH' ? 0.1 : 0.9; };
  // payoutRatio = paiement total / mise (mise incluse), ex. Matches ≈ 8.3.
  E.expectedValue = function (p, payoutRatio) { return p * payoutRatio - 1; }; // par 1 $ misé
  E.breakEven = function (payoutRatio) { return 1 / payoutRatio; };
  E.profitOf = function (win, stake, payoutRatio) { return win ? stake * (payoutRatio - 1) : -stake; };

  /* ---------- Stratégies ---------- */
  // strat = {contract:'MATCH'|'DIFF', rule:'hot'|'cold'|'last', window:Number, zMin:Number}
  //  hot  : chiffre le plus fréquent de la fenêtre, si z >= zMin
  //  cold : chiffre le moins fréquent, si z <= -zMin
  //  last : dernier chiffre sorti (pas de seuil)
  E.decideFromCounts = function (f, n, lastD, strat) {
    if (strat.rule === 'last') return { barrier: lastD, z: E.zScore(f[lastD], n), freq: f[lastD] / n, n };
    let i = 0;
    for (let k = 1; k < 10; k++) if (strat.rule === 'hot' ? f[k] > f[i] : f[k] < f[i]) i = k;
    const z = E.zScore(f[i], n);
    if (strat.rule === 'hot' && z < strat.zMin) return null;
    if (strat.rule === 'cold' && z > -strat.zMin) return null;
    return { barrier: i, z, freq: f[i] / n, n };
  };
  E.decide = function (digits, strat) {
    const W = strat.rule === 'last' ? Math.max(strat.window || 1, 1) : strat.window;
    if (digits.length < W) return null;
    const f = E.counts(digits, digits.length - W);
    return E.decideFromCounts(f, W, digits[digits.length - 1], strat);
  };
  E.stratName = function (s) {
    const r = { hot: 'chiffre le + fréquent', cold: 'chiffre le − fréquent', last: 'dernier chiffre' }[s.rule];
    return `${s.contract === 'MATCH' ? 'Matches' : 'Differs'} · ${r}` + (s.rule === 'last' ? '' : ` · ${s.window} ticks · |z|≥${s.zMin}`);
  };
  E.strategyGrid = function () {
    const g = [];
    for (const contract of ['MATCH', 'DIFF']) {
      for (const rule of ['hot', 'cold']) for (const window of [25, 50, 100, 200, 500]) for (const zMin of [0, 1, 2]) g.push({ contract, rule, window, zMin });
      g.push({ contract, rule: 'last', window: 1, zMin: 0 });
    }
    return g;
  };

  /* ---------- Backtest ---------- */
  // Décision au tick t avec les chiffres [t-W+1 .. t] uniquement, résultat = chiffre t+1 (pas de regard vers le futur).
  // Trades simulés sur les indices de décision t dans [from, to-2].
  function summarize(profits, wins) {
    const n = profits.length; if (!n) return { trades: 0, wins: 0, winRate: 0, net: 0, ev: 0, se: 0, lo: 0, hi: 0 };
    let s = 0; for (const p of profits) s += p; const m = s / n;
    let v = 0; for (const p of profits) v += (p - m) * (p - m); v = n > 1 ? v / (n - 1) : 0;
    const se = Math.sqrt(v / n);
    return { trades: n, wins, winRate: wins / n, net: s, ev: m, se, lo: m - 1.96 * se, hi: m + 1.96 * se };
  }
  E.backtest = function (digits, strat, payoutRatio, from, to) {
    to = to == null ? digits.length : to;
    const W = strat.rule === 'last' ? 1 : strat.window;
    const start = Math.max(from || 0, W - 1);
    const profits = []; let wins = 0;
    const f = new Array(10).fill(0);
    for (let i = start - W + 1; i <= start; i++) f[digits[i]]++;
    for (let t = start; t <= to - 2; t++) {
      if (t > start) { f[digits[t]]++; f[digits[t - W]]--; }
      const d = E.decideFromCounts(f, W, digits[t], strat);
      if (!d) continue;
      const win = E.contractWins(strat.contract, d.barrier, digits[t + 1]);
      if (win) wins++;
      profits.push(win ? payoutRatio - 1 : -1);
    }
    return summarize(profits, wins);
  };
  // Optimise sur la partie "entraînement" (début), valide sur la partie "test" (fin, jamais vue).
  // Validée seulement si : test >= minTrades contrats ET borne basse de l'IC 95 % de l'espérance > 0 sur le test
  // ET espérance positive à l'entraînement.
  E.optimize = function (digits, payouts, opts) {
    opts = opts || {};
    const split = Math.floor(digits.length * (opts.split || 0.7));
    const minTrades = opts.minTrades || 300;
    const rows = E.strategyGrid().map(strat => {
      const pr = payouts[strat.contract];
      const train = E.backtest(digits, strat, pr, 0, split);
      const test = E.backtest(digits, strat, pr, split, digits.length);
      const validated = train.trades >= minTrades && train.ev > 0 && test.trades >= minTrades && test.lo > 0;
      return { strat, name: E.stratName(strat), train, test, validated };
    });
    // Classement par espérance d'entraînement ; une stratégie avec trop peu de contrats n'est pas classable.
    const key = r => (r.train.trades >= minTrades ? r.train.ev : -1e9 + r.train.trades);
    rows.sort((a, b) => key(b) - key(a));
    return { split, n: digits.length, rows, best: rows[0], validated: rows.filter(r => r.validated), tested: rows.length };
  };

  /* ---------- Vérification des données ---------- */
  // Vérifie qu'une série de ticks ressemble à un flux réel : époques croissantes, récentes, cadence régulière.
  E.checkFeed = function (epochs, nowSec, expectedInterval) {
    const n = epochs.length; if (n < 2) return { ok: false, reason: 'pas assez de ticks' };
    let mono = true; for (let i = 1; i < n; i++) if (epochs[i] <= epochs[i - 1]) { mono = false; break; }
    const lagSec = nowSec - epochs[n - 1];
    const span = epochs[n - 1] - epochs[0], interval = span / (n - 1);
    const okInterval = expectedInterval ? Math.abs(interval - expectedInterval) <= expectedInterval * 0.5 : true;
    const ok = mono && Math.abs(lagSec) < 15 && okInterval;
    return { ok, mono, lagSec, interval, reason: !mono ? 'horodatage non croissant' : Math.abs(lagSec) >= 15 ? `dernier tick vieux de ${lagSec.toFixed(0)} s` : !okInterval ? `cadence ${interval.toFixed(2)} s inattendue` : 'OK' };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.VSEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);
