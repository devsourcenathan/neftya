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

Modèle **freemium** à trois paliers.

### Free

- Nombre limité de projets
- Modèles basiques
- Visualisation limitée
- Exports limités

### Pro — l'artisan indépendant

**L'outil métier complet, pour un utilisateur.**

- Projets illimités
- Visualisation 3D complète
- Optimisation de découpe
- Exports techniques (PDF, CSV)
- **Devis**
- Assistant IA
- Historique

### Professional — ateliers

**Tout Pro, plus le collectif.**

- Multi-utilisateurs et organisations
- Gestion d'équipe et des rôles
- Gestion des clients
- Branding personnalisé
- API

Le devis et l'export technique sont dans Pro, et non réservés à Professional : la cible
primaire est l'artisan seul, et lui refuser le devis reviendrait à lui refuser la raison
même d'utiliser Neftya. Professional ne vend que ce qui n'a de sens qu'à plusieurs.

### Traduction en quotas de plateforme

Ce que chaque palier accorde devient des clés `limits`, **préfixées par le produit** :

| Clé | Free | Pro | Professional |
|---|---|---|---|
| `neftya_projects_max` | 3 | `null` | `null` |
| `neftya_ai_analyses_max` | 5 | 50 | 200 |
| `members` | 1 | 1 | `null` |

`null` vaut illimité. `members` est une clé de la plateforme, pas de Neftya : les
utilisateurs d'une organisation sont déjà nommés par Sekuu, et en redéclarer une seconde
finirait par en dire une autre.

Le multi-utilisateur de Professional n'est donc pas une fonctionnalité de Neftya : c'est
`members` qui passe de 1 à illimité côté plateforme.
