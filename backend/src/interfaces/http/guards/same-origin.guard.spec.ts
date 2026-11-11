import {
  ExecutionContext,
  ForbiddenException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SameOriginGuard } from './same-origin.guard';

function guard(
  env: Record<string, string> = { AUTH_BASE_URL: 'https://auth.sloboda.fr' },
) {
  return new SameOriginGuard(new ConfigService(env));
}

function context(
  method: string,
  headers: Record<string, string>,
): ExecutionContext {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers: lower }) }),
  } as unknown as ExecutionContext;
}

describe('SameOriginGuard', () => {
  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'lets %s through whatever the headers',
    (method) => {
      expect(
        guard().canActivate(
          context(method, { 'Sec-Fetch-Site': 'cross-site' }),
        ),
      ).toBe(true);
    },
  );

  it('accepts a same-origin request', () => {
    expect(
      guard().canActivate(context('POST', { 'Sec-Fetch-Site': 'same-origin' })),
    ).toBe(true);
  });

  // same-site is exactly the attack: another *.sloboda.fr subdomain.
  it.each(['same-site', 'cross-site', 'none'])(
    'refuses Sec-Fetch-Site %s even with a trusted Origin',
    (site) => {
      expect(() =>
        guard().canActivate(
          context('POST', {
            'Sec-Fetch-Site': site,
            Origin: 'https://auth.sloboda.fr',
          }),
        ),
      ).toThrow(ForbiddenException);
    },
  );

  it('falls back to a trusted Origin when Sec-Fetch-Site is absent', () => {
    expect(
      guard().canActivate(
        context('POST', { Origin: 'https://auth.sloboda.fr' }),
      ),
    ).toBe(true);
  });

  it('refuses an untrusted Origin, or no Origin at all', () => {
    expect(() =>
      guard().canActivate(
        context('POST', { Origin: 'https://budget.sloboda.fr' }),
      ),
    ).toThrow(ForbiddenException);
    expect(() => guard().canActivate(context('POST', {}))).toThrow(
      ForbiddenException,
    );
  });

  it('trusts the frontend origin in dev', () => {
    const devGuard = guard({
      AUTH_BASE_URL: 'http://localhost:3000',
      FRONTEND_URL: 'http://localhost:5173',
    });
    expect(
      devGuard.canActivate(
        context('POST', { Origin: 'http://localhost:5173' }),
      ),
    ).toBe(true);
  });

  it('defaults to the local service URL without configuration', () => {
    expect(
      guard({}).canActivate(
        context('POST', { Origin: 'http://localhost:3000' }),
      ),
    ).toBe(true);
  });

  it.each(['application/x-www-form-urlencoded', 'text/plain; charset=utf-8'])(
    'refuses %s bodies (form posts) even from the same origin',
    (contentType) => {
      expect(() =>
        guard().canActivate(
          context('POST', {
            'Sec-Fetch-Site': 'same-origin',
            'Content-Type': contentType,
          }),
        ),
      ).toThrow(UnsupportedMediaTypeException);
    },
  );

  it('accepts JSON and multipart bodies', () => {
    for (const contentType of [
      'application/json',
      'multipart/form-data; boundary=x',
    ]) {
      expect(
        guard().canActivate(
          context('POST', {
            'Sec-Fetch-Site': 'same-origin',
            'Content-Type': contentType,
          }),
        ),
      ).toBe(true);
    }
  });
});
