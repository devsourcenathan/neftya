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

> **Depuis le 2 septembre 2026**, le moteur choisit la coulisse : la plus longue du
> catalogue qui tienne dans la profondeur du caisson de tiroir, parmi 250, 300, 350, 400,
> 450 et 500. Aucune n'y tenant, il ne perce rien et le dit. Voir §12.

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

> **Depuis le 3 septembre 2026, une largeur peut être imposée.** `widthMm` sur un
> compartiment le fige ; les compartiments qui n'en portent pas se partagent également ce
> qui reste. Un socle de tiroirs de 400 mm sous une penderie qui prend le reste ne
> s'exprimait pas autrement — la division égale décidait à la place du menuisier.
>
> Deux cas se signalent plutôt que de se rattraper en silence. Des largeurs qui **dépassent
> la place** émettent `COMPARTMENT_WIDTH_MISMATCH`, et les compartiments souples reçoivent
> zéro — un compartiment trop étroit ne produit alors **aucune** étagère, plutôt qu'une
> pièce de cote négative. Quand **tous** les compartiments sont imposés et que leur somme
> ne tombe pas juste, le dernier absorbe l'écart : la largeur du meuble fait foi, c'est
> elle qu'on a mesurée contre un mur.
>
> Un modèle sans aucune largeur imposée se comporte exactement comme avant.

> **La même règle vaut pour les hauteurs d'étagère.** `shelfSpacesMm` impose la hauteur de
> chaque espace, du bas vers le haut : `n` étagères en découpent `n + 1`. Un espace de
> 400 mm en bas pour les cartons à archives, le reste réparti au-dessus, ne s'exprimait pas
> autrement.
>
> Le partage est **le même code** — `share.ts` — pour les largeurs et pour les hauteurs.
> Deux écritures de la même règle divergent le jour où l'une est corrigée.
>
> Un tableau plus long que le nombre d'espaces est toléré : retirer une étagère ne doit pas
> rendre le modèle invalide. Des hauteurs qui dépassent à elles seules la place font
> **revenir à la division égale** avec un avertissement `SHELF_SPACE_MISMATCH` — les
> honorer poserait une étagère hors du caisson, ce qui a été vérifié : 3 × 900 dans un
> meuble de 2000 plaçait la troisième à 2754 mm. Les réduire au prorata serait pire, chaque
> hauteur devenant un nombre que personne n'a saisi.


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

Chaque pièce porte un attribut `grain` (`length`, `width`, `none`).

**Le fil n'existe que sur ce qui se voit.** Dessus, dessous, côtés, séparateurs, étagères,
vantaux et façades de tiroir portent `length` ; le fond de caisson, le fond de tiroir et les
flancs d'un caisson de tiroir portent `none`. Ils sont cachés une fois le meuble monté :
leur imposer un sens ne changerait rien à l'oeil et coûterait de la chute à chaque panneau.

`length` est le bon sens pour toutes les pièces visibles parce que les cotes de découpe sont
normalisées, la plus grande dimension d'abord : sur un côté la longueur est la hauteur, sur
un dessus la largeur du meuble, sur un vantail la hauteur. Dans les trois cas, c'est le sens
où doit courir le fil.

### La contrainte est portée par le projet

`respectGrain` est **faux par défaut**. Le moteur ne peut pas savoir si le panneau est un
décor bois ou un mélaminé uni ; sur un uni, la contrainte ne coûterait que de la chute.

Quand elle est active, le placement ne pivote plus aucune pièce visible. Le tri préalable et
le placement jugent la rotation de la même façon : l'un déclarant plaçable ce que l'autre
refuse, la pièce disparaîtrait du plan sans un mot.

> **Ce qu'elle change, mesuré.** Sur un dressing de 1400 × 2000, le placement libre couche
> un vantail en travers du panneau. Le fil d'une porte de 2 m qui court à l'horizontale se
> voit à trois mètres et aucune finition ne le rattrape. La contrainte le redresse — sans un
> panneau de plus, sur ce meuble-là.

> **Ce qui reste ouvert.** Le fil **continu** entre façades voisines : sur un décor bois,
> les façades d'un même meuble se débitent souvent dans la continuité d'un même panneau.
> C'est une contrainte de séquence, pas d'orientation, et elle n'est pas traitée.

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

**Perçages.** Livrés le 2 septembre 2026, avec le catalogue de quincaillerie dont ils
dépendaient. Voir §12.

### Points encore ouverts

1. **Épaisseur des pièces de tiroir.** Les côtés d'un tiroir sont souvent plus fins
   (12 ou 15 mm) que la structure. Faut-il un `drawer_panel_thickness_mm` distinct ?
2. **Hauteur des tiroirs superposés.** Quand plusieurs tiroirs occupent un compartiment,
   se répartissent-ils la hauteur également, ou selon un ratio défini par le modèle ?
3. **Rainure du fond de tiroir.** Même convention que le caisson principal, ou paramètres
   propres ?
4. **Fil continu entre façades.** Sur un décor bois, les façades d'un même meuble doivent
   souvent être débitées dans la continuité d'un même panneau. La contrainte d'orientation
   du §8 ne la couvre pas : c'est une contrainte de **séquence**, et elle demanderait au
   placement de raisonner sur des groupes de pièces plutôt que sur des pièces.
5. **Excentriques et crémaillères.** Le catalogue du §12 porte les charnières, les
   coulisses, les tourillons et les taquets. Les excentriques et les crémaillères viendront
   avec un besoin qui les demande.

---

## 12. Perçages et quincaillerie

Un perçage n'existe pas dans l'absolu : il existe **pour une charnière donnée, une coulisse
donnée, un tourillon donné**. Tant que la quincaillerie n'était pas nommée, la V1 avait
raison de ne rien percer. Le catalogue vient donc d'abord.

### Le catalogue

| Clé | Article | Ce qui décide d'un perçage |
|---|---|---|
| `hinge_35_110` | Charnière à boîtier 35, 110° | Boîtier Ø 35 × 13, à 22 mm du chant ; embase Ø 5 × 11 à 37 puis 69 mm du chant avant |
| `slide_ball_250` … `_500` | Coulisse à billes | Trous Ø 5 × 11 ; caisson à 37 mm puis tous les 96 ; tiroir à 32 mm de chaque bout |
| `dowel_8x30` | Tourillon 8 × 30 | Deux fois 16 mm de profondeur, quatre par about |
| `shelf_support_5` | Taquet d'étagère Ø 5 | Ø 5 × 10, ligne système 32 à 37 mm des deux chants |

Les longueurs de coulisses sont des longueurs **achetées**, pas calculées : on ne commande
pas une coulisse de 372 mm. Le moteur retient la plus longue qui tienne dans la profondeur
utile ; aucune n'y tenant, il ne perce rien et signale `NO_SLIDE_FITS`.

Le nombre de charnières dépend de la hauteur du vantail (§7.2 bis). Elles se répartissent
entre deux charnières d'extrémité posées à 100 mm de chaque bout, et chaque position est
calculée depuis ces bornes : un pas arrondi puis accumulé décalerait la dernière de
plusieurs millimètres, et c'est celle qui ne tomberait plus en face de son embase.

### 12.1 Le repère d'une pièce

Une `Part` porte des cotes normalisées, ses instances portent des positions dans le meuble,
et **les deux ne se déduisent pas l'une de l'autre sans regarder**. Un côté de 1764 × 400 a
sa longueur dans la hauteur du meuble ; un côté de caisson bas et profond, 400 × 600, l'a
dans la profondeur. Supposer l'un ou l'autre suffit à percer une porte de dressing à
l'horizontale.

La correspondance se fait donc **par la géométrie de l'instance** : l'axe traversant est
celui dont l'encombrement vaut l'épaisseur et dont les deux autres redonnent la longueur et
la largeur.

Pour la même raison, le module de perçage ne relit aucune variable interne de la
construction : il retrouve les voisins d'une pièce par la géométrie. Un perçage calculé
depuis les mêmes intermédiaires que la construction ne dirait que ce que la construction
croit déjà.

### 12.2 Deux règles qui portent tout le reste

**Un jeu de trous par instance, jamais par pièce.** Les deux vantaux d'une paire sont la
même `Part` en quantité 2 et ne se percent pas pareil : l'un charnière à gauche, l'autre à
droite. Les grouper les percerait tous les deux du même côté.

**Les coordonnées sont dans le repère de la face qu'on perce.** Un trou à 50 mm du bord vu
de face est à 50 mm de l'autre bord vu de dos. Donner une seule coordonnée pour les deux
faces obligerait l'atelier à faire ce miroir de tête, et c'est l'erreur qu'on fait une fois
sur deux. `front` est la face qui regarde le **minimum** de l'axe traversant — une
définition géométrique, qui vaut instance par instance.

### 12.3 Le côté charnière

Le vantail droit d'une paire est le seul qui n'a **rien** à sa gauche : le jeu central. Un
vantail unique a un montant des deux côtés, et la convention est alors la gauche.

Départager les deux chants par la distance ne mesurerait rien : la façade recouvre la moitié
de son séparateur, et le millimètre d'écart qui en résulte charnièrerait les deux vantaux
d'un buffet sur son séparateur central, ouvrant chaque porte vers le mur.

### 12.4 La quincaillerie se déduit des trous

La nomenclature ne compte plus la quincaillerie de son côté : elle lit celle du perçage. Un
ratio tenu à part de la géométrie finit par diverger d'elle — on ajoute une charnière au
calcul sans la percer, ou l'inverse — et c'est l'atelier qui découvre qu'il en manque une.

Un tourillon fait **deux** trous, une paire de coulisses en fait **quatre** sur les profils
de tiroir : le décompte divise en conséquence.

### 12.5 Ce qui n'est pas percé

Les vis de caisson et la colle. Une vis se place à vue, et lui donner une position la
figerait sans rien apporter. Elles restent comptées par ratio dans la nomenclature.

---

## 13. Poignées de meuble

**La première donnée du modèle qui ne se déduise de rien.** Une étagère existe parce qu'on
a demandé trois étagères ; une poignée existe parce que quelqu'un l'a posée là. Deux
meubles identiques peuvent en porter de différentes, au même endroit ou non, et aucune
règle ne permet de deviner laquelle.

Elle vit **dans son compartiment** plutôt que dans une liste globale : le dupliquer emporte
ses poignées, le supprimer les emporte aussi. Une liste séparée aurait demandé de
renuméroter des références à chaque fois, et une référence oubliée est une poignée sur une
façade qui n'existe plus.

### Le catalogue

| Clé | Article | Fixation |
|---|---|---|
| `pull_bar_96` … `_192` | Barre, quatre entraxes du commerce | Deux vis Ø 4, **traversantes** |
| `pull_knob` | Bouton | Une vis Ø 4, traversante |
| `pull_shell` | Coquille encastrée | Empreinte fraisée 100 × 30 × 12, **aucune vis** |

L'**entraxe** est la distance entre les centres des deux vis. C'est la seule cote qui doive
tomber juste : une barre dont l'entraxe est faux ne se visse pas, quelle que soit sa
longueur.

### 13.1 Les vis traversent

C'est la **seule exception** du moteur. Partout ailleurs le perçage est borgne — un foret
qui débouche abîme une face qu'on regarde. Une vis de poignée, elle, doit sortir : on visse
depuis l'intérieur de la façade, et sinon la poignée ne tient sur rien.

Porté par le drapeau `Hole.through` plutôt que déduit d'une profondeur égale à l'épaisseur :
une égalité est un accident, un drapeau est une décision, et l'atelier ne monte pas la même
mèche dans les deux cas. Le DXF leur donne d'ailleurs leur propre calque.

### 13.2 La coquille n'a aucun trou

C'est une empreinte fraisée, représentée par un rectangle et non par un cercle : un perçage
ferait fraiser un rond là où il faut un rectangle.

Conséquence : **le décompte des poignées part du modèle, et non des perçages** — la seule
quincaillerie dans ce cas. Les compter par leurs trous en aurait oublié une sur trois
formes, et l'atelier l'aurait découvert en montant le meuble.

### 13.3 La position

En millimètres depuis le coin **inférieur gauche de la façade**, au centre de la poignée.
Absente, elle est calculée : centrée sur un tiroir, et sur un vantail à quarante-cinq
millimètres du chant **qui s'ouvre** — jamais de celui des charnières, où la main serait du
mauvais côté du pivot.

La règle du côté charnière vit dans `facades.ts`, où les charnières et les poignées la
lisent toutes deux : deux écritures de la même règle divergent le jour où l'une est
corrigée.

### 13.4 Ce qui est refusé plutôt que rattrapé

- une poignée dont la **référence a disparu du catalogue** est signalée, et le meuble
  s'ouvre quand même : refuser le projet entier rendrait illisible un fichier enregistré ;
- une poignée dont la **façade a été retirée** est signalée, jamais reportée sur la voisine ;
- une poignée qui **dépasse de sa façade** est signalée. La contenance ne suffit pas : une
  vis à trois millimètres du bord « tient » et fend le panneau. Douze millimètres de marge
  sont exigés.
