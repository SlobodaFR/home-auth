import { Injectable, NotFoundException } from '@nestjs/common';
import { resolvePostLogoutRedirect } from '../../domain/auth/post-logout-redirect';
import { TokenService } from '../../domain/auth/token.service';
import { ClientRepository } from '../../domain/client/client.repository';
import { FeatureFlags } from '../../domain/shared/feature-flags';
import { Telemetry } from '../../domain/shared/telemetry';
import { ResolveSessionUseCase } from './resolve-session.use-case';

export const RP_LOGOUT_FLAG = 'auth-rp-initiated-logout';

const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const CLIENT_ID_MAX_LENGTH = 128;
const STATE_MAX_LENGTH = 512;

export interface RpLogoutParams {
  clientId: string;
  postLogoutRedirectUri: string;
  state?: string;
}

export interface BeginRpLogoutInput extends RpLogoutParams {
  sessionCookie: string | undefined;
  /** access_token_hint: a bearer access token of this client. */
  hint?: string;
  /** A real top-level navigation (not a prefetch, prerender or subresource request). */
  isNavigation: boolean;
}

export interface ConfirmRpLogoutInput extends RpLogoutParams {
  sessionCookie: string | undefined;
}

export type RpLogoutResult =
  | { kind: 'invalid'; reason: 'unknown_client' | 'invalid_request' }
  /** The caller clears the SSO cookie of this browser, then redirects. */
  | { kind: 'redirect'; redirectTo: string; clearCookie: true }
  | { kind: 'confirm' };

/**
 * PC10, service-initiated logout. Ends the SSO session of this browser only: the caller clears
 * the cookie. Nothing is revoked server-side (no sessionVersion bump, no refresh token, no
 * webhook): those would reach the user's other devices.
 */
@Injectable()
export class RpLogoutUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly resolveSession: ResolveSessionUseCase,
    private readonly tokenService: TokenService,
    private readonly featureFlags: FeatureFlags,
    private readonly telemetry: Telemetry,
  ) {}

  async begin(input: BeginRpLogoutInput): Promise<RpLogoutResult> {
    await this.assertEnabled();
    const validated = await this.validate(input);
    if (validated.kind === 'invalid') {
      return validated;
    }
    const user = await this.resolveSession.execute(input.sessionCookie);
    if (!user) {
      return this.finish('no_session', input.clientId, validated.redirectTo);
    }

    const hintClaims =
      input.isNavigation && input.hint
        ? await this.tokenService.verifyAccessToken(input.hint, input.clientId)
        : null;
    if (hintClaims?.sub !== user.id) {
      this.telemetry.capture(
        {
          name: 'rp_logout',
          properties: {
            outcome: 'confirm_required',
            client_id: input.clientId,
          },
        },
        user.id,
      );
      return { kind: 'confirm' };
    }
    return this.finish(
      'logged_out',
      input.clientId,
      validated.redirectTo,
      user.id,
    );
  }

  async confirm(input: ConfirmRpLogoutInput): Promise<RpLogoutResult> {
    await this.assertEnabled();
    const validated = await this.validate(input);
    if (validated.kind === 'invalid') {
      return validated;
    }
    const user = await this.resolveSession.execute(input.sessionCookie);
    return this.finish(
      user ? 'logged_out' : 'no_session',
      input.clientId,
      validated.redirectTo,
      user?.id,
    );
  }

  private async assertEnabled(): Promise<void> {
    if (!(await this.featureFlags.isEnabled(RP_LOGOUT_FLAG, false))) {
      throw new NotFoundException();
    }
  }

  private finish(
    outcome: 'logged_out' | 'no_session',
    clientId: string,
    redirectTo: string,
    userId?: string,
  ): RpLogoutResult {
    this.telemetry.capture(
      { name: 'rp_logout', properties: { outcome, client_id: clientId } },
      userId,
    );
    return { kind: 'redirect', redirectTo, clearCookie: true };
  }

  private async validate(
    params: RpLogoutParams,
  ): Promise<
    | { kind: 'invalid'; reason: 'unknown_client' | 'invalid_request' }
    | { kind: 'valid'; redirectTo: string }
  > {
    const invalid = (reason: 'unknown_client' | 'invalid_request') => {
      this.telemetry.capture({
        name: 'rp_logout',
        properties: { outcome: reason },
      });
      return { kind: 'invalid' as const, reason };
    };
    if (
      params.clientId.length > CLIENT_ID_MAX_LENGTH ||
      !CLIENT_ID_PATTERN.test(params.clientId) ||
      (params.state?.length ?? 0) > STATE_MAX_LENGTH
    ) {
      return invalid('invalid_request');
    }
    const client = await this.clientRepository.findById(params.clientId);
    if (!client) {
      return invalid('unknown_client');
    }
    const redirectTo = resolvePostLogoutRedirect(
      params.postLogoutRedirectUri,
      client.redirectUris,
      params.state,
    );
    if (!redirectTo) {
      return invalid('invalid_request');
    }
    return { kind: 'valid', redirectTo };
  }
}
