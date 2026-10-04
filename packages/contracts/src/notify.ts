import { z } from 'zod';

/**
 * Envoi d'un devis par email.
 *
 * Le destinataire est le **client de l'artisan**, pas un utilisateur Neftya :
 * aucune invitation, aucun compte — un email, un devis, une pièce jointe.
 *
 * @see docs/ENGINEERING.md §4
 */

export const quotationEmailBody = z.object({
  to: z.string().trim().toLowerCase().pipe(z.email()),
  message: z.string().trim().max(2000).optional(),
});

export type QuotationEmailBody = z.infer<typeof quotationEmailBody>;
