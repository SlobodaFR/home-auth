import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AuthorizeUseCase } from '../../application/auth/authorize.use-case';
import { ExchangeCodeUseCase } from '../../application/auth/exchange-code.use-case';
import { LookupUserByEmailUseCase } from '../../application/auth/lookup-user-by-email.use-case';
import { RefreshTokenUseCase } from '../../application/auth/refresh-token.use-case';
import { GetUserInfoUseCase } from '../../application/profile/get-user-info.use-case';
import { FakeTelemetry } from '../../application/test/in-memory-repositories';
import { SessionService } from '../../domain/auth/session.service';
import { TokenService } from '../../domain/auth/token.service';
import { Telemetry } from '../../domain/shared/telemetry';
import { UserRepository } from '../../domain/user/user.repository';
import { OAuthController } from './controllers/oauth.controller';

const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const REDIRECT = 'https://budget.example.com/cb';

describe('OAuth state and PKCE (HTTP)', () => {
  let app: NestExpressApplication;
  const authorize = jest.fn().mockResolvedValue('the-code');
  const exchange = jest.fn().mockResolvedValue({
    accessToken: 'a',
    refreshToken: 'r',
    tokenType: 'Bearer',
    expiresIn: 900,
  });
  let signedIn = true;

  beforeEach(async () => {
    authorize.mockClear();
    exchange.mockClear();
    signedIn = true;
    const moduleRef = await Test.createTestingModule({
      controllers: [OAuthController],
      providers: [
        { provide: AuthorizeUseCase, useValue: { execute: authorize } },
        { provide: ExchangeCodeUseCase, useValue: { execute: exchange } },
        { provide: RefreshTokenUseCase, useValue: {} },
        { provide: GetUserInfoUseCase, useValue: {} },
        { provide: LookupUserByEmailUseCase, useValue: {} },
        {
          provide: SessionService,
          useValue: {
            verify: () => Promise.resolve(signedIn ? 'user-1' : null),
          },
        },
        {
          provide: UserRepository,
          useValue: { findById: () => Promise.resolve({ id: 'user-1' }) },
        },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            FRONTEND_URL: 'https://auth.example.com',
          }),
        },
        { provide: Telemetry, useValue: new FakeTelemetry() },
        { provide: TokenService, useValue: {} },
      ],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const authorizeRequest = (query: Record<string, string>) =>
    request(app.getHttpServer())
      .get('/authorize')
      .query({ client_id: 'budget', redirect_uri: REDIRECT, ...query })
      .set('Cookie', 'auth_session=jwt');

  it('echoes state in the success redirect', async () => {
    const response = await authorizeRequest({ state: 'a b&c' }).expect(302);

    const location = new URL(response.headers.location);
    expect(location.searchParams.get('code')).toBe('the-code');
    expect(location.searchParams.get('state')).toBe('a b&c');
  });

  it('does not add state when the client sent none', async () => {
    const response = await authorizeRequest({}).expect(302);

    expect(new URL(response.headers.location).searchParams.has('state')).toBe(
      false,
    );
  });

  it('passes an S256 challenge to the use case', async () => {
    await authorizeRequest({
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
    }).expect(302);

    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ codeChallenge: CHALLENGE }),
    );
  });

  it.each([
    ['a challenge without method', { code_challenge: CHALLENGE }],
    [
      'the plain method',
      { code_challenge: CHALLENGE, code_challenge_method: 'plain' },
    ],
    ['a method without challenge', { code_challenge_method: 'S256' }],
    [
      'a malformed challenge',
      { code_challenge: 'short', code_challenge_method: 'S256' },
    ],
    ['a state over 512 characters', { state: 'x'.repeat(513) }],
  ])('answers 400 for %s', async (_label, query) => {
    await authorizeRequest(query).expect(400);

    expect(authorize).not.toHaveBeenCalled();
  });

  it('keeps state and challenge through the login redirect', async () => {
    signedIn = false;

    const response = await authorizeRequest({
      state: 'xyz',
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
    }).expect(302);

    const redirect =
      new URL(response.headers.location).searchParams.get('redirect') ?? '';
    expect(redirect).toContain('state=xyz');
    expect(redirect).toContain(`code_challenge=${CHALLENGE}`);
  });

  it('passes code_verifier to the exchange', async () => {
    await request(app.getHttpServer())
      .post('/token')
      .send({
        grant_type: 'authorization_code',
        client_id: 'budget',
        client_secret: 's',
        code: 'c',
        redirect_uri: REDIRECT,
        code_verifier: VERIFIER,
      })
      .expect(201); // /token answers 201 today: unchanged

    expect(exchange).toHaveBeenCalledWith(
      expect.objectContaining({ codeVerifier: VERIFIER }),
    );
  });

  it('answers 400 for a malformed code_verifier', async () => {
    await request(app.getHttpServer())
      .post('/token')
      .send({
        grant_type: 'authorization_code',
        client_id: 'budget',
        client_secret: 's',
        code: 'c',
        redirect_uri: REDIRECT,
        code_verifier: 'bad verifier',
      })
      .expect(400);

    expect(exchange).not.toHaveBeenCalled();
  });

  it('answers 400 for a null code_verifier', async () => {
    await request(app.getHttpServer())
      .post('/token')
      .send({
        grant_type: 'authorization_code',
        client_id: 'budget',
        client_secret: 's',
        code: 'c',
        redirect_uri: REDIRECT,
        code_verifier: null,
      })
      .expect(400);

    expect(exchange).not.toHaveBeenCalled();
  });
});
