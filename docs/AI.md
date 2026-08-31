# Intelligence artificielle

> L'IA est une **couche d'assistance**, pas le moteur du produit.

Elle propose, elle ne décide pas. Toute sortie de l'IA passe par le modèle paramétrique
([NEFTYA_ENGINE.md](NEFTYA_ENGINE.md)), qui reste seul responsable des cotes. Une
proposition de l'IA qui violerait les règles du moteur est corrigée par le moteur, pas
l'inverse.

L'accès aux modèles est fourni par le module AI de [Sekuu Platform](SEKUU.md) : Neftya
appelle une **tâche**, jamais un modèle, avec une clé d'API portant les scopes `ai.run` et
`ai.read` et une liste blanche de tâches (`ai_tasks`). Il ne gère ni fournisseur, ni clé de
modèle, ni facturation.

---

## 1. Image → structure

Analyser une image pour identifier le type de meuble, les éléments visibles et la structure
générale.

**L'utilisateur valide ensuite l'interprétation.** Ce n'est pas une politesse : une image ne
porte ni dimensions, ni épaisseurs, ni assemblages, et deux meubles visuellement identiques
peuvent avoir des structures internes différentes. L'IA fait une classification grossière ;
l'utilisateur fait le reste.

> C'est la fonctionnalité la plus incertaine du produit. Elle est **volontairement absente
> du MVP** et reportée en V2, une fois le moteur éprouvé.

---

## 2. Texte → configuration

Transformer une description en configuration structurée.

> Je veux une bibliothèque de 2 mètres avec 6 étagères et un compartiment fermé.

```text
Type                : Bibliothèque
Hauteur             : 2000 mm
Étagères            : 6
Compartiment fermé  : oui
```

La sortie est une **configuration validée contre le schéma du moteur**, pas du texte libre.
Un champ hors domaine est rejeté, pas interprété.

> Prévu en V2.

---

## 3. Assistant de conception

L'utilisateur agit sur son projet en langage naturel :

> Ajoute deux tiroirs dans la partie inférieure.
> Augmente la largeur à 2 mètres.
> Remplace les portes par des tiroirs.

L'IA traduit ces instructions en **modifications du modèle paramétrique**, qui les propage
selon ses propres règles. Élargir à 2 mètres étire les compartiments existants (§7.1 de
[NEFTYA_ENGINE.md](NEFTYA_ENGINE.md)) ; si cela crée une portée excessive, c'est la
validation technique qui alerte — pas l'IA qui décide seule d'ajouter un séparateur.

> Prévu en V2.

---

## 4. Crédits et quotas

Chaque action IA consomme des crédits, comptabilisés par [Sekuu Platform](SEKUU.md) : analyse
d'image, génération de concept, assistant conversationnel, génération de variantes.

**Le quota voyage dans le jeton**, sous la clé `neftya_ai_analyses_max` du claim `limits`.
Billing publie la limite ; **Neftya compte ses analyses** — la plateforme ne saura jamais
mieux que lui ce qu'est une analyse d'image de meuble.

| Palier | `neftya_ai_analyses_max` |
|---|---|
| Free | 5 |
| Pro | 50 |
| Professional | 200 |

Valeurs à confirmer une fois le coût réel mesuré. Le principe est acté : sans plafond, une
analyse d'image et quelques échanges d'assistant peuvent dépasser la marge d'un abonnement.

**Les trois états valent ici aussi** (voir [SEKUU.md](SEKUU.md) §5) : clé absente signifie
« ce plan ne vend pas d'analyse d'image », pas « zéro autorisée ». Refuser dans ce cas
bloquerait tout client dont l'abonnement précède l'ajout de la clé au catalogue.

Les crédits consommés côté fournisseur restent comptabilisés par le module AI de la
plateforme ; ce quota-ci est celui que Neftya applique lui-même, avant d'appeler.

### Dégradation propre

**Quota atteint n'est pas un échec.** L'interface bascule vers les points d'entrée qui ne
consomment rien :

```text
Vous avez utilisé vos 5 analyses d'image de ce mois.

  → Partir d'un modèle          (toujours disponible)
  → Décrire le meuble           (toujours disponible)
  → Passer à Pro                (50 analyses / mois)
```

Le même repli s'applique quand **l'IA ne reconnaît pas le meuble** : le produit propose un
modèle proche plutôt que de renvoyer une erreur. Le moteur, lui, fonctionne sans IA — c'est
tout l'intérêt de n'en avoir fait qu'une couche d'assistance.

---

## 5. Point ouvert

- **Fiabilité de l'analyse d'image.** Aucun taux de réussite cible n'est défini, et il ne
  peut pas l'être sans données. Constituer un jeu d'évaluation d'images réelles — photos de
  magasin, captures Pinterest, photos d'atelier — est le préalable à tout engagement sur
  cette fonctionnalité. C'est aussi ce qui dira si elle mérite d'exister.
