import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ParsedFurnitureInput } from '@neftya/engine';
import { ApiRequestError } from '../api/client.js';
import { createTemplate, useApi } from '../api/projects.js';
import { Button, Card, Field, Input } from '../ui/index.js';
import { PlusIcon } from '../ui/icons.js';

/**
 * Enregistrer le meuble en cours comme modèle de l'organisation.
 *
 * **Le nom est de la donnée, pas une chaîne d'interface** : il est saisi dans les deux
 * langues du produit, et le français est obligatoire — c'est la langue de référence, celle
 * sur laquelle on retombe. Un atelier qui ne remplit que le français verra son nom français
 * partout, ce qui vaut mieux qu'une clé technique.
 *
 * @see docs/I18N.md §6
 */
export function SaveAsTemplate({
  model,
  suggestion,
}: {
  model: ParsedFurnitureInput;
  /** Le nom du projet : un point de départ raisonnable pour le nom du modèle. */
  suggestion: string;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [french, setFrench] = useState(suggestion);
  const [english, setEnglish] = useState('');

  const save = useMutation({
    mutationFn: () =>
      createTemplate(api, {
        // Une traduction laissée vide n'est pas envoyée : un champ blanc n'est pas une
        // traduction, et l'enregistrer ferait afficher du vide à un lecteur anglophone.
        name: english.trim()
          ? { fr: french.trim(), en: english.trim() }
          : { fr: french.trim() },
        model,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      setOpen(false);
      setEnglish('');
    },
  });

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        {t('templates.saveAs')}
      </Button>
    );
  }

  return (
    <Card className="w-full max-w-sm p-4">
      <p className="label-caps mb-3 text-ink-variant">{t('templates.saveAs')}</p>

      <div className="flex flex-col gap-3">
        <Field label={t('templates.nameFr')} hint={t('templates.nameFrHint')}>
          <Input
            value={french}
            onChange={(event) => setFrench(event.target.value)}
            aria-label={t('templates.nameFr')}
          />
        </Field>

        <Field label={t('templates.nameEn')} hint={t('templates.nameEnHint')}>
          <Input
            value={english}
            placeholder={french}
            onChange={(event) => setEnglish(event.target.value)}
            aria-label={t('templates.nameEn')}
          />
        </Field>
      </div>

      {save.isError && (
        <p className="mt-3 text-sm text-danger">
          {save.error instanceof ApiRequestError
            ? save.error.message
            : t('state.error')}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          tone="primary"
          // Le français est obligatoire : le bouton le dit en restant inerte plutôt que
          // de laisser l'API répondre 422.
          disabled={french.trim() === '' || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? t('state.saving') : t('action.save')}
        </Button>
        <Button tone="ghost" onClick={() => setOpen(false)}>
          {t('action.cancel')}
        </Button>
      </div>
    </Card>
  );
}
