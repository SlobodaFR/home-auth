# CLAUDE.md

Ce fichier guide Claude Code (et tout contributeur) sur les conventions de ce projet.

## Vue d'ensemble

Service d'authentification/autorisation/profil centralisé (SSO maison, OAuth2 Authorization Code +
JWT RS256/JWKS), consommé par plusieurs applications personnelles (Foyer Budget, futures apps domotique...).

- **Backend**: NestJS + TypeORM + SQLite (better-sqlite3, WAL), clean architecture
- **Frontend**: React + Vite + TypeScript + Tailwind CSS, clean architecture
- **Monorepo**: npm workspaces (`backend`, `frontend`)
- **Docker**: image unique, backend Nest sert le frontend buildé, réplication SQLite → MinIO via Litestream

## Architecture

```txt
backend/src/
  domain/ # Entites, value objects, ports de repository (zero dependance framework)
  application/ # Use-cases orchestrant les objets du domaine
  infrastructure/ # TypeORM, JWKS/RSA, client MinIO, Resend
  interfaces/http/ # Controllers, DTOs, guards, modules

frontend/src/
  domain/ # Types et logique metier pure
  application/ # Hooks orchestrant les appels API (use-cases)
  infrastructure/ # Client API
  presentation/ # Composants et pages React
```


**Règles strictes**:
- `domain/` ne dépend de rien d'externe (pas de NestJS, pas de TypeORM). Entités et value objects en
  TypeScript pur, validés par leurs invariants.
- `application/` orchestre via des ports (interfaces) définis dans `domain/`, jamais d'implémentation
  concrète importée directement.
- `infrastructure/` implémente les ports. Aucune logique métier ici.
- `interfaces/http/` ne contient que de la traduction HTTP ↔ use-cases (DTOs, validation, guards).

## TDD

- Tout nouveau comportement (domaine + application) commence par un test qui échoue.
- `domain/` et `application/` : couverture quasi totale attendue, tests rapides (pas de DB/réseau).
- `infrastructure/` : tests d'intégration ciblés (TypeORM avec SQLite en mémoire, mocks MinIO/Resend).
- Commande: `npm test` (backend Jest + frontend Vitest), `npm run test:backend`, `npm run test:frontend`.

## Qualité de code

### ESLint + Prettier

- ESLint avec `@typescript-eslint` (config `strict-type-checked` + `stylistic-type-checked`), plus
  `eslint-plugin-import` (ordre des imports) et `eslint-config-prettier` (désactive les règles de style
  qui entrent en conflit avec Prettier).
- Prettier pour le formatage (config par défaut, `singleQuote: true`, `trailingComma: 'all'`).
- Commandes: `npm run lint`, `npm run format`.
- Aucune règle ESLint désactivée inline (`// eslint-disable`) sans justification en commentaire.

### Husky + lint-staged

- Hook `pre-commit` (Husky) exécute `lint-staged` :
  - `*.{ts,tsx}` → `eslint --fix` puis `prettier --write`
  - `*.{json,md,yml,yaml}` → `prettier --write`
- Hook `pre-push` : lance `npm test` (échec bloquant).

### Commits conventionnels

- Hook `commit-msg` (Husky) + `commitlint` (`@commitlint/config-conventional`).
- Format: `<type>(<scope optionnel>): <description>`, types autorisés:
  `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`, `build`, `perf`.
- Exemples: `feat(auth): add authorization code flow`, `fix(avatar): handle missing minio object`.
- Les messages de commit générés par Claude doivent suivre ce format.

### Mutation testing (Stryker)

- StrykerJS configuré sur `backend/src/domain/**` et `backend/src/application/**` (les couches à plus
  forte valeur métier — pas sur `infrastructure/`/`interfaces/`, trop coûteux/peu pertinent).
- Commande: `npm run test:mutation --workspace=backend`.
- Seuil cible: `break: 80`, `low: 85`, `high: 95` (ajuster si trop lent en local — exécuter en CI
  uniquement sur PR si besoin).
- Si un mutant survit, soit le test manquant est ajouté, soit la justification est documentée dans le
  rapport (pas de suppression silencieuse de mutant).

## Build & dev

```bash
npm install
cp backend/.env.example backend/.env   # puis editer JWT keys, ADMIN_EMAIL, MINIO_*, etc.
npm run dev:backend    # Nest
npm run dev:frontend   # Vite, proxy /api vers le backend
npm run build          # build:frontend + build:backend
```

## Sécurité — points d'attention

- `client_secret` : ne jamais logger, retourné en clair une seule fois à la création.
- Tokens (`RefreshToken`, `MagicLinkToken`, `AuthorizationCode`) : stockés hashés (jamais en clair) en DB.
- Cookies de session : `httpOnly`, `secure` en production, `sameSite` adapté au flow cross-domain.
- Webhooks de logout : timeout court, pas de retry, ne jamais bloquer le flow de logout principal sur leur
échec.


# Ce qu'il ne faut PAS faire

- Pas d'abstraction/config "au cas où" non demandée.
- Pas de rôles/permissions par app cliente dans ce service (reste local à chaque app, cf. `sub` du JWT).
- Pas de self-signup public (invitation admin obligatoire, sauf bootstrap `ADMIN_EMAIL`).