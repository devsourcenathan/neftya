# Roadmap d'implémentation — V1

> Ce document décrit **comment** construire la V1 décrite dans [ROADMAP.md](ROADMAP.md).
> Il ne redéfinit pas le périmètre : il en ordonne la réalisation.
>
> Les durées supposent **un développeur à temps plein** et sont indicatives. Ce qui n'est
> pas indicatif, ce sont les critères de sortie : une phase n'est pas finie tant que le
> sien n'est pas vérifié.

---

## Pourquoi cet ordre

Cinq principes de séquencement, chacun tiré d'une leçon concrète.

**1. La CI avant la première fonctionnalité.** DealerOS a accumulé 3 463 problèmes de lint
et 620 erreurs d'analyse statique en vingt commits, parce que rien ne les bloquait. Le coût
de remise à zéro croît chaque semaine ; la volonté de le payer décroît.

**2. Le moteur d'abord, sans interface.** C'est le seul composant dont l'exactitude
conditionne tout le reste, et le seul qui se valide sans infrastructure. Un moteur faux
derrière une belle interface reste un produit faux — et l'interface aura coûté le temps
qu'on n'a pas mis à le vérifier.

**3. Le cloisonnement avant les fonctionnalités.** Sa régression ne se voit pas. Le test
d'isolation A/B s'écrit sur la première ressource persistée, pas sur la dixième.

**4. La cotation 2D en dernier.** C'est le poste identifié comme le plus susceptible de
déraper ([ROADMAP.md](ROADMAP.md)). Le placer en fin de parcours permet de le reporter sans
rien bloquer, plutôt que de le découvrir au milieu.

**5. La validation terrain est une phase, pas une conclusion.** Le critère de sortie de la
V1 est qu'un menuisier coupe et monte sans reprise. Ça se prépare, ça se planifie, et ça
peut renvoyer au moteur.

---

## Phase 0 — Socle · ~3 jours

**Objectif.** Un dépôt qui se déploie, vide, avec toutes les portes de qualité en place.

**Livrables**

- Monorepo : `apps/web`, `apps/api`, `packages/engine`, `packages/contracts`
- TypeScript `strict`, ESLint (`no-explicit-any` en erreur), Prettier
- Vitest configuré sur chaque paquet
- CI : format, lint, types, tests, build — voir [ENGINEERING.md](ENGINEERING.md) §9
- `locales/fr.json` et `en.json`, et le contrôle qui échoue sur une clé manquante, une
  dérive de parité ou un `t()` avec valeur par défaut
- Test d'architecture vérifiant les frontières du §3
- Un déploiement réel, même d'une page vide
- `docker compose` : PostgreSQL

**Critère de sortie**

> Un commit qui introduit un `any`, casse une frontière, ajoute un texte en dur ou échoue à
> compiler est **refusé par la CI**, et l'application vide est en ligne.

**Risque.** Faible. Le piège est d'y passer deux semaines à peaufiner l'outillage.

---

## Phase 1 — Le moteur, seul · ~2 à 3 semaines

**Objectif.** `packages/engine` calcule un meuble complet et juste. Aucune interface, aucune
API, aucune base.

**Livrables**

- Modèle de composants et paramètres de projet ([NEFTYA_ENGINE.md](NEFTYA_ENGINE.md) §3-4)
- Convention d'assemblage « côtés entre dessus et dessous »
- Propagation par étirement, ordre de calcul, répartition avec reste au dernier compartiment
- Tiroirs : caisson et façades pavantes
- Fond rainuré, chants listés, `grain` modélisé
- Validation technique : flèche des étagères
- Schémas zod dans `contracts`, types inférés

**Critère de sortie**

> L'invariant de recomposition passe sur **des milliers de configurations générées**, et le
> meuble de référence du §10 reproduit exactement le tableau de pièces documenté.

C'est aussi le moment de vérifier la contrainte des façades : chaque jeu doit tomber sur un
séparateur, sinon on voit à l'intérieur du meuble.

**Risque.** Moyen. C'est la phase où l'on découvre les règles manquantes — répartition en
hauteur de tiroirs superposés, épaisseur des pièces de tiroir. Elles sont listées au §11 du
document moteur ; les trancher au fil de l'eau et les consigner.

> **Ne pas commencer l'interface pendant cette phase.** La tentation est forte, parce qu'un
> moteur sans écran est peu gratifiant. Mais chaque règle changée ici invaliderait du code
> d'interface écrit trop tôt.

---

## Phase 2 — API, persistance et cloisonnement · ~2 semaines

**Objectif.** Un projet se crée, se lit, se modifie — pour la bonne organisation, et pour
elle seule.

Ces trois sujets vont ensemble : la tenancy conditionne chaque table, et la traiter après
coup signifie réécrire chaque requête.

**Livrables**

- API Node, enveloppe d'erreur de la plateforme, UUIDv7
- Migrations, modèle paramétrique en `jsonb`
- `apps/api/src/sekuu/` : `token-verifier`, `sekuu-context`, `current-tenant`,
  `permission-resolver` — voir [SEKUU.md](SEKUU.md) §11
- Vérification JWKS hors ligne, quatre contrôles
- `products` contient `neftya`, sinon 403
- Correspondance rôles Sekuu → droits Neftya
- Quota `neftya_projects_max`, avec les **trois états**
- Réglages Neftya de pays et de devise, nuls par défaut — voir [I18N.md](I18N.md) §3
- Recalcul serveur : ce qui est persisté ne vient jamais du client

**Critère de sortie**

> Le test d'isolation A/B passe sur les quatre verbes et les sous-ressources, et la liste de
> contrôle de [SEKUU.md](SEKUU.md) §10 est intégralement cochée.

**Risque.** Moyen. Le piège numéro un est documenté : un jeton frais ne porte pas
d'organisation tant que `switch-organization` n'a pas été appelé. Le connaître d'avance
économise une heure de débogage.

**État : livrée le 31 août 2026.** 78 tests verts, dont 34 sur l'API contre un PostgreSQL
réel. Le test d'isolation A/B couvre `GET`, `POST`, `PATCH`, `DELETE` et la sous-ressource
`/build`, et a été vérifié en retirant les gardes : six échecs, aucun silencieux.

Trois cases de [SEKUU.md](SEKUU.md) §10 restent ouvertes — enchaînement de
`switch-organization`, rafraîchissement sérialisé, clés d'API — parce qu'elles portent sur
le **client** de la plateforme, qui n'existe pas avant la phase 3. Rien ne pouvait les
fermer ici.

---

## Phase 3 — Interface, 3D, unités et langues · ~4 semaines

**Objectif.** Configurer un meuble et le voir changer en temps réel.

**Livrables**

- React 19, Vite, TanStack Router/Query, Tailwind, Radix
- Redirection vers le portail de la plateforme pour la connexion
- Bibliothèque de modèles prédéfinis — seul point d'entrée de la V1
- Mode conception : dimensions, structure, matériaux
- 3D Three.js via react-three-fiber, une pièce 3D = un composant du modèle
- Vue éclatée, sélection d'une pièce, affichage de ses cotes
- **Le moteur tourne dans le navigateur** : le glissement d'un curseur met à jour la 3D sans
  aller-retour réseau
- Couche d'unités : saisie et affichage métrique **et** impérial, fractions au 1/16"
- Interface française et anglaise, à parité

**Critère de sortie**

> Faire glisser la largeur de 1800 à 2200 met à jour la 3D et les cotes de façon fluide sur
> **un mobile d'entrée de gamme**, et la sélection d'une pièce affiche les mêmes cotes que
> celles calculées côté serveur.

Ce dernier point est la vérification que le même code tourne des deux côtés.

**Risque.** Moyen, et alourdi par l'impérial. La fluidité mobile est une réserve
explicitement assumée au moment du choix de Three.js ; c'est ici qu'elle se mesure. Si elle
ne passe pas, la réponse est de réduire le nombre d'objets rendus, pas de renoncer à
l'interaction.

> **Le piège de l'impérial.** L'aller-retour est lossy : 873 mm s'affiche `34 3/8"`, qui
> revaut 873,125 mm. La conversion d'affichage ne doit donc **jamais** réécrire dans le
> modèle, sinon ouvrir puis sauvegarder un projet le déforme un peu à chaque fois. Un test
> le vérifie : afficher puis relire ne change aucune cote.

---

## Phase 4 — Fabrication · ~2 à 3 semaines

**Objectif.** Sortir un plan de découpe utilisable.

**Livrables**

- Liste des pièces, identifiants stables partagés avec la 3D
- Nesting : placement guillotine, trait de scie réservé, formats configurables
- Liste des matériaux, métrage de chants
- Instructions d'assemblage portées par le modèle
- Export PDF (depuis le SVG) et CSV
- Storage Sekuu pour les exports, instantané figé à chaque export
- Taille de papier dérivée du pays (A4 / Letter), montants formatés par locale

**Critère de sortie**

> Le meuble de référence produit **exactement** le plan documenté au §2 de
> [MANUFACTURING.md](MANUFACTURING.md) : un panneau, 93,2 % d'utilisation, aucune pièce hors
> limites — et la somme des surfaces plus les traits de scie ne dépasse jamais le panneau.

**Risque.** Élevé sur le nesting. Le placement est écrit sur mesure, sans bibliothèque, et
c'est là que vivent les plans faux. Poser tôt un test qui vérifie l'absence de chevauchement
et le respect du trait de scie sur des configurations générées.

---

## Phase 5 — Cotation 2D · ~2 à 3 semaines

**Objectif.** Des plans techniques entièrement cotés.

**Livrables**

- Projection orthogonale depuis le modèle, rendue en SVG
- Vues face, arrière, dessus, dessous, latérale
- Chaînes de cotes, cotes intermédiaires
- Placement automatique évitant les collisions

**Critère de sortie**

> Sur vingt meubles de formes différentes, **aucune cote n'en chevauche une autre** et
> chaque pièce porte les cotes nécessaires à sa découpe.

**Risque. Le plus élevé du parcours.** Le placement de cotes sans chevauchement est un
problème d'optimisation à part entière.

> **Point de décision.** Si cette phase dépasse trois semaines, livrer la V1 avec une
> cotation simple — cotes hors-tout sur des lignes dédiées, plus le tableau des pièces — et
> reporter les chaînes de cotes. C'est la position de repli identifiée dès le départ, et
> elle ne bloque pas le critère de sortie de la V1 : on peut couper avec un tableau de cotes.

---

## Phase 6 — Validation terrain et mise en service · ~2 semaines

**Objectif.** Prouver le critère de sortie de la V1.

**Livrables**

- Trois meubles réels, conçus dans Neftya, découpés et montés par un menuisier
- Correction de ce que la découpe révèle
- Observabilité : journaux structurés, suivi des erreurs
- Sauvegarde et restauration documentées et **testées**
- Documentation d'exploitation

**Critère de sortie**

> **Un menuisier prend le plan généré par Neftya, coupe ses panneaux, et le meuble se monte
> sans reprise.** Trois fois, sur trois meubles différents.

**Risque.** C'est la phase qui peut renvoyer au moteur — et c'est son intérêt. Un écart
découvert ici vaut mieux que le même écart découvert par un client.

> Prévoir le menuisier **dès la phase 1**. Trouver quelqu'un qui accepte de couper des
> panneaux pour valider un logiciel prend plus de temps qu'on ne croit, et cette phase est
> inutile sans lui.

---

## Récapitulatif

| Phase | Objet | Durée | Risque |
|---|---|---|---|
| 0 | Socle et CI | ~3 j | Faible |
| 1 | Le moteur, seul | 2-3 sem. | Moyen |
| 2 | API, persistance, cloisonnement | 2 sem. | Moyen |
| 3 | Interface, 3D, unités et langues | 4 sem. | Moyen |
| 4 | Fabrication et nesting | 2-3 sem. | **Élevé** |
| 5 | Cotation 2D | 2-3 sem. | **Le plus élevé** |
| 6 | Validation terrain | 2 sem. | Révélateur |

**Environ 15 à 18 semaines**, hors imprévus — et il y en aura.

> L'internationalisation ajoute environ une semaine, concentrée en phase 3 : la saisie
> fractionnaire et l'affichage impérial sont un vrai travail, l'anglais beaucoup moins. Le
> reste — millimètres entiers dans le moteur, montants en unité mineure, locales
> externalisées — ne coûte rien **parce qu'il est fait dès le départ**. C'est précisément ce
> qui a coûté une journée de reprise sur DealerOS pour avoir été remis à plus tard.

---

## Ce qui n'est pas dans ce plan

Volontairement absents de la V1, et donc de cette roadmap : analyse d'image, assistant IA,
portes, positions de perçage, catalogue de quincaillerie, éditeur manuel, export DXF,
contrainte de sens du fil. Tout cela est en V2 ou V3 ([ROADMAP.md](ROADMAP.md)).

**Ne pas les commencer « puisqu'on y est ».** C'est exactement ainsi que DealerOS a livré,
dans un seul commit de 5 744 lignes, deux phases entières de roadmap que personne n'a pu
relire.

---

## Quand s'arrêter et replanifier

Trois signaux :

- **La phase 1 dépasse quatre semaines.** Les règles du moteur sont moins arrêtées qu'on ne
  le croyait ; il faut retourner à la spécification plutôt que continuer à coder.
- **Le nesting ne tient pas sur des cas réels.** Réduire l'ambition — accepter plus de chute
  — plutôt que poursuivre l'optimum.
- **Aucun menuisier n'est disponible pour la phase 6.** Le critère de sortie de la V1 devient
  invérifiable, et livrer sans lui serait livrer en espérant.
