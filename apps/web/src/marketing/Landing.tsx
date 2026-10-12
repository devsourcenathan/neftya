import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '@neftya/units';
import { anonymousApi } from '../api/client.js';
import { getPublicPlans } from '../api/projects.js';
import {
  currenciesOf,
  preferredCurrency,
  rememberCurrency,
} from '../billing/currency.js';
import { rememberIntendedPlan } from '../billing/intent.js';
import { monthlyEquivalent, yearlyAdvantage } from '../billing/offers.js';
import { AuthScreens } from '../sekuu/AuthScreens.js';
import {
  AssistantIcon,
  CheckIcon,
  CloseIcon,
  CubeIcon,
  MenuIcon,
  PlanIcon,
  ToolsIcon,
} from '../ui/icons.js';

/** Les sections de la page, et l'ordre dans lequel on les parcourt. */
const SECTIONS = [
  { href: '#pipeline', label: 'landing.nav.howItWorks' },
  { href: '#audiences', label: 'landing.nav.forWho' },
  { href: '#comparatif', label: 'landing.nav.why' },
  { href: '#tarifs', label: 'landing.nav.pricing' },
] as const;

export function Landing() {
  const { t, i18n } = useTranslation();
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null);

  /*
   * Le menu des sections, sur téléphone.
   *
   * Les quatre liens étaient simplement masqués sous `md`, sans rien pour les atteindre :
   * un visiteur sur téléphone ne pouvait aller ni aux tarifs, ni au comparatif, ni au
   * reste. Ils n'étaient pas « moins importants sur petit écran » — ils étaient perdus.
   */
  const [sections, setSections] = useState(false);

  /*
   * Le catalogue, demandé au serveur — **avant tout retour anticipé**.
   *
   * Les tarifs étaient écrits dans cette page : une seconde source de vérité, qui aurait
   * annoncé 29 € le jour où l'environnement en dit 39. C'est le montant de
   * l'environnement qui est débité ; celui qu'on affiche doit venir du même endroit.
   *
   * Placé après le `if (authMode)` plus bas, ce crochet ne s'exécutait plus au passage à
   * l'inscription : React compte les crochets d'un rendu à l'autre, et la page devenait
   * blanche au clic sur une offre. C'est la deuxième fois que ce défaut se produit dans
   * ce projet — un crochet ne se met jamais après un `return`.
   *
   * `retry: false` : si l'API ne répond pas, la section garde ses libellés et perd ses
   * prix. Mieux vaut une page incomplète qu'une page qui tourne en rond sur un visiteur.
   */
  const catalogue = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => getPublicPlans(anonymousApi),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  /*
   * La cadence affichée. Mensuelle d'abord : c'est l'engagement le plus court.
   *
   * **L'annuel n'était visible nulle part.** La page ne gardait que les prix mensuels, si
   * bien que deux mois offerts sur douze — le seul vrai levier commercial du produit —
   * n'apparaissaient qu'après la création d'un compte. Personne ne crée un compte pour
   * découvrir un prix.
   */
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');

  /*
   * La devise affichée, **une seule à la fois**.
   *
   * La page montrait « 29,00 € · 5 000 FCFA » sur chaque carte : cinq nombres et deux
   * monnaies pour trois offres, et un visiteur qui doit trier avant de comprendre. Elle
   * est devinée du fuseau horaire, et le bouton à côté des tarifs permet d'en changer —
   * deviner sans laisser corriger serait pire que tout afficher.
   *
   * `null` jusqu'au premier rendu du catalogue : on ne choisit pas parmi des devises
   * qu'on ne connaît pas encore.
   */
  const [chosenCurrency, setChosenCurrency] = useState<string | null>(null);

  if (authMode) {
    return <AuthScreens initialMode={authMode} />;
  }

  const navigateToAuth = (mode: 'login' | 'register') => (e: React.MouseEvent) => {
    e.preventDefault();
    setAuthMode(mode);
    window.scrollTo(0, 0);
  };

  const priced = new Map(
    (catalogue.data?.plans ?? []).map((plan) => [plan.code, plan] as const),
  );

  /*
   * Y a-t-il quelque chose à vendre, ici et maintenant ?
   *
   * Deux phrases en dépendent, et elles étaient écrites pour l'époque où la réponse était
   * non : « les offres payantes arrivent » et « créer mon compte gratuit » sur un bouton
   * qui mène désormais à l'abonnement. Les laisser aurait été le même défaut que les
   * tarifs en dur — un texte qui ne suit plus ce que le produit fait.
   */
  const selling = [...priced.values()].some(
    (plan) => plan.code !== 'free' && plan.prices.length > 0,
  );

  const everyPrice = [...priced.values()].flatMap((plan) => plan.prices);
  const currencies = currenciesOf(everyPrice);
  const currency = chosenCurrency ?? preferredCurrency(currencies);

  const pickCurrencyFor = (code: string) => {
    setChosenCurrency(code);
    rememberCurrency(code);
  };

  /** Le prix d'une offre dans la devise et la cadence affichées, ou `undefined`. */
  const priceOf = (code: string, forPeriod: 'monthly' | 'yearly' = period) =>
    priced
      .get(code)
      ?.prices.find(
        (price) => price.currency === currency && price.period === forPeriod,
      );

  /*
   * L'annuel ne se propose que s'il existe quelque part dans cette devise.
   *
   * Un bouton « Annuel » qui ne révélerait que des « bientôt » poserait une question au
   * visiteur là où il n'y a pas de réponse.
   */
  const hasYearly = everyPrice.some(
    (price) => price.currency === currency && price.period === 'yearly',
  );

  /*
   * L'avantage de l'annuel, **calculé des prix réels**.
   *
   * Écrit à la main, il mentirait au premier changement de tarif ; et il n'est annoncé que
   * s'il existe, car prétendre une remise qui n'existe pas se vérifie en une division. On
   * le prend sur l'offre mise en avant, qui est celle que le badge accompagne.
   */
  const advantage = (() => {
    const monthly = priceOf('pro', 'monthly');
    const yearly = priceOf('pro', 'yearly');

    if (!monthly || !yearly) return null;

    return yearlyAdvantage(monthly.amount_minor, yearly.amount_minor);
  })();

  const advantageLabel =
    advantage === null
      ? null
      : advantage.kind === 'months'
        ? t('landing.pricing.monthsFree', { count: advantage.months })
        : t('landing.pricing.percentOff', { percent: advantage.percent });

  /**
   * Partir vers l'inscription **en retenant l'offre choisie**.
   *
   * On ne peut pas payer sans compte : le bouton mène donc à l'inscription. Sans cette
   * mémoire, le visiteur qui a cliqué « Pro » se retrouverait sur la liste de ses projets,
   * à chercher où il avait vu ce prix.
   *
   * Et on ne l'envoie pas droit au paiement : ouvrir une page de carte bancaire dans la
   * seconde qui suit une inscription ressemble à un piège. Il arrive sur la facturation,
   * son offre mise en avant, et c'est lui qui clique.
   */
  const choosePlan = (code: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    rememberIntendedPlan(code);
    setAuthMode('register');
    window.scrollTo(0, 0);
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'fr' ? 'en' : 'fr');
  };

  return (
    <div className="min-h-screen bg-canvas text-ink font-sans selection:bg-primary/20 overflow-x-hidden">
      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
        @keyframes float-delay {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        .animate-float-slow { animation: float-slow 6s ease-in-out infinite; }
        .animate-float-delay { animation: float-delay 7s ease-in-out infinite; animation-delay: 1s; }
        .perspective-1000 { perspective: 1000px; }
        .tilt-left { transform: rotateY(-5deg) rotateX(2deg); }
        .tilt-right { transform: rotateY(5deg) rotateX(2deg); }
        .shadow-antigravity { box-shadow: 0 20px 60px -15px rgba(0,0,0,0.1); }

        /* Modern CSS Scroll-driven animations */
        @media (prefers-reduced-motion: no-preference) {
          @supports ((animation-timeline: view()) and (animation-range: entry)) {
            @keyframes fade-slide-in {
              from {
                opacity: 0;
                transform: translateY(50px) scale(0.95);
                filter: blur(5px);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
                filter: blur(0px);
              }
            }
            .animate-on-scroll {
              animation: fade-slide-in linear both;
              animation-timeline: view();
              animation-range: entry 10% cover 30%;
            }
          }
        }
      `}</style>
      {/* Navigation */}
      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-hairline bg-surface/80 px-4 py-3 sm:px-6 sm:py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-primary text-surface">
            <CubeIcon />
          </span>
          {/* Le cube seul sous `sm` : avec le mot, la barre réclamait 385 px pour 375. Le
              logo reste reconnaissable, et le nom est dans la première phrase du titre. */}
          <span className="hidden text-xl font-bold tracking-tight text-ink sm:inline">
            {t('app.name')}
          </span>
        </div>
        {/* Les mêmes liens, deux mises en forme : en ligne au-dessus de `md`, dans un
            panneau déroulant en dessous. Écrire deux listes aurait garanti qu'un jour
            l'une oublie une section que l'autre a. */}
        <div className="hidden items-center gap-8 text-sm font-medium md:flex">
          {SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className="text-ink-variant transition-colors hover:text-ink"
            >
              {t(section.label)}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1 sm:gap-4">
          {/* Sous `md`, le seul chemin vers les sections. Sans lui, les quatre liens
              existaient dans le document et n'étaient atteignables par personne. */}
          <button
            type="button"
            onClick={() => setSections(!sections)}
            aria-expanded={sections}
            aria-label={t(sections ? 'landing.nav.closeMenu' : 'landing.nav.openMenu')}
            className="min-h-11 px-2 text-ink-variant transition-colors hover:text-ink md:hidden"
          >
            <span aria-hidden="true">{sections ? <CloseIcon /> : <MenuIcon />}</span>
          </button>

          {/* Les trois contrôles font au moins 44 px de haut : c'est la taille d'un doigt, et
              un sélecteur de langue de 20 px se rate une fois sur deux. */}
          <button
            onClick={toggleLanguage}
            className="min-h-11 px-2 text-sm font-medium text-ink-variant hover:text-ink transition-colors uppercase"
          >
            {i18n.language === 'fr' ? 'EN' : 'FR'}
          </button>

          {/* **Visible sur téléphone**, et c'est le point : la connexion était masquée sous
              `md` sans menu pour la rattraper. Un client qui revient depuis l'atelier n'avait
              aucun chemin vers son compte — il n'allait pas s'inscrire une seconde fois. */}
          <button
            onClick={navigateToAuth('login')}
            className="min-h-11 px-2 text-sm font-medium whitespace-nowrap text-ink hover:text-primary transition-colors"
          >
            {t('landing.nav.login')}
          </button>

          <button
            onClick={navigateToAuth('register')}
            className="min-h-11 whitespace-nowrap rounded-full bg-primary px-4 sm:px-5 text-sm font-bold text-surface shadow-md hover:bg-primary/90 transition-all active:scale-95"
          >
            {/* Le libellé court tient à 375 px à côté de « Se connecter ». Au-dessus de `sm`,
                la promesse complète reprend sa place. */}
            <span className="sm:hidden">{t('landing.nav.freeTrialShort')}</span>
            <span className="hidden sm:inline">{t('landing.nav.freeTrial')}</span>
          </button>
        </div>
        {sections && (
          /* Posé sous la barre et non en superposition : un panneau flottant sur un
             téléphone cache la page qu'on vient chercher. */
          <div className="absolute inset-x-0 top-full flex flex-col border-b border-hairline bg-surface shadow-lg md:hidden">
            {SECTIONS.map((section) => (
              <a
                key={section.href}
                href={section.href}
                onClick={() => setSections(false)}
                className="min-h-12 border-t border-hairline px-4 py-3 text-sm font-medium text-ink"
              >
                {t(section.label)}
              </a>
            ))}
          </div>
        )}
      </nav>

      {/* Hero Section */}
      {/* `pt-12` sous `sm` : à 375 px, 96 px de réserve en haut poussaient le bouton
          principal à 860 px — sous un écran de 812. Personne ne voyait l'appel à l'action
          sans faire défiler. */}
      <section className="relative overflow-hidden px-6 pt-12 pb-20 text-center sm:pt-24 sm:pb-32 md:pt-32 md:pb-40">
        <div className="blueprint-grid absolute inset-0 z-0 opacity-50" />
        <div className="relative z-10 mx-auto max-w-4xl">
          {/* 48 px à 375 donnaient sept lignes et 585 px de titre : la moitié de l'écran
              pour une phrase. Le gros caractère reste là où il y a la place. */}
          <h1 className="text-[2rem] font-extrabold tracking-tight text-ink sm:text-5xl md:text-7xl leading-[1.1] sm:leading-tight">
            {t('landing.hero.title')} <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-600">
              {t('landing.hero.titleHighlight')}
            </span>
            .
          </h1>
          <p className="mt-5 text-base text-ink-variant sm:mt-8 sm:text-xl md:text-2xl max-w-2xl mx-auto leading-relaxed">
            {t('landing.hero.subtitle')}
          </p>
          <div className="mt-7 flex flex-col sm:mt-12 sm:flex-row items-center justify-center gap-4">
            <button
              onClick={navigateToAuth('register')}
              className="w-full sm:w-auto rounded-full bg-primary px-8 py-4 text-lg font-bold text-surface shadow-xl hover:bg-primary/90 transition-all hover:-translate-y-1 active:scale-95"
            >
              {t('landing.hero.startTrial')}
            </button>
            <a
              href="#pipeline"
              className="w-full sm:w-auto rounded-full bg-surface-high px-8 py-4 text-lg font-medium text-ink hover:bg-surface-highest transition-all"
            >
              {t('landing.hero.discoverFlow')}
            </a>
          </div>

          {/* Visual Transformation */}
          <div className="mt-12 sm:mt-20 mx-auto max-w-5xl rounded-2xl bg-surface/50 backdrop-blur-xl p-4 shadow-antigravity border border-white/20 relative animate-float-slow">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1 rounded-xl bg-surface-low/50 backdrop-blur-md p-8 text-center border border-dashed border-outline-variant flex flex-col items-center justify-center min-h-[300px]">
                <div className="text-6xl mb-4 text-primary opacity-80">
                  <AssistantIcon />
                </div>
                <h3 className="text-lg font-bold">{t('landing.hero.visual1Title')}</h3>
                <p className="text-sm text-ink-variant mt-2">
                  {t('landing.hero.visual1Desc')}
                </p>
              </div>
              <div className="flex-none flex items-center justify-center w-12 h-12 rounded-full bg-primary text-surface font-bold animate-float-delay">
                →
              </div>
              <div className="flex-1 rounded-xl bg-surface-high/70 backdrop-blur-lg p-8 text-center border border-white/20 flex flex-col items-center justify-center min-h-[300px] shadow-inner relative overflow-hidden">
                <div className="blueprint-grid absolute inset-0 opacity-20 pointer-events-none" />
                <div className="relative z-10">
                  <div className="text-6xl mb-4 text-primary">
                    <PlanIcon />
                  </div>
                  <h3 className="text-lg font-bold">
                    {t('landing.hero.visual2Title')}
                  </h3>
                  <p className="text-sm text-ink-variant mt-2">
                    {t('landing.hero.visual2Desc')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pipeline Section */}
      <section
        id="pipeline"
        className="scroll-mt-20 bg-surface-low py-24 px-6 relative"
      >
        <div className="blueprint-grid absolute inset-0 z-0 opacity-10 pointer-events-none" />
        <div className="mx-auto max-w-6xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold md:text-4xl">
              {t('landing.pipeline.title')}
            </h2>
            <p className="mt-4 text-lg text-ink-variant">
              {t('landing.pipeline.subtitle')}
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: <AssistantIcon />,
                title: t('landing.pipeline.step1Title'),
                desc: t('landing.pipeline.step1Desc'),
              },
              {
                icon: <CubeIcon />,
                title: t('landing.pipeline.step2Title'),
                desc: t('landing.pipeline.step2Desc'),
              },
              {
                icon: <ToolsIcon />,
                title: t('landing.pipeline.step3Title'),
                desc: t('landing.pipeline.step3Desc'),
              },
              {
                icon: <PlanIcon />,
                title: t('landing.pipeline.step4Title'),
                desc: t('landing.pipeline.step4Desc'),
              },
            ].map((step, i) => (
              <div
                key={i}
                className="animate-on-scroll rounded-xl bg-surface/40 backdrop-blur-md p-6 shadow-sm border border-white/20 hover:shadow-antigravity hover:-translate-y-2 transition-all duration-300"
              >
                <div className="text-4xl mb-4 animate-float-delay text-primary/80">
                  {step.icon}
                </div>
                <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                <p className="text-ink-variant">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audiences Section */}
      <section id="audiences" className="scroll-mt-20 py-24 px-6 relative">
        <div className="mx-auto max-w-6xl relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold md:text-4xl">
              {t('landing.audiences.title')}
            </h2>
          </div>
          <div className="grid gap-12 lg:grid-cols-3">
            {/* Menuisiers */}
            <div className="animate-on-scroll flex flex-col rounded-2xl bg-surface/60 backdrop-blur-xl p-8 shadow-antigravity border-2 border-primary/50 relative hover:border-primary transition-colors">
              <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-surface px-4 py-1 rounded-full text-sm font-bold tracking-wide">
                {t('landing.audiences.targetPrimary')}
              </div>
              <h3 className="text-2xl font-bold mb-4">
                {t('landing.audiences.woodworkersTitle')}
              </h3>
              <p className="text-ink-variant mb-6 flex-1">
                {t('landing.audiences.woodworkersDesc')}
              </p>
              <ul className="mb-8 space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.audiences.woodworkersPoint1')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.audiences.woodworkersPoint2')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.audiences.woodworkersPoint3')}
                </li>
              </ul>
              <button
                onClick={navigateToAuth('register')}
                className="w-full rounded bg-primary py-3 text-surface font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 hover:-translate-y-0.5"
              >
                {t('landing.audiences.woodworkersCta')}
              </button>
            </div>

            {/* Particuliers */}
            <div
              className="animate-on-scroll flex flex-col rounded-2xl bg-surface/40 backdrop-blur-md p-8 shadow-lg border border-white/10 hover:shadow-antigravity transition-shadow"
              style={{ animationDelay: '0.1s' }}
            >
              <h3 className="text-2xl font-bold mb-4">
                {t('landing.audiences.diyTitle')}
              </h3>
              <p className="text-ink-variant mb-6 flex-1">
                {t('landing.audiences.diyDesc')}
              </p>
              <ul className="mb-8 space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-ink-variant mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.audiences.diyPoint1')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-ink-variant mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.audiences.diyPoint2')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-ink-variant mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.audiences.diyPoint3')}
                </li>
              </ul>
              <button
                onClick={navigateToAuth('register')}
                className="w-full rounded bg-surface-high/80 py-3 font-bold hover:bg-surface-highest transition-colors"
              >
                {t('landing.audiences.diyCta')}
              </button>
            </div>

            {/* Ateliers */}
            <div
              className="animate-on-scroll flex flex-col rounded-2xl bg-surface/40 backdrop-blur-md p-8 shadow-lg border border-white/10 hover:shadow-antigravity transition-shadow"
              style={{ animationDelay: '0.2s' }}
            >
              <h3 className="text-2xl font-bold mb-4">
                {t('landing.audiences.workshopTitle')}
              </h3>
              <p className="text-ink-variant mb-6 flex-1">
                {t('landing.audiences.workshopDesc')}
              </p>
              <ul className="mb-8 space-y-3">
                <li className="flex items-start gap-2">
                  <span className="text-ink-variant mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.audiences.workshopPoint1')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-ink-variant mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.audiences.workshopPoint2')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-ink-variant mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.audiences.workshopPoint3')}
                </li>
              </ul>
              <button
                onClick={navigateToAuth('register')}
                className="w-full rounded bg-surface-high/80 py-3 font-bold hover:bg-surface-highest transition-colors"
              >
                {t('landing.audiences.workshopCta')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Differentiation Section */}
      <section
        id="comparatif"
        className="scroll-mt-20 bg-ink text-surface py-24 px-6 overflow-hidden"
      >
        <div className="mx-auto max-w-4xl text-center relative z-10 perspective-1000">
          <h2 className="text-3xl font-bold md:text-4xl mb-8">
            {t('landing.comparison.title')}
          </h2>
          <p className="text-lg text-surface-low mb-12 max-w-2xl mx-auto">
            {t('landing.comparison.subtitle')}
          </p>
          <div className="grid md:grid-cols-2 gap-8 text-left">
            <div className="bg-surface/5 backdrop-blur-sm rounded-xl p-8 border border-surface/10 tilt-left hover:transform-none transition-transform duration-500 shadow-2xl">
              <h3 className="text-xl font-bold text-danger mb-4">
                {t('landing.comparison.cadTitle')}
              </h3>
              <ul className="space-y-4 text-surface-low">
                <li className="flex items-start gap-2">
                  <span className="text-danger mt-1">
                    <CloseIcon />
                  </span>{' '}
                  {t('landing.comparison.cadPoint1')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-danger mt-1">
                    <CloseIcon />
                  </span>{' '}
                  {t('landing.comparison.cadPoint2')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-danger mt-1">
                    <CloseIcon />
                  </span>{' '}
                  {t('landing.comparison.cadPoint3')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-danger mt-1">
                    <CloseIcon />
                  </span>{' '}
                  {t('landing.comparison.cadPoint4')}
                </li>
              </ul>
            </div>
            <div className="bg-primary/10 backdrop-blur-md rounded-xl p-8 border border-primary/30 tilt-right hover:transform-none transition-transform duration-500 shadow-[0_0_50px_rgba(var(--color-primary-rgb),0.1)]">
              <h3 className="text-xl font-bold text-primary-light mb-4">
                {t('landing.comparison.neftyaTitle')}
              </h3>
              <ul className="space-y-4 text-surface-low">
                <li className="flex items-start gap-2">
                  <span className="text-primary-light mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.comparison.neftyaPoint1')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-light mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.comparison.neftyaPoint2')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-light mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.comparison.neftyaPoint3')}
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-light mt-1">
                    <CheckIcon />
                  </span>{' '}
                  {t('landing.comparison.neftyaPoint4')}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="tarifs" className="scroll-mt-20 py-24 px-6 bg-surface relative">
        <div className="mx-auto max-w-5xl relative z-10">
          <div className="text-center">
            <h2 className="text-3xl font-bold md:text-4xl">
              {t(selling ? 'landing.pricing.titleSelling' : 'landing.pricing.title')}
            </h2>
          </div>

          {/* Les deux réglages de l'affichage : la cadence, puis la devise. */}
          <div className="mt-8 mb-14 flex flex-col items-center gap-4">
            {hasYearly && (
              <div className="inline-flex items-center rounded-full border border-hairline bg-surface-low p-1">
                {(['monthly', 'yearly'] as const).map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => setPeriod(candidate)}
                    aria-pressed={period === candidate}
                    className={`min-h-11 rounded-full px-5 text-sm font-bold transition-colors ${
                      period === candidate
                        ? 'bg-primary text-surface'
                        : 'text-ink-variant hover:text-ink'
                    }`}
                  >
                    {t(`landing.pricing.cadence_${candidate}`)}
                  </button>
                ))}
                {/* L'économie est nommée **sur le bouton**, là où le choix se fait. */}
                {advantageLabel !== null && (
                  <span className="px-3 text-xs font-bold whitespace-nowrap text-primary">
                    {advantageLabel}
                  </span>
                )}
              </div>
            )}

            {/*
             * Le sélecteur n'apparaît que s'il y a un choix à faire.
             *
             * Avec une seule devise encaissable, il n'offrirait rien et laisserait croire
             * qu'un autre tarif existe ailleurs.
             */}
            {currencies.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-variant">{t('landing.pricing.payIn')}</span>
                {currencies.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => pickCurrencyFor(code)}
                    aria-pressed={currency === code}
                    className={`min-h-11 rounded-full px-3 font-bold transition-colors ${
                      currency === code
                        ? 'text-ink underline decoration-primary decoration-2 underline-offset-4'
                        : 'text-ink-variant hover:text-ink'
                    }`}
                  >
                    {t(`currency.${code}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              /*
               * Les libellés sont ici, les prix viennent de l'API.
               *
               * Écrits dans cette page, ils auraient annoncé 29 € le jour où
               * l'environnement en dit 39 — et c'est le montant de l'environnement qui est
               * débité. Une offre sans prix dans la devise et la cadence affichées porte
               * « bientôt » : un bouton y mènerait tout droit à un refus.
               */
              {
                code: 'free',
                name: t('landing.pricing.freeName'),
                desc: t('landing.pricing.freeDesc'),
                feats: [
                  t('landing.pricing.freePoint1'),
                  t('landing.pricing.freePoint2'),
                  t('landing.pricing.freePoint3'),
                ],
                cta: t('landing.pricing.freeCta'),
              },
              {
                code: 'pro',
                name: t('landing.pricing.proName'),
                desc: t('landing.pricing.proDesc'),
                feats: [
                  t('landing.pricing.proPoint1'),
                  t('landing.pricing.proPoint2'),
                  t('landing.pricing.proPoint3'),
                ],
                cta: t(
                  selling ? 'landing.pricing.proCtaBuy' : 'landing.pricing.proCta',
                ),
              },
              {
                code: 'professional',
                name: t('landing.pricing.profName'),
                desc: t('landing.pricing.profDesc'),
                feats: [
                  t('landing.pricing.profPoint1'),
                  t('landing.pricing.profPoint2'),
                  t('landing.pricing.profPoint3'),
                ],
                cta: t(
                  selling ? 'landing.pricing.profCtaBuy' : 'landing.pricing.profCta',
                ),
              },
            ]
              .map((plan) => ({
                ...plan,
                price: plan.code === 'free' ? undefined : priceOf(plan.code),
                /*
                 * L'offre mise en avant est celle qu'on recommande — **pas la gratuite**.
                 *
                 * L'emphase était sur « Découverte » : la carte la plus visible, agrandie
                 * et ombrée, était celle qui ne rapporte rien et qui plafonne à trois
                 * projets. Une page de tarifs qui met en avant son offre gratuite se bat
                 * contre elle-même.
                 */
                featured: plan.code === 'pro',
              }))
              .map((plan) => ({
                ...plan,
                /* Une offre payante sans prix encaissable ne se vend pas encore. */
                soon: plan.code !== 'free' && plan.price === undefined,
              }))
              .map((plan) => (
                <div
                  key={plan.code}
                  className={`animate-on-scroll flex flex-col rounded-2xl p-8 border backdrop-blur-md transition-shadow hover:shadow-antigravity ${plan.featured ? 'border-primary/50 shadow-antigravity lg:scale-105 z-10 bg-surface/80' : 'border-white/20 shadow-sm bg-surface/40'}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    {plan.soon && (
                      <span className="rounded-full bg-surface-high px-3 py-1 text-xs font-bold tracking-wide text-ink-variant uppercase">
                        {t('landing.pricing.soon')}
                      </span>
                    )}
                    {/*
                     * « Recommandé », et non « le plus choisi ».
                     *
                     * La seconde formule serait une statistique, et nous n'en avons
                     * aucune : ce serait la même invention que l'essai de quatorze jours
                     * qui figurait ici sans une ligne de code pour le soutenir. Une
                     * recommandation, elle, nous appartient.
                     */}
                    {!plan.soon && plan.featured && (
                      <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold tracking-wide text-surface uppercase">
                        {t('landing.pricing.recommended')}
                      </span>
                    )}
                  </div>

                  <div
                    className={`mt-4 text-4xl font-extrabold ${plan.soon ? 'text-ink-variant' : ''}`}
                  >
                    {plan.soon
                      ? '—'
                      : formatMoney({
                          amount: plan.price?.amount_minor ?? 0,
                          currency: plan.price?.currency ?? currency ?? 'EUR',
                        })}
                    {!plan.soon && plan.price !== undefined && (
                      <span className="text-base font-medium text-ink-variant">
                        {t(`landing.pricing.per_${plan.price.period}`)}
                      </span>
                    )}
                  </div>

                  {/*
                   * Le mensuel équivalent, sous un prix annuel.
                   *
                   * « 290 €/an » et « 29 €/mois » ne se comparent pas de tête, et le
                   * visiteur qui essaie se trompe aussi souvent qu'il réussit.
                   */}
                  {plan.price?.period === 'yearly' && (
                    <p className="mt-1 text-sm text-ink-variant">
                      {t('landing.pricing.perMonthEquivalent', {
                        amount: formatMoney({
                          amount: monthlyEquivalent(plan.price.amount_minor),
                          currency: plan.price.currency,
                        }),
                      })}
                    </p>
                  )}

                  <p className="mt-4 text-sm text-ink-variant min-h-12">{plan.desc}</p>
                  {plan.soon && (
                    <p className="mt-2 text-xs text-outline">
                      {t('landing.pricing.soonNote')}
                    </p>
                  )}

                  <div className="my-8 flex-1">
                    <ul className="space-y-3">
                      {plan.feats.map((f, j) => (
                        <li
                          key={j}
                          className="flex items-center gap-2 text-sm text-ink-variant"
                        >
                          <span className="text-primary mt-0.5">
                            <CheckIcon />
                          </span>{' '}
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Une offre qu'on ne peut pas encore vendre n'a pas de bouton : il
                    mènerait à une inscription suivie d'une impasse. */}
                  <button
                    onClick={
                      plan.code === 'free'
                        ? navigateToAuth('register')
                        : choosePlan(plan.code)
                    }
                    disabled={plan.soon}
                    className={`w-full py-3 rounded-full font-bold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${plan.featured ? 'bg-primary text-surface hover:bg-primary/90 hover:-translate-y-1' : 'bg-surface-high/80 text-ink hover:bg-surface-highest'}`}
                  >
                    {plan.cta}
                  </button>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-hairline py-12 px-6 text-center text-ink-variant text-sm bg-surface">
        <div className="flex items-center justify-center gap-2 mb-4">
          <CubeIcon />
          <span className="font-bold text-ink">{t('app.name')}</span>
        </div>
        <p>
          © {new Date().getFullYear()} {t('landing.footer.copyright')}
        </p>
      </footer>
    </div>
  );
}
