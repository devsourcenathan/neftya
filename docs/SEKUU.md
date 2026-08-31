# Intégration à Sekuu Platform

> **Neftya est un produit, pas un module de la plateforme.**
>
> Ce document résume le contrat côté Neftya. **Il ne fait pas autorité** : la référence
> est `Sekuu-Platform/docs/03-services/identity/04-integrer-un-produit.md`. En cas
> d'écart, c'est la plateforme qui a raison, et ce document qui doit être corrigé.

---

## 1. Pourquoi un produit séparé

La question « module dans Sekuu ou produit à part » est déjà tranchée par l'architecture
de la plateforme :

> La plateforme est mono-base, l'écosystème est multi-base. Un produit n'accède jamais à la
> base de la plateforme ni à celle d'un autre produit — uniquement à leurs API.
>
> — `Sekuu-Platform/docs/01-overview/architecture.md` §10.1

`Modules/` ne contient que des services génériques — Identity, Billing, Storage, AI,
Notify, Payments. Aucune donnée métier. Un module « meubles » y serait le premier à porter
des catalogues, des listes de découpe et des plans de panneaux.

Trois raisons propres à Neftya s'y ajoutent :

- **Le profil de charge.** Nesting, cotation automatique et rendu 3D n'ont rien de commun
  avec de l'authentification. ADR-0001 acte qu'un monolithe modulaire monte en charge
  globalement : optimiser un panneau ferait monter Identity avec.
- **Le rythme de livraison.** « Un déploiement affecte tous les modules » (ADR-0001).
- **L'isolation du moteur.** Neftya Engine doit vivre dans `packages/engine` sans
  dépendance framework et rester testable seul ([ARCHITECTURE.md](ARCHITECTURE.md)).
  Enfoui dans un module Laravel de la plateforme, il ne l'est plus.

Neftya suit donc le modèle **produit maison**, celui de DealerOS.

---

## 2. Ce que Sekuu fait, ce que Neftya fait

| Sekuu | Neftya |
|---|---|
| Comptes, mots de passe, sessions | Les projets de meubles |
| Organisations, membres, invitations, rôles | Ce qu'un rôle autorise **chez Neftya** |
| Abonnements, factures, encaissement | Rien — Neftya ne facture pas |
| Publie les quotas par plan | Compte ses propres ressources |
| Emails, fichiers, IA | Les appelle quand il en a besoin |

**Neftya n'a pas de table `users`.** C'est le point de départ, et tout le reste en découle.

Si des préférences propres au produit sont nécessaires, une table les porte avec le `sub`
du jeton comme clé étrangère logique, et **rien d'autre** de l'utilisateur — ni email, ni
nom. Une copie diverge, et le jour d'une demande d'effacement personne ne sait qu'elle
existe.

---

## 3. Le jeton

Vérification **hors ligne**, contre les clés publiées :

```text
https://platform.sekuu.com/.well-known/jwks.json
```

Quatre contrôles, aucun facultatif : signature `RS256` contre le `kid` de l'en-tête,
`iss = https://identity.sekuu.com`, `aud` contenant `sekuu-platform`, et `exp` non dépassé.

Vérifier la signature sans vérifier `aud` laisserait entrer un jeton émis pour un autre
destinataire — signé par la même clé, donc valide en apparence.

### Ce que Neftya lit

| Claim | Toujours présent | Usage chez Neftya |
|---|---|---|
| `sub` | oui | Identifiant utilisateur. Jamais dupliqué en base. |
| `sid` | oui | Session. Pour journaliser, **jamais pour autoriser**. |
| `lang` | oui | Langue des réponses |
| `org` | **non** | **La frontière d'isolation.** Absent → refus. |
| `roles` | non | `owner`, `admin`, `billing_manager`, `member` |
| `products` | non | Doit contenir `neftya` |
| `limits` | non | Voir §5 |

Le contrôle d'abonnement tient en une ligne :

```ts
if (!claims.products?.includes('neftya')) throw new Forbidden();
```

Neftya ne parle jamais à Billing et ne connaît ni plan, ni facture, ni échéance.

### Deux pièges

**Un jeton fraîchement obtenu par `login` ne porte pas d'organisation.** Il faut enchaîner
`switch-organization`, qui rend un **nouveau** jeton — celui-là porte `org`, `roles`,
`products`. Sans cette étape, Neftya voit un jeton valide, signé, non expiré, et refuse
tout.

**La révocation a quinze minutes de latence.** Un jeton d'accès vit 900 secondes ; un
abonnement suspendu à 10 h 00 laisse entrer jusqu'à 10 h 15. C'est le prix de la
vérification hors ligne, et cette durée **est** la fenêtre d'exposition — ne pas
l'allonger. Pour une opération coûteuse ou irréversible, relire l'état auprès de Sekuu à ce
moment-là.

---

## 4. Cloisonnement

`organization_id` vient **du jeton**, jamais du corps de la requête, jamais d'un paramètre
d'URL, jamais d'un en-tête.

```ts
db.project.findMany({ where: { organizationId: claims.org } });
```

Le test à écrire avant la première fonctionnalité : **un jeton de l'organisation A obtient
`404` sur une ressource de B** — sur `GET`, `PATCH`, `DELETE` et les sous-ressources.

`404` et non `403` : distinguer les deux dirait à qui essaie des identifiants au hasard
lesquels existent. C'est la même règle que celle déjà retenue dans
[NEFTYA_ENGINE.md](NEFTYA_ENGINE.md).

---

## 5. Quotas

Billing publie la limite ; **Neftya compte sa ressource**. Sekuu ne saura jamais mieux que
Neftya ce qu'est un projet de meuble.

Les clés sont **préfixées par le produit** — `neftya_projects_max`, jamais `projects_max` :
« projet » ne veut pas dire la même chose chez un autre produit, et une clé partagée
plafonnerait deux ressources différentes avec le même nombre.

```json
"limits": {
  "members": 10,
  "storage_gb": 50,
  "neftya_projects_max": 20,
  "neftya_ai_analyses_max": 50
}
```

`members` n'est pas redéclaré : la plateforme nomme déjà les utilisateurs d'une
organisation, et une seconde clé pour la même notion finit par en dire une autre.

### Trois états, pas deux

| Forme | Sens | Comportement de Neftya |
|---|---|---|
| clé absente | ce plan ne couvre pas cette ressource | **ne pas plafonner** |
| `null` | illimité | ne pas plafonner |
| entier | plafond | comparer au décompte |

Confondre « absente » et « zéro » bloquerait toute organisation dont l'abonnement précède
l'ajout de la clé au catalogue — c'est-à-dire, le jour de cet ajout, tous les clients
existants.

### Quand un changement prend effet

Les limites sont figées sur l'abonnement à l'ouverture de chaque période (ADR-0019). Une
hausse s'applique immédiatement ; une baisse attend le renouvellement. Neftya n'a rien à
faire de particulier — il lit le claim — mais doit le savoir pour ne pas s'étonner qu'une
baisse ne se voie pas tout de suite.

---

## 6. Rôles

Sekuu dit qu'un utilisateur est `admin` de son organisation. **Il ne dit pas ce qu'un
`admin` peut faire chez Neftya.**

| Rôle Sekuu | Signification côté plateforme |
|---|---|
| `owner` | A créé l'organisation. Il en reste toujours un. |
| `admin` | Administre l'organisation, hors facturation |
| `billing_manager` | Abonnement et factures |
| `member` | Appartient, sans droit d'administration |

Neftya établit sa **propre** correspondance, explicite :

```ts
const DROITS = {
  supprimerUnProjet:   ['owner', 'admin'],
  modifierUnProjet:    ['owner', 'admin', 'member'],
  voirLesPrixDAchat:   ['owner', 'admin'],
} as const satisfies Record<string, readonly RoleSekuu[]>;
```

Cette dernière ligne est le besoin métier réel évoqué au [BRIEF.md](BRIEF.md) : un
menuisier salarié doit accéder au plan de découpe et au guide d'assemblage sans voir les
marges. Sekuu n'a pas de rôle `carpenter` et n'en aura pas — c'est à Neftya de décider ce
que `member` autorise.

> **Ne jamais réutiliser les `scopes` de Sekuu** (`organization.manage`, `users.invite`…)
> pour les droits de Neftya. Ce sont des permissions de plateforme : le jour où Sekuu en
> ajoute une, l'autorisation de Neftya changerait sans que personne ne l'ait décidé.

---

## 7. Connexion

Les écrans d'inscription, de création d'organisation et de choix de plan **vivent sur la
plateforme** :

| | |
|---|---|
| `GET /login` | Connexion |
| `GET /register` | Création de compte |
| `GET /organizations/new` | Création d'organisation |
| `GET /subscribe?product=neftya` | Choix du plan |

Neftya y redirige l'utilisateur non connecté, avec `?redirect=` vers la page voulue. Le
portail rend la main avec la session déjà posée dans le cookie partagé ; Neftya appelle
`refresh`, obtient un jeton, et **n'a jamais vu d'identifiants**.

L'origine de Neftya doit figurer dans `SEKUU_ALLOWED_ORIGINS` de la plateforme — même liste
que CORS, délibérément. Une origine inconnue est ignorée sans erreur, et l'utilisateur
atterrit sur l'accueil.

> **Décision Neftya : passer par le portail.** Héberger l'écran de connexion serait
> techniquement possible entre produits du même éditeur, mais ferait voir le mot de passe à
> Neftya. Il n'existe pas encore de flux délégué « Se connecter avec Sekuu » ; l'appel de
> connexion doit donc rester isolé dans un seul module du code, pour basculer sans douleur
> le jour où il existera.

Détail qui coûte cher si on l'ignore : un jeton de rafraîchissement **ne se rejoue pas**.
Le rejouer révoque la session entière — c'est la détection de vol. Deux onglets qui
rafraîchissent en même temps déconnectent l'utilisateur : les rafraîchissements doivent
être sérialisés.

---

## 8. Ce que Neftya consomme des autres modules

Pour ce que le serveur fait de sa propre initiative — un PDF, un devis envoyé, une analyse
d'image — le jeton de l'utilisateur n'existe pas. Il faut une clé d'API.

| Besoin Neftya | Scope | Périmètre exigé |
|---|---|---|
| Envoyer un devis au client | `notifications.send.delegated` | — |
| Déposer images, exports, modèles 3D | `storage.write`, `storage.read` | `subject_types: ["neftya.project"]` |
| Analyser une image, générer une configuration | `ai.run`, `ai.read` | `ai_tasks` en liste blanche |

Deux règles : **le minimum** — une clé qui envoie des messages n'a pas à lire des
fichiers — et **un périmètre**. Le scope dit que la clé peut agir, le périmètre dit sur
quoi ; sans le second, le premier est le plus large possible.

`notifications.send.delegated` plutôt que `notifications.send` : Neftya écrit **aux clients
de ses artisans**, pas seulement pour lui-même. Cette clé ne s'émet qu'en console.

---

## 9. Ouvrir Neftya sans facture

Pour une démonstration, un partenaire ou un essai qu'aucun plan ne couvre :

```bash
php artisan identity:product <organisation> neftya --until=2026-09-30
```

`--revoke` referme. La commande n'écrit et ne retire que ses propres lignes : un accès né
d'un abonnement lui est fermé dans les deux sens.

---

## 10. Liste de contrôle

Reprise du guide de la plateforme, adaptée à Neftya.

Chaque case cochée renvoie à un test qui échoue si on retire la garde — une case cochée sans
cela ne prouve rien.

- [x] JWKS récupéré et mis en cache, relecture immédiate sur `kid` inconnu — `token-verifier.ts`
- [x] `iss`, `aud`, `exp` vérifiés — pas seulement la signature — `access.test.ts`, un test par contrôle
- [x] Absence de `org` → refus — `access.test.ts`
- [x] `products` contient `neftya` → sinon `403` — `authenticate.ts`
- [x] Toutes les tables portent `organization_id`, lu du jeton — `0001_initial.sql`
- [x] Test d'isolation A/B écrit, sur les quatre verbes — `isolation.test.ts`
- [x] Correspondance rôles → droits, explicite et propre à Neftya — `permission-resolver.ts`
- [x] Quotas : les trois états distingués — `quota.ts`, un test par état
- [x] **Aucune table `users`** — `db/schema.ts` n'en déclare pas

Trois points portent sur le **client** de la plateforme, pas sur l'API, et se traitent là où
la session vit — en phase 3 pour les deux premiers, en phase 5 pour le troisième :

- [ ] `switch-organization` enchaîné après `login` — phase 3
- [ ] Rafraîchissement sérialisé, un seul à la fois — phase 3
- [ ] Clés d'API à scopes minimaux, avec `subject_types` et `ai_tasks` — phase 5, avec AI

Côté API, l'absence d'organisation dans le jeton est déjà un refus explicite dont le message
nomme `switch-organization` : le client ne peut pas se tromper longtemps.

---

## 11. Point de départ de l'implémentation

**Ne rien réinventer.** DealerOS a déjà écrit cette couche — `apps/backend/app/Sekuu/` :

```text
TokenVerifier.php          vérification JWKS hors ligne
SekuuContext.php           les claims décodés, en objet immuable
CurrentTenant.php          remplace auth()->user() comme source de tenancy
PermissionResolver.php     correspondance rôles Sekuu -> droits produit
ProvisionOrganization.php  première venue d'une organisation
FileStore.php              Storage
Notifier.php               Notify
Composer.php               AI
```

Neftya étant en TypeScript ([ARCHITECTURE.md](ARCHITECTURE.md)), **c'est le découpage qui se
copie, pas le code**. La transposition est directe : `firebase/php-jwt` devient une
bibliothèque JOSE côté Node, et le reste est de l'appel HTTP.

Le contrat étant entièrement documenté par la plateforme, cette réécriture est courte — mais
elle doit rester dans ce seul répertoire, pour que le jour où un claim change, un seul
dossier bouge.
