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
