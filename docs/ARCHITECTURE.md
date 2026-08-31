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

## Point ouvert

Le découpage technique (monolithe modulaire, paquets séparés, services) n'est pas tranché.
La seule contrainte ferme est l'isolation du moteur : il doit pouvoir être extrait et testé
sans le reste de l'application.
