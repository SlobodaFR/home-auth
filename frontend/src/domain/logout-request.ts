const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const CLIENT_ID_MAX_LENGTH = 128;

/**
 * The confirmation screen is reachable with any query string: the only text it may show from it
 * is a client id of the exact shape the server accepts.
 */
export function displayableClientId(value: string | null): string | null {
  if (
    value === null ||
    value.length > CLIENT_ID_MAX_LENGTH ||
    !CLIENT_ID_PATTERN.test(value)
  ) {
    return null;
  }
  return value;
}

/**
 * "Log out everywhere": an already expired session (401) is the state the user wanted, so the
 * flow goes on to the redirect. Any other failure still surfaces.
 */
export async function logoutEverywhere(api: {
  logout(): Promise<void>;
}): Promise<void> {
  try {
    await api.logout();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (error as Error & { status?: unknown }).status !== 401
    ) {
      throw error;
    }
  }
}
