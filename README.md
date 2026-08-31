# BRIEF PRODUIT — Plateforme intelligente de conception et fabrication de meubles

## 1. Vision du projet

Créer une plateforme intelligente permettant de transformer une idée, une image ou une description en un projet de meuble complet, techniquement exploitable et prêt à être fabriqué.

L'utilisateur doit pouvoir partir d'une simple inspiration et obtenir progressivement :

* Une conception structurée du meuble
* Une visualisation interactive 2D et 3D
* Des dimensions précises
* Une liste complète des pièces à découper
* Un plan d'optimisation des panneaux
* La liste des matériaux et accessoires nécessaires
* Des instructions d'assemblage étape par étape
* Une estimation des coûts
* Des documents techniques exportables

La plateforme doit rendre la conception et la fabrication de meubles accessibles aux particuliers, artisans, menuisiers et ateliers, sans nécessiter la maîtrise de logiciels complexes comme AutoCAD, SketchUp ou Fusion 360.

---

# 2. Proposition de valeur

> Transformer une inspiration en meuble réellement fabricable.

Aujourd'hui, de nombreuses personnes trouvent des meubles intéressants sur Pinterest, Instagram, TikTok ou dans des magasins, mais ne disposent pas des informations nécessaires pour les reproduire.

Une simple image ne fournit généralement pas :

* Les dimensions
* Les matériaux utilisés
* Les dimensions de chaque pièce
* Les techniques d'assemblage
* La quantité de matériaux
* Le plan de découpe
* Les étapes de fabrication

La plateforme vient combler cet écart entre :

**L'inspiration → La conception → La fabrication.**

---

# 3. Positionnement

La plateforme ne doit pas être positionnée uniquement comme :

> Un générateur de plans à partir d'une image.

Elle doit être pensée comme :

> Une plateforme intelligente de conception, visualisation et préparation à la fabrication de meubles.

L'image n'est qu'un des points d'entrée.

L'utilisateur peut commencer son projet à partir de :

* Une image
* Une photographie
* Une description textuelle
* Un modèle existant
* Une conception manuelle

Et terminer avec un projet complet prêt à être fabriqué.

---

# 4. Utilisateurs cibles

## 4.1 Particuliers / DIY

Personnes souhaitant fabriquer elles-mêmes certains meubles.

Exemples :

* Meuble TV
* Bibliothèque
* Bureau
* Lit
* Dressing
* Étagères
* Table
* Meuble de rangement

Leur objectif principal est de disposer d'un guide suffisamment simple pour transformer une idée en projet réalisable.

### Besoins

* Comprendre comment fabriquer le meuble
* Obtenir les dimensions
* Acheter les bonnes quantités de matériaux
* Réduire les erreurs
* Visualiser le résultat avant fabrication

---

## 4.2 Menuisiers et artisans

Professionnels recevant régulièrement des images ou références envoyées par leurs clients.

Exemple :

> "Je veux exactement ce meuble."

La plateforme leur permet de transformer rapidement une référence en projet structuré.

### Besoins

* Concevoir rapidement
* Adapter les dimensions
* Générer des listes de découpe
* Préparer les matériaux
* Générer des devis
* Présenter une visualisation au client

---

## 4.3 Ateliers de fabrication

Petites et moyennes entreprises spécialisées dans la fabrication de meubles.

### Besoins

* Centraliser les projets
* Gérer plusieurs collaborateurs
* Standardiser les plans
* Préparer les découpes
* Suivre la fabrication
* Partager les documents techniques

---

# 5. Les différents points d'entrée

L'utilisateur peut commencer un projet de plusieurs façons.

## A. Partir d'une image

L'utilisateur importe :

* Une photo
* Un screenshot
* Une image Pinterest
* Une image trouvée sur internet
* Une photo prise dans un magasin

L'intelligence artificielle analyse l'image afin d'identifier :

* Le type de meuble
* Les composants visibles
* La structure générale
* Les compartiments
* Les tiroirs
* Les portes
* Les étagères

L'utilisateur valide ensuite l'interprétation et complète les informations manquantes.

---

## B. Décrire un meuble

L'utilisateur décrit ce qu'il souhaite.

Exemple :

> Je veux un meuble TV moderne de 180 cm de largeur avec trois tiroirs, une niche centrale et deux compartiments latéraux.

L'intelligence artificielle transforme cette description en une proposition structurée.

L'utilisateur peut ensuite modifier :

* Les dimensions
* Les composants
* Les matériaux
* Le style

---

## C. Partir d'un modèle

La plateforme propose une bibliothèque de modèles.

Exemples :

* Meubles TV
* Tables
* Bureaux
* Bibliothèques
* Dressings
* Lits
* Étagères
* Meubles de cuisine
* Meubles de salle de bain

L'utilisateur sélectionne un modèle puis le personnalise.

---

## D. Créer manuellement

Destiné aux utilisateurs avancés.

L'utilisateur construit son meuble à partir de composants.

Exemples :

* Ajouter un panneau
* Ajouter une étagère
* Ajouter un tiroir
* Ajouter une porte
* Ajouter des pieds
* Ajouter des séparations

Cette fonctionnalité peut être introduite progressivement.

---

# 6. Parcours utilisateur principal

```text
INSPIRATION
     │
     ▼
CHOISIR COMMENT COMMENCER
     │
     ├── Image
     ├── Description
     ├── Modèle
     └── Création manuelle
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

---

# 7. Le cœur du produit : Furniture Engine

Le cœur technique de la plateforme doit être un moteur paramétrique indépendant appelé provisoirement :

> Furniture Engine

Ce moteur est responsable de la représentation logique et technique d'un meuble.

Un meuble ne doit pas être considéré comme une simple image 3D.

Il doit être composé de véritables composants.

```text
FURNITURE
│
├── Dimensions
│
├── Components
│   ├── Panels
│   ├── Shelves
│   ├── Drawers
│   ├── Doors
│   └── Legs
│
├── Materials
│
├── Connections
│   ├── Screws
│   ├── Dowels
│   ├── Glue
│   └── Brackets
│
└── Assembly
```

Chaque composant doit disposer de propriétés précises :

* Identifiant
* Type
* Dimensions
* Position
* Rotation
* Matériau
* Épaisseur
* Quantité
* Relations avec les autres composants

---

# 8. Single Source of Truth

Le modèle paramétrique doit être la source centrale de toutes les représentations.

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

Toute modification doit automatiquement mettre à jour l'ensemble du projet.

Exemple :

```text
Largeur : 180 cm
        ↓
Largeur : 220 cm
```

Le système recalcule automatiquement :

* Les dimensions des pièces
* Le modèle 3D
* Les plans 2D
* La liste de découpe
* La quantité de matériaux
* Le coût estimatif
* L'optimisation des panneaux

---

# 9. Visualisation 3D

La visualisation 3D est une fonctionnalité centrale.

Elle ne doit pas uniquement être esthétique.

Chaque objet visible en 3D doit correspondre à une pièce réelle du meuble.

L'utilisateur doit pouvoir :

* Faire pivoter le meuble
* Zoomer
* Dézoomer
* Observer toutes les faces
* Masquer certaines pièces
* Sélectionner une pièce
* Consulter ses dimensions
* Changer les matériaux
* Changer les couleurs
* Visualiser les assemblages

---

# 10. Vue éclatée

La plateforme doit permettre de générer automatiquement une vue éclatée.

Cette vue permet de visualiser séparément les composants du meuble.

Chaque pièce peut être sélectionnée.

Informations disponibles :

* Identifiant
* Nom
* Dimensions
* Matériau
* Épaisseur
* Quantité

Exemple :

> P03 — Étagère supérieure

Dimensions :

> 850 × 380 × 18 mm

Cette vue est particulièrement importante pour comprendre la structure et faciliter l'assemblage.

---

# 11. Visualisation 2D

La plateforme doit générer automatiquement des plans techniques en 2D.

Vues principales :

* Vue de face
* Vue arrière
* Vue de dessus
* Vue de dessous
* Vue latérale
* Vue éclatée
* Plans de composants

Les dimensions doivent être visibles directement sur les plans.

Le système doit permettre :

* Zoom
* Impression
* Export PDF
* Export SVG à terme

---

# 12. Mode conception

Le mode conception permet à l'utilisateur de personnaliser son meuble.

## Dimensions

* Largeur
* Hauteur
* Profondeur

## Structure

* Nombre de compartiments
* Nombre d'étagères
* Nombre de tiroirs
* Nombre de portes

## Matériaux

* MDF
* Contreplaqué
* Mélaminé
* Bois massif

## Paramètres techniques

* Épaisseur
* Type d'assemblage
* Type de vis
* Charnières
* Rails de tiroirs

## Style

* Couleurs
* Finitions
* Poignées
* Pieds

---

# 13. Validation technique

Le système doit progressivement devenir capable d'identifier certaines incohérences.

Exemple :

> Une étagère de 2 mètres avec du MDF de 12 mm.

Le système peut afficher :

> Attention : cette configuration pourrait entraîner une flexion du panneau.

Suggestions :

* Augmenter l'épaisseur
* Ajouter un support central
* Réduire la longueur

L'objectif n'est pas de remplacer un ingénieur ou un menuisier expérimenté, mais d'éviter les erreurs les plus courantes.

---

# 14. Build Mode

Une fois la conception terminée, l'utilisateur passe en mode fabrication.

Ce mode transforme le projet en instructions concrètes.

---

## A. Liste des matériaux

Le système génère automatiquement :

### Panneaux

* Type
* Épaisseur
* Dimensions standard
* Nombre nécessaire

### Accessoires

* Vis
* Charnières
* Rails
* Équerres
* Colle
* Chants

---

## B. Liste des pièces

Chaque pièce reçoit un identifiant unique.

Exemple :

| ID  | Pièce             | Dimensions      | Quantité |
| --- | ----------------- | --------------- | -------- |
| P01 | Plateau supérieur | 1800 × 400 × 18 | 1        |
| P02 | Panneau latéral   | 582 × 400 × 18  | 2        |
| P03 | Étagère           | 850 × 382 × 18  | 2        |

Ces identifiants sont utilisés dans toutes les étapes suivantes.

---

## C. Plan de découpe

Le système optimise l'utilisation des panneaux.

Exemple :

```text
PANNEAU MDF 2440 × 1220 mm

┌────────────────────────────┐
│                            │
│       P01                  │
│                            │
├──────────────┬─────────────┤
│ P02          │ P02         │
├──────────────┼─────────────┤
│ P03          │ P03         │
└──────────────┴─────────────┘
```

Le système calcule :

* Nombre de panneaux nécessaires
* Surface utilisée
* Surface perdue
* Optimisation de la découpe

---

# 15. Guide d'assemblage

La plateforme doit proposer un mode de fabrication étape par étape.

Exemple :

### Étape 1 / 8

> Assemblez P02 et P03.

L'utilisateur voit :

* Les pièces nécessaires
* Leur position
* Le type de fixation
* La quantité de vis

Fonctionnalités possibles :

* Étape précédente
* Étape suivante
* Animation
* Vue éclatée
* Zoom
* Rotation

À terme, les étapes peuvent être animées directement dans le moteur 3D.

---

# 16. Estimation des coûts

Le système peut permettre à l'utilisateur d'estimer le coût total du projet.

Exemple :

### Matériaux

| Élément    |   Quantité | Prix |
| ---------- | ---------: | ---: |
| MDF 18 mm  | 3 panneaux |      |
| Vis        |  50 unités |      |
| Chants PVC |  10 mètres |      |
| Charnières |   4 unités |      |

Le prix peut être :

* Saisi manuellement
* Configuré selon une région
* Connecté à des fournisseurs à terme

Le système affiche :

> Coût estimatif de fabrication.

---

# 17. Gestion des projets

Chaque utilisateur dispose d'un espace personnel.

```text
MES PROJETS

🪑 Meuble TV Salon
Dernière modification : Aujourd'hui

📚 Bibliothèque Bureau
Dernière modification : 25 Août

🛏️ Lit Chambre
Dernière modification : 12 Août
```

Un projet reste modifiable.

L'utilisateur peut revenir et modifier :

* Dimensions
* Matériaux
* Composants
* Style

Toutes les données dérivées sont automatiquement recalculées.

---

# 18. Intelligence artificielle

L'IA doit être considérée comme une couche d'assistance et non comme le moteur principal.

## Cas d'utilisation

### Image → Structure

Analyser une image afin d'identifier :

* Type de meuble
* Éléments visibles
* Structure générale

L'utilisateur confirme ensuite l'interprétation.

---

### Texte → Configuration

Transformer une description en configuration structurée.

Exemple :

> Je veux une bibliothèque de 2 mètres avec 6 étagères et un compartiment fermé.

↓

```text
Type : Bibliothèque
Hauteur : 200 cm
Étagères : 6
Compartiment fermé : Oui
```

---

### Assistant de conception

L'utilisateur peut interagir avec son projet.

Exemple :

> Ajoute deux tiroirs dans la partie inférieure.

> Augmente la largeur à 2 mètres.

> Remplace les portes par des tiroirs.

L'IA traduit ces instructions en modifications du modèle paramétrique.

---

# 19. Architecture produit

La plateforme doit être séparée en plusieurs domaines.

```text
FURNITURE PLATFORM
│
├── Project Management
│
├── Furniture Engine
│
├── AI Assistant
│
├── Visualization Engine
│   ├── 3D
│   ├── 2D
│   └── Exploded View
│
├── Manufacturing Engine
│   ├── Cut List
│   ├── Panel Optimization
│   ├── Materials
│   └── Assembly
│
└── Export Engine
    ├── PDF
    ├── Technical Plans
    └── Reports
```

---

# 20. Intégration avec SEKUU Core

La plateforme métier ne doit pas reconstruire les services génériques.

Elle s'appuie sur SEKUU Core comme fondation.

```text
                    SEKUU CORE
┌───────────────────────────────────────────┐
│                                           │
│ Authentication                            │
│ Users                                     │
│ Organizations                             │
│ Roles & Permissions                       │
│ Billing & Subscriptions                   │
│ Payments                                  │
│ Storage                                   │
│ AI Services                               │
│ AI Credits & Usage                        │
│ Notifications                             │
│ Audit Logs                                │
│ API Keys                                  │
│ Settings                                  │
│ Usage & Analytics                         │
│                                           │
└─────────────────────┬─────────────────────┘
                      │
                      │
                      ▼
            FURNITURE PLATFORM
┌───────────────────────────────────────────┐
│                                           │
│ Furniture Projects                        │
│ Furniture Engine                          │
│ Components                                │
│ Materials                                 │
│ 3D Visualization                          │
│ 2D Technical Plans                        │
│ Cut List                                  │
│ Panel Optimization                        │
│ Assembly Instructions                     │
│ Manufacturing Calculations                │
│                                           │
└───────────────────────────────────────────┘
```

---

# 21. Rôle de SEKUU Core

SEKUU Core fournit les capacités transversales.

## Authentication

* Inscription
* Connexion
* Social login
* Gestion des sessions

## Users

* Profils
* Préférences
* Gestion des comptes

## Organizations

Permettre à terme :

* Particuliers
* Ateliers
* Entreprises

d'utiliser des espaces distincts.

---

## Roles & Permissions

Exemple pour un atelier :

* Owner
* Admin
* Designer
* Carpenter
* Viewer

---

## Billing

Gestion :

* Plans
* Abonnements
* Factures
* Paiements
* Consommation

---

## Storage

Centralisation :

* Images d'inspiration
* Modèles 3D
* Exports
* PDF
* Documents

---

## AI Services

SEKUU gère l'accès aux modèles IA.

La Furniture Platform consomme simplement le service.

Exemples :

```text
Furniture Platform
        │
        │ AI Request
        ▼
     SEKUU AI
        │
        ├── Vision Model
        ├── LLM
        └── Image Generation
```

---

## AI Usage & Credits

Chaque action IA peut consommer des crédits.

Exemples :

* Analyse d'image
* Génération de concept
* Assistant conversationnel
* Génération de variantes

SEKUU Core centralise :

* Consommation
* Limites
* Crédits
* Facturation

---

# 22. Modèle économique potentiel

## Freemium

### Free

* Nombre limité de projets
* Modèles basiques
* Visualisation limitée
* Exports limités

### Pro

* Projets illimités
* Visualisation 3D complète
* Exports techniques
* Optimisation de découpe
* Assistant IA
* Historique

### Professional

Destiné aux artisans et ateliers.

* Multi-utilisateurs
* Organisations
* Gestion d'équipe
* Gestion des clients
* Devis
* Branding personnalisé
* API

---

# 23. MVP recommandé

Le MVP doit volontairement être limité.

## V1

### Création

* Créer un projet
* Choisir un type de meuble
* Utiliser des modèles prédéfinis
* Configurer les dimensions

### Furniture Engine

* Panneaux
* Étagères
* Compartiments simples

### Visualisation

* 3D interactive
* Vue éclatée
* Plans 2D simples

### Fabrication

* Liste des pièces
* Dimensions
* Liste des matériaux
* Plan de découpe basique
* Instructions simples

### SEKUU

* Authentication
* Users
* Storage
* Billing
* AI Usage

---

# 24. Évolutions futures

## V2

* Image → Analyse
* Texte → Meuble
* Assistant conversationnel
* Optimisation avancée des panneaux
* Estimation automatique des coûts

---

## V3

* Éditeur manuel avancé
* Assemblages complexes
* Bibliothèque communautaire
* Marketplace de modèles
* Collaboration

---

## V4

* Mise en relation avec des artisans
* Demande de devis
* Commande de fabrication
* Fournisseurs de matériaux
* Achat de panneaux
* Marketplace de meubles

---

# 25. Vision long terme

À long terme, la plateforme pourrait devenir un véritable écosystème autour de la conception et fabrication de meubles.

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

---

# Conclusion

Le produit repose sur une idée centrale :

> Une inspiration ne devrait pas rester une simple image.

La plateforme permet de transformer progressivement une idée en un objet réel.

```text
IMAGE / IDEA
     ↓
UNDERSTAND
     ↓
CONFIGURE
     ↓
DESIGN
     ↓
VISUALIZE
     ↓
CALCULATE
     ↓
CUT
     ↓
ASSEMBLE
     ↓
BUILD
```

La véritable valeur technologique du produit ne repose pas uniquement sur l'intelligence artificielle ou la visualisation 3D.

Elle repose sur un moteur paramétrique capable de représenter un meuble comme un ensemble de composants réels et de générer automatiquement toutes les informations nécessaires à sa fabrication.

SEKUU Core fournit quant à lui toute l'infrastructure transverse nécessaire à la plateforme : utilisateurs, organisations, stockage, IA, crédits, facturation et services partagés.

Cette approche permet de construire la Furniture Platform comme un produit métier indépendant, tout en bénéficiant d'un socle technologique commun réutilisable pour d'autres produits de l'écosystème SEKUU.
