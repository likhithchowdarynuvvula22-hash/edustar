(() => {
  const STORAGE_KEY = 'edustar-device-id';

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
    requestJson,
  };
})();
