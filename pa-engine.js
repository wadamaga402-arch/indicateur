/* Profit Analysis Engine — contrôleur (sans interface).
 * Relie DerivFeed (données) et PATrend (calculs). Toutes les actions sont réelles :
 *   start()          -> connexion + abonnement aux ticks + analyse à chaque tick
 *   stop()           -> désabonnement (forget) + fermeture ; les signaux en cours sont marqués non évalués
 *   analyzeMarket()  -> analyse immédiate (en direct si démarré, sinon sur l'historique Deriv téléchargé)
 *   runBacktest(n)   -> 72 stratégies, entraînement 70 % / test 30 %
 * Mode DEMO uniquement : aucun ordre réel n'est jamais envoyé, aucun token n'est utilisé.
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const T = isNode ? require('./trend-engine.js') : root.PATrend;
  const DerivFeed = isNode ? require('./deriv-feed.js') : root.DerivFeed;

  const memStore = () => { const m = {}; return { get: k => m[k] ?? null, set: (k, v) => { m[k] = v; } }; };
  const lsStore = () => ({ get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } });

  const DEFAULTS = {
    symbol: '1HZ100V', strat: { type: 'ema', fast: 10, slow: 50, m: 0.5, H: 5 },
    stake: 1, maxTrades: 30, lossLimit: 10, onlyValidated: true, autoDemo: false, session: 1
  };

  class PAEngine {
    constructor(opts) {
      opts = opts || {};
      this.feed = opts.feed || new DerivFeed({ WebSocketImpl: opts.WebSocketImpl, endpoints: opts.endpoints });
      this.store = opts.storage || (typeof localStorage !== 'undefined' ? lsStore() : memStore());
      this.key = opts.storageKey || 'pa_engine_v1';
      const saved = JSON.parse(this.store.get(this.key) || 'null') || {};
      this.settings = Object.assign({}, DEFAULTS, saved.settings || {});
      this.signals = saved.signals || [];
      this.backtests = saved.backtests || {};
      this.state = 'stopped'; this.handlers = {}; this.now = opts.now || (() => Date.now());
      this.prices = []; this.times = []; this.pip = 2; this.seq = 0; this.payouts = {}; this.pending = null; this.lastAnalysis = null;
      this.symbols = null; this.feedCheck = { ok: false, reason: 'moteur arrêté' };
      this.feed.on('tick', t => this._onTick(t));
      this.feed.on('status', s => { this.feedStatus = s; this.emit('feed', s); });
      this.feed.on('reconnected', () => this._onReconnect());
    }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, x) { (this.handlers[ev] || []).forEach(f => { try { f(x); } catch (e) { console.error(e); } }); }
    _save() { this.store.set(this.key, JSON.stringify({ settings: this.settings, signals: this.signals.slice(0, 2000), backtests: this.backtests })); }
    _setState(s, info) { this.state = s; this.emit('state', { state: s, info }); }

    /* ---------- réglages ---------- */
    update(patch) {
      const prevSym = this.settings.symbol, prevH = this.settings.strat.H;
      Object.assign(this.settings, patch); if (patch.strat) this.settings.strat = Object.assign({}, patch.strat);
      this._save(); this.emit('settings', this.settings);
      if (this.state === 'running' && (this.settings.symbol !== prevSym)) return this._resubscribe();
      if (this.state === 'running' && this.settings.strat.H !== prevH) return this._loadPayout().then(() => this._analyzeNow('auto'));
      return Promise.resolve();
    }
    async loadSymbols() {
      await this.feed.connect();
      try { this.symbols = await this.feed.activeSymbols(); } catch (e) { this.symbols = null; }
      this.emit('symbols', this.symbols); return this.symbols;
    }

    /* ---------- START / STOP ---------- */
    async start() {
      if (this.state === 'running' || this.state === 'starting') return;
      this._setState('starting');
      try {
        await this.feed.connect();
        if (!this.symbols) this.loadSymbols().catch(() => {});
        await this._subscribe();
        this._setState('running');
        this._analyzeNow('auto');
      } catch (e) {
        this._setState('error', e.message); this.emit('error', e);
        this.feed.close();
      }
    }
    async stop() {
      if (this.state === 'stopped') return;
      this._setState('stopping');
      this._abandonPending('non évalué : moteur arrêté avant la fin de l\'horizon');
      try { await this.feed.unsubscribe(); } catch (e) {}
      this.feed.close();
      this.feedCheck = { ok: false, reason: 'moteur arrêté' };
      this._setState('stopped');
    }
    async _subscribe() {
      const sym = this.settings.symbol;
      const h = await this.feed.subscribeTicks(sym, 1000);
      if (sym !== this.settings.symbol) return;
      this.pip = h.pip != null ? h.pip : this.pip;
      this.prices = h.prices.slice(); this.times = h.times.slice(); this.seq = this.prices.length;
      this._checkFeed();
      this.emit('history', { symbol: sym, prices: this.prices });
      await this._loadPayout();
    }
    async _resubscribe() {
      this._abandonPending('non évalué : marché changé');
      try { await this._subscribe(); this._analyzeNow('auto'); } catch (e) { this._setState('error', e.message); this.emit('error', e); }
    }
    async _onReconnect() {
      this._abandonPending('non évalué : déconnexion pendant l\'horizon (ticks manquants)');
      if (this.state === 'running') { try { await this._subscribe(); this._analyzeNow('auto'); } catch (e) { this.emit('error', e); } }
    }
    async _loadPayout() {
      const sym = this.settings.symbol, H = this.settings.strat.H;
      try { this.payouts[sym + ':' + H] = await this.feed.riseFallPayout(sym, H); }
      catch (e) { this.payouts[sym + ':' + H] = null; this.emit('error', new Error('Paiement Deriv indisponible : ' + e.message)); }
    }
    payout() { return this.payouts[this.settings.symbol + ':' + this.settings.strat.H] || null; }

    /* ---------- flux ---------- */
    _checkFeed() {
      const exp = /^1HZ/.test(this.settings.symbol) ? 1 : 2;
      this.feedCheck = this.times.length ? T.checkFeed(this.times.slice(-60), this.now() / 1000, exp) : { ok: false, reason: 'horodatages absents' };
      return this.feedCheck;
    }
    _onTick(t) {
      if (this.state !== 'running' || t.symbol !== this.settings.symbol || !this.prices.length) return;
      if (t.pip != null) this.pip = t.pip;
      this.prices.push(t.quote); if (t.epoch) this.times.push(t.epoch); this.seq++;
      if (this.prices.length > 3000) { this.prices.splice(0, 1000); }
      if (this.times.length > 3000) { this.times.splice(0, 1000); }
      this._checkFeed();
      this.emit('tick', { symbol: t.symbol, quote: t.quote, epoch: t.epoch, seq: this.seq });
      this._resolvePending(t.quote);
      if (!this.pending) this._analyzeNow('auto');
    }

    /* ---------- ANALYSE ---------- */
    _validationFor(strat) {
      const bt = this.backtests[this.settings.symbol]; if (!bt) return null;
      const k = T.key(strat); return bt.rows.find(r => T.key(r.strat) === k) || null;
    }
    _analyzeNow(origin) {
      const a = T.analyze({
        prices: this.prices, strat: this.settings.strat, payout: this.payout(), stake: this.settings.stake,
        feedOk: this.state === 'running' ? this.feedCheck.ok : false, now: this.now(),
        validation: this._validationFor(this.settings.strat), onlyValidated: this.settings.onlyValidated
      });
      a.symbol = this.settings.symbol; a.origin = origin; a.dataInfo = this._dataInfo();
      this.lastAnalysis = a; this.emit('analysis', a);
      if ((a.signal === 'BUY' || a.signal === 'SELL') && this.state === 'running' && !this.pending) this._openSignal(a);
      return a;
    }
    _dataInfo() {
      const n = this.prices.length;
      return { ticks: n, from: this.times[Math.max(0, this.times.length - n)] || null, to: this.times[this.times.length - 1] || null, endpoint: this.feed.endpoint, pip: this.pip };
    }
    // ANALYZE MARKET : vrai calcul, en direct si le moteur tourne, sinon sur 1000 ticks d'historique Deriv.
    async analyzeMarket() {
      if (this.state === 'running') return this._analyzeNow('manuel');
      this.emit('busy', 'Téléchargement des ticks Deriv…');
      try {
        await this.feed.connect();
        const sym = this.settings.symbol;
        const h = await this.feed.history(sym, 1000);
        this.pip = h.pip != null ? h.pip : this.pip;
        await this._loadPayout();
        const exp = /^1HZ/.test(sym) ? 1 : 2;
        const fc = T.checkFeed(h.times.slice(-60), this.now() / 1000, exp);
        const a = T.analyze({ now: this.now(), prices: h.prices, strat: this.settings.strat, payout: this.payout(), stake: this.settings.stake, feedOk: fc.ok, validation: this._validationFor(this.settings.strat), onlyValidated: this.settings.onlyValidated });
        a.symbol = sym; a.origin = 'manuel (moteur arrêté)';
        a.dataInfo = { ticks: h.prices.length, from: h.times[0], to: h.times[h.times.length - 1], endpoint: this.feed.endpoint, pip: this.pip };
        if (a.signal !== 'NO TRADE') a.note = 'Moteur arrêté : ce signal ne sera pas suivi. Démarre le moteur pour que le résultat soit évalué.';
        this.lastAnalysis = a; this.emit('analysis', a);
        return a;
      } catch (e) {
        const a = { signal: 'NO TRADE', why: 'Données Deriv indisponibles : ' + e.message, time: Date.now(), symbol: this.settings.symbol, strat: this.settings.strat, name: T.describe(this.settings.strat) };
        this.lastAnalysis = a; this.emit('analysis', a); return a;
      } finally {
        if (this.state !== 'running') this.feed.close();
        this.emit('busy', null);
      }
    }

    /* ---------- SIGNAUX & DÉMO ---------- */
    sessionStats() {
      const s = this.settings, tr = this.signals.filter(x => x.demo && x.session === s.session && x.status === 'evaluated');
      const open = this.signals.filter(x => x.demo && x.session === s.session && x.status === 'pending').length;
      return { trades: tr.length + open, net: tr.reduce((a, x) => a + x.pl, 0) };
    }
    riskBlock() {
      const s = this.settings, ss = this.sessionStats();
      if (ss.trades >= s.maxTrades) return `limite de ${s.maxTrades} contrats atteinte`;
      if (-ss.net >= s.lossLimit) return `limite de perte de ${s.lossLimit} $ atteinte (${ss.net.toFixed(2)} $)`;
      return null;
    }
    _openSignal(a) {
      const s = this.settings, block = this.riskBlock();
      const demo = s.autoDemo && !block;
      const sig = {
        id: 's' + Date.now() + Math.random().toString(36).slice(2, 6), time: a.time, symbol: a.symbol, signal: a.signal, side: a.side,
        price: a.price, reason: a.reason, scenario: a.scenario, H: s.strat.H, invalidation: a.invalidation, strat: s.strat, name: a.name,
        prob: a.prob, probSrc: a.probSrc, validated: a.validated, payoutRatio: a.payoutRatio, stake: s.stake,
        entrySeq: this.seq + 1, exitSeq: this.seq + 1 + s.strat.H, status: 'pending', demo, session: s.session,
        demoNote: s.autoDemo && block ? 'démo bloquée : ' + block : null, origin: a.origin, pip: this.pip
      };
      this.pending = sig; this.signals.unshift(sig); this._save(); this.emit('signal', sig);
    }
    takeDemo() { // prendre le signal en cours en démo (manuel)
      const p = this.pending; if (!p || p.demo) return false;
      const b = this.riskBlock(); if (b) { p.demoNote = 'démo bloquée : ' + b; this.emit('signal', p); return false; }
      if (this.seq >= p.entrySeq) { p.demoNote = 'trop tard : le tick d\'entrée est passé'; this.emit('signal', p); return false; }
      p.demo = true; this._save(); this.emit('signal', p); return true;
    }
    _resolvePending(quote) {
      const p = this.pending; if (!p) return;
      if (this.seq === p.entrySeq) { p.entry = quote; p.min = quote; p.max = quote; }
      if (this.seq > p.entrySeq) { p.min = Math.min(p.min, quote); p.max = Math.max(p.max, quote); }
      if (this.seq === p.exitSeq) {
        p.exit = quote; p.win = T.riseFallWins(p.side, p.entry, p.exit);
        p.pl = p.demo ? T.profit(p.win, p.stake, p.payoutRatio) : 0;
        p.hypoPl = T.profit(p.win, 1, p.payoutRatio);
        p.invalidated = p.side > 0 ? p.min <= p.invalidation : p.max >= p.invalidation;
        p.status = 'evaluated'; p.evaluatedAt = Date.now();
        this.pending = null; this._save(); this.emit('result', p);
        const b = this.riskBlock(); if (p.demo && b) this.emit('risk', b);
      }
    }
    _abandonPending(why) {
      const p = this.pending; if (!p) return;
      p.status = 'abandoned'; p.note = why; this.pending = null; this._save(); this.emit('result', p);
    }
    newSession() { this.settings.session++; this._save(); this.emit('settings', this.settings); }
    clearHistory() { if (this.pending) this.pending = null; this.signals = []; this.settings.session = 1; this._save(); this.emit('settings', this.settings); }
    stats() {
      const ev = this.signals.filter(x => x.status === 'evaluated');
      const demo = ev.filter(x => x.demo).reverse(), all = ev.slice().reverse();
      return {
        demo: T.metrics(demo.map(x => x.pl)), demoStakeAvg: demo.length ? demo.reduce((a, x) => a + x.stake, 0) / demo.length : 0,
        signals: T.metrics(all.map(x => x.hypoPl)), invalidated: all.filter(x => x.invalidated).length,
        abandoned: this.signals.filter(x => x.status === 'abandoned').length, equity: demo.reduce((acc, x) => { acc.push((acc[acc.length - 1] || 0) + x.pl); return acc; }, [])
      };
    }

    /* ---------- BACKTEST ---------- */
    async runBacktest(total, onProgress) {
      const sym = this.settings.symbol, wasRunning = this.state === 'running';
      await this.feed.connect();
      try {
        const h = await this.feed.history(sym, total || 20000, p => onProgress && onProgress(0.8 * p));
        const payouts = {};
        for (const H of [1, 5, 10]) { try { payouts[H] = await this.feed.riseFallPayout(sym, H); } catch (e) {} }
        if (!payouts[1] && !payouts[5] && !payouts[10]) throw new Error('paiements Deriv indisponibles');
        if (onProgress) onProgress(0.85);
        const res = T.optimize(h.prices, payouts, { split: 0.7, minTrades: 200 });
        if (onProgress) onProgress(1);
        this.backtests[sym] = { date: Date.now(), n: h.prices.length, from: h.times[0], to: h.times[h.times.length - 1], split: res.split, payouts, endpoint: this.feed.endpoint,
          rows: res.rows.map(r => ({ strat: r.strat, name: r.name, train: r.train, test: r.test, validated: r.validated })) };
        this._save(); this.emit('backtest', this.backtests[sym]);
        if (this.state === 'running') this._analyzeNow('auto');
        return this.backtests[sym];
      } finally { if (!wasRunning && this.state !== 'running') this.feed.close(); }
    }
  }
  PAEngine.DEFAULTS = DEFAULTS;
  if (isNode) module.exports = PAEngine; else root.PAEngine = PAEngine;
})(typeof window !== 'undefined' ? window : globalThis);
