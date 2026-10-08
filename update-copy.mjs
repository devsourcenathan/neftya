import fs from 'fs';
import path from 'path';

const frPath = path.resolve('apps/web/src/locales/fr.json');
const enPath = path.resolve('apps/web/src/locales/en.json');

const fr = JSON.parse(fs.readFileSync(frPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

// Update French copy
fr.landing.hero.title = "De l'inspiration au plan de fabrication,";
fr.landing.hero.titleHighlight = "sans modélisation 3D";
fr.landing.hero.subtitle = "Neftya transforme votre inspiration (image, croquis, description) en un projet complet. Calepinage, liste de débit, coûts exacts et plans de montage : prêt pour l'atelier en quelques minutes.";
fr.landing.hero.startTrial = "Lancer mon 1er projet gratuitement";

fr.landing.pipeline.title = "Concevoir pour fabriquer, pas juste pour visualiser";
fr.landing.pipeline.subtitle = "Arrêtez de jongler entre logiciels. Du croquis au panneau découpé, tout est là.";

fr.landing.audiences.woodworkersDesc = "Passez de la visite client au devis précis et au plan de débit en quelques clics. Fini les heures perdues à redessiner chaque assemblage sur SketchUp.";
fr.landing.audiences.woodworkersCta = "Essayer l'outil Pro gratuitement";

fr.landing.comparison.title = "Pourquoi nous avons créé Neftya";
fr.landing.comparison.subtitle = "Les outils actuels vous obligent à être dessinateur industriel avant d'être fabricant. Neftya inverse la logique : vous décrivez, il modélise, vous fabriquez.";
fr.landing.comparison.neftyaPoint1 = "Génération native orientée atelier (plans, calepinage)";
fr.landing.comparison.neftyaPoint2 = "Zero compétence en CAO requise";

// Update English copy
en.landing.hero.title = "From inspiration to manufacturing plan,";
en.landing.hero.titleHighlight = "without 3D modeling";
en.landing.hero.subtitle = "Neftya transforms your inspiration (image, sketch, description) into a complete project. Panel layout, cut list, exact costs and assembly plans: ready for the workshop in minutes.";
en.landing.hero.startTrial = "Start your 1st project for free";

en.landing.pipeline.title = "Design to build, not just to visualize";
en.landing.pipeline.subtitle = "Stop juggling software. From sketch to cut panel, everything is here.";

en.landing.audiences.woodworkersDesc = "Go from client visit to precise quote and cut plan in just a few clicks. No more wasted hours redrawing every joint in SketchUp.";
en.landing.audiences.woodworkersCta = "Try the Pro tool for free";

en.landing.comparison.title = "Why we built Neftya";
en.landing.comparison.subtitle = "Current tools force you to be an industrial designer before you can be a builder. Neftya reverses the logic: you describe, it models, you build.";
en.landing.comparison.neftyaPoint1 = "Native workshop-oriented generation (plans, layout)";
en.landing.comparison.neftyaPoint2 = "Zero CAD skills required";

fs.writeFileSync(frPath, JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');

console.log('Copy updated successfully');
