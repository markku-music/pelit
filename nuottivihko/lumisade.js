// Tonttupolun hiutaleiden koko, läpikuultavuus, putoamisnopeus ja huojunta.
(() => {
  const canvas = document.getElementById('lumisade');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const flakes = Array.from({length: 42}, () => {
    const depth = Math.random();
    return {x: Math.random(), y: Math.random(), depth,
      phase: Math.random() * 2 * Math.PI, radius: .65 + depth * .95};
  });
  const wrap = (value, span) => ((value % span) + span) % span;
  let width, height, elapsed = 0, lastFrame = -1, previous = null, raf = null, paused = false;

  function paint() {
    const frame = Math.floor(elapsed * 30 / 1000);
    if (frame === lastFrame) return;
    lastFrame = frame;
    const t = frame / 30;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f7fbff';
    for (const f of flakes) {
      const drift = t * (2 + 4 * f.depth) + Math.sin(t * .55 + f.phase) * (2 + 3 * f.depth);
      const x = wrap(f.x * width + drift, width + 8) - 4;
      const y = wrap(f.y * height + t * (13 + 18 * f.depth), height + 8) - 4;
      ctx.globalAlpha = .38 + .38 * f.depth;
      ctx.beginPath();
      ctx.arc(x, y, f.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    // Keep the original apparent flake density and circular shape on different screens.
    const scale = Math.sqrt(rect.width * rect.height / (844 * 390));
    width = rect.width / scale;
    height = rect.height / scale;
    const density = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * density);
    canvas.height = Math.round(rect.height * density);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    lastFrame = -1;
    paint();
  }
  function step(time) {
    if (previous !== null) elapsed += time - previous;
    previous = time;
    paint();
    raf = requestAnimationFrame(step);
  }
  function sync() {
    if (!paused && !document.hidden && !reduced.matches) {
      if (raf === null) raf = requestAnimationFrame(step);
    } else {
      cancelAnimationFrame(raf);
      raf = previous = null;
    }
  }
  window.kulkusetSnow = {setPaused(value) { paused = value; sync(); }};
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  resize();
  sync();
})();
