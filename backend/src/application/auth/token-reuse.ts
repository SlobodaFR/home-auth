/**
 * home-features flag read by home-auth (PC1, PC2): on a reused refresh token (after the grace
 * window) or a reused authorization code, delete the whole refresh token family. Code default
 * false: reuse is only reported (refresh_reused, code_reused) until the flag is turned on.
 */
export const REUSE_REVOCATION_FLAG = 'auth-refresh-reuse-revocation';

/** A rotated refresh token presented again within this delay gets a new pair (PC1). */
export const REFRESH_GRACE_MS = 30_000;
