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
