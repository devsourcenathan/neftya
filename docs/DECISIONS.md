# Journal des décisions

Chaque décision structurante est consignée ici avec sa date et son motif.

**Pourquoi ce fichier.** Une décision non écrite est re-discutée à chaque relecture, puis
ignorée. Une décision écrite mais non datée ne peut pas être révisée en connaissance de
cause. Quand une décision change, on ajoute une entrée — on ne réécrit pas l'ancienne.

---

## 2026-07-31 — Nom du produit et du moteur

**Décision.** Le produit s'appelle **Neftya**. Le moteur paramétrique s'appelle
**Neftya Engine**.

**Motif.** Le brief d'origine utilisait « Furniture Platform » et « Furniture Engine
(provisoirement) », sans lien avec le dépôt. « Neftya Core » a été écarté pour éviter la
confusion avec SEKUU Core, qui désigne l'infrastructure transverse dans le même écosystème.

---

## 2026-07-31 — Cible primaire de la V1 : menuisiers et artisans

**Décision.** Les menuisiers et artisans sont la cible primaire. Particuliers et ateliers
sont secondaires.

**Motif.** C'est le juge le plus exigeant sur la justesse des cotes, et c'est lui qui paie.
Il abandonne l'outil à la première cote fausse mais le recommande s'il gagne une heure par
devis. Satisfaire son exigence de précision donne le produit du particulier presque
gratuitement ; l'inverse n'est pas vrai.

**Conséquence.** Dans tout arbitrage, la précision des cotes prime sur la simplicité de
l'onboarding.

---

## 2026-07-31 — Propagation par étirement

**Décision.** Quand une dimension hors-tout change, le **nombre** de compartiments,
étagères, tiroirs et portes reste inchangé ; leurs **dimensions** varient.

**Motif.** Prévisibilité. L'utilisateur retrouve le meuble qu'il a conçu, en plus large.
L'alternative (adapter le nombre pour maintenir une largeur cible) est techniquement plus
sûre mais modifie la structure sous les pieds de l'utilisateur.

**Contrepartie assumée.** Un étirement peut produire une portée excessive. C'est la
validation technique qui alerte, sans décider à la place de l'utilisateur.

**Réversibilité.** Un mode `repeat` est prévu au modèle et pourra être exposé sans migration.

---

## 2026-07-31 — Convention d'assemblage : côtés entre dessus et dessous

**Décision.** Par défaut, le dessus et le dessous font toute la largeur ; les côtés se
logent entre eux.

**Motif.** Convention la plus courante en caisson mélaminé. La charge passe par les côtés.

**Réversibilité.** La convention alternative (`top_bottom_between_sides`) est prévue au
modèle, non exposée en V1.

---

## 2026-07-31 — Trait de scie : 3 mm par défaut, modifiable

**Décision.** `kerf_mm` vaut 3 par défaut et se règle par projet. Il intervient uniquement
dans l'optimisation des panneaux, jamais dans le calcul des cotes des pièces.

**Motif.** Le brief d'origine ne mentionnait pas le trait de scie ; tout plan de découpe
l'ignorant est faux, ce qui est éliminatoire pour la cible primaire. 3 mm correspond à une
scie à panneaux courante. L'artisan qui connaît sa lame ajuste ; le particulier obtient
malgré tout un plan juste.

---

## 2026-07-31 — Fond en retrait, rainuré

**Décision.** Le fond est un panneau de 8 mm logé dans une rainure de 4 mm, en retrait de
18 mm par rapport à l'arrière.

**Motif.** Rigidifie le caisson, finition propre, invisible de côté. C'est aussi ce que
supposait implicitement le brief d'origine (étagère à 382 mm pour une profondeur de 400).

**Contrepartie assumée.** Demande un usinage de rainure, moins accessible au bricoleur sans
défonceuse. À réévaluer si la cible particuliers devient prioritaire.

---

## 2026-07-31 — Chants listés, non déduits des cotes

**Décision.** Le métrage de chant figure dans la liste des matières ; les panneaux sont
découpés à la cote finie.

**Motif.** Un chant de 0,4 à 1 mm se rattrape au montage. Le déduire imposerait à chaque
pièce de porter ses faces chantées, pour un gain non mesurable à la scie.

**À revoir si.** Des chants épais (2 mm ABS) sont supportés.

---

## 2026-07-31 — Sens du fil modélisé mais non contraignant en V1

**Décision.** Chaque pièce porte un attribut `grain`. L'optimiseur V1 l'ignore et peut
pivoter librement les pièces.

**Motif.** Modéliser dès maintenant évite une migration de données en V2. Contraindre dès
la V1 complique nettement le nesting et augmente la chute, pour un bénéfice limité tant que
les modèles prédéfinis dominent.

**Conséquence.** Sur un décor bois, un plan V1 doit être relu avant découpe. À signaler dans
l'interface.

---

## 2026-07-31 — Restructuration de la documentation

**Décision.** Le README de 1061 lignes est éclaté en dix documents thématiques dans `docs/`,
et le README devient un point d'entrée court.

**Motif.** Le document mélangeait vision produit, spécification technique et roadmap, ce qui
rendait invisible le fait que le cœur technique — le moteur paramétrique — n'était pas
spécifié. La séparation rend cette lacune apparente et adressable.

---

## 2026-07-31 — Perçages hors V1

**Décision.** Le moteur produit les cotes de découpe, pas les positions de perçage. Les
perçages arrivent en V2, avec le catalogue de quincaillerie.

**Motif.** Les positions dépendent de la quincaillerie choisie ; les livrer imposerait de
construire le catalogue avant tout MVP. Neftya reste en V1 un outil de préparation :
l'artisan sait où percer.

**Conséquence.** Un atelier équipé CN ne peut pas encore exploiter la sortie.

---

## 2026-07-31 — Tiroirs dans le périmètre V1

**Décision.** Les tiroirs font partie du MVP, avec un paramètre `drawer_side_clearance_mm`
(défaut 13 mm) plutôt qu'un catalogue de coulisses.

**Motif.** Décision du propriétaire, contre la recommandation initiale de les reporter. Un
meuble TV sans tiroir couvre mal le besoin réel de la cible primaire.

**Conséquence assumée.** Le MVP s'élargit et le critère de sortie s'éloigne. Combiné au
report des perçages, cela signifie que le moteur donne la profondeur utile du tiroir mais
ne positionne pas les coulisses : l'artisan le fait.

---

## 2026-07-31 — Tiroir : façade rapportée

**Décision.** Le tiroir est un caisson de quatre côtés et un fond rainuré, sur lequel se
visse une façade indépendante.

**Motif.** La façade se règle après montage, ce qui rattrape un caisson légèrement hors
d'équerre. Une façade intégrée économise une pièce mais interdit tout réglage.

---

## 2026-07-31 — Portes hors V1, puis recouvrement total

**Décision.** Pas de portes dans le MVP. À leur arrivée : recouvrement total, jeu de 3 mm
entre façades.

**Motif.** Le recouvrement total est tolérant — un écart d'un millimètre ne se voit pas —
là où une porte encastrée révèle le moindre défaut d'équerrage.

---

## 2026-07-31 — La hauteur saisie est celle du caisson

**Décision.** Les pieds s'ajoutent sous le caisson. La hauteur au sol est affichée mais
n'entre dans aucun calcul de découpe.

**Motif.** Changer de pieds ne doit pas recouper tous les côtés.

---

## 2026-07-31 — Formats de panneaux éditables par organisation

**Décision.** Trois formats par défaut (2440 × 1220, 2800 × 2070, 3050 × 1220), complétés
par chaque organisation. L'optimiseur retient le plus économique parmi ceux déclarés.

**Motif.** 2440 × 1220 est courant sans être universel. Un catalogue régional supposerait
de collecter et maintenir des données pays par pays, pour un bénéfice que l'édition libre
apporte déjà.

---

## 2026-07-31 — Tolérance zéro sur la recomposition

**Décision.** La somme des pièces et des épaisseurs égale la cote hors-tout, au millimètre.
Le reste d'une division va au dernier compartiment. Aucune cote à virgule.

**Motif.** C'est un invariant vérifiable par test, et c'est la démonstration la plus directe
que le moteur est juste. Une marge « pour absorber les arrondis » rendrait le test incapable
de distinguer un arrondi d'un vrai bug.

---

## 2026-07-31 — Export CSV en V1, DXF en V2

**Décision.** La V1 exporte PDF et CSV. Le DXF attend la V2.

**Motif.** Le CSV est trivial à produire et déjà exploitable par beaucoup de scies à
panneaux et d'optimiseurs tiers. Un DXF sans positions de perçage ne contient que des
contours et n'apporte guère plus.

---

## 2026-07-31 — Séquence d'assemblage portée par le modèle

**Décision.** Chaque modèle prédéfini embarque son ordre de montage. Le moteur n'y injecte
que les cotes et les identifiants.

**Motif.** Le MVP n'ayant que les modèles comme point d'entrée, cela couvre tous les cas
sans écrire d'algorithme d'ordonnancement — problème qui devient réellement difficile avec
des tiroirs.

**À revoir en V3**, avec l'éditeur manuel : un meuble construit pièce à pièce n'a pas de
séquence pré-rédigée.

---

## 2026-07-31 — Instantané figé à chaque export

**Décision.** Le projet reste vivant ; chaque export (devis, plans, découpe) fige une copie
immuable.

**Motif.** Répond au besoin réel — retrouver le devis tel qu'il a été envoyé — sans
construire un historique complet des modifications, qui serait un chantier à part entière
et un coût de stockage récurrent.

---

## 2026-07-31 — Le devis passe dans le palier Pro

**Décision.** Pro devient l'outil métier complet pour un utilisateur, devis et exports
techniques compris. Professional ne vend plus que le collectif.

**Motif.** La cible primaire est l'artisan seul. Lui refuser le devis reviendrait à lui
refuser la raison même d'utiliser Neftya, et le palier Pro serait un entre-deux sans
acheteur.

---

## 2026-07-31 — Monolithe modulaire, moteur en paquet isolé

**Décision.** Une application, et `packages/engine` sans aucune dépendance au framework.

**Motif.** L'isolation du moteur est la seule contrainte ferme ; un paquet suffit à
l'obtenir. Un service séparé ajouterait déploiement, latence et débogage sans bénéfice à
cette échelle, et l'extraction reste possible plus tard.

---

## 2026-07-31 — Rendu 3D WebGL côté navigateur

**Décision.** Bibliothèque généraliste légère (Three.js, avec react-three-fiber si React).

**Motif.** Géométrie orthogonale, quelques dizaines de boîtes : un moteur CAO serait
disproportionné, un rendu serveur supprimerait l'interactivité.

**Réserve.** Choix fait avant toute mesure. À vérifier tôt : la fluidité sur un mobile
d'entrée de gamme, la cible artisan consultant souvent en atelier.

---

## 2026-07-31 — Cotation complète des plans 2D dès la V1

**Décision.** Chaînes de cotes, cotes intermédiaires et placement automatique évitant les
collisions, dès le MVP.

**Motif.** Décision du propriétaire, contre la recommandation initiale d'une cotation
simple. Un artisan attend un plan coté, pas un tableau de dimensions.

**Conséquence assumée.** C'est le poste le plus susceptible de repousser le critère de
sortie de la V1 : le placement de cotes sans chevauchement est un problème d'optimisation à
part entière. Premier candidat au report si le planning dérape.

---

## 2026-07-31 — Quotas IA par palier

**Décision.** 5 analyses d'image par mois en Free, 50 en Pro, 200 en Professional. Portés
et appliqués par SEKUU Core. Valeurs à confirmer une fois le coût réel mesuré.

**Motif.** Sans plafond, une analyse d'image et quelques échanges d'assistant peuvent
dépasser la marge d'un abonnement.

**Corollaire.** Quota atteint n'est pas un échec : l'interface bascule vers les points
d'entrée gratuits (modèle, description). Le même repli s'applique quand l'IA ne reconnaît
pas le meuble.

---

## 2026-07-31 — La marketplace sort de la roadmap

**Décision.** La roadmap s'arrête à V3. La marketplace devient une « piste long terme »,
clairement séparée.

**Motif.** Ce n'est pas une évolution du produit mais un autre métier : autre modèle
économique, et un amorçage qui exige l'offre et la demande simultanément. La numéroter
« V4 » laissait croire à une suite naturelle et aplatissait ce risque.

---

## 2026-07-31 — Neftya est un produit, pas un module de la plateforme

**Décision.** Neftya vit dans son propre dépôt, avec sa propre base, et consomme Sekuu
Platform par ses API. Il n'est pas un module de `Sekuu-Platform/Modules/`.

**Motif.** L'architecture de la plateforme le dit déjà : « la plateforme est mono-base,
l'écosystème est multi-base ; un produit n'accède jamais à la base de la plateforme —
uniquement à leurs API » (`architecture.md` §10.1). `Modules/` ne contient que des services
génériques ; un module « meubles » y serait le premier à porter des données métier.

Trois raisons propres à Neftya s'y ajoutent. Le **profil de charge** — nesting, cotation,
rendu 3D — n'a rien de commun avec de l'authentification, et ADR-0001 acte qu'un monolithe
modulaire monte en charge globalement. Le **rythme de livraison** : « un déploiement affecte
tous les modules ». Et l'**isolation du moteur**, qui doit rester testable seul dans
`packages/engine` ; enfoui dans un module Laravel, il ne l'est plus.

**Conséquence.** Neftya suit le modèle « produit maison » documenté par
`identity/04-integrer-un-produit.md`, dont DealerOS est l'implémentation de référence.

---

## 2026-07-31 — Aucune table `users` dans Neftya

**Décision.** L'identité, les organisations, les membres et les rôles vivent sur la
plateforme. Neftya lit le jeton et ne stocke aucun utilisateur.

**Motif.** C'est la première règle du guide d'intégration. Une copie diverge : un email
changé chez Sekuu ne l'est plus chez Neftya, et le jour d'une demande d'effacement personne
ne sait que la donnée existe.

**Conséquence.** `organization_id` vient du jeton, jamais de la requête. Si des préférences
propres au produit deviennent nécessaires, une table porte le `sub` comme clé étrangère
logique et rien d'autre de l'utilisateur.

---

## 2026-07-31 — Correction : les rôles inventés dans SEKUU.md

**Décision.** Les rôles `designer`, `carpenter` et `viewer` sont retirés. Sekuu n'en connaît
que quatre : `owner`, `admin`, `billing_manager`, `member`. Neftya établit sa propre
correspondance rôle → droit.

**Motif.** La première version de `SEKUU.md` a été écrite avant lecture de la plateforme et
inventait des rôles qui n'existent pas. Le besoin métier reste valable — un menuisier
salarié doit voir le plan de découpe sans voir les marges — mais il se traduit par une
constante chez Neftya, pas par un rôle de plateforme.

**Corollaire.** Les `scopes` de Sekuu (`organization.manage`, `users.invite`…) ne sont
jamais réutilisés pour les droits de Neftya : le jour où la plateforme en ajoute un,
l'autorisation de Neftya changerait sans que personne ne l'ait décidé.

---

## 2026-07-31 — Les plans appartiennent à Billing

**Décision.** Free, Pro et Professional sont un catalogue de plans côté plateforme. Neftya
ne lit que `products` (a-t-il droit à Neftya ?) et `limits` (quels plafonds ?).

**Motif.** Neftya ne facture pas et ne doit connaître ni plan, ni facture, ni échéance. La
première version du brief décrivait les paliers comme s'il les portait.

**Conséquence.** Le multi-utilisateur de Professional n'est pas une fonctionnalité de
Neftya : c'est la clé `members` qui passe de 1 à illimité côté plateforme.

---

## 2026-07-31 — Quotas exprimés en clés `limits` préfixées

**Décision.** `neftya_projects_max` et `neftya_ai_analyses_max`. Jamais `projects_max`.
`members` n'est pas redéclaré.

**Motif.** « Projet » ne veut pas dire la même chose d'un produit à l'autre, et une clé
partagée plafonnerait deux ressources différentes avec le même nombre. La plateforme nomme
déjà les utilisateurs d'une organisation.

**Règle des trois états.** Clé absente signifie « ce plan ne couvre pas cette ressource »,
et non « zéro autorisé » ; `null` signifie illimité. Confondre les deux premiers bloquerait,
le jour de l'ajout d'une clé au catalogue, tous les clients existants.

**Latence.** Les limites sont figées sur l'abonnement à l'ouverture de chaque période
(ADR-0019) : une hausse s'applique tout de suite, une baisse au renouvellement.

---

## 2026-07-31 — Connexion par le portail de la plateforme

**Décision.** Neftya redirige vers `/login`, `/register`, `/organizations/new` et
`/subscribe?product=neftya` de la plateforme. Il n'héberge pas d'écran de connexion.

**Motif.** Un produit qui affiche un champ de mot de passe voit passer un mot de passe.
C'est techniquement acceptable entre produits du même éditeur, mais inutile : le portail
rend la main avec la session déjà posée.

**Conséquence.** L'origine de Neftya doit figurer dans `SEKUU_ALLOWED_ORIGINS`. Et comme il
n'existe pas encore de flux délégué « Se connecter avec Sekuu », l'appel de connexion reste
isolé dans un seul module du code, pour basculer sans douleur le jour où il existera.

---

## 2026-07-31 — L'intégration tient dans un seul répertoire

**Décision.** Tout ce qui parle à la plateforme vit dans `Sekuu/` : `TokenVerifier`,
`SekuuContext`, `CurrentTenant`, `PermissionResolver`, `FileStore`, `Notifier`, `Composer`.

**Motif.** Le jour où la plateforme renomme un claim, ajoute un scope ou ouvre un flux
délégué, un seul dossier change. C'est la structure de DealerOS, à copier plutôt qu'à
réinventer.

**Corollaire.** Le moteur ne connaît pas Sekuu du tout — il ignore jusqu'à la notion
d'organisation. Il reçoit des paramètres et rend des cotes.

---

## 2026-07-31 — Le moteur est en TypeScript

**Décision.** Neftya Engine est écrit en TypeScript et s'exécute dans le navigateur pour
l'interaction, sur le serveur pour ce qui fait foi.

**Motif.** C'est une conséquence du Single Source of Truth, pas une préférence de langage.
Le moteur est appelé à chaque changement de paramètre : faire glisser la largeur doit mettre
à jour la 3D, les cotes et la liste de pièces en continu. Un moteur qui ne tourne pas dans
le navigateur ne laisse que deux issues, mauvaises toutes les deux — un aller-retour réseau
par mouvement de curseur, inutilisable sur le mobile d'un artisan en atelier ; ou une
approximation JavaScript pour l'aperçu, c'est-à-dire deux implémentations des mêmes règles.
Le jour où elles divergent d'un millimètre, personne ne le voit avant la scie.

**Corollaire.** La liste de découpe persistée ou exportée est toujours celle calculée par le
serveur, jamais celle envoyée par le client. C'est la règle que DealerOS applique déjà aux
prix.

---

## 2026-07-31 — TypeScript de bout en bout, plutôt que Laravel

**Décision.** L'API est également en TypeScript. Monorepo `apps/web`, `apps/api`,
`packages/engine`, `packages/contracts`. PostgreSQL, React 19, Vite, TanStack, Tailwind,
Radix, zod, Three.js via react-three-fiber, Vitest.

**Motif.** Le moteur étant en TypeScript, une API en PHP imposerait un pont — un processus
Node appelé par Laravel — et deux exécutions à déployer. Surtout, le type du moteur devient
celui de l'API et celui de l'interface : l'audit de DealerOS a trouvé 94 types réécrits à la
main entre backend et frontend, sans contrat généré, et des énumérations à trois sources de
vérité qui ne se vérifiaient pas. Cette classe de bug disparaît.

**Coût assumé.** Un second écosystème à côté du PHP de Sekuu Platform et de DealerOS, pour
un développeur seul. La couche d'intégration Sekuu doit être réécrite en TypeScript — courte,
le contrat étant documenté, mais réelle. De DealerOS se copie le **découpage**, pas le code.

**Alternative écartée.** Laravel pour l'API avec le moteur en paquet TypeScript, invoqué par
un processus Node pour les sorties qui font foi. Défendable si l'aisance en PHP avait été la
contrainte dominante ; elle ne l'est pas. Le moteur serait resté en TypeScript dans les deux
cas.

---

## 2026-07-31 — Ce qu'on n'ajoute pas comme dépendance

**Décision.** Pas de bibliothèque de nesting, pas de bibliothèque de CAO, et le PDF est
généré depuis le SVG et non depuis du HTML.

**Motif.** Le nesting de Neftya a des contraintes que les bibliothèques généralistes ne
modélisent pas : coupes guillotine, trait de scie réservé, sens du fil en V2. Elles font du
placement irrégulier, dont Neftya n'a pas besoin. C'est quelques centaines de lignes, et
elles doivent être maîtrisées — c'est là que vivent les plans faux.

Les plans 2D sont des projections orthogonales de boîtes alignées sur les axes : générer le
SVG directement est plus simple qu'une bibliothèque de CAO, et donne l'export SVG sans
travail supplémentaire. Un plan technique coté étant un dessin vectoriel, le faire transiter
par une mise en page HTML/CSS reviendrait à lutter contre le moteur de rendu à chaque cote.

---

## 2026-07-31 — Standards d'ingénierie tirés de l'audit DealerOS

**Décision.** [ENGINEERING.md](ENGINEERING.md) est obligatoire, et ses règles sont écrites à
partir de défauts réels constatés sur DealerOS plutôt que d'une liste de bonnes pratiques
génériques.

**Motif.** Un standard générique se lit une fois et ne change aucun comportement. Chaque
section d'ENGINEERING.md existe pour empêcher un cas précis : les 94 types dupliqués
justifient `packages/contracts` ; l'absence de CI pendant vingt commits justifie la CI en
phase 0 ; les quarante gardes copiées-collées justifient le test d'architecture ; le calcul
de taxe en flottant justifie la règle des entiers ; la suite verte sur SQLite alors que la
production tourne sur PostgreSQL justifie les tests d'intégration sur la base cible.

**Sur DRY, KISS et SOLID.** Ils figurent au §11, mais appliqués à des cas de Neftya et
assortis de leurs contre-emplois — notamment le fait que DRY porte sur la connaissance et
non sur les caractères, et que factoriser deux calculs qui se ressemblent sans être la même
chose produit une abstraction que le premier changement de règle fait exploser. Les réciter
sans les situer n'aurait servi à rien.

**Deux règles reprises de la plateforme**, que les documents Neftya ne portaient pas :
identifiants en UUID — ce sera UUIDv7, Neftya n'ayant aucun historique, là où le `bigint` de
DealerOS est une dette héritée — et l'enveloppe d'erreur `{ success, error, meta }`.

---

## 2026-07-31 — Ordre d'implémentation de la V1

**Décision.** Sept phases : socle et CI, moteur seul, API et cloisonnement, interface et 3D,
fabrication, cotation 2D, validation terrain. Voir
[IMPLEMENTATION.md](IMPLEMENTATION.md).

**Motif.** L'ordre porte plus de valeur que le contenu. La CI précède la première
fonctionnalité parce que la dette de qualité ne se rattrape pas. Le moteur se construit sans
interface parce qu'il est le seul composant dont l'exactitude conditionne tout le reste et
le seul qui se valide sans infrastructure. Le cloisonnement arrive avec la première
ressource persistée parce que sa régression est invisible. La cotation 2D est en dernier
parce qu'elle est le risque planning identifié, et qu'en fin de parcours elle se reporte sans
rien bloquer.

**Position de repli documentée.** Si la cotation dépasse trois semaines, la V1 sort avec une
cotation simple. On peut couper avec un tableau de cotes ; le critère de sortie n'en dépend
pas.

**Contrainte souvent oubliée.** Le menuisier de la phase 6 doit être trouvé dès la phase 1.
Sans lui, le critère de sortie de la V1 est invérifiable.

---

## 2026-07-31 — L'internationalisation est prise en compte dès la base

**Décision.** Langue, pays, devise et unités sont traités dès la V1, et documentés dans
[I18N.md](I18N.md).

**Motif.** Aucun de ces sujets ne se rattrape. DealerOS a livré 428 clés appelées pour 96
définies, 513 textes français en dur, et un formateur monétaire imposant la virgule décimale
et l'espace comme séparateur — correct en français, faux partout ailleurs. La reprise a coûté
une journée pour un produit encore jeune.

**Distinction structurante.** L'internationalisation a deux moitiés de nature différente :
l'**interface**, où une erreur produit un texte moche, et le **domaine** — unités,
épaisseurs, formats de panneaux, taille de papier — où une erreur produit une cote fausse et
un panneau perdu. C'est la seconde qu'on oublie.

---

## 2026-07-31 — Pays et devise portés par Neftya

**Décision.** Neftya porte ses propres réglages de pays et de devise, saisis par
l'utilisateur.

**Motif.** La plateforme détient `organizations.country` et `organizations.currency` mais ne
les publie ni dans le jeton ni dans le payload `/organizations`, qui ne rend que `id`,
`name`, `slug` et `roles`. Attendre une évolution de la plateforme bloquerait Neftya.

**Duplication assumée**, contre la recommandation initiale et contre le guide d'intégration.
Trois garde-fous : le réglage est présenté comme un réglage Neftya et non comme le pays de
l'organisation Sekuu — les deux peuvent légitimement différer, un atelier enregistré en
France pouvant travailler au Cameroun ; il n'est jamais renvoyé à la plateforme ; et le jour
où Sekuu les expose, ils deviennent la valeur par défaut, le réglage Neftya restant un
remplacement explicite. Un champ nul signifie « suivre la plateforme », donc aucune migration.

---

## 2026-07-31 — Métrique et impérial dès la V1

**Décision.** Les deux systèmes d'unités sont proposés dans la V1, avec saisie fractionnaire
et affichage au 1/16".

**Motif.** Décision du propriétaire, contre la recommandation de n'ouvrir que l'architecture
et de reporter l'affichage impérial.

**Ce qui ne change pas.** Le moteur calcule en **millimètres entiers, toujours**. Les unités
sont exclusivement une affaire d'affichage et de saisie, isolées dans une couche dédiée.

**Trois conséquences chiffrées, à ne pas perdre de vue.**

L'impérial n'est pas le métrique arrondi : 3/4" vaut 19,05 mm et non 18, et un panneau
4' × 8' mesure 2438,4 × 1219,2 et non 2440 × 1220. Les catalogues d'épaisseurs et de formats
sont donc **distincts par système**, jamais convertis à la volée — un côté de 3/4" traité
comme 18 mm décale chaque cote intérieure du caisson.

L'aller-retour d'affichage est **lossy** : 873 mm s'affiche `34 3/8"`, qui revaut 873,125 mm.
La conversion d'affichage ne doit donc jamais réécrire dans le modèle, sous peine de déformer
un projet à chaque ouverture-sauvegarde.

**Conséquence sur le planning.** Environ une semaine, concentrée en phase 3. C'est le
troisième élargissement du MVP après les tiroirs et la cotation complète ; l'ordre de report
est documenté dans [ROADMAP.md](ROADMAP.md).

---

## 2026-07-31 — Français et anglais dès la V1, données traduites en base

**Décision.** Interface en français et anglais, à parité vérifiée en CI. Les noms de modèles,
matériaux et catégories sont traduits en base, en `jsonb` par locale, avec repli sur le
français.

**Motif du `jsonb`.** Ces noms sont de la donnée, pas des chaînes d'interface : une
organisation créera un jour ses propres modèles, qu'aucun fichier de locale ne connaîtra. Des
clés de locale bloqueraient cette évolution dès la V3.

**Règle non négociable.** Aucun `t()` avec valeur par défaut. Le second argument est ce qui a
masqué 76 % de clés manquantes chez DealerOS pendant des mois : une clé absente doit se voir.
Le contrôle est en CI dès la phase 0.

---

## 2026-07-31 — Phase 0 : le moteur dépend de zod, `contracts` dépend du moteur

**Décision.** Les frontières effectives sont :

```text
apps/*              →  packages/contracts, packages/engine
packages/contracts  →  packages/engine
packages/engine     →  zod, et rien d'autre
```

**Motif.** L'implémentation a révélé une incohérence des documents, qui affirmaient à la
fois que `contracts` ne dépend de rien et que le schéma d'entrée du moteur y est défini.
Les deux ne peuvent pas être vrais.

Le moteur est la source des types du domaine ; `contracts` s'appuie dessus pour ajouter ce
qui n'appartient qu'à l'API. L'inverse ferait vivre la connaissance métier hors du
composant qui la met en œuvre.

`zod` reste la seule dépendance du moteur : c'est de la validation, pas une entrée-sortie,
et la garder auprès du calcul empêche le schéma et la règle de dériver. Un test
d'architecture vérifie qu'aucune autre dépendance n'apparaît.

---

## 2026-07-31 — Les contrôles de la phase 0 sont vérifiés par l'échec

**Décision.** Le test d'architecture et le contrôle i18n ont été validés en y introduisant
volontairement des violations, avant d'être considérés comme faits.

**Motif.** Un contrôle qui ne se trompe jamais peut simplement ne rien tester. Sur DealerOS,
un test « couvrait » le passage brut de `model_type` sans rien contrôler, et un autre
institutionnalisait la porte dérobée `id === 1` au lieu de la détecter.

**Vérifié.** Le contrôle i18n détecte les quatre cas — dérive de parité, clé inconnue,
`t()` avec valeur par défaut, texte en dur dans du JSX. Le test d'architecture détecte
l'import interdit, la dépendance non autorisée et la lecture d'horloge dans le moteur.

---

## 2026-07-31 — Le jeu entre façades est centré sur son séparateur

**Décision.** La position des façades se déduit du centre des séparateurs, et non d'une
division uniforme de la largeur.

**Motif.** La règle documentée jusqu'ici — `(L − (n−1) × jeu) / n` — donne des façades
égales, ce qui est plus joli, mais ignore la position réelle des séparateurs. Les
configurations générées de la phase 1 l'ont mise en défaut sur 478 cas sur 3 000 : sur
400 mm, 4 compartiments et des panneaux de 8 mm, le jeu commence 1 mm avant le séparateur,
et l'on voit à l'intérieur du meuble.

**Conséquence assumée.** Les façades d'extrémité sont plus larges que les intérieures, de
l'épaisseur d'un côté — 602 / 591 / 601 au lieu de 598 / 598 / 598 sur le meuble de
référence. C'est ce que fait un recouvrement total sur un vrai meuble : la façade
d'extrémité couvre le côté du caisson.

**Ce que ça change de principe.** La contrainte passe de « vérifiée après coup » à
« impossible par construction ». Le contrôle reste en place, mais ne devrait plus jamais
se déclencher.

---

## 2026-07-31 — Un tiroir qui ne rentre pas n'est pas produit

**Décision.** Quand un compartiment est trop étroit, trop peu profond ou trop bas pour le
tiroir demandé, le moteur n'émet aucune pièce et signale `DRAWER_DOES_NOT_FIT`.

**Motif.** Trouvé par les configurations générées : un compartiment de 45 mm avec 13 mm de
jeu par côté et des panneaux de 22 mm produisait un devant de tiroir de −23 mm. Une cote
négative dans une liste de découpe est un plan faux, et rien ne l'aurait signalé au
menuisier.

**Alternative écartée.** Réduire silencieusement les jeux pour faire tenir le tiroir : le
tiroir ne coulisserait pas, et le produit aurait menti.

---

## 2026-07-31 — Les pièces identiques sont groupées, les positions sont des instances

**Décision.** Une `Part` porte des cotes et une quantité ; ses `instances` portent les
positions. Deux côtés identiques sont **une** pièce `P03` en quantité 2, à deux endroits.

**Motif.** Le §3 du document moteur demandait à la fois une position et une quantité sur
le même objet, ce qui ne peut pas tenir : deux côtés identiques n'ont pas la même position.
Le regroupement résout les deux besoins — la liste de découpe lit les cotes et la quantité,
la 3D lit les instances, et chaque objet 3D porte l'identifiant que le menuisier lira sur
son plan.

**Corollaire.** Les cotes de découpe sont normalisées, plus grande dimension d'abord. Une
façade de 598 × 600 se découpe en 600 × 598 ; son orientation réelle reste dans son
instance.

---

## 2026-08-31 — Le cloisonnement vit dans le dépôt, pas dans les routes

**Décision.** Chaque méthode de `ProjectRepository` prend `organizationId` en premier
paramètre et l'applique elle-même. Une route ne peut pas lire un projet sans dire pour
quelle organisation, et `organizationId` ne s'obtient que par `sekuuOf(request)`, donc du
jeton.

**Motif.** DealerOS répétait la garde de cloisonnement dans ses contrôleurs, une quarantaine
de fois. Il en manquait une, et c'était la faille. Une garde qu'il faut penser à écrire est
une garde qu'on finit par oublier une fois.

**Vérifié en le cassant.** Retirer le filtre de `find`, `update` et `softDelete` fait échouer
cinq tests d'isolation ; le retirer de `list` en fait échouer un autre. Une garde dont la
suppression ne casse rien ne prouve rien.

---

## 2026-08-31 — Un identifiant mal formé répond 404, comme un identifiant inconnu

**Décision.** `/v1/projects/pas-un-uuid` et `/v1/projects/<uuid inexistant>` rendent tous
deux `404`. Un projet d'une autre organisation aussi.

**Motif.** Le `404` sur ressource d'autrui existe pour qu'on ne puisse pas savoir ce qui
existe. Répondre `422` sur un identifiant mal formé rouvre le même oracle par la porte
d'à côté : qui essaie des identifiants apprend au moins lesquels sont bien formés, puis
lesquels existent.

---

## 2026-08-31 — Les migrations sont du SQL, appliquées par nom de fichier

**Décision.** `apps/api/src/db/migrations/*.sql`, jouées dans l'ordre alphabétique, chacune
dans une transaction, enregistrées dans `schema_migrations`.

**Motif.** Lire le dépôt doit suffire à savoir ce que contient la base. Une migration
générée par différence entre un schéma déclaré et l'état courant fait dépendre le DDL d'un
outil, et rend illisible ce qui a réellement été appliqué.

**Corollaire.** Le schéma Kysely (`db/schema.ts`) est un miroir typé du DDL, pas sa source.
Les deux divergeant, c'est le SQL qui a raison — et la CI, qui tourne sur une base vierge,
le remarque.

---

## 2026-08-31 — PostgreSQL de développement sur le port 5442

**Décision.** `docker-compose.yml` expose la base sur `5442` côté hôte ; la CI, qui n'a rien
qui écoute, garde `5432`.

**Motif.** Un PostgreSQL installé sur la machine occupait déjà `5432`, et `5433` était pris
par un autre projet. L'erreur qui en résulte — « échec d'authentification pour l'utilisateur
neftya » — désigne la mauvaise cause : on cherche un mot de passe alors qu'on parle au
mauvais serveur. Le port par défaut du banc d'essai suit `docker compose`, pas la CI.

---

## 2026-08-31 — Les unités sont un paquet, hors du moteur

**Décision.** `packages/units` porte la conversion et le formatage ; il dépend du moteur,
et le test d'architecture interdit l'inverse.

**Motif.** Le moteur calcule en millimètres entiers, toujours. Laisser entrer une notion de
pouce fractionnaire dans le même paquet suffit à ce que quelqu'un l'utilise un jour dans un
calcul, et l'invariant de recomposition tombe. La frontière est vérifiée, pas recommandée.

**Corollaire.** L'API pourra s'en servir pour les exports imprimés sans dépendre de
l'interface.

---

## 2026-08-31 — Le seuil d'alerte d'arrondi impérial est le quart de pas

**Décision.** `roundingIsNotable` signale un écart supérieur à un **quart** de pas —
0,397 mm au seizième — et non au demi-pas qu'annonçait I18N.md.

**Motif.** Arrondir au plus proche borne l'erreur à exactement un demi-pas : un seuil posé
là ne se déclenche que sur une égalité parfaite. La règle documentée ne pouvait rien
signaler. Trouvé en écrivant le test, qui n'obtenait aucune alerte sur mille cotes.

**Vérifié en le cassant.** Un test compte les alertes sur mille millimètres consécutifs et
échoue si elles sont toutes présentes ou toutes absentes.

---

## 2026-08-31 — Le contrôle de texte en dur ignore les commentaires et les opérateurs

**Décision.** `scripts/check-i18n.mjs` retire les commentaires avant de chercher du texte
JSX, refuse les correspondances multilignes, et exclut `=`, `;`, `&`, `|` et les
parenthèses du texte reconnu.

**Motif.** Écrit en phase 0 contre une application de trois composants, il signalait
`Promise`, `= 500 && failureCount` et des fragments de commentaires dès que du vrai code
est arrivé. Six faux positifs, aucun vrai. Un contrôle qui crie à tort finit désactivé.

**Vérifié en le cassant.** Un titre écrit en dur, une clé inexistante et un `t()` avec
valeur par défaut sont toujours détectés, tous les trois.

---

## 2026-08-31 — La scène 3D est chargée à la demande

**Décision.** `Scene` est importée par `lazy()` ; Three.js ne part que quand un projet
s'ouvre.

**Motif.** L'entrée de l'application passe de 1,38 Mo à 481 ko. La liste de projets n'a
aucun besoin d'un moteur de rendu, et le critère de sortie parle d'un mobile d'entrée de
gamme — sur lequel un mégaoctet de JavaScript se paie en secondes.

---

## 2026-08-31 — Le jeton vit en mémoire, l'organisation choisie dans le navigateur

**Décision.** L'`access_token` n'est jamais écrit dans `localStorage` ; seul l'identifiant
de l'organisation choisie y est conservé. Les accès au stockage sont tolérants à l'échec.

**Motif.** Le jeton vit quinze minutes et le cookie de la plateforme sait le régénérer :
le stocker l'exposerait à n'importe quel script de la page pour un confort nul. À
l'inverse, redemander son organisation à chaque ouverture d'onglet serait pénible, et cet
identifiant ne donne aucun accès à lui seul.

**Détail qui coûte cher.** Le rafraîchissement est sérialisé par une promesse unique : un
jeton de rafraîchissement rejoué révoque la session entière — c'est la détection de vol de
la plateforme, et deux requêtes au chargement suffiraient à la déclencher.

---

## 2026-08-31 — Le placement est par bandes, donc guillotine par construction

**Décision.** L'optimiseur pose les pièces en bandes horizontales (*first-fit decreasing
height*), trait de scie réservé, rotation autorisée.

**Motif.** Les bandes **sont** les premières coupes traversantes, et les coupes verticales
à l'intérieur d'une bande sont traversantes de la bande. Le résultat est donc réalisable
sur une scie à panneaux par construction, et non parce qu'on l'a vérifié après coup. Un
placement libre serait plus dense et infaisable à l'atelier.

**Ce que cela coûte.** Ce n'est pas l'optimum — le *bin packing* 2D est NP-difficile, et
Neftya cherche une bonne solution rapide. Sur le meuble de référence, cette heuristique
donne exactement le plan documenté : 93,2 %.

---

## 2026-08-31 — Une pièce trop grande est signalée, jamais perdue

**Décision.** `nest()` rend une liste `unplaced`. Une pièce qu'aucun format ne peut
recevoir n'empêche pas les autres d'être placées.

**Motif.** Un plan de découpe amputé d'une pièce a l'air complet. Le silence en ferait un
plan faux que personne ne relit — et la pièce manquerait à l'atelier, pas à l'écran.

**Trouvé par les configurations générées.** La première version rejetait le groupe entier
dès qu'une pièce dépassait ; un meuble de 3000 mm de large perdait tout son 18 mm d'un coup.

---

## 2026-08-31 — Le PDF est écrit à la main

**Décision.** `packages/drawing` porte un écrivain PDF de deux cents lignes : rectangles,
traits, texte, quatorze polices standard, aucune dépendance.

**Motif.** Un plan de découpe n'a besoin de rien d'autre, et l'export doit être
**déterministe** — deux exports du même projet, le même fichier octet pour octet — sans
quoi l'instantané figé ne prouve rien. Les bibliothèques du domaine embarquent la police,
le SVG, les images et le chiffrement.

**Limite assumée.** Le texte est encodé en WinAnsi : les accents français passent, un
alphabet non latin non. Il faudrait alors embarquer une police — inutile pour les deux
langues de la V1.

---

## 2026-08-31 — Un devis auquel il manque un prix n'a pas de total

**Décision.** Une ligne sans prix saisi reste sans total, et le devis entier reste sans
total général, avec la liste des références manquantes.

**Motif.** Traiter un prix absent comme zéro produit un devis chiffré et faux. Personne ne
relit un nombre qui s'affiche — c'est précisément ce qui rend le total partiel plus
dangereux que l'absence de total.

**Corollaire.** Neftya n'invente aucun tarif : le prix d'un panneau varie fortement selon
la région et le fournisseur, et le moteur ne connaît que des quantités.

---

## 2026-08-31 — L'export est la seule donnée dérivée stockée

**Décision.** `project_exports` conserve un instantané figé — modèle, pièces, placement,
nomenclature, devis. Tout le reste est recalculé à chaque appel.

**Motif.** Un plan parti à l'atelier ne doit pas changer parce que le projet a été modifié
depuis. C'est l'exception qui confirme la règle du §6 d'ENGINEERING.md, et elle est
nommée pour cela.

**Détail.** L'instantané est enregistré même quand le dépôt chez Storage échoue : perdre
un plan produit parce qu'on n'a pas su le ranger serait absurde. `storage_object_id` reste
`null`, et cela se voit.

---

## 2026-08-31 — Les cotes se placent par niveaux, comme les pièces par bandes

**Décision.** Chaque cote est posée sur le premier niveau — ligne de cote parallèle, à
distance croissante du dessin — où son emprise ne rencontre celle d'aucune autre. Les
chaînes intermédiaires occupent les niveaux proches, les hors-tout les niveaux extérieurs.

**Motif.** C'est le même problème que le placement des pièces sur un panneau, et la même
solution. Elle donne l'absence de chevauchement **par construction** : le test n'a plus
qu'à confirmer que la construction tient, au lieu de chercher des collisions au hasard.

**Ce qui rendait le problème difficile n'était pas le placement mais l'emprise.** Une cote
de 18 mm porte une étiquette de soixante millimètres de large. Raisonner sur l'intervalle
seul pose deux cotes voisines au même niveau et superpose leurs textes.

---

## 2026-08-31 — Un test qui appelle la fonction qu'il vérifie ne vérifie rien

**Décision.** Le test de non-chevauchement recalcule l'emprise des cotes à la main, avec
ses propres constantes, au lieu d'appeler la fonction de la production. La fonction
exportée `footprint` a été retirée de l'API du paquet.

**Motif.** La première version l'appelait. Remplacer l'emprise par le seul intervalle —
en oubliant l'étiquette, précisément le défaut que ce code existe pour éviter — laissait
les soixante-douze tests au vert. Le test mesurait l'algorithme contre lui-même.

**Après correction**, la même mutation fait échouer les vingt formes.

---

## 2026-08-31 — La vue arrière est retournée

**Décision.** La projection arrière inverse l'axe des abscisses ; la vue de dessous aussi.

**Motif.** Vu de derrière, le côté gauche du meuble est à droite du dessin. Ne pas
retourner donnerait un plan où un perçage part du mauvais côté — l'erreur ne se voit pas à
l'écran, elle se voit sur la pièce percée.

---

## 2026-08-31 — Le PDF est coté en millimètres, l'écran dans les unités du lecteur

**Décision.** Les plans exportés portent des cotes métriques quelle que soit la préférence
de l'organisation. L'affichage à l'écran, lui, suit le système d'unités choisi.

**Motif.** Le PDF part à l'atelier, où la préférence de celui qui a dessiné n'a pas cours.
Et une cote arrondie au seizième de pouce perd jusqu'à un huitième de millimètre : c'est
supportable à l'écran, où le modèle reste juste, pas sur le papier d'après lequel on scie.

**Conséquence assumée.** Un menuisier impérial lira des millimètres sur son plan. Coter en
fractions demanderait de décider quelle valeur fait foi, et la réponse serait le
millimètre de toute façon.

---

## 2026-08-31 — Une propriété s'affirme une fois, pas à chaque paire

**Décision.** Les tests de propriété accumulent leurs manquements dans une liste et
l'affirment une seule fois, au lieu d'appeler `expect` à chaque élément.

**Motif.** Le test de non-chevauchement du placement appelait `expect` sur chaque paire de
pièces : deux millions d'appels sur quatre cents configurations, six secondes, et un échec
intermittent dès que la machine était chargée — le délai de cinq secondes de vitest, pas un
vrai défaut. Après réécriture : deux secondes, et la même mutation du trait de scie fait
toujours échouer trois tests.

**Ce que cela vaut aussi.** Le message d'échec liste **tous** les manquements au lieu de
s'arrêter au premier : on voit d'un coup si c'est un cas isolé ou une classe entière.

> **Un test instable finit ignoré**, puis désactivé, puis supprimé. Le rendre rapide était
> moins cher que d'allonger le délai, et allonger le délai n'aurait fait que reculer
> l'échéance.

---

## 2026-08-31 — Les journaux ont une liste de champs fermée

**Décision.** Le journal de requête écrit onze champs, et un test vérifie cette liste
**par égalité**, pas par inclusion.

**Motif.** Les journaux sont exactement l'endroit où une donnée personnelle réapparaît sans
que personne ne l'ait décidé — et où elle reste des années. Un test par inclusion laisse
passer l'ajout ; un test par égalité oblige à décider.

**Ce qui n'y entre jamais** : le jeton, l'en-tête d'autorisation, le corps des requêtes.
Le `sub` de la plateforme y est, sous `user_id` : c'est un pseudonyme, et sans lui aucune
enquête n'aboutit.

---

## 2026-08-31 — Deux sondes, parce que deux décisions

**Décision.** `/health` ne consulte rien ; `/ready` interroge la base et rend `503` quand
elle ne répond plus.

**Motif.** Une sonde de vie qui dépend de la base fait redémarrer en boucle une application
qui va parfaitement bien, et un redémarrage n'a jamais réparé une base. Les deux questions
servent deux décisions opposées : redémarrer le processus, ou cesser de lui envoyer du
trafic.

---

## 2026-08-31 — Le test de sauvegarde échoue quand pg_dump manque

**Décision.** `apps/api/src/db/backup.test.ts` ne s'ignore pas quand les outils PostgreSQL
sont absents : il échoue. La CI installe le client 18.

**Motif.** Un test de sauvegarde qui se saute tout seul est un test qui n'a jamais tourné,
et personne ne s'en aperçoit avant l'incident. C'est le même défaut que les 88 tests de
DealerOS qui passaient sur SQLite alors que la production tourne sur PostgreSQL.

**Vérifié en le cassant.** Une restauration qui ne fait rien casse trois tests ; une
sauvegarde `--schema-only` — qui « réussit » et produit un fichier — en casse deux.

---

## 2026-08-31 — La validation terrain est préparée, pas simulée

**Décision.** [FIELD_VALIDATION.md](FIELD_VALIDATION.md) porte le protocole, les trois
meubles, la feuille de mesures et la règle de décision devant les écarts. Aucun panneau
n'a été coupé, et le document le dit en tête.

**Motif.** Le critère de sortie de la V1 exige un menuisier, une scie et du temps
d'atelier. Écrire un test qui « simule » la découpe donnerait un vert qui ne prouve rien —
exactement le genre de vert que ce projet passe son temps à refuser.

**Ce que la préparation apporte quand même.** La règle qui dit ce qu'on fait d'un écart est
décidée **avant** de mesurer. Décider après, c'est décider en fonction du résultat.

---

## 2026-08-31 — Un test lent se rend rapide ; on ne relève son délai qu'en dernier recours

**Décision.** Les propriétés du placement partagent un unique calcul, et le contrôle de
chevauchement balaie les pièces triées par ordonnée au lieu de comparer toutes les paires.
Le test tombe de 2 100 ms à 5 ms. **Un seul** test dans le dépôt a un délai relevé : le
va-et-vient de sauvegarde, qui lance deux processus externes et dont la lenteur *est* ce
qu'il mesure.

**Motif.** Deux tests sont tombés par dépassement du délai de cinq secondes de vitest, sans
qu'aucun défaut n'existe. Relever le délai partout aurait fait disparaître le symptôme et
laissé la suite lente — donc de plus en plus souvent instable, jusqu'à ce qu'on cesse de la
lire.

**Ce que cela a donné en plus.** Les contrôles de placement ont quitté le fichier de test
pour `nesting-properties.ts`, à côté du moteur : ils servent désormais aussi à vérifier un
plan avant de l'envoyer à l'atelier. Un plan qui viole un invariant est un panneau perdu,
et le découvrir à la scie coûte plus cher que le découvrir dans une réponse d'API.

**Vérifié en le cassant.** Trois mutations — trait de scie horizontal, trait de scie
vertical, une pièce perdue en silence — font échouer quatre tests chacune.
