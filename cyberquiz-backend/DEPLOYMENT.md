# Deploying CyberQuiz (PostgreSQL edition)

Three free pieces:

| Piece | Host |
|---|---|
| Database | **Neon** (or Supabase, or Render Postgres) — free, persistent |
| Backend `cyberquiz-backend` | **Render** web service (free) |
| Frontend `cyberquiz-frontend` | **Vercel** (free) |

Because all data lives in Postgres and avatars are stored in the DB, the backend
is **stateless** — the free host's ephemeral disk no longer matters. Data
survives restarts and redeploys.

---

## Step 1 — Create a Postgres database (Neon)

1. [neon.tech](https://neon.tech) → sign up → **Create project**.
2. Copy the **connection string** (looks like
   `postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require`).
3. That's it — Neon's free tier is persistent and always-on for this size.

> Supabase and Render Postgres work the same way; just grab their connection
> string. (Note: a *free* Render Postgres expires 30 days after creation — Neon
> doesn't, so it's the easier pick.)

---

## Step 2 — Deploy the backend (Render)

1. Push the project to GitHub, then on [Render](https://dashboard.render.com):
   **New → Web Service** → pick the repo.
2. **Root Directory:** `cyberquiz-backend`
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. **Environment variables:**
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = your Neon connection string
   - `DB_SSL` = `true`
   - `JWT_SECRET`, `SESSION_SECRET` = long random strings
     (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `ALLOW_DEV_LOGIN` = `true` *(temporary, until OAuth is set up)*
   - `BACKEND_URL` = your Render URL once known
   - `FRONTEND_URL` = set after Step 3
6. Create it. The app creates its tables and seeds the quizzes on first boot.
   Check `…/health`.

> Free Render services still **sleep after 15 min idle** (~1 min cold start),
> but your data is safe in Neon — only the server sleeps, not the database.

---

## Step 3 — Deploy the frontend (Vercel)

1. [vercel.com/new](https://vercel.com/new) → import the repo.
2. **Root Directory:** `cyberquiz-frontend` (Vite auto-detected).
3. **Env var:** `VITE_API_URL` = your Render backend URL.
4. Deploy → you get e.g. `https://cyberquiz.vercel.app`.

---

## Step 4 — Connect them

On Render, set `FRONTEND_URL` to the exact Vercel origin (no trailing slash),
then redeploy. This enables CORS and sets where OAuth lands. Open the Vercel
URL and dev-login — quizzes load from the live API, scores and accounts persist
in Neon.

---

## Step 5 — Real Google / Facebook login (optional)

**Google** → [console.cloud.google.com](https://console.cloud.google.com) →
Credentials → OAuth client (Web). Authorised redirect URI:
`https://<your-backend>.onrender.com/auth/google/callback`. Add
`GOOGLE_CLIENT_ID/SECRET` on Render. (Facebook: same with `/auth/facebook/callback`.)
Then set `ALLOW_DEV_LOGIN=false` and redeploy — the frontend's buttons enable
themselves automatically.

---

## Troubleshooting

- **`ECONNREFUSED` / DB errors on boot:** `DATABASE_URL` is wrong or `DB_SSL`
  isn't `true` for a hosted DB.
- **"can't reach the backend":** free backend is asleep — hit `…/health` once.
- **CORS errors:** `FRONTEND_URL` must exactly match the site origin you're on.
- **Buttons greyed out:** OAuth keys not set — use dev-login or add the keys.
