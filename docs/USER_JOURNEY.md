# Parcours utilisateur

## 1. Points d'entrée

Un projet peut démarrer de quatre façons. Elles convergent toutes vers le même modèle
paramétrique ([NEFTYA_ENGINE.md](NEFTYA_ENGINE.md)).

### A. Partir d'une image

L'utilisateur importe une photo, une capture, une image Pinterest ou une photo prise en
magasin. L'IA identifie le type de meuble, les composants visibles, la structure générale,
les compartiments, tiroirs, portes et étagères.

L'utilisateur **valide ensuite l'interprétation et complète les informations manquantes**.
C'est une étape obligatoire, pas une formalité : une image ne porte ni dimensions, ni
épaisseurs, ni assemblages. Voir [AI.md](AI.md).

> Prévu en **V2**. Le MVP ne comporte pas d'analyse d'image.

### B. Décrire un meuble

> Je veux un meuble TV moderne de 180 cm de largeur avec trois tiroirs, une niche centrale
> et deux compartiments latéraux.

L'IA transforme la description en configuration structurée, que l'utilisateur ajuste
ensuite (dimensions, composants, matériaux, style).

> Prévu en **V2**.

### C. Partir d'un modèle

La plateforme propose une bibliothèque : meubles TV, tables, bureaux, bibliothèques,
dressings, lits, étagères, meubles de cuisine et de salle de bain. L'utilisateur
sélectionne puis personnalise.

> **C'est le seul point d'entrée de la V1.**

### D. Créer manuellement

Pour les utilisateurs avancés : construire le meuble composant par composant — panneau,
étagère, tiroir, porte, pieds, séparations.

> Prévu en **V3**.

---

## 2. Parcours principal

```text
INSPIRATION
     │
     ▼
CHOISIR COMMENT COMMENCER
     │
     ├── Image            (V2)
     ├── Description      (V2)
     ├── Modèle           (V1)
     └── Création manuelle (V3)
     │
     ▼
INTERPRÉTATION
     │
     ▼
CONFIGURATION DU MEUBLE
     │
     ▼
VISUALISATION 3D / 2D
     │
     ▼
VALIDATION TECHNIQUE
     │
     ▼
PRÉPARATION À LA FABRICATION
     │
     ├── Liste des pièces
     ├── Plan de découpe
     ├── Matériaux
     └── Accessoires
     │
     ▼
GUIDE D'ASSEMBLAGE
     │
     ▼
EXPORT / FABRICATION
```

L'étape **Validation technique** n'est pas une étape de saisie : le moteur y signale les
configurations douteuses, et l'utilisateur décide. Voir §9 de
[NEFTYA_ENGINE.md](NEFTYA_ENGINE.md).

---

## 3. Gestion des projets

Chaque utilisateur dispose d'un espace personnel.

```text
MES PROJETS

Meuble TV Salon          Dernière modification : aujourd'hui
Bibliothèque Bureau      Dernière modification : 25 août
Lit Chambre              Dernière modification : 12 août
```

Un projet reste modifiable indéfiniment. L'utilisateur peut revenir sur les dimensions, les
matériaux, les composants ou le style : **toutes les données dérivées sont recalculées**,
puisqu'aucune vue n'est modifiable directement.

Les projets appartiennent à une organisation, et les droits d'accès sont ceux fournis par
[SEKUU Core](SEKUU.md). Un particulier travaille dans une organisation personnelle ; un
atelier partage la sienne entre plusieurs collaborateurs.

> **Point ouvert.** Faut-il versionner les projets ? Un artisan qui envoie un devis puis
> modifie le meuble a besoin de retrouver la version qu'il a envoyée. Non tranché.
