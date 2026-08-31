# Fabrication — Build Mode

Une fois la conception terminée, le projet devient des instructions concrètes. Toutes les
données de cette page sont dérivées du modèle paramétrique ; aucune n'est saisie.

L'exemple suivi ici est le meuble de référence du §10 de
[NEFTYA_ENGINE.md](NEFTYA_ENGINE.md) : **1800 × 600 × 400 mm**, MDF 18 mm, fond 8 mm
rainuré, un séparateur central, une étagère par compartiment.

---

## 1. Liste des pièces

Chaque pièce reçoit un identifiant stable, réutilisé dans la 3D, les plans 2D, le plan de
découpe et le guide d'assemblage.

| ID | Pièce | Cotes (mm) | Ép. | Qté | Chant |
|---|---|---|---|---|---|
| P01 | Dessus | 1800 × 400 | 18 | 1 | avant |
| P02 | Dessous | 1800 × 400 | 18 | 1 | avant |
| P03 | Côté | 564 × 400 | 18 | 2 | avant |
| P04 | Séparateur central | 564 × 382 | 18 | 1 | avant |
| P05 | Étagère | 873 × 382 | 18 | 2 | avant |
| P06 | Fond | 1772 × 572 | 8 | 1 | — |

---

## 2. Plan de découpe

L'optimiseur place les pièces sur des panneaux standard en réservant le trait de scie
(`kerf_mm`, 3 mm par défaut — voir §6 de [NEFTYA_ENGINE.md](NEFTYA_ENGINE.md)).

### Panneau MDF 18 mm — 2440 × 1220

```text
      0                                    1800 1803        2367   2440
    0 ┌────────────────────────────────────┬────┬───────────┬──────┐
      │                                    │    │           │      │
      │  P01  Dessus  1800 × 400           │////│ P03  côté │      │
  400 ├────────────────────────────────────┤////│  564×400  │      │
  403 ├────────────────────────────────────┼────┼───────────┤      │
      │                                    │////│           │      │
      │  P02  Dessous  1800 × 400          │////│ P03  côté │      │
  803 ├──────────────┬──────────────┬──────┴────┴───────────┤      │
  806 ├──────────────┼──────────────┼───────────────────────┤      │
      │ P05 étagère  │ P05 étagère  │ P04  séparateur       │      │
      │   873×382    │   873×382    │      564×382          │      │
 1188 └──────────────┴──────────────┴───────────────────────┘      │
 1220 └───────────────────────────────────────────────────────────-┘

      ////  trait de scie (3 mm)
```

```text
Surface des pièces  : 2 773 620 mm²
Surface du panneau  : 2 976 800 mm²
Utilisation         : 93,2 %
Chute               :  6,8 %
Panneaux 18 mm      : 1
Panneaux 8 mm       : 1  (fond)
```

> **Note sur cet exemple.** Les deux côtés P03 sont posés pivotés (564 le long de la
> longueur du panneau). C'est licite en V1, où le sens du fil est modélisé mais non
> contraignant (§8 de [NEFTYA_ENGINE.md](NEFTYA_ENGINE.md)). Sur un décor bois, l'optimiseur
> V2 refusera cette rotation et il faudra vraisemblablement un second panneau.

### Nature du problème

L'optimisation de placement est un problème de **bin packing 2D**, NP-difficile. Neftya ne
cherchera pas l'optimum mais une bonne solution rapide, avec des contraintes réalistes :

- coupes guillotine (traversantes de bord à bord), seules réalisables sur scie à panneaux ;
- trait de scie réservé à chaque coupe ;
- sens du fil (V2) ;
- réutilisation des chutes entre projets (non planifié).

---

## 3. Liste des matériaux

### Panneaux

| Matériau | Épaisseur | Format | Quantité |
|---|---|---|---|
| MDF | 18 mm | 2440 × 1220 | 1 |
| MDF | 8 mm | 2440 × 1220 | 1 |

### Chants

Longueur cumulée des chants déclarés sur les pièces. Les chants sont listés mais **non
déduits des cotes de découpe** (§7.4 de [NEFTYA_ENGINE.md](NEFTYA_ENGINE.md)).

```text
P01 + P02 : 1800 × 2   = 3600 mm
P03       :  564 × 2   = 1128 mm
P04       :  564       =  564 mm
P05       :  873 × 2   = 1746 mm
                        ─────────
                          7038 mm   ≈ 7,04 m
```

### Accessoires

Dérivés des assemblages du modèle : vis, tourillons, équerres, charnières, coulisses de
tiroir, colle.

---

## 4. Guide d'assemblage

Le montage est présenté étape par étape, chaque étape référençant les identifiants de
pièces.

```text
Étape 1 / 6
Assemblez P02 (dessous) et P03 (côtés).

Pièces      : P02 ×1, P03 ×2
Fixation    : 4 vis 4 × 50 par côté
Position    : côtés à l'intérieur, alignés sur les bords du dessous
```

L'utilisateur dispose de : étape précédente / suivante, animation, vue éclatée, zoom,
rotation. À terme, les étapes sont animées dans le moteur 3D.

**La séquence est portée par le modèle, pas déduite.** Chaque modèle prédéfini embarque son
ordre de montage, rédigé une fois ; le moteur n'y injecte que les cotes et les identifiants.

Le MVP n'ayant que les modèles comme point d'entrée, cela couvre 100 % des cas sans avoir à
résoudre un problème d'ordonnancement — qui devient réellement difficile dès qu'il y a des
tiroirs. La déduction automatique deviendra nécessaire avec l'éditeur manuel (V3).

---

## 5. Estimation des coûts

| Élément | Quantité | Prix unitaire | Total |
|---|---|---|---|
| MDF 18 mm | 1 panneau | à saisir | |
| MDF 8 mm | 1 panneau | à saisir | |
| Chant PVC 22 mm | 7,04 m | à saisir | |
| Vis 4 × 50 | 24 unités | à saisir | |
| Tourillons 8 mm | 16 unités | à saisir | |

Les prix sont **saisis par l'utilisateur** en V1, puis mémorisés par organisation. Une
connexion à des catalogues fournisseurs est envisagée plus tard.

> **Pourquoi la colonne est vide.** Le prix d'un panneau varie fortement selon la région et
> le fournisseur. Livrer des prix par défaut inventés donnerait un devis faux, ce qui est
> pire que pas de devis du tout pour la cible primaire. La saisie manuelle est assumée.

---

## 6. Export

- **PDF** : plans techniques, liste de pièces, plan de découpe, guide d'assemblage.
- **CSV** : liste de pièces, exploitable par la plupart des scies à panneaux et des
  optimiseurs tiers.

```text
id;longueur_mm;largeur_mm;epaisseur_mm;quantite;materiau;chant
P01;1800;400;18;1;MDF;avant
P02;1800;400;18;1;MDF;avant
P03;564;400;18;2;MDF;avant
```

- **SVG** : plans 2D, ultérieurement.
- **DXF** : reporté en V2. Sans les positions de perçage, un DXF ne contient que des
  contours et n'apporte guère plus que le CSV.
