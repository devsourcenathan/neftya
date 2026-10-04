import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Envoyer un email, en interface.
 *
 * `SmtpMailer` parle à n'importe quel SMTP (prestataire ou relais local) ;
 * les tests injectent un faux en mémoire. La route ne sait pas lequel elle
 * tient — elle sait seulement enregistrer l'issue dans l'outbox.
 */

export interface EmailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
}

export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

export class MailerUnavailable extends Error {
  constructor(reason: string) {
    super(`Envoi impossible : ${reason}`);
    this.name = 'MailerUnavailable';
  }
}

export interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  /** L'expéditeur affiché. Par défaut `user`. */
  from: string;
  /** Injectable : les tests n'ouvrent pas de connexion. */
  transporter?: Transporter;
}

export class SmtpMailer implements Mailer {
  private readonly transporter: Transporter;

  constructor(private readonly options: SmtpOptions) {
    this.transporter =
      options.transporter ??
      nodemailer.createTransport({
        host: options.host,
        port: options.port,
        secure: options.secure,
        auth: { user: options.user, pass: options.password },
      });
  }

  async send(email: OutgoingEmail): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.options.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
        attachments: (email.attachments ?? []).map((attachment) => ({
          filename: attachment.filename,
          content: Buffer.from(attachment.content),
          contentType: attachment.contentType,
        })),
      });
    } catch (error) {
      throw new MailerUnavailable(
        error instanceof Error ? error.message : 'raison inconnue',
      );
    }
  }
}
