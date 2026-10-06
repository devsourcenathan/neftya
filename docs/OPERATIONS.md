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
| Identité, quotas, fichiers | **Neftya lui-même** — Sekuu Platform est mise de côté (voir `AUTH_LOCAL.md`) |

L'API est sans état : les sessions sont des lignes de `refresh_sessions`, pas de
la mémoire (seul le rate-limit d'auth est en mémoire). Un processus se remplace
par un autre sans précaution, et se multiplie sans coordination.

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
| `NEFTYA_JWT_SECRET` | jetons d'accès locaux (32 car. min) — voir `AUTH_LOCAL.md` | refus de démarrer |
| `SEKUU_JWKS_URL` | clés publiques de la plateforme | refus de démarrer |
| `SEKUU_ISSUER` | `https://identity.sekuu.com` | refus de démarrer |
| `SEKUU_AUDIENCE` | `sekuu-platform` | refus de démarrer |
| `SEKUU_STORAGE_URL` | dépôt des exports (si clé Sekuu) | dépôt local |
| `SEKUU_STORAGE_API_KEY` | clé `storage.write.delegated` | dépôt local |
| `NEFTYA_DATA_DIR` | fichiers déposés (`./data` par défaut) | `./data` |
| `OPENAI_API_KEY` | modèle de l'assistant | assistant désactivé (`503`) |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | relais et modèle | OpenAI, `gpt-4o-mini` |
| `NEFTYA_SMTP_HOST` | relais SMTP des devis | envoi désactivé (`503`) |
| `NEFTYA_SMTP_PORT` / `NEFTYA_SMTP_SECURE` | port et TLS | `587`, `false` |
| `NEFTYA_SMTP_USER` / `NEFTYA_SMTP_PASSWORD` | authentification SMTP | refus de démarrer **si** `HOST` est posé |
| `NEFTYA_SMTP_FROM` | expéditeur affiché | `NEFTYA_SMTP_USER` |
| `NEFTYA_ALLOWED_ORIGINS` | origines navigateur admises | **aucune** — l'interface ne peut pas appeler l'API |
| `PORT`, `HOST` | écoute | 3000, `0.0.0.0` |

`NEFTYA_ALLOWED_ORIGINS` est une **liste**, jamais `*`. L'API porte un jeton dans un
en-tête : une origine quelconque autorisée à l'envoyer est une page quelconque qui agit au
nom de l'utilisateur. Vide par défaut, parce qu'une liste oubliée doit empêcher l'interface
de fonctionner, pas ouvrir l'API à tout le monde.

Sans clé Storage, **les exports sont déposés sur disque** (`NEFTYA_DATA_DIR`) ;
avec une clé, ils repartent chez Sekuu et `storage_object_id` redevient un
identifiant distant. `GET /v1/exports/:id/file` rend les octets figés quand
la relecture est câblée (dépôt local) — sinon 404, et l'instantané en base
reste consultable.

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
- **l'email ou le nom** de qui appelle. L'identité étant locale, ils vivent en
  base — et c'est une raison de plus pour ne pas les recopier dans les
  journaux, où une copie finit par survivre à l'effacement du compte.

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

Les plans et listes de découpe sont **recalculés** à partir du modèle et n'ont
pas à survivre. En revanche, **`NEFTYA_DATA_DIR` se sauvegarde avec la base** :
un export figé dont les octets manquent rend 404. Même horodatage des deux
côtés — un dump sans son répertoire (ou l'inverse) est une restauration à
moitié.

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
| Tout répond `401` | Le jeton porte-t-il `org` ? Sinon, choisir une organisation (`POST /v1/auth/switch`). Un 401 répété après reconnexion : session révoquée (rejeu détecté) — se reconnecter. |
| Tout répond `403` | Le rôle le permet-il ? `member` ne supprime pas, ne voit pas les coûts, n'invite pas. |
| Un client ne voit pas ses projets | Le jeton porte-t-il **la bonne** organisation ? Le cloisonnement rend `404`, jamais les données d'autrui. |
| `404` sur une ressource qui existe | C'est le comportement attendu entre organisations. Vérifier `organization_id` dans les journaux. |
| `409` à la création | Quota `neftya_projects_max` atteint. En local : `organization_quotas`, modifiable par le propriétaire (`PUT /v1/auth/quotas`). |
| `/ready` en `503` | La base. `/health` reste vert : le processus va bien. |
| Un export sans `storage_object_id` | Storage était indisponible, ou aucune clé n'est configurée. L'export est intact. |
| Déconnexions aléatoires | Deux rafraîchissements simultanés : le second rejoue un jeton déjà tourné, et toute la session est révoquée. L'interface sérialise les siens ; deux onglets qui expirent ensemble peuvent encore se marcher dessus — se reconnecter suffit. |

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

---
## 9. Mettre en ligne, sans rien payer

Deux hébergeurs : **l'API sur Render**, **l'interface sur Vercel**. La base reste celle de
Neon, déjà en service.

> **Pas de blueprint.** Render fait payer l'infrastructure déclarative ; le service se crée
> donc à la main, dans le tableau de bord. Un `render.yaml` versionné mais jamais appliqué
> aurait été pire que rien : il aurait dérivé en silence, et le jour d'un incident on aurait
> relu un fichier qui ne décrit pas ce qui tourne. Les réglages sont ici, en toutes lettres.
>
> `vercel.json`, lui, **est** appliqué — il ne coûte rien et Vercel le lit tout seul.

### 9.1 L'ordre, et pourquoi il compte

L'API a besoin du domaine du front pour l'autoriser ; le front a besoin de l'adresse de l'API
pour l'appeler. Chacun attend l'autre, donc on passe deux fois :

1. **Créer l'API** sur Render. Elle démarre, migre, et répond `/health`. Aucune page ne peut
   encore l'appeler : `NEFTYA_ALLOWED_ORIGINS` est vide, et c'est le bon défaut.
2. **Créer le front** sur Vercel avec `VITE_API_URL` pointant sur l'API. Il se charge, et
   toute requête échoue — le navigateur refuse la réponse avant que le code la voie.
3. **Revenir sur Render**, poser le domaine Vercel dans `NEFTYA_ALLOWED_ORIGINS`.

Le symptôme de l'étape 2 ne ressemble en rien à sa cause : la console parle de CORS, l'écran
ne montre rien. C'est pour cela que l'ordre est écrit.

### 9.2 L'API — Render, « New > Web Service »

Connecter le dépôt, puis saisir :

| Champ | Valeur |
|---|---|
| Language / Runtime | `Node` |
| Branch | `main` |
| Root Directory | *laisser vide* — la racine du dépôt |
| Build Command | `npm ci && npm run build` |
| Start Command | `npm run start --workspace @neftya/api` |
| Instance Type | **Free** |
| Health Check Path | `/health` *(section « Advanced »)* |

**La racine, et non `apps/api`.** L'API dépend de `@neftya/engine`, `contracts`, `units` et
`drawing`, qui sont des projets TypeScript référencés et non des paquets publiés : construits
depuis `apps/api` seul, ils manqueraient.

**Le chemin de sonde n'est pas décoratif.** Les migrations s'appliquent au démarrage : un
déploiement qui ne passe pas `/health` n'a pas migré, et c'est ce qu'on veut savoir avant que
quelqu'un s'en serve.

### 9.3 Les variables d'environnement de l'API

| Variable | Valeur | Sans elle |
|---|---|---|
| `NODE_VERSION` | `22` | Render choisit, et peut changer d'avis |
| `DATABASE_URL` | l'URL Neon, **point d'accès direct** | refus de démarrer |
| `NEFTYA_JWT_SECRET` | 32 caractères au moins, tirés au hasard | refus de démarrer |
| `NEFTYA_ALLOWED_ORIGINS` | le domaine Vercel, à l'étape 3 | aucune page n'appelle l'API |
| `NEFTYA_DATA_DIR` | `/opt/render/project/data` | `./data`, relatif au répertoire courant |
| `OPENAI_API_KEY` | facultative | l'assistant dit qu'il n'est pas configuré |
| `OPENAI_MODEL` | `gpt-4o-mini` | `gpt-4o-mini` |
| `OPENAI_REASONING_EFFORT` | `minimal` | champ omis |
| `NEFTYA_SMTP_HOST`, `_USER`, `_PASSWORD` | facultatives | l'envoi de devis répond `503` |

Le secret se tire une fois :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Le changer déconnecte tout le monde** — ce qui est aussi le moyen de révoquer toutes les
sessions d'un coup.

**Point d'accès direct, jamais le `-pooler`** : le banc d'essai passe `search_path` en
paramètre de démarrage, qu'un pooler rejette.

**Pas de base Render.** Sa Postgres gratuite expire au bout de trente jours, et une base qui
disparaît emporte les projets avec elle.

**Pas de variable Sekuu.** L'identité est locale depuis le 6 octobre 2026 et le vérifieur de
plateforme est optionnel : en poser qui pointent dans le vide rend impossible de savoir
lesquelles servent.

### 9.4 Le front — Vercel, « Add New > Project »

Le même dépôt. `vercel.json` porte déjà la commande de construction, le répertoire de sortie
et la réécriture : il n'y a ni cadre à choisir, ni racine à régler. Une seule variable :

```
VITE_API_URL = https://<le-nom-du-service>.onrender.com
```

Elle est lue **à la compilation**, pas à l'exécution : la changer demande un redéploiement, et
non un redémarrage.

La réécriture renvoie toute route inconnue sur `index.html`. Sans elle, ouvrir
`/projects/<id>` directement — un signet, un rafraîchissement — rend un 404 : c'est le routeur
du navigateur qui connaît cette adresse, pas l'hébergeur. Les fichiers qui existent sont
servis avant la règle, donc les ressources ne passent pas par là.

### 9.5 Ce que le gratuit coûte, et qu'il vaut mieux savoir avant

**L'API s'endort.** Quinze minutes sans requête, et Render éteint l'instance. Le réveil prend
une cinquantaine de secondes, pendant lesquelles la première page tourne dans le vide. Pour
une démonstration devant quelqu'un, l'ouvrir cinq minutes avant.

**Les deux sommeils s'additionnent.** Première requête après une nuit : Render se réveille,
puis Neon se réveille. C'est le chemin le plus lent du produit, et il ne se mesure pas en
local.

**Le disque est éphémère.** Chaque déploiement vide `NEFTYA_DATA_DIR`. Un export figé devient
alors une ligne sans fichier, donc un `404`. **Le meuble ne se perd pas** — tout se recalcule
du modèle — mais l'instantané, si ; et c'est précisément ce qu'un instantané promet de ne pas
faire. Le tenir demande une instance payante et un disque monté.

### 9.6 Vérifier que c'est en ligne

Dans cet ordre, parce que chacun dépend du précédent :

```bash
curl https://<service>.onrender.com/health   # {"success":true,...}
curl https://<service>.onrender.com/ready    # checks.database = "ok"
```

Puis, depuis le front : créer un compte, partir d'un modèle prédéfini, ouvrir le dossier de
fabrication. Si la première requête échoue sans message lisible, c'est
`NEFTYA_ALLOWED_ORIGINS`.
