/* Profit Analysis Engine — interface intégrable.
 * Usage :  PAWidget.mount(document.getElementById('pa-engine'))
 * Crée les boutons START ENGINE / STOP ENGINE / ANALYZE MARKET reliés au vrai contrôleur PAEngine.
 * Tout le CSS est préfixé « pae- » pour ne pas toucher aux styles du site hôte.
 */
(function (root) {
  'use strict';
  const T = root.PATrend;
  const CSS = `
.pae{--bg:#07130d;--c1:#11291d;--c2:#0d1f16;--ln:#1f4030;--tx:#e9f7ef;--mu:#86a594;--g:#2bea6a;--g2:#13b24a;--y:#ffd23a;--r:#ff3b4e;
 font-family:Poppins,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--tx);max-width:1100px;margin:0 auto;box-sizing:border-box}
.pae *{box-sizing:border-box}
.pae button,.pae select,.pae input{font:inherit;color:inherit}
.pae-grid{display:grid;grid-template-columns:1fr;gap:14px}
@media(min-width:900px){.pae-grid{grid-template-columns:1fr 1fr}.pae-span{grid-column:1/-1}}
.pae-card{background:linear-gradient(180deg,var(--c1),var(--c2));border:1px solid var(--ln);border-radius:18px;padding:16px;min-width:0}
.pae-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 12px;flex-wrap:wrap}
.pae-h b{font-size:15px}
.pae-top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.pae-title{font-weight:800;font-size:22px;background:linear-gradient(90deg,var(--g),var(--y));-webkit-background-clip:text;background-clip:text;color:transparent}
.pae-state{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--ln);border-radius:20px;padding:6px 12px;font-size:12px;font-weight:700}
.pae-dot{width:9px;height:9px;border-radius:50%;background:var(--mu)}.pae-dot.on{background:var(--g);box-shadow:0 0 8px var(--g)}.pae-dot.err{background:var(--r)}.pae-dot.wait{background:var(--y)}
.pae-btns{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}
.pae-btn{border:0;border-radius:12px;padding:13px 6px;font-weight:800;font-size:13px;letter-spacing:.3px;cursor:pointer}
.pae-btn:disabled{opacity:.45;cursor:default}
.pae-start{background:linear-gradient(90deg,var(--g),var(--y));color:#062010}
.pae-stop{background:var(--r);color:#fff}
.pae-an{background:#0a1912;border:1px solid var(--g)!important;color:var(--g)}
.pae-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pae-f label{display:block;font-size:12px;font-weight:600;margin-bottom:5px;color:var(--mu)}
.pae-f select,.pae-f input{width:100%;background:#0a1912;border:1px solid var(--ln);border-radius:10px;padding:10px;font-size:14px;min-width:0}
.pae-chk{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--mu);margin-top:10px}
.pae-chk input{width:18px;height:18px;accent-color:var(--g);flex:none;margin:0}
.pae-price{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:38px;font-weight:700;color:var(--g);text-align:center}
.pae-price.dn{color:var(--r)}
.pae-sub{font-size:11px;color:var(--mu);text-align:center;letter-spacing:1px}
.pae-ver{margin-top:10px;border:1px solid var(--ln);border-radius:12px;padding:10px;font-size:11px;color:var(--mu);background:#0a1912;line-height:1.6;word-break:break-word}
.pae-ver b{color:var(--tx)}
.pae-ok{color:var(--g)}.pae-ko{color:var(--r)}.pae-wa{color:var(--y)}
.pae-sig{display:flex;align-items:center;gap:14px}
.pae-pill{min-width:110px;text-align:center;border-radius:14px;padding:14px 10px;font-weight:900;font-size:22px;letter-spacing:1px}
.pae-buy{background:linear-gradient(135deg,#6dff9b,var(--g2));color:#03210c;box-shadow:0 0 24px rgba(43,234,106,.35)}
.pae-sell{background:linear-gradient(135deg,#ff8a95,var(--r));color:#2a0006;box-shadow:0 0 24px rgba(255,59,78,.35)}
.pae-none{background:#22261a;color:var(--y);font-size:17px}
.pae-why{font-size:13px;line-height:1.45}
.pae-kv{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;font-size:12px;margin-top:12px}
.pae-kv span{color:var(--mu)}.pae-kv b{font-weight:600;word-break:break-word}
.pae-badge{display:inline-block;font-size:10px;font-weight:800;border-radius:8px;padding:2px 8px}
.pae-b-ok{background:var(--g);color:#04210d}.pae-b-no{background:var(--r);color:#fff}.pae-b-na{background:#3a3a1a;color:var(--y)}
.pae-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.pae-st{border:1px solid var(--ln);border-radius:12px;padding:10px 6px;text-align:center;background:#0a1912;min-width:0}
.pae-st b{display:block;font-size:16px;font-family:"JetBrains Mono",ui-monospace,monospace}
.pae-st span{font-size:9px;letter-spacing:.8px;color:var(--mu);text-transform:uppercase}
.pae-spark{width:100%;height:60px;margin-top:8px;display:block}
.pae-list{max-height:320px;overflow:auto;margin-top:10px;font-size:11px}
.pae-row{display:flex;justify-content:space-between;gap:8px;padding:7px 2px;border-bottom:1px solid var(--ln)}
.pae-tw{overflow-x:auto;-webkit-overflow-scrolling:touch}
.pae table{width:100%;border-collapse:collapse;font-size:11px;margin-top:10px;min-width:560px}
.pae th,.pae td{padding:6px 4px;border-bottom:1px solid var(--ln);text-align:right}
.pae th:first-child,.pae td:first-child{text-align:left}
.pae th{color:var(--mu);font-weight:600;font-size:10px;text-transform:uppercase}
.pae-bar{height:8px;border-radius:6px;background:#0f2a1c;overflow:hidden;margin:10px 0 4px}
.pae-bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--g),var(--y));transition:width .3s}
.pae-msg{border-radius:12px;padding:10px 12px;font-size:12px;margin-top:10px;line-height:1.5}
.pae-m-r{background:#2a0c10;border:1px solid #6b1f2b;color:#ffb3bd}.pae-m-y{background:#1d1a08;border:1px solid #6b5a12;color:#ffe9a3}.pae-m-g{background:#0a2414;border:1px solid #1f6b3a;color:#b8ffd0}
.pae-small{font-size:11px;color:var(--mu);line-height:1.5}
.pae-sbtn{border:1px solid var(--ln);background:none;border-radius:9px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer}
@media(max-width:380px){.pae-pill{min-width:84px;font-size:18px}.pae-price{font-size:30px}.pae-fields{grid-template-columns:1fr}}
`;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f$ = v => (v >= 0 ? '+' : '') + Number(v).toFixed(2);
  const pc = (v, d) => (v * 100).toFixed(d == null ? 1 : d) + ' %';
  const fx = (v, pip) => (v == null ? '—' : Number(v).toFixed(pip == null ? 2 : pip));
  const tm = t => t ? new Date(t > 1e12 ? t : t * 1000).toLocaleTimeString('fr-FR') : '—';
  const FALLBACK = [['R_10', 'Volatility 10 Index'], ['1HZ10V', 'Volatility 10 (1s) Index'], ['R_25', 'Volatility 25 Index'], ['1HZ25V', 'Volatility 25 (1s) Index'], ['R_50', 'Volatility 50 Index'], ['1HZ50V', 'Volatility 50 (1s) Index'], ['R_75', 'Volatility 75 Index'], ['1HZ75V', 'Volatility 75 (1s) Index'], ['R_100', 'Volatility 100 Index'], ['1HZ100V', 'Volatility 100 (1s) Index']];

  function mount(el, opts) {
    opts = opts || {};
    if (!document.getElementById('pae-style')) { const st = document.createElement('style'); st.id = 'pae-style'; st.textContent = CSS; document.head.appendChild(st); }
    const eng = opts.engine || new root.PAEngine(opts.engineOptions);
    let symbols = FALLBACK.slice();
    const grid = T.grid();
    el.classList.add('pae');
    el.innerHTML = `
<div class="pae-grid">
 <div class="pae-card pae-span">
  <div class="pae-top"><div class="pae-title">Profit Analysis Engine</div><div class="pae-state"><span class="pae-dot" data-r="dot"></span><span data-r="state">ARRÊTÉ</span></div></div>
  <div class="pae-btns">
   <button class="pae-btn pae-start" data-a="start">▶ START ENGINE</button>
   <button class="pae-btn pae-stop" data-a="stop" disabled>■ STOP ENGINE</button>
   <button class="pae-btn pae-an" data-a="analyze">⌕ ANALYZE MARKET</button>
  </div>
  <div data-r="err"></div>
 </div>

 <div class="pae-card">
  <div class="pae-h"><b>Marché & stratégie</b></div>
  <div class="pae-fields">
   <div class="pae-f" style="grid-column:1/-1"><label>Indice Volatility</label><select data-s="symbol"></select></div>
   <div class="pae-f" style="grid-column:1/-1"><label>Stratégie</label><select data-s="strat"></select></div>
   <div class="pae-f"><label>Mise démo ($)</label><input type="number" min="0.35" step="0.01" data-s="stake"></div>
   <div class="pae-f"><label>Max contrats / session</label><input type="number" min="1" step="1" data-s="maxTrades"></div>
   <div class="pae-f"><label>Limite de perte session ($)</label><input type="number" min="0.35" step="0.5" data-s="lossLimit"></div>
   <div class="pae-f"><label>Exécution</label><select disabled><option>DEMO uniquement</option></select></div>
  </div>
  <label class="pae-chk"><input type="checkbox" data-s="onlyValidated"> Signal BUY/SELL seulement si la stratégie est validée par le backtest (recommandé)</label>
  <label class="pae-chk"><input type="checkbox" data-s="autoDemo"> Prendre automatiquement chaque signal en DEMO (papier)</label>
  <div class="pae-msg pae-m-y"><b>Trading réel : désactivé.</b> Aucun mot de passe ni token n'est demandé. Le moteur n'envoie jamais d'ordre.</div>
 </div>

 <div class="pae-card">
  <div class="pae-h"><b>Prix réel</b><span class="pae-small" data-r="sym"></span></div>
  <div class="pae-price" data-r="price">—</div><div class="pae-sub" data-r="dir">MOTEUR ARRÊTÉ</div>
  <div class="pae-ver" data-r="ver">Flux : moteur arrêté.</div>
 </div>

 <div class="pae-card pae-span"><div class="pae-h"><b>Analyse</b><span class="pae-small" data-r="atime"></span></div><div data-r="analysis"><p class="pae-small">Appuie sur START ENGINE (analyse en continu) ou ANALYZE MARKET (analyse immédiate).</p></div></div>

 <div class="pae-card">
  <div class="pae-h"><b>Résultats DEMO</b><span class="pae-small" data-r="sess"></span></div>
  <div class="pae-stats">
   <div class="pae-st"><b data-r="nT">0</b><span>Contrats</span></div><div class="pae-st"><b data-r="wr">–</b><span>Réussite</span></div><div class="pae-st"><b data-r="net">0.00</b><span>Net ($)</span></div>
   <div class="pae-st"><b data-r="dd">0.00</b><span>Drawdown max</span></div><div class="pae-st"><b data-r="cl">0</b><span>Pertes consécutives</span></div><div class="pae-st"><b data-r="pf">–</b><span>Profit factor</span></div>
  </div>
  <svg class="pae-spark" data-r="spark" viewBox="0 0 300 60" preserveAspectRatio="none"></svg>
  <div class="pae-small" data-r="sigstats"></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="pae-sbtn" data-a="session">Nouvelle session</button><button class="pae-sbtn" data-a="csv">Export CSV</button><button class="pae-sbtn" data-a="clear">Effacer l'historique</button></div>
 </div>

 <div class="pae-card">
  <div class="pae-h"><b>Historique des signaux</b><span class="pae-small" data-r="hcount"></span></div>
  <div class="pae-list" data-r="hist"></div>
 </div>

 <div class="pae-card pae-span">
  <div class="pae-h"><b>Backtest & validation</b><span class="pae-small" data-r="btsym"></span></div>
  <div class="pae-fields"><div class="pae-f"><label>Historique Deriv</label><select data-r="btn"><option value="10000">10 000 ticks</option><option value="20000" selected>20 000 ticks</option><option value="40000">40 000 ticks</option></select></div>
  <div class="pae-f"><label>&nbsp;</label><button class="pae-btn pae-an" style="width:100%" data-a="bt">▶ Lancer le backtest</button></div></div>
  <div class="pae-bar"><i data-r="btbar"></i></div>
  <div data-r="bt" class="pae-small"></div>
 </div>
</div>`;
    const $ = s => el.querySelector(`[data-r="${s}"]`), $s = s => el.querySelector(`[data-s="${s}"]`), $a = s => el.querySelector(`[data-a="${s}"]`);
    $s('strat').innerHTML = grid.map((s, i) => `<option value="${i}">${esc(T.describe(s))}</option>`).join('');

    function renderSymbols() { $s('symbol').innerHTML = symbols.map(([s, n]) => `<option value="${s}" ${s === eng.settings.symbol ? 'selected' : ''}>${esc(n)} · ${s}</option>`).join(''); }
    function renderSettings() {
      const s = eng.settings; renderSymbols();
      const idx = grid.findIndex(g => T.key(g) === T.key(s.strat)); $s('strat').value = String(idx >= 0 ? idx : 0);
      $s('stake').value = s.stake; $s('maxTrades').value = s.maxTrades; $s('lossLimit').value = s.lossLimit;
      $s('onlyValidated').checked = s.onlyValidated; $s('autoDemo').checked = s.autoDemo;
      $('sym').textContent = s.symbol; $('btsym').textContent = s.symbol;
    }
    function settingsFromUI() {
      return { symbol: $s('symbol').value, strat: grid[+$s('strat').value], stake: Math.max(0.35, +$s('stake').value || 1), maxTrades: Math.max(1, Math.floor(+$s('maxTrades').value || 1)), lossLimit: Math.max(0.35, +$s('lossLimit').value || 1), onlyValidated: $s('onlyValidated').checked, autoDemo: $s('autoDemo').checked };
    }
    el.querySelectorAll('[data-s]').forEach(i => i.addEventListener('change', () => { eng.update(settingsFromUI()); renderSettings(); renderBacktest(); renderStats(); }));

    const STATES = { stopped: ['ARRÊTÉ', ''], starting: ['DÉMARRAGE…', 'wait'], running: ['EN MARCHE', 'on'], stopping: ['ARRÊT…', 'wait'], error: ['ERREUR', 'err'] };
    function renderState(info) {
      const [t, c] = STATES[eng.state] || [eng.state, '']; $('state').textContent = t; $('dot').className = 'pae-dot ' + c;
      $a('start').disabled = eng.state === 'running' || eng.state === 'starting';
      $a('stop').disabled = eng.state === 'stopped' || eng.state === 'error' || eng.state === 'stopping';
      if (eng.state === 'error') msg('Le moteur n\'a pas pu démarrer : ' + (info || 'erreur inconnue') + '. Vérifie la connexion internet ; ouvre le site dans Safari/Chrome (pas dans une app qui bloque les connexions).', 'r');
      if (eng.state === 'stopped') { $('dir').textContent = 'MOTEUR ARRÊTÉ'; $('ver').innerHTML = 'Flux : moteur arrêté.'; }
    }
    function msg(t, k) { $('err').innerHTML = t ? `<div class="pae-msg pae-m-${k || 'y'}">${esc(t)}</div>` : ''; }
    function renderVerify() {
      if (eng.state !== 'running') return;
      const c = eng.feedCheck, d = eng._dataInfo();
      $('ver').innerHTML = `${c.ok ? '<span class="pae-ok">✔ Flux Deriv vérifié</span>' : '<span class="pae-ko">✘ Flux non vérifié : ' + esc(c.reason) + '</span>'}<br>Source : <b>${esc((d.endpoint || '').replace('wss://', '').split('?')[0])}</b><br>Dernier tick serveur : <b>${tm(d.to)}</b> · décalage <b>${c.lagSec != null ? c.lagSec.toFixed(1) : '—'} s</b> · cadence <b>${c.interval ? c.interval.toFixed(2) : '—'} s</b><br>Ticks en mémoire : <b>${d.ticks}</b> · messages reçus : <b>${eng.feed.stats.messages}</b> · reconnexions : <b>${eng.feed.stats.reconnects}</b>`;
    }
    let lastPrice = null;
    function renderPrice(q) {
      if (q == null) return;
      const p = eng.pip != null ? q.toFixed(eng.pip) : q;
      $('price').textContent = p; if (lastPrice != null) { $('price').className = 'pae-price' + (q < lastPrice ? ' dn' : ''); $('dir').textContent = q < lastPrice ? '▼ EN BAISSE' : q > lastPrice ? '▲ EN HAUSSE' : '■ INCHANGÉ'; }
      lastPrice = q;
    }
    function renderAnalysis(a) {
      if (!a) return;
      $('atime').textContent = `${tm(a.time)} · ${a.origin || ''}`;
      const cls = a.signal === 'BUY' ? 'pae-buy' : a.signal === 'SELL' ? 'pae-sell' : 'pae-none';
      const di = a.dataInfo || {};
      const val = a.side ? (a.validated ? '<span class="pae-badge pae-b-ok">VALIDÉE</span>' : (eng._validationFor(a.strat) ? '<span class="pae-badge pae-b-no">NON VALIDÉE</span>' : '<span class="pae-badge pae-b-na">NON TESTÉE</span>')) : '';
      $('analysis').innerHTML = `<div class="pae-sig"><div class="pae-pill ${cls}">${a.signal}</div><div class="pae-why">${a.signal === 'NO TRADE' ? '<b>Pas de trade.</b> ' + esc(a.why) : '<b>' + esc(a.reason) + '</b>'}${a.candidate ? `<br><span class="pae-small">Lecture brute : ${a.candidate} (non exploitée)</span>` : ''}</div></div>
      <div class="pae-kv">
       <span>Marché</span><b>${esc(a.symbol)} · prix observé ${a.price != null ? a.price : '—'}</b>
       <span>Stratégie</span><b>${esc(a.name || '')} ${val}</b>
       ${a.scenario ? `<span>Scénario</span><b>${esc(a.scenario)}</b><span>Horizon</span><b>${a.strat.H} tick(s) après l'entrée (≈ ${a.strat.H * (/^1HZ/.test(a.symbol) ? 1 : 2)} s)</b><span>Invalidation</span><b>${a.invalidation.toFixed(eng.pip || 2)} (2σ contre le scénario)</b>` : ''}
       ${a.payoutRatio ? `<span>Risque</span><b>perte max <span class="pae-ko">−${a.loss.toFixed(2)} $</span> · gain <span class="pae-ok">+${a.gain.toFixed(2)} $</span> (paiement ×${a.payoutRatio.toFixed(3)}, marge Deriv incluse, pas d'autres frais)</b>
       <span>Probabilité</span><b>${pc(a.prob)}${a.probCI ? ` (IC 95 % ${pc(a.probCI[0])}–${pc(a.probCI[1])})` : ''} · ${esc(a.probSrc)}</b>
       <span>Espérance</span><b class="${a.ev >= 0 ? 'pae-ok' : 'pae-ko'}">${f$(a.ev)} $ par contrat</b>` : ''}
       <span>Données</span><b>${di.ticks || a.ticksUsed || 0} ticks Deriv ${di.from ? `du ${tm(di.from)} au ${tm(di.to)}` : ''}</b>
      </div>${a.note ? `<div class="pae-msg pae-m-y">${esc(a.note)}</div>` : ''}`;
    }
    function renderStats() {
      const st = eng.stats(), d = st.demo, ss = eng.sessionStats(), s = eng.settings;
      $('nT').textContent = d.trades; $('wr').textContent = d.trades ? pc(d.winRate, 0) : '–';
      $('net').textContent = f$(d.net); $('net').className = d.net >= 0 ? 'pae-ok' : 'pae-ko';
      $('dd').textContent = d.maxDrawdown.toFixed(2); $('cl').textContent = d.maxConsecLosses; $('pf').textContent = d.trades ? (isFinite(d.profitFactor) ? d.profitFactor.toFixed(2) : '∞') : '–';
      $('sess').textContent = `Session ${s.session} : ${ss.trades}/${s.maxTrades} · ${f$(ss.net)} $ / −${s.lossLimit} $`;
      const sg = st.signals;
      $('sigstats').innerHTML = sg.trades ? `Tous les signaux évalués (1 $ théorique chacun) : ${sg.trades} · réussite ${pc(sg.winRate)} (IC 95 % ${pc(T.wilson(sg.wins, sg.trades)[0])}–${pc(T.wilson(sg.wins, sg.trades)[1])}) · net ${f$(sg.net)} $ · ${st.invalidated} invalidés en cours de route · ${st.abandoned} non évalués.${sg.trades < 100 ? ' Moins de 100 signaux : trop peu pour conclure.' : ''}` : 'Aucun signal évalué pour le moment.';
      const eq = st.equity;
      if (eq.length > 1) { const all = [0, ...eq], mn = Math.min(...all), mx = Math.max(...all), sc = v => 58 - ((v - mn) / (mx - mn || 1)) * 56; $('spark').innerHTML = `<line x1="0" x2="300" y1="${sc(0)}" y2="${sc(0)}" stroke="#1f4030"/><polyline fill="none" stroke="${eq[eq.length - 1] >= 0 ? '#2bea6a' : '#ff3b4e'}" stroke-width="2" points="${all.map((v, i) => `${(i / (all.length - 1) * 300).toFixed(1)},${sc(v).toFixed(1)}`).join(' ')}"/>`; } else $('spark').innerHTML = '';
      const h = eng.signals;
      $('hcount').textContent = h.length + ' signaux';
      $('hist').innerHTML = h.slice(0, 150).map(x => {
        const res = x.status === 'pending' ? '<span class="pae-wa">⏳ en cours</span>' : x.status === 'abandoned' ? `<span class="pae-wa">⊘ ${esc(x.note)}</span>` : `<span class="${x.win ? 'pae-ok' : 'pae-ko'}">${x.win ? '✔' : '✘'} ${fx(x.entry, x.pip)}→${fx(x.exit, x.pip)}${x.demo ? ' ' + f$(x.pl) + ' $' : ''}</span>`;
        return `<div class="pae-row"><span>${tm(x.time)} · ${esc(x.symbol)} · <b class="${x.side > 0 ? 'pae-ok' : 'pae-ko'}">${x.signal}</b> H${x.H}${x.demo ? ' · DEMO ' + x.stake + '$' : ''}${x.demoNote ? ' · ' + esc(x.demoNote) : ''}</span><span>${res}</span></div>`;
      }).join('') || '<div class="pae-small">Aucun signal.</div>';
    }
    function renderBacktest() {
      const r = eng.backtests[eng.settings.symbol];
      if (!r) { $('bt').innerHTML = `Aucun backtest pour ce marché. Le moteur teste ${grid.length} stratégies : optimisation sur les 70 % les plus anciens de l'historique Deriv, puis vérification sur les 30 % les plus récents (jamais vus). Seuil de validation corrigé pour les tests multiples (Bonferroni).`; $('btbar').style.width = '0'; return; }
      const val = r.rows.filter(x => x.validated), top = r.rows.slice(0, 12);
      $('bt').innerHTML = `<div class="pae-msg ${val.length ? 'pae-m-g' : 'pae-m-r'}">${val.length ? `<b>${val.length} stratégie(s) validée(s)</b> sur des données jamais vues. Étape suivante : confirmer en DEMO sur au moins 100 signaux.` : '<b>Aucune stratégie rentable démontrée.</b> Aucune règle testée ne bat le paiement Deriv sur la partie test. Avec « validée seulement », le moteur répond NO TRADE : c\'est voulu.'}</div>
      <p style="margin-top:8px">${r.n} ticks Deriv du ${new Date(r.from * 1000).toLocaleString('fr-FR')} au ${new Date(r.to * 1000).toLocaleString('fr-FR')} · source ${esc((r.endpoint || '').replace('wss://', '').split('?')[0])} · paiements Rise/Fall : ${[1, 5, 10].filter(h => r.payouts[h]).map(h => `H${h} ×${r.payouts[h][1].toFixed(3)}/×${r.payouts[h][-1].toFixed(3)}`).join(', ')}</p>
      <div class="pae-tw"><table><tr><th>Stratégie</th><th>Entr. n</th><th>Entr. moy.</th><th>Test n</th><th>Test réussite</th><th>Test net</th><th>Test moy. (IC95)</th><th>DD max</th><th>Pertes consec.</th><th></th></tr>
      ${top.map((x, i) => `<tr><td>${esc(x.name)} ${x.validated ? '<span class="pae-badge pae-b-ok">OK</span>' : ''}</td><td>${x.train.trades}</td><td class="${x.train.ev >= 0 ? 'pae-ok' : 'pae-ko'}">${f$(x.train.ev)}</td><td>${x.test.trades}</td><td>${pc(x.test.winRate)}</td><td class="${x.test.net >= 0 ? 'pae-ok' : 'pae-ko'}">${f$(x.test.net)}</td><td>${f$(x.test.ev)} (${f$(x.test.lo)}/${f$(x.test.hi)})</td><td>${x.test.maxDrawdown.toFixed(1)}</td><td>${x.test.maxConsecLosses}</td><td><button class="pae-sbtn" data-use="${i}">Utiliser</button></td></tr>`).join('')}</table></div>
      <p>Montants pour 1 $ misé par contrat. Classement par résultat d'entraînement ; seul le test compte pour la validation.</p>`;
      el.querySelectorAll('[data-use]').forEach(b => b.onclick = () => { eng.update({ strat: top[+b.dataset.use].strat }); renderSettings(); renderStats(); msg('Stratégie appliquée : ' + top[+b.dataset.use].name, 'g'); });
    }

    // ---- actions réelles ----
    $a('start').onclick = () => { msg(''); eng.start(); };
    $a('stop').onclick = () => eng.stop();
    $a('analyze').onclick = async () => { $a('analyze').disabled = true; try { await eng.analyzeMarket(); } finally { $a('analyze').disabled = false; } };
    $a('bt').onclick = async () => { const b = $a('bt'); b.disabled = true; $('bt').textContent = 'Téléchargement de l\'historique Deriv…'; try { await eng.runBacktest(+$('btn').value, p => { $('btbar').style.width = (p * 100) + '%'; }); } catch (e) { $('bt').innerHTML = `<div class="pae-msg pae-m-r">Backtest impossible : ${esc(e.message)}</div>`; } b.disabled = false; };
    $a('session').onclick = () => { eng.newSession(); renderStats(); };
    $a('clear').onclick = () => { if (confirm('Effacer tout l\'historique des signaux ?')) { eng.clearHistory(); renderStats(); } };
    $a('csv').onclick = () => {
      const rows = [['date', 'marche', 'signal', 'horizon', 'prix_signal', 'entree', 'sortie', 'gagne', 'demo', 'mise', 'paiement', 'profit', 'statut', 'strategie', 'raison']];
      eng.signals.slice().reverse().forEach(x => rows.push([new Date(x.time).toISOString(), x.symbol, x.signal, x.H, x.price, x.entry ?? '', x.exit ?? '', x.win == null ? '' : (x.win ? 1 : 0), x.demo ? 1 : 0, x.stake, x.payoutRatio, x.pl ?? '', x.status, x.name, '"' + String(x.reason || '').replace(/"/g, "'") + '"']));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(';')).join('\n')], { type: 'text/csv' })); a.download = 'profit-analysis-signaux.csv'; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
    };

    // ---- évènements du moteur ----
    eng.on('state', s => renderState(s.info));
    eng.on('symbols', l => { if (l && l.length) { symbols = l.map(x => [x.symbol, x.name]).sort((a, b) => (parseInt(a[0].replace(/\D/g, '')) - parseInt(b[0].replace(/\D/g, ''))) || a[0].localeCompare(b[0])); renderSymbols(); } });
    eng.on('history', h => { lastPrice = null; renderPrice(h.prices[h.prices.length - 1]); renderVerify(); });
    eng.on('tick', t => { renderPrice(t.quote); renderVerify(); });
    eng.on('analysis', a => renderAnalysis(a));
    eng.on('signal', () => renderStats());
    eng.on('result', () => renderStats());
    eng.on('risk', r => msg('DEMO en pause : ' + r + '. Démarre une nouvelle session pour continuer.', 'y'));
    eng.on('backtest', () => renderBacktest());
    eng.on('busy', b => { if (b) $('atime').textContent = b; });
    eng.on('error', e => { if (eng.state === 'running') msg(e.message, 'y'); });
    eng.on('feed', s => { if (eng.state === 'running' && s.state === 'closed') { $('ver').innerHTML = '<span class="pae-ko">✘ Connexion perdue — reconnexion automatique…</span>'; } });
    setInterval(renderVerify, 1000);

    renderSettings(); renderState(); renderStats(); renderBacktest();
    return eng;
  }
  root.PAWidget = { mount };
})(window);
