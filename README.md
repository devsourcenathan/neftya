# Neftya

Plateforme intelligente de conception et de fabrication de meubles.

Neftya transforme une inspiration — une image, une description, un modèle — en un projet
de meuble complet et réellement fabricable : visualisation 3D et 2D, liste de pièces, plan
de découpe, matériaux, instructions d'assemblage et estimation de coût.

> Une inspiration ne devrait pas rester une simple image.

## En un coup d'œil

|                         |                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------- |
| **Cible primaire (V1)** | Menuisiers et artisans                                                              |
| **Cœur technique**      | Neftya Engine — moteur paramétrique, en TypeScript, exécuté navigateur _et_ serveur |
| **Stack**               | TypeScript de bout en bout · React 19 · PostgreSQL · Three.js                       |
| **Socle transverse**    | Sekuu Platform (identité, organisations, facturation, stockage, IA, notifications)  |
| **Intégration**         | Produit à part entière, consommant les API de la plateforme — comme DealerOS        |
| **État**                | Spécification. Aucun code à ce jour.                                                |

La valeur du produit ne repose ni sur l'IA ni sur la 3D, mais sur un moteur paramétrique
capable de représenter un meuble comme un ensemble de composants réels et d'en dériver
automatiquement toutes les informations de fabrication. L'IA est une couche d'assistance ;
la 3D est une vue dérivée.

## Documentation

| Document                                    | Contenu                                                                                                               |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [BRIEF.md](docs/BRIEF.md)                   | Vision, proposition de valeur, positionnement, utilisateurs, modèle économique                                        |
| [NEFTYA_ENGINE.md](docs/NEFTYA_ENGINE.md)   | **Le moteur paramétrique** : modèle de données, règles de propagation, conventions d'assemblage, validation technique |
| [USER_JOURNEY.md](docs/USER_JOURNEY.md)     | Points d'entrée, parcours principal, gestion des projets                                                              |
| [VISUALIZATION.md](docs/VISUALIZATION.md)   | 3D, vue éclatée, plans 2D, mode conception                                                                            |
| [MANUFACTURING.md](docs/MANUFACTURING.md)   | Liste de pièces, plan de découpe, matériaux, assemblage, coûts                                                        |
| [AI.md](docs/AI.md)                         | Rôle et cas d'usage de l'intelligence artificielle                                                                    |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Découpage en domaines                                                                                                 |
| [SEKUU.md](docs/SEKUU.md)                   | Intégration avec Sekuu Platform                                                                                       |
| [ROADMAP.md](docs/ROADMAP.md)               | MVP, V2, V3, et pistes long terme                                                                                     |
| [IMPLEMENTATION.md](docs/IMPLEMENTATION.md) | **Comment construire la V1** : sept phases, chacune avec son critère de sortie                                        |
| [ENGINEERING.md](docs/ENGINEERING.md)       | Standards d'ingénierie — règles obligatoires, écrites à partir de ce qui a mal tourné sur DealerOS                    |
| [I18N.md](docs/I18N.md)                     | Langue, pays, devise, unités — l'interface **et** le domaine                                                          |
| [DECISIONS.md](docs/DECISIONS.md)           | Journal des décisions structurantes, datées et motivées                                                               |

**Commencez par [NEFTYA_ENGINE.md](docs/NEFTYA_ENGINE.md)** si vous venez pour la technique :
c'est le document qui détermine toutes les cotes, et donc la crédibilité du produit auprès
d'un artisan. Puis [ENGINEERING.md](docs/ENGINEERING.md) avant d'écrire une ligne, et
[IMPLEMENTATION.md](docs/IMPLEMENTATION.md) pour savoir par où commencer.

## Conventions

**Le moteur calcule en millimètres entiers, toujours.** Les unités sont exclusivement une
affaire d'affichage et de saisie : métrique et impérial sont proposés dès la V1, convertis
dans une couche dédiée qui n'écrit jamais dans le modèle.

Interface en **français et anglais**, à parité stricte, vérifiée en intégration continue.

Voir [I18N.md](docs/I18N.md).

## Démarrer

Neftya s'appuie sur **Sekuu Platform** pour l'identité. En local, un Identity de poche la
remplace : il fabrique une paire de clés, publie le JWKS et rend des jetons — les trois
choses dont l'API a besoin.

Trois terminaux :

```bash
docker compose up -d          # PostgreSQL sur le port 5442
npm install
npm run dev:identity          # Identity de démonstration, port 4000
```

```bash
cp .env.example .env          # une fois, puis pointer SEKUU_* sur localhost:4000
npm run dev:api               # API sur http://localhost:3000
```

`dev:api` construit puis lance : Node ne sait pas résoudre les imports `.js` d'un fichier
`.ts` en mode dépouillement de types. Après une modification du code de l'API, relancer la
commande.

```bash
npm run dev                   # interface sur http://localhost:5173
```

L'interface a besoin de `apps/web/.env.local` :

```
VITE_API_URL=http://localhost:3000
VITE_SEKUU_IDENTITY_URL=http://localhost:4000
VITE_SEKUU_PORTAL_URL=http://localhost:4000
```

Pour le développement local, `.env` doit pointer sur l'Identity de poche :

```
SEKUU_JWKS_URL=http://localhost:4000/.well-known/jwks.json
SEKUU_ISSUER=http://localhost:4000
NEFTYA_ALLOWED_ORIGINS=http://localhost:5173
```

> **Lancer l'Identity en premier, et ne plus y toucher.** Chaque démarrage fabrique une
> nouvelle paire de clés : les jetons déjà émis — celui que garde l'onglet ouvert, par
> exemple — restent signés par l'ancienne. Recharger la page suffit à en obtenir un neuf.

> **L'Identity de poche n'est pas une porte dérobée.** Aucun code de production ne le
> connaît : l'API lit trois variables d'environnement, et il suffit de les pointer ailleurs.
> Le jour où l'on branche la vraie plateforme, ce script ne sert plus.

Pour essayer les refus sans toucher au code :

```bash
curl -s "http://localhost:4000/token?roles=member"       # ne peut pas supprimer
curl -s "http://localhost:4000/token?products=autre"     # 403, pas abonné
curl -s "http://localhost:4000/token?projects_max=1"     # 409 au deuxième projet
```

### Exploiter

[OPERATIONS.md](docs/OPERATIONS.md) : configuration, sondes, journaux, sauvegarde,
migrations, et quoi regarder en premier quand quelque chose ne va pas.

```bash
DATABASE_URL=... npm run backup -- sauvegardes
```

Le va-et-vient complet — sauvegarder, **détruire le schéma**, restaurer, comparer — est
joué par la suite de tests à chaque exécution. Une sauvegarde qu'on n'a jamais restaurée
n'est pas une sauvegarde.

### Vérifier avant de pousser

```bash
npm run verify
```

Les tests d'API tournent contre un **PostgreSQL réel**, chacun dans son propre schéma, et
signent leurs propres jetons Sekuu : `docker compose up -d` suffit, aucun compte de
plateforme n'est requis.

Enchaîne format, lint, types, traductions, tests et build — exactement ce que la CI
exécute. Un `any`, une frontière franchie, un texte en dur ou une clé de traduction
manquante font échouer la commande.

| Commande             | Objet                                             |
| -------------------- | ------------------------------------------------- |
| `npm run test`       | Vitest sur tout le dépôt                          |
| `npm run typecheck`  | `tsc --build` sur les quatre paquets              |
| `npm run lint`       | ESLint, `no-explicit-any` en erreur               |
| `npm run check:i18n` | Parité des locales, clés inconnues, textes en dur |
| `npm run format`     | Prettier en écriture                              |

### Structure

```text
apps/
  web/          interface React
  api/          API Node
packages/
  engine/       Neftya Engine — pur, aucune dépendance framework
  contracts/    enveloppe d'API et types partagés, dérivés du moteur
```

Les dépendances ne vont que dans un sens, vers le moteur. Un test d'architecture le
vérifie : `tests/architecture.test.ts`.

## Statut du projet

**Phase 0 livrée** : le monorepo, l'outillage et les portes de qualité. Aucune
fonctionnalité métier — le moteur ne contient que les primitives dont l'invariant de
recomposition a besoin.

Le reste des documents décrit une cible, pas un existant. Voir
[IMPLEMENTATION.md](docs/IMPLEMENTATION.md) pour l'état d'avancement par phase.
