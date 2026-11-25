import { describe, expect, it, vi } from 'vitest';
import { ApiError, apiClient } from '../infrastructure/api-client';
import { displayableClientId, logoutEverywhere } from './logout-request';

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

describe('logoutEverywhere', () => {
  const failing = (status: number) => ({
    logout: vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new ApiError('nope', status)),
  });

  it('calls logout', async () => {
    const api = {
      logout: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    };
    await logoutEverywhere(api);
    expect(api.logout).toHaveBeenCalledOnce();
  });

  it('carries on when the session already expired (401)', async () => {
    await expect(logoutEverywhere(failing(401))).resolves.toBeUndefined();
  });

  it.each([403, 500])('still fails on %s', async (status) => {
    await expect(logoutEverywhere(failing(status))).rejects.toThrow('nope');
  });

  it('still fails on a network error', async () => {
    const api = {
      logout: vi
        .fn<() => Promise<void>>()
        .mockRejectedValue(new TypeError('offline')),
    };
    await expect(logoutEverywhere(api)).rejects.toThrow('offline');
  });

  it('treats a real 401 from the api client as expired', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ message: 'Unauthorized' }, { status: 401 }),
        ),
    );
    try {
      await expect(logoutEverywhere(apiClient)).resolves.toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
