import { describe, expect, it } from 'vitest';
import {
  CHARSETS,
  MAX_LENGTH,
  RandomSource,
  RandomStringOptions,
  generateRandomString,
} from './random-string';

const all: RandomStringOptions = {
  length: 32,
  uppercase: true,
  lowercase: true,
  digits: true,
  special: true,
};

function sequenceSource(values: number[]): RandomSource {
  let index = 0;
  return (array) => {
    for (let i = 0; i < array.length; i += 1) {
      array[i] = values[index % values.length] ?? 0;
      index += 1;
    }
    return array;
  };
}

describe('generateRandomString', () => {
  it('respects the requested length', () => {
    for (const length of [4, 8, 32, 64, MAX_LENGTH]) {
      expect(generateRandomString({ ...all, length })).toHaveLength(length);
    }
  });

  it('only uses characters from the selected classes', () => {
    const result = generateRandomString({
      ...all,
      length: 128,
      special: false,
      lowercase: false,
    });
    expect(result).toMatch(/^[A-Z0-9]{128}$/);
  });

  it('includes at least one character of each selected class', () => {
    for (let run = 0; run < 50; run += 1) {
      const result = generateRandomString({ ...all, length: 4 });
      expect(result).toMatch(/[A-Z]/);
      expect(result).toMatch(/[a-z]/);
      expect(result).toMatch(/[0-9]/);
      expect(
        result.split('').some((char) => CHARSETS.special.includes(char)),
      ).toBe(true);
    }
  });

  it('works with a single class', () => {
    const result = generateRandomString({
      length: 16,
      uppercase: false,
      lowercase: false,
      digits: true,
      special: false,
    });
    expect(result).toMatch(/^[0-9]{16}$/);
  });

  it('is deterministic with an injected random source', () => {
    const a = generateRandomString(all, sequenceSource([1, 2, 3, 4, 5]));
    const b = generateRandomString(all, sequenceSource([1, 2, 3, 4, 5]));
    expect(a).toBe(b);
  });

  it('rejects values in the biased tail instead of using modulo', () => {
    // 10 digits: limit = floor(2^32 / 10) * 10 = 4294967290; 4294967295 must be rejected.
    const calls: number[] = [];
    const values = [4294967295, 4294967290, 7];
    let index = 0;
    const source: RandomSource = (array) => {
      for (let i = 0; i < array.length; i += 1) {
        array[i] = values[index] ?? 0;
        index += 1;
        calls.push(array[i] ?? 0);
      }
      return array;
    };
    const result = generateRandomString(
      {
        length: 1,
        uppercase: false,
        lowercase: false,
        digits: true,
        special: false,
      },
      source,
    );
    // 4294967295 and 4294967290 are >= limit -> rejected; 7 accepted -> '7'.
    expect(calls.slice(0, 3)).toEqual(values);
    expect(result).toBe('7');
  });

  it('accepts the largest unbiased value', () => {
    const source = sequenceSource([4294967289]);
    const result = generateRandomString(
      {
        length: 1,
        uppercase: false,
        lowercase: false,
        digits: true,
        special: false,
      },
      source,
    );
    expect(result).toBe('9');
  });

  it('throws when no class is selected', () => {
    expect(() =>
      generateRandomString({
        length: 16,
        uppercase: false,
        lowercase: false,
        digits: false,
        special: false,
      }),
    ).toThrow('Au moins un jeu de caracteres');
  });

  it('throws when the length is invalid', () => {
    expect(() => generateRandomString({ ...all, length: 3 })).toThrow(
      'Longueur',
    );
    expect(() =>
      generateRandomString({ ...all, length: MAX_LENGTH + 1 }),
    ).toThrow('Longueur');
    expect(() => generateRandomString({ ...all, length: 10.5 })).toThrow(
      'Longueur',
    );
    expect(() => generateRandomString({ ...all, length: Number.NaN })).toThrow(
      'Longueur',
    );
  });
});
