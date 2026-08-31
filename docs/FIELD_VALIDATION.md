# Validation terrain

> **Le critère de sortie de la V1 ne peut pas être atteint par du logiciel.**
>
> « Un menuisier prend le plan généré par Neftya, coupe ses panneaux, et le meuble se monte
> sans reprise. Trois fois, sur trois meubles différents. »
>
> Il faut un menuisier, des panneaux, une scie, et du temps d'atelier. Ce document est ce
> qu'on peut préparer sans eux : le protocole, les trois meubles, la feuille de mesures et
> la règle qui dit ce qu'on fait d'un écart.

**État au 31 août 2026 : non commencée.** Aucun panneau n'a été coupé. Tout ce qui suit est
prêt à être exécuté, et rien de ce qui suit n'a été exécuté.

---

## 1. Trouver le menuisier — d'abord

Le plan d'implémentation le disait dès la phase 1 :

> Trouver quelqu'un qui accepte de couper des panneaux pour valider un logiciel prend plus
> de temps qu'on ne croit, et cette phase est inutile sans lui.

Ce qu'il faut lui demander, et qu'il faut savoir avant de demander :

- **environ deux jours d'atelier**, répartis sur trois meubles ;
- **le coût des panneaux** — six panneaux au total, à la charge du projet ;
- l'accord d'être **contredit par le résultat** : un meuble qui ne se monte pas est le
  résultat le plus utile de la phase.

Choisir quelqu'un qui travaille **au millimètre**, pas au décor : un atelier impérial
validerait autre chose que ce que le moteur calcule.

---

## 2. Les trois meubles

Ils ne sont pas choisis pour être faciles. Chacun met à l'épreuve une partie différente du
moteur, et chacun peut échouer indépendamment.

### Meuble A — la bibliothèque de référence

`1800 × 600 × 400`, deux compartiments, une étagère chacun, MDF 18 mm, avec fond.

C'est le meuble du §2 de [MANUFACTURING.md](MANUFACTURING.md), celui dont le plan de
découpe est documenté au millimètre : un panneau de 18 mm à 93,2 %, un de 8 mm pour le
fond. **S'il ne se monte pas, rien d'autre n'a d'intérêt.**

Ce qu'il éprouve : les cotes intérieures, la recomposition, le fond en rainure.

### Meuble B — le meuble à tiroirs

`1000 × 900 × 500`, deux compartiments de quatre tiroirs, MDF 18 mm.

Ce qu'il éprouve : **les jeux**. Treize millimètres par côté pour les coulisses, dix à
l'arrière, trois entre deux façades. Ce sont les cotes que le moteur calcule et que
personne ne peut vérifier à l'écran — un tiroir qui coince ou qui flotte se voit
uniquement en le glissant.

C'est le meuble le plus susceptible d'échouer, et c'est pour cela qu'il est dans la liste.

### Meuble C — le meuble étiré

`2600 × 2000 × 350`, cinq compartiments inégaux, trois étagères dans deux d'entre eux,
mélaminé 18 mm.

Ce qu'il éprouve : la **propagation par étirement** sur une grande largeur, la flèche des
étagères longues, et le placement sur deux panneaux — donc l'ordre de découpe.

---

## 3. Le protocole

Pour chaque meuble, dans cet ordre. Ne pas sauter d'étape, et surtout pas la première.

1. **Concevoir dans Neftya**, sans corriger à la main. Si l'interface ne permet pas
   d'exprimer le meuble, c'est un résultat : le noter et s'arrêter là.
2. **Exporter le dossier** : plan de découpe PDF, liste de découpe CSV, plans techniques
   cotés, guide d'assemblage.
3. **Ne rien expliquer au menuisier.** Il coupe d'après le plan, pas d'après une
   conversation. Un plan qui a besoin d'être commenté est un plan qui a échoué.
4. **Couper**, en notant chaque fois que le plan est ambigu, incomplet ou faux.
5. **Mesurer chaque pièce coupée** avant montage, et reporter l'écart avec la cote du plan.
6. **Monter**, en suivant le guide, étape par étape.
7. **Mesurer le meuble monté** : hors-tout, équerrage, jeux de tiroirs.

---

## 4. La feuille de mesures

Une par meuble. Les colonnes sont ce qu'on ne peut pas reconstituer après coup.

| Pièce | Cote plan | Cote mesurée | Écart | Cause présumée |
| --- | --- | --- | --- | --- |
| P01 | | | | |
| P02 | | | | |
| … | | | | |

**Hors-tout du meuble monté**

| | Plan | Mesuré | Écart |
| --- | --- | --- | --- |
| Largeur | | | |
| Hauteur | | | |
| Profondeur | | | |
| Diagonale 1 | | | |
| Diagonale 2 | | | |

Les deux diagonales disent l'équerrage : un écart entre elles signale un caisson en
parallélogramme, ce qu'aucune cote de pièce ne révèle.

**Tiroirs** (meuble B)

| Tiroir | Jeu gauche | Jeu droit | Jeu entre façades | Coulisse |
| --- | --- | --- | --- | --- |
| | | | | libre / dure / coince |

**Journal des difficultés**

Ce que le protocole ne prévoit pas : une consigne d'assemblage incompréhensible, une pièce
introuvable sur le plan de découpe, un repère illisible. C'est souvent ce qui a le plus de
valeur, et c'est ce qu'on oublie de noter.

---

## 5. Ce qu'on fait d'un écart

La règle est décidée **avant** de mesurer. Décider après, c'est décider en fonction du
résultat.

| Écart constaté | Ce que cela met en cause | Décision |
| --- | --- | --- |
| Cote de pièce ≠ cote du plan | la scie, ou le trait de scie réel | mesurer le trait de scie de l'atelier, corriger `kerfMm` — pas le moteur |
| Toutes les pièces d'un panneau décalées du même écart | le paramètre de trait de scie | idem |
| Une seule cote fausse, reproductible | **le moteur** | retour en phase 1, avec un test qui échoue avant correction |
| Le meuble monté hors-tout juste, mais pas d'équerre | l'assemblage, ou le fond | vérifier la rainure et le retrait du fond |
| Un tiroir qui coince | les jeux | ce sont des paramètres, pas des constantes : les ajuster et redocumenter |
| Une pièce absente du plan de découpe | **défaut grave** | le placement signale déjà les pièces non plaçables ; si elle n'a pas été signalée, c'est un bug |
| Le guide d'assemblage induit en erreur | la séquence, portée par le modèle | la corriger dans le modèle prédéfini concerné |

> **Un écart découvert ici vaut mieux que le même écart découvert par un client.** C'est
> l'intérêt de la phase, pas son risque.

### La règle du test d'abord

Tout écart imputé au moteur donne lieu à **un test qui échoue avant la correction**. Sans
cela, on corrige un cas et on en casse un autre, et la validation terrain aurait servi à
introduire un défaut.

---

## 6. Ce que la phase ne prouvera pas

À nommer maintenant, pour ne pas le confondre plus tard avec un succès.

- **La fluidité sur un mobile d'entrée de gamme.** Elle demande l'appareil, pas l'atelier.
  Elle reste ouverte depuis la phase 3.
- **Le dépôt chez Sekuu Storage.** Il demande une clé d'API que le projet n'a pas encore.
- **Le comportement à l'échelle.** Trois meubles disent que le moteur a raison, pas que le
  service tient la charge.
- **L'impérial.** Les trois meubles sont métriques ; un atelier impérial validerait autre
  chose, et il faudrait un second menuisier.
