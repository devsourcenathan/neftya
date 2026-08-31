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
