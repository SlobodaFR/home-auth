import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** API documentation on /docs, outside production only: it maps the whole attack surface. */
export function setupSwagger(
  app: INestApplication,
  nodeEnv: string | undefined,
): void {
  if (nodeEnv === 'production') {
    return;
  }
  const config = new DocumentBuilder()
    .setTitle('Auth Service')
    .setDescription(
      "Service centralise d'authentification/autorisation/profil (SSO, OAuth2 Authorization Code + JWT RS256/JWKS)",
    )
    .setVersion('1.0')
    .addCookieAuth('auth_session', { type: 'apiKey', in: 'cookie' })
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
}
