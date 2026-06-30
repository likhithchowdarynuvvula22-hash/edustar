(() => {
  const STORAGE_KEY = 'edustar-device-id';
  const NAME_KEY    = 'edustar-user-name';

  /* ── Device ID ─────────────────────────────────────────────── */
  function createDeviceId() {
    return `edustar-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function getDeviceId() {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const created = createDeviceId();
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  }

  /* ── User Name ──────────────────────────────────────────────── */
  function getUserName() {
    return window.localStorage.getItem(NAME_KEY) || '';
  }

  function saveUserName(name) {
    const trimmed = String(name || '').trim().slice(0, 40);
    if (trimmed) {
      window.localStorage.setItem(NAME_KEY, trimmed);
      // Persist to server silently
      const deviceId = getDeviceId();
      requestJson('/api/name', {
        method: 'POST',
        body: JSON.stringify({ deviceId, userName: trimmed }),
      }).catch((err) => {
        console.error('[EduStar] name persistence failed:', err.message);
      });
    }
    return trimmed;
  }

  /* ── Name Modal ─────────────────────────────────────────────── */
  // Injects and shows a full-screen name modal on first visit.
  // Returns a Promise that resolves with the saved name.
  function initNameModal() {
    return new Promise((resolve) => {
      const existingName = getUserName();
      if (existingName) {
        resolve(existingName);
        return;
      }

      // Inject CSS
      const styleId = 'es-name-modal-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          .es-name-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 9999;
            display: grid;
            place-items: center;
            background: rgba(10, 14, 39, .95);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            animation: es-nm-fade-in .4s ease;
          }
          .es-name-modal-overlay.is-hidden { display: none; }
          @keyframes es-nm-fade-in {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          .es-name-modal-card {
            background: linear-gradient(135deg, rgba(26,35,90,.97), rgba(10,14,39,.99));
            border: 1px solid rgba(255,215,0,.22);
            border-radius: 28px;
            padding: 2.8rem 2.2rem 2.4rem;
            text-align: center;
            max-width: 440px;
            width: 90%;
            box-shadow: 0 12px 60px rgba(0,0,0,.6), 0 0 80px rgba(255,215,0,.07);
            animation: es-nm-pop .45s cubic-bezier(.2,.9,.2,1.15) both;
          }
          @keyframes es-nm-pop {
            from { transform: scale(.88) translateY(24px); opacity: 0; }
            to   { transform: scale(1)  translateY(0);    opacity: 1; }
          }
          .es-name-modal-rocket {
            font-size: 3rem;
            margin-bottom: .6rem;
            display: block;
            animation: es-nm-wobble 2s ease-in-out infinite;
          }
          @keyframes es-nm-wobble {
            0%, 100% { transform: translateY(0) rotate(-4deg); }
            50%       { transform: translateY(-8px) rotate(4deg); }
          }
          .es-name-modal-title {
            font-family: 'Poppins', 'Outfit', system-ui, sans-serif;
            font-size: 1.75rem;
            font-weight: 800;
            color: #FFD700;
            margin: 0 0 .3rem;
            text-shadow: 0 0 20px rgba(255,215,0,.25);
          }
          .es-name-modal-sub {
            color: rgba(245,247,255,.65);
            font-size: .95rem;
            margin: 0 0 1.5rem;
          }
          .es-name-modal-input {
            width: 100%;
            padding: .85rem 1.3rem;
            border-radius: 999px;
            border: 1.5px solid rgba(255,215,0,.28);
            background: rgba(255,255,255,.07);
            color: #f5f7ff;
            font-size: 1.08rem;
            font-weight: 600;
            text-align: center;
            outline: none;
            box-sizing: border-box;
            transition: border-color .2s, box-shadow .2s;
            caret-color: #FFD700;
          }
          .es-name-modal-input::placeholder { color: rgba(255,255,255,.3); }
          .es-name-modal-input:focus {
            border-color: #FFD700;
            box-shadow: 0 0 0 3px rgba(255,215,0,.18), 0 0 20px rgba(255,215,0,.15);
          }
          .es-name-modal-error {
            color: #ff6b6b;
            font-size: .84rem;
            margin-top: .45rem;
            min-height: 1.1rem;
            transition: opacity .2s;
          }
          .es-name-modal-btn {
            display: block;
            width: 100%;
            margin-top: 1.3rem;
            padding: .85rem 2rem;
            border-radius: 999px;
            border: none;
            background: linear-gradient(135deg, #FFD700, #F0A500);
            color: #1a1200;
            font-weight: 800;
            font-size: 1.05rem;
            cursor: pointer;
            transition: transform .15s, box-shadow .15s;
            letter-spacing: .02em;
          }
          .es-name-modal-btn:hover {
            transform: scale(1.04);
            box-shadow: 0 6px 28px rgba(255,215,0,.45);
          }
          .es-name-modal-btn:active { transform: scale(.98); }
          .es-name-modal-hint {
            margin-top: .8rem;
            font-size: .8rem;
            color: rgba(245,247,255,.35);
          }
        `;
        document.head.appendChild(style);
      }

      // Inject HTML
      const overlay = document.createElement('div');
      overlay.className = 'es-name-modal-overlay';
      overlay.id = 'es-name-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'es-nm-title');
      overlay.innerHTML = `
        <div class="es-name-modal-card">
          <span class="es-name-modal-rocket" aria-hidden="true">🚀</span>
          <h2 class="es-name-modal-title" id="es-nm-title">Welcome to EduStar!</h2>
          <p class="es-name-modal-sub">What is your name, Explorer?</p>
          <input class="es-name-modal-input" id="es-nm-input" type="text"
            placeholder="Enter your name…" maxlength="40" autocomplete="off" spellcheck="false">
          <div class="es-name-modal-error" id="es-nm-error" aria-live="polite"></div>
          <button class="es-name-modal-btn" id="es-nm-btn">Let's Go! 🚀</button>
          <p class="es-name-modal-hint">Your progress will be saved automatically.</p>
        </div>
      `;
      document.body.appendChild(overlay);

      const input    = overlay.querySelector('#es-nm-input');
      const errorEl  = overlay.querySelector('#es-nm-error');
      const btn      = overlay.querySelector('#es-nm-btn');

      // Focus with short delay to allow animation to settle
      requestAnimationFrame(() => setTimeout(() => input.focus(), 120));

      function attemptSave() {
        const raw = input.value.trim();
        if (!raw) {
          errorEl.textContent = 'Please enter your name to continue.';
          input.focus();
          return;
        }
        if (raw.length < 2) {
          errorEl.textContent = 'Name must be at least 2 characters.';
          input.focus();
          return;
        }
        const name = saveUserName(raw);
        overlay.classList.add('is-hidden');
        resolve(name);
      }

      btn.addEventListener('click', attemptSave);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') attemptSave(); });
      input.addEventListener('input',   () => { errorEl.textContent = ''; });
    });
  }

  /* ── HTTP helper ────────────────────────────────────────────── */
  async function requestJson(path, options = {}) {
    const response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Request failed: ${response.status}`);
    }
    return response.json();
  }

  window.EduStarAPI = {
    getDeviceId,
    getUserName,
    saveUserName,
    initNameModal,
    requestJson,
  };
})();
