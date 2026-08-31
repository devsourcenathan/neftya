# Roadmap

## V1 — MVP

Le MVP est **volontairement limité**. Il ne comporte ni analyse d'image, ni assistant IA,
ni éditeur manuel. Son objectif unique est de prouver que le moteur produit des cotes
justes.

### Création

- Créer un projet
- Choisir un type de meuble
- Partir d'un modèle prédéfini (**seul point d'entrée**)
- Configurer les dimensions

### Neftya Engine

- Panneaux, étagères, compartiments simples
- Convention d'assemblage par défaut
- Propagation par étirement
- Validation de la flèche des étagères

### Visualisation

- 3D interactive
- Vue éclatée
- Plans 2D simples

### Fabrication

- Liste des pièces
- Liste des matériaux
- Plan de découpe avec trait de scie
- Instructions d'assemblage simples

### SEKUU

- Authentication, Users, Storage, Billing, AI Usage

### Critère de sortie

> Un menuisier prend le plan de découpe généré par Neftya, coupe ses panneaux, et le meuble
> se monte sans reprise.

Tant que ce critère n'est pas atteint sur plusieurs meubles réels, aucune fonctionnalité de
V2 ne doit être engagée. C'est la seule chose qui compte pour la cible primaire.

---

## V2 — Intelligence

- Image → analyse et structure
- Texte → configuration
- Assistant conversationnel
- Optimisation avancée des panneaux, avec contrainte de sens du fil
- Estimation automatique des coûts

---

## V3 — Conception avancée

- Éditeur manuel composant par composant
- Assemblages complexes
- Bibliothèque communautaire
- Marketplace de modèles
- Collaboration

---

## V4 — Écosystème

- Mise en relation avec des artisans
- Demande de devis
- Commande de fabrication
- Fournisseurs de matériaux, achat de panneaux
- Marketplace de meubles

> **Avertissement.** La V4 n'est pas une évolution du produit : c'est une **place de marché**,
> c'est-à-dire un autre métier, un autre modèle économique et un autre problème d'amorçage
> (l'offre et la demande simultanées). La lister ici comme une suite naturelle aplatit un
> risque qui ne l'est pas. Elle doit être réévaluée comme un projet distinct le moment venu.

---

## Vision long terme

```text
                    FURNITURE ECOSYSTEM
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
     DESIGN          BUILD            MARKETPLACE
        │                │                │
        ▼                ▼                ▼
       3D             CUT LIST         MODELS
       2D             MATERIALS        ARTISANS
       AI             ASSEMBLY         SUPPLIERS
                         │
                         ▼
                      ORDER
```

Le chemin du produit, du plus abstrait au plus concret :

```text
IMAGE / IDÉE → COMPRENDRE → CONFIGURER → CONCEVOIR → VISUALISER
             → CALCULER → COUPER → ASSEMBLER → CONSTRUIRE
```
