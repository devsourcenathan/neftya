import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client.js';
import { deleteProject, updateProject, useApi } from '../api/projects.js';

/**
 * Renommer et supprimer un projet.
 *
 * La suppression demande confirmation, et le dit franchement : côté serveur elle est douce
 * — la ligne reste, `deleted_at` est posé — mais **rien dans l'interface ne permet de
 * revenir en arrière**. Promettre une corbeille qui n'existe pas serait pire que d'annoncer
 * une suppression définitive.
 */
export function ProjectActions({
  projectId,
  name,
}: {
  projectId: string;
  name: string;
}) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [draft, setDraft] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const rename = useMutation({
    mutationFn: (next: string) => updateProject(api, projectId, { name: next }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteProject(api, projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await navigate({ to: '/' });
    },
  });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        className="rounded border border-stone-300 px-2 py-1 text-lg font-semibold"
        value={draft ?? name}
        aria-label={t('projects.name')}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          const next = event.target.value.trim();
          setDraft(null);

          // Un nom vide est refusé par l'API : autant ne pas l'envoyer, et laisser le nom
          // en place plutôt que d'afficher une erreur pour un champ effacé par mégarde.
          if (next && next !== name) rename.mutate(next);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />

      {rename.isPending && (
        <span className="text-sm text-stone-500">{t('state.saving')}</span>
      )}
      {rename.isError && (
        <span className="text-sm text-red-700">
          {rename.error instanceof ApiRequestError
            ? rename.error.message
            : t('state.error')}
        </span>
      )}

      {confirming ? (
        <span className="flex items-center gap-2 text-sm">
          {t('projects.confirmDelete')}
          <button
            type="button"
            className="rounded bg-red-700 px-3 py-1 text-white disabled:opacity-50"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {t('projects.delete')}
          </button>
          <button
            type="button"
            className="rounded border border-stone-300 px-3 py-1"
            onClick={() => setConfirming(false)}
          >
            {t('action.cancel')}
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="ml-auto text-sm text-red-700 underline"
          onClick={() => setConfirming(true)}
        >
          {t('projects.delete')}
        </button>
      )}

      {remove.isError && (
        <span className="text-sm text-red-700">
          {remove.error instanceof ApiRequestError
            ? remove.error.message
            : t('state.error')}
        </span>
      )}
    </div>
  );
}
