import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ParsedFurnitureInput } from '@neftya/engine';
import { ApiRequestError } from '../api/client.js';
import { useApi } from '../api/projects.js';
import {
  gaveUp,
  interpretDescription,
  nextPoll,
  readInterpretation,
} from '../api/assistant.js';
import { Badge, Button, Card, DataPoint, Field, Textarea } from '../ui/index.js';
import { AssistantIcon, PlusIcon } from '../ui/icons.js';

/**
 * Décrire un meuble en une phrase.
 *
 * Un second point d'entrée, à côté des modèles prédéfinis — et non à leur place. Un modèle
 * reste le chemin sûr : il est complet, il est juste, et il ne dépend de rien. Celui-ci
 * dépend de la plateforme et d'un modèle de langage, et **ce qu'il propose est une
 * proposition** : rien n'est créé avant que quelqu'un l'ait regardée.
 *
 * C'est tout le sens de l'écran : la configuration s'affiche, avec ses cotes, avant qu'un
 * projet existe. Créer d'abord et laisser corriger ensuite aurait rempli la liste de
 * meubles que personne n'a voulus.
 */
export function Assistant({
  onUse,
  busy = false,
}: {
  onUse: (model: ParsedFurnitureInput) => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const api = useApi();

  const [text, setText] = useState('');
  const [id, setId] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);
  /**
   * Retenu une fois pour la session.
   *
   * Sans clé, l'assistant n'existe pas sur cette installation. Laisser le champ inviter à
   * cliquer ferait réessayer indéfiniment quelque chose qui ne marchera pas aujourd'hui.
   */
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (description: string) => interpretDescription(api, description),
    onSuccess: (interpretation) => {
      setPolls(0);
      setId(interpretation.id);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.code === 'SERVICE_UNAVAILABLE') {
        setUnavailable(error.message);
      }
    },
  });

  const interpretation = useQuery({
    queryKey: ['interpretation', id],
    queryFn: async () => {
      setPolls((previous) => previous + 1);
      return await readInterpretation(api, id as string);
    },
    enabled: id !== null,
    // La plateforme est la source de vérité : une réponse gardée en cache ferait croire à
    // une génération encore en cours alors qu'elle est finie.
    gcTime: 0,
    refetchInterval: (query) => nextPoll(query.state.data?.status, polls),
  });

  const result = interpretation.data;
  const waiting =
    submit.isPending ||
    (id !== null && (result === undefined || nextPoll(result.status, polls) !== false));

  const reset = () => {
    setId(null);
    setPolls(0);
    submit.reset();
  };

  if (unavailable) {
    return (
      <Card className="p-6">
        <SectionHeading />
        <p className="mt-3 text-sm text-ink-variant">{unavailable}</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <SectionHeading />

      <div className="mt-4 max-w-2xl">
        <Field label={t('assistant.label')} hint={t('assistant.hint')}>
          <Textarea
            rows={3}
            value={text}
            placeholder={t('assistant.placeholder')}
            disabled={waiting}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            disabled={waiting || text.trim().length < 3}
            onClick={() => submit.mutate(text.trim())}
          >
            <AssistantIcon />
            {waiting ? t('assistant.working') : t('assistant.submit')}
          </Button>

          {id !== null && !waiting && (
            <Button tone="ghost" onClick={reset}>
              {t('assistant.again')}
            </Button>
          )}
        </div>
      </div>

      {/* Un refus de la plateforme — quota, panne — porte déjà son message. Le réécrire ici
          ferait dire deux choses différentes de la même cause. */}
      {submit.isError && !unavailable && (
        <p className="mt-3 text-sm text-danger">
          {submit.error instanceof ApiRequestError
            ? submit.error.message
            : t('state.error')}
        </p>
      )}

      {gaveUp(result?.status, polls) && (
        <p className="mt-3 text-sm text-danger">{t('assistant.timeout')}</p>
      )}

      {(result?.status === 'failed' || result?.status === 'cancelled') && (
        <p className="mt-3 text-sm text-danger">{t('assistant.failed')}</p>
      )}

      {result?.status === 'unusable' && (
        <div className="mt-4 border-t border-hairline pt-4">
          <p className="text-sm text-ink">{t('assistant.unusable')}</p>
          {/* Les problèmes par champ, tels que l'API les rend : « données invalides »
              obligerait à deviner lequel des trois. */}
          <ul className="mt-2 flex flex-col gap-1">
            {Object.entries(result.problems ?? {}).map(([field, messages]) => (
              <li key={field} className="text-sm text-ink-variant">
                <span className="font-mono text-xs text-outline">{field}</span>{' '}
                {messages.join(' ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result?.status === 'succeeded' && result.model && (
        <Proposal model={result.model} busy={busy} onUse={() => onUse(result.model!)} />
      )}
    </Card>
  );
}

function SectionHeading() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-headline-md text-ink">{t('assistant.title')}</h2>
      <Badge tone="accent">{t('assistant.badge')}</Badge>
      <p className="w-full text-sm text-ink-variant">{t('assistant.help')}</p>
    </div>
  );
}

/**
 * Ce que l'assistant propose, avec ses cotes en clair.
 *
 * Les cotes sont montrées **avant** la création, et c'est le point : une interprétation peut
 * être plausible et fausse, et la seule personne capable de le voir est celle qui a écrit la
 * phrase.
 */
function Proposal({
  model,
  busy,
  onUse,
}: {
  model: ParsedFurnitureInput;
  busy: boolean;
  onUse: () => void;
}) {
  const { t } = useTranslation();
  const { widthMm, heightMm, depthMm } = model.dimensions;
  const first = model.compartments[0];

  return (
    <div className="mt-4 border-t border-hairline pt-4">
      <p className="label-caps text-ink-variant">{t('assistant.proposal')}</p>

      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DataPoint
          label={t('projects.dimensions')}
          value={`${widthMm} × ${heightMm} × ${depthMm}`}
        />
        <DataPoint
          label={t('presets.contents')}
          value={`${model.compartments.length} × ${first?.doors ?? 0}p`}
        />
        <DataPoint label={t('designer.shelves')} value={String(first?.shelves ?? 0)} />
        <DataPoint
          label={t('designer.material')}
          value={t(`material.${model.material}`)}
        />
      </div>

      <Button className="mt-4" disabled={busy} onClick={onUse}>
        <PlusIcon />
        {t('assistant.use')}
      </Button>
    </div>
  );
}
