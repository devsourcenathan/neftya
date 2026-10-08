# L'image de partage

`apps/web/public/og.jpg` est ce qu'affichent WhatsApp, LinkedIn et X quand on partage le
lien. Elle n'est pas une illustration : elle montre **un vrai plan de découpe**, produit par
le moteur, avec ses repères et son rendement réels. C'est la promesse de la page, prouvée
avant même qu'on l'ouvre.

## La refaire

```bash
node scripts/og/cut-plan.mjs scripts/og/cutplan.svg   # le plan, depuis le moteur
```

Puis ouvrir `scripts/og/og.html` dans un navigateur à **1200 × 630** et capturer la page.
Le fichier livré fait 800 × 420 — au-dessus du minimum des plateformes (600 × 315), mais en
dessous de l'idéal. Une capture à 1200 × 630 sur un écran assez large le remplace sans
rien changer d'autre que `og:image:width` et `og:image:height` dans `apps/web/index.html`.

**Les chiffres du bas sont écrits en dur dans `og.html`** et proviennent de la sortie du
script. Changer le meuble d'exemple veut dire les reporter : une image qui annonce un
rendement que le plan ne montre pas est pire qu'une image sans chiffres.
