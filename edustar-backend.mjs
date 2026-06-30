import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)));
const schemaPath = join(rootDir, 'edustar-schema.sql');
const contentMapPath = join(rootDir, 'edustar-content-map.json');
const quizQuestionsPath = join(rootDir, 'edustar-quiz-questions.json');
const databasePath = join(rootDir, 'edustar-data.sqlite');

const db = new DatabaseSync(databasePath);
db.exec(readFileSync(schemaPath, 'utf8'));
// Migrate existing databases that predate the user_name column
try {
  db.exec(`ALTER TABLE app_settings ADD COLUMN user_name TEXT NOT NULL DEFAULT ''`);
} catch (_) { /* column already exists — safe to ignore */ }

const contentMap = JSON.parse(readFileSync(contentMapPath, 'utf8'));
const quizQuestions = JSON.parse(readFileSync(quizQuestionsPath, 'utf8'));

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

function json(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function text(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const raw = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        // Malformed JSON → resolve with empty object so route handlers
        // can validate missing fields and return a 400 themselves.
        resolveBody({});
      }
    });
    req.on('error', (err) => {
      console.error('[EduStar] request stream error:', err.message);
      rejectBody(err);
    });
  });
}

function getDeviceIdFromUrl(url) {
  return url.searchParams.get('deviceId') || '';
}

function normalizeDeviceId(rawValue) {
  return String(rawValue || '').trim().slice(0, 120);
}

function ensureDeviceId(rawValue) {
  // Accept null / undefined safely before normalising
  const normalized = normalizeDeviceId(rawValue ?? '');
  if (!normalized) {
    const error = new Error('deviceId is required');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function upsertSettings(deviceId, selectedGrade, userName) {
  db.prepare(
    `INSERT INTO app_settings (device_id, user_name, selected_grade, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(device_id) DO UPDATE SET
       user_name = CASE WHEN excluded.user_name != '' THEN excluded.user_name ELSE user_name END,
       selected_grade = excluded.selected_grade,
       updated_at = CURRENT_TIMESTAMP`
  ).run(deviceId, String(userName || '').trim().slice(0, 40), selectedGrade);
}

function upsertUserName(deviceId, userName) {
  const name = String(userName || '').trim().slice(0, 40);
  db.prepare(
    `INSERT INTO app_settings (device_id, user_name, selected_grade, updated_at)
     VALUES (?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(device_id) DO UPDATE SET
       user_name = excluded.user_name,
       updated_at = CURRENT_TIMESTAMP`
  ).run(deviceId, name);
}

function upsertProgress(deviceId, payload) {
  db.prepare(
    `INSERT INTO progress (device_id, stars, level, completed_lessons, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(device_id) DO UPDATE SET
       stars = excluded.stars,
       level = excluded.level,
       completed_lessons = excluded.completed_lessons,
       updated_at = CURRENT_TIMESTAMP`
  ).run(deviceId, payload.stars, payload.level, payload.completedLessons);
}

function upsertNotes(deviceId, noteText) {
  db.prepare(
    `INSERT INTO notes (device_id, note_text, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(device_id) DO UPDATE SET
       note_text = excluded.note_text,
       updated_at = CURRENT_TIMESTAMP`
  ).run(deviceId, noteText);
}

function insertJournalEntry(deviceId, entryText) {
  db.prepare('INSERT INTO journal_entries (device_id, entry_text) VALUES (?, ?)').run(deviceId, entryText);
}

function insertQuizAttempt(deviceId, payload) {
  db.prepare('INSERT INTO quiz_attempts (device_id, pillar, score, total) VALUES (?, ?, ?, ?)').run(
    deviceId,
    payload.pillar,
    payload.score,
    payload.total,
  );
}

function insertTutorMessage(deviceId, role, message) {
  db.prepare('INSERT INTO tutor_messages (device_id, role, message) VALUES (?, ?, ?)').run(deviceId, role, message);
}

function getProgressSummary(deviceId) {
  const progressRow = db.prepare('SELECT * FROM progress WHERE device_id = ?').get(deviceId);
  const settingsRow = db.prepare('SELECT * FROM app_settings WHERE device_id = ?').get(deviceId);
  const notesRow = db.prepare('SELECT * FROM notes WHERE device_id = ?').get(deviceId);
  const journalRows = db.prepare('SELECT entry_text, created_at FROM journal_entries WHERE device_id = ? ORDER BY created_at DESC LIMIT 7').all(deviceId);
  const quizRows = db.prepare('SELECT pillar, score, total, created_at FROM quiz_attempts WHERE device_id = ? ORDER BY created_at DESC LIMIT 10').all(deviceId);
  return {
    settings: settingsRow || { device_id: deviceId, selected_grade: 1 },
    progress: progressRow || { device_id: deviceId, stars: 0, level: 1, completed_lessons: 0 },
    notes: notesRow || { device_id: deviceId, note_text: '' },
    journal: journalRows,
    quizAttempts: quizRows,
  };
}

function getTutorHistory(deviceId) {
  return db.prepare(
    'SELECT role, message, created_at FROM tutor_messages WHERE device_id = ? ORDER BY created_at DESC LIMIT 12'
  ).all(deviceId).reverse();
}

function buildAdminSummary(deviceId = '') {
  const filters = deviceId ? 'WHERE device_id = ?' : '';
  const parameters = deviceId ? [deviceId] : [];

  return {
    settings: db.prepare(`SELECT * FROM app_settings ${filters} ORDER BY updated_at DESC`).all(...parameters),
    progress: db.prepare(`SELECT * FROM progress ${filters} ORDER BY updated_at DESC`).all(...parameters),
    notes: db.prepare(`SELECT * FROM notes ${filters} ORDER BY updated_at DESC`).all(...parameters),
    journalEntries: db.prepare(`SELECT * FROM journal_entries ${filters} ORDER BY created_at DESC`).all(...parameters),
    quizAttempts: db.prepare(`SELECT * FROM quiz_attempts ${filters} ORDER BY created_at DESC`).all(...parameters),
    tutorMessages: db.prepare(`SELECT * FROM tutor_messages ${filters} ORDER BY created_at DESC`).all(...parameters),
  };
}

function answerFromPrompt(promptText) {
  // Guard against non-string input (null / undefined safety)
  const safe = (typeof promptText === 'string' ? promptText : String(promptText ?? '')).toLowerCase();
  if (safe.includes('math') || safe.includes('number')) {
    return 'Let us break it into small steps and look for patterns.';
  }
  if (safe.includes('ai') || safe.includes('robot')) {
    return 'AI can help by finding patterns, but it still needs a human to check the answer.';
  }
  if (safe.includes('kind') || safe.includes('respect')) {
    return 'A kind action or respectful word can make a big difference.';
  }
  if (safe.includes('write') || safe.includes('prompt')) {
    return 'Try saying who it is for, what you want, and how long the answer should be.';
  }
  return 'Thanks for asking. I can help you turn that into a simple learning step.';
}

async function handleTutorChat(req, res) {
  const body = await readBody(req);
  // Null-safe deviceId extraction
  const deviceId = ensureDeviceId(body.deviceId ?? null);
  // Strict null/undefined check before String conversion
  const promptText = (body.message !== null && body.message !== undefined)
    ? String(body.message).trim()
    : '';

  if (!promptText) {
    json(res, 400, { error: 'message is required' });
    return;
  }

  insertTutorMessage(deviceId, 'user', promptText);
  const reply = answerFromPrompt(promptText);
  insertTutorMessage(deviceId, 'assistant', reply);

  json(res, 200, {
    reply,
    history: getTutorHistory(deviceId),
  });
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const pathname = normalize(url.pathname).replace(/\\/g, '/');

    if (req.method === 'GET' && pathname === '/api/health') {
      json(res, 200, { ok: true, service: 'edustar-backend' });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/content-map') {
      json(res, 200, contentMap);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/quiz-questions') {
      json(res, 200, quizQuestions);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/admin/summary') {
      const deviceId = normalizeDeviceId(url.searchParams.get('deviceId') || '');
      json(res, 200, buildAdminSummary(deviceId));
      return;
    }

    if (pathname === '/api/settings' && req.method === 'GET') {
      const deviceId = ensureDeviceId(getDeviceIdFromUrl(url));
      json(res, 200, { settings: db.prepare('SELECT * FROM app_settings WHERE device_id = ?').get(deviceId) || { device_id: deviceId, selected_grade: 1 } });
      return;
    }

    if (pathname === '/api/settings' && req.method === 'POST') {
      const body = await readBody(req);
      // Null-safe extraction before passing to ensureDeviceId
      const deviceId = ensureDeviceId(body.deviceId ?? null);
      const selectedGrade = Math.max(1, Math.min(12, Number.parseInt(String(body.selectedGrade ?? '1'), 10) || 1));
      // Strict null check — don't stringify undefined
      const userName = (body.userName !== null && body.userName !== undefined)
        ? String(body.userName).trim().slice(0, 40)
        : '';
      upsertSettings(deviceId, selectedGrade, userName);
      json(res, 200, { ok: true, settings: { device_id: deviceId, selected_grade: selectedGrade, user_name: userName } });
      return;
    }

    if (pathname === '/api/name' && req.method === 'GET') {
      const deviceId = ensureDeviceId(getDeviceIdFromUrl(url));
      const row = db.prepare('SELECT user_name FROM app_settings WHERE device_id = ?').get(deviceId);
      json(res, 200, { user_name: row ? row.user_name : '' });
      return;
    }

    if (pathname === '/api/name' && req.method === 'POST') {
      const body = await readBody(req);
      const deviceId = ensureDeviceId(body.deviceId ?? null);
      // Strict null check for userName
      const userName = (body.userName !== null && body.userName !== undefined)
        ? String(body.userName).trim().slice(0, 40)
        : '';
      if (!userName || userName.length < 2) {
        json(res, 400, { error: 'userName must be at least 2 characters' });
        return;
      }
      upsertUserName(deviceId, userName);
      json(res, 200, { ok: true, user_name: userName });
      return;
    }

    if (pathname === '/api/progress' && req.method === 'GET') {
      const deviceId = ensureDeviceId(getDeviceIdFromUrl(url));
      json(res, 200, getProgressSummary(deviceId));
      return;
    }

    if (pathname === '/api/progress' && req.method === 'POST') {
      const body = await readBody(req);
      const deviceId = ensureDeviceId(body.deviceId ?? null);
      const payload = {
        stars:            Math.max(0, Number.parseInt(String(body.stars            ?? '0'), 10) || 0),
        level:            Math.max(1, Number.parseInt(String(body.level            ?? '1'), 10) || 1),
        completedLessons: Math.max(0, Number.parseInt(String(body.completedLessons ?? '0'), 10) || 0),
      };
      upsertProgress(deviceId, payload);
      json(res, 200, { ok: true, progress: { device_id: deviceId, ...payload } });
      return;
    }

    if (pathname === '/api/notes' && req.method === 'GET') {
      const deviceId = ensureDeviceId(getDeviceIdFromUrl(url));
      json(res, 200, db.prepare('SELECT * FROM notes WHERE device_id = ?').get(deviceId) || { device_id: deviceId, note_text: '' });
      return;
    }

    if (pathname === '/api/notes' && req.method === 'POST') {
      const body = await readBody(req);
      const deviceId = ensureDeviceId(body.deviceId ?? null);
      // Strict null/undefined check before String conversion
      const noteText = (body.noteText !== null && body.noteText !== undefined)
        ? String(body.noteText).slice(0, 2000)
        : '';
      upsertNotes(deviceId, noteText);
      json(res, 200, { ok: true, noteText });
      return;
    }

    if (pathname === '/api/journal' && req.method === 'GET') {
      const deviceId = ensureDeviceId(getDeviceIdFromUrl(url));
      json(res, 200, db.prepare('SELECT id, entry_text, created_at FROM journal_entries WHERE device_id = ? ORDER BY created_at DESC').all(deviceId));
      return;
    }

    if (pathname === '/api/journal' && req.method === 'POST') {
      const body = await readBody(req);
      const deviceId = ensureDeviceId(body.deviceId ?? null);
      const entryText = (body.entryText !== null && body.entryText !== undefined)
        ? String(body.entryText).trim().slice(0, 1000)
        : '';
      if (!entryText) {
        json(res, 400, { error: 'entryText is required' });
        return;
      }
      insertJournalEntry(deviceId, entryText);
      json(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/quiz-attempts' && req.method === 'GET') {
      const deviceId = ensureDeviceId(getDeviceIdFromUrl(url));
      json(res, 200, db.prepare('SELECT id, pillar, score, total, created_at FROM quiz_attempts WHERE device_id = ? ORDER BY created_at DESC').all(deviceId));
      return;
    }

    if (pathname === '/api/quiz-attempts' && req.method === 'POST') {
      const body = await readBody(req);
      const deviceId = ensureDeviceId(body.deviceId ?? null);
      // Safe string coercion with explicit null guard
      const pillar = (body.pillar !== null && body.pillar !== undefined)
        ? String(body.pillar).slice(0, 80)
        : 'General';
      const score = Math.max(0, Number.parseInt(String(body.score  ?? '0'), 10) || 0);
      const total = Math.max(1, Number.parseInt(String(body.total  ?? '1'), 10) || 1);
      if (score > total) {
        json(res, 400, { error: 'score cannot exceed total' });
        return;
      }
      insertQuizAttempt(deviceId, { pillar, score, total });
      json(res, 200, { ok: true });
      return;
    }

    if (pathname === '/api/tutor/chat' && req.method === 'POST') {
      await handleTutorChat(req, res);
      return;
    }

    if (req.method === 'GET') {
      const requestedPath = pathname === '/' ? '/edustar-home.html' : pathname;
      const safePath = requestedPath.startsWith('/') ? requestedPath.slice(1) : requestedPath;
      const filePath = join(rootDir, safePath);
      const resolvedPath = resolve(filePath);

      if (!resolvedPath.startsWith(rootDir)) {
        text(res, 403, 'Forbidden');
        return;
      }

      if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
        text(res, 404, 'Not Found');
        return;
      }

      const contentType = mimeTypes[extname(resolvedPath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      });
      createReadStream(resolvedPath).pipe(res);
      return;
    }

    text(res, 405, 'Method Not Allowed');
  } catch (error) {
    const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    // Log server-side errors for debugging; client only gets generic message for 500s
    if (statusCode === 500) {
      console.error('[EduStar] unhandled error:', error.message, error.stack);
    }
    json(res, statusCode, {
      error: statusCode === 500 ? 'Internal Server Error' : error.message,
    });
  }
}

const port = Number.parseInt(process.env.PORT || process.env.EDUSTAR_PORT || '3000', 10);

const server = createServer((req, res) => {
  handleRequest(req, res);
});

server.on('error', (err) => {
  console.error('[EduStar] server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`[EduStar] Port ${port} is already in use. Set PORT or EDUSTAR_PORT to a different value.`);
    process.exit(1);
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[EduStar] backend listening on http://0.0.0.0:${port}`);
  console.log(`[EduStar] open http://127.0.0.1:${port}/edustar-home.html`);
});
