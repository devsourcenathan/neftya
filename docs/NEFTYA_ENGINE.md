# Neftya Engine — moteur paramétrique

> **C'est le document le plus important du projet.**
>
> La valeur de Neftya ne réside ni dans l'IA ni dans la 3D. Elle réside dans un moteur
> capable de représenter un meuble comme un ensemble de composants réels, et d'en dériver
> automatiquement des cotes justes. Une cote fausse de 18 mm coûte un panneau à
> l'utilisateur et détruit la confiance définitivement.
>
> Les règles ci-dessous sont des **choix par défaut arrêtés le 31/07/2026** (voir
> [DECISIONS.md](DECISIONS.md)). Elles sont faites pour être discutées, mais elles doivent
> exister : sans elles, « le système recalcule automatiquement » ne veut rien dire.

---

## 1. Rôle du moteur

Un meuble n'est pas une image 3D. C'est un ensemble de composants dotés de propriétés
physiques, reliés par des règles.

Le moteur est responsable de :

- représenter le meuble sous forme de composants ;
- propager toute modification de paramètre à l'ensemble du modèle ;
- dériver les cotes de découpe à partir des conventions d'assemblage ;
- signaler les configurations physiquement douteuses.

Il ne dépend ni de l'interface, ni du moteur 3D, ni de l'IA. Ces trois éléments le
consomment.

---

## 2. Single Source of Truth

Le modèle paramétrique est la source unique de toutes les représentations.

```text
                FURNITURE MODEL
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
       3D             2D           CUT LIST
        │              │              │
        ▼              ▼              ▼
   EXPLODED VIEW   TECHNICAL      MATERIAL
                   DRAWINGS        LIST
        │
        ▼
ASSEMBLY ANIMATION
```

Aucune de ces vues n'est modifiable directement. Toutes sont recalculées à partir du
modèle. Une modification de paramètre met donc à jour, dans le même mouvement : les cotes
des pièces, le modèle 3D, les plans 2D, la liste de découpe, les quantités de matériaux,
l'optimisation des panneaux et le coût estimatif.

---

## 3. Modèle de données

```text
FURNITURE
│
├── Dimensions          largeur, hauteur, profondeur (hors-tout, mm)
│
├── Parameters          voir §4
│
├── Components
│   ├── Panels          dessus, dessous, côtés, séparateurs
│   ├── Shelves
│   ├── Drawers
│   ├── Doors
│   ├── Back
│   └── Legs
│
├── Materials
│
├── Connections         vis, tourillons, colle, équerres
│
└── Assembly            séquence d'étapes
```

Chaque composant porte :

| Propriété | Type | Note |
|---|---|---|
| `id` | `string` | Identifiant stable (`P01`, `P02`…), réutilisé dans toutes les vues |
| `type` | `enum` | `panel`, `shelf`, `drawer`, `door`, `back`, `leg` |
| `role` | `enum` | `top`, `bottom`, `side`, `divider`, `shelf`… |
| `width_mm` `height_mm` `thickness_mm` | `int` | **Dérivées**, jamais saisies directement |
| `position` | `vec3` | Repère du meuble, origine au coin inférieur avant gauche |
| `rotation` | `vec3` | |
| `material_id` | `ref` | |
| `grain` | `enum` | `length`, `width`, `none` — voir §8 |
| `edges` | `set` | Faces recevant un chant — voir §7.4 |
| `quantity` | `int` | |

Les dimensions d'un composant ne sont **jamais** stockées comme une saisie utilisateur.
Elles sont calculées à partir des dimensions hors-tout, des paramètres du projet et de la
convention d'assemblage. C'est ce qui garantit qu'aucune vue ne peut diverger du modèle.

---

## 4. Paramètres de projet

| Paramètre | Défaut | Rôle |
|---|---|---|
| `panel_thickness_mm` | `18` | Épaisseur des panneaux de structure |
| `back_thickness_mm` | `8` | Épaisseur du fond |
| `back_setback_mm` | `18` | Retrait du fond par rapport à l'arrière |
| `groove_depth_mm` | `4` | Profondeur de la rainure recevant le fond |
| `kerf_mm` | `3` | Trait de scie — voir §6 |
| `edge_banding` | `listed` | Chants listés mais non déduits — voir §7.4 |
| `assembly_convention` | `sides_between_top_bottom` | Voir §5 |
| `drawer_side_clearance_mm` | `13` | Jeu par côté pour les coulisses — voir §5.1 |
| `drawer_back_clearance_mm` | `10` | Jeu à l'arrière du caisson tiroir |
| `front_gap_mm` | `3` | Jeu entre deux façades ou deux portes |

Tous sont modifiables par projet. Les défauts visent une scie à panneaux courante et du
mélaminé 18 mm.

### Unités : millimètres entiers, et rien d'autre

**Le moteur ne connaît que le millimètre entier.** L'impérial est une affaire d'affichage et
de saisie, traitée dans une couche dédiée ([I18N.md](I18N.md) §4) : un moteur manipulant des
pouces fractionnaires perdrait l'invariant de recomposition.

Ce qui **dépend** du système d'unités, ce sont les catalogues — et ils ne se convertissent
pas :

```text
épaisseur courante  :   18 mm         contre  3/4" = 19,05 mm   (écart 1,05 mm)
panneau standard    : 2440 × 1220     contre  4' × 8' = 2438,4 × 1219,2
```

Un côté de 3/4" traité comme 18 mm décale **chaque** cote intérieure du caisson. Les
catalogues sont donc distincts par système, jamais dérivés l'un de l'autre.

### Formats de panneaux

Le moteur fournit une liste par défaut selon le système d'unités, que chaque organisation
complète avec les formats de son fournisseur. L'optimiseur retient le format le plus
économique parmi ceux déclarés.

| Métrique | Impérial |
|---|---|
| 2440 × 1220 — le plus répandu | 2438,4 × 1219,2 (4' × 8') |
| 2800 × 2070 — grand format | 3048 × 1524 (5' × 10') |
| 3050 × 1220 | |

### Tolérance : zéro

**La somme des pièces doit égaler la cote hors-tout, au millimètre.** Le reste d'une
division va au dernier compartiment (§7.3) ; aucune cote n'est à virgule.

C'est un invariant vérifiable, et il doit l'être :

```text
pour toute configuration :  somme(pièces + épaisseurs) == cote_hors_tout
```

Ce test est la démonstration la plus directe que le moteur est juste. Il n'y a pas de
marge « pour absorber les arrondis » : une marge rendrait le test incapable de distinguer
un arrondi d'un vrai bug.

---

## 5. Convention d'assemblage

**Défaut : côtés entre dessus et dessous** (`sides_between_top_bottom`).

Le dessus et le dessous font toute la largeur ; les côtés se logent entre eux. La charge
passe par les côtés, et les chants visibles de face sont ceux du dessus et du dessous.
C'est la convention la plus courante en caisson mélaminé.

Pour un meuble de largeur `L`, hauteur `H`, profondeur `P` et une épaisseur `e` :

| Pièce | Largeur | Profondeur / hauteur |
|---|---|---|
| Dessus, dessous | `L` | `P` |
| Côtés | `H − 2e` | `P` |
| Séparateur vertical | `H − 2e` | `P − back_setback` |
| Étagère | largeur intérieure du compartiment | `P − back_setback` |
| Fond | `L − 2e + 2 × groove_depth` | `H − 2e + 2 × groove_depth` |

Les étagères et séparateurs s'arrêtent devant le fond ; le dessus, le dessous et les côtés
vont jusqu'à l'arrière et portent la rainure.

> **Convention alternative** (`top_bottom_between_sides`) : les côtés font toute la
> hauteur, le dessus et le dessous se logent entre. Prévue au modèle, non exposée en V1.

### 5.1 Tiroirs

Les tiroirs sont **dans le périmètre de la V1**. Un tiroir est un petit caisson —
deux côtés, un devant, un dos, un fond rainuré — sur lequel se visse une **façade
rapportée**. La façade étant indépendante, elle se règle après montage : c'est ce qui
permet de rattraper un caisson légèrement hors d'équerre.

Pour un compartiment de largeur intérieure `Lc` et un jeu `drawer_side_clearance_mm` :

| Pièce | Cote |
|---|---|
| Largeur hors-tout du tiroir | `Lc − 2 × jeu` |
| Côtés du tiroir | profondeur × hauteur, ×2 |
| Devant et dos | `Lc − 2 × jeu − 2e`, ×2 |
| Fond | rainuré, `back_thickness_mm` |
| Façade | voir ci-dessous, pièce indépendante |

Exemple, compartiment de 576 mm, jeu 13 mm, panneaux 18 mm :

```text
hors-tout tiroir : 576 − 2×13 = 550
devant et dos    : 550 − 2×18 = 514
profondeur       : 400 − 18 (fond) − 10 (jeu arrière) = 372
```

**Façades.** Elles pavent toute la façade du meuble, et **chaque jeu est centré sur son
séparateur** :

```text
départ_du_jeu(i) = centre_du_séparateur(i) − ⌊front_gap / 2⌋
```

La façade d'extrémité va du bord du meuble au premier jeu ; les intérieures vont d'un jeu
au suivant.

```text
1800 mm, 3 compartiments de 576, panneaux 18, jeu 3

séparateurs   : 594–612          1188–1206
centres       :      603              1197
jeux          :    602–605         1196–1199
façades       : 0–602      605–1196      1199–1800
                 602          591           601
recomposition : 602 + 3 + 591 + 3 + 601 = 1800  ✓
```

Une façade est donc **plus large que son compartiment** : elle couvre aussi la moitié des
séparateurs voisins, ou le côté du meuble. C'est ce que signifie le recouvrement total, et
c'est pourquoi les façades d'extrémité sont plus larges que les intérieures — de
l'épaisseur d'un côté.

> **Pourquoi pas une division uniforme.** Poser `(L − (n−1) × jeu) / n` donne des façades
> égales, ce qui est plus joli, mais ignore la position réelle des séparateurs. Sur des
> panneaux fins ou des compartiments inégaux, un jeu finit à côté de son séparateur et
> l'on voit à l'intérieur du meuble — vérifié sur 400 mm, 4 compartiments, panneaux de
> 8 mm : le jeu commence 1 mm avant le séparateur. Centrer le jeu rend la faute impossible
> par construction plutôt que détectable après coup.

> **Limite assumée de la V1.** Le moteur donne la profondeur utile du tiroir mais **ne
> choisit pas la coulisse** : les longueurs standard (250, 300, 350, 400, 450, 500) et
> leurs perçages relèvent du catalogue de quincaillerie, reporté en V2. En V1 l'artisan
> choisit sa coulisse et la positionne lui-même.

### 5.2 Portes

**Hors périmètre V1.** À leur arrivée : **recouvrement total** — la porte couvre le chant
du caisson — avec le même pavage que les façades de tiroir et un jeu `front_gap_mm`.

Le recouvrement total est retenu pour sa tolérance : un écart d'un millimètre sur le
caisson ne se voit pas, là où une porte encastrée le révèle.

### 5.3 Pieds et socle

**La hauteur saisie par l'utilisateur est celle du caisson.** Les pieds s'ajoutent
par-dessous, et le moteur affiche la hauteur au sol à titre indicatif.

```text
Hauteur saisie  : 600 mm   (caisson, sert au calcul des côtés)
Pieds           : 100 mm
Hauteur au sol  : 700 mm   (affichée, jamais utilisée dans une cote de découpe)
```

Ainsi, changer de pieds ne recalcule aucune cote de découpe.

---

## 6. Trait de scie

Chaque coupe consomme la largeur de la lame. L'ignorer produit un plan de découpe faux :
sur un panneau de 2440 mm et dix coupes, ce sont 30 mm qui disparaissent.

`kerf_mm` intervient **uniquement dans l'optimisation des panneaux**, jamais dans le calcul
des cotes des pièces. Une pièce mesure ce qu'elle doit mesurer une fois coupée ; c'est le
placement sur le panneau qui doit réserver la matière du trait.

```text
Panneau 2440 mm, découpe en bandes de 244 mm

Sans kerf : 10 bandes                    -> faux
Avec 3 mm : 9 bandes + chute de 217 mm   -> juste
```

---

## 7. Règles de propagation

### 7.1 Principe : les éléments s'étirent

Quand une dimension hors-tout change, **le nombre de compartiments, d'étagères, de tiroirs
et de portes reste celui que l'utilisateur a choisi**. Ce sont leurs dimensions qui varient.

```text
Largeur 1800 mm : 3 compartiments de 576 mm
Largeur 2200 mm : 3 compartiments de 709 / 709 / 710 mm
```

Le détail du calcul, pour 1800 mm avec 2 séparateurs (§7.3) :

```text
intérieur   = 1800 − 2 × 18 = 1764
disponible  = 1764 − 2 × 18 = 1728      (les 2 séparateurs)
compartiment = 1728 / 3     =  576
recomposition : 18 + 576 + 18 + 576 + 18 + 576 + 18 = 1800  ✓
```

À 2200 mm, la division ne tombe pas juste : 2128 / 3 = 709,33. Le reste va au dernier
compartiment, qui mesure 710 mm.

Ce choix privilégie la prévisibilité : l'utilisateur retrouve le meuble qu'il a conçu, en
plus large. La contrepartie est qu'un étirement peut produire une portée excessive — c'est
la validation technique (§9) qui doit alors alerter, et non le moteur qui décide à la place
de l'utilisateur.

Un mode `repeat` (maintenir une largeur cible et ajuster le nombre) est prévu au modèle
mais n'est pas exposé en V1.

### 7.2 Ordre de calcul

1. Dimensions hors-tout.
2. Pièces d'enveloppe (dessus, dessous, côtés), par la convention d'assemblage.
3. Espace intérieur disponible.
4. Séparateurs verticaux, répartis dans l'espace intérieur.
5. Largeur des compartiments = espace intérieur restant, divisé par le nombre de compartiments.
6. Étagères, tiroirs, portes, dans chaque compartiment.
7. Fond.
8. Quincaillerie et assemblages.

### 7.2 bis Le plan de façade

Tiroirs et portes vivent dans **le même plan** — celui qu'on voit de face — et se partagent
donc la hauteur du compartiment. Chaque rangée reçoit une part égale, moins les jeux.

**Convention V1 : les tiroirs en bas, la porte au-dessus.** C'est l'arrangement d'un dressing
à socle de tiroirs. Un buffet range souvent l'inverse ; rendre l'ordre configurable est un
travail de V2, et l'inventer ici reviendrait à choisir à la place du menuisier.

Les portes sont **en applique** : elles recouvrent le devant du caisson, comme les façades de
tiroir. Une porte encastrée à fleur demanderait un jeu périmétrique différent sur chaque
bord et un caisson d'équerre au dixième de millimètre — ce qu'on n'obtient pas d'un panneau
scié.

**Deux vantaux sont rigoureusement égaux**, et le jeu central absorbe le millimètre impair.
Un écart d'un millimètre est invisible sur une étagère et voyant entre deux portes qu'on
regarde de face toute la journée.

Le nombre de charnières dépend de la **hauteur** du vantail, pas de son nombre :

| Hauteur | Charnières |
|---|---|
| ≤ 900 mm | 2 |
| ≤ 1600 mm | 3 |
| ≤ 2000 mm | 4 |
| au-delà | 5 |

Un vantail unique de plus de 600 mm de large est **signalé, pas refusé** : il pèsera sur ses
charnières et finira par frotter, mais c'est au menuisier de trancher.

### 7.3 Répartition d'un espace intérieur

Pour `n` compartiments dans une largeur intérieure `Li` avec `k = n − 1` séparateurs :

```text
largeur_compartiment = (Li − k × e) / n
```

La division ne tombe pas toujours juste. **Règle : le reste est absorbé par le dernier
compartiment**, à raison d'un millimètre au plus. Le moteur ne produit jamais de cote à
virgule : toutes les cotes de découpe sont des entiers en millimètres.

### 7.4 Chants

Les chants sont **listés dans la liste des matières mais non déduits des cotes**. Un chant
de 0,4 à 1 mm se rattrape au montage, et le déduire complexifierait chaque pièce pour un
gain qui n'est pas mesurable à la scie.

```text
Étagère : 873 × 382 mm  (cote de découpe)
Chant   : 873 mm sur le chant avant

Liste des matières -> Chant PVC 22 mm : 1,75 m
```

Ce choix devra être revu si des chants épais (2 mm ABS) sont supportés.

---

## 8. Sens du fil

Chaque pièce porte un attribut `grain` (`length`, `width`, `none`). **En V1 l'optimiseur ne
s'en sert pas** : il peut pivoter librement les pièces pour réduire la chute.

L'information est modélisée dès maintenant pour qu'activer la contrainte en V2 n'impose
aucune migration de données. Sur un décor bois, un plan V1 devra donc être relu avant
découpe.

---

## 9. Validation technique

Le moteur signale les configurations physiquement douteuses. L'objectif n'est pas de
remplacer un menuisier, mais d'éviter les erreurs les plus courantes.

### Flèche d'une étagère

Une étagère trop longue ou trop fine **fléchit** sous la charge. La flèche est la
déformation au centre ; c'est elle qui se voit, et elle se calcule.

Pour une étagère sur appuis simples, uniformément chargée :

```text
δ = 5 · w · L⁴ / (384 · E · I)        avec  I = b · h³ / 12
```

| Symbole | Signification |
|---|---|
| `δ` | Flèche au centre (mm) |
| `w` | Charge répartie (N/mm) |
| `L` | Portée libre (mm) |
| `E` | Module d'élasticité du matériau (N/mm²) |
| `b` | Profondeur de l'étagère (mm) |
| `h` | Épaisseur (mm) |

Modules indicatifs, à affiner avec des valeurs fournisseur :

| Matériau | `E` (N/mm²) |
|---|---|
| Mélaminé / aggloméré | ~2 500 |
| MDF | ~3 000 |
| Contreplaqué | ~8 000 |
| Bois massif | ~11 000 |

**Critère retenu : `δ > L / 300` déclenche un avertissement.**

Exemple, sur l'étagère de référence (§10) chargée de 20 kg :

```text
L = 873 mm, b = 382 mm, h = 18 mm, MDF (E = 3000)
I = 382 × 18³ / 12 = 185 652 mm⁴
w = 196 N / 873 mm = 0,2245 N/mm

δ ≈ 3,05 mm        L / 300 = 2,91 mm        -> avertissement
```

Message attendu :

> Cette étagère de 873 mm en MDF 18 mm fléchira d'environ 3 mm sous 20 kg.
> Suggestions : passer en 22 mm, ajouter un séparateur, ou réduire la portée.

### Autres contrôles prévus

- Caisson sans fond : rigidité latérale insuffisante s'il n'est pas fixé au mur.
- Tiroir dont la largeur dépasse la capacité des coulisses standard.
- Porte dont la hauteur impose un troisième gond.
- Épaisseur incompatible avec le type d'assemblage choisi.

---

## 10. Exemple de référence

Meuble TV — **1800 × 600 × 400 mm**, MDF 18 mm, fond 8 mm rainuré, un séparateur central,
une étagère par compartiment.

| ID | Pièce | Cotes (mm) | Ép. | Qté |
|---|---|---|---|---|
| P01 | Dessus | 1800 × 400 | 18 | 1 |
| P02 | Dessous | 1800 × 400 | 18 | 1 |
| P03 | Côté | 564 × 400 | 18 | 2 |
| P04 | Séparateur central | 564 × 382 | 18 | 1 |
| P05 | Étagère | 873 × 382 | 18 | 2 |
| P06 | Fond | 1772 × 572 | 8 | 1 |

Vérification des cotes — c'est ce contrôle qui doit exister en test automatisé :

```text
Largeur  : 18 + 873 + 18 + 873 + 18 = 1800  ✓
Hauteur  : 18 + 564 + 18             =  600  ✓
Fond     : (1800 − 36) + 2×4 = 1772         ✓
           (600 − 36)  + 2×4 =  572         ✓
Étagère  : 400 − 18 (retrait fond) =  382   ✓
```

> **Note.** Les cotes du brief d'origine (P02 = 582, P03 = 850 pour un meuble de 1800)
> n'étaient pas cohérentes entre elles : elles supposaient une seule épaisseur déduite en
> hauteur, et une largeur intérieure qui ne se recompose pas. Ce tableau les remplace.

---

## 11. Ce qui reste ouvert

Les sept points listés ici à la rédaction ont été tranchés le 31/07/2026 et sont désormais
intégrés au document (voir [DECISIONS.md](DECISIONS.md)) : tiroirs, portes, pieds,
perçages, formats de panneaux, tolérances, export machine.

**Perçages.** Le moteur produit les cotes de découpe, pas les positions de perçage.
Neftya reste en V1 un outil de préparation : l'artisan sait où percer. Les perçages
(tourillons, excentriques, crémaillères, coulisses) arrivent en V2 avec le catalogue de
quincaillerie dont ils dépendent.

### Points encore ouverts

1. **Longueurs de coulisses.** Le moteur donne la profondeur utile ; le choix de la
   coulisse et son perçage attendent le catalogue (V2). Conséquence directe du point
   précédent — voir la limite assumée du §5.1.
2. **Épaisseur des pièces de tiroir.** Les côtés d'un tiroir sont souvent plus fins
   (12 ou 15 mm) que la structure. Faut-il un `drawer_panel_thickness_mm` distinct ?
3. **Hauteur des tiroirs superposés.** Quand plusieurs tiroirs occupent un compartiment,
   se répartissent-ils la hauteur également, ou selon un ratio défini par le modèle ?
4. **Rainure du fond de tiroir.** Même convention que le caisson principal, ou paramètres
   propres ?
5. **Sens du fil sur les façades.** Sur un décor bois, les façades d'un même meuble
   doivent souvent être débitées dans la continuité. Hors périmètre V1 (§8), mais c'est le
   cas qui rendra la contrainte de fil nécessaire en V2.
