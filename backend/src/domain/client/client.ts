export interface ClientProps {
  id: string;
  name: string;
  clientSecretHash: string;
  redirectUris: string[];
  logoutWebhookUrl: string | null;
  createdAt: Date;
}

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
    this.props = { ...props, name };
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

  hasRedirectUri(uri: string): boolean {
    return this.props.redirectUris.includes(uri);
  }

  update(props: Partial<Pick<ClientProps, 'name' | 'redirectUris' | 'logoutWebhookUrl'>>): Client {
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
