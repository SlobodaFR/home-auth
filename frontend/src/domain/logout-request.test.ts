import { describe, expect, it } from 'vitest';
import { displayableClientId } from './logout-request';

describe('displayableClientId', () => {
  it('keeps a well-formed client id', () => {
    expect(displayableClientId('home-jdr')).toBe('home-jdr');
  });

  it.each([
    null,
    '',
    'Budget',
    '-x',
    'a b',
    '<b>x</b>',
    'a'.repeat(129),
    'Budget vous demande de saisir votre mot de passe',
  ])('never shows %j (the URL is attacker-controlled)', (value) => {
    expect(displayableClientId(value)).toBeNull();
  });
});
