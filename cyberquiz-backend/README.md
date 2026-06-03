# CyberQuiz — Backend API (PostgreSQL)

Node.js + Express + **PostgreSQL** backend for CyberQuiz: timed MCQ quizzes,
Google/Facebook OAuth, user-submitted quizzes, creator attribution, profiles
and a global leaderboard.

This edition is **stateless** — all data (including profile pictures, stored as
small base64 strings) lives in Postgres, so the server keeps no local files and
can run on any host, including free tiers with ephemeral disks.

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | PostgreSQL via `pg` (node-postgres) |
| Auth | Passport (Google + Facebook) → JWT |
| Hardening | Helmet, CORS allow-list, rate limiting |

## Quick start (local)

You need a Postgres database. Easiest is a free hosted one (Neon/Supabase) —
grab its connection string — or run Postgres locally.

```bash
npm install
cp .env.example .env          # set DATABASE_URL + secrets
npm run seed                  # creates tables + loads the cryptography quizzes
npm run dev                   # http://localhost:4000
```

`GET /health` should return `{"ok":true,...}`. Tables auto-create and the
built-in quizzes auto-seed on first boot, so `npm run seed` is optional but handy.

### No OAuth keys yet?

Leave `ALLOW_DEV_LOGIN=true` and use `POST /auth/dev-login` (name + email) to
test the full flow without Google/Facebook. Turn it off in production.

## Configuration

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (required) |
| `DB_SSL` | `true` for hosted Postgres (defaults to true in production) |
| `JWT_SECRET`, `SESSION_SECRET` | signing secrets |
| `FRONTEND_URL` | allowed CORS origin + OAuth redirect target |
| `BACKEND_URL` | this server's public URL (OAuth callbacks) |
| `GOOGLE_CLIENT_ID/SECRET`, `FACEBOOK_APP_ID/SECRET` | OAuth (optional) |
| `ALLOW_DEV_LOGIN` | enable dev login (never in prod) |

## API (unchanged from the SQLite edition, except avatars)

Auth: `GET /auth/google|facebook`, `POST /auth/complete-signup`, `POST /auth/dev-login`.
Me: `GET /api/me`, `GET /api/me/activity`, `PATCH /api/me/display-name`
(3-week cooldown), `PATCH /api/me/avatar-color`, **`PATCH /api/me/avatar`**
(`{ dataUrl }` — a small base64 image, stored in the DB).
Quizzes: `GET /api/quizzes`, `GET /api/quizzes/:id` (no answers),
`POST /api/quizzes`, `POST /api/quizzes/:id/submit` (server-scored).
Leaderboard: `GET /api/leaderboard`.

## Security

OAuth-only accounts (no passwords), server-side scoring (correct answers never
leave the server), reserved + unique usernames enforced in code and via a DB
unique index, DB-enforced 3-week name cooldown, scoped JWTs, Helmet, CORS
allow-list, rate limiting, parameterised SQL throughout, and validated/​size-
capped avatar data URLs.

## Layout

```
src/
  server.js            bootstrap: init schema, auto-seed, listen
  config.js            env config
  db.js / schema.sql   pg Pool + schema
  repo.js              all DB access (async, parameterised)
  passport.js          Google + Facebook strategies
  jwt.js               token sign/verify
  middleware/          auth (async guards), security
  lib/                 username rules, server-side scoring
  routes/              auth / me / quizzes / leaderboard
  seed.js / seed-data  built-in cryptography quizzes
```
