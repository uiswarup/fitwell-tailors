const TOTAL_FRAMES = 480;
const canvas = document.getElementById('scroll-canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const loaderBar = document.getElementById('loader-bar');
const hudFrame = document.getElementById('hud-frame-label');
const hudBar = document.getElementById('hud-indicator-bar');
const hudChapter = document.getElementById('hud-chapter-label');

const images = new Array(TOTAL_FRAMES);
let loadedCount = 0;
let lastDrawnIndex = -1;
let lastDrawnImg = null;
let currentProgress = 0;
let targetProgress = 0;

const chapters = [
  { max: 0.25, label: '01 / DRAFTING' },
  { max: 0.50, label: '02 / THE SHEAR' },
  { max: 0.75, label: '03 / CANVASSING' },
  { max: 1.00, label: '04 / SILHOUETTE' }
];

// Build frame path
function getFramePath(index) {
  const frameNum = String(index + 1).padStart(4, '0');
  return `frames/frame_${frameNum}.jpg`;
}

// Adjust canvas resolution for Retina / High DPI displays
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    lastDrawnIndex = -1; // force redraw
  }
}

// Draw the image with object-fit: cover behavior
function drawImageCover(img) {
  if (!img || !img.complete || img.naturalWidth === 0) return;

  const cWidth = canvas.width;
  const cHeight = canvas.height;
  const iWidth = img.naturalWidth;
  const iHeight = img.naturalHeight;

  const hRatio = cWidth / iWidth;
  const vRatio = cHeight / iHeight;
  const ratio = Math.max(hRatio, vRatio);

  const drawWidth = iWidth * ratio;
  const drawHeight = iHeight * ratio;
  const drawX = (cWidth - drawWidth) * 0.5;
  const drawY = (cHeight - drawHeight) * 0.5;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, iWidth, iHeight, drawX, drawY, drawWidth, drawHeight);
}

// Render the most appropriate frame
function renderFrame(targetIndex) {
  let img = images[targetIndex];

  // If the target frame hasn't loaded yet, fallback to the nearest loaded frame
  if (!img || !img.complete || img.naturalWidth === 0) {
    for (let offset = 1; offset < TOTAL_FRAMES; offset++) {
      const prev = targetIndex - offset;
      if (prev >= 0 && images[prev]?.complete && images[prev]?.naturalWidth > 0) {
        img = images[prev];
        break;
      }
      const next = targetIndex + offset;
      if (next < TOTAL_FRAMES && images[next]?.complete && images[next]?.naturalWidth > 0) {
        img = images[next];
        break;
      }
    }
  }

  if (img && (targetIndex !== lastDrawnIndex || lastDrawnIndex === -1)) {
    drawImageCover(img);
    lastDrawnIndex = targetIndex;
  }
}

// Calculate scroll progress (0.0 to 1.0) across the entire page
function updateScrollTarget() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  if (maxScroll <= 0) {
    targetProgress = 0;
  } else {
    targetProgress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
  }

  // Update floating HUD
  const currentFrameNum = Math.min(
    TOTAL_FRAMES,
    Math.max(1, Math.round(targetProgress * (TOTAL_FRAMES - 1)) + 1)
  );

  if (hudFrame) {
    hudFrame.textContent = `FRAME ${String(currentFrameNum).padStart(3, '0')}`;
  }
  if (hudBar) {
    hudBar.style.height = `${(targetProgress * 100).toFixed(1)}%`;
  }
  if (hudChapter) {
    const ch = chapters.find((c) => targetProgress <= c.max) || chapters[chapters.length - 1];
    hudChapter.textContent = ch.label;
  }
}

// Ultra-smooth interpolation loop (Lerp with inertia damping)
function tick() {
  const lerpFactor = 0.085;
  const diff = targetProgress - currentProgress;

  if (Math.abs(diff) < 0.0001) {
    currentProgress = targetProgress;
  } else {
    currentProgress += diff * lerpFactor;
  }

  const frameIndex = Math.min(
    TOTAL_FRAMES - 1,
    Math.max(0, Math.round(currentProgress * (TOTAL_FRAMES - 1)))
  );

  renderFrame(frameIndex);

  requestAnimationFrame(tick);
}

// Preload images efficiently with concurrency
async function preloadImages() {
  // 1. Immediately load frame 0 and display it
  const firstImg = new Image();
  firstImg.src = getFramePath(0);
  images[0] = firstImg;

  firstImg.onload = () => {
    loadedCount++;
    resizeCanvas();
    renderFrame(0);
  };

  // 2. Preload remaining frames concurrently in batches of 16
  const BATCH_SIZE = 16;
  const indices = [];
  for (let i = 1; i < TOTAL_FRAMES; i++) {
    indices.push(i);
  }

  async function loadBatch(batch) {
    await Promise.all(
      batch.map((idx) => {
        return new Promise((resolve) => {
          const img = new Image();
          img.src = getFramePath(idx);
          images[idx] = img;
          img.onload = img.onerror = () => {
            loadedCount++;
            if (loaderBar) {
              const pct = (loadedCount / TOTAL_FRAMES) * 100;
              loaderBar.style.width = pct + '%';
            }
            resolve();
          };
        });
      })
    );
  }

  for (let i = 0; i < indices.length; i += BATCH_SIZE) {
    const chunk = indices.slice(i, i + BATCH_SIZE);
    await loadBatch(chunk);
  }

  // Once all frames are in memory, fade out the loader bar
  if (loaderBar) {
    loaderBar.classList.add('done');
    setTimeout(() => {
      loaderBar.remove();
    }, 700);
  }
}

// Native scroll listener
window.addEventListener('scroll', updateScrollTarget, { passive: true });

// Mouse Wheel event handler for crisp smooth scrolling
window.addEventListener('wheel', (e) => {
  if (
    document.querySelector('.modal-overlay.open') ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
  ) {
    return;
  }

  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  if (maxScroll <= 0) return;

  let delta = e.deltaY;
  if (e.deltaMode === 1) delta *= 35;
  else if (e.deltaMode === 2) delta *= window.innerHeight;

  const currentY = window.scrollY;
  const targetY = Math.max(0, Math.min(maxScroll, currentY + delta));

  if (targetY !== currentY) {
    e.preventDefault();
    window.scrollTo({
      top: targetY,
      left: 0,
      behavior: 'instant'
    });
    updateScrollTarget();
  }
}, { passive: false });

window.addEventListener('resize', () => {
  resizeCanvas();
  const frameIndex = Math.min(
    TOTAL_FRAMES - 1,
    Math.max(0, Math.round(currentProgress * (TOTAL_FRAMES - 1)))
  );
  lastDrawnIndex = -1; // force re-render
  renderFrame(frameIndex);
});

// Initialization
resizeCanvas();
updateScrollTarget();
currentProgress = targetProgress;
preloadImages();
requestAnimationFrame(tick);
