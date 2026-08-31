import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ParsedFurnitureInput } from '@neftya/engine';
import { ApiRequestError } from '../api/client.js';
import { getProject, updateProject, useApi } from '../api/projects.js';
import { Designer } from '../designer/Designer.js';

/**
 * Un projet ouvert dans le mode conception.
 *
 * L'enregistrement envoie **le modèle, et rien d'autre**. La liste de pièces affichée à
 * l'écran est calculée localement pour l'interaction ; celle qui part à l'atelier est
 * recalculée par le serveur à partir du modèle enregistré. Envoyer la nôtre reviendrait à
 * laisser le client décider de ce qui sera scié.
 */
export function ProjectDesigner({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();

  const project = useQuery({
    queryKey: ['projects', projectId],
    queryFn: () => getProject(api, projectId),
  });

  const save = useMutation({
    mutationFn: (model: ParsedFurnitureInput) =>
      updateProject(api, projectId, { model }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  if (project.isPending) {
    return <p className="p-6 text-sm text-stone-500">{t('state.loading')}</p>;
  }

  if (project.isError) {
    // Un projet d'une autre organisation rend `404`, exactement comme un projet inexistant :
    // l'interface ne peut donc pas distinguer les deux, et c'est le but.
    const missing =
      project.error instanceof ApiRequestError && project.error.code === 'NOT_FOUND';

    return (
      <p className="p-6 text-sm text-red-700">
        {missing ? t('projects.notFound') : t('state.error')}
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold">{project.data.name}</h1>
        {save.isSuccess && !save.isPending && (
          <span className="text-sm text-emerald-700">{t('state.saved')}</span>
        )}
        {save.isError && (
          <span className="text-sm text-red-700">
            {save.error instanceof ApiRequestError
              ? save.error.message
              : t('state.error')}
          </span>
        )}
      </header>

      <div className="min-h-0 flex-1">
        <Designer
          // `key` : ouvrir un autre projet doit repartir de son modèle, pas garder l'état
          // de conception du précédent.
          key={project.data.id}
          initialModel={project.data.model}
          onSave={(model) => save.mutate(model)}
          saving={save.isPending}
        />
      </div>
    </div>
  );
}
