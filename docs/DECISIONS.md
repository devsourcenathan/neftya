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
donne exactement le plan documenté : 93,2 % à cette date, 93,1 % depuis que le délignage
et le jeu des étagères sont entrés dans le modèle — voir la décision du 1er septembre.

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

---

## 2026-09-01 — Une étagère a 2 mm de jeu par côté

**Décision.** `shelfSideClearanceMm`, 2 mm par défaut. Une étagère mesure la largeur de son
ouverture moins 4 mm, et se pose centrée dedans.

**Motif.** Le moteur coupait les étagères à la cote exacte de leur compartiment. Il faut les
engager entre deux panneaux déjà posés, et ni le bois ni l'assemblage ne sont parfaitement
d'équerre : à la cote, elles ne rentrent pas. Il y avait des jeux pour les tiroirs et pour
les façades, aucun pour les étagères — un oubli, pas un choix.

**Ce que cela dit du reste.** Le plan produit était **cohérent avec lui-même et infaisable**.
Aucun test ne pouvait le voir : l'invariant de recomposition était respecté, les cotes
s'additionnaient juste, et le meuble ne se montait pas. C'est précisément la classe de
défaut que la validation terrain existe pour trouver, et il en reste probablement d'autres.

**Effet de bord révélateur.** Le test « recompose la largeur hors-tout » utilisait la
longueur de l'étagère comme raccourci pour l'ouverture du compartiment. Il a fallu le
réécrire sur les panneaux verticaux eux-mêmes — ce qu'il aurait dû mesurer depuis le début.

---

## 2026-09-01 — Le panneau est déligné de 10 mm par rive

**Décision.** `trimMm`, 10 mm par défaut, réglable. Le placement n'utilise que la surface
délignée ; les positions restent données dans le repère du panneau **acheté**.

**Motif.** Un panneau livré arrive avec des rives abîmées et rarement d'équerre : un atelier
les déligne avant de scier. Placer les pièces jusqu'au bord nominal donne un plan qui ne
tient que sur le papier, et c'est la dernière coupe qui manque.

**L'utilisation reste rapportée au panneau acheté**, pas à la surface délignée. C'est le
panneau qu'on paie, et rapporter le chiffre à la surface utile ferait disparaître du calcul
une perte bien réelle : 93,1 % au lieu de 93,2 %, et les 72 800 mm² du délignage sont dans
la chute, là où ils doivent être.

**Corollaire de dessin.** Le plan montre la limite de délignage en trait interrompu. Sans
elle, l'opérateur mesure depuis le bord du panneau et se trompe de dix millimètres sur
chaque cote — l'inverse exact du but recherché.

---

## 2026-09-01 — Les portes entrent en V1

**Décision.** Un compartiment porte 0, 1 ou 2 vantaux, en applique. Ils partagent le plan de
façade avec les tiroirs : tiroirs en bas, porte au-dessus.

**Motif.** L'analyse comparative au brief l'a montré : le moteur ne connaissait que onze
rôles de pièces, tous de caisson. Le modèle prédéfini « Dressing » était un dressing sans
portes — pour un menuisier, une bibliothèque profonde. La cible primaire du brief dit
« je veux exactement ce meuble » ; sans portes, la moitié des meubles courants était hors
d'atteinte.

**Trois choix de menuiserie, chacun défendable et chacun discutable :**

- **En applique et non encastrée.** Une porte à fleur demande un jeu périmétrique différent
  sur chaque bord et un caisson d'équerre au dixième — ce qu'on n'obtient pas d'un panneau
  scié.
- **Deux vantaux rigoureusement égaux**, le jeu central absorbant l'impair. `divideEvenly`
  aurait donné 498 et 499 : invisible sur une étagère, voyant entre deux portes.
- **Tiroirs en bas, porte au-dessus.** Un buffet range souvent l'inverse. L'ordre sera
  configurable en V2 ; l'inventer maintenant reviendrait à choisir à la place du menuisier.

**Un défaut plus ancien, révélé au passage.** Quand la hauteur d'un compartiment ne suffit
même pas aux jeux entre façades, `divideEvenly` distribuait des hauteurs **négatives** et
laissait le reste à la dernière rangée. Les tiroirs étaient sauvés par leur propre contrôle ;
la porte, elle, héritait d'une hauteur plausible tirée d'un partage impossible. Le partage
est désormais refusé en amont.

**Vérifié en le cassant :** rendre les vantaux inégaux fait tomber 3 tests, inverser
tiroirs et porte 3 autres, retirer la garde de façade 1.

---

## 2026-09-01 — Une page publique, et toujours aucun champ de mot de passe

**Décision.** Un visiteur non connecté voit une page d'accueil : la proposition de valeur,
un plan coté calculé en direct, et deux boutons qui renvoient au portail Sekuu — connexion
et inscription.

**Motif.** Il n'y avait rien : un visiteur tombait sur « Connectez-vous à Sekuu » et un
bouton nu. Ce n'était pas une décision, c'était un trou.

**Ce qui n'a pas changé, et ne changera pas :** Neftya n'héberge ni écran de connexion ni
écran d'inscription. Un produit qui affiche un champ de mot de passe voit passer un mot de
passe. Les deux boutons redirigent, ils ne demandent rien.

**Le dessin de la page est calculé par le moteur au chargement**, pas capturé en image.
Montrer une capture d'un plan qu'on ne saurait pas produire serait la première promesse
fausse — et une image se périme sans que personne ne le remarque.

---

## 2026-09-01 — Une trousse d'interface, et des jetons plutôt que des classes

**Décision.** `apps/web/src/ui/` porte six composants — bouton, carte, titre de section,
champ, état vide, pastille — et `index.css` porte les couleurs, la typographie et les
rayons.

**Motif.** Chaque écran inventait ses bordures et ses gris : `border-stone-300` ici,
`border-stone-200` là, trois verts différents pour la même action. Une interface où le
bouton d'un écran a deux pixels de plus que celui d'à côté se lit comme un brouillon,
quelle que soit la justesse de ce qu'elle calcule.

**Le choix esthétique est assumé** : neutres chauds, encre presque noire pour les actions,
une seule couleur d'accent, et des titres en serif. Un outil de menuisier n'a pas à
ressembler à un tableau de bord d'analytique. Les deux familles de police sont celles du
système : aucune requête réseau, aucun texte qui saute au chargement.

---

## 2026-09-01 — Une plateforme injoignable n'est pas une session expirée

**Décision.** `PlatformUnreachable` est distinct de `NotSignedIn`. L'un affiche « réessayer »,
l'autre la page publique.

**Motif.** `fetch` ne rejette que sur un échec réseau ; un `401` passe par le chemin normal.
Sans cette distinction, une plateforme éteinte laissait l'application sur « Chargement… »
**indéfiniment**, sans message et sans issue. Trouvé en coupant l'Identity de démonstration
pour regarder la page publique.

Les confondre serait pire encore : envoyer au portail quelqu'un dont le réseau a simplement
toussé lui ferait croire que sa session a expiré.

---

## 2026-09-01 — La caméra cadre le meuble, elle ne le suppose pas

**Décision.** La scène 3D est enveloppée dans `Bounds fit observe` : la caméra s'ajuste aux
dimensions du meuble, et se réajuste quand elles changent.

**Motif.** La position était fixe. Elle cadrait convenablement un caisson de 600 mm et
laissait un dressing de 2,4 m sortir de l'écran — dans un produit dont le premier geste est
de faire glisser une largeur. Ce n'était pas un défaut d'esthétique.

**Le reste de la passe 3D** — ombre de contact, trois sources de lumière, bois plus sombre
sur l'enveloppe que sur ce qu'elle contient, pièce sélectionnée qui s'éclaire au lieu de
changer de teinte — sert la même lecture : comprendre la structure d'un coup d'œil, avant
de distinguer les pièces.

---

## 2026-09-01 — Sur téléphone, un panneau à la fois

**Décision.** Sous `lg`, le mode conception montre un seul des trois panneaux — réglages,
vue, pièces — choisi par un sélecteur segmenté. Au-dessus, les trois reviennent côte à côte.

**Motif.** Empilés, ils obligeaient à faire défiler trois écrans pour régler une cote et en
voir l'effet. Le menuisier consulte souvent sur téléphone, et c'est précisément là que le
va-et-vient coûte le plus.

**Les tables larges défilent dans leur propre cadre**, jamais en faisant défiler la page.
Le devis fait 448 pixels ; l'écran d'un téléphone en fait 375. Sans cadre, la table était
coupée sans que rien ne le laisse voir.

---

## 2026-09-01 — Douze icônes écrites à la main

**Décision.** `ui/icons.tsx` porte douze pictogrammes en SVG, hérités de la couleur et de
la taille du texte. Aucune bibliothèque.

**Motif.** Les bibliothèques d'icônes en embarquent deux mille pour en servir douze. Celles
d'ici tiennent en cent lignes, ne pèsent rien, et se dessinent au trait du reste de
l'interface.

**Une icône ne remplace jamais un libellé.** Un atelier ne devine pas un pictogramme, et
l'interface est déjà traduite : elles accompagnent le texte, elles ne s'y substituent pas.

---

## 2026-09-01 — L'interface adopte le Neftya Industrial Design System

**Décision.** Les jetons, la typographie et les motifs de l'interface viennent désormais de
`stitch_neftya_furniture_design_platform/neftya_industrial_design_system/DESIGN.md`.

Ce qui change par rapport à la passe précédente :

| | Avant | Maintenant |
|---|---|---|
| Palette | neutres chauds, bois | **Artisan Blue** `#031632`, gris techniques |
| Accent | ambre pour tout ce qui est actif | **Sawdust Gold**, réservé à l'actif et à ce qui finalise |
| Titres | serif système | **Inter**, graisse 600–700 |
| Cotes | chiffres tabulaires | **JetBrains Mono**, comme une donnée de CAO |
| Rayon | 12 px | **4 px** — « soft-industrial » |
| Profondeur | ombres légères | **filets d'un pixel**, aucune ombre |
| Fond | papier uni | **pointillé de 24 px**, papier millimétré |
| Navigation | barre supérieure | **barre latérale de 280 px** |

**Motif.** J'avais improvisé une identité chaude et artisanale, cohérente mais inventée. Le
système remis dit autre chose : un outil professionnel de CAO, « la chaleur de l'artisanat
et la précision froide de l'ingénierie ». Ce n'était pas à moi d'en décider.

**Trois écarts assumés, et leur raison :**

- **Les polices sont servies par l'application**, pas par Google Fonts. Un atelier travaille
  souvent sur une connexion médiocre, et une requête tierce qui traîne fait sauter tout le
  texte au chargement.
- **Les icônes restent les nôtres**, dessinées à la main. Les maquettes utilisent Material
  Symbols, une police de plus à charger depuis un tiers, pour douze pictogrammes.
- **La barre latérale devient horizontale sous `lg`.** 280 px sur un écran de 375, ce
  seraient les trois quarts de la largeur pour une navigation à deux entrées.

Les maquettes sont exclues du contrôle de format : les reformater ferait diverger ce que
nous lisons de ce qui nous a été remis.

---

## 2026-09-01 — Le statut d'un projet est déduit, jamais saisi

**Décision.** Trois états, calculés par le serveur à chaque lecture :

| État | Ce qui le déclenche |
|---|---|
| `needs_review` | le moteur signale quelque chose — flèche, vantail trop large, tiroir qui ne rentre pas |
| `ready` | un export a été figé |
| `draft` | tout le reste |

**Motif.** Un statut qu'on choisit dans une liste déroulante ment dès le lendemain :
personne ne revient le corriger. Celui-ci se lit des données, il ne peut donc pas diverger
de ce que le projet est vraiment. Corriger une étagère qui fléchit fait passer le projet de
« à revoir » à « brouillon » sans que personne n'ait rien déclaré.

**`needs_review` prime sur `ready`** : un plan parti à l'atelier avec un avertissement reste
un plan à relire.

**Il n'y a pas d'état « optimisé »**, contrairement aux maquettes. Le plan de découpe est
recalculé à chaque appel : il l'est donc toujours, et l'annoncer comme une étape franchie ne
dirait rien. Reprendre l'étiquette pour la ressemblance aurait produit un badge décoratif.

**Le compte d'exports passe par une sous-requête corrélée**, pas par une requête par projet :
la liste tient en un aller-retour quel que soit le nombre de projets. Elle porte le
cloisonnement comme le reste — les exports d'une autre organisation ne comptent pas.

---

## 2026-09-01 — Masquer une pièce est une affaire de vue, et rien d'autre

**Décision.** Le panneau de calques masque des pièces dans la 3D. Une pièce masquée reste
dans la liste de découpe, la nomenclature, le devis et l'export.

**Motif.** Le geste existe pour regarder derrière une porte ou un fond — c'est ce que
réclame une vue 3D dès qu'un meuble est fermé, et sans lui un dressing à deux vantaux ne
montre que ses vantaux. Il ne dit rien de ce qu'on fabrique.

Confondre les deux produirait **un plan amputé d'une pièce que personne n'aurait décidé de
retirer** — le défaut le plus coûteux possible dans ce produit, et le plus silencieux.

**La règle est extraite en fonction pure**, `visibleParts`, et testée. Un canevas WebGL ne
se lit pas dans un test : laisser la règle à l'intérieur de la scène revenait à ne pas la
vérifier du tout. Retirer le filtre fait échouer un test.

---

## 2026-09-01 — Les trois panneaux du mode conception se replient

**Décision.** Réglages, Vue et Calques se replient chacun en un bandeau étroit qui porte son
nom à la verticale et se rouvre d'un clic. Le réglage est mémorisé d'une session à l'autre.

**Deux gardes, et elles comptent plus que la fonctionnalité :**

- **Le dernier panneau ouvert ne peut pas être replié.** Tout replier laisserait un écran
  vide, et un écran vide dont on ne sait pas sortir est pire qu'un panneau de trop. Le
  bouton est désactivé et dit pourquoi.
- **Un panneau replié ne disparaît pas.** Le bandeau garde son nom : un volet qui
  s'évanouit laisse l'utilisateur sans moyen de le retrouver, et c'est la faute classique
  des interfaces à volets.

**La vue reprend la place quand les côtés se replient**, et inversement : vue repliée, les
panneaux restants se partagent la largeur. Laisser deux colonnes étroites et un grand vide
au milieu n'aurait servi personne.

**Sous `lg`, le repli n'a pas cours** : les panneaux y sont des onglets. L'état est donc lu
à travers une requête média en JavaScript et non par une classe CSS — `hidden` cache un
état, il ne le change pas, et un panneau replié la veille sur un ordinateur serait revenu en
bandeau illisible sur un téléphone.

---

## 2026-09-01 — Une mesure que le navigateur d'essai ne permet pas de faire

**Constat.** Dans le navigateur automatisé de cette session, le canevas 3D reste à sa taille
par défaut de 300 × 150 tant qu'un événement `resize` n'est pas envoyé à la main.

**Ce n'est pas concluant.** Ce navigateur ne compose pas d'images ; `ResizeObserver` n'y
délivre donc aucune notification, et c'est précisément ce mécanisme qui dimensionne le
canevas. Le symptôme est le même que celui d'un vrai défaut, et rien ici ne permet de les
distinguer.

**Ce qui a été fait :** la mesure est demandée immédiate (`resize={{ debounce: 0 }}`) — une
précaution sans coût, qui ne peut que rendre le dimensionnement plus prompt. **Ce qui n'a
pas été fait :** affirmer que cela corrige quoi que ce soit.

**Vérifié le 1er septembre 2026 dans un vrai navigateur : il n'y avait pas de défaut.** Le
canevas 3D occupe son panneau, et la barre latérale se rétrécit bien à 64 px. Les deux
symptômes venaient du navigateur d'essai, qui ne compose pas d'images et n'y déclenche donc
ni `ResizeObserver` ni recalcul fiable de mise en page.

**La leçon est l'inverse de celle qu'on attend.** L'outil qui avait trouvé les défauts les
plus utiles de ce projet — téléchargements en `401`, CORS muet sur `PUT` — est le même qui
en a inventé deux ici. Ses assertions sur **l'état et le DOM** sont fiables ; ses mesures de
**géométrie** ne le sont pas, et c'est désormais écrit dans le code à côté du réglage.

---

## 2026-09-01 — La barre latérale se replie, et un seul mécanisme mémorise tout

**Décision.** La barre passe de 280 px à 64 px : la marque reste, les libellés cèdent la
place aux seules icônes, et chaque entrée porte alors son nom en infobulle et en nom
accessible. Le bouton de repli est au bas de la barre, là où il ne se confond avec aucune
entrée de navigation.

**Une entrée réduite à son icône devient un rébus** si rien ne la nomme : c'est ce que
`title` et `aria-label` réparent, et c'est aussi ce qui la garde utilisable au clavier et au
lecteur d'écran.

**Le stockage des préférences d'affichage est maintenant un seul crochet**, `usePersisted`.
Le repli des panneaux du mode conception avait déjà sa mécanique tolérante ; en écrire une
seconde pour la barre aurait fait deux endroits à corriger le jour où `localStorage` lève
autrement. Ces réglages vivent dans le navigateur et non sur le serveur : ils appartiennent
au poste de travail, et un menuisier qui règle son écran d'atelier n'impose rien à son
collègue.

**Sous `lg`, la barre est horizontale et le repli n'a pas cours** — même règle que pour les
panneaux, et pour la même raison : un état hérité d'un grand écran ne doit pas mutiler la
navigation d'un téléphone.

---

## 2026-09-01 — Les noms de modèles sont de la donnée traduite

**Décision.** Un nom de modèle est un objet `{ fr, en, … }` stocké en `jsonb`, résolu à la
langue du jeton, avec **repli sur le français** — la langue de référence, rendue obligatoire
par une contrainte de la base.

**Motif.** Une organisation qui crée son propre modèle lui donne un nom qu'aucun fichier de
locale ne connaîtra jamais. Il ne peut donc pas passer par `t()`, et il doit vivre avec la
donnée. C'est le §6 d'I18N.md, resté sans implémentation depuis la phase 3.

**Le repli affiche l'autre langue, jamais une clé.** Un menuisier anglophone qui lit
« Établi d'atelier » comprend ; il ne comprendrait pas `template.42.name`. Le repli se
déclenche aussi sur une chaîne **blanche** : un champ laissé vide n'est pas une traduction.

---

## 2026-09-01 — Le catalogue du produit vit dans le code, les modèles d'organisation en base

**Décision.** Les quatre modèles livrés avec Neftya sont des constantes TypeScript ; la
table `templates` ne porte que ce qu'une organisation crée. `GET /v1/templates` rend les
deux dans **une seule liste**, avec la même forme.

**Pourquoi pas en base.** Semer le catalogue obligerait à une migration de données à chaque
modèle ajouté au produit, et laisserait une base de production diverger d'une base de
développement sans que rien ne le signale. Dans le code, il est versionné, testé — un test
vérifie que chacun produit un meuble constructible — et identique partout.

**Pourquoi la même forme des deux côtés.** Un client qui devrait fusionner deux sources
finirait par les afficher différemment. Le catalogue porte donc des noms `{ fr, en }` comme
n'importe quel modèle d'organisation, et une seule fonction les résout.

**Ce qui n'a pas été fait :** renommer un modèle existant. Le supprimer et le recréer suffit
pour l'instant, et une route de plus sans besoin établi est une route de plus à maintenir.


---

## 2026-09-02 — Le catalogue de quincaillerie précède les perçages

**Décision.** Les positions de perçage sont calculées à partir d'un catalogue nommé —
charnière à boîtier 35, coulisses à billes aux six longueurs du commerce, tourillon 8 × 30,
taquet Ø 5 — et non de cotes génériques.

**Motif.** Un perçage n'existe pas dans l'absolu. Un boîtier de charnière se fraise à 22 mm
du chant *parce que* c'est une charnière de 35 ; un profil de caisson se perce à 37 puis tous
les 96 *parce que* c'est une coulisse à billes. Sans article nommé, les cotes auraient été
des moyennes, justes pour personne.

**Conséquence sur les prix.** Les références de coût changent : `accessory:hinge` devient
`accessory:hinge_35_110`, `accessory:drawer_slide_pair` devient `accessory:slide_ball_350`.
Les prix déjà saisis sur les anciennes références sont **orphelins**. Le devis les signale
comme manquants plutôt que de chiffrer faux — c'est le comportement qu'il a déjà pour tout
prix absent, et une organisation qui avait saisi ses tarifs devra les ressaisir. C'est
défendable : « une paire de coulisses » n'était pas un article qu'on achète, une paire de
350 en est un.

---

## 2026-09-02 — Un jeu de trous par instance, jamais par pièce

**Décision.** `drilling()` rend une entrée par **instance** de pièce, désignée par son rang
dans `Part.instances`.

**Motif.** Les deux vantaux d'une paire sont la même `Part` en quantité 2 : mêmes cotes, donc
groupés. Ils ne se percent pourtant pas pareil — l'un charnière à gauche, l'autre à droite.
Un perçage par pièce les aurait percés tous les deux du même côté, et la porte de droite
aurait ouvert dans le vide.

**Corollaire.** Les coordonnées sont dans le repère de **la face qu'on perce**, pas dans un
repère unique avec une mention de face. Un trou à 50 mm du bord vu de face est à 50 mm de
l'autre bord vu de dos ; laisser l'atelier faire ce miroir de tête est l'erreur qu'on fait
une fois sur deux.

---

## 2026-09-02 — Le DXF est un plan de perçage, pas un plan de découpe

**Décision.** `drilling.dxf` dessine chaque pièce seule, à plat, dans son propre repère —
un bloc par face percée. Le placement sur panneau reste dans le PDF.

**Motif.** Poser les perçages sur le plan de découpe obligerait à savoir quelle face du
panneau est en l'air, ce que le placement ne dit pas et ne peut pas dire. Un fraisage de
charnière fait à l'envers traverse la porte.

**Format R12 ASCII**, parce que c'est la version que tout lit. Écrit à la main comme le PDF :
deux exports du même projet doivent donner le même fichier octet pour octet, sinon
l'instantané figé n'a plus de sens.

---

## 2026-09-02 — Le sens du fil est une case du projet, pas une règle du moteur

**Décision.** `respectGrain` est porté par le modèle et **faux par défaut**. Le fil lui-même
est porté par le rôle : visible → `length`, caché → `none`.

**Motif.** Le moteur ne sait pas ce qu'il y a sur le panneau. Sur un mélaminé uni, contraindre
le fil ne coûterait que de la chute ; sur un décor bois, ne pas le contraindre couche un
vantail en travers du panneau, et cela se voit à trois mètres.

**Ce que la contrainte ne couvre pas.** Le fil **continu** entre façades voisines. C'est une
contrainte de séquence — débiter les façades d'un même meuble dans la continuité d'un même
panneau — et elle demanderait au placement de raisonner sur des groupes de pièces. Elle reste
ouverte.

**Une note du §2 de MANUFACTURING.md était fausse** : elle annonçait les deux côtés du meuble
de référence posés pivotés. Aucun ne l'est. Le placement par bandes pose systématiquement la
grande dimension le long du panneau, ce qui est déjà le sens du fil.

---

## 2026-09-03 — Neftya sous un sous-domaine de la plateforme

**Décision.** L'interface est servie depuis `neftya.sekuu.test`, port **5174**, en
`strictPort`. `SEKUU_ISSUER` reste `https://identity.sekuu.com` y compris en local.

**Motif.** Un nom d'hôte partagé est la condition de tout le reste : le jeton de
rafraîchissement est un cookie posé sur `.sekuu.test`, et une page servie depuis `localhost`
ne le verra jamais. Le symptôme serait une boucle sur la connexion, sans rien qui l'explique.
Le port 5174 parce que DealerOS occupe le 5173, et que les deux produits doivent tourner
ensemble — c'est la seule façon de vérifier qu'une session ouverte sur l'un ouvre l'autre.
`strictPort` plutôt qu'un repli sur 5175 : ce port est inscrit dans les origines autorisées
de la plateforme et dans le CORS de l'API.

**`iss` est une chaîne comparée, pas une adresse appelée.** C'est le claim que la plateforme
écrit ; le JWKS, lui, se lit à l'adresse locale.

**L'Identity de poche n'est pas supprimée.** Elle reste le mode hors ligne, et trois
variables suffisent à y revenir.

---

## 2026-09-03 — Le compte et l'abonnement restent au portail

**Décision.** Neftya n'affiche **ni** l'aperçu du compte, **ni** l'abonnement, **ni** les
factures. Le menu du compte ouvre le portail, en y portant `product=neftya` et l'adresse de
retour.

**Motif.** Ce sont les mêmes écrans pour tous les produits Sekuu. Les recopier ici, c'est les
voir diverger de la facturation le jour où l'un des deux change — et la facturation est
l'endroit où une divergence se paie.

**Conséquence.** Tout le contrôle d'abonnement de Neftya tient dans le claim `products`.
Neftya ne lit ni plan, ni facture, ni échéance.

**Ce que ça a révélé.** Le manque venait d'un utilisateur, une fois la session unique en
place : la session marchait, et il n'y avait **aucune porte de sortie** — ni profil, ni
déconnexion, ni abonnement. Une intégration qui entre sans permettre de sortir n'est pas
finie, et cela ne se voit pas en la testant soi-même.

---

## 2026-09-03 — Quand une mutation survit, déplacer la garde plutôt qu'ajouter un test

**Décision.** `initialHistory` **normalise** le modèle qu'on lui donne. L'appelant ne peut
plus l'oublier, parce qu'il ne lui est plus demandé d'y penser.

**Motif.** La normalisation était d'abord posée dans `Designer.tsx`. Elle a été retirée pour
voir si un test le remarquait : **aucun ne l'a vu**. La leçon n'était pas qu'il manquait un
test, mais que la garde était au mauvais endroit — une garde qu'un appelant doit penser à
écrire est une garde qu'un appelant finit par oublier.

**Conséquence sur l'annulation.** Fenêtre de fusion de **500 ms**, profondeur **50**, et
seules les actions qu'on *fait glisser* se fondent : une dimension par axe, les largeurs de
compartiment, le déplacement d'une poignée donnée. Trois clics sur un compteur sont trois
décisions ; les fondre ferait reculer de trois quand on demande un.

---

## 2026-09-04 — Le menu contextuel agit sur le compartiment, jamais sur la pièce

**Décision.** Les actions du clic droit portent sur le compartiment : y ajouter ou en retirer
une étagère, le dupliquer, le supprimer, appliquer ses réglages à tous.

**Motif.** Une pièce est une **conséquence**, pas un objet. « Supprimer cette étagère » est
inexprimable dans un modèle paramétrique : la prochaine recomposition la ferait revenir.
« Retirer une étagère de ce compartiment » se dit, et tient.

**C'est la première fois que l'interface a dû obéir à cette règle**, et elle s'est trompée
une fois : le menu visait la pièce cliquée. Il dérive maintenant le compartiment de la
position du clic dans le repère du meuble.

---

## 2026-09-04 — L'avant du meuble est le z minimal

**Décision.** L'avant est à **z minimal** ; les portes sont en applique à z = −18. La caméra
regarde depuis `z` négatif.

**Motif.** Cette convention existait déjà dans le moteur, sans être écrite. L'interface a posé
les poignées de cote et la caméra **du côté opposé**, donc sur le dos du meuble.

**Ce qui doit être retenu.** Le test qui accompagnait ce travail avait encodé la même erreur :
il affirmait la poignée de profondeur au-delà de `depthMm`, et il passait. Un test écrit de la
même main que le code confirme la convention de cette main, pas celle du modèle. Les
conventions implicites se paient deux fois — une fois dans le code, une fois dans le test qui
les bénit.

---

## 2026-09-04 — Les poignées, et la seule quincaillerie comptée depuis le modèle

**Décision.** Trois formes : barre à deux vis, bouton à une vis, coquille encastrée. Les vis
de poignée sont les **seuls perçages traversants** du catalogue. Et les poignées sont comptées
**depuis le modèle**, non depuis leurs trous.

**Motif.** Une coquille encastrée est une empreinte fraisée : elle n'a pas un seul trou. La
compter par ses perçages en aurait oublié une sur trois formes, et l'atelier l'aurait
découvert en montant le meuble. Les vis, elles, ne comptent rien : elles appartiennent à la
poignée déjà comptée.

**Corollaire.** La pose par défaut est une suggestion, pas une contrainte : la position se
reprend à la main, et `key` est une chaîne libre pour que le catalogue grossisse sans que le
modèle change de forme.

---

## 2026-09-04 — Partager un espace est une seule règle

**Décision.** `shareSpace` sert **à la fois** aux largeurs de compartiment et aux hauteurs
d'étagère. Ce qui est demandé est honoré, le reste se partage à égalité, et un total
impossible retombe sur un partage égal avec un avertissement.

**Motif.** Les deux problèmes sont le même : des tailles demandées, des tailles libres, un
total fixe. Deux implémentations auraient divergé sur les cas limites — et les cas limites
sont tout ce qui compte ici. Une ouverture qui se referme a produit une étagère de **−4 mm**
avant que `shelvesOf` apprenne à refuser.

---

## 2026-09-04 — Trois prix orphelins sont reportés, le quatrième reste où il est

**Décision.** La migration `0004` reporte les **renommages exacts** — `hinge`, `dowel_8`,
`shelf_support` — et laisse `accessory:drawer_slide_pair` en place.

**Motif, et révision du 2 septembre.** L'entrée du 2 septembre concluait qu'une organisation
devrait **tout** ressaisir. C'était trop large : trois des quatre articles ont un successeur
unique, et faire ressaisir un prix qu'on sait reporter est du travail infligé sans raison.

La coulisse, en revanche, correspond maintenant à six références, et une coulisse de 250 ne
coûte pas ce que coûte une de 500. Recopier le montant sur les six **inventerait cinq tarifs**
— précisément ce que le changement de référence visait à empêcher. La ligne reste donc là :
elle ne sert plus au devis, elle ne gêne rien, et elle garde la trace du montant retenu.

**Qui a déjà saisi la nouvelle référence la garde.** Elle est plus récente, et elle a été
saisie en connaissance du changement.

---

## 2026-09-04 — Les tarifs de Neftya sont ceux de DealerOS

**Décision.** Solo 5 000, Pro 15 000, Max 40 000 XAF par mois. Remise croissante avec
l'engagement : 2 % au trimestre, 3 % au semestre, 5 % à l'année. **Trois limites, et trois
seulement** : projets, membres, stockage.

**Motif.** Un produit de la plateforme se vend au même prix qu'un autre tant que rien ne
justifie l'écart. Les montants sont écrits en clair plutôt que calculés : un tarif se lit, se
vérifie et se cite dans une facture, et le reconstituer à l'exécution rendrait une remise
modifiée rétroactive sur des factures déjà émises.

**Aucune limite que personne n'applique.** `neftya_projects_max` est la seule que Neftya sache
appliquer ; les deux autres sont lues par la plateforme. Publier un quota que rien n'applique
est une promesse qu'on ne tient pas, et le client la découvre en la dépassant sans effet.

**Ce que la donnée cachait.** Le portail affichait les offres de DealerOS à qui venait de
Neftya. Le filtre par produit manquait **depuis toujours** ; il était invisible tant qu'un
seul produit avait des plans. Un défaut que la donnée masque n'est pas moins ancien.

---

## 2026-10-01 — Une suite qui ne sait pas où elle écrit ne doit pas écrire

**Décision.** `vitest.config.ts` charge `.env`, et le banc d'essai **refuse** de tourner sans
`DATABASE_URL`. Le repli sur `postgres://…@localhost:5442/neftya` a disparu.

**Motif.** Deux défauts s'annulaient : Vitest ne lit pas `.env`, et le harnais avait ce port
codé en dur. Tant qu'un PostgreSQL local y répondait, la suite composait le bon numéro par
hasard et personne ne pouvait voir que la variable n'arrivait jamais. Le jour où la base a
déménagé, douze fichiers ont échoué d'un coup. **Un repli sur une adresse plausible ne protège
de rien** — il retarde seulement le moment où on apprend qu'on ne savait pas.

**L'environnement réel garde la main** sur `.env` : en intégration continue c'est lui qui
fournit l'URL, et un `.env` oublié sur une machine ne doit pas faire tourner la suite ailleurs
qu'on croit.

**Base hébergée : le point d'accès direct, pas le pooler.** Chaque fichier de test travaille
dans son propre schéma, passé en paramètre de démarrage (`options=-c search_path=…`). Un pooler
rejette ce paramètre et toute la suite tombe. Sur Neon, c'est l'URL sans `-pooler`.

---

## 2026-10-01 — Une case cochée sans test ne prouve rien, y compris les nôtres

**Décision.** Les deux cases client de [SEKUU.md](SEKUU.md) §10 — `switch-organization`
enchaîné, et le rafraîchissement sérialisé — sont cochées, après écriture des tests qui les
tiennent.

**Motif.** Le code les faisait **depuis le 3 septembre**. Les cases sont restées vides, ce qui
était la bonne réponse : la liste exige qu'une case renvoie à un test qui échoue si on retire
la garde. Elles ne pouvaient pas être cochées avant que ce test existe.

Les deux gardes sont du genre qui marche à la main et casse en charge : un jeton de
rafraîchissement **ne se rejoue pas** — le rejouer révoque la session entière, c'est la
détection de vol, et elle est volontairement brutale. Deux appels concurrents déconnectent
l'utilisateur, ce qui arrive dès qu'une page lance deux requêtes au chargement.

**Éprouvées en les cassant** : sans `??=`, deux rafraîchissements partent ; sans
l'enchaînement, la session s'ouvre sans organisation et l'API refuse tout avec un jeton
valide.

---

## 2026-10-01 — L'IA propose, le schéma du moteur décide

**Décision.** L'assistant interprète une description par la tâche `extract` de Sekuu AI, et
sa sortie passe par **`furnitureInput.parse`** — le même schéma qui garde l'API — avant
d'approcher quoi que ce soit.

**Motif.** Un modèle de langage rend du texte *plausible*, et « plausible » est exactement le
danger : une cote fausse qui a l'air juste traverse tout l'outil sans rien déclencher et
ressort en plan de découpe. Écrire une validation propre à l'assistant aurait créé deux
définitions de ce qu'est un meuble valide, qui divergeraient à la première évolution du
moteur.

**Deux bornes s'ajoutent au schéma, et elles n'ont pas leur place dans le moteur.**

La première est la **vraisemblance d'une cote** : entre 100 et 4 000 mm. `positiveMillimetres`
accepte 2 comme 2 000 000, et il a raison de ne pas avoir d'opinion sur la taille d'un
meuble. Mais « une bibliothèque de 1,80 m » mal lue donne une bibliothèque de **1,8 mm**, que
le moteur calculerait sans broncher. Les bornes n'arbitrent pas le goût ; elles attrapent un
facteur mille.

La seconde est la **longueur de l'entrée**, 2 000 caractères : le coût est proportionnel à
l'entrée.

**Rien n'est rattrapé en silence.** Un nombre négatif d'étagères est signalé, pas ramené à
zéro : le corriger fabriquerait un meuble que personne n'a demandé, et la personne croirait
avoir été comprise. Seule exception, documentée : un meuble a **au moins un compartiment**,
parce que c'est une vérité de structure et non une mesure.

**Une sortie inexploitable n'est pas une erreur HTTP.** `200`, `status: "unusable"`, et les
problèmes par champ. La génération a réussi et a coûté ; un `422` ferait réessayer là où il
faut reformuler.

**L'aménagement est uniforme**, et c'est le contrat qui le veut. `extract` rend un objet
portant exactement les clés demandées, et rien ne permet de déclarer la forme d'une valeur
imbriquée : demander un tableau de compartiments serait demander au modèle de l'inventer. La
structure est donc composée en code, et l'utilisateur ajuste au compartiment ensuite.

**La clé d'idempotence porte le texte**, pas un identifiant tiré au hasard. Deux fois la même
description est la même question : la repayer serait absurde, et une valeur aléatoire rendrait
l'en-tête décoratif.

**Le nom du champ est le seul levier sur l'unité.** Les instructions de la tâche appartiennent
à la plateforme — « Extrais les champs demandés » — et ne sont pas surchargeables. `widthMm`
est donc tout ce qui dit au modèle qu'on attend des millimètres, et ce n'est pas une garantie.
C'est précisément pour cela que les bornes existent.

---

## 2026-10-01 — « Image → structure » est bloqué par la plateforme, pas par Neftya

**Décision.** Le poste « Image → analyse et structure » de la V2 n'est pas engagé, et la
raison est consignée plutôt que redécouverte.

**Motif.** Les modèles de Sekuu AI déclarent la capacité `vision`, mais **aucune tâche
n'accepte d'image** : toutes les entrées sont des chaînes. Le périmètre de la V1 de la
plateforme l'écrit noir sur blanc — « ni OCR ni analyse de document », faute d'un modèle de
vision, d'un pipeline d'extraction et de documents réels pour l'éprouver.

**Conséquence.** Le poste demande d'abord une tâche à entrée image **chez Sekuu**, avec son
modèle, ses bornes, son schéma de sortie et ses tests. C'est un arbitrage de plateforme.

**Ce qu'on n'a pas fait, et pourquoi.** Passer par la tâche libre `prompt` en y collant une
image encodée aurait contourné la borne, pas la difficulté : coût imprévisible, sortie sans
forme promise, et une analyse de réponse à écrire à la main qui vieillirait en silence au
prochain changement de modèle. La règle de la plateforme est explicite — si un produit appelle
`prompt` trois fois avec les mêmes instructions, c'est une tâche.

---

## 2026-10-01 — `SERVICE_UNAVAILABLE` entre au catalogue d'erreurs

**Décision.** Le code `SERVICE_UNAVAILABLE` (503) est ajouté à l'énumération de
`@neftya/contracts`.

**Motif.** Une capacité de la plateforme qui manque ou ne répond pas n'est **pas** une erreur
interne : rien n'est cassé dans Neftya, et l'appelant peut réessayer plus tard. Rendre `500`
ferait chercher un défaut ici.

**Pris au catalogue de la plateforme, pas inventé.** L'enveloppe de Neftya est celle de Sekuu,
et un code maison aurait divergé du jour où un client lit les deux. Le quota, lui, reste un
`409` — c'est déjà ce que fait le quota de projets, et deux codes pour un même refus auraient
obligé à écrire deux fois le même traitement côté interface.

---

## 2026-10-01 — L'assistant propose à l'écran, il ne crée rien

**Décision.** La configuration interprétée s'affiche **avec ses cotes en clair**, et le projet
n'est créé qu'au clic. L'assistant est posé à côté des modèles prédéfinis, jamais à leur
place.

**Motif.** Une interprétation peut être plausible et fausse, et la seule personne capable de
le voir est celle qui a écrit la phrase — pas le code, qui a déjà vérifié tout ce qu'il
pouvait vérifier. Créer d'abord et laisser corriger ensuite aurait rempli la liste de meubles
que personne n'a voulus, et chacun aurait porté un nom tiré d'une phrase.

**Un modèle prédéfini reste le chemin sûr** : il est complet, il est juste, et il ne dépend de
rien. L'assistant dépend de la plateforme et d'un modèle de langage. Le présenter comme le
point d'entrée principal aurait rendu l'outil inutilisable le jour où la clé expire.

**Sans clé, la section se retire.** Un `503` portant `SERVICE_UNAVAILABLE` remplace le champ
par son message, pour la session. Laisser le champ inviter à cliquer ferait réessayer
indéfiniment quelque chose qui ne marchera pas aujourd'hui.

**Le sondage a un plafond** : vingt fois à 1,5 s, soit trente secondes. Au-delà, l'écran
renonce et le dit. Un onglet laissé ouvert qui interroge la plateforme toute la journée est un
défaut que personne ne voit et que tout le monde paie.

**`unusable` arrête le sondage**, au même titre que `succeeded`. La génération est finie ; la
redemander ne la rendrait pas meilleure, elle coûterait un appel de plus. La décision est
portée par `nextPoll`, une fonction pure testée à part : un `refetchInterval` écrit dans le
composant est vrai le jour où on l'écrit et faux au premier état ajouté.

**Les problèmes sont rendus par champ.** « Données invalides » obligerait à deviner laquelle
des trois cotes manque — et c'est exactement ce que l'API s'est donné la peine de dire.

---

## 2026-10-04 — Sekuu mis de côté : identité locale

**Décision.** Neftya porte sa propre identité (comptes, organisations,
sessions) au lieu d'attendre Sekuu Platform, indisponible pour une durée
indéterminée. Six chantiers, dans l'ordre : auth, quotas, interface,
stockage, IA, notifications.

**Motif.** Attendre bloque tout ; recoupler au moteur serait pire. La
frontière `apps/api/src/sekuu/` existait déjà : l'identité locale rend le
**même contexte** (`sub/org/roles/products/limits`), donc aucune route métier
ne change et le retour de Sekuu est une bascule, pas une réécriture.

**Ce qui est abandonné consciemment** : session multi-produits,
`billing_manager`, portail, spend-cap plateforme. Le périmètre est écrit dans
`docs/AUTH_LOCAL.md` §4 pour qu'on ne le redécouvre pas dans six mois.

**Points de vigilance.** `NEFTYA_JWT_SECRET` refuse de démarrer si absent ou
court. Rate-limit en mémoire : derrière plusieurs instances, passer à Redis.
Pas de `citext` : les schémas de test isolés ne le voient pas.

---

## 2026-10-04 — Stockage local des exports

**Décision.** Les exports sont déposés sur disque (`NEFTYA_DATA_DIR`) avec
leur index en base (`files`), au lieu d'attendre une clé Sekuu que personne
n'a. `FileStore` (déposer + relire) est l'interface ; `SekuuStorage` ne fait
que déposer et reste branché quand une clé est présente.

**Motif.** Un export non déposé est un plan qu'on ne retrouve pas. Le disque
est le magasin le plus simple qui se sauvegarde avec la base — d'où la règle
d'exploitation : dump et répertoire partagent leur horodatage.

**Cloisonnement double** : filtre `organization_id` en SQL **et** segment de
chemin. L'un sans l'autre suffirait ; les deux ensemble font qu'une régression
de l'un ne fuit toujours rien.

---

## 2026-10-04 — IA locale synchrone

**Décision.** L'assistant appelle un modèle compatible OpenAI directement,
en synchrone, avec ses générations persistées — au lieu d'attendre Sekuu AI.
Même contrat HTTP, même idempotence, même `unusable`.

**Motif.** L'interface sondait déjà : une extraction qui répond tout de suite
reste une génération `succeeded` à la première lecture. La persistance rend
l'idempotence réelle (même clé = même ligne) et le quota comptable en lignes
du mois — sans table de compteur qui dériverait.

**Ce qu'on reprend** : nommer un modèle (plus de registre plateforme),
plafond de dépense à surveiller côté facture fournisseur. `temperature: 0`,
sortie courte, pas de vision : comme avant, l'image reste hors périmètre.

---

## 2026-10-04 — Devis envoyés en local, avec outbox

**Décision.** `POST /v1/projects/:id/quotation/email` envoie le devis et le
plan joint par SMTP (nodemailer), avec une ligne d'outbox par tentative —
`sent` comme `failed`. Permission `costs.read` : qui ne voit pas les prix ne
les envoie pas.

**Motif.** Notify n'a jamais été câblé : rien à remplacer, tout à écrire.
L'outbox synchrone plutôt qu'une file : pas de travailleur à opérer, et un
échec se relit et se renvoie au lieu de se perdre. Le jour où le volume
l'exige, la table est déjà la file.

**Sans SMTP, 503** — le même dégradé que l'assistant sans modèle. Le faux en
mémoire dans les tests : aucun réseau, et tout est relisible.

---

## 2026-10-04 — Une ressource, une sérialisation

**Décision.** Les deux routes de l'assistant rendent le **même objet**, construit par une
seule fonction. `202` n'est rendu que s'il reste quelque chose à attendre ; sinon `200`.

**Motif.** Il y avait deux sérialisations : le `POST` rendait toujours `model: null`, le `GET`
composait. C'était cohérent tant que l'extraction était asynchrone — le `POST` répondait
`queued`. Depuis qu'elle est synchrone, il annonçait `succeeded` les mains vides, et un
appelant qui le croyait n'affichait rien. L'interface survivait par accident, parce que sa
requête de relecture partait de toute façon.

**La leçon n'est pas « il manquait un test ».** Deux sérialisations d'une même ressource
divergent toujours ; une seule ne peut pas. C'est le passage au synchrone qui a invalidé un
code qui ne mentionnait nulle part l'hypothèse dont il dépendait.

---

## 2026-10-04 — L'ordre des gardes est le message d'erreur

**Décision.** Sur l'envoi d'un devis : ce que l'appelant a mal fait (`422`), puis ce qu'il
n'a pas le droit de voir (`404`), puis ce que l'installation ne sait pas faire (`503`). Le
plan n'est calculé qu'après.

**Motif.** Le refus « l'envoi d'emails n'est pas configuré » venait en premier. Une adresse
mal tapée recevait cette réponse-là, et le projet d'un autre atelier aussi. Elle est vraie,
et elle envoie chercher une configuration là où il y a une faute de frappe.

**Pas une fuite** — la réponse était uniforme —, mais un diagnostic faux coûte le même temps
qu'un bogue.

---

## 2026-10-04 — Un seul endroit où se lisent les plafonds

**Décision.** `quota.ts` porte les clés, le résolveur et les trois états. La table
`organization_quotas` décide ; les revendications du jeton ne sont plus que le repli, pour un
jeton signé par une plateforme qui ne partage pas notre base. Un plafond atteint rend **409**,
des deux côtés.

**Motif.** Il y en avait deux. Les projets lisaient le jeton — donc un plafond réglé par le
patron ne mordait qu'au jeton suivant, jusqu'à quinze minutes plus tard. L'IA lisait la base,
donc tout de suite. Même famille de règle, deux latences : aucune n'était fausse, c'est
l'écart qui l'était.

**Et deux codes pour un même refus.** Le quota d'IA rendait `503` avec le message « votre
quota est épuisé » : le message invitait à relever le plafond, le code à attendre. Une
interface ne peut pas traiter deux fois le même refus si l'API le nomme de deux façons.

**Trois états, et ils ne se confondent pas.** Pas de ligne = non couvert, on laisse le jeton
décider ; `null` = illimité **explicitement**, et plus rien n'est consulté ; un entier =
le plafond. Confondre les deux premiers ferait d'un réglage « illimité » une porte ouverte au
plafond d'un jeton périmé.

**Une revendication morte est tombée au passage** : le jeton portait le plafond d'IA sous
`neftya_ai_analyses_max`, que personne ne lisait. Elle aurait fait croire à un repli là où il
n'y en avait pas.

---

## 2026-10-04 — Sekuu mis de côté ne doit plus être obligatoire

**Décision.** Le vérifieur de plateforme est **optionnel**. Sans `SEKUU_JWKS_URL`, l'API
démarre et ne reconnaît que les jetons locaux. `NEFTYA_JWT_SECRET` et les variables SMTP
entrent dans `.env.example`.

**Motif.** Le serveur exigeait trois variables Sekuu pour démarrer alors que l'identité est
locale : il fallait en inventer trois pointant dans le vide, ce qui est pire que de s'en
passer — on ne sait plus lesquelles servent. Et `.env.example` ne portait pas
`NEFTYA_JWT_SECRET`, sans laquelle le serveur refuse de démarrer : un clone frais ne partait
pas, et le défaut ne se voyait qu'au premier essai.

**Conséquence assumée.** Sans vérifieur, un jeton de plateforme devient un jeton invalide.
C'est ce qu'il est.

---

## 2026-10-04 — Réessayer d'ouvrir une connexion, jamais une requête

**Décision.** Le pool réessaie **l'ouverture** d'une connexion, trois fois, à 250 puis
500 ms. Les requêtes, elles, ne sont jamais rejouées.

**Motif.** Une base serverless s'endort. Au réveil, plusieurs ouvertures simultanées se font
fermer au nez — « Connection terminated unexpectedly » — et la requête rend `500` alors que la
base répond une seconde plus tard. Observé sur une inscription : `500` au bout de cent
secondes, puis `201` à l'essai suivant.

**Pourquoi l'ouverture seulement.** Rejouer une écriture dont on ne sait pas si elle a abouti
est le genre de remède qui crée deux projets pour un clic. Ouvrir une connexion n'a aucun
effet de bord.

**Trois essais, écrits en clair dans le test.** Le test disait d'abord
`toBe(CONNECT_ATTEMPTS)` : il lisait la constante, donc il suivait n'importe quelle valeur.
Porter le plafond à cinquante le laissait passer — et un réessai sans fin masque une panne au
lieu de la rattraper.

**Ce que l'enveloppe a cassé en chemin.** `pool.query()` appelle `connect(callback)`
par-dessous. La première version ignorait ce rappel : les soixante `beforeAll` du banc
d'essai ont dépassé leur délai d'un coup, dix-huit fichiers en échec. La forme à rappel passe
maintenant telle quelle, et un test la tient.

---

## 2026-10-04 — Trois lectures indépendantes ne s'enchaînent pas

**Décision.** `accessFor` et `/v1/auth/me` lisent en parallèle ce qui ne dépend de rien.

**Motif.** Sur une base locale, trois allers-retours à la file ne se voient pas ; sur une base
distante, ils s'additionnent — et `accessFor` est sur le chemin de l'inscription, de la
connexion, du rafraîchissement et du changement d'organisation.

**Mesuré, à chaud, contre une base distante :**

| | avant | après |
|---|---|---|
| `/v1/auth/me` | 490–520 ms | **261 ms** |
| `POST /v1/auth/register` | 3 782 ms | **1 800 ms** |
| `POST /v1/auth/login` | 1 480 ms | 1 095 ms |
| `POST /v1/auth/refresh` | 1 956 ms | 1 575 ms |

**Ce que la parallélisation a révélé.** Trois ouvertures simultanées sur une base endormie,
et un `500`. Le gain était réel, la fragilité préexistante : c'est le réessai à l'ouverture
qui la couvre, pas le retour au séquentiel.

---

## 2026-10-04 — L'intermittence de la suite vient de la base, et rien dans le dépôt ne la corrige

**Décision.** **Aucun changement.** Ni plafond de parallélisme, ni réessai dans le banc
d'essai : les deux ont été essayés, mesurés, et retirés parce qu'ils aggravaient les choses.

**Ce qui a été mesuré**, sur la même base distante, à chaque fois la suite entière :

| | fichiers en échec | durée |
|---|---|---|
| état d'origine | 1 à 2, parfois 0 | 60 à 181 s |
| six fichiers en parallèle | 1 à 2 | 110 s |
| trois fichiers en parallèle | **6** | 313 s |
| pools du banc d'essai avec réessai et `keepAlive` | **6** | 240 s |
| retour à l'état d'origine | 2, **aucun test** en échec | 124 s |

Le réessai dans le banc d'essai se retourne contre lui : `connectionTimeoutMillis` à 20 s,
trois fois, dépasse le délai de trente secondes du `beforeAll`. Une attente qu'on allonge
pour éviter un échec finit par le provoquer ailleurs.

**La cause.** Soixante fichiers, chacun supprimant et recréant son schéma puis rejouant dix
migrations : plus de sept cents instructions DDL, sérialisées par les verrous de catalogue,
sur un lien à 250 ms. En local c'est invisible ; à distance, c'est la durée de la suite et
toute sa variance.

**Le remède est dans `DATABASE_URL`, pas dans le code.** La suite veut une base locale. Un
PostgreSQL 18 tourne déjà sur la machine de développement, port 5432, et `docker compose`
en fournit un. C'est écrit dans le README. Faute d'identifiants, ce n'est pas démontré ici —
annoncé comme une hypothèse étayée, pas comme un fait vérifié.

**Ce qui reste acquis**, et qui n'a rien à voir avec les tests : le réessai à l'ouverture
dans `createDatabase`, qui retire un `500` réel en production.

---

## 2026-10-06 — Sekuu est mis de côté, provisoirement, et voici à quoi on revient

**Décision.** Neftya porte son identité, ses organisations, ses rôles, ses invitations, ses
quotas, son stockage, son IA et son envoi d'emails. La mise de côté est **provisoire**, et
les chemins Sekuu restent en place.

**Motif.** Avancer sans dépendre d'une plateforme encore en chantier. Chaque brique de Sekuu
que Neftya attendait — l'IA à entrée image, le palier gratuit, la clé déléguée à émettre en
console — ajoutait un aller-retour humain avant la moindre vérification.

**Ce que cela renverse.** Le brief disait : *« Les plans appartiennent à Sekuu Billing, pas à
Neftya. Il ne connaît ni plan, ni facture, ni échéance. »* Et la liste de contrôle de
SEKUU.md portait **« Aucune table `users` »**. Il y en a une, plus `memberships`,
`organizations`, `invitations`, `refresh_sessions`, `organization_quotas`. Quinze tables là
où il y en avait cinq.

**Pourquoi ce n'est pas une impasse.** Les jetons locaux sont signés en HS256 mais rendent
**un contexte de la même forme** que celui de Sekuu : `sekuuOf`, `can` et `enforceLimit` ne
savent pas qui a signé. Le retour coûte un vérifieur, pas des contrôleurs. Le
`CompositeVerifier` accepte déjà les deux, et l'absence de plateforme n'est plus une erreur
de démarrage depuis le 4 octobre.

**La condition de retour, écrite pour qu'on n'en débatte pas deux fois.** On rebranche Sekuu
quand les trois tiennent ensemble :

1. la **facturation** devient nécessaire — c'est-à-dire qu'un client paie ; aucune raison de
   porter un module de facturation avant d'avoir une facture à émettre ;
2. un **second produit** doit partager la session — la session unique était le motif
   d'origine, et elle ne vaut qu'à deux ;
3. la plateforme sait faire ce que Neftya fait déjà sans elle, **sans régression** : les
   quotas à trois états, le stockage des exports, et une tâche d'IA à entrée image.

**Ce qu'il faudra réconcilier ce jour-là**, et qu'il vaut mieux savoir maintenant :

- `members` est appliqué en local avec **la clé de la plateforme**, délibérément : au retour,
  c'est la même qui est lue.
- Les plafonds locaux vivent dans `organization_quotas`, les plafonds Sekuu dans les
  revendications du jeton. `resolveLimit` lit déjà la table d'abord et le jeton ensuite :
  l'ordre est le bon, il n'y aura rien à inverser.
- La table `users` ne migre pas vers Sekuu. Les comptes créés localement y resteront, comme
  les médias de DealerOS sont restés sur leur ancien chemin : le risque d'une migration de
  comptes est réel, le gain nul.

**Si rien de tout cela n'arrive**, la mise de côté devient définitive sans qu'on ait rien à
défaire — et c'est aussi pour cela qu'elle est écrite comme provisoire plutôt que comme un
reniement.

---

## 2026-10-06 — Le palier gratuit, et la grille arbitrée

**Décision.** Quatre paliers : Gratuit, Solo 5 000, Pro 15 000, Max 40 000 XAF par mois.
Gratuit à **trois projets, cinq analyses d'IA par mois, un membre, tous les exports**.

**Motif.** Le brief annonçait un freemium ; les plans semés le 4 septembre n'avaient aucun
palier gratuit. J'avais recopié les tarifs de DealerOS sans les confronter au brief, et
personne ne l'avait relevé pendant un mois. L'écart le plus net du projet n'était pas
technique.

**Les exports ne sont pas bridés sur le gratuit**, contrairement à ce que disait le brief. Le
plan de découpe est exactement ce qu'on veut faire essayer à un menuisier : brider le seul
livrable qui prouve la justesse du moteur, c'est brider la démonstration. Et le brider aurait
demandé une notion de droit par fonction, qui n'existe pas — le quota, lui, existe.

**Le frein du gratuit est donc quantitatif, et c'est assumé** : trois projets suffisent à
éprouver le moteur sur de vrais meubles, pas à faire tourner un atelier.

**Mille analyses sur Max plutôt qu'illimité.** L'IA est la seule fonction qui dépense de
l'argent réel à chaque appel. Les autres paliers reprennent les chiffres du brief — 5, 50,
200 — décalés d'un cran par l'arrivée du gratuit.

**Une organisation naît au palier gratuit.** La garde est dans `createOrganization`, le seul
passage obligé : l'inscription et la création d'un second atelier y arrivent toutes les deux.
Les organisations antérieures gardent leur absence de plafond — les plafonner après coup
aurait fermé des projets déjà créés.

**Le tarif ne se réécrit pas.** Une migration de plus ajoute le gratuit et le quota d'IA qui
manquait aux trois payants ; celle du 4 septembre a tourné, et un tarif se cite dans une
facture.

---

## 2026-10-06 — Une image donne une structure et des proportions, jamais des cotes

**Décision.** L'assistant accepte une photo, **la largeur hors-tout**, et **la profondeur si
on la connaît**. Le modèle rend des rapports — `heightRatio`, `depthRatio` — et la structure ;
ce qui manque s'en déduit.

**La seconde mesure n'était pas prévue : elle vient de l'essai.** Contre un vrai modèle, sur
une vue de face, `depthRatio` est revenu `null` — et le modèle avait raison, une vue de face
ne montre aucune profondeur. La garde a refusé plutôt que d'inventer, ce qui était le bon
comportement et rendait inutilisable **le cas le plus courant**. La profondeur est donc
demandée, facultative : une vue de trois quarts permet au modèle de la proposer.

Mesuré ensuite de bout en bout : 1800 mm de large et 350 de profond donnés, `heightRatio`
lu à 1,5 → **1800 × 2700 × 350**, trois compartiments, deux étagères chacun. Le dessin
soumis en portait exactement autant.

**Motif.** Le brief le dit lui-même : « une image ne fournit pas : les dimensions ». Demander
des millimètres à un modèle qui regarde une photo, c'est lui demander d'inventer — et une
cote inventée a exactement l'air d'une cote mesurée. Avec une échelle donnée, un rapport faux
produit une cote fausse **du bon ordre de grandeur**, qui reste corrigeable à l'œil dans le
concepteur. C'est tout l'écart.

**Qui mesure gagne sur qui regarde.** Une profondeur donnée prime sur celle que le modèle
propose, et quand les deux manquent on le dit — avec le champ à remplir, pas avec un reproche
sur une proportion que l'utilisateur ne contrôle pas. Deux reproches pour un seul défaut
égarent celui qui les lit.

**Deux filets, et le second est le vrai.** Les proportions sont bornées entre 0,05 et 20 —
une penderie fait 2,4 fois sa largeur en hauteur, une étagère basse 0,11 ; les bornes
n'arbitrent pas une silhouette, elles attrapent un rapport qui n'a pas de sens. Mais c'est la
vérification **après la mise à l'échelle** qui attrape le reste : 0,06 × 1 000 fait un meuble
de six centimètres, et le rapport n'avait l'air de rien.

**L'échelle est rangée avec la génération**, pas passée à la relecture. Sans elle,
`GET /v1/assistant/interpretations/{id}` lirait des proportions sans savoir par quoi les
multiplier, et rendrait « inutilisable » un résultat parfaitement bon. Une colonne
`width_mm`, `null` pour une description écrite — et c'est ce `null` qui dit à la relecture
quelle composition appliquer.

**L'image n'est pas enregistrée.** La ligne garde l'empreinte et la largeur. Trois mégaoctets
de base64 par génération rendraient la table illisible et les sauvegardes absurdes, et la
photo appartient à l'utilisateur : elle n'a aucune raison de rester ici.

**Trois formats, et pas un de plus** — PNG, JPEG, WebP. En accepter d'autres demanderait de
les convertir, donc de les décoder sur le serveur, et un décodeur d'image est une surface
d'attaque qu'on n'ouvre pas pour deviner un nombre de compartiments. Une URL distante est
refusée pour la même raison : ce serait une requête sortante décidée par l'appelant.

**`detail: 'low'`.** Une vignette suffit à compter des compartiments et à juger une
proportion. Le coût d'une image est proportionnel au nombre de tuiles qu'elle occupe, et
personne ne relit la facture d'une photo.

**La plateforme refuse franchement.** `SekuuAI.extract` lève dès qu'une image lui est
passée, **sans appeler** : aucune de ses tâches n'en accepte, et son périmètre de V1 exclut
l'OCR. Envoyer quand même, c'est se faire rejeter — ou, pire, se faire accepter en voyant
l'image ignorée, et payer pour une réponse inventée.

**Ce que l'obstacle était, et ce qu'il est devenu.** Le 1er octobre, ce poste était bloqué
par la plateforme. Le passage à un modèle direct l'a débloqué sans que personne le remarque :
`gpt-4o-mini` lit les images. L'obstacle avait changé de nature pendant cinq jours.

---

## 2026-10-06 — Une contrainte posée dans un seul schéma n'en protège aucun

**Décision.** Les tests d'existence de contrainte filtrent la **relation**, pas seulement le
nom : `AND conrelid = 'organization_quotas'::regclass`.

**Motif.** La migration `0011` testait `pg_constraint` sur le nom seul. Un nom de contrainte
est unique par schéma, pas dans `pg_constraint` : dans une base qui porte soixante schémas de
test, le premier posait la contrainte et les cinquante-neuf autres la croyaient déjà là.

**Ce n'est visible qu'en test**, et c'est précisément ce qui la rendait dangereuse : en
production, une base d'un seul schéma la pose toujours. La garde manquait donc partout où elle
aurait servi à prouver qu'elle marche.

**Vérifié en appliquant les douze migrations dans deux schémas d'une même base** : deux
contraintes posées dans chacun, là où il n'y en avait qu'une.

---

## 2026-10-06 (après-midi) — Proposer une cote qu'on relit vaut mieux que n'en proposer aucune

**Décision.** Avec une image, **toutes les cotes sont facultatives**. Le modèle propose une
largeur et une profondeur d'après ce qu'il reconnaît ; ce que l'utilisateur donne gagne
toujours. La hauteur, elle, continue de venir d'une **proportion** appliquée à la largeur
retenue.

**Ce que cela révise.** Le matin même, on refusait de composer sans échelle : « demander des
millimètres à un modèle qui regarde une photo, c'est lui demander d'inventer ». C'est vrai, et
ce n'était pas la bonne conclusion — refuser laissait la personne devant un écran vide à
remplir de mémoire, alors que la configuration s'affiche de toute façon **avec ses cotes en
clair, avant qu'aucun projet n'existe**. Le garde-fou n'était pas le refus : c'est l'écran de
relecture, et il existait déjà.

**Ce qui n'a pas changé, et qui tient tout.** La hauteur vient d'un rapport, parce qu'un
rapport est ce que la photo montre vraiment. Les millimètres proposés sont une **typologie** —
une bibliothèque fait couramment 800 à 1000 de large — et l'invite le dit au modèle dans ces
termes : des ordres de grandeur à relire, pas des mesures. Les bornes de vraisemblance
s'appliquent aux propositions comme au reste : une proposition absurde use plus de confiance
qu'une absence.

**On refuse encore quand rien ne tient.** Ni proportion, ni proposition : composer là
reviendrait à inventer nous-mêmes, ce qui est un autre sujet que de relayer une estimation
annoncée comme telle.

**Un drapeau remplace une déduction.** La relecture distinguait l'image par la présence d'une
largeur ; la largeur étant devenue facultative, une photo sans cote aurait été relue comme une
description, et ses proportions lues comme des cotes absentes. `from_image` le dit au lieu de
le faire deviner à une colonne qui parlait d'autre chose.

**Mesuré contre le vrai modèle**, sur le même dessin : image seule → 900 × 1350 × 300 ;
largeur donnée à 1500 → 1500 × 2250 × 300. Le rapport 1,5 traverse les deux.
