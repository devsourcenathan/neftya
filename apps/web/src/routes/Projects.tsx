import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client.js';
import { createProject, listProjects, useApi } from '../api/projects.js';
import { presets } from '../designer/model.js';
import { usePreferences } from '../preferences/PreferencesContext.js';
import {
  Badge,
  Card,
  EmptyState,
  Field,
  Input,
  SectionTitle,
  SkeletonCards,
} from '../ui/index.js';

/**
 * L'accueil : les projets de l'organisation, et la bibliothèque de modèles.
 *
 * **Un modèle prédéfini est le seul point d'entrée.** On ne part jamais d'un meuble vide :
 * personne ne sait dessiner un caisson à partir de rien, et la bibliothèque évite d'avoir
 * à l'apprendre.
 */
export function Projects() {
  const { t, i18n } = useTranslation();
  const { format } = usePreferences();
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
    <div className="mx-auto flex max-w-7xl flex-col gap-12 px-5 py-8">
      <section>
        <SectionTitle
          hint={
            projects.data && projects.data.length > 0
              ? t('projects.count', { count: projects.data.length })
              : undefined
          }
        >
          {t('projects.title')}
        </SectionTitle>

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
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.data.map((project) => (
              <li key={project.id}>
                <Card className="h-full transition-colors hover:border-line-strong">
                  <button
                    type="button"
                    className="flex h-full w-full flex-col gap-2 p-4 text-left"
                    onClick={() =>
                      void navigate({
                        to: '/projects/$projectId',
                        params: { projectId: project.id },
                      })
                    }
                  >
                    <span className="font-display text-lg text-ink">
                      {project.name}
                    </span>

                    <span className="text-sm tabular-nums text-muted">
                      {format(project.model.dimensions.widthMm)} ×{' '}
                      {format(project.model.dimensions.heightMm)} ×{' '}
                      {format(project.model.dimensions.depthMm)}
                    </span>

                    <span className="mt-auto flex items-center gap-2 pt-2">
                      <Badge>
                        {t('projects.compartments', {
                          count: project.model.compartments.length,
                        })}
                      </Badge>
                      {/* La date de dernière modification : c'est elle qu'on cherche pour
                          retrouver le projet d'hier. */}
                      <span className="text-xs text-muted">
                        {dates.format(new Date(project.updated_at))}
                      </span>
                    </span>
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle hint={t('presets.help')}>{t('presets.title')}</SectionTitle>

        <div className="mb-4 max-w-sm">
          <Field label={t('projects.name')} hint={t('projects.nameHint')}>
            <Input
              value={name}
              placeholder={t('projects.namePlaceholder')}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {presets().map((preset) => (
            <li key={preset.key}>
              <Card className="h-full transition-colors hover:border-accent">
                <button
                  type="button"
                  className="flex h-full w-full flex-col gap-1 p-4 text-left disabled:opacity-50"
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
                  <span className="font-display text-base text-ink">
                    {t(`presets.${preset.key}`)}
                  </span>
                  <span className="text-sm tabular-nums text-muted">
                    {format(preset.model.dimensions.widthMm)} ×{' '}
                    {format(preset.model.dimensions.heightMm)}
                  </span>
                  <span className="mt-2 text-xs text-muted">
                    {t('presets.details', {
                      // `count` décide de la forme du pluriel : sans lui, i18next ne
                      // choisit ni `_one` ni `_other` et la clé ne se résout pas.
                      count: preset.model.compartments.reduce(
                        (total, compartment) => total + compartment.doors,
                        0,
                      ),
                      compartments: preset.model.compartments.length,
                      doors: preset.model.compartments.reduce(
                        (total, compartment) => total + compartment.doors,
                        0,
                      ),
                    })}
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
