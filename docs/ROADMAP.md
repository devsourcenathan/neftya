# Roadmap

## V1 — MVP

Le MVP reste volontairement limité : ni analyse d'image, ni assistant IA, ni éditeur
manuel. Son objectif unique est de prouver que le moteur produit des cotes justes.

### Création

- Créer un projet
- Choisir un type de meuble
- Partir d'un modèle prédéfini (**seul point d'entrée**)
- Configurer les dimensions

### Neftya Engine

- Panneaux, étagères, compartiments
- **Tiroirs** — caisson simple et façade rapportée
- Convention d'assemblage par défaut (côtés entre dessus et dessous)
- Propagation par étirement
- Validation de la flèche des étagères
- Invariant de recomposition exacte, vérifié par test

### Visualisation

- 3D interactive (WebGL)
- Vue éclatée
- **Plans 2D entièrement cotés**, chaînes de cotes et placement automatique

### Fabrication

- Liste des pièces
- Liste des matériaux, chants compris
- Plan de découpe avec trait de scie, formats de panneaux configurables
- Instructions d'assemblage portées par le modèle
- Export PDF et CSV

### Projets

- Instantané figé à chaque export

### SEKUU

- Authentication, Users, Storage, Billing

### Critère de sortie

> Un menuisier prend le plan de découpe généré par Neftya, coupe ses panneaux, et le meuble
> se monte sans reprise.

Tant que ce critère n'est pas atteint sur plusieurs meubles réels, aucune fonctionnalité de
V2 ne doit être engagée.

> **Attention au périmètre.** Deux décisions du 31/07/2026 ont élargi ce MVP : les tiroirs
> et la cotation complète des plans 2D. Ce sont les deux postes les plus susceptibles de
> repousser le critère de sortie — le second plus que le premier, le placement automatique
> de cotes étant un problème d'optimisation à part entière. Si le planning dérape, ce sont
> les premiers candidats au report, pas le moteur.

---

## V2 — Intelligence et usinage

- Image → analyse et structure
- Texte → configuration
- Assistant conversationnel
- Quotas IA par palier
- **Positions de perçage** et catalogue de quincaillerie (coulisses, charnières, tourillons)
- **Portes**, recouvrement total
- Optimisation avancée des panneaux, avec contrainte de sens du fil
- Export DXF
- Estimation automatique des coûts

Perçages et catalogue vont ensemble : les positions dépendent de la quincaillerie choisie.
C'est ce qui fait passer Neftya d'un outil de préparation à une vraie sortie d'usinage.

---

## V3 — Conception avancée

- Éditeur manuel composant par composant
- Déduction automatique de la séquence d'assemblage — nécessaire dès que les meubles ne
  viennent plus de modèles
- Assemblages complexes
- Bibliothèque communautaire
- Collaboration

---

## Pistes long terme

Ce qui suit n'est **pas** une suite de la roadmap. Ce sont des directions à réévaluer
séparément, le moment venu.

### Marketplace

Mise en relation avec des artisans, demande de devis, commande de fabrication, fournisseurs
de matériaux, achat de panneaux, vente de modèles.

> **Pourquoi c'est à part.** Une marketplace n'est pas une évolution du produit : c'est un
> autre métier, avec un autre modèle économique et un problème d'amorçage différent — il
> faut l'offre et la demande simultanément. La traiter comme un « V4 » aplatirait un risque
> qui n'a rien de commun avec celui d'ajouter une fonctionnalité. À évaluer comme un projet
> distinct, avec sa propre étude.

### Écosystème

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
