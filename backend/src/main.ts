import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  app.enableCors({ origin: process.env.FRONTEND_URL ?? true, credentials: true });

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
