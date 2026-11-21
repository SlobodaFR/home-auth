import { Injectable, NotFoundException } from '@nestjs/common';
import { Client } from '../../domain/client/client';
import { ClientRepository } from '../../domain/client/client.repository';
import { MASK_MARKER, maskWebhookUrl } from '../../domain/client/webhook-url';
import { ensureSecureWebhookUrl } from './ensure-secure-webhook-url';

export interface UpdateClientInput {
  name?: string;
  redirectUris?: string[];
  logoutWebhookUrl?: string | null;
}

@Injectable()
export class UpdateClientUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  async execute(clientId: string, input: UpdateClientInput): Promise<Client> {
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new NotFoundException(`Client ${clientId} not found`);
    }

    // The API only ever shows the masked URL (no query), and the admin form resends what it
    // was given: the masked value means "unchanged", the stored URL (with its query) stays.
    // Only the `?***` marker means "unchanged": credentials/fragment are dropped from the mask
    // silently, so an admin typing the clean URL must really replace the stored one.
    const { logoutWebhookUrl, ...rest } = input;
    const shownMask = maskWebhookUrl(client.logoutWebhookUrl);
    const isShownMask =
      logoutWebhookUrl !== undefined &&
      logoutWebhookUrl !== null &&
      logoutWebhookUrl.endsWith(MASK_MARKER) &&
      logoutWebhookUrl === shownMask;
    const changes: UpdateClientInput = { ...rest };
    if (
      logoutWebhookUrl !== undefined &&
      logoutWebhookUrl !== client.logoutWebhookUrl &&
      !isShownMask
    ) {
      // Only a modified webhook is checked: an existing http client stays editable until its
      // webhook is touched.
      if (logoutWebhookUrl) {
        ensureSecureWebhookUrl(logoutWebhookUrl);
      }
      changes.logoutWebhookUrl = logoutWebhookUrl;
    }

    const updated = client.update(changes);
    await this.clientRepository.save(updated);
    return updated;
  }
}
