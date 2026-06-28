/* ═══════════════════════════════════════════════════════════
   CERRADÔ — JAVASCRIPT
   • GIF controlado por scroll usando gifuct-js
   • Scroll reveal com IntersectionObserver
   • Navbar scroll + hamburger menu
   • Progress bar de leitura
═══════════════════════════════════════════════════════════ */

'use strict';

/* ── PROGRESS BAR ────────────────────────────────────────── */
const progressBar = document.createElement('div');
progressBar.className = 'progress-bar';
document.body.prepend(progressBar);

/* ── REFS ────────────────────────────────────────────────── */
const canvas      = document.getElementById('gifCanvas');
const ctx         = canvas ? canvas.getContext('2d') : null;
const heroSection = document.getElementById('hero');
const navbar      = document.getElementById('navbar');
const scrollHint  = document.getElementById('scrollHint');

/* ── GIF STATE ───────────────────────────────────────────── */
let gifFrames     = [];   // Array of ImageData
let gifLoaded     = false;
let currentFrame  = -1;
let offscreenCtx  = null; // for compositing

/* ═══════════════════════════════════════════════════════════
   GIF LOADER — uses gifuct-js (loaded via CDN in HTML)
   Falls back to plain <img> if library unavailable
═══════════════════════════════════════════════════════════ */

async function loadGif() {
  if (!canvas || !ctx) return;

  // Show loading overlay on canvas
  showCanvasPlaceholder();

  try {
    const response = await fetch('Untitled design.gif');
    const buffer   = await response.arrayBuffer();

    // gifuct-js global: window.gifuct or the named exports
    const gifuctLib = window.gifuct || window['gifuct-js'];

    let frames;
    if (gifuctLib && gifuctLib.parseGIF && gifuctLib.decompressFrames) {
      const parsed = gifuctLib.parseGIF(buffer);
      frames = gifuctLib.decompressFrames(parsed, true);
    } else if (window.parseGIF && window.decompressFrames) {
      // Flat export style
      const parsed = window.parseGIF(buffer);
      frames = window.decompressFrames(parsed, true);
    } else {
      throw new Error('gifuct-js not found');
    }

    if (!frames || frames.length === 0) throw new Error('No frames decoded');

    // Set canvas dimensions from first frame dims
    const { dims } = frames[0];
    const gifW = dims.width;
    const gifH = dims.height;
    canvas.width  = gifW;
    canvas.height = gifH;

    // Create offscreen canvas for compositing
    const offscreen = document.createElement('canvas');
    offscreen.width  = gifW;
    offscreen.height = gifH;
    offscreenCtx = offscreen.getContext('2d');

    // Build composite ImageData for each frame (handle disposal)
    const patchCanvas = document.createElement('canvas');
    const patchCtx    = patchCanvas.getContext('2d');

    let prevFrameData = null;

    for (const frame of frames) {
      const { dims: fd, disposalType, patch } = frame;

      // Restore previous frame state based on disposal
      if (prevFrameData) {
        if (disposalType === 2) {
          // Restore to background (clear patch area)
          offscreenCtx.clearRect(fd.left, fd.top, fd.width, fd.height);
        }
        // disposalType 1 = leave in place (already on offscreen)
        // disposalType 3 = restore to previous (more complex — skip for now)
      }

      // Draw patch onto offscreen
      patchCanvas.width  = fd.width;
      patchCanvas.height = fd.height;
      const patchImageData = new ImageData(patch, fd.width, fd.height);
      patchCtx.putImageData(patchImageData, 0, 0);
      offscreenCtx.drawImage(patchCanvas, fd.left, fd.top);

      // Capture composite
      const compositeData = offscreenCtx.getImageData(0, 0, gifW, gifH);
      gifFrames.push(new ImageData(
        new Uint8ClampedArray(compositeData.data),
        gifW,
        gifH
      ));

      prevFrameData = compositeData;
    }

    gifLoaded = true;
    drawFrame(0);

    // Reveal hero text
    document.querySelector('.hero-text')?.classList.add('visible');
    console.log(`✅ GIF loaded: ${gifFrames.length} frames @ ${gifW}×${gifH}`);

  } catch (err) {
    console.warn('⚠️ GIF decode failed, using img fallback:', err);
    useFallbackGif();
  }
}

function showCanvasPlaceholder() {
  if (!ctx || !canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  // Draw dark green gradient as placeholder
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, '#1B4332');
  grad.addColorStop(1, '#2D6A4F');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function useFallbackGif() {
  if (!canvas) return;
  // Hide canvas, show animated gif as img
  canvas.style.display = 'none';
  const img = document.createElement('img');
  img.src = 'Untitled design.gif';
  img.alt = 'Cerradô';
  img.style.cssText = `
    width: 100%;
    height: 100%;
    object-fit: cover;
    position: absolute;
    inset: 0;
    z-index: 0;
  `;
  canvas.parentElement.prepend(img);
  document.querySelector('.hero-text')?.classList.add('visible');
}

/* ── DRAW FRAME ──────────────────────────────────────────── */
function drawFrame(rawIndex) {
  if (!gifLoaded || !ctx || gifFrames.length === 0) return;
  const index = Math.max(0, Math.min(gifFrames.length - 1, Math.round(rawIndex)));
  if (index === currentFrame) return;
  currentFrame = index;
  ctx.putImageData(gifFrames[index], 0, 0);
}

/* ── SCROLL → FRAME MAPPING ──────────────────────────────── */
function getHeroProgress() {
  if (!heroSection) return 0;
  const scrollTop  = window.scrollY;
  const heroTop    = heroSection.offsetTop;
  const heroHeight = heroSection.offsetHeight;
  const scrollable = heroHeight - window.innerHeight;
  if (scrollable <= 0) return 0;
  return Math.max(0, Math.min(1, (scrollTop - heroTop) / scrollable));
}

/* ── MAIN SCROLL HANDLER ─────────────────────────────────── */
function onScroll() {
  // Progress bar
  const docH    = document.documentElement.scrollHeight - window.innerHeight;
  const pct     = docH > 0 ? (window.scrollY / docH) * 100 : 0;
  progressBar.style.width = pct + '%';

  // Navbar
  if (navbar) {
    navbar.classList.toggle('scrolled', window.scrollY > 60);
  }

  // Scroll hint fade
  if (scrollHint) {
    scrollHint.style.opacity = window.scrollY > 80 ? '0' : '1';
  }

  // GIF frame
  if (gifLoaded && gifFrames.length > 0) {
    const progress = getHeroProgress();
    drawFrame(progress * (gifFrames.length - 1));
  }
}

/* ── SCROLL REVEAL ───────────────────────────────────────── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll(
  '.reveal-up, .reveal-left, .reveal-right, .reveal-hero'
).forEach(el => revealObserver.observe(el));

/* ── HAMBURGER MENU ──────────────────────────────────────── */
const hamburger = document.getElementById('hamburger');
let menuOpen = false;
if (hamburger) {
  hamburger.addEventListener('click', () => {
    menuOpen = !menuOpen;
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;
    if (menuOpen) {
      navLinks.style.display    = 'flex';
      navLinks.style.position   = 'absolute';
      navLinks.style.top        = '100%';
      navLinks.style.left       = '0';
      navLinks.style.right      = '0';
      navLinks.style.flexDirection = 'column';
      navLinks.style.background = 'rgba(27,67,50,0.98)';
      navLinks.style.padding    = '1.5rem 2rem';
      navLinks.style.gap        = '1.2rem';
      navLinks.style.backdropFilter = 'blur(20px)';
    } else {
      navLinks.style.display = 'none';
    }
  });
}

/* ── SMOOTH ANCHOR SCROLLING ─────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      menuOpen = false;
      const navLinks = document.querySelector('.nav-links');
      if (navLinks && window.innerWidth < 768) {
        navLinks.style.display = 'none';
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

/* ── INIT ────────────────────────────────────────────────── */
window.addEventListener('scroll', onScroll, { passive: true });
onScroll(); // Initial call

// Load GIF after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadGif);
} else {
  loadGif();
}
