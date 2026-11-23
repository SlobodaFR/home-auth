import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './api-client';

describe('apiClient.regenerateWebhookSecret', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to the client webhook-secret endpoint with the session cookie', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ webhookSecret: 'a'.repeat(64) }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    globalThis.fetch = fetchMock;

    const result = await apiClient.regenerateWebhookSecret('budget');

    expect(result).toEqual({ webhookSecret: 'a'.repeat(64) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/admin/clients/budget/webhook-secret');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });

  it('surfaces the server error message', async () => {
    globalThis.fetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Client x not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(apiClient.regenerateWebhookSecret('x')).rejects.toThrow(
      'Client x not found',
    );
  });
});
