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

/**
 * `<html lang>` suit la langue affichée.
 *
 * Il était figé à `fr` dans la page : basculer en anglais laissait un document déclaré
 * français, qu'un lecteur d'écran lit alors avec une voix française — inécoutable. C'est
 * aussi ce que lisent les moteurs de recherche et les traducteurs automatiques.
 */
const followDocumentLanguage = (language: string) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language;
};

followDocumentLanguage(i18n.language);
i18n.on('languageChanged', followDocumentLanguage);

export default i18n;
