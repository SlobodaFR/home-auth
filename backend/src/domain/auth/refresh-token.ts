export interface RefreshTokenProps {
  id: string;
  tokenHash: string;
  userId: string;
  clientId: string;
  expiresAt: Date;
  createdAt: Date;
  /** Every token descending from one login (authorization code) shares it. */
  familyId: string;
  /** Set once the token has been exchanged for a new one; null while it is the current one. */
  rotatedAt: Date | null;
}

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * RefreshToken is an opaque, long-lived (30 days) credential exchanged for
 * new access tokens. Stored hashed; revoked by deletion (logout). Tokens issued by
 * rotation stay in the family of the token they replace.
 */
export class RefreshToken {
  private constructor(private readonly props: RefreshTokenProps) {}

  static issue(
    props: Omit<RefreshTokenProps, 'expiresAt' | 'familyId' | 'rotatedAt'> & {
      issuedAt?: Date;
      /** Defaults to the token's own id: a new family. */
      familyId?: string;
    },
  ): RefreshToken {
    const issuedAt = props.issuedAt ?? props.createdAt;
    return new RefreshToken({
      id: props.id,
      tokenHash: props.tokenHash,
      userId: props.userId,
      clientId: props.clientId,
      createdAt: props.createdAt,
      expiresAt: new Date(issuedAt.getTime() + TTL_MS),
      familyId: props.familyId ?? props.id,
      rotatedAt: null,
    });
  }

  static fromPersistence(props: RefreshTokenProps): RefreshToken {
    return new RefreshToken(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get userId(): string {
    return this.props.userId;
  }

  get clientId(): string {
    return this.props.clientId;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get familyId(): string {
    return this.props.familyId;
  }

  get rotatedAt(): Date | null {
    return this.props.rotatedAt;
  }

  isExpired(now: Date = new Date()): boolean {
    return now.getTime() > this.props.expiresAt.getTime();
  }
}
