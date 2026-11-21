import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';

describe('apiClient.revokeUserSessions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs /admin/users/:id/revoke-sessions with the session cookie', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.revokeUserSessions('u1');

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      '/admin/users/u1/revoke-sessions',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('rejects with the server message when the user is unknown', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json({ message: 'User u9 not found' }, { status: 404 }),
        ),
    );

    await expect(apiClient.revokeUserSessions('u9')).rejects.toThrow(
      'User u9 not found',
    );
  });
});
