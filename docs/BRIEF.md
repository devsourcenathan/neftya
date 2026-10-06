# Brief produit

## 1. Vision

Créer une plateforme intelligente permettant de transformer une idée, une image ou une
description en un projet de meuble complet, techniquement exploitable et prêt à être
fabriqué.

L'utilisateur part d'une inspiration et obtient progressivement :

- une conception structurée du meuble ;
- une visualisation interactive 2D et 3D ;
- des dimensions précises ;
- la liste complète des pièces à découper ;
- un plan d'optimisation des panneaux ;
- la liste des matériaux et accessoires ;
- des instructions d'assemblage étape par étape ;
- une estimation des coûts ;
- des documents techniques exportables.

Neftya rend la conception et la fabrication de meubles accessibles sans maîtriser AutoCAD,
SketchUp ou Fusion 360.

---

## 2. Proposition de valeur

> Transformer une inspiration en meuble réellement fabricable.

De nombreuses personnes trouvent des meubles intéressants sur Pinterest, Instagram, TikTok
ou en magasin, sans disposer de ce qu'il faut pour les reproduire.

Une image ne fournit pas :

- les dimensions ;
- les matériaux ;
- les cotes de chaque pièce ;
- les techniques d'assemblage ;
- les quantités ;
- le plan de découpe ;
- les étapes de fabrication.

Neftya comble l'écart entre **l'inspiration, la conception et la fabrication**.

---

## 3. Positionnement

Neftya n'est pas un générateur de plans à partir d'une image.

C'est une **plateforme de conception, de visualisation et de préparation à la fabrication**.
L'image n'est qu'un point d'entrée parmi d'autres (voir [USER_JOURNEY.md](USER_JOURNEY.md)).

### Concurrence

Le marché n'est pas vide, et le positionnement doit s'énoncer par rapport à lui :

| Outil | Ce qu'il fait | Ce qui manque |
|---|---|---|
| SketchUp + OpenCutList | Liste de découpe et optimisation, gratuit, très installé chez les menuisiers | Il faut d'abord savoir modéliser dans SketchUp |
| PolyBoard, Cabinet Vision | Conception de caissons professionnelle, sortie machine | Coût et courbe d'apprentissage élevés |
| Sweet Home 3D | Aménagement d'intérieur | Aucune sortie de fabrication |
| Fusion 360 | CAO généraliste | Généraliste, non métier |

**La différenciation de Neftya est le temps entre l'intention et le plan de découpe.**
Elle n'est pas la 3D, que tous font, ni l'IA, qui reste une assistance. Ce positionnement
n'a pas encore été validé auprès d'artisans ; c'est le premier travail terrain à mener.

---

## 4. Utilisateurs

### Cible primaire V1 — menuisiers et artisans

Professionnels recevant régulièrement des références envoyées par leurs clients :

> « Je veux exactement ce meuble. »

**Besoins :** concevoir vite, adapter les dimensions, générer des listes de découpe,
préparer les matériaux, produire un devis, montrer une visualisation au client.

**Pourquoi cette cible en premier.** C'est le juge le plus exigeant sur la justesse des
cotes, et c'est lui qui paie. Un artisan abandonne l'outil à la première cote fausse, mais
le recommande s'il lui fait gagner une heure par devis. Satisfaire son exigence de précision
donne le produit du particulier presque gratuitement ; l'inverse n'est pas vrai.

**Conséquence directe :** dans les arbitrages, la précision des cotes prime sur la
simplicité de l'onboarding. C'est ce qui justifie le niveau de détail de
[NEFTYA_ENGINE.md](NEFTYA_ENGINE.md).

### Cible secondaire — particuliers / DIY

Personnes souhaitant fabriquer elles-mêmes un meuble TV, une bibliothèque, un bureau, un
lit, un dressing, des étagères, une table ou un meuble de rangement.

**Besoins :** comprendre comment fabriquer, obtenir les dimensions, acheter les bonnes
quantités, réduire les erreurs, visualiser avant de couper.

### Cible secondaire — ateliers de fabrication

Petites et moyennes entreprises de fabrication de meubles.

**Besoins :** centraliser les projets, gérer plusieurs collaborateurs, standardiser les
plans, préparer les découpes, suivre la fabrication, partager les documents techniques.

Ces besoins reposent largement sur les organisations et les rôles fournis par
[Sekuu Platform](SEKUU.md).

---

## 5. Modèle économique

> **Les plans appartiennent à Sekuu Billing, pas à Neftya.** Ce qui suit décrit
> l'intention commerciale ; sa mise en œuvre est un catalogue de plans côté plateforme.
> Neftya n'en lit que deux choses : le claim `products` (a-t-il droit à Neftya ?) et le
> claim `limits` (quels plafonds ?). Il ne connaît ni plan, ni facture, ni échéance.
> Voir [SEKUU.md](SEKUU.md) §5.

Modèle **freemium** à quatre paliers. Les noms et les tarifs sont ceux du catalogue de
facturation ; la grille complète est au §5.4, et c'est elle qui fait foi depuis le
6 octobre 2026.

### Gratuit

- **Trois projets**
- Tous les modèles prédéfinis
- **Tous les exports**, PDF, CSV et DXF compris
- Cinq analyses d'IA par mois

> **Les exports ne sont pas bridés, contrairement à la première version de ce brief.**
> Le plan de découpe est exactement ce qu'on veut faire essayer à un menuisier : brider le
> seul livrable qui prouve la justesse du moteur, c'est brider la démonstration. Le frein du
> gratuit, ce sont les trois projets.

### Solo — l'artisan seul

**L'outil métier complet, pour une ou deux personnes.**

- Dix projets
- Exports techniques, DXF compris
- **Devis, envoyé au client**
- Assistant IA, cinquante analyses par mois

### Pro — l'atelier et son équipe

**Tout Solo, plus le collectif.**

- Cent projets, dix membres
- Gestion d'équipe et des rôles
- Gestion des clients — *pas encore livrée*
- Quatre fois plus d'analyses

### Max — plusieurs ateliers

- Projets et membres illimités
- Mille analyses par mois
- Branding personnalisé — *pas encore livré*
- API — *pas encore livrée*

**Le devis et l'export technique sont dans Solo**, le palier le plus bas qui se paie : la
cible primaire est l'artisan seul, et lui refuser le devis reviendrait à lui refuser la
raison même d'utiliser Neftya. Les paliers supérieurs ne vendent que ce qui n'a de sens qu'à
plusieurs.

> **Trois promesses de ce §5 ne sont pas livrées** au 6 octobre 2026 : la gestion des
> clients, le branding et l'API. Un projet n'a aujourd'hui aucun client rattaché, ce qui est
> aussi ce qui manque pour qu'un devis parte sans qu'on saisisse l'adresse à la main.

### 5.4 La grille, arbitrée le 6 octobre 2026

Ce que chaque palier accorde devient des clés `limits`, **préfixées par le produit** :

| Clé | Gratuit | Solo · 5 000 | Pro · 15 000 | Max · 40 000 |
|---|---|---|---|---|
| `neftya_projects_max` | 3 | 10 | 100 | `null` |
| `neftya_ai_month_max` | 5 | 50 | 200 | **1 000** |
| `members` | 1 | 2 | 10 | `null` |
| `storage_gb` | 1 | 5 | 50 | 200 |
| Essai | — | 14 j | 14 j | 14 j |

`null` vaut illimité. Montants en francs CFA par mois ; remises de 2 %, 3 % et 5 % au
trimestre, au semestre et à l'année.

**Trois écarts avec la première version de ce brief, et leurs motifs.**

Les noms sont **Solo, Pro, Max** et non Pro / Professional : ce sont ceux du catalogue de
facturation, et un tarif se cite dans une facture — le renommer rendrait rétroactif ce qui
ne doit pas l'être.

La clé d'IA s'appelle `neftya_ai_month_max` et non `neftya_ai_analyses_max`. La seconde était
celle de ce brief ; **personne ne l'a jamais lue**. La colonne que Neftya interroge s'appelle
`ai_month_max` depuis sa migration `0006`, et c'est elle qui compte réellement les
générations du mois.

**`neftya_ai_month_max` est plafonné même sur Max**, à mille analyses. L'IA est la seule
fonction qui dépense de l'argent réel à chaque appel : un palier illimité est une facture
dont on ne connaît pas le plafond, et c'est précisément le scénario où l'on perd de l'argent
sans le voir.

### 5.5 Qui applique quoi

`members` est une clé de la **plateforme**, pas de Neftya : les utilisateurs d'une
organisation sont déjà nommés par Sekuu, et en redéclarer une seconde finirait par en dire
une autre.

**Mais Sekuu est mis de côté** (voir le journal des décisions, 6 octobre 2026), et un quota
que personne n'applique est une promesse qu'on ne tient pas. Neftya l'applique donc en local,
avec la même clé — `members`, sans préfixe — pour qu'au retour de la plateforme ce soit la
même règle qui soit lue, et non une seconde à réconcilier.

**Une organisation créée localement naît au palier gratuit.** Sans quoi elle naîtrait « non
couverte », donc illimitée, et ce tableau ne serait qu'un tableau. Les organisations créées
avant cette décision gardent leur absence de plafond : les plafonner après coup aurait fermé
des projets déjà créés.
