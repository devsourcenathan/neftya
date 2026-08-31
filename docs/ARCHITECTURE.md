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
   IA, notifications — viennent de [SEKUU Core](SEKUU.md) et ne sont pas reconstruites.

## Découpage technique

**Monolithe modulaire, moteur en paquet isolé.**

```text
apps/
  web/                interface et API
packages/
  engine/             Neftya Engine — aucune dépendance framework
```

Le moteur vit dans son propre paquet et ne connaît ni HTTP, ni base de données, ni moteur
3D. Il prend des paramètres, il rend des composants et des cotes. C'est ce qui permet de le
tester seul, et c'est la condition pour que l'invariant de recomposition (§4 de
[NEFTYA_ENGINE.md](NEFTYA_ENGINE.md)) soit vérifiable automatiquement.

Un service séparé a été écarté : la frontière réseau garantirait l'isolation, mais au prix
d'un déploiement, d'une latence et d'un débogage plus lourds, sans bénéfice à cette échelle.
Rien n'empêche de l'extraire plus tard — c'est précisément ce que le paquet isolé préserve.
