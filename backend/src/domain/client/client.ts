export interface ClientProps {
  id: string;
  name: string;
  clientSecretHash: string;
  redirectUris: string[];
  logoutWebhookUrl: string | null;
  createdAt: Date;
  /** HMAC key of the logout webhook (contract PC8: stored in clear, documented exception). */
  webhookSecret?: string | null;
  /** Previous key, still signed with until `webhookSecretPreviousExpiresAt` (overlap). */
  webhookSecretPrevious?: string | null;
  webhookSecretPreviousExpiresAt?: Date | null;
}

const WEBHOOK_SECRET_OVERLAP_MS = 24 * 60 * 60 * 1000;

const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Client is an OAuth2 client application registered with the auth service
 * (e.g. "budget"). Identified by `id`, used as the OAuth2 `client_id`.
 */
export class Client {
  private readonly props: ClientProps;

  private constructor(props: ClientProps) {
    if (!CLIENT_ID_PATTERN.test(props.id)) {
      throw new Error('Client id must be lowercase alphanumeric with hyphens');
    }
    const name = props.name.trim();
    if (!name) {
      throw new Error('Name must not be empty');
    }
    if (props.redirectUris.length === 0) {
      throw new Error('At least one redirect URI is required');
    }
    for (const uri of props.redirectUris) {
      assertValidUrl(uri);
    }
    if (props.logoutWebhookUrl) {
      assertValidUrl(props.logoutWebhookUrl);
    }
    this.props = {
      ...props,
      name,
      webhookSecret: props.webhookSecret ?? null,
      webhookSecretPrevious: props.webhookSecretPrevious ?? null,
      webhookSecretPreviousExpiresAt:
        props.webhookSecretPreviousExpiresAt ?? null,
    };
  }

  static create(props: ClientProps): Client {
    return new Client(props);
  }

  get id(): string {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get clientSecretHash(): string {
    return this.props.clientSecretHash;
  }

  get redirectUris(): readonly string[] {
    return this.props.redirectUris;
  }

  get logoutWebhookUrl(): string | null {
    return this.props.logoutWebhookUrl;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get webhookSecret(): string | null {
    return this.props.webhookSecret ?? null;
  }

  get webhookSecretPrevious(): string | null {
    return this.props.webhookSecretPrevious ?? null;
  }

  get webhookSecretPreviousExpiresAt(): Date | null {
    return this.props.webhookSecretPreviousExpiresAt ?? null;
  }

  get hasWebhookSecret(): boolean {
    return this.webhookSecret !== null;
  }

  /** Secrets a webhook must be signed with at `now`: current, then previous while it overlaps. */
  activeWebhookSecrets(now: Date): string[] {
    const secrets: string[] = [];
    if (this.webhookSecret !== null) {
      secrets.push(this.webhookSecret);
    }
    const expiresAt = this.webhookSecretPreviousExpiresAt;
    if (
      this.webhookSecretPrevious !== null &&
      expiresAt !== null &&
      expiresAt.getTime() > now.getTime()
    ) {
      secrets.push(this.webhookSecretPrevious);
    }
    return secrets;
  }

  /** New current secret; the old one keeps signing for 24 h so apps can switch without a gap. */
  regenerateWebhookSecret(newSecret: string, now: Date): Client {
    const previous = this.webhookSecret;
    return new Client({
      ...this.props,
      webhookSecret: newSecret,
      webhookSecretPrevious: previous,
      webhookSecretPreviousExpiresAt:
        previous === null
          ? null
          : new Date(now.getTime() + WEBHOOK_SECRET_OVERLAP_MS),
    });
  }

  hasRedirectUri(uri: string): boolean {
    return this.props.redirectUris.includes(uri);
  }

  update(
    props: Partial<
      Pick<ClientProps, 'name' | 'redirectUris' | 'logoutWebhookUrl'>
    >,
  ): Client {
    return new Client({ ...this.props, ...props });
  }

  withClientSecretHash(clientSecretHash: string): Client {
    return new Client({ ...this.props, clientSecretHash });
  }
}

function assertValidUrl(value: string): void {
  try {
    new URL(value);
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
}
