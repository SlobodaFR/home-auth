import { randomUUID } from 'crypto';
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';
import { pseudonymize } from '../../domain/shared/pseudonymize';
import {
  sanitizeTelemetryProperties,
  Telemetry,
  TelemetryEvent,
} from '../../domain/shared/telemetry';

const DEFAULT_HOST = 'https://eu.i.posthog.com';

/** The part of the posthog-node client this adapter uses (injectable for tests). */
export interface PostHogClient {
  capture(message: {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
    disableGeoip: boolean;
  }): void;
  shutdown(): Promise<void>;
}

type PostHogClientFactory = (
  apiKey: string,
  options: {
    host: string;
    disableGeoip: boolean;
    flushAt: number;
    flushInterval: number;
  },
) => PostHogClient;

const createPostHogClient: PostHogClientFactory = (apiKey, options) =>
  new PostHog(apiKey, options);

/** Disabled (no client, no network) when POSTHOG_API_KEY is absent. */
export function createPostHogTelemetry(
  config: ConfigService,
  factory: PostHogClientFactory = createPostHogClient,
): PostHogTelemetry {
  const apiKey = config.get<string>('POSTHOG_API_KEY');
  const secret = config.getOrThrow<string>('PSEUDONYM_SECRET');
  if (!apiKey) {
    return new PostHogTelemetry(null, secret);
  }
  return new PostHogTelemetry(
    factory(apiKey, {
      host: config.get<string>('POSTHOG_HOST') ?? DEFAULT_HOST,
      disableGeoip: true,
      flushAt: 20,
      flushInterval: 10_000,
    }),
    secret,
  );
}

export class PostHogTelemetry
  extends Telemetry
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(PostHogTelemetry.name);

  constructor(
    private readonly client: PostHogClient | null,
    private readonly pseudonymSecret: string,
  ) {
    super();
  }

  capture(event: TelemetryEvent, userId?: string): void {
    if (!this.client) {
      return;
    }
    try {
      this.client.capture({
        // Anonymous events get a throwaway id and no person profile.
        distinctId: userId
          ? pseudonymize(userId, this.pseudonymSecret)
          : randomUUID(),
        event: event.name,
        properties: {
          ...sanitizeTelemetryProperties(event.properties),
          // The PostHog project may be shared by several home services.
          service: 'home-auth',
          // Belt and braces only: the enforceable control is the project setting "Discard client IP data".
          $ip: null,
          ...(userId ? {} : { $process_person_profile: false }),
        },
        disableGeoip: true,
      });
    } catch (error) {
      this.logger.warn(
        `Telemetry capture failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client?.shutdown();
  }
}
