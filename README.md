# Neftya

Plateforme intelligente de conception et de fabrication de meubles.

Neftya transforme une inspiration — une image, une description, un modèle — en un projet
de meuble complet et réellement fabricable : visualisation 3D et 2D, liste de pièces, plan
de découpe, matériaux, instructions d'assemblage et estimation de coût.

> Une inspiration ne devrait pas rester une simple image.

## En un coup d'œil

| | |
|---|---|
| **Cible primaire (V1)** | Menuisiers et artisans |
| **Cœur technique** | Neftya Engine — moteur paramétrique |
| **Socle transverse** | SEKUU Core (auth, organisations, facturation, stockage, IA) |
| **État** | Spécification. Aucun code à ce jour. |

La valeur du produit ne repose ni sur l'IA ni sur la 3D, mais sur un moteur paramétrique
capable de représenter un meuble comme un ensemble de composants réels et d'en dériver
automatiquement toutes les informations de fabrication. L'IA est une couche d'assistance ;
la 3D est une vue dérivée.

## Documentation

| Document | Contenu |
|---|---|
| [BRIEF.md](docs/BRIEF.md) | Vision, proposition de valeur, positionnement, utilisateurs, modèle économique |
| [NEFTYA_ENGINE.md](docs/NEFTYA_ENGINE.md) | **Le moteur paramétrique** : modèle de données, règles de propagation, conventions d'assemblage, validation technique |
| [USER_JOURNEY.md](docs/USER_JOURNEY.md) | Points d'entrée, parcours principal, gestion des projets |
| [VISUALIZATION.md](docs/VISUALIZATION.md) | 3D, vue éclatée, plans 2D, mode conception |
| [MANUFACTURING.md](docs/MANUFACTURING.md) | Liste de pièces, plan de découpe, matériaux, assemblage, coûts |
| [AI.md](docs/AI.md) | Rôle et cas d'usage de l'intelligence artificielle |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Découpage en domaines |
| [SEKUU.md](docs/SEKUU.md) | Intégration avec SEKUU Core |
| [ROADMAP.md](docs/ROADMAP.md) | MVP, V2 à V4, vision long terme |
| [DECISIONS.md](docs/DECISIONS.md) | Journal des décisions structurantes, datées et motivées |

**Commencez par [NEFTYA_ENGINE.md](docs/NEFTYA_ENGINE.md)** si vous venez pour la technique :
c'est le document qui détermine toutes les cotes, et donc la crédibilité du produit auprès
d'un artisan.

## Conventions

Toutes les dimensions sont en **millimètres**, sauf mention contraire dans l'interface
utilisateur, où les centimètres peuvent être proposés pour les dimensions hors-tout.
Le système est métrique uniquement.

## Statut du projet

Ce dépôt ne contient que la spécification. Les documents décrivent une cible, pas un
existant. Rien n'y est implémenté.
