// Tests du contrôleur (boutons Start / Stop / Analyze, démo, déconnexions) : node --test tests/controller.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const PAEngine = require('../pa-engine.js');
const T = require('../trend-engine.js');
const makeFake = require('./fake-deriv.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mem = () => { const m = {}; return { get: k => m[k] ?? null, set: (k, v) => { m[k] = v; } }; };
function engine(fake, settings) {
  const e = new PAEngine({ WebSocketImpl: fake.WS, storage: mem(), now: fake.now });
  if (settings) e.update(settings);
  return e;
}
async function ticks(fake, n) { for (let i = 0; i < n; i++) { fake.active().pushTick(); await sleep(0); } await sleep(5); }

test('START ENGINE : connexion, abonnement réel, analyse à chaque tick', async () => {
  const fake = makeFake(); const e = engine(fake, { onlyValidated: false, strat: { type: 'momentum', n: 5, k: 1, H: 1 } });
  const analyses = []; e.on('analysis', a => analyses.push(a));
  await e.start();
  assert.equal(e.state, 'running');
  const sub = fake.log.find(m => m.ticks_history && m.subscribe === 1);
  assert.ok(sub, 'pas de demande d\'abonnement'); assert.equal(sub.ticks_history, '1HZ100V');
  assert.ok(fake.log.some(m => m.proposal && m.contract_type === 'CALL') && fake.log.some(m => m.proposal && m.contract_type === 'PUT'));
  assert.equal(e.prices.length, 1000);
  await ticks(fake, 30);
  assert.ok(analyses.length >= 10, 'pas d\'analyse par tick');
  assert.equal(e.feedCheck.ok, true, e.feedCheck.reason);
  await e.stop();
});

test('signaux : entrée = tick suivant, sortie = H ticks plus tard, résultat calculé sur les vrais prix', async () => {
  const fake = makeFake({ seed: 11 }); const e = engine(fake, { onlyValidated: false, autoDemo: true, maxTrades: 100, lossLimit: 1000, stake: 2, strat: { type: 'momentum', n: 5, k: 1, H: 3 } });
  const results = []; e.on('result', r => results.push(r));
  await e.start(); await ticks(fake, 200); await e.stop();
  const ev = results.filter(r => r.status === 'evaluated');
  assert.ok(ev.length >= 5, 'trop peu de signaux évalués : ' + ev.length);
  for (const r of ev) {
    const iEntry = r.entrySeq - 1000 - 1, iExit = r.exitSeq - 1000 - 1;   // index dans les ticks poussés
    assert.equal(r.entry, fake.emitted[iEntry]); assert.equal(r.exit, fake.emitted[iExit]);
    assert.equal(r.exitSeq - r.entrySeq, 3);
    assert.equal(r.win, T.riseFallWins(r.side, r.entry, r.exit));
    assert.equal(r.pl, r.win ? 2 * (1.95 - 1) : -2);
  }
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i].entrySeq > ev[i - 1].exitSeq, 'positions qui se chevauchent'); // ordre chronologique
  const st = e.stats(); assert.equal(st.demo.trades, ev.length);
  assert.ok(Math.abs(st.demo.net - ev.reduce((a, r) => a + r.pl, 0)) < 1e-9);
});

test('STOP ENGINE : désabonnement réel, plus aucune analyse, signal en cours abandonné', async () => {
  const fake = makeFake(); const e = engine(fake, { onlyValidated: false, strat: { type: 'momentum', n: 5, k: 0.1, H: 10 } });
  await e.start(); await ticks(fake, 15);
  const sock = fake.active();
  let count = 0; e.on('analysis', () => count++);
  const hadPending = !!e.pending;
  await e.stop();
  assert.equal(e.state, 'stopped');
  assert.ok(fake.log.some(m => m.forget && String(m.forget).startsWith('sub-')), 'forget non envoyé');
  assert.equal(sock.readyState, 3, 'socket non fermé');
  sock.readyState = 1; sock.pushTick && sock.pushTick(); // un tick tardif ne doit rien déclencher
  assert.equal(count, 0);
  if (hadPending) assert.equal(e.signals[0].status, 'abandoned');
});

test('ANALYZE MARKET moteur arrêté : historique Deriv sans abonnement, analyse complète', async () => {
  const fake = makeFake(); const e = engine(fake, { onlyValidated: false });
  const a = await e.analyzeMarket();
  assert.ok(fake.log.some(m => m.ticks_history && !m.subscribe), 'pas de téléchargement d\'historique');
  assert.ok(!fake.log.some(m => m.subscribe), 'ne doit pas s\'abonner');
  assert.ok(['BUY', 'SELL', 'NO TRADE'].includes(a.signal));
  assert.equal(a.dataInfo.ticks, 1000);
  assert.ok(a.price > 0);
  assert.equal(e.state, 'stopped');
});

test('données manquantes et paiement indisponible : NO TRADE motivé', async () => {
  const f1 = makeFake({ historyLen: 30 }); const e1 = engine(f1, { onlyValidated: false });
  const a1 = await e1.analyzeMarket(); assert.equal(a1.signal, 'NO TRADE'); assert.match(a1.why, /insuffisantes/);
  const f2 = makeFake({ proposalError: true }); const e2 = engine(f2, { onlyValidated: false });
  const a2 = await e2.analyzeMarket(); assert.equal(a2.signal, 'NO TRADE'); assert.match(a2.why, /Paiement/);
});

test('déconnexion : reconnexion automatique, réabonnement, signal en cours marqué non évalué', async () => {
  const fake = makeFake(); const e = engine(fake, { onlyValidated: false, strat: { type: 'momentum', n: 5, k: 0.1, H: 10 } });
  await e.start(); await ticks(fake, 12);
  const pending = e.pending;
  const subsBefore = fake.log.filter(m => m.subscribe).length;
  fake.active().drop();
  await sleep(1300);   // backoff 1 s
  assert.equal(fake.log.filter(m => m.subscribe).length, subsBefore + 1, 'pas de réabonnement');
  if (pending) { assert.equal(pending.status, 'abandoned'); assert.match(pending.note, /déconnexion/); }
  await ticks(fake, 5); assert.equal(e.state, 'running');
  await e.stop();
});

test('adresse Deriv principale en panne : bascule sur la suivante', async () => {
  const fake = makeFake({ failEndpoints: ['api.derivws.com'] }); const e = engine(fake);
  await e.start(); assert.equal(e.state, 'running'); assert.match(e.feed.endpoint, /ws\.derivws\.com/); await e.stop();
});

test('mode démo : limite de contrats et limite de perte respectées', async () => {
  const fake = makeFake({ seed: 3 }); const e = engine(fake, { onlyValidated: false, autoDemo: true, maxTrades: 3, lossLimit: 1000, strat: { type: 'momentum', n: 5, k: 0.1, H: 1 } });
  await e.start(); await ticks(fake, 120); await e.stop();
  const demo = e.signals.filter(s => s.demo); assert.equal(demo.length, 3);
  assert.ok(e.signals.some(s => !s.demo && /limite de 3/.test(s.demoNote || '')));
  const f2 = makeFake({ seed: 5 }); const e2 = engine(f2, { onlyValidated: false, autoDemo: true, maxTrades: 999, lossLimit: 2, strat: { type: 'momentum', n: 5, k: 0.1, H: 1 } });
  await e2.start(); await ticks(f2, 200); await e2.stop();
  const net = e2.signals.filter(s => s.demo && s.status === 'evaluated').reduce((a, s) => a + s.pl, 0);
  assert.ok(net > -2 - 1 - 1e-9, 'perte au-delà de la limite + 1 contrat : ' + net);
});

test('backtest via Deriv + validation : marché au hasard => NO TRADE en mode « validées seulement »', async () => {
  const fake = makeFake({ seed: 9 }); const e = engine(fake, { onlyValidated: true });
  const bt = await e.runBacktest(20000);
  assert.equal(bt.n, 20000); assert.equal(bt.rows.length, T.grid().length);
  assert.equal(bt.rows.filter(r => r.validated).length, 0);
  assert.ok(fake.log.filter(m => m.ticks_history && !m.subscribe).length >= 4, 'historique non paginé');
  await e.start(); await ticks(fake, 5);
  assert.equal(e.lastAnalysis.signal, 'NO TRADE');
  await e.stop();
});

test('historique : Deriv plafonne à 1000 ticks par demande -> pagination jusqu\'à 20000', async () => {
  const fake = makeFake({ maxPerRequest: 1000 }); const e = engine(fake);
  await e.feed.connect(); const h = await e.feed.history('1HZ100V', 20000);
  assert.equal(h.prices.length, 20000);
  for (let i = 1; i < h.times.length; i++) assert.ok(h.times[i] > h.times[i - 1]);
  e.feed.close();
});

test('persistance : réglages et historique rechargés', async () => {
  const fake = makeFake(); const store = mem();
  const e = new PAEngine({ WebSocketImpl: fake.WS, storage: store, now: fake.now });
  e.update({ symbol: 'R_10', stake: 3, onlyValidated: false, autoDemo: true, strat: { type: 'momentum', n: 5, k: 0.1, H: 1 } });
  await e.start(); await ticks(fake, 40); await e.stop();
  const e2 = new PAEngine({ WebSocketImpl: fake.WS, storage: store, now: fake.now });
  assert.equal(e2.settings.symbol, 'R_10'); assert.equal(e2.settings.stake, 3);
  assert.equal(e2.signals.length, e.signals.length); assert.ok(e2.signals.length > 0);
});
