# VolScope — moteur d'analyse Matches / Differs (Deriv)

- `scanner.html` : le scanner (interface + moteur en direct, backtest, profils, démo).
- `engine.js` : le moteur (fonctions pures, sans réseau, testable).
- `tests/engine.test.js` : 11 tests automatiques (`node --test tests/engine.test.js`).
- `index.html` : VolScope (vue multi-marchés).

## Ce que fait le moteur
1. **Données réelles** : connexion WebSocket publique Deriv (nouvelle API, puis ancienne en secours),
   liste des indices via `active_symbols`, ticks via `ticks_history` + abonnement, paiements via `proposal`.
   Aucun prix n'est inventé : sans flux, le moteur affiche « ATTENDRE ».
2. **Vérification du flux** : horodatages serveur croissants, décalage avec l'heure du téléphone, cadence (1 s ou 2 s).
3. **Analyse** : fréquences sur 50/100/200/500/1000 ticks, test du χ², z-score par chiffre, intervalle de Wilson.
4. **Stratégies** (62) : Matches ou Differs × chiffre le plus / le moins fréquent / dernier chiffre × fenêtre × seuil |z|.
5. **Backtest** : décision au tick t avec le passé seulement, résultat au tick t+1 (règle Deriv 1 tick).
   Entraînement sur 70 % de l'historique, validation sur les 30 % suivants.
   « Validée » seulement si l'espérance reste > 0 sur le test avec 95 % de confiance (≥ 300 contrats).
6. **Recommandation** : uniquement si le critère de la stratégie est rempli (et, par défaut, si elle est validée).
   Sinon : « ATTENDRE — CONDITIONS INSUFFISANTES » avec la raison.
7. **Démo (papier)** : mise, max contrats et limite de perte par session ; historique complet par profil, export CSV.
8. **Sécurité** : aucun token demandé ni stocké ; exécution réelle désactivée (elle exigerait un serveur).

## Tester
1. Ouvrir `scanner.html` hébergé (Safari/Chrome, pas l'app Claude).
2. Vérifier « ✔ Flux réel vérifié » et comparer le prix avec le graphique Deriv du même indice.
3. Lancer le backtest (20 000 ticks), lire le verdict.
4. Profil : décocher « validées seulement » pour voir les signaux non validés, cocher l'exécution démo,
   mettre max contrats = 20 : la session doit s'arrêter seule à 20.
5. Comparer « Réussite » et « Net » avec la probabilité affichée.
