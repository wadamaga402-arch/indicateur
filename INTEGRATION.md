# Intégrer le Profit Analysis Engine dans le site Profit Analysis AI

Le moteur est indépendant de toute page. Il tient en 4 fichiers (dépôt GitHub `wadamaga402-arch/indicateur`) :

| Fichier | Rôle | Obligatoire |
|---|---|---|
| `trend-engine.js` | Calculs : indicateurs, stratégies, règles Rise/Fall, backtest, validation | oui |
| `deriv-feed.js` | Connexion aux données publiques officielles de Deriv | oui |
| `pa-engine.js` | Contrôleur : start / stop / analyze, démo, historique, statistiques | oui |
| `pa-widget.js` | Interface prête à l'emploi (boutons, cartes, tableaux) | seulement pour l'option A |

Copie ces fichiers à la racine de ton site, à côté de ta page (ou dans un dossier `js/`, en adaptant les chemins).

## Option A — ajouter l'interface complète dans une de tes pages (5 minutes)
Là où tu veux le moteur, ajoute :
```html
<div id="pa-engine"></div>
<script src="trend-engine.js"></script>
<script src="deriv-feed.js"></script>
<script src="pa-engine.js"></script>
<script src="pa-widget.js"></script>
<script>PAWidget.mount(document.getElementById('pa-engine'));</script>
```
Tout le style est préfixé `pae-` : tes styles et tes pages ne sont pas modifiés.

## Option B — brancher TES boutons START ENGINE / STOP ENGINE / ANALYZE MARKET
Garde ton design. Ajoute les 3 scripts obligatoires, puis relie tes boutons (remplace les `#id` par les tiens) :
```html
<script src="trend-engine.js"></script>
<script src="deriv-feed.js"></script>
<script src="pa-engine.js"></script>
<script>
  const engine = new PAEngine();                       // réglages et historique gardés dans le navigateur
  engine.update({ symbol: '1HZ100V', stake: 1, maxTrades: 30, lossLimit: 10, onlyValidated: true, autoDemo: false });

  document.querySelector('#startEngine').onclick   = () => engine.start();
  document.querySelector('#stopEngine').onclick    = () => engine.stop();
  document.querySelector('#analyzeMarket').onclick = () => engine.analyzeMarket();
  document.querySelector('#backtest')?.addEventListener('click', () => engine.runBacktest(20000, p => console.log('progression', p)));

  engine.on('state',    s => /* 'stopped' | 'starting' | 'running' | 'stopping' | 'error' */ console.log(s));
  engine.on('tick',     t => /* t.quote = prix réel, t.epoch = heure serveur */ null);
  engine.on('analysis', a => {
    // a.signal : 'BUY' | 'SELL' | 'NO TRADE'
    // a.why (si NO TRADE), a.reason, a.scenario, a.strat.H (horizon en ticks), a.invalidation,
    // a.price, a.gain, a.loss, a.payoutRatio, a.prob, a.probCI, a.probSrc, a.ev, a.validated, a.time, a.dataInfo
  });
  engine.on('result',   r => /* signal évalué : r.entry, r.exit, r.win, r.pl, r.status */ null);
  engine.on('backtest', b => /* b.rows[i] = { name, train, test, validated } */ null);
  // engine.stats() -> { demo: {trades, winRate, net, maxDrawdown, maxConsecLosses, profitFactor}, signals: {...}, equity: [...] }
</script>
```

## Hébergement
- Les fichiers doivent être servis par un vrai site (Netlify, GitHub Pages…), ouvert dans Safari, Chrome ou Firefox.
- Dans l'aperçu de l'app Claude, les connexions externes sont bloquées : le moteur affichera « ERREUR » (c'est normal).

## Sécurité
- Aucun compte, mot de passe ou token n'est utilisé : seulement les données publiques de Deriv.
- Le moteur n'envoie aucun ordre. Le mode DEMO simule les contrats sur les vrais ticks.
- Trading réel (non fait) : il faudrait un petit serveur qui garde le token Deriv côté serveur (jamais dans le navigateur),
  avec OAuth Deriv, des permissions minimales (« trade » seulement) et une confirmation explicite à chaque ordre.
