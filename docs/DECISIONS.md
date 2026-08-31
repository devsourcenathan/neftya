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
