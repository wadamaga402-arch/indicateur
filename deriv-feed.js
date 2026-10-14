/* Connexion aux données publiques officielles de Deriv (WebSocket), sans compte ni token.
 * - Nouvelle API publique d'abord, anciennes adresses en secours.
 * - Requêtes avec req_id, abonnement aux ticks, désabonnement (forget), historique paginé, proposal (paiements).
 * - Reconnexion automatique avec délai croissant.
 */
(function (root) {
  'use strict';
  const DEFAULT_ENDPOINTS = [
    'wss://api.derivws.com/trading/v1/options/ws/public',
    'wss://ws.derivws.com/websockets/v3?app_id=1089',
    'wss://ws.binaryws.com/websockets/v3?app_id=1089'
  ];
  class DerivFeed {
    constructor(opts) {
      opts = opts || {};
      this.endpoints = opts.endpoints || DEFAULT_ENDPOINTS;
      this.WS = opts.WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
      this.ep = 0; this.ws = null; this.rid = 1; this.pend = new Map(); this.handlers = {};
      this.want = false; this.backoff = 1000; this.sub = null; this.stats = { messages: 0, reconnects: 0, lastMsg: 0 };
    }
    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); return this; }
    emit(ev, x) { (this.handlers[ev] || []).forEach(f => { try { f(x); } catch (e) { console.error(e); } }); }
    get endpoint() { return this.endpoints[this.ep]; }
    get isOpen() { return !!this.ws && this.ws.readyState === 1; }

    connect() {
      this.want = true;
      if (this.isOpen) return Promise.resolve(this.endpoint);
      if (this._connecting) return this._connecting;
      this._connecting = this._tryEndpoints(0).finally(() => { this._connecting = null; });
      return this._connecting;
    }
    _tryEndpoints(tries) {
      if (!this.WS) return Promise.reject(new Error('WebSocket indisponible'));
      if (tries >= this.endpoints.length) return Promise.reject(new Error('aucune adresse Deriv joignable'));
      return new Promise((res, rej) => {
        const url = this.endpoints[this.ep];
        this.emit('status', { state: 'connecting', endpoint: url });
        let ws, done = false;
        try { ws = new this.WS(url); } catch (e) { return rej(e); }
        const to = setTimeout(() => { if (!done) { done = true; try { ws.close(); } catch (e) {} rej(new Error('délai')); } }, 8000);
        ws.onopen = () => { if (done) return; done = true; clearTimeout(to); this._attach(ws); this.backoff = 1000; this.emit('status', { state: 'open', endpoint: url }); res(url); };
        ws.onerror = () => {};
        ws.onclose = () => { if (done) return; done = true; clearTimeout(to); rej(new Error('fermé')); };
      }).catch(err => {
        this.emit('status', { state: 'error', endpoint: this.endpoints[this.ep], error: err.message });
        this.ep = (this.ep + 1) % this.endpoints.length;
        return this._tryEndpoints(tries + 1);
      });
    }
    _attach(ws) {
      this.ws = ws;
      ws.onmessage = e => this._onMessage(e.data);
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        for (const [, p] of this.pend) p.rej(new Error('connexion fermée'));
        this.pend.clear();
        const hadSub = this.sub; this.sub = null;
        this.emit('status', { state: 'closed', endpoint: this.endpoint });
        if (this.want) {
          const wait = this.backoff; this.backoff = Math.min(this.backoff * 2, 15000);
          setTimeout(() => {
            if (!this.want) return;
            this.stats.reconnects++;
            this.connect().then(() => this.emit('reconnected', { previousSubscription: hadSub })).catch(() => {});
          }, wait);
        }
      };
    }
    _onMessage(raw) {
      let d; try { d = JSON.parse(raw); } catch (e) { return; }
      this.stats.messages++; this.stats.lastMsg = Date.now();
      if (d.req_id && this.pend.has(d.req_id)) {
        const p = this.pend.get(d.req_id); this.pend.delete(d.req_id);
        if (d.subscription && this.sub && this.sub.req_id === d.req_id) this.sub.id = d.subscription.id;
        return d.error ? p.rej(Object.assign(new Error(d.error.message || d.error.code), { code: d.error.code })) : p.res(d);
      }
      if (d.tick) {
        const t = d.tick;
        if (!this.sub) return;
        if (t.symbol && t.symbol !== this.sub.symbol) return;
        if (t.quote == null) return;
        return this.emit('tick', { symbol: this.sub.symbol, quote: Number(t.quote), epoch: t.epoch ? Number(t.epoch) : null, pip: t.pip_size != null ? Number(t.pip_size) : null });
      }
      if (!d.req_id && d.msg_type) { // API sans req_id : premier en attente du même type
        for (const [id, p] of this.pend) if (p.type === d.msg_type || (p.type === 'ticks_history' && d.msg_type === 'history')) { this.pend.delete(id); return d.error ? p.rej(new Error(d.error.message)) : p.res(d); }
      }
      if (d.error) this.emit('apierror', d.error);
    }
    request(obj, timeout) {
      if (!this.isOpen) return Promise.reject(new Error('non connecté'));
      const id = this.rid++; obj = Object.assign({}, obj, { req_id: id });
      return new Promise((res, rej) => {
        this.pend.set(id, { res, rej, type: Object.keys(obj)[0] });
        try { this.ws.send(JSON.stringify(obj)); } catch (e) { this.pend.delete(id); return rej(e); }
        setTimeout(() => { if (this.pend.has(id)) { this.pend.delete(id); rej(new Error('délai dépassé (' + Object.keys(obj)[0] + ')')); } }, timeout || 20000);
      });
    }
    async activeSymbols() {
      const d = await this.request({ active_symbols: 'brief' });
      return (d.active_symbols || []).filter(s => /^(R_\d+|1HZ\d+V)$/.test(s.symbol))
        .map(s => ({ symbol: s.symbol, name: s.display_name, open: s.exchange_is_open !== 0 }));
    }
    // Abonnement : renvoie l'historique initial ; les ticks suivants arrivent par l'évènement 'tick'.
    async subscribeTicks(symbol, count) {
      await this.unsubscribe();
      const req_id = this.rid; this.sub = { symbol, req_id, id: null };
      const d = await this.request({ ticks_history: symbol, count: count || 1000, end: 'latest', style: 'ticks', subscribe: 1 });
      if (!this.sub || this.sub.symbol !== symbol) throw new Error('abonnement remplacé');
      if (d.subscription) this.sub.id = d.subscription.id;
      return { prices: d.history.prices.map(Number), times: (d.history.times || []).map(Number), pip: d.pip_size != null ? Number(d.pip_size) : null };
    }
    async unsubscribe() {
      const s = this.sub; this.sub = null;
      if (!s || !this.isOpen) return;
      try { if (s.id) await this.request({ forget: s.id }, 5000); else await this.request({ forget_all: 'ticks' }, 5000); } catch (e) { /* déjà fermé */ }
    }
    async history(symbol, total, onProgress) {
      let prices = [], times = [], end = 'latest', pip = null, pages = 0;
      while (prices.length < total && pages++ < 100) {
        const want = Math.min(5000, total - prices.length);
        const d = await this.request({ ticks_history: symbol, count: want, end, style: 'ticks' }, 30000);
        const pr = d.history.prices.map(Number), tm = (d.history.times || []).map(Number);
        if (d.pip_size != null) pip = Number(d.pip_size);
        if (!pr.length || !tm.length) break;
        if (end !== 'latest' && tm[0] >= end) break;            // pas de progression : on s'arrête
        prices = pr.concat(prices); times = tm.concat(times); end = tm[0] - 1;
        if (onProgress) onProgress(prices.length / total);
        // Deriv peut plafonner le nombre de ticks par demande : on continue tant qu'on progresse.
      }
      for (let i = 1; i < times.length; i++) if (times[i] <= times[i - 1]) throw new Error('historique non chronologique');
      return { prices, times, pip };
    }
    // Paiement total / mise pour Rise (CALL) et Fall (PUT) sur H ticks.
    async riseFallPayout(symbol, H) {
      const one = async ct => { const d = await this.request({ proposal: 1, amount: 10, basis: 'stake', contract_type: ct, currency: 'USD', duration: H, duration_unit: 't', symbol }); return Number(d.proposal.payout) / 10; };
      const [up, down] = await Promise.all([one('CALL'), one('PUT')]);
      const r = { 1: up, '-1': down }; r[-1] = down; return r;
    }
    close() { this.want = false; this.sub = null; if (this.ws) { const w = this.ws; this.ws = null; try { w.close(); } catch (e) {} } this.emit('status', { state: 'closed', endpoint: this.endpoint }); }
  }
  DerivFeed.DEFAULT_ENDPOINTS = DEFAULT_ENDPOINTS;
  if (typeof module !== 'undefined' && module.exports) module.exports = DerivFeed; else root.DerivFeed = DerivFeed;
})(typeof window !== 'undefined' ? window : globalThis);
