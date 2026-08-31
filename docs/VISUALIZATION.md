# Visualisation et mode conception

Toutes les vues décrites ici sont **dérivées** du modèle paramétrique. Aucune n'est
modifiable directement : on modifie le modèle, les vues suivent. Voir §2 de
[NEFTYA_ENGINE.md](NEFTYA_ENGINE.md).

---

## 1. Visualisation 3D

La 3D n'est pas décorative. **Chaque objet visible correspond à une pièce réelle du
meuble**, portant le même identifiant que dans la liste de découpe.

L'utilisateur doit pouvoir :

- faire pivoter, zoomer, dézoomer ;
- observer toutes les faces ;
- masquer certaines pièces ;
- sélectionner une pièce et consulter ses dimensions ;
- changer les matériaux et les couleurs ;
- visualiser les assemblages.

Cette correspondance stricte entre objet 3D et pièce est ce qui permet de cliquer sur une
étagère dans la 3D et de la retrouver dans le plan de découpe.

---

## 2. Vue éclatée

Générée automatiquement à partir des positions des composants. Elle sépare visuellement les
pièces pour rendre la structure lisible et faciliter l'assemblage.

Chaque pièce sélectionnée expose : identifiant, nom, dimensions, matériau, épaisseur,
quantité.

```text
P03 — Étagère
873 × 382 × 18 mm — MDF
```

---

## 3. Visualisation 2D

Plans techniques générés automatiquement :

- vue de face, arrière, dessus, dessous, latérale ;
- vue éclatée ;
- plans de composants.

Les cotes sont visibles directement sur les plans.

Fonctions : zoom, impression, export PDF. L'export SVG est prévu ultérieurement.

---

## 4. Mode conception

Ce que l'utilisateur peut régler. Chaque modification déclenche la propagation décrite au
§7 de [NEFTYA_ENGINE.md](NEFTYA_ENGINE.md).

### Dimensions

Largeur, hauteur, profondeur (hors-tout, en millimètres).

### Structure

Nombre de compartiments, d'étagères, de tiroirs, de portes.

> Rappel : augmenter une dimension **étire** les éléments existants, elle n'en ajoute pas.
> Le nombre reste sous le contrôle de l'utilisateur.

### Matériaux

MDF, contreplaqué, mélaminé, bois massif. Le matériau détermine le module d'élasticité
utilisé par la validation technique.

### Paramètres techniques

Épaisseur, type d'assemblage, type de vis, charnières, rails de tiroirs.

### Style

Couleurs, finitions, poignées, pieds.

---

## 5. Choix techniques

### Moteur 3D

**Rendu WebGL dans le navigateur, via une bibliothèque généraliste légère** — Three.js est
la référence de fait, avec react-three-fiber si l'interface est en React.

Le besoin est modeste : géométrie orthogonale, quelques dizaines de boîtes, pas de
matériaux physiques ni d'éclairage complexe. Un moteur CAO complet serait
disproportionné, et un rendu serveur supprimerait l'interactivité qui fait tout l'intérêt
du §1 (rotation, sélection d'une pièce, masquage).

> **Réserve assumée.** Ce choix est fait avant toute mesure. Le critère à vérifier tôt est
> la fluidité sur un mobile d'entrée de gamme : la cible artisan consulte souvent sur
> téléphone, en atelier.

### Cotation automatique des plans 2D

**Cotation complète dès la V1** : chaînes de cotes sur chaque vue, cotes intermédiaires, et
placement automatique évitant les collisions.

C'est un vrai chantier — le placement de cotes sans chevauchement est un problème
d'optimisation à part entière — mais il est cohérent avec la cible primaire : un artisan
attend un plan coté, pas un tableau de dimensions.

> **Conséquence sur le planning.** C'est l'un des deux choix qui alourdissent le MVP (avec
> les tiroirs). À surveiller : si l'algorithme de cotation dérape, c'est lui qui repoussera
> le critère de sortie de la V1, pas le moteur.

### Génération des plans 2D

Projection orthogonale depuis le modèle paramétrique, rendue en vectoriel. Le modèle étant
composé de boîtes alignées sur les axes, la projection est directe et n'appelle pas de
bibliothèque de CAO.
