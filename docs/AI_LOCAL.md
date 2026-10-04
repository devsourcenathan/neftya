# IA locale Neftya

> Sekuu AI n'étant pas disponible, Neftya appelle un modèle directement.
> L'assistant reste une **couche d'assistance** : il propose, le moteur tranche.

## 1. Ce qui change, ce qui ne change pas

| | Sekuu AI | Locale |
|---|---|---|
| Contrat HTTP | `POST …/interpretations` → `202`, `GET …/:id` | inchangé |
| Idempotence | clé `neftya:interpret:{org}:{sha256}` | inchangée, **persistée** : même clé = même ligne |
| On nomme | une **tâche** (`extract`) | un **modèle** (`OPENAI_MODEL`) |
| Exécution | asynchrone, sondée | **synchrone** : la première lecture répond `succeeded` |
| Quota | publié par Billing | **compté en lignes** du mois, plafond `ai_month_max` |
| `unusable` | la génération a coûté mais ne compose rien | inchangé, `interpret()` tranche toujours |

Nommer un modèle plutôt qu'une tâche, c'est reprendre la responsabilité du
registre et du plafond de dépense. Le jour où un modèle meilleur arrive, on
change une variable — pas un contrat.

## 2. Fournisseur

Toute API compatible OpenAI (`POST {baseUrl}/chat/completions`) : OpenAI,
ou un relais local. `temperature: 0`, `max_tokens: 500`,
`response_format: { type: 'json_object' }` — une extraction n'est pas un
lieu d'inventivité, et le coût est proportionnel à l'entrée comme à la sortie.

Sans clé, l'assistant répond `503` qu'il n'est pas configuré : il n'y a rien
à dégrader, une interprétation n'a pas de version locale.

## 3. Configuration

| Variable | Rôle | Défaut |
|---|---|---|
| `OPENAI_API_KEY` | facturation du modèle | assistant désactivé |
| `OPENAI_BASE_URL` | relais compatible | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | ce qu'on paie à chaque appel | `gpt-4o-mini` |
| `SEKUU_AI_API_KEY` | repli plateforme | local prioritaire |

## 4. Limites assumées

- **Pas de vision.** Comme côté Sekuu, l'analyse d'image reste bloquée —
  cette fois par l'absence de pipeline, pas par la plateforme.
- **Synchrone** : un appel tient sa requête HTTP (timeout 30 s). Au-delà de
  quelques utilisateurs simultanés, une file et un travailleur deviendront
  nécessaires — l'interface sonde déjà, elle n'aura rien à changer.
- Le quota compte les générations **créées** (réussies comme ratées) :
  les deux ont brûlé des jetons. La relecture idempotente ne compte pas.
