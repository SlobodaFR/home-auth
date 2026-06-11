export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * Port (driven side) implemented by the infrastructure layer.
 */
export abstract class EmailSender {
  abstract send(message: EmailMessage): Promise<void>;
}
