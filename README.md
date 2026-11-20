# Auth Service

Service centralisé d'authentification, d'autorisation et de profil pour les applications
personnelles (Foyer Budget en premier consommateur). SSO maison par lien magique (sans mot de
passe), exposé en OAuth2 Authorization Code + JWT RS256/JWKS.

## Stack

- **Backend**: NestJS + TypeORM + SQLite (better-sqlite3, mode WAL), clean architecture
  (`domain` / `application` / `infrastructure` / `interfaces/http`)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS, clean architecture
- **Monorepo**: npm workspaces (`backend`, `frontend`)
- **Docker**: image unique, le backend Nest sert le frontend buildé en statique
- **Réplication**: SQLite → MinIO (S3-compatible) via Litestream ; avatars stockés dans le même bucket

## Développement

```bash
npm install

# Backend (port 3000)
npm run dev:backend

# Frontend (port 5173, proxy vers le backend sur :3000)
npm run dev:frontend
```

Au premier démarrage, si la table `users` est vide et que `ADMIN_EMAIL` est défini, un compte
administrateur est créé automatiquement pour cette adresse.

### Tests & build

```bash
npm test              # Vitest, backend + frontend
npm run lint          # Oxlint (type-aware), backend + frontend
npm run format        # Oxfmt
npm run build         # build frontend puis backend (copie le frontend dans backend/dist/public)
```

## Variables d'environnement

Voir [`backend/.env.example`](backend/.env.example) pour la liste complète. Points clés :

| Variable                                 | Rôle                                                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_EMAIL`                            | Email de l'administrateur initial (bootstrap si `users` est vide)                                                                                                                                  |
| `AUTH_BASE_URL`                          | URL publique du service (liens magiques, JWKS). Une origine sans chemin : elle donne le claim `iss` des access tokens                                                                              |
| `FRONTEND_URL`                           | URL du SPA (redirections `/login`, `/error`). CORS n'est ouvert qu'à cette origine, et seulement si elle diffère de `AUTH_BASE_URL`. Obligatoire en production, en `https`, comme `AUTH_BASE_URL`  |
| `RESEND_API_KEY`, `EMAIL_FROM`           | Envoi des liens magiques par email                                                                                                                                                                 |
| `PSEUDONYM_SECRET`                       | Obligatoire en production (≥ 32 octets, `openssl rand -hex 32`) : pseudonymes des emails dans les logs et des utilisateurs dans la télémétrie. Le changer re-clé tous les pseudonymes              |
| `POSTHOG_API_KEY`, `POSTHOG_HOST`        | Télémétrie anonyme vers PostHog (cloud EU par défaut). Sans clé, désactivée. Dans le projet PostHog, activer **Discard client IP data** : c'est ce réglage qui garantit qu'aucune IP n'est stockée |
| `FEATURES_OFREP_URL`, `FEATURES_API_KEY` | Feature flags home-features (voir [Feature flags](#feature-flags-home-features)). Absentes : flags désactivés, défaut du code                                                                      |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`      | Paire RSA pour signer les JWT (générée et persistée si absente)                                                                                                                                    |
| `DATABASE_PATH`                          | Chemin du fichier SQLite                                                                                                                                                                           |
| `MINIO_*`, `AVATARS_PREFIX`              | Réplication Litestream + stockage des avatars sur MinIO                                                                                                                                            |

## Supervision

- `GET /healthz` (interne, bloqué par Caddy) : `{ status, runtime }`, avec le dernier échantillon de l'event loop (lag p50/p99/max, utilisation, mémoire), pris toutes les minutes. Depuis le VPS : `curl -s 127.0.0.1:3000/healthz`. Le `HEALTHCHECK` Docker l'interroge toutes les 30 s ; c'est informatif (`docker ps`) : Docker ne redémarre pas un conteneur _unhealthy_.
- Le même échantillon part dans PostHog (`runtime_health`). Un warn est logué si le lag p99 dépasse 100 ms, et chaque requête SQLite de plus de 20 ms est loguée (sans ses paramètres).

## Feature flags (home-features)

Le service lit des flags booléens dans [home-features](https://features.sloboda.fr) via OFREP
(`@openfeature/server-sdk` + `@openfeature/ofrep-provider`), derrière le port
`FeatureFlags.isEnabled(key, codeDefault)` (`backend/src/domain/shared/feature-flags.ts`). L'adaptateur
(`backend/src/infrastructure/feature-flags/`) ne contient rien de propre à home-auth : les autres
services home-* le recopient tel quel.

- **Configuration** : `FEATURES_OFREP_URL` (base `https://features.sloboda.fr/api`, https obligatoire
  en production) et `FEATURES_API_KEY` (clé serveur liée à l'app et à l'environnement, format
  `hf_` + 64 hex). Absentes : tous les flags valent le défaut du code (warning unique) ; invalides :
  idem, avec une erreur au démarrage. Le démarrage n'attend jamais home-features.
- **Évaluation** : délai de 500 ms par requête ; résultat mémorisé 30 s par clé. Valeur définie pour
  l'environnement → cette valeur ; pas de valeur (`DISABLED`) ou flag inconnu (`FLAG_NOT_FOUND`) →
  défaut du code ; autre erreur (réseau, délai, 401, 429, 5xx) → dernière valeur connue, sinon défaut
  du code, mémorisé 30 s aussi, avec un warn au plus toutes les 5 min par flag et code d'erreur
  (le message du provider distingue une clé refusée, `unauthorized`, d'une panne). Un 429 suit ce même
  repli : l'adaptateur ne lit pas `Retry-After` et ne suspend pas les évaluations (la prochaine
  tentative a lieu à l'expiration de la mémo de 30 s). La dernière valeur connue est propre au processus :
  perdue au redémarrage.
- **Pin d'urgence** : `FEATURES_PIN_<CLE_EN_MAJ_SNAKE>=true|false` (ex.
  `FEATURES_PIN_AUTH_REFRESH_REUSE_REVOCATION=false`) l'emporte sur tout, y compris sans
  home-features. Toute autre valeur est ignorée (erreur loguée). Nécessite un redémarrage du conteneur.
  Tout caractère hors `[A-Za-z0-9]` devient `_` (`a-b` et `a.b` partagent donc le même pin).
- `OFREP_ENDPOINT`, `OFREP_HEADERS` et `OFREP_TIMEOUT_MS`, que le provider lirait sinon, sont ignorés
  et retirés de l'environnement au démarrage (warn).

## Base de données

Le schéma est géré par des migrations TypeORM, jouées au démarrage (`migrationsRun`) ; `synchronize` est désactivé.

```bash
npm run migration:generate --workspace=backend -- src/infrastructure/persistence/migrations/<Nom>
npm run migration:show --workspace=backend
```

Chaque migration est relue, puis ajoutée à `MIGRATIONS` (`backend/src/infrastructure/persistence/migrations/index.ts`).

Ces commandes tournent en local, sur le code compilé (`tsc`), avec `DATABASE_PATH` pointant sur la base visée : l'image de production ne contient ni les sources ni les outils de dev. Au démarrage, le service refuse de démarrer si, après les migrations, le schéma diffère des entités.

## API

### OAuth2 / OIDC

- `GET /.well-known/jwks.json` — clé publique RS256 pour vérifier les JWT
- `GET /authorize?client_id=&redirect_uri=[&state=][&code_challenge=&code_challenge_method=S256]` — démarre le flow Authorization Code (nécessite une session SSO)
  - `state` (optionnel, 512 caractères max) : renvoyé tel quel dans la redirection `?code=…&state=…`. Le client le vérifie au retour (CSRF).
  - PKCE (optionnel, **S256 uniquement**) : `code_challenge` = base64url(sha256(`code_verifier`)). `plain`, une méthode sans challenge ou un challenge sans méthode → 400.
- `POST /token` — échange `code` ou `refresh_token` contre un access token
  - `code_verifier` : obligatoire si `/authorize` a reçu un `code_challenge`, refusé sinon (401 `Invalid authorization code`, sans consommer le code).

Exemple de génération PKCE côté client (Node) :

```js
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto
  .createHash('sha256')
  .update(verifier)
  .digest('base64url');
```

- `GET /userinfo` — infos de l'utilisateur courant (Bearer access token)

### SSO maison

- `POST /auth/request-link` — envoie un lien magique par email
- `POST /auth/callback` — échange le token du lien magique contre une session (cookie `auth_session`)
- `POST /auth/logout` — révoque les refresh tokens et notifie les clients (voir ci-dessous)

### Profil

- `GET /profile` — infos de l'utilisateur courant + `isAdmin`
- `PATCH /profile` — met à jour le nom
- `POST /profile/avatar` — upload d'avatar (multipart, jpg/png/webp, 2 Mo max)
- `GET /avatars/:userId` — sert l'avatar de l'utilisateur (ou redirige vers un avatar généré)

### Administration (réservé aux admins)

- `GET/POST /admin/users`, `PATCH /admin/users/:id` — gestion des utilisateurs
- `GET/POST/PATCH/DELETE /admin/clients` — gestion des clients OAuth2 (secret affiché une seule fois à la création)
- `GET/POST /admin/clients/:id/access`, `DELETE /admin/clients/:id/access/:userId` — liste blanche d'accès par client

## Contrat des access tokens

JWT RS256 signé par la clé publiée sur `/.well-known/jwks.json`, valable 15 min :

| Claim           | Valeur                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- |
| `iss`           | `new URL(AUTH_BASE_URL).origin` (ex. `https://auth.sloboda.fr`) ; `AUTH_BASE_URL` sans chemin |
| `aud`           | `client_id` du client OAuth2 (une chaîne)                                                     |
| `sub`           | id de l'utilisateur                                                                           |
| `email`, `name` | profil au moment de l'émission                                                                |
| `isAdmin`       | instantané au moment de l'émission                                                            |
| `iat`, `exp`    | émission, expiration (+ 15 min)                                                               |

Vérification attendue côté application :

```ts
await jwtVerify(token, jwks, {
  issuer: new URL(AUTH_SERVICE_URL).origin,
  audience: AUTH_CLIENT_ID,
  algorithms: ['RS256'],
});
```

- **`iss`** : émis depuis cette version. home-auth (`/userinfo`, `/me`) rejette un `iss` différent ;
  un jeton sans `iss` (émis avant) reste accepté jusqu'à ce que l'`iss` devienne obligatoire
  (au moins 15 min après le déploiement de l'émission).
- **`isAdmin` est un instantané** valable au plus 15 min : un retrait des droits admin n'est vu
  qu'au renouvellement du jeton. Pour une action sensible, l'application revérifie via `GET /userinfo`.

## Contrat du webhook de déconnexion

À la déconnexion (`POST /auth/logout`), tous les refresh tokens de l'utilisateur sont révoqués. Pour
chaque client OAuth2 ayant un `logoutWebhookUrl` configuré, le service appelle en best-effort (timeout
2s, sans retry) :

```http
POST {logoutWebhookUrl}
Content-Type: application/json

{ "userId": "<id utilisateur>" }
```

Les applications clientes doivent exposer ce endpoint et invalider leurs propres sessions/cookies pour
cet utilisateur. Un échec ou un timeout du webhook n'empêche pas la déconnexion côté auth-service.

## Docker

```bash
docker build -t auth-service .
docker run -p 3000:3000 -v ./data:/app/backend/data --env-file backend/.env auth-service
```

Si `MINIO_BUCKET` est défini, le conteneur restaure la base SQLite depuis MinIO au démarrage (si elle
n'existe pas localement) puis réplique en continu via Litestream.
