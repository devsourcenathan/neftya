# Intégration avec SEKUU Core

Neftya ne reconstruit pas les services génériques. Elle s'appuie sur SEKUU Core comme
fondation, et se concentre sur son domaine métier.

```text
                    SEKUU CORE
┌───────────────────────────────────────────┐
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
└─────────────────────┬─────────────────────┘
                      ▼
                    NEFTYA
┌───────────────────────────────────────────┐
│ Furniture Projects                        │
│ Neftya Engine                             │
│ Components                                │
│ Materials                                 │
│ 3D Visualization                          │
│ 2D Technical Plans                        │
│ Cut List                                  │
│ Panel Optimization                        │
│ Assembly Instructions                     │
│ Manufacturing Calculations                │
└───────────────────────────────────────────┘
```

---

## Ce que SEKUU Core fournit

### Authentication

Inscription, connexion, social login, gestion des sessions.

### Users

Profils, préférences, gestion des comptes.

### Organizations

Espaces distincts pour particuliers, ateliers et entreprises. Un projet Neftya appartient
toujours à une organisation, y compris pour un utilisateur seul.

### Roles & Permissions

Exemple pour un atelier : `owner`, `admin`, `designer`, `carpenter`, `viewer`.

Le rôle `carpenter` illustre bien le besoin métier : accès aux plans de découpe et au guide
d'assemblage, sans accès aux prix ni aux devis.

### Billing

Plans, abonnements, factures, paiements, consommation. **Neftya ne lit ni plan ni facture** :
les limites applicables lui parviennent depuis la plateforme, et elle les applique.

### Storage

Images d'inspiration, modèles 3D, exports, PDF, documents.

### AI Services

```text
        NEFTYA
          │ AI Request
          ▼
       SEKUU AI
          │
          ├── Vision Model
          ├── LLM
          └── Image Generation
```

Neftya consomme le service sans gérer les clés ni les fournisseurs.

### AI Usage & Credits

Consommation, limites et crédits sont centralisés par SEKUU Core.

---

## Frontière

La règle est simple : **tout ce qui n'est pas spécifique au meuble appartient à SEKUU
Core**. Neftya ne possède ni table utilisateurs, ni logique d'abonnement, ni gestion de
clés d'API.

Cette séparation permet de construire Neftya comme un produit métier indépendant tout en
réutilisant un socle commun aux autres produits de l'écosystème SEKUU.

> **Point ouvert.** Le contrat exact entre SEKUU Core et un produit métier — comment les
> limites de plan et le contexte d'organisation parviennent au produit — doit être documenté
> côté SEKUU Core, pas ici. Neftya doit s'aligner sur ce contrat plutôt que d'en inventer un.
