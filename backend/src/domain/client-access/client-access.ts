export interface ClientAccessProps {
  userId: string;
  clientId: string;
}

/**
 * ClientAccess is an allowlist entry granting a user permission to obtain
 * tokens for a given client application.
 */
export class ClientAccess {
  private readonly props: ClientAccessProps;

  private constructor(props: ClientAccessProps) {
    if (!props.userId.trim() || !props.clientId.trim()) {
      throw new Error('userId and clientId must not be empty');
    }
    this.props = props;
  }

  static create(props: ClientAccessProps): ClientAccess {
    return new ClientAccess(props);
  }

  get userId(): string {
    return this.props.userId;
  }

  get clientId(): string {
    return this.props.clientId;
  }
}
