import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client.js';
import { createProject, listProjects, useApi } from '../api/projects.js';
import { presets } from '../designer/model.js';
import {
  Badge,
  Card,
  DataPoint,
  EmptyState,
  Field,
  Input,
  SkeletonCards,
} from '../ui/index.js';
import { PlusIcon } from '../ui/icons.js';
import type { ProjectStatus } from '../api/projects.js';

/** « À revoir » passe en or : c'est le seul état qui demande une action. */
const STATUS_TONES: Record<ProjectStatus, 'neutral' | 'accent' | 'success'> = {
  draft: 'neutral',
  needs_review: 'accent',
  ready: 'success',
};

/**
 * L'accueil : les projets de l'organisation, et la bibliothèque de modèles.
 *
 * **Un modèle prédéfini est le seul point d'entrée.** On ne part jamais d'un meuble vide :
 * personne ne sait dessiner un caisson à partir de rien, et la bibliothèque évite d'avoir
 * à l'apprendre.
 */
export function Projects() {
  const { t, i18n } = useTranslation();
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

  const dates = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-4 pt-20 pb-12 lg:px-margin-desktop lg:pt-margin-desktop">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-headline-lg text-primary">{t('projects.title')}</h1>
          <p className="mt-2 text-body-lg text-ink-variant">{t('projects.subtitle')}</p>
        </div>
        {projects.data && projects.data.length > 0 && (
          <Badge>{t('projects.count', { count: projects.data.length })}</Badge>
        )}
      </header>

      <section>
        {/* Une esquisse de la bonne forme : la page ne saute pas quand les projets se
            posent, et l'attente ne ressemble pas à une panne. */}
        {projects.isPending && <SkeletonCards />}

        {projects.isError && (
          <p className="text-sm text-danger">
            {projects.error instanceof ApiRequestError
              ? projects.error.message
              : t('state.error')}
          </p>
        )}

        {projects.data?.length === 0 && (
          <EmptyState
            title={t('projects.emptyTitle')}
            description={t('projects.empty')}
          />
        )}

        {projects.data && projects.data.length > 0 && (
          <ul className="grid gap-gutter sm:grid-cols-2 xl:grid-cols-3">
            {projects.data.map((project) => (
              <li key={project.id}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <button
                    type="button"
                    className="flex h-full w-full flex-col p-6 text-left"
                    onClick={() =>
                      void navigate({
                        to: '/projects/$projectId',
                        params: { projectId: project.id },
                      })
                    }
                  >
                    {/* Le statut vient du serveur, où il est **déduit** du modèle et
                        des exports figés — jamais saisi. */}
                    <Badge tone={STATUS_TONES[project.status]}>
                      {t(`status.${project.status}`)}
                    </Badge>

                    <span className="mt-3 text-headline-md text-ink">
                      {project.name}
                    </span>
                    <span className="mt-1 text-sm text-ink-variant">
                      {t('projects.compartments', {
                        count: project.model.compartments.length,
                      })}{' '}
                      · {t(`material.${project.model.material}`)}
                    </span>

                    {/* Le motif de carte du système : un filet, puis les données en deux
                        colonnes, en chasse fixe. On compare deux projets sans les lire. */}
                    <span className="mt-auto grid grid-cols-2 gap-4 border-t border-hairline pt-4">
                      <DataPoint
                        label={t('projects.dimensions')}
                        value={`${project.model.dimensions.widthMm} × ${project.model.dimensions.heightMm}`}
                      />
                      <DataPoint
                        label={t('projects.updated')}
                        value={dates.format(new Date(project.updated_at))}
                      />
                    </span>
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-hairline pb-3">
          <div>
            <h2 className="text-headline-md text-ink">{t('presets.title')}</h2>
            <p className="mt-1 text-sm text-ink-variant">{t('presets.help')}</p>
          </div>
        </div>

        <div className="mb-5 max-w-sm">
          <Field label={t('projects.name')} hint={t('projects.nameHint')}>
            <Input
              value={name}
              placeholder={t('projects.namePlaceholder')}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        </div>

        <ul className="grid gap-gutter sm:grid-cols-2 xl:grid-cols-4">
          {presets().map((preset) => (
            <li key={preset.key}>
              <Card className="h-full transition-colors hover:border-accent">
                <button
                  type="button"
                  className="flex h-full w-full flex-col p-6 text-left disabled:opacity-50"
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
                  <span className="text-headline-md text-ink">
                    {t(`presets.${preset.key}`)}
                  </span>

                  <span className="mt-auto grid grid-cols-2 gap-4 border-t border-hairline pt-4">
                    <DataPoint
                      label={t('projects.dimensions')}
                      value={`${preset.model.dimensions.widthMm} × ${preset.model.dimensions.heightMm}`}
                    />
                    <DataPoint
                      label={t('presets.contents')}
                      value={`${preset.model.compartments.length} × ${preset.model.compartments.reduce(
                        (total, compartment) => total + compartment.doors,
                        0,
                      )}p`}
                    />
                  </span>

                  <span className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary">
                    <PlusIcon />
                    {t('presets.create')}
                  </span>
                </button>
              </Card>
            </li>
          ))}
        </ul>

        {create.isError && (
          <p className="mt-3 text-sm text-danger">
            {create.error instanceof ApiRequestError
              ? create.error.message
              : t('state.error')}
          </p>
        )}
      </section>
    </div>
  );
}
