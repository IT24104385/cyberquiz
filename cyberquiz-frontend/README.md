# CyberQuiz — Frontend (Vite + React)

The standalone web app for CyberQuiz. Every screen talks to the backend API
over `fetch` and authenticates with the JWT the backend issues — no simulated
data, no browser-storage mock.

## Run it (with the backend already running on :4000)

```bash
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:4000
npm run dev               # opens http://localhost:5173
```

Then open **http://localhost:5173**.

> Start the **backend first** (`cyberquiz-backend`: `npm run seed` then
> `npm run dev`). The two run side by side: API on `:4000`, app on `:5173`.

## How login works here

- **Dev login** (shown when the backend has `ALLOW_DEV_LOGIN=true`): enter a
  name + email to get a working account instantly. First time, you'll pick a
  username; after that it signs you straight in. Great for testing before you
  set up OAuth.
- **Google / Facebook**: the buttons are enabled automatically once the backend
  reports those providers are configured (it checks `GET /health`). Clicking one
  sends you to the backend's `/auth/<provider>`; after consent the backend
  redirects back to `http://localhost:5173/#auth?token=…` (or `/#onboarding…`
  for new users) and the app picks up the token from the URL.

The JWT is stored in `localStorage` under `cq_token` and sent as
`Authorization: Bearer …` on every request.

## What's wired to the API

| Screen | Calls |
|---|---|
| Login | `GET /health`, `POST /auth/dev-login`, OAuth redirects |
| Onboarding | `POST /auth/complete-signup` |
| Dashboard / Browse | `GET /api/quizzes`, `GET /api/leaderboard`, `GET /api/me/activity` |
| Take quiz | `GET /api/quizzes/:id` (no answers), `POST /api/quizzes/:id/submit` (server-scored) |
| Create | `POST /api/quizzes` |
| Leaderboard | `GET /api/leaderboard` |
| Profile | `PATCH /api/me/display-name`, `PATCH /api/me/avatar-color`, `POST /api/me/avatar` |

## Configuration

Only one env var: `VITE_API_URL` — the backend base URL. For production, set it
to your deployed API (e.g. `https://cyberquiz-api.onrender.com`) and update the
backend's `FRONTEND_URL` + OAuth redirect URIs to match the deployed frontend.

## Project layout

```
index.html            font links + root
src/
  main.jsx            React entry
  App.jsx             all screens + state
  api.js              backend client (JWT, one method per endpoint)
  styles.css          CyberQuiz theme
```
