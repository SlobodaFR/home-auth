import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './infrastructure/config/validate-env';
import { CoreModule } from './infrastructure/core.module';
import { loggerParams } from './infrastructure/logging/logger.config';
import { DatabaseModule } from './infrastructure/persistence/database.module';
import { API_ROUTES } from './interfaces/http/api-routes';
import { AdminModule } from './interfaces/http/modules/admin.module';
import { AuthModule } from './interfaces/http/modules/auth.module';
import { OAuthModule } from './interfaces/http/modules/oauth.module';
import { ProfileModule } from './interfaces/http/modules/profile.module';
import { ServerErrorTelemetryFilter } from './interfaces/http/server-error-telemetry.filter';
import { TelemetryThrottlerGuard } from './interfaces/http/telemetry-throttler.guard';
import { TelemetryInterceptor } from './interfaces/http/telemetry.interceptor';
import { throttlerOptions } from './interfaces/http/throttling';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Async: @nestjs/config 12 loads .env into process.env after the decorator arguments evaluate.
    LoggerModule.forRootAsync({
      useFactory: () => loggerParams(process.env.NODE_ENV),
    }),
    ThrottlerModule.forRoot(throttlerOptions),
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
  providers: [
    { provide: APP_GUARD, useClass: TelemetryThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: TelemetryInterceptor },
    { provide: APP_FILTER, useClass: ServerErrorTelemetryFilter },
  ],
})
export class AppModule {}
