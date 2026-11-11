import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { buildCorsOptions } from './interfaces/http/cors';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  // Lets providers flush on SIGTERM (telemetry queue).
  app.enableShutdownHooks();
  // Number of reverse-proxy hops to trust for X-Forwarded-For (req.ip feeds
  // the rate limit). Production: 1 (Caddy, which drops client-sent
  // X-Forwarded-For since no trusted_proxies is configured). Unset in local
  // dev, otherwise any client could spoof its IP.
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (trustProxyHops > 0) {
    app.set('trust proxy', trustProxyHops);
  }
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  app.enableCors(
    buildCorsOptions({
      authBaseUrl: process.env.AUTH_BASE_URL ?? 'http://localhost:3000',
      frontendUrl: process.env.FRONTEND_URL,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Auth Service')
    .setDescription(
      "Service centralise d'authentification/autorisation/profil (SSO, OAuth2 Authorization Code + JWT RS256/JWKS)",
    )
    .setVersion('1.0')
    .addCookieAuth('auth_session', { type: 'apiKey', in: 'cookie' })
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
}

void bootstrap();
