import { InitialSchema1794400000000 } from './1794400000000-InitialSchema';
import { AddUserSessionVersion1794700000000 } from './1794700000000-AddUserSessionVersion';
import { AddRefreshTokenFamilies1794800000000 } from './1794800000000-AddRefreshTokenFamilies';
import { AddTokenReuseMarkers1794900000000 } from './1794900000000-AddTokenReuseMarkers';

/**
 * Migrations, in order. Listed as classes (no glob) so src/*.ts and dist/*.js cannot diverge.
 * Every entity change needs a new migration here: the migrations spec fails otherwise.
 */
export const MIGRATIONS = [
  InitialSchema1794400000000,
  AddUserSessionVersion1794700000000,
  AddRefreshTokenFamilies1794800000000,
  AddTokenReuseMarkers1794900000000,
];
