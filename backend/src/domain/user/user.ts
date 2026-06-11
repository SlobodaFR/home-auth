export interface UserProps {
  id: string;
  email: string;
  name: string;
  avatarKey: string | null;
  isAdmin: boolean;
  createdAt: Date;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * User is the aggregate root for identity. Shared across all client
 * applications via the OAuth2 Authorization Code flow.
 */
export class User {
  private readonly props: UserProps;

  private constructor(props: UserProps) {
    const email = props.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error('Invalid email address');
    }
    const name = props.name.trim();
    if (!name) {
      throw new Error('Name must not be empty');
    }
    this.props = { ...props, email, name };
  }

  static create(props: UserProps): User {
    return new User(props);
  }

  get id(): string {
    return this.props.id;
  }

  get email(): string {
    return this.props.email;
  }

  get name(): string {
    return this.props.name;
  }

  get avatarKey(): string | null {
    return this.props.avatarKey;
  }

  get isAdmin(): boolean {
    return this.props.isAdmin;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  rename(name: string): User {
    return new User({ ...this.props, name });
  }

  withAvatarKey(avatarKey: string | null): User {
    return new User({ ...this.props, avatarKey });
  }

  withAdmin(isAdmin: boolean): User {
    return new User({ ...this.props, isAdmin });
  }
}
