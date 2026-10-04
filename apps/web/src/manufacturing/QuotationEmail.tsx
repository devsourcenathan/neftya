import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiRequestError } from '../api/client.js';
import { sendQuotationEmail, useApi } from '../api/projects.js';
import { Button, Field, Input, Textarea } from '../ui/index.js';

/**
 * Envoyer le devis au client, avec le plan joint.
 *
 * Le formulaire vit **sous** le devis et seulement quand le rôle y a accès :
 * le serveur ne rend `quotation` qu'à qui lit les coûts, donc ce composant
 * ne se monte jamais devant un menuisier salarié. Un refus de l'API porte
 * déjà son message — le réécrire ici le ferait dériver.
 */
export function QuotationEmail({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSent(null);
    setFailure(null);
    setBusy(true);

    try {
      const form = new FormData(event.currentTarget);
      const to = String(form.get('to') ?? '').trim();
      const message = String(form.get('message') ?? '').trim();
      await sendQuotationEmail(api, projectId, {
        to,
        ...(message ? { message } : {}),
      });
      setSent(to);
      event.currentTarget.reset();
    } catch (error) {
      setFailure(
        error instanceof ApiRequestError
          ? error.message
          : t('manufacturing.emailFailed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-6 flex max-w-xl flex-col gap-4 border-t border-hairline pt-5"
      onSubmit={(event) => void submit(event)}
    >
      <h3 className="label-caps text-ink-variant">{t('manufacturing.emailTitle')}</h3>

      <Field label={t('manufacturing.emailTo')}>
        <Input name="to" type="email" autoComplete="email" required />
      </Field>
      <Field label={t('manufacturing.emailMessage')}>
        <Textarea name="message" rows={3} />
      </Field>

      {sent && (
        <p role="status" className="text-sm text-success">
          {t('manufacturing.emailSent', { to: sent })}
        </p>
      )}
      {failure && (
        <p role="alert" className="text-sm text-danger">
          {failure}
        </p>
      )}

      <div>
        <Button tone="primary" disabled={busy} type="submit">
          {busy ? t('state.loading') : t('manufacturing.emailSend')}
        </Button>
      </div>
    </form>
  );
}
