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

Tous sont modifiables par projet. Les défauts visent une scie à panneaux courante et du
mélaminé 18 mm.

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

Ces points ne sont **pas** tranchés et doivent l'être avant l'implémentation :

1. **Tiroirs.** Le jeu latéral dépend du modèle de coulisses (12,5 mm par côté pour des
   coulisses à billes standard, autre chose pour du sortie-totale). Faut-il un catalogue de
   coulisses, ou un paramètre `drawer_side_clearance_mm` ?
2. **Portes.** Recouvrement total, partiel ou encastré ? Jeu entre deux portes ?
3. **Pieds et socle.** La hauteur hors-tout inclut-elle les pieds ?
4. **Perçages.** Le moteur doit-il produire les positions de perçage (tourillons,
   excentriques, crémaillères) ou seulement les cotes de découpe ? C'est la différence entre
   un outil de préparation et un vrai fichier d'usinage.
5. **Formats de panneaux.** 2440 × 1220 par défaut ; faut-il un catalogue par région ?
6. **Tolérances.** Quelle marge admise entre la somme des pièces et la cote hors-tout ?
7. **Export machine.** Sortie CSV pour scie à panneaux, voire DXF, dès la V1 ou plus tard ?
