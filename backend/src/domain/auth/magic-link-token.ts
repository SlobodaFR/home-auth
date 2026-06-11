export interface MagicLinkTokenProps {
  id: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}

const TTL_MS = 15 * 60 * 1000;

/**
 * A single-use, time-limited login token sent by email. Only its hash is
 * persisted; the raw token is emailed to the user and never stored.
 */
export class MagicLinkToken {
  private constructor(private readonly props: MagicLinkTokenProps) {}

  static issue(props: Omit<MagicLinkTokenProps, 'consumedAt' | 'expiresAt'> & { issuedAt?: Date }): MagicLinkToken {
    const issuedAt = props.issuedAt ?? new Date();
    return new MagicLinkToken({
      id: props.id,
      email: props.email,
      tokenHash: props.tokenHash,
      expiresAt: new Date(issuedAt.getTime() + TTL_MS),
      consumedAt: null,
    });
  }

  static fromPersistence(props: MagicLinkTokenProps): MagicLinkToken {
    return new MagicLinkToken(props);
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get consumedAt(): Date | null {
    return this.props.consumedAt;
  }

  isExpired(now: Date = new Date()): boolean {
    return now.getTime() > this.props.expiresAt.getTime();
  }

  isConsumed(): boolean {
    return this.props.consumedAt !== null;
  }

  /** Returns a consumed copy, or throws if the token cannot be used. */
  consume(now: Date = new Date()): MagicLinkToken {
    if (this.isConsumed()) {
      throw new Error('Magic link already used');
    }
    if (this.isExpired(now)) {
      throw new Error('Magic link expired');
    }
    return new MagicLinkToken({ ...this.props, consumedAt: now });
  }
}
