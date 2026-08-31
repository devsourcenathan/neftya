# Exploitation

> Ce document sert **le jour où quelque chose ne va pas**. Il est écrit pour être lu vite,
> par quelqu'un qui n'a pas le contexte en tête — y compris son auteur, six mois plus tard.

---

## 1. Ce qui tourne

| | |
| --- | --- |
| API | Node 22, Fastify, un processus sans état |
| Interface | fichiers statiques, servis par n'importe quoi |
| Base | PostgreSQL 18 |
| Identité, facturation, fichiers | **Sekuu Platform** — Neftya n'héberge rien de tout cela |

L'API est sans état : aucune session en mémoire, aucun fichier écrit, aucun travail de fond.
Un processus se remplace par un autre sans précaution, et se multiplie sans coordination.

**Ce qui a un état, c'est PostgreSQL, et lui seul.** C'est aussi la seule chose à
sauvegarder.

---

## 2. Configuration

Toutes les variables sont exigées **au démarrage**. Le serveur refuse de démarrer si l'une
manque : échouer à la première requête coûte plus cher que refuser de démarrer.

| Variable | Rôle | Absente |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL | refus de démarrer |
| `SEKUU_JWKS_URL` | clés publiques de la plateforme | refus de démarrer |
| `SEKUU_ISSUER` | `https://identity.sekuu.com` | refus de démarrer |
| `SEKUU_AUDIENCE` | `sekuu-platform` | refus de démarrer |
| `SEKUU_STORAGE_URL` | dépôt des exports | dépôt désactivé |
| `SEKUU_STORAGE_API_KEY` | clé `storage.write.delegated` | dépôt désactivé |
| `PORT`, `HOST` | écoute | 3000, `0.0.0.0` |

Sans clé Storage, **les exports sont produits et enregistrés quand même** ; ils ne sont
simplement pas déposés, et leur `storage_object_id` reste nul. C'est visible, et c'est
voulu : personne n'a de clé en local.

> **L'origine de Neftya doit figurer dans `SEKUU_ALLOWED_ORIGINS` de la plateforme.** Sinon
> la redirection de connexion retombe silencieusement sur l'accueil de Sekuu, sans erreur —
> le symptôme le plus déroutant de l'intégration.

---

## 3. Sondes

| Route | Question | Décision qu'elle sert |
| --- | --- | --- |
| `GET /health` | le processus répond-il ? | redémarrer, ou non |
| `GET /ready` | la base répond-elle ? | envoyer du trafic, ou non |

Les deux sont **sans authentification** : un orchestrateur n'a pas de jeton.

Elles sont distinctes parce qu'elles servent deux décisions opposées. Une base
momentanément indisponible doit retirer l'instance du trafic — pas la faire redémarrer en
boucle, ce qui n'a jamais réparé une base.

`/ready` rend `503` et `checks.database: "ko"` quand la base ne répond plus.

---

## 4. Journaux

Une ligne JSON par requête, sur la sortie standard. Pas de fichier : l'hébergement
collecte la sortie standard, et un fichier écrit par l'application est un fichier que
personne ne surveille et qui remplit un disque un dimanche.

```json
{
  "level": "info",
  "message": "requête",
  "service": "neftya-api",
  "request_id": "0192...",
  "method": "GET",
  "route": "/v1/projects/:id",
  "status": 200,
  "duration_ms": 12,
  "organization_id": "3fa8...",
  "user_id": "550e...",
  "session_id": "sess_..."
}
```

`route` est la **route déclarée**, pas l'URL : `/v1/projects/:id` regroupe, alors que
`/v1/projects/<uuid>` ferait mille lignes distinctes dont aucune n'est comptable.

`request_id` est celui rendu au client dans `meta.request_id`. C'est ce qui relie une
plainte à une ligne.

### Ce qui n'y est jamais

- **le jeton**, ni aucun en-tête `authorization` ;
- **le corps des requêtes** — un modèle de meuble n'apprend rien aujourd'hui, mais un jour
  un corps portera autre chose, et le journal le gardera des années ;
- **l'email ou le nom** de qui appelle. Neftya ne les détient pas, et un journal est
  exactement l'endroit où une copie d'utilisateur réapparaît sans que personne ne l'ait
  décidé.

Le `sub` de la plateforme y est, sous `user_id` : c'est un pseudonyme, il ne dit rien de la
personne, et sans lui aucune enquête n'aboutit.

Un test vérifie cette liste **par égalité**, pas par inclusion : un champ ajouté sans y
penser fait échouer la suite.

---

## 5. Sauvegarde et restauration

```bash
DATABASE_URL=... npm run backup -- sauvegardes
DATABASE_URL=... npm run restore -- sauvegardes/neftya-....dump
```

`--clean` efface avant de restaurer. **Ce n'est pas le défaut** : une restauration
destructive lancée par erreur sur la production est le genre d'accident qu'un défaut ne
doit pas rendre facile.

Format `custom` de `pg_dump` : compressé, restauration sélective possible, et `pg_restore`
refuse un fichier tronqué au lieu de rejouer la moitié d'une base.

> **Le va-et-vient est testé, pas documenté.** `apps/api/src/db/backup.test.ts` écrit des
> données, sauvegarde, **détruit le schéma**, restaure, et compare ligne à ligne — puis
> vérifie que l'application fonctionne sur la base restaurée, contraintes comprises.
>
> Le test **échoue** si `pg_dump` est absent, au lieu de s'ignorer. Un test de sauvegarde
> qui se saute tout seul est un test qui n'a jamais tourné, et personne ne s'en aperçoit
> avant l'incident.

`pg_dump` doit être en **version 18** : un client 16 refuse de parler à un serveur 18. La
CI installe le bon.

### Ce qui n'est pas sauvegardé, et pourquoi

Rien d'autre que PostgreSQL. Les exports déposés chez Storage appartiennent à la
plateforme, qui les sauvegarde ; les plans et listes de découpe sont **recalculés** à partir
du modèle et n'ont pas à survivre.

---

## 6. Migrations

Elles s'appliquent **au démarrage**, dans l'ordre des noms de fichier, chacune dans une
transaction, et sont enregistrées dans `schema_migrations`.

Une migration à moitié appliquée est pire qu'une migration qui échoue : la transaction
l'empêche.

Avant toute migration en production : **une sauvegarde**, et vérifier qu'elle fait plus de
quelques kilooctets. Un fichier vide est le symptôme classique d'une sauvegarde qui
« réussit ».

---

## 7. Quand quelque chose ne va pas

| Symptôme | Première chose à regarder |
| --- | --- |
| Tout répond `401` | Le jeton porte-t-il `org` ? `switch-organization` a-t-il été appelé après `login` ? |
| Tout répond `403` | L'organisation est-elle abonnée au produit `neftya` ? |
| Un client ne voit pas ses projets | Le jeton porte-t-il **la bonne** organisation ? Le cloisonnement rend `404`, jamais les données d'autrui. |
| `404` sur une ressource qui existe | C'est le comportement attendu entre organisations. Vérifier `organization_id` dans les journaux. |
| `409` à la création | Quota `neftya_projects_max` atteint. C'est Billing qui le publie, pas Neftya. |
| `/ready` en `503` | La base. `/health` reste vert : le processus va bien. |
| Un export sans `storage_object_id` | Storage était indisponible, ou aucune clé n'est configurée. L'export est intact. |
| Déconnexions aléatoires | Deux rafraîchissements simultanés. Le rejeu d'un jeton de rafraîchissement révoque **toute** la session : c'est la détection de vol de la plateforme. |

### La révocation a quinze minutes de retard

Un jeton d'accès vit 900 secondes, et la vérification est hors ligne. Un abonnement
suspendu à 10 h 00 laisse entrer jusqu'à 10 h 15.

**C'est le prix de la vérification hors ligne, et cette durée _est_ la fenêtre
d'exposition — ne pas l'allonger.** Pour une opération coûteuse ou irréversible, relire
l'état auprès de Sekuu à ce moment-là.

---

## 8. Ce qu'il ne faut pas faire

**Écrire dans la base à la main pour « débloquer » un client.** Le cloisonnement vient du
jeton ; une ligne insérée avec le mauvais `organization_id` est invisible à celui qui devait
la voir et visible d'un autre.

**Allonger la durée de vie du jeton.** C'est la fenêtre d'exposition qu'on allonge.

**Copier un utilisateur dans une table Neftya.** Il n'y a pas de table `users`, et c'est
structurel : une copie diverge, et le jour d'une demande d'effacement personne ne sait
qu'elle existe.

**Restaurer sans avoir lu quelle sauvegarde on restaure.** Le nom du fichier porte
l'horodatage UTC. Le lire prend trois secondes ; le regretter prend une journée.
