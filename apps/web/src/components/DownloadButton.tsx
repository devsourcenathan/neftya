import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client.js';
import { Button } from '../ui/index.js';
import { DownloadIcon } from '../ui/icons.js';

/**
 * Un bouton qui télécharge un fichier de l'API.
 *
 * **Un lien de navigateur ne porte pas d'en-tête**, donc pas le jeton : un `<a href>` vers
 * une route authentifiée affiche le JSON d'un `401` à la place du fichier. C'est le défaut
 * qu'avaient les deux boutons de téléchargement, et il n'était visible qu'en cliquant.
 *
 * Le bouton dit aussi ce qui se passe : un PDF de plans se fabrique côté serveur, ce qui
 * prend un instant, et un bouton muet pendant ce temps se fait cliquer deux fois.
 */
export function DownloadButton({
  label,
  download,
}: {
  label: string;
  download: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        disabled={state === 'busy'}
        onClick={() => {
          setState('busy');
          download()
            .then(() => setState('idle'))
            .catch((error: unknown) => {
              setState('failed');
              // Le code de l'API est plus utile que « une erreur est survenue » : un 403
              // sur un export ne se corrige pas comme un 500.
              if (!(error instanceof ApiRequestError)) throw error;
            });
        }}
      >
        <DownloadIcon />
        {state === 'busy' ? t('state.preparing') : label}
      </Button>

      {state === 'failed' && (
        <span className="text-xs text-danger">{t('state.downloadFailed')}</span>
      )}
    </span>
  );
}
