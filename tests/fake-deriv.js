// Faux serveur Deriv UNIQUEMENT POUR LES TESTS (jamais chargé par le site).
// Reproduit le protocole : active_symbols, ticks_history (+subscribe), tick, forget, proposal.
function makeFakeDeriv(opts) {
  opts = opts || {};
  const clock = { t: opts.start || 1_800_000_000 };          // horloge virtuelle (secondes)
  const log = [];                              // messages reçus par le "serveur"
  const sockets = [];
  let seed = opts.seed || 7;
  // mulberry32 : générateur de bonne qualité (un LCG simple crée des corrélations que le moteur détecte !)
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let price = 1000;
  const nextPrice = () => { price += (rnd() - 0.5) * 2; return Math.round(price * 100) / 100; };
  const ctl = { clock, log, sockets, failEndpoints: opts.failEndpoints || [], historyLen: opts.historyLen, proposalError: !!opts.proposalError, emitted: [] };

  class FakeWS {
    constructor(url) {
      this.url = url; this.readyState = 0; sockets.push(this);
      setTimeout(() => {
        if (ctl.failEndpoints.some(f => url.includes(f))) { this.readyState = 3; this.onclose && this.onclose({}); return; }
        this.readyState = 1; this.onopen && this.onopen();
      }, 1);
    }
    _reply(o) { setTimeout(() => { if (this.readyState === 1) this.onmessage({ data: JSON.stringify(o) }); }, 1); }
    send(raw) {
      const d = JSON.parse(raw); log.push(d);
      if (d.active_symbols) return this._reply({ msg_type: 'active_symbols', req_id: d.req_id, active_symbols: [
        { symbol: 'R_10', display_name: 'Volatility 10 Index' }, { symbol: '1HZ100V', display_name: 'Volatility 100 (1s) Index' }, { symbol: 'frxEURUSD', display_name: 'EUR/USD' }] });
      if (d.proposal) {
        if (ctl.proposalError) return this._reply({ msg_type: 'proposal', req_id: d.req_id, error: { code: 'X', message: 'proposal refusé' } });
        return this._reply({ msg_type: 'proposal', req_id: d.req_id, proposal: { payout: 19.5 } });
      }
      if (d.forget || d.forget_all) { clearInterval(this.iv); this.iv = null; return this._reply({ msg_type: 'forget', req_id: d.req_id, forget: 1 }); }
      if (d.ticks_history) {
        const n = ctl.historyLen || d.count, end = d.end === 'latest' ? clock.t : d.end;
        const times = [], prices = []; for (let i = n - 1; i >= 0; i--) { times.push(end - i); prices.push(nextPrice()); }
        const msg = { msg_type: 'history', req_id: d.req_id, pip_size: 2, history: { prices, times } };
        if (d.subscribe) { msg.subscription = { id: 'sub-' + d.req_id }; this.subId = msg.subscription.id; this.sym = d.ticks_history; }
        return this._reply(msg);
      }
    }
    // le test pousse les ticks à la main (contrôle total du temps)
    pushTick() {
      if (this.readyState !== 1 || !this.subId) return null;
      clock.t += 1; const q = nextPrice(); ctl.emitted.push(q);
      this.onmessage({ data: JSON.stringify({ msg_type: 'tick', tick: { symbol: this.sym, quote: q, epoch: clock.t, pip_size: 2 }, subscription: { id: this.subId } }) });
      return q;
    }
    drop() { this.readyState = 3; clearInterval(this.iv); this.onclose && this.onclose({}); }
    close() { this.readyState = 3; this.onclose && this.onclose({}); }
  }
  ctl.WS = FakeWS;
  ctl.active = () => sockets.filter(s => s.readyState === 1).pop();
  ctl.now = () => clock.t * 1000;
  return ctl;
}
module.exports = makeFakeDeriv;
