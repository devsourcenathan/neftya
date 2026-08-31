# Standards d'ingénierie

> **Statut : OBLIGATOIRE.** Un changement qui ne respecte pas ces règles ne se fusionne pas.
> **Portée :** tout le dépôt — `apps/`, `packages/`, migrations, scripts, tests.

Ces règles ne sont pas génériques. Elles sont écrites à partir de ce qui a réellement mal
tourné sur DealerOS, produit du même écosystème et de la même équipe : 94 types réécrits à
la main entre le back et le front, aucune CI pendant vingt commits, quarante gardes de
cloisonnement copiées-collées dont une oubliée, un calcul de taxe en flottant, et une
numérotation de factures par `count() + 1` qui réutilisait un numéro après suppression.

Chacune des sections ci-dessous existe pour empêcher l'un de ces cas précis.

---

## 1. Ce qui vient de la plateforme

**Ne pas redéfinir ce que Sekuu Platform définit déjà.** En cas d'écart, c'est la plateforme
qui fait autorité.

| Sujet | Référence |
|---|---|
| Conventions d'API, URLs, pagination, dates | `Sekuu-Platform/docs/02-standards/api-guidelines.md` |
| Codes et enveloppe d'erreur | `Sekuu-Platform/docs/02-standards/error-codes.md` |
| Jetons, isolation, rotation de clés | `Sekuu-Platform/docs/02-standards/security.md` |
| Intégration produit | `.../identity/04-integrer-un-produit.md` |

Deux conséquences immédiates, que les documents Neftya ne portaient pas :

**Les identifiants sont des UUID.** « Les identifiants auto-incrémentés ne doivent jamais
être exposés » (api-guidelines §7). Neftya démarre sans historique : ce sera **UUIDv7**,
pour l'ordre temporel et la localité d'index. Le `bigint` de DealerOS est une dette héritée,
pas un précédent.

**L'enveloppe d'erreur est celle de la plateforme :**

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "…", "details": { "width_mm": ["…"] } },
  "meta": { "request_id": "req_8b94d7d0" }
}
```

---

## 2. La règle qui prime sur toutes les autres

**Le moteur est pur.**

```ts
// packages/engine
export function build(input: FurnitureInput): Furniture
```

Une fonction, des données en entrée, des données en sortie. Le moteur ne fait **aucune**
entrée-sortie : ni base, ni réseau, ni fichier, ni horloge, ni aléatoire.

C'est ce qui permet :

- de l'exécuter dans le navigateur pour l'interaction **et** sur le serveur pour ce qui fait
  foi, avec le même code ;
- de le tester sans infrastructure, donc de tester exhaustivement ce qui doit l'être ;
- de reproduire un bug à partir de la seule entrée, jointe au rapport.

`packages/engine` ne déclare **aucune** dépendance vers `apps/`. Un test d'architecture le
vérifie ; sans lui, la règle tiendra six semaines.

### Déterminisme

Même entrée, même sortie, toujours. Pas de `Date.now()`, pas de `Math.random()`, pas de
lecture d'environnement. Ce dont le moteur a besoin lui est passé en paramètre.

### Entiers

Toutes les cotes sont des **entiers en millimètres**. Les flottants sont interdits dans le
calcul des cotes comme des quantités de matière.

DealerOS a livré `(int) round($subtotal * ((float) $rate / 100))` pour une taxe : 8,20 % de
1000 y valait 81,99999999999999 avant arrondi. Ici, un taux se convertit en points de base
et tout reste entier.

Toute règle d'arrondi est **nommée et testée**. « Moitié à l'opposé de zéro » est un choix,
pas un détail d'implémentation.

---

## 3. Frontières

```text
apps/web      →  packages/contracts, packages/engine
apps/api      →  packages/contracts, packages/engine
packages/engine   →  rien
packages/contracts →  rien
```

Les flèches ne vont que dans un sens. `packages/engine` ignore jusqu'à l'existence d'une
organisation, d'un utilisateur ou d'une requête HTTP.

**Vérifié par un test d'architecture**, pas par la discipline. La discipline a tenu
trente-neuf fois sur quarante chez DealerOS, et la quarantième était une écriture
cross-tenant.

---

## 4. Contrats et types

**Un type métier est déclaré une fois, dans `packages/contracts`, et importé partout.**

C'est la règle la plus importante après la pureté du moteur. DealerOS porte 94 déclarations
de types réécrites à la main entre le back et le front, sans contrat généré, avec des
énumérations ayant trois sources de vérité — constante PHP, colonne `varchar`, union
TypeScript — qui ne se vérifiaient jamais les unes les autres. Un statut ajouté côté serveur
n'y cassait aucun build : il produisait un `undefined` à l'exécution.

- Les entrées d'API sont validées par un schéma **zod** défini dans `contracts`, et le type
  TypeScript en est **inféré**, jamais écrit à côté.
- Le schéma d'entrée du moteur est le même objet que celui qui valide la requête.
- Aucune énumération n'est dupliquée : elle vit dans `contracts` et la migration s'y réfère.

Si vous vous surprenez à écrire une `interface` qui décrit une réponse d'API, arrêtez-vous :
elle existe déjà.

---

## 5. TypeScript

1. `strict` activé, et jamais désactivé pour contourner une erreur.
2. **`any` est interdit.** Utiliser `unknown` et réduire explicitement.
3. `@ts-expect-error` toléré avec une explication et une date de retrait ; `@ts-ignore`
   jamais.
4. Valider toute entrée externe : HTTP, variables d'environnement, fichiers importés,
   réponses de la plateforme.
5. Préférer les unions discriminées aux booléens ambigus. `mode: 'stretch' | 'repeat'`
   plutôt que `shouldStretch: boolean`.
6. `const` et `readonly` par défaut. Le moteur ne mute jamais son entrée.
7. Les unités font partie du nom : `widthMm`, `kerfMm`, `amountMinor`. Un nombre sans unité
   dans ce domaine est un bug qui attend.

---

## 6. Données

1. **Toute table porte `organization_id`**, et sa valeur vient du jeton — jamais du corps de
   la requête, jamais d'un paramètre d'URL, jamais d'un en-tête.
2. **Aucune table `users`.** L'identité vit sur la plateforme.
3. Clés primaires en UUIDv7, dates en `timestamptz` UTC.
4. Le modèle paramétrique d'un projet est stocké en `jsonb` : c'est une structure qui évolue
   avec le moteur, pas un schéma relationnel. Les données **dérivées** — liste de pièces,
   plan de découpe — ne sont pas stockées, elles sont recalculées, sauf dans un instantané
   d'export, qui est figé par nature.
5. Les suppressions de données commerciales sont exceptionnelles : préférer un état ou un
   archivage traçable.

---

## 6 bis. Internationalisation

Les règles complètes sont dans [I18N.md](I18N.md). Trois sont assez structurantes pour
figurer parmi les standards :

1. **Le moteur ne connaît que le millimètre entier.** Toute conversion d'unité vit dans une
   couche d'affichage et **n'écrit jamais dans le modèle** : l'aller-retour impérial perd
   0,125 mm au 1/16", et une sauvegarde après affichage déformerait le projet.
2. **Aucun texte en dur, aucun `t()` avec valeur par défaut.** Le second argument est
   interdit : c'est ce qui a masqué 76 % de clés manquantes chez DealerOS. Une clé absente
   doit se voir.
3. **Aucun montant sans devise, aucune division par 100 supposée.** L'exposant vient de la
   table ISO 4217 — XOF et XAF en ont zéro. Le formatage passe par `Intl`, jamais par des
   séparateurs codés en dur.

Vérifié en CI dès la phase 0 : parité des locales, aucune clé inconnue appelée, aucun repli
textuel.

---

## 7. API

1. Contrôleur mince : il valide, il délègue, il sérialise. Aucune règle métier.
2. Une erreur attendue est un résultat typé ou une exception applicative portant un code
   stable ; une erreur inattendue est capturée au bord et tracée.
3. Ce qui est persisté ou exporté est **toujours recalculé côté serveur**. La liste de
   découpe envoyée par le client n'est jamais celle qu'on enregistre — c'est la règle que
   DealerOS applique aux prix, et elle vaut ici pour les cotes.
4. Les traitements longs — nesting d'un gros projet, génération PDF, appel d'IA — ne
   bloquent pas une réponse HTTP.

---

## 8. Tests

La forme de la pyramide est dictée par la nature du code, pas par une doctrine.

| Niveau | Cible | Pourquoi |
|---|---|---|
| **Unitaire, massif** | `packages/engine` | Fonctions pures : rapides, exhaustives, sans infrastructure |
| Intégration | `apps/api` | Persistance et cloisonnement, sur PostgreSQL réel |
| Bout en bout | Parcours critiques | Peu nombreux, coûteux, réservés à ce qui casse silencieusement |

### Les trois tests qui ne se négocient pas

**L'invariant de recomposition.** Pour toute configuration, la somme des pièces et des
épaisseurs égale la cote hors-tout, au millimètre. C'est la démonstration la plus directe que
le moteur est juste, et c'est un candidat naturel au test de propriété : générer des milliers
de configurations et vérifier l'invariant sur chacune.

**L'isolation A/B.** Un jeton de l'organisation A obtient `404` sur une ressource de B — sur
`GET`, `PATCH`, `DELETE` et les sous-ressources. À écrire **avant la première
fonctionnalité**, parce que sa régression ne se voit pas.

**Le test d'architecture.** Les frontières du §3 sont vérifiées automatiquement.

### Le reste

- Chaque correction de bug ajoute un test qui échoue avant elle.
- Les tests ne dépendent ni de l'ordre, ni du réseau, ni de l'heure réelle.
- Un test ignoré ou instable est un défaut à corriger, pas une condition de fusion.
- Les tests d'intégration tournent sur **PostgreSQL**, jamais sur un substitut. La suite de
  DealerOS était verte sur SQLite en mémoire alors que la production tourne sur PostgreSQL
  avec `jsonb` et des contraintes que SQLite ignore : 88 tests verts qui ne prouvaient rien
  sur la base cible.

---

## 9. Intégration continue

**La CI existe avant la première fonctionnalité.** Ce n'est pas une précaution de confort :
DealerOS a accumulé 3 463 problèmes de lint et 620 erreurs d'analyse statique en vingt
commits, précisément parce que rien ne les bloquait. Le coût de remise à zéro croît
linéairement, la volonté de la payer décroît.

Portes obligatoires sur chaque pull request :

| Contrôle | Outil |
|---|---|
| Format | Prettier |
| Lint | ESLint, `no-explicit-any` en erreur |
| Types | `tsc --noEmit` sur tout le monorepo |
| Tests | Vitest, avec un service PostgreSQL réel |
| Build | `vite build` |
| Architecture | Test de frontières |

Un pipeline rouge ne se fusionne pas et ne se contourne pas.

---

## 10. Git et revue

1. Commits petits et cohérents. Ne pas mélanger refactorisation et changement de
   comportement — un commit mécanique (formatage, renommage) est isolé des autres.
2. Le message dit **pourquoi**, pas quoi : le diff dit déjà quoi.
3. Jamais de poussée directe sur `main`.
4. Une décision structurante s'ajoute à [DECISIONS.md](DECISIONS.md), datée et motivée. On
   n'y réécrit jamais une entrée passée : on en ajoute une nouvelle.
5. Les changements touchant les cotes, le cloisonnement ou l'intégration Sekuu demandent une
   seconde lecture.

---

## 11. Les principes, appliqués

Ces acronymes sont une grille de relecture, pas une méthode de conception. Récités, ils
produisent de l'abstraction inutile ; appliqués à un cas précis, ils tranchent. Voici où ils
mordent réellement dans Neftya.

**DRY — ne pas se répéter.** Sa vraie application ici est `packages/contracts` : un type
métier déclaré une fois. C'est la règle qui évite les 94 doublons de DealerOS.

> **Le contre-emploi, plus fréquent que l'oubli.** Deux morceaux de code qui se ressemblent
> ne sont pas forcément la même chose. Factoriser le calcul d'une étagère et celui d'une
> façade parce qu'ils font tous deux une division produirait une abstraction que le premier
> changement de règle fera exploser. DRY porte sur la **connaissance**, pas sur les
> caractères.

**KISS — rester simple.** Trois décisions déjà prises en découlent : pas de bibliothèque de
nesting, pas de bibliothèque de CAO, pas de microservice. Et la question à se poser devant
toute abstraction : *est-ce que je résous un problème que j'ai, ou un problème que
j'imagine ?* Le système « Extension » de DealerOS — un interrupteur qui n'éteignait rien,
contrôlant deux fonctionnalités inexistantes — répond à la seconde.

**SOLID.** Deux lettres comptent vraiment ici :

- **S** — le moteur calcule, il ne persiste pas ; l'API persiste, elle ne calcule pas. Cette
  seule séparation porte l'essentiel de l'architecture.
- **D** — les dépendances pointent vers le moteur, et le moteur ne dépend de rien. C'est le
  §3, et c'est ce qui rend tout le reste testable.

**O** vaut d'être surveillée : ajouter un type de composant (une porte, un pied) ne doit pas
obliger à modifier le cœur de la propagation. Si c'est le cas, c'est le signe que le moteur
manque d'un point d'extension — pas qu'il faut ajouter un `if`.

**L** et **I** ne mordent guère dans un code fait de fonctions et de données plutôt que de
hiérarchies de classes. Les invoquer ici serait du décor.

**YAGNI.** La règle la plus rentable du lot, et la plus dure à tenir. Ne pas construire
maintenant ce qui est prévu pour une phase ultérieure. Chaque abstraction ajoutée « au cas
où » est un coût certain contre un bénéfice hypothétique.

---

## 12. Definition of Done

Un changement est terminé seulement si :

- [ ] il répond au besoin de la phase courante, sans fonctionnalité spéculative ;
- [ ] les frontières du §3 sont respectées et le test d'architecture passe ;
- [ ] aucun type métier n'a été redéclaré hors de `contracts` ;
- [ ] les cotes restent entières, les règles d'arrondi nommées et testées ;
- [ ] `organization_id` vient du jeton, et l'isolation est testée ;
- [ ] les tests pertinents existent et toute la suite est verte ;
- [ ] la documentation touchée est à jour, décision consignée si elle est structurante ;
- [ ] un humain comprend et assume chaque ligne, y compris celles générées par une IA.
