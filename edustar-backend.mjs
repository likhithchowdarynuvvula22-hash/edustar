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
        const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
        resolveBody(body ? JSON.parse(body) : {});
      } catch (error) {
        rejectBody(error);
      }
    });
    req.on('error', rejectBody);
  });
}

function getDeviceIdFromUrl(url) {
  return url.searchParams.get('deviceId') || '';
}

function normalizeDeviceId(rawValue) {
  return String(rawValue || '').trim().slice(0, 120);
}

function ensureDeviceId(deviceId) {
  const normalized = normalizeDeviceId(deviceId);
  if (!normalized) {
    const error = new Error('deviceId is required');
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function upsertSettings(deviceId, selectedGrade) {
  db.prepare(
    `INSERT INTO app_settings (device_id, selected_grade, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(device_id) DO UPDATE SET
       selected_grade = excluded.selected_grade,
       updated_at = CURRENT_TIMESTAMP`
  ).run(deviceId, selectedGrade);
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
  const text = promptText.toLowerCase();
  if (text.includes('math') || text.includes('number')) {
    return 'Let us break it into small steps and look for patterns.';
  }
  if (text.includes('ai') || text.includes('robot')) {
    return 'AI can help by finding patterns, but it still needs a human to check the answer.';
  }
  if (text.includes('kind') || text.includes('respect')) {
    return 'A kind action or respectful word can make a big difference.';
  }
  if (text.includes('write') || text.includes('prompt')) {
    return 'Try saying who it is for, what you want, and how long the answer should be.';
  }
  return 'Thanks for asking. I can help you turn that into a simple learning step.';
}

async function handleTutorChat(req, res) {
  const body = await readBody(req);
  const deviceId = ensureDeviceId(body.deviceId);
  const promptText = String(body.message || '').trim();

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
      const deviceId = ensureDeviceId(body.deviceId);
      const selectedGrade = Math.max(1, Math.min(12, Number.parseInt(body.selectedGrade, 10) || 1));
      upsertSettings(deviceId, selectedGrade);
      json(res, 200, { ok: true, settings: { device_id: deviceId, selected_grade: selectedGrade } });
      return;
    }

    if (pathname === '/api/progress' && req.method === 'GET') {
      const deviceId = ensureDeviceId(getDeviceIdFromUrl(url));
      json(res, 200, getProgressSummary(deviceId));
      return;
    }

    if (pathname === '/api/progress' && req.method === 'POST') {
      const body = await readBody(req);
      const deviceId = ensureDeviceId(body.deviceId);
      const payload = {
        stars: Math.max(0, Number.parseInt(body.stars, 10) || 0),
        level: Math.max(1, Number.parseInt(body.level, 10) || 1),
        completedLessons: Math.max(0, Number.parseInt(body.completedLessons, 10) || 0),
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
      const deviceId = ensureDeviceId(body.deviceId);
      const noteText = String(body.noteText || '').slice(0, 2000);
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
      const deviceId = ensureDeviceId(body.deviceId);
      const entryText = String(body.entryText || '').trim().slice(0, 1000);
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
      const deviceId = ensureDeviceId(body.deviceId);
      const pillar = String(body.pillar || 'General').slice(0, 80);
      const score = Math.max(0, Number.parseInt(body.score, 10) || 0);
      const total = Math.max(1, Number.parseInt(body.total, 10) || 1);
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
    json(res, statusCode, {
      error: statusCode === 500 ? 'Internal Server Error' : error.message,
    });
  }
}

const port = Number.parseInt(process.env.PORT || process.env.EDUSTAR_PORT || '3000', 10);

createServer((req, res) => {
  handleRequest(req, res);
}).listen(port, '0.0.0.0', () => {
  console.log(`EduStar backend listening on http://0.0.0.0:${port}`);
});
