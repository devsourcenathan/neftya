import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client.js';
import { createProject, listProjects, useApi } from '../api/projects.js';
import { presets } from '../designer/model.js';

/**
 * L'accueil : les projets de l'organisation, et la bibliothèque de modèles prédéfinis.
 *
 * **Un modèle prédéfini est le seul point d'entrée de la V1.** On ne part jamais d'un
 * meuble vide : personne ne sait dessiner un caisson à partir de rien, et la bibliothèque
 * évite d'avoir à l'apprendre.
 */
export function Projects() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => listProjects(api),
  });

  const create = useMutation({
    mutationFn: (input: { name: string; model: unknown }) => createProject(api, input),
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      await navigate({ to: '/projects/$projectId', params: { projectId: project.id } });
    },
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <section>
        <h1 className="mb-4 text-xl font-semibold">{t('projects.title')}</h1>

        {projects.isPending && (
          <p className="text-sm text-stone-500">{t('state.loading')}</p>
        )}

        {projects.isError && (
          <p className="text-sm text-red-700">
            {projects.error instanceof ApiRequestError
              ? projects.error.message
              : t('state.error')}
          </p>
        )}

        {projects.data?.length === 0 && (
          <p className="text-sm text-stone-500">{t('projects.empty')}</p>
        )}

        <ul className="flex flex-col gap-2">
          {projects.data?.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between rounded border border-stone-200 px-3 py-2 text-left hover:bg-stone-50"
                onClick={() =>
                  void navigate({
                    to: '/projects/$projectId',
                    params: { projectId: project.id },
                  })
                }
              >
                <span>{project.name}</span>
                <span className="text-sm text-stone-500">
                  {project.model.dimensions.widthMm} ×{' '}
                  {project.model.dimensions.heightMm} ×{' '}
                  {project.model.dimensions.depthMm} mm
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('presets.title')}</h2>
        <p className="mb-4 text-sm text-stone-500">{t('presets.help')}</p>

        <label className="mb-3 flex max-w-sm flex-col gap-1 text-sm">
          {t('projects.name')}
          <input
            className="rounded border border-stone-300 px-2 py-1"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {presets().map((preset) => (
            <li key={preset.key}>
              <button
                type="button"
                className="w-full rounded border border-stone-200 p-3 text-left hover:border-emerald-700 disabled:opacity-50"
                disabled={create.isPending}
                onClick={() =>
                  create.mutate({
                    // Le nom du modèle sert de nom par défaut : un projet sans nom est
                    // refusé par l'API, et l'utilisateur ne doit pas l'apprendre par une
                    // erreur.
                    name: name.trim() || t(`presets.${preset.key}`),
                    model: preset.model,
                  })
                }
              >
                <span className="block font-medium">{t(`presets.${preset.key}`)}</span>
                <span className="block text-sm text-stone-500">
                  {preset.model.dimensions.widthMm} × {preset.model.dimensions.heightMm}{' '}
                  mm
                </span>
              </button>
            </li>
          ))}
        </ul>

        {create.isError && (
          <p className="mt-3 text-sm text-red-700">
            {create.error instanceof ApiRequestError
              ? create.error.message
              : t('state.error')}
          </p>
        )}
      </section>
    </div>
  );
}
