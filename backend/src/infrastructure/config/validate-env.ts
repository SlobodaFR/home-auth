/** Used outside production only, so local runs and tests need no setup. Rejected in production. */
export const DEV_PSEUDONYM_SECRET =
  'dev-only-pseudonym-secret-not-for-production';

const MIN_SECRET_BYTES = 32;

/**
 * Environment validation, run once at startup by ConfigModule. Throwing here stops the service
 * before it serves anything with an unsafe configuration.
 */
export function validateEnv(
  env: Record<string, unknown>,
): Record<string, unknown> {
  const production = env.NODE_ENV === 'production';
  const secret =
    typeof env.PSEUDONYM_SECRET === 'string' ? env.PSEUDONYM_SECRET : '';

  if (!production) {
    return { ...env, PSEUDONYM_SECRET: secret || DEV_PSEUDONYM_SECRET };
  }
  // Public URLs: magic links, JWT audience, /login and /error redirects, CORS.
  for (const variable of ['AUTH_BASE_URL', 'FRONTEND_URL']) {
    assertHttpsUrl(env[variable], variable);
  }
  if (
    Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES ||
    secret === DEV_PSEUDONYM_SECRET
  ) {
    throw new Error(
      `PSEUDONYM_SECRET must be set in production to a random value of at least ${MIN_SECRET_BYTES.toString()} bytes (openssl rand -hex 32)`,
    );
  }
  return env;
}

function assertHttpsUrl(value: unknown, variable: string): void {
  let url: URL | null = null;
  try {
    url = typeof value === 'string' ? new URL(value) : null;
  } catch {
    url = null;
  }
  if (url?.protocol !== 'https:') {
    throw new Error(`${variable} must be set in production to an https:// URL`);
  }
}
