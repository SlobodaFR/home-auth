import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

const COMMON = {
  strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true }, // no preload: hard to undo
  frameguard: { action: 'deny' as const },
  // The magic-link page carries its token in the URL: never leak it through Referer.
  referrerPolicy: { policy: 'no-referrer' as const },
};

const strict = helmet({
  ...COMMON,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      // ui-avatars: generated avatars are a redirect from /avatars.
      imgSrc: ["'self'", 'data:', 'https://ui-avatars.com'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
});

// Swagger UI needs inline scripts; /docs is disabled in production (#25).
const withoutCsp = helmet({ ...COMMON, contentSecurityPolicy: false });

/** Security headers for every response: API, SPA static files and /docs. */
export function applySecurityHeaders(app: NestExpressApplication): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/avatars/')) {
      // Client apps embed avatars cross-origin (<img src=".../avatars/:id">).
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      helmet({
        ...COMMON,
        crossOriginResourcePolicy: false,
        contentSecurityPolicy: false,
      })(req, res, next);
      return;
    }
    (req.path === '/docs' || req.path.startsWith('/docs/')
      ? withoutCsp
      : strict)(req, res, next);
  });
}
