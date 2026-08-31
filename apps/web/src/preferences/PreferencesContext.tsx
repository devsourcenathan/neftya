import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLength, parseLength, type UnitSystem } from '@neftya/units';
import type { Millimetres } from '@neftya/engine';

/**
 * Ce que l'utilisateur voit : sa langue et son système d'unités.
 *
 * Deux réglages, deux sources différentes, et c'est voulu. La **langue** vient du jeton
 * de la plateforme — c'est un réglage de compte, il suit l'utilisateur d'un produit à
 * l'autre. Le **système d'unités** est propre à Neftya : la plateforme n'a aucune raison
 * de savoir si un menuisier travaille en pouces.
 *
 * @see docs/I18N.md §1
 */

const UNIT_PREFERENCE = 'neftya.units';

interface Preferences {
  unitSystem: UnitSystem;
  setUnitSystem: (system: UnitSystem) => void;
  /** Formate une longueur du modèle pour l'affichage. Ne rend jamais au modèle. */
  format: (valueMm: number) => string;
  /** Interprète une saisie. `null` quand elle est incomprise — jamais une valeur devinée. */
  parse: (input: string) => Millimetres | null;
}

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({
  children,
  language,
  initialUnitSystem,
}: {
  children: ReactNode;
  /** La langue du jeton. */
  language: string;
  /** Le réglage de l'organisation, quand l'API l'a rendu. */
  initialUnitSystem?: UnitSystem;
}) {
  const { i18n } = useTranslation();
  const [chosen, setChosen] = useState<UnitSystem | null>(() => readStored());

  // Le choix explicite l'emporte ; à défaut, le réglage de l'organisation ; à défaut, le
  // métrique. Le réglage serveur arrive après coup — il ne doit pas écraser un choix.
  const unitSystem: UnitSystem = chosen ?? initialUnitSystem ?? 'metric';

  useEffect(() => {
    // Le jeton fait foi sur la langue : la changer chez Sekuu la change ici.
    if (language && i18n.language !== language) void i18n.changeLanguage(language);
    document.documentElement.lang = language || 'fr';
  }, [language, i18n]);

  const choose = useCallback((system: UnitSystem) => {
    writeStored(system);
    setChosen(system);
  }, []);

  const value = useMemo<Preferences>(
    () => ({
      unitSystem,
      setUnitSystem: choose,
      format: (valueMm) => formatLength(valueMm, unitSystem, i18n.language),
      parse: (input) => parseLength(input, unitSystem),
    }),
    [unitSystem, choose, i18n.language],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

/**
 * `localStorage` peut lever — navigation privée, stockage refusé, contexte sans stockage.
 * Une préférence d'affichage ne vaut pas de faire tomber l'application.
 */
function readStored(): UnitSystem | null {
  try {
    const value = window.localStorage.getItem(UNIT_PREFERENCE);
    return value === 'metric' || value === 'imperial' ? value : null;
  } catch {
    return null;
  }
}

function writeStored(system: UnitSystem): void {
  try {
    window.localStorage.setItem(UNIT_PREFERENCE, system);
  } catch {
    // Le choix vaut pour cette session, et c'est déjà l'essentiel.
  }
}

export function usePreferences(): Preferences {
  const preferences = useContext(PreferencesContext);
  if (!preferences) throw new Error('usePreferences hors de PreferencesProvider.');
  return preferences;
}
