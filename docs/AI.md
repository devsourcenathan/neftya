# Intelligence artificielle

> L'IA est une **couche d'assistance**, pas le moteur du produit.

Elle propose, elle ne décide pas. Toute sortie de l'IA passe par le modèle paramétrique
([NEFTYA_ENGINE.md](NEFTYA_ENGINE.md)), qui reste seul responsable des cotes. Une
proposition de l'IA qui violerait les règles du moteur est corrigée par le moteur, pas
l'inverse.

L'accès aux modèles est fourni par [SEKUU Core](SEKUU.md) ; Neftya consomme le service et
ne gère ni clés, ni quotas, ni facturation.

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

## 4. Crédits et consommation

Chaque action IA consomme des crédits, comptabilisés par SEKUU Core : analyse d'image,
génération de concept, assistant conversationnel, génération de variantes.

---

## 5. Points ouverts

- **Fiabilité de l'analyse d'image.** Aucun taux de réussite cible n'est défini. Il faudrait
  un jeu d'évaluation d'images réelles avant de s'engager sur cette fonctionnalité.
- **Coût par projet.** Une analyse d'image plus quelques échanges d'assistant peuvent
  dépasser la marge d'un abonnement Free. Le plafond doit être défini avec le modèle
  économique.
- **Traitement des échecs.** Que se passe-t-il quand l'IA ne reconnaît pas le meuble ?
  Le repli vers le point d'entrée « modèle » doit être explicite dans l'interface.
