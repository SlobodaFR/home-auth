import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

function originOf(url: string, variable: string): string {
  try {
    return new URL(url).origin;
  } catch {
    throw new Error(`${variable} must be a valid URL`);
  }
}

/**
 * The SPA is served by this service (same origin), so CORS is off by default. Only a frontend on
 * another origin (Vite dev server) gets access, and only that exact origin: never `true`, never a
 * wildcard, since responses carry the session cookie.
 */
export function buildCorsOptions(params: {
  authBaseUrl: string;
  frontendUrl?: string;
}): CorsOptions {
  if (!params.frontendUrl) {
    return { origin: false };
  }
  const frontendOrigin = originOf(params.frontendUrl, 'FRONTEND_URL');
  if (frontendOrigin === originOf(params.authBaseUrl, 'AUTH_BASE_URL')) {
    return { origin: false };
  }
  return { origin: [frontendOrigin], credentials: true };
}
