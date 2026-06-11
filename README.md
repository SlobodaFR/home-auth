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
npm test              # backend (Jest) + frontend (Vitest)
npm run lint          # backend (ESLint) + frontend
npm run build         # build frontend puis backend (copie le frontend dans backend/dist/public)
```

## Variables d'environnement

Voir [`backend/.env.example`](backend/.env.example) pour la liste complète. Points clés :

| Variable | Rôle |
| --- | --- |
| `ADMIN_EMAIL` | Email de l'administrateur initial (bootstrap si `users` est vide) |
| `AUTH_BASE_URL` | URL publique du service (liens magiques, audience JWT, JWKS) |
| `FRONTEND_URL` | URL du frontend (CORS) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Envoi des liens magiques par email |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | Paire RSA pour signer les JWT (générée et persistée si absente) |
| `DATABASE_PATH` | Chemin du fichier SQLite |
| `MINIO_*`, `AVATARS_PREFIX` | Réplication Litestream + stockage des avatars sur MinIO |

## API

### OAuth2 / OIDC

- `GET /.well-known/jwks.json` — clé publique RS256 pour vérifier les JWT
- `GET /authorize?client_id=&redirect_uri=&state=` — démarre le flow Authorization Code (nécessite une session SSO)
- `POST /token` — échange `code` ou `refresh_token` contre un access token
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
