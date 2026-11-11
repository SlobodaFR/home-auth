import { ConfigService } from '@nestjs/config';
import { pseudonymize } from '../../domain/shared/pseudonymize';
import {
  createPostHogTelemetry,
  PostHogClient,
  PostHogTelemetry,
} from './posthog-telemetry';

const SECRET = 's'.repeat(64);

type CaptureMessage = Parameters<PostHogClient['capture']>[0];

class FakeClient implements PostHogClient {
  readonly captured: CaptureMessage[] = [];
  shutdowns = 0;
  failing = false;

  capture(message: CaptureMessage): void {
    if (this.failing) {
      throw new Error('network');
    }
    this.captured.push(message);
  }

  async shutdown(): Promise<void> {
    this.shutdowns += 1;
    return Promise.resolve();
  }
}

describe('PostHogTelemetry', () => {
  it('is disabled without POSTHOG_API_KEY: no client is created', () => {
    const factory =
      vi.fn<(apiKey: string, options: unknown) => PostHogClient>();

    const telemetry = createPostHogTelemetry(
      new ConfigService({ PSEUDONYM_SECRET: SECRET }),
      factory,
    );
    telemetry.capture(
      { name: 'login_succeeded', properties: { method: 'magic_link' } },
      'user-1',
    );

    expect(factory).not.toHaveBeenCalled();
  });

  it('creates an EU, geoip-free client when a key is set', () => {
    const factory = vi
      .fn<(apiKey: string, options: unknown) => PostHogClient>()
      .mockReturnValue(new FakeClient());

    createPostHogTelemetry(
      new ConfigService({
        POSTHOG_API_KEY: 'phc_test',
        PSEUDONYM_SECRET: SECRET,
      }),
      factory,
    );

    expect(factory).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        host: 'https://eu.i.posthog.com',
        disableGeoip: true,
      }),
    );
  });

  it('sends sanitized properties under the pseudonymized user id, with no IP', () => {
    const client = new FakeClient();

    new PostHogTelemetry(client, SECRET).capture(
      {
        name: 'authorize',
        properties: { client_id: 'budget', outcome: 'code' },
      },
      'user-1',
    );

    expect(client.captured).toEqual([
      {
        distinctId: pseudonymize('user-1', SECRET),
        event: 'authorize',
        properties: {
          client_id: 'budget',
          outcome: 'code',
          service: 'home-auth',
          $ip: null,
        },
        disableGeoip: true,
      },
    ]);
  });

  it('drops properties that look like personal data', () => {
    const client = new FakeClient();

    new PostHogTelemetry(client, SECRET).capture(
      { name: 'rate_limited', properties: { route: 'alice@example.com' } },
      'user-1',
    );

    expect(client.captured[0].properties).toEqual({
      service: 'home-auth',
      $ip: null,
    });
  });

  it('uses a random anonymous id, without a person profile, when no distinct id is given', () => {
    const client = new FakeClient();
    const telemetry = new PostHogTelemetry(client, SECRET);

    telemetry.capture({
      name: 'magic_link_requested',
      properties: { outcome: 'unknown' },
    });
    telemetry.capture({
      name: 'magic_link_requested',
      properties: { outcome: 'unknown' },
    });

    const [first, second] = client.captured;
    expect(first.distinctId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.distinctId).not.toBe(second.distinctId);
    expect(first.properties).toEqual({
      outcome: 'unknown',
      service: 'home-auth',
      $ip: null,
      $process_person_profile: false,
    });
  });

  it('never throws into the caller', () => {
    const client = new FakeClient();
    client.failing = true;

    expect(() => {
      new PostHogTelemetry(client, SECRET).capture(
        { name: 'login_succeeded', properties: { method: 'magic_link' } },
        'user-1',
      );
    }).not.toThrow();
  });

  it('flushes on application shutdown', async () => {
    const client = new FakeClient();

    await new PostHogTelemetry(client, SECRET).onApplicationShutdown();

    expect(client.shutdowns).toBe(1);
  });
});
