export const CHARSETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  special: '!@#$%^&*()-_=+[]{};:,.?',
} as const;

export const MAX_LENGTH = 128;

export interface RandomStringOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  digits: boolean;
  special: boolean;
}

/** Fills the array with cryptographically secure random 32-bit values (Web Crypto compatible). */
export type RandomSource = (array: Uint32Array) => Uint32Array;

const UINT32_RANGE = 0x1_0000_0000;

const defaultRandomSource: RandomSource = (array) =>
  globalThis.crypto.getRandomValues(array);

/** Unbiased integer in [0, max) using rejection sampling. */
function randomInt(max: number, source: RandomSource): number {
  const limit = UINT32_RANGE - (UINT32_RANGE % max);
  const buffer = new Uint32Array(1);
  for (;;) {
    const value = source(buffer)[0];
    if (value < limit) {
      return value % max;
    }
  }
}

function pick(charset: string, source: RandomSource): string {
  return charset.charAt(randomInt(charset.length, source));
}

function shuffle(chars: string[], source: RandomSource): void {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1, source);
    const current = chars[i];
    chars[i] = chars[j];
    chars[j] = current;
  }
}

export function generateRandomString(
  options: RandomStringOptions,
  randomValues: RandomSource = defaultRandomSource,
): string {
  const selected: string[] = [];
  if (options.uppercase) selected.push(CHARSETS.uppercase);
  if (options.lowercase) selected.push(CHARSETS.lowercase);
  if (options.digits) selected.push(CHARSETS.digits);
  if (options.special) selected.push(CHARSETS.special);

  if (selected.length === 0) {
    throw new Error('Au moins un jeu de caracteres doit etre selectionne');
  }
  const { length } = options;
  if (
    !Number.isInteger(length) ||
    length < selected.length ||
    length > MAX_LENGTH
  ) {
    throw new Error(
      `Longueur invalide: entier entre ${selected.length.toString()} et ${MAX_LENGTH.toString()}`,
    );
  }

  const pool = selected.join('');
  const chars = selected.map((charset) => pick(charset, randomValues));
  while (chars.length < length) {
    chars.push(pick(pool, randomValues));
  }
  shuffle(chars, randomValues);
  return chars.join('');
}
