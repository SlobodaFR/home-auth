export interface UserProps {
  id: string;
  email: string;
  name: string;
  avatarKey: string | null;
  isAdmin: boolean;
  countryCode?: string | null;
  locale?: string | null;
  createdAt: Date;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;
const LOCALE_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/**
 * User is the aggregate root for identity. Shared across all client
 * applications via the OAuth2 Authorization Code flow.
 */
type ResolvedUserProps = Omit<UserProps, 'countryCode' | 'locale'> & {
  countryCode: string | null;
  locale: string | null;
};

export class User {
  private readonly props: ResolvedUserProps;

  private constructor(props: UserProps) {
    const email = props.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error('Invalid email address');
    }
    const name = props.name.trim();
    if (!name) {
      throw new Error('Name must not be empty');
    }
    const countryCode = props.countryCode ?? null;
    if (countryCode !== null && !COUNTRY_CODE_PATTERN.test(countryCode)) {
      throw new Error('Invalid country code');
    }
    const locale = props.locale ?? null;
    if (locale !== null && !LOCALE_PATTERN.test(locale)) {
      throw new Error('Invalid locale');
    }
    this.props = { ...props, email, name, countryCode, locale };
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

  get countryCode(): string | null {
    return this.props.countryCode;
  }

  get locale(): string | null {
    return this.props.locale;
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

  withCountryCode(countryCode: string | null): User {
    return new User({ ...this.props, countryCode });
  }

  withLocale(locale: string | null): User {
    return new User({ ...this.props, locale });
  }
}
