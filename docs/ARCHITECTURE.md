# Architecture produit

Neftya est découpé en domaines indépendants. Le moteur est au centre ; tout le reste le
consomme.

```text
NEFTYA
│
├── Project Management
│
├── Neftya Engine                 ← le cœur, ne dépend de rien
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

## Sens des dépendances

```text
   Project Management     AI Assistant     Visualization     Export
            │                   │                │              │
            └───────────────────┴────────┬───────┴──────────────┘
                                         ▼
                                  NEFTYA ENGINE
                                         │
                                         ▼
                              (aucune dépendance)
```

Règles :

1. **Le moteur ne dépend d'aucun autre domaine.** Ni framework web, ni moteur 3D, ni SDK
   d'IA. C'est ce qui le rend testable en isolation, et c'est la condition pour que les
   cotes soient vérifiables automatiquement.
2. **Manufacturing consomme le moteur**, il ne le contourne pas. La liste de découpe est
   dérivée du modèle, jamais saisie.
3. **L'IA écrit dans le moteur par son API publique**, comme n'importe quel client. Elle
   n'a aucun privilège particulier.
4. **Visualization est en lecture seule** sur le modèle.
5. Les capacités transverses — authentification, organisations, facturation, stockage,
   IA, notifications — viennent de [Sekuu Platform](SEKUU.md) et ne sont pas reconstruites.
6. **Neftya est un produit, pas un module de la plateforme.** Il a sa propre base et
   n'accède à Sekuu que par ses API. Un seul répertoire porte cette frontière — voir
   ci-dessous.

## Frontière avec Sekuu

```text
apps/api/src/sekuu/
  token-verifier.ts       vérification JWKS hors ligne
  sekuu-context.ts        les claims décodés, objet immuable
  current-tenant.ts       la source de tenancy
  permission-resolver.ts  rôles Sekuu -> droits Neftya
  file-store.ts           Storage
  notifier.ts             Notify
  composer.ts             AI
```

C'est la structure de `DealerOs/apps/backend/app/Sekuu/`, transposée. Le code est en PHP là-bas
et sera en TypeScript ici ; **ce qui se copie est le découpage**, pas les fichiers.

Concentrer l'intégration dans un seul répertoire a une raison précise : le jour où la
plateforme renomme un claim, ajoute un scope ou ouvre un flux délégué « Se connecter avec
Sekuu », **un seul dossier change**. C'est la structure retenue par DealerOS, à copier.

Le moteur, lui, ne connaît pas Sekuu du tout : il ne sait même pas ce qu'est une
organisation. Il reçoit des paramètres et rend des cotes.

## Stack

**TypeScript de bout en bout**, monorepo, moteur en paquet isolé.

```text
apps/
  web/                interface React
  api/                API Node
packages/
  engine/             Neftya Engine — aucune dépendance framework
  contracts/          types partagés, dérivés du moteur
```

| Besoin | Choix |
|---|---|
| Moteur, API, interface | TypeScript |
| Interface | React 19, Vite, TanStack Router/Query, Tailwind, Radix |
| Validation | zod — schéma d'entrée du moteur autant que des formulaires |
| Base | PostgreSQL, `jsonb` pour le modèle paramétrique |
| 3D | Three.js via react-three-fiber |
| 2D | SVG généré directement |
| Tests du moteur | Vitest |

### Pourquoi le moteur est en TypeScript

C'est une conséquence du Single Source of Truth (§2 de
[NEFTYA_ENGINE.md](NEFTYA_ENGINE.md)), pas une préférence.

Le moteur est appelé **à chaque changement de paramètre**. Faire glisser la largeur de 1800
à 2200 doit mettre à jour la 3D, les cotes et la liste de pièces en continu. Un moteur qui
ne tournerait pas dans le navigateur laisse deux issues, mauvaises toutes les deux :

- **un aller-retour réseau par mouvement de curseur** — inutilisable, en particulier sur le
  mobile d'un artisan en atelier, qui est un critère retenu ([VISUALIZATION.md](VISUALIZATION.md)) ;
- **une approximation JavaScript pour l'aperçu** — soit deux implémentations des mêmes
  règles. C'est précisément ce que le Single Source of Truth interdit, et le jour où elles
  divergent d'un millimètre, personne ne le voit avant la scie.

Le même code tourne donc **dans le navigateur pour l'interaction** et **sur le serveur pour
ce qui fait foi**. La liste de découpe persistée ou exportée n'est jamais celle calculée par
le client : c'est la règle que DealerOS applique déjà aux prix, relus côté serveur et jamais
acceptés de l'appelant.

### Pourquoi l'API aussi

Le moteur étant en TypeScript, une API en PHP imposerait un pont — un processus Node appelé
par Laravel — et deux exécutions à déployer. Le faire en TypeScript supprime le pont.

Surtout, **le type du moteur devient le type de l'API et celui de l'interface**. L'audit de
DealerOS a trouvé 94 types réécrits à la main entre backend et frontend, sans contrat
généré, et des énumérations à trois sources de vérité qui ne se vérifiaient pas les unes les
autres. Cette classe de bug n'existe pas ici.

> **Le coût, dit franchement.** C'est un second écosystème à côté du PHP de Sekuu et de
> DealerOS, pour un développeur seul. La couche d'intégration Sekuu doit être réécrite en
> TypeScript — une journée, le contrat étant documenté. Ce qui se réutilise de DealerOS est
> la **structure**, pas le code.

Un service séparé pour le moteur a été écarté : la frontière réseau garantirait l'isolation,
mais au prix d'un déploiement, d'une latence et d'un débogage plus lourds, sans bénéfice à
cette échelle. Rien n'empêche de l'extraire plus tard — c'est ce que le paquet isolé
préserve.

### Ce qu'on n'ajoute pas

**Aucune bibliothèque de nesting.** La contrainte est particulière — coupes guillotine,
trait de scie réservé, sens du fil en V2. Les bibliothèques généralistes font du placement
irrégulier, dont Neftya n'a pas besoin, et ne modélisent pas le trait de scie. Quelques
centaines de lignes à écrire, et à maîtriser : c'est là que vivent les plans faux.

**Aucune bibliothèque de CAO.** Les plans 2D sont des projections orthogonales de boîtes
alignées sur les axes. Générer le SVG directement est plus simple, et donne l'export SVG
sans travail supplémentaire.

**Le PDF part du SVG, pas du HTML.** Un plan technique coté est un dessin vectoriel. Le
faire transiter par une mise en page HTML/CSS revient à lutter contre le moteur de rendu à
chaque cote.
