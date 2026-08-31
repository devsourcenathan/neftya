import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import fr from './locales/fr.json';

/**
 * Français et anglais à parité stricte, vérifiée en intégration continue.
 *
 * Aucun texte n'est écrit en dur dans un composant, et `t()` ne prend jamais de valeur
 * par défaut : ce second argument est ce qui a masqué 76 % de clés manquantes sur
 * DealerOS pendant des mois. Une clé absente doit se voir.
 *
 * @see docs/I18N.md §7
 */
void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: 'fr',
  // Français, langue de référence : elle est toujours complète.
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export default i18n;
