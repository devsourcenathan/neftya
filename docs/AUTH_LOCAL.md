# Identité locale Neftya

> Sekuu Platform n'étant pas disponible, Neftya porte sa propre identité.
> Ce document décrit ce qui la remplace, et ce qui est volontairement
> abandonné en attendant le retour de la plateforme.

## 1. Ce qui existe

| Besoin | Réponse locale |
|---|---|
| Comptes | `POST /v1/auth/register`, `POST /v1/auth/login` — email + mot de passe (scrypt) |
| Sessions | JWT d'accès HS256, 15 min + rafraîchissement opaque, 30 j, à rotation |
| Organisations | `POST /v1/auth/organizations`, `POST /v1/auth/switch` |
| Membres | `memberships` : `owner` (un seul), `admin`, `member` |
| Invitations | `POST /v1/auth/invitations` (owner/admin), `POST /v1/auth/accept-invitation` — jeton opaque à usage unique, 7 j |

## 2. Les jetons

Accès : `HS256`, `iss = neftya`, `aud = neftya-api`, `exp` 900 s. Mêmes
claims que Sekuu (`sub`, `org`, `roles`, `products: ['neftya']`, `limits`,
`lang`) : les routes métier (`sekuuOf`, `can`, `enforceLimit`) ne savent
pas qui a signé.

Rafraîchissement : opaque (256 bits), seul son condensat SHA-256 dort en
base. Rotation à chaque usage : l'ancienne ligne est révoquée, une nouvelle
naît. **Rejouer un jeton déjà tourné révoque toutes les sessions de
l'utilisateur** — détection de vol, comme la plateforme.

## 3. Coexistence avec Sekuu

`CompositeVerifier` (`apps/api/src/auth/local-verifier.ts`) essaie le local
puis Sekuu. Les deux sortes de jetons passent pendant la transition ; quand
la plateforme reviendra, `AUTH_PROVIDER` choisira — aucune route ne change.

## 4. Quotas

`organization_quotas` porte les plafonds, recopiés dans le jeton à chaque
ouverture de session (`GET /v1/auth/quotas` les lit, `PUT /v1/auth/quotas`
les écrit — seul `owner`). Trois états, comme côté Sekuu : pas de ligne =
pas couvert, `null` = illimité, entier = plafond (`0` bloque tout).

Un changement prend effet au prochain rafraîchissement (15 min au plus
pour le jeton d'accès). Pas de facturation : les plafonds sont des
garde-fous, pas des plans.

## 5. Ce qui n'existe pas (et ne manque pas encore)
- Session unique entre produits, cookie partagé : un seul produit tourne.
- `billing_manager` : pas de facturation ; `owner`/`admin` couvrent.
- Choix du plan, factures, portail : voir chantier B (quotas locaux).
- `sid` de plateforme : `sessionId` vaut `null` en local ; les journaux
  gardent `organization_id` et `user_id`, jamais l'email.

## 5. Configuration

| Variable | Rôle |
|---|---|
| `NEFTYA_JWT_SECRET` | HS256 local, 32 caractères au moins. Refus de démarrer sinon. |

## 6. Limites assumées

- Rate-limit en mémoire (20/min/IP sur register/login/accept) : un
  garde-fou contre le bourrage, pas une protection distribuée. Derrière
  plusieurs instances, passer à Redis.
- Pas de vérification d'email ni de reset mot de passe par lien : chantier
  ultérieur, avec le mailer (chantier F).
- `citext` refusé : les tests rejouent les migrations par schéma, et une
  extension n'y est pas visible. `lower(email)` + index unique.
