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

## 5. Points ouverts

- **Moteur 3D.** Non choisi. Le besoin est modeste (géométrie orthogonale, quelques dizaines
  de boîtes), ce qui ouvre la porte à une solution légère plutôt qu'à un moteur CAO complet.
- **Génération des plans 2D.** Projection depuis le modèle, ou rendu vectoriel dédié ?
- **Cotation automatique.** Placer les cotes sans chevauchement est un problème en soi ;
  souvent sous-estimé.
