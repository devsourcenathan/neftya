import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { paperSizeFor, UNIT_SYSTEMS, type UnitSystem } from '@neftya/units';
import { ApiRequestError } from '../api/client.js';
import {
  getSettings,
  saveSettings,
  useApi,
  type SettingsResource,
} from '../api/projects.js';
import { usePreferences } from '../preferences/PreferencesContext.js';

/**
 * Les réglages de l'organisation.
 *
 * Trois valeurs, et une règle qui vaut pour les deux premières : **vide veut dire « suivre
 * la plateforme »**. Recopier le pays de Sekuu à la création le figerait — le client qui le
 * corrige chez Sekuu garderait l'ancien ici, sans comprendre pourquoi.
 *
 * Ce sont des réglages d'organisation : ils valent pour tout le monde. Le système d'unités
 * choisi ici est la valeur **par défaut** ; chacun peut basculer son propre affichage
 * depuis le mode conception, et son choix l'emporte.
 *
 * @see docs/I18N.md §3
 */

/** Les pays de la cible primaire, puis ceux qui impriment sur Letter. */
const COUNTRIES = ['CM', 'CI', 'SN', 'GA', 'CD', 'FR', 'BE', 'CA', 'US'] as const;

/** Zéro décimale pour les deux premières : ce n'est pas un oubli. */
const CURRENCIES = ['XAF', 'XOF', 'EUR', 'USD', 'CAD', 'MAD', 'TND'] as const;

export function Settings() {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const { setUnitSystem } = usePreferences();
  const [saved, setSaved] = useState(false);

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => getSettings(api),
  });

  const save = useMutation({
    mutationFn: (changes: Partial<SettingsResource>) => saveSettings(api, changes),
    onSuccess: async (next) => {
      setSaved(true);
      // Le devis dépend de la devise, les exports du pays : tout ce qui en découle est
      // invalidé plutôt que rafraîchi à la main.
      await queryClient.invalidateQueries();
      queryClient.setQueryData(['settings'], next);
    },
  });

  if (settings.isPending) {
    return <p className="p-6 text-sm text-stone-500">{t('state.loading')}</p>;
  }

  if (settings.isError) {
    return (
      <p className="p-6 text-sm text-red-700">
        {settings.error instanceof ApiRequestError
          ? settings.error.message
          : t('state.error')}
      </p>
    );
  }

  const current = settings.data;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('settings.title')}</h1>

      <label className="flex flex-col gap-1 text-sm">
        {t('settings.country')}
        <select
          className="rounded border border-stone-300 px-2 py-1"
          value={current.country ?? ''}
          onChange={(event) => {
            setSaved(false);
            save.mutate({ country: event.target.value || null });
          }}
        >
          <option value="">{t('settings.followPlatform')}</option>
          {COUNTRIES.map((country) => (
            <option key={country} value={country}>
              {t(`country.${country}`)}
            </option>
          ))}
        </select>
        <span className="text-xs text-stone-500">
          {t('settings.paperFrom', {
            paper: paperSizeFor(current.country).toUpperCase(),
          })}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        {t('settings.currency')}
        <select
          className="rounded border border-stone-300 px-2 py-1"
          value={current.currency ?? ''}
          onChange={(event) => {
            setSaved(false);
            save.mutate({ currency: event.target.value || null });
          }}
        >
          <option value="">{t('settings.followPlatform')}</option>
          {CURRENCIES.map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        <span className="text-xs text-stone-500">{t('settings.currencyHelp')}</span>
      </label>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend>{t('settings.unitSystem')}</legend>
        <div className="flex gap-4">
          {UNIT_SYSTEMS.map((system) => (
            <label key={system} className="flex items-center gap-2">
              <input
                type="radio"
                name="organization-units"
                checked={current.unit_system === system}
                onChange={() => {
                  setSaved(false);
                  save.mutate({ unit_system: system });
                  // L'affichage suit tout de suite : voir le réglage sans effet donnerait
                  // l'impression qu'il n'a pas été pris.
                  setUnitSystem(system as UnitSystem);
                }}
              />
              {t(`units.${system}`)}
            </label>
          ))}
        </div>
        <span className="text-xs text-stone-500">{t('settings.unitSystemHelp')}</span>
      </fieldset>

      {save.isPending && <p className="text-sm text-stone-500">{t('state.saving')}</p>}
      {saved && !save.isPending && (
        <p className="text-sm text-emerald-700">{t('state.saved')}</p>
      )}
      {save.isError && (
        <p className="text-sm text-red-700">
          {save.error instanceof ApiRequestError
            ? save.error.message
            : t('state.error')}
        </p>
      )}
    </div>
  );
}
