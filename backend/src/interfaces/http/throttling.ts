import { minutes, ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * HTTP rate limit, applied by the global ThrottlerGuard to every route.
 *
 * - Keyed on req.ip, resolved through `trust proxy` (see main.ts). IPv6
 *   clients are grouped by /64 (throttler default), so rotating addresses
 *   inside one allocation does not bypass it.
 * - Budgets are per route and per IP (the default key includes the
 *   controller and handler), not one global budget per IP.
 * - In-memory storage: counters reset on restart, fine for a single instance.
 *
 * The per-email cap on magic links lives in RequestMagicLinkUseCase, because
 * it must never answer 429 (that would let anyone lock a user out).
 */
export const THROTTLE_ERROR_MESSAGE =
  'Trop de tentatives, réessayez plus tard.';

export const throttlerOptions: ThrottlerModuleOptions = {
  errorMessage: THROTTLE_ERROR_MESSAGE,
  ipv6SubnetPrefix: 64,
  throttlers: [{ ttl: minutes(1), limit: 100 }],
};
