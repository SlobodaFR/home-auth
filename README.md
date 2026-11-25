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

| Variable                                    | Rôle                                                                                                                                                                                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_EMAIL`                               | Email de l'administrateur initial (bootstrap si `users` est vide)                                                                                                                                  |
| `AUTH_BASE_URL`                             | URL publique du service (liens magiques, JWKS). Une origine sans chemin : elle donne le claim `iss` des access tokens                                                                              |
| `FRONTEND_URL`                              | URL du SPA (redirections `/login`, `/error`). CORS n'est ouvert qu'à cette origine, et seulement si elle diffère de `AUTH_BASE_URL`. Obligatoire en production, en `https`, comme `AUTH_BASE_URL`  |
| `RESEND_API_KEY`, `EMAIL_FROM`              | Envoi des liens magiques par email                                                                                                                                                                 |
| `PSEUDONYM_SECRET`                          | Obligatoire en production (≥ 32 octets, `openssl rand -hex 32`) : pseudonymes des emails dans les logs et des utilisateurs dans la télémétrie. Le changer re-clé tous les pseudonymes              |
| `POSTHOG_API_KEY`, `POSTHOG_HOST`           | Télémétrie anonyme vers PostHog (cloud EU par défaut). Sans clé, désactivée. Dans le projet PostHog, activer **Discard client IP data** : c'est ce réglage qui garantit qu'aucune IP n'est stockée |
| `FEATURES_OFREP_URL`, `FEATURES_API_KEY`    | Feature flags home-features (voir [Feature flags](#feature-flags-home-features)). Absentes : flags désactivés, défaut du code                                                                      |
| `JWT_PRIVATE_KEY_B64`, `JWT_PUBLIC_KEY_B64` | Paire RSA (PEM encodé en base64, une ligne) pour signer les JWT. Absentes : paire du volume, générée et persistée si besoin. Voir [Clés de signature JWT](#clés-de-signature-jwt)                  |
| `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`         | Idem en PEM brut ou avec des `\n` littéraux (ne pas combiner avec les `*_B64`)                                                                                                                     |
| `DATABASE_PATH`                             | Chemin du fichier SQLite                                                                                                                                                                           |
| `MINIO_*`, `AVATARS_PREFIX`                 | Réplication Litestream + stockage des avatars sur MinIO                                                                                                                                            |

## Clés de signature JWT

La paire RSA (RS256) qui signe les access tokens et le cookie de session SSO, et dont la clé publique
sort sur `/.well-known/jwks.json`, a deux sources possibles :

- **Environnement** : `JWT_PRIVATE_KEY_B64` + `JWT_PUBLIC_KEY_B64` (PEM encodé en base64, une seule
  ligne, car un `.env` docker compose n'accepte pas de retour à la ligne), ou `JWT_PRIVATE_KEY` +
  `JWT_PUBLIC_KEY` (PEM brut ou avec `\n` littéraux). Les deux clés ensemble ou aucune.
- **Volume** : `jwt-private.pem` / `jwt-public.pem` à côté de la base SQLite, générés une fois si
  absents.

En production, le déploiement (`deploy-vps.yml`) charge `AUTH_JWT_PRIVATE_KEY` et `AUTH_JWT_PUBLIC_KEY`
depuis 1Password (`op://TECH/thomassloboda_home_secrets/…`, PEM tels qu'ils sont dans le volume), les
encode en base64 et les écrit dans le `.env` distant. Les valeurs sont masquées dans les logs ; seule
l'empreinte de la clé publique est affichée.

**Contrôle avant déploiement** (`deploy/scripts/check-live-jwks.mjs`, sur le runner, avant tout accès
au VPS) : le job récupère `$AUTH_BASE_URL/.well-known/jwks.json`, reconstruit le DER SPKI de la clé
live à partir de `n`/`e`, et compare son SHA-256 à celui de la clé publique 1Password. Différent, ou
JWKS injoignable : le job échoue (message avec les deux empreintes uniquement), car une paire valide
mais fausse ferait sinon refuser le démarrage du conteneur. Premier déploiement ou rotation volontaire :
définir la variable de dépôt `JWT_KEY_ROTATION=1` (Settings > Variables > Actions), puis la retirer
après le déploiement.

**Où vit la clé privée** : en plus de 1Password et du volume, elle est dans le `.env` distant
(`/opt/auth-service/deploy/.env`, créé en `0600` via `umask 077`, remplacé atomiquement) et dans
l'environnement du conteneur, donc visible par quiconque a accès au démon Docker (`docker inspect`,
`/proc/<pid>/environ`). Même périmètre de confiance que `PSEUDONYM_SECRET` et les clés MinIO déjà là.

### Démarrage (fail closed)

| Environnement | Volume               | Résultat                                                                                     |
| ------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| absent        | fichiers             | clés du volume (comportement historique), après contrôle que c'est bien une paire            |
| absent        | rien                 | paire générée et écrite dans le volume (comportement historique)                             |
| présent       | rien                 | clés de l'environnement, **rien n'est écrit** dans le volume                                 |
| présent       | fichiers             | empreintes identiques : démarre sur les clés du volume. **Différentes : refuse de démarrer** |
| présent       | un seul des fichiers | refuse de démarrer                                                                           |

Dans tous les cas la clé privée et la clé publique doivent former une paire (test signature +
vérification) et être des clés RSA, sinon le service refuse de démarrer. L'empreinte est le SHA-256 du
DER SPKI de la clé publique ; les erreurs ne citent que des empreintes, jamais de matériel de clé. Les
fichiers du volume ne sont jamais modifiés ni supprimés par ce chargement.

Au démarrage, le log indique la source, le `kid` (celui du JWKS : `sha256` du PEM public, 16 premiers
caractères) et l'empreinte :

```txt
JWT signing key ready: source=env+files kid=0123456789abcdef fingerprint=sha256:…
```

### Démarrage refusé : reprise

Le conteneur redémarre en boucle avec `JWT key mismatch, refusing to start` (ou une erreur de PEM) :
`docker compose logs auth-service` sur le VPS donne les empreintes en cause.

1. Cas normal : corriger `AUTH_JWT_PRIVATE_KEY` / `AUTH_JWT_PUBLIC_KEY` dans 1Password (l'empreinte
   attendue est celle de l'ancien `kid`/`fingerprint`), puis relancer le workflow de déploiement.
   Si le conteneur boucle, Caddy répond 502 sur le JWKS : le contrôle pré-déploiement échouera
   (« Cannot read the live JWKS »). Après avoir vérifié à la main que l'empreinte 1Password est bien
   celle de l'ancienne clé, relancer avec la variable `JWT_KEY_ROTATION=1` (qui désactive ce contrôle ;
   la vérification d'empreinte du démarrage reste le garde-fou), puis la retirer. Sinon, passer par
   le point 2.
2. Urgence, sans attendre le CI : sur le VPS, supprimer les deux lignes `JWT_PRIVATE_KEY_B64=` et
   `JWT_PUBLIC_KEY_B64=` de `/opt/auth-service/deploy/.env`, puis
   `cd /opt/auth-service/deploy && docker compose up -d`. Le service retombe sur les fichiers du
   volume (clé historique, sessions préservées). Le prochain déploiement réécrit ces lignes : corriger
   1Password avant.

Avant de fusionner un changement qui touche aux clés, vérifier que `kid` et `fingerprint` sont
identiques avant et après le déploiement.

### Runbook : rotation volontaire (non implémentée)

Une rotation invalide toutes les sessions et tous les tokens émis : à ne faire que volontairement. Le
service ne sait pas servir deux clés à la fois (le JWKS n'en expose qu'une), donc pas de rotation
sans coupure. Procédure prévue :

1. Générer une nouvelle paire hors du VPS : `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out new-private.pem`
   puis `openssl pkey -in new-private.pem -pubout -out new-public.pem`.
2. Mettre le contenu des deux PEM dans `AUTH_JWT_PRIVATE_KEY` / `AUTH_JWT_PUBLIC_KEY` (1Password).
   Garder l'ancienne paire dans un champ d'archive.
3. Sauvegarder le volume (le déploiement le fait : `pre-deploy-backup.sh`), puis sur le VPS déplacer
   (jamais supprimer) `jwt-private.pem` et `jwt-public.pem` du volume `auth-data` vers un dossier de
   sauvegarde : sans ça, la nouvelle paire ne correspond plus au volume et le service refuse de
   démarrer, c'est voulu.
4. Définir la variable de dépôt `JWT_KEY_ROTATION=1` (sinon le contrôle pré-déploiement refuse la
   nouvelle clé), déployer, puis retirer la variable. Vérifier dans le log de démarrage `source=env` et
   le nouvel `fingerprint`.
5. Prévenir les clients : ils relisent le JWKS, les utilisateurs se reconnectent.
6. Retour arrière : remettre l'ancienne paire dans 1Password et les anciens fichiers dans le volume.

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

| Flag                            | Défaut du code | Effet quand `true`                                                                                                 |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `auth-refresh-reuse-revocation` | `false`        | Réutilisation d'un refresh token après la fenêtre de grâce, ou d'un code d'autorisation : la famille est supprimée |
| `auth-rp-initiated-logout`      | `false`        | `GET /logout` et `POST /auth/rp-logout` actifs (déconnexion initiée par un service, PC10) ; sinon `404`            |

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
  - **Rotation des refresh tokens** : chaque `refresh_token` échangé est marqué tourné (atomiquement :
    une seule requête concurrente gagne) et remplacé par un nouveau, de la même famille (une famille
    par connexion, nommée d'après le code d'autorisation). Un jeton déjà tourné présenté à nouveau :
    - dans les **30 s** qui suivent sa rotation (course entre requêtes concurrentes, réponse perdue) :
      nouvelle paire dans la même famille, **une seule fois** par jeton tourné ;
    - une deuxième présentation dans les 30 s, au-delà des 30 s, ou un jeton tourné puis expiré :
      401 `Invalid refresh token` (même flag inactif) ; si le flag `auth-refresh-reuse-revocation`
      est actif, toute la famille est supprimée (l'application doit renvoyer vers `/authorize`), y
      compris un jeton émis au même moment par une requête concurrente.
    - Les clients doivent dédupliquer leurs rafraîchissements concurrents (une requête en vol par
      refresh token) et toujours conserver le dernier jeton reçu.
  - **Code réutilisé** : 401 `Authorization code already used` ; si le flag est actif, les refresh
    tokens issus de ce code sont supprimés, y compris celui du premier échange s'il est encore en
    cours (il reçoit alors lui aussi ce 401 : la réutilisation est marquée sur le code avant la
    suppression). Un code rejoué par un autre client, vers une autre
    `redirect_uri` ou sans le bon `code_verifier` reste un simple 401 `Invalid authorization code`
    (non compté dans `code_reused`).
  - Télémétrie : `refresh_reused{client_id, kind: rotated_in_grace | concurrent_lost_race | rotated_after_grace | grace_exhausted, revoked}`
    (`grace_exhausted` : deuxième présentation dans les 30 s), `code_reused{client_id}`. Les jetons
    tournés (et leur marqueur de grâce) sont purgés après 24 h, les codes (et leur marqueur de
    réutilisation) 24 h après leur expiration.

Exemple de génération PKCE côté client (Node) :

```js
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto
  .createHash('sha256')
  .update(verifier)
  .digest('base64url');
```

- `GET /userinfo` — infos de l'utilisateur courant (Bearer access token)
  - `GET /userinfo` et `GET /me` : 401 si l'audience (`aud`) du jeton n'est pas une seule chaîne désignant un client existant (client supprimé, jeton multi-audience).

### SSO maison

- `POST /auth/request-link` — envoie un lien magique par email
- `POST /auth/callback` — échange le token du lien magique contre une session (cookie `__Host-auth_session` en production, `auth_session` en développement : le préfixe impose `Secure`, `Path=/` et l'absence de `Domain`)
- `GET /logout` et `POST /auth/rp-logout` — déconnexion initiée par un service, ce navigateur uniquement, derrière le flag `auth-rp-initiated-logout` (voir « Contrat de déconnexion initiée par un service »)
- `POST /auth/logout` — invalide **toutes** les sessions SSO de l'utilisateur (tous ses appareils), révoque ses refresh tokens et notifie les clients (voir ci-dessous)

### Profil

- `GET /profile` — infos de l'utilisateur courant + `isAdmin`
- `PATCH /profile` — met à jour le nom
- `POST /profile/avatar` — upload d'avatar (multipart, jpg/png/webp, 2 Mo max)
- `GET /avatars/:userId` — sert l'avatar de l'utilisateur (ou redirige vers un avatar généré)

### Administration (réservé aux admins)

- `GET/POST /admin/users`, `PATCH /admin/users/:id` — gestion des utilisateurs
- `POST /admin/users/:id/revoke-sessions` — déconnecte l'utilisateur de tous ses appareils (même effet que son propre logout : sessions SSO invalidées, refresh tokens révoqués, clients notifiés). `204`, ou `404` si l'utilisateur est inconnu. Les access tokens déjà émis restent valables jusqu'à leur expiration (15 min).
- `GET/POST/PATCH/DELETE /admin/clients` — gestion des clients OAuth2 (secret affiché une seule fois à la création)
- `POST /admin/clients/:id/webhook-secret` — génère ou régénère le secret de signature du webhook (`{ "webhookSecret": "<64 hex>" }`, affiché une seule fois, jamais relu : `GET /admin/clients` ne renvoie que `hasWebhookSecret`). L'ancien secret reste valide 24 h (une seconde régénération dans cette fenêtre écarte aussitôt le plus ancien)
- `GET/POST /admin/clients/:id/access`, `DELETE /admin/clients/:id/access/:userId` — liste blanche d'accès par client

## Contrat des access tokens

JWT RS256 signé par la clé publiée sur `/.well-known/jwks.json`, valable 15 min :

| Claim           | Valeur                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------- |
| `iss`           | `new URL(AUTH_BASE_URL).origin` (ex. `https://auth.sloboda.fr`) ; `AUTH_BASE_URL` sans chemin |
| `aud`           | `client_id` du client OAuth2 (une seule chaîne ; doit désigner un client existant)            |
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

- **`iss`** est obligatoire : home-auth (`/userinfo`, `/me`) rejette un jeton sans `iss` ou avec un
  autre `iss`.
- **`isAdmin` est un instantané** valable au plus 15 min : un retrait des droits admin n'est vu
  qu'au renouvellement du jeton. Pour une action sensible, l'application revérifie via `GET /userinfo`.

## Contrat du webhook de déconnexion

À la déconnexion (`POST /auth/logout`), tous les refresh tokens de l'utilisateur sont révoqués. Pour
chaque client OAuth2 ayant un `logoutWebhookUrl` configuré, le service appelle en best-effort :

```http
POST {logoutWebhookUrl}
Content-Type: application/json
X-Auth-Webhook-Id: <uuid v4>
X-Auth-Webhook-Timestamp: <secondes unix>
X-Auth-Webhook-Signature: v1=<hex>[,v1=<hex>]

{"userId":"<id utilisateur>"}
```

Le corps est exactement `JSON.stringify({ userId })`. Les applications clientes doivent exposer ce
endpoint et invalider leurs propres sessions/cookies pour cet utilisateur. Un échec ou un timeout du
webhook n'empêche pas la déconnexion côté auth-service.

### Signature (contrat PC7)

`hex = HMAC-SHA256(secret, id + "." + timestamp + "." + rawBody)` : la clé est la chaîne du secret
telle que affichée (64 caractères hexadécimaux, en UTF-8, **pas** ses octets décodés) et `rawBody` les
octets reçus, non re-sérialisés. Tant qu'un client n'a pas de secret, `X-Auth-Webhook-Signature` est
absent ; après une régénération, pendant 24 h, l'en-tête porte deux entrées `v1=` (nouveau secret
d'abord, ancien ensuite).

Vérification côté application :

1. `|now - timestamp| ≤ 120 s` ;
2. `id` non vu dans les 10 dernières minutes (Set en mémoire avec TTL) ;
3. pour chaque entrée `v1=` : décoder le hex en 32 octets (format invalide : 401), `timingSafeEqual`
   avec le HMAC recalculé ; accepté si UNE entrée correspond ;
4. `rawBody` : `rawBody: true` à la création Nest, ou `verify` du parser JSON quand `bodyParser: false` ;
   repli documenté : `JSON.stringify({ userId: body.userId })`.

**Vecteurs de test fixes** (copiés dans `backend/src/domain/shared/webhook-signer.spec.ts` ; à recopier
tels quels dans les tests des apps) :

|     | secret | id                                     | timestamp    | corps                 | HMAC (hex)                                                         |
| --- | ------ | -------------------------------------- | ------------ | --------------------- | ------------------------------------------------------------------ |
| 1   | `S1`   | `3b241101-e2bb-4255-8caf-4136c566a962` | `1700000000` | `{"userId":"u1"}`     | `41294c53497c1d18871786b2d5c3ec091e6b357638e7104d826de50af8813242` |
| 2   | `S2`   | `3b241101-e2bb-4255-8caf-4136c566a962` | `1700000000` | `{"userId":"u1"}`     | `89de6c4652b33d864427b3091771ed8b9266a99b3bf915b126eb4655a2dce09f` |
| 3   | `S1`   | `9b2f0f6e-8d3a-4f6b-9c1e-2a7d5e4c1b30` | `1700000123` | `{"userId":"4b8f-é"}` | `d9a2c8cec34058ebb100f8b454ba46b1214cf777000d9aab00dda91205d5a3ac` |

- `S1` = `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f`
- `S2` = `ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100`
- Vecteur 4 (recouvrement) : secrets `[S1, S2]`, id/timestamp/corps du vecteur 1 →
  `X-Auth-Webhook-Signature: v1=41294c53497c1d18871786b2d5c3ec091e6b357638e7104d826de50af8813242,v1=89de6c4652b33d864427b3091771ed8b9266a99b3bf915b126eb4655a2dce09f`
- Recoupement : `printf '%s' '3b241101-e2bb-4255-8caf-4136c566a962.1700000000.{"userId":"u1"}' | openssl dgst -sha256 -hmac <S1>`

### Secret (contrat PC8)

Le secret de chaque client (32 octets aléatoires en hexadécimal) est stocké **en clair** dans
`clients.webhook_secret` (exception documentée : il sert de clé HMAC, un hachage ne suffirait pas),
avec `webhook_secret_previous` et `webhook_secret_previous_expires_at` pour le recouvrement de 24 h.
Il n'est créé que par l'action explicite « Régénérer » de la page admin des clients
(`POST /admin/clients/:id/webhook-secret`), affiché une seule fois, puis à reporter dans le
gestionnaire de secrets de l'application. `GET /admin/clients` n'expose que `hasWebhookSecret` et
masque la query string de `logoutWebhookUrl` (`?***`) ; renvoyer cette valeur masquée à
`PATCH /admin/clients/:id` conserve l'URL enregistrée.

### Livraison

L'appel part de façon asynchrone (jamais dans le chemin de la déconnexion), avec un délai
TOTAL de 2 s, sans retry ni redirection suivie (seul un 2xx est un succès). Les cibles non publiques
sont refusées à la connexion : IP littérale ou adresses résolues (toutes contrôlées, puis connexion aux
adresses validées) dans `0.0.0.0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`,
`192.168/16`, `198.18/15`, `224/4`, `240/4`, `::`, `::1`, `fc00::/7`, `fe80::/10`, `::ffff:0:0/96`,
`64:ff9b::/96`, `2002::/16`.

L'URL du webhook doit être en `https` et ne pas contenir d'identifiants (`user:pass@`) ; la création
ou la modification d'un client avec une autre URL est refusée (400). Un client existant en `http`
reste modifiable tant que son URL n'est pas changée. La query string reste tolérée pendant la
transition (retrait prévu une fois les apps passées à la signature).

## Contrat de déconnexion initiée par un service (PC10)

Derrière le flag `auth-rp-initiated-logout` (défaut du code : `false`). Flag inactif : `GET /logout` et
`POST /auth/rp-logout` répondent `404` (404 JSON de Nest), évalué à chaque requête. La page SPA
`/logout/confirm` existe quel que soit le flag.

Le bouton « Se déconnecter » d'un service ne vidait que ses propres cookies : la session SSO de
home-auth survivait et la connexion suivante était silencieuse. Ce flow (style OIDC RP-initiated
logout) efface la session SSO **de ce navigateur uniquement**. « Se déconnecter partout »
(`POST /auth/logout`) reste inchangé.

```http
GET https://auth.sloboda.fr/logout
      ?client_id=<id du client>
      &post_logout_redirect_uri=<url de retour>
      [&state=<opaque, 512 caractères max>]
      [&access_token_hint=<access token du client, encore valide>]
```

Méthode `GET` uniquement (`HEAD` ne déconnecte jamais). Toutes les réponses de `/logout` et de
`POST /auth/rp-logout` portent `Cache-Control: no-store`, y compris les `400`/`403`/`404` produits avant
le handler (middleware). Le client y envoie le navigateur par une
navigation de premier niveau, jamais `fetch` (cookie SSO `SameSite=Lax`).

**Validation** (avant tout effet de bord ; au moindre échec : redirection vers `/error` de home-auth
avec `reason` = `unknown_client` (client inconnu) ou `invalid_request` (autre paramètre invalide),
**jamais** vers `post_logout_redirect_uri`, et jamais avec `access_token_hint`) :

- `client_id` : `^[a-z0-9][a-z0-9-]*$`, client existant ;
- `post_logout_redirect_uri` : 2048 caractères max ; analysée par le parseur WHATWG (`new URL`), de
  schéma `http` ou `https`, sans identifiants (`user:pass@`), sans fragment, et dont `origin` (schéma +
  hôte + port, après normalisation) est **égale** à l'`origin` d'au moins une `redirectUri` enregistrée
  du client. Une origine `null` (schéma personnalisé) ne correspond jamais, ni côté candidat ni côté
  enregistré. La `Location` est reconstruite depuis `url.href`, jamais depuis la chaîne brute ;
- `state` répété (`state=a&state=b`) : `invalid_request`.
- `state` : 512 caractères max, ajouté par `searchParams.set` (il **remplace** un `state` déjà présent
  dans l'URI).

**Tout chemin et toute query d'une origine enregistrée sont considérés de confiance.** Une origine qui
héberge sa propre redirection ouverte en ferait une redirection ouverte chaînée depuis
`auth.sloboda.fr` : ne pas enregistrer de `redirectUris` sur une origine partagée. Les `redirectUris`
ne sont pas restreintes en schéma : un client de production qui garde `http://localhost:5173/…`
enregistré rend `http://localhost:5173/*` valide ici aussi.

**Comportement** :

1. Pas de session SSO valide dans ce navigateur (absente, expirée, déjà révoquée) : cookie effacé,
   `302` vers `post_logout_redirect_uri` (idempotent). Rien d'autre.
2. Session valide **et** `access_token_hint` valide **et** requête de navigation réelle
   (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`, ni `Sec-Purpose` ni `Purpose` indiquant
   un prefetch/prerender) : cookie effacé, `302` vers `post_logout_redirect_uri`. Hint valide =
   `verifyAccessToken(hint, client_id)` (signature, `iss`, une seule `aud` = `client_id`, non expiré)
   et `sub` = utilisateur de la session.
3. Tous les autres cas avec session (pas de hint, hint invalide ou d'un autre utilisateur, en-têtes
   `Sec-Fetch-*` absents ou prefetch) : `302` vers `/logout/confirm?client_id=…&post_logout_redirect_uri=…&state=…`
   (sans hint, `Cache-Control: no-store`). Ce n'est jamais une erreur. Cela empêche un site tiers de
   déconnecter l'utilisateur par simple lien ou prerender (logout CSRF).

**Écran de confirmation** (`/logout/confirm`, route SPA publique) : n'affiche que le `client_id`
conforme au motif ci-dessus, aucun autre texte tiré de l'URL. Deux actions : « Se déconnecter » et
« Se déconnecter partout » (`POST /auth/logout`, inchangé), plus « Annuler » (`history.back()`).

`POST /auth/rp-logout` — `SameOriginGuard` seul (JSON, cookie) ; **pas** de `SessionAuthGuard`.
Corps `{ client_id, post_logout_redirect_uri, state? }`, mêmes validations (400 sinon, rien n'est
fait). Résout lui-même la session ; avec ou sans session valide : cookie effacé, `200 { redirect_to }`.
`redirect_to` est construit par le serveur (URI validée + `state` encodé) ; la SPA y navigue par
`location.assign` et ne construit jamais l'URL depuis sa propre query string.

**Effets d'une déconnexion** :

- le cookie SSO de ce navigateur est effacé ; `sessionVersion` n'est **pas** incrémenté : les sessions
  SSO des autres appareils restent valides ;
- **rien n'est révoqué côté serveur** : ni refresh tokens (aucun lien avec une session de navigateur :
  les supprimer déconnecterait les autres appareils du service), ni webhook (il signifie « déconnecté
  partout »). C'est au service de jeter son propre refresh token ;
- limite : le JWT de session est sans état ; un cookie copié avant la déconnexion reste valide
  jusqu'à son expiration (30 jours) ou « Se déconnecter partout ». Ce n'est donc pas une
  déconnexion de sécurité sur un appareil partagé : utiliser « Se déconnecter partout ».

Télémétrie : `rp_logout{outcome: logged_out | no_session | confirm_required | unknown_client |
invalid_request, client_id?}` (`client_id` seulement une fois le client résolu ; jamais `state`, URI
ni hint).

**Ce que doit faire un service client** :

1. Garder en mémoire l'access token courant **de ce client** (`aud` = son `client_id`) s'il est encore
   valide (< 15 min ; un token obtenu par refresh convient), puis jeter localement cookies, session et
   refresh token.
2. Rediriger le navigateur (navigation de premier niveau) vers `GET /logout` avec `client_id`,
   `post_logout_redirect_uri` (URL d'une origine de ses `redirectUris`), un `state` aléatoire qu'il
   vérifie au retour, et `access_token_hint` quand il en a un valide. Le hint est un bearer token en
   query string : ne l'envoyer qu'à home-auth (les requêtes ne sont pas journalisées avec leur query).
3. Accepter les deux atterrissages (redirection immédiate ou écran de confirmation préalable) sans
   supposer de délai. À l'arrivée sur `post_logout_redirect_uri`, afficher l'état déconnecté (ne pas
   relancer `/authorize` automatiquement). Un refresh token qui échoue ne doit jamais être le signal
   d'une déconnexion locale due à ce flow.

## Docker

```bash
docker build -t auth-service .
docker run -p 3000:3000 -v ./data:/app/backend/data --env-file backend/.env auth-service
```

Si `MINIO_BUCKET` est défini, le conteneur restaure la base SQLite depuis MinIO au démarrage (si elle
n'existe pas localement) puis réplique en continu via Litestream.
