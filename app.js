/* ═══════════════════════════════════════════════════════════
   CERRADÔ — app.js  v3  (Apple-style frame-by-frame scroll)
   ──────────────────────────────────────────────────────────
   Técnica: 240 frames JPEG pré-carregados como Image objects,
   exibidos em <canvas> conforme o scroll.
   • Totalmente smooth — sem seek de codec
   • Scroll ↓ → avança  |  Scroll ↑ → regride
   • Lazy preload com prioridade progressiva
═══════════════════════════════════════════════════════════ */

'use strict';

/* ── CONFIGURAÇÃO ────────────────────────────────────────── */
const TOTAL_FRAMES = 240;          // frames extraídos pelo FFmpeg
const FRAME_PATH   = 'frames/frame_%04d.jpg'; // template de path
const SCROLL_HEIGHT_VH = 400;      // altura da seção hero em vh

/* ── REFS ────────────────────────────────────────────────── */
const canvas      = document.getElementById('heroCanvas');
const ctx         = canvas ? canvas.getContext('2d', { alpha: false }) : null;
const heroSection = document.getElementById('hero');
const navbar      = document.getElementById('navbar');
const scrollHint  = document.getElementById('scrollHint');
const heroText    = document.getElementById('heroText');
const progressBar = document.getElementById('progressBar');
const loadingBar  = document.getElementById('loadingBar');

/* ── ESTADO ──────────────────────────────────────────────── */
const frames    = new Array(TOTAL_FRAMES).fill(null); // Image[]
let loadedCount = 0;
let currentIdx  = -1;
let rafPending  = false;

/* ── HELPERS ─────────────────────────────────────────────── */
function padNum(n, len) {
  return String(n).padStart(len, '0');
}

function framePath(i) {
  // i é 1-indexed (FFmpeg gera frame_0001.jpg … frame_0240.jpg)
  return `frames/frame_${padNum(i + 1, 4)}.jpg`;
}

/* ── CANVAS RESIZE ───────────────────────────────────────── */
function resizeCanvas() {
  if (!canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  // Redesenha o frame atual após resize
  if (currentIdx >= 0 && frames[currentIdx]) {
    drawFrame(currentIdx);
  }
}

/* ── DESENHA FRAME ───────────────────────────────────────── */
function drawFrame(idx) {
  if (!ctx || !canvas) return;
  const img = frames[idx];
  if (!img || !img.complete) return;

  const cw = canvas.width,  ch = canvas.height;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const scale = Math.max(cw / iw, ch / ih);
  const sw = iw * scale, sh = ih * scale;
  const dx = (cw - sw) / 2, dy = (ch - sh) / 2;

  ctx.drawImage(img, dx, dy, sw, sh);
  currentIdx = idx;
}

/* ── PROGRESSO HERO ──────────────────────────────────────── */
function getHeroProgress() {
  if (!heroSection) return 0;
  const range = heroSection.offsetHeight - window.innerHeight;
  if (range <= 0) return 0;
  return Math.max(0, Math.min(1, (window.scrollY - heroSection.offsetTop) / range));
}

/* ── ATUALIZA FRAME NO SCROLL ────────────────────────────── */
function updateFrame() {
  rafPending = false;
  const progress = getHeroProgress();
  const rawIdx   = Math.round(progress * (TOTAL_FRAMES - 1));

  if (rawIdx === currentIdx) return;

  // Se o frame alvo estiver pronto, usa ele diretamente
  if (frames[rawIdx]?.complete) {
    drawFrame(rawIdx);
    return;
  }

  // Fallback: busca o frame carregado mais próximo (evita tela em branco)
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < TOTAL_FRAMES; i++) {
    if (frames[i]?.complete) {
      const d = Math.abs(i - rawIdx);
      if (d < bestDist) { bestDist = d; best = i; }
    }
  }
  if (best >= 0) drawFrame(best);
}

function scheduleFrameUpdate() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(updateFrame);
}

/* ── PRELOAD DE FRAMES ───────────────────────────────────── */
/**
 * Estratégia de carregamento em 3 passes:
 *  1. Frames-chave: 0, 30, 60, 90, 120, 150, 180, 210, 239
 *     → garante que a animação fique interativa rapidamente
 *  2. Todos os frames pares (x2 da fluidez)
 *  3. Frames ímpares restantes
 */
function preloadFrames() {
  if (!canvas) return;

  // Exibe placeholder enquanto carrega
  showPlaceholder();

  const keyframes = [0, 30, 60, 90, 120, 150, 180, 210, 239];
  const allIndices = Array.from({ length: TOTAL_FRAMES }, (_, i) => i);

  // Ordem de prioridade: keyframes → pares → ímpares
  const evens  = allIndices.filter(i => i % 2 === 0 && !keyframes.includes(i));
  const odds   = allIndices.filter(i => i % 2 !== 0);
  const order  = [...keyframes, ...evens, ...odds];

  let queueIdx = 0;
  const CONCURRENT = 6; // downloads paralelos

  function loadNext() {
    if (queueIdx >= order.length) return;
    const frameIdx = order[queueIdx++];
    const img = new Image();

    img.onload = () => {
      loadedCount++;
      frames[frameIdx] = img;

      // Atualiza barra de loading
      if (loadingBar) {
        loadingBar.style.width = (loadedCount / TOTAL_FRAMES * 100) + '%';
      }

      // Assim que o frame 0 estiver pronto, exibe e revela o texto
      if (frameIdx === 0 && loadedCount === 1) {
        resizeCanvas();
        drawFrame(0);
        heroText?.classList.add('visible');
        hidePlaceholder();
        scheduleFrameUpdate();
      }

      // Redispara update para preencher frames que faltavam
      scheduleFrameUpdate();

      // Esconde loading quando todos carregarem
      if (loadedCount === TOTAL_FRAMES) {
        hideLoading();
      }

      loadNext();
    };

    img.onerror = () => {
      loadedCount++;
      loadNext();
    };

    img.src = framePath(frameIdx);
    frames[frameIdx] = img;
  }

  // Inicia os downloads concorrentes
  for (let i = 0; i < CONCURRENT; i++) loadNext();
}

/* ── PLACEHOLDER / LOADING UI ────────────────────────────── */
function showPlaceholder() {
  if (!ctx || !canvas) return;
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, '#1B4332');
  grad.addColorStop(0.5, '#2D6A4F');
  grad.addColorStop(1, '#1B4332');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function hidePlaceholder() {
  // noop — o frame 0 já substituiu o placeholder
}

function hideLoading() {
  const el = document.getElementById('loadingOverlay');
  if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 600); }
}

/* ── SCROLL HANDLER ──────────────────────────────────────── */
function onScroll() {
  /* Progress bar */
  if (progressBar) {
    const docH = document.documentElement.scrollHeight - window.innerHeight;
    progressBar.style.width = (docH > 0 ? (window.scrollY / docH) * 100 : 0) + '%';
  }

  /* Navbar */
  navbar?.classList.toggle('scrolled', window.scrollY > 60);

  /* Scroll hint */
  if (scrollHint) scrollHint.style.opacity = window.scrollY > 80 ? '0' : '1';

  /* Frame update */
  scheduleFrameUpdate();

  /* Botão voltar ao topo */
  updateBackToTop();
}

/* ── CONTADORES ANIMADOS ─────────────────────────────────── */
function animateCounters() {
  document.querySelectorAll('.stat-number').forEach(el => {
    const text  = el.dataset.value || el.textContent.trim();
    el.dataset.value = text;
    const match = text.match(/([+]?)(\d+)([k%+]?)/);
    if (!match) return;
    const prefix = match[1], end = parseInt(match[2]), suffix = match[3];
    const start  = performance.now(), dur = 1800;
    const tick   = (now) => {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(2, -10 * p); // easeOutExpo
      el.textContent = prefix + Math.floor(e * end) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const impactoSection = document.getElementById('impacto');
if (impactoSection) {
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { animateCounters(); }
  }, { threshold: 0.4 }).observe(impactoSection);
}

/* ── SCROLL REVEAL ───────────────────────────────────────── */
const revealObs = new IntersectionObserver(
  (entries) => entries.forEach(e => {
    if (e.isIntersecting) e.target.classList.add('visible');
  }),
  { threshold: 0.12, rootMargin: '0px 0px -50px 0px' }
);
document.querySelectorAll('.reveal-up, .reveal-left, .reveal-right')
  .forEach(el => revealObs.observe(el));

/* ── BOTÃO VOLTAR AO TOPO — BURITI ──────────────────────── */
const backToTopBtn = document.getElementById('backToTop');

function updateBackToTop() {
  if (!backToTopBtn) return;
  // Aparece após 300px de scroll (quando o hero já passou)
  if (window.scrollY > 300) {
    backToTopBtn.classList.add('visible');
  } else {
    backToTopBtn.classList.remove('visible');
  }
}

backToTopBtn?.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

/* ── HAMBURGER ───────────────────────────────────────────── */
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');
let menuOpen = false;
hamburger?.addEventListener('click', () => {
  menuOpen = !menuOpen;
  if (!navLinks) return;
  if (menuOpen) {
    Object.assign(navLinks.style, {
      display: 'flex', position: 'absolute',
      top: '100%', left: '0', right: '0',
      flexDirection: 'column',
      background: 'rgba(27,67,50,0.97)',
      padding: '1.5rem 2rem', gap: '1.25rem',
      backdropFilter: 'blur(20px)',
    });
  } else {
    navLinks.style.display = 'none';
  }
});

/* ── SMOOTH ANCHORS ──────────────────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', e => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    if (menuOpen && navLinks) { navLinks.style.display = 'none'; menuOpen = false; }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ── INICIALIZAÇÃO ───────────────────────────────────────── */
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', () => { resizeCanvas(); scheduleFrameUpdate(); });
onScroll();
preloadFrames();
