import fs from 'fs';
import path from 'path';

const frPath = path.resolve('apps/web/src/locales/fr.json');
const enPath = path.resolve('apps/web/src/locales/en.json');

const fr = JSON.parse(fs.readFileSync(frPath, 'utf8'));
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));

const landingFr = {
  "nav": {
    "howItWorks": "Comment ça marche",
    "forWho": "Pour qui ?",
    "why": "Pourquoi Neftya",
    "pricing": "Tarifs",
    "login": "Se connecter",
    "freeTrial": "Essai gratuit"
  },
  "hero": {
    "title": "De l'inspiration au meuble",
    "titleHighlight": "réellement fabricable",
    "subtitle": "Neftya transforme une idée, une image ou une simple description en un projet complet : plans, dimensions précises, liste de découpe et devis. Sans modélisation complexe.",
    "startTrial": "Démarrer l'essai gratuit",
    "discoverFlow": "Découvrir le flux",
    "visual1Title": "Image & Inspiration",
    "visual1Desc": "\"Une bibliothèque asymétrique en chêne...\"",
    "visual2Title": "Plan de Découpe Précis",
    "visual2Desc": "12 panneaux optimisés, cotes exactes, assemblage prêt."
  },
  "pipeline": {
    "title": "Le seul outil dont vous avez besoin avant l'atelier",
    "subtitle": "De la conception à l'export technique en un flux continu.",
    "step1Title": "1. Inspiration",
    "step1Desc": "Saisissez une image, une description ou une idée. L'IA ou l'éditeur vous accompagne.",
    "step2Title": "2. Conception 2D/3D",
    "step2Desc": "Ajustez structure, épaisseurs et matériaux en temps réel. Les dimensions s'adaptent.",
    "step3Title": "3. Optimisation & Découpe",
    "step3Desc": "Générez la liste des pièces et calepinez vos panneaux sans gaspillage.",
    "step4Title": "4. Devis & Exports",
    "step4Desc": "Estimez les coûts, exportez vos plans techniques et instructions de montage."
  },
  "audiences": {
    "title": "Pensé pour votre façon de fabriquer",
    "targetPrimary": "CIBLE PRINCIPALE",
    "woodworkersTitle": "Menuisiers & Artisans",
    "woodworkersDesc": "Gagnez un temps précieux entre le devis client et le plan de découpe. Ne perdez plus d'heures à modéliser chaque planche.",
    "woodworkersPoint1": "Précision des cotes au millimètre",
    "woodworkersPoint2": "Devis automatisé et juste",
    "woodworkersPoint3": "Listes de découpe prêtes pour l'atelier",
    "woodworkersCta": "Essai Pro Gratuit",
    "diyTitle": "Particuliers & DIY",
    "diyDesc": "Passez de l'envie de bricoler à la réalisation. Neftya calcule pour vous ce qu'il faut acheter et comment assembler.",
    "diyPoint1": "Visualisation avant d'acheter le bois",
    "diyPoint2": "Quantités exactes (zéro erreur)",
    "diyPoint3": "Instructions de montage pas-à-pas",
    "diyCta": "Créer mon premier meuble",
    "workshopTitle": "Ateliers de Fabrication",
    "workshopDesc": "Standardisez votre production et collaborez à plusieurs sur les mêmes projets avec une gestion centralisée.",
    "workshopPoint1": "Multi-utilisateurs et gestion d'équipe",
    "workshopPoint2": "Bibliothèque de standards",
    "workshopPoint3": "Gestion des clients",
    "workshopCta": "Découvrir l'offre Équipe"
  },
  "comparison": {
    "title": "Neftya vs Le reste du monde",
    "subtitle": "Pourquoi passer des heures sur AutoCAD, SketchUp ou Fusion 360 quand votre but est de fabriquer, pas de devenir modeleur 3D ?",
    "cadTitle": "Logiciels de CAO classiques",
    "cadPoint1": "Courbe d'apprentissage très raide",
    "cadPoint2": "Modélisation manuelle de chaque épaisseur",
    "cadPoint3": "Plugins tiers nécessaires (ex: OpenCutList)",
    "cadPoint4": "Complexité inutile pour du mobilier",
    "neftyaTitle": "Neftya",
    "neftyaPoint1": "Prise en main immédiate et structurée",
    "neftyaPoint2": "Génération native orientée fabrication",
    "neftyaPoint3": "Listes et plans techniques intégrés",
    "neftyaPoint4": "Concentré sur le résultat final : le meuble"
  },
  "pricing": {
    "title": "Des tarifs simples. Essayez gratuitement.",
    "freeName": "Free",
    "freeDesc": "Idéal pour concevoir son premier projet.",
    "freePoint1": "Conception 3D",
    "freePoint2": "Dimensions globales",
    "freePoint3": "1 projet max",
    "freeCta": "Commencer",
    "proName": "Pro",
    "proDesc": "Pour les artisans indépendants.",
    "proPoint1": "Devis automatiques",
    "proPoint2": "Exports techniques & calepinage",
    "proPoint3": "Projets illimités",
    "proCta": "Essai gratuit 14 jours",
    "profName": "Professional",
    "profDesc": "Pour les ateliers structurés.",
    "profPoint1": "Tout le plan Pro",
    "profPoint2": "Multi-utilisateurs",
    "profPoint3": "Gestion de bibliothèque partagée",
    "profCta": "Essai gratuit 14 jours"
  },
  "footer": {
    "copyright": "Neftya. L'outil des menuisiers de demain."
  }
};

const landingEn = {
  "nav": {
    "howItWorks": "How it works",
    "forWho": "For who?",
    "why": "Why Neftya",
    "pricing": "Pricing",
    "login": "Log in",
    "freeTrial": "Free trial"
  },
  "hero": {
    "title": "From inspiration to",
    "titleHighlight": "truly manufacturable furniture",
    "subtitle": "Neftya transforms an idea, an image, or a simple description into a complete project: plans, precise dimensions, cut list, and quotes. Without complex modeling.",
    "startTrial": "Start free trial",
    "discoverFlow": "Discover the flow",
    "visual1Title": "Image & Inspiration",
    "visual1Desc": "\"An asymmetrical oak bookcase...\"",
    "visual2Title": "Precise Cut Plan",
    "visual2Desc": "12 optimized panels, exact dimensions, ready for assembly."
  },
  "pipeline": {
    "title": "The only tool you need before the workshop",
    "subtitle": "From design to technical export in a continuous flow.",
    "step1Title": "1. Inspiration",
    "step1Desc": "Enter an image, a description or an idea. The AI or editor guides you.",
    "step2Title": "2. 2D/3D Design",
    "step2Desc": "Adjust structure, thicknesses and materials in real time. Dimensions adapt.",
    "step3Title": "3. Optimization & Cutting",
    "step3Desc": "Generate the parts list and layout your panels without waste.",
    "step4Title": "4. Quotes & Exports",
    "step4Desc": "Estimate costs, export your technical plans and assembly instructions."
  },
  "audiences": {
    "title": "Designed for how you build",
    "targetPrimary": "PRIMARY TARGET",
    "woodworkersTitle": "Woodworkers & Artisans",
    "woodworkersDesc": "Save precious time between the client quote and the cut plan. Stop wasting hours modeling every board.",
    "woodworkersPoint1": "Millimeter precision dimensions",
    "woodworkersPoint2": "Automated and accurate quotes",
    "woodworkersPoint3": "Cut lists ready for the workshop",
    "woodworkersCta": "Free Pro Trial",
    "diyTitle": "Individuals & DIY",
    "diyDesc": "Go from wanting to build to actually doing it. Neftya calculates what you need to buy and how to assemble it.",
    "diyPoint1": "Visualize before buying wood",
    "diyPoint2": "Exact quantities (zero errors)",
    "diyPoint3": "Step-by-step assembly instructions",
    "diyCta": "Create my first furniture",
    "workshopTitle": "Manufacturing Workshops",
    "workshopDesc": "Standardize your production and collaborate with multiple people on the same projects with centralized management.",
    "workshopPoint1": "Multi-user and team management",
    "workshopPoint2": "Standards library",
    "workshopPoint3": "Client management",
    "workshopCta": "Discover the Team plan"
  },
  "comparison": {
    "title": "Neftya vs The rest of the world",
    "subtitle": "Why spend hours on AutoCAD, SketchUp or Fusion 360 when your goal is to build, not become a 3D modeler?",
    "cadTitle": "Classic CAD Software",
    "cadPoint1": "Very steep learning curve",
    "cadPoint2": "Manual modeling of every thickness",
    "cadPoint3": "Third-party plugins required (e.g. OpenCutList)",
    "cadPoint4": "Unnecessary complexity for furniture",
    "neftyaTitle": "Neftya",
    "neftyaPoint1": "Immediate and structured onboarding",
    "neftyaPoint2": "Native manufacturing-oriented generation",
    "neftyaPoint3": "Integrated lists and technical plans",
    "neftyaPoint4": "Focused on the final result: the furniture"
  },
  "pricing": {
    "title": "Simple pricing. Try it for free.",
    "freeName": "Free",
    "freeDesc": "Ideal for designing your first project.",
    "freePoint1": "3D Design",
    "freePoint2": "Overall dimensions",
    "freePoint3": "1 project max",
    "freeCta": "Start",
    "proName": "Pro",
    "proDesc": "For independent artisans.",
    "proPoint1": "Automated quotes",
    "proPoint2": "Technical exports & panel layout",
    "proPoint3": "Unlimited projects",
    "proCta": "14-day free trial",
    "profName": "Professional",
    "profDesc": "For structured workshops.",
    "profPoint1": "Everything in Pro",
    "profPoint2": "Multi-user",
    "profPoint3": "Shared library management",
    "profCta": "14-day free trial"
  },
  "footer": {
    "copyright": "Neftya. The tool for the woodworkers of tomorrow."
  }
};

fr.landing = landingFr;
en.landing = landingEn;

fs.writeFileSync(frPath, JSON.stringify(fr, null, 2) + '\n');
fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');

console.log('Done updating locales');
