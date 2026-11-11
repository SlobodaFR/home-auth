import { timingSafeEqual } from 'crypto';
import { pkceS256 } from '../shared/hash';

export interface AuthorizationCodeProps {
  codeHash: string;
  userId: string;
  clientId: string;
  redirectUri: string;
  expiresAt: Date;
  used: boolean;
  /** PKCE S256 challenge sent to /authorize, or null when the client did not use PKCE. */
  codeChallenge: string | null;
}

const TTL_MS = 60 * 1000;

/**
 * AuthorizationCode is a single-use, short-lived (~60s) code issued at the
 * end of the `/authorize` step and exchanged for tokens via `/token`.
 */
export class AuthorizationCode {
  private constructor(private readonly props: AuthorizationCodeProps) {}

  static issue(
    props: Omit<
      AuthorizationCodeProps,
      'used' | 'expiresAt' | 'codeChallenge'
    > & {
      issuedAt?: Date;
      codeChallenge?: string | null;
    },
  ): AuthorizationCode {
    const issuedAt = props.issuedAt ?? new Date();
    return new AuthorizationCode({
      codeHash: props.codeHash,
      userId: props.userId,
      clientId: props.clientId,
      redirectUri: props.redirectUri,
      expiresAt: new Date(issuedAt.getTime() + TTL_MS),
      used: false,
      codeChallenge: props.codeChallenge ?? null,
    });
  }

  static fromPersistence(props: AuthorizationCodeProps): AuthorizationCode {
    return new AuthorizationCode(props);
  }

  get codeHash(): string {
    return this.props.codeHash;
  }

  get userId(): string {
    return this.props.userId;
  }

  get clientId(): string {
    return this.props.clientId;
  }

  get redirectUri(): string {
    return this.props.redirectUri;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get used(): boolean {
    return this.props.used;
  }

  isExpired(now: Date = new Date()): boolean {
    return now.getTime() > this.props.expiresAt.getTime();
  }

  get codeChallenge(): string | null {
    return this.props.codeChallenge;
  }

  /**
   * PKCE check. Without a challenge, only a request without verifier passes: a verifier for a
   * code issued without challenge means the challenge was stripped (RFC 9700 §4.8.1).
   */
  matchesVerifier(verifier: string | undefined): boolean {
    if (this.props.codeChallenge === null) {
      return verifier === undefined;
    }
    if (verifier === undefined) {
      return false;
    }
    const expected = Buffer.from(this.props.codeChallenge);
    const actual = Buffer.from(pkceS256(verifier));
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  /** Returns a used copy, or throws if the code cannot be redeemed. */
  redeem(now: Date = new Date()): AuthorizationCode {
    if (this.props.used) {
      throw new Error('Authorization code already used');
    }
    if (this.isExpired(now)) {
      throw new Error('Authorization code expired');
    }
    return new AuthorizationCode({ ...this.props, used: true });
  }
}
