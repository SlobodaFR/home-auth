import { InitialSchema1794400000000 } from './1794400000000-InitialSchema';
import { AddRefreshTokenFamilies1794800000000 } from './1794800000000-AddRefreshTokenFamilies';

/**
 * Migrations, in order. Listed as classes (no glob) so src/*.ts and dist/*.js cannot diverge.
 * Every entity change needs a new migration here: the migrations spec fails otherwise.
 */
export const MIGRATIONS = [
  InitialSchema1794400000000,
  AddRefreshTokenFamilies1794800000000,
];
