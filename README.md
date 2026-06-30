# EduStar

EduStar is a free, ad-free, login-free learning platform for school students from Class 1 to Class 12.

## What is included

- Space-and-adventure themed front-end pages for the main learning areas.
- A Node 24 backend using the built-in `node:sqlite` module.
- SQLite storage for learner settings, progress, notes, journal entries, quiz attempts, and AI tutor chat history.
- A small admin/debug page for inspecting stored learner data.

## Run it

Use the single command runner:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-edustar.ps1
```

That starts the backend and opens the home page.

## Main URLs

- Home: `http://127.0.0.1:3000/edustar-home.html`
- Admin debug: `http://127.0.0.1:3000/edustar-admin-debug.html`

## Backend

The backend entry point is `edustar-backend.mjs`.

Useful API routes:

- `GET /api/health`
- `GET /api/content-map`
- `GET /api/quiz-questions`
- `GET /api/settings?deviceId=...`
- `POST /api/settings`
- `GET /api/progress?deviceId=...`
- `POST /api/progress`
- `GET /api/notes?deviceId=...`
- `POST /api/notes`
- `GET /api/journal?deviceId=...`
- `POST /api/journal`
- `GET /api/quiz-attempts?deviceId=...`
- `POST /api/quiz-attempts`
- `POST /api/tutor/chat`
- `GET /api/admin/summary?deviceId=...`

## Database

The SQLite schema lives in `edustar-schema.sql` and creates these tables:

- `app_settings`
- `progress`
- `notes`
- `journal_entries`
- `quiz_attempts`
- `tutor_messages`

The database file is created locally as `edustar-data.sqlite`.

## Notes

- No npm packages are required.
- The backend uses the built-in SQLite support from Node 24.
- The UI is designed to respect reduced-motion preferences.

## Deploying to Railway

Quick steps to deploy this project to Railway:

1. Push this repository to GitHub.
2. Create a new project on Railway and connect your GitHub repository.
3. Railway will detect a Node project; it runs `npm start` by default (the included `Procfile` also specifies `web: npm start`).
4. Railway provides the `PORT` environment variable — the backend respects `PORT`.

Important notes about SQLite and Railway:

- Railway dynos have an ephemeral filesystem. Any changes made to `edustar-data.sqlite` at runtime will not be preserved across deploys or instance restarts. For production use, migrate to a managed database (Postgres) and update the code accordingly.
- For quick demos you can include `edustar-data.sqlite` in the repo, but accept that data is temporary.

Environment variables you might set on Railway:

- `EDUSTAR_PORT` (optional) — custom port if you need it (Railway sets `PORT` automatically).

If you want, I can add a minimal Railway `service.json` or help switch the backend to Postgres for persistent storage.
