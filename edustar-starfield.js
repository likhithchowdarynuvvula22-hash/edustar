(function () {
  const TOTAL_STARS = 150;
  const LAYERS = [
    { count: 100, sizeMin: 0.5, sizeMax: 1.1, speedMin: 0.05, speedMax: 0.12, freqMin: 0.0006, freqMax: 0.0012 },
    { count: 35, sizeMin: 0.9, sizeMax: 1.8, speedMin: 0.08, speedMax: 0.2, freqMin: 0.0008, freqMax: 0.0018 },
    { count: 15, sizeMin: 1.5, sizeMax: 2.5, speedMin: 0.12, speedMax: 0.3, freqMin: 0.001, freqMax: 0.0024 }
  ];

  let canvas;
  let ctx;
  let width = 0;
  let height = 0;
  let stars = [];
  let animationId = 0;
  let resizeTimer = 0;
  let reducedMotion = false;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function createStar(layerIndex) {
    const layer = LAYERS[layerIndex];
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: rand(layer.sizeMin, layer.sizeMax),
      baseOpacity: rand(0.3, 1),
      speed: rand(layer.speedMin, layer.speedMax),
      frequency: rand(layer.freqMin, layer.freqMax),
      phase: Math.random() * Math.PI * 2,
      layer: layerIndex,
    };
  }

  function resetStar(star, fromTop) {
    star.x = Math.random() * width;
    star.y = fromTop ? -rand(0, height * 0.15) : Math.random() * height;
    const layer = LAYERS[star.layer];
    star.radius = rand(layer.sizeMin, layer.sizeMax);
    star.baseOpacity = rand(0.3, 1);
    star.speed = rand(layer.speedMin, layer.speedMax);
    star.frequency = rand(layer.freqMin, layer.freqMax);
    star.phase = Math.random() * Math.PI * 2;
  }

  function resizeCanvas() {
    if (!canvas) {
      canvas = document.getElementById('es-starfield');
      if (!canvas) {
        return;
      }
      ctx = canvas.getContext('2d', { alpha: true });
      reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (event) {
        reducedMotion = event.matches;
        renderStatic();
        if (!reducedMotion) {
          startLoop();
        }
      });
    }

    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    stars = [];
    LAYERS.forEach(function (layer, layerIndex) {
      for (let index = 0; index < layer.count; index += 1) {
        stars.push(createStar(layerIndex));
      }
    });
    renderStatic();
  }

  function drawStar(star, time) {
    const twinkle = 0.55 + 0.45 * Math.sin(time * star.frequency * 1000 + star.phase);
    const opacity = Math.max(0.12, Math.min(1, star.baseOpacity * twinkle));
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  function renderStatic() {
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, width, height);
    const time = Date.now();
    for (let index = 0; index < stars.length; index += 1) {
      drawStar(stars[index], time);
    }
    ctx.globalAlpha = 1;
  }

  function frame() {
    const frameStart = performance.now();
    ctx.clearRect(0, 0, width, height);
    const time = Date.now();
    for (let index = 0; index < stars.length; index += 1) {
      const star = stars[index];
      star.y += star.speed;
      if (star.y - star.radius > height) {
        resetStar(star, true);
      }
      drawStar(star, time);
    }
    ctx.globalAlpha = 1;
    const elapsed = performance.now() - frameStart;
    animationId = window.requestAnimationFrame(frame);
    if (elapsed > 2.5) {
      // keep the loop simple; the star count is intentionally capped for budget devices
    }
  }

  function startLoop() {
    if (animationId) {
      window.cancelAnimationFrame(animationId);
    }
    if (reducedMotion) {
      renderStatic();
      return;
    }
    animationId = window.requestAnimationFrame(frame);
  }

  function debouncedResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () {
      resizeCanvas();
      if (!reducedMotion) {
        startLoop();
      }
    }, 200);
  }

  function initStarfield() {
    canvas = document.getElementById('es-starfield');
    if (!canvas) {
      return;
    }
    resizeCanvas();
    startLoop();
    window.addEventListener('resize', debouncedResize, { passive: true });
  }

  window.initStarfield = initStarfield;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStarfield, { once: true });
  } else {
    initStarfield();
  }
})();
