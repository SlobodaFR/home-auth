import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { CoreModule } from './infrastructure/core.module';
import { DatabaseModule } from './infrastructure/persistence/database.module';
import { AdminModule } from './interfaces/http/modules/admin.module';
import { AuthModule } from './interfaces/http/modules/auth.module';
import { OAuthModule } from './interfaces/http/modules/oauth.module';
import { ProfileModule } from './interfaces/http/modules/profile.module';

// All /auth/* routes are POST-only, so the static SPA fallback (GET-only)
// never intercepts them. GET /auth/callback?token=... must fall through to
// index.html so the React app can handle the magic-link redirect.
const API_ROUTES = [
  '/.well-known/(.*)',
  '/docs',
  '/docs/(.*)',
  '/authorize',
  '/token',
  '/token/(.*)',
  '/userinfo',
  '/profile',
  '/profile/(.*)',
  '/avatars/(.*)',
  '/admin/(.*)',
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CoreModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      exclude: API_ROUTES,
    }),
    AuthModule,
    OAuthModule,
    ProfileModule,
    AdminModule,
  ],
})
export class AppModule {}
