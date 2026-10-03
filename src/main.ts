import './style.css';
import { CONFIG, colorFor } from './config';
import { Game } from './game';
import { Renderer, type Aim } from './renderer';
import { Feedback } from './feedback';

const icon = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const soundOn = icon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>');
const soundOff = icon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>');
const resetIcon = icon('<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>');
const params = new URLSearchParams(location.search);
const requestedSeed = Number(params.get('seed'));
const seed = params.has('seed') && Number.isFinite(requestedSeed) ? requestedSeed : Date.now();
let game = new Game(CONFIG, seed);
let best = 0;
try { best = Number(localStorage.getItem('orbit.best.v1')) || 0; } catch { /* Storage is optional. */ }
let aim: Aim | null = null;
let pointer: number | null = null;
let debug = params.has('debug');
let paused = false;
let simulationSpeed = 1;
let accumulator = 0;
let hudCache = '';
let labTime = 0;
let renderMs = 0;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="header">
    <button class="brand" id="brand" aria-label="Orbit. Hold to open the tuning lab" title="Hold for tuning lab · D">
      <span class="brand-symbol">${icon('<ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="3"/><circle cx="20" cy="6" r="1.6" fill="currentColor" stroke="none"/>')}</span>
      <span>orbit<span class="brand-dot">.</span></span>
    </button>
    <span class="edition"><span></span> AN ORBITAL PUZZLE</span>
    <div class="tools">
      <button class="icon-button" id="sound" aria-label="Mute sound" aria-pressed="true" title="Sound">${soundOn}</button>
      <span class="tool-divider"></span>
      <button class="restart" id="restart" title="Restart · R">${resetIcon}<span>Restart</span></button>
    </div>
  </header>
  <main>
    <div class="intro"><span class="eyebrow">A LITTLE GRAVITY. A LITTLE STRATEGY.</span><h1>Find your orbit.</h1></div>
    <section class="game-shell" aria-label="Orbit puzzle game">
      <aside class="score-panel">
        <span class="eyebrow">YOUR SCORE</span><output class="score" id="score">0</output>
        <div class="best"><span class="best-icon">◇</span> BEST <span id="best">0</span></div>
        <div class="combo" id="combo" aria-live="polite"></div>
      </aside>
      <div class="stage">
        <canvas id="board" tabindex="0" aria-label="Orbital game board. Drag from the planet to a ring and release. Keyboard: up/down select ring, left/right aim, space to launch."></canvas>
        <div class="end-card" id="end-card" hidden>
          <span class="eyebrow">OUT OF SPACE</span><h2>A beautiful run.</h2>
          <p id="end-score"></p><button id="play-again">One more orbit ${resetIcon}</button>
        </div>
      </div>
      <aside class="next-panel">
        <div class="next-block"><span class="eyebrow">UP NEXT</span><div class="next-object" id="next">1</div><span class="next-caption">Ready for orbit</span></div>
        <div class="capacity-block"><div class="capacity-title"><span class="eyebrow">ORBITAL SPACE</span><span id="capacity-total"></span></div>
          <div id="capacities"></div><p id="capacity-hint">Make matches. Make room.</p>
        </div>
      </aside>
    </section>
    <div class="instruction"><span class="instruction-dot"></span><p id="instruction">Hold the planet. Pull into orbit. Let go.</p></div>
    <div class="merge-legend"><span class="legend-object one">1</span><span>+</span><span class="legend-object one">1</span><span class="legend-arrow">→</span><span class="legend-object two">2</span><span class="legend-caption">Same numbers. New possibilities.</span></div>
    <p id="announcement" class="sr-only" role="status" aria-live="polite"></p>
  </main>
  <footer><span>MATCH. MERGE. MAKE SPACE.</span><span class="footer-right">A small universe of possibilities <span class="footer-star">✳</span></span></footer>
  <section class="lab" id="lab" aria-label="Tuning lab" hidden>
    <div class="lab-heading"><strong>Tuning lab</strong><button id="close-lab" aria-label="Close tuning lab">×</button></div>
    <div class="lab-row"><button id="pause">Pause</button><button id="step">Step</button><button id="lab-restart">Restart</button></div>
    <label>Simulation speed<select id="speed"><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
    <label>Target orbit<select id="ring">${CONFIG.rings.map((_, i) => `<option value="${i}">Orbit ${i + 1}</option>`).join('')}</select></label>
    <label>Number<input id="value" type="number" value="1" min="1" max="99" /></label>
    <label>Angle (degrees)<input id="angle" type="number" value="270" min="0" max="360" /></label>
    <div class="lab-row"><button id="spawn">Spawn</button><button id="merge">Merge pair</button><button id="clear">Clear orbit</button></div>
    <pre id="inspection"></pre><small>D toggles lab · R restarts · P pauses</small>
  </section>`;

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>('board');
const renderer = new Renderer(canvas);
const feedback = new Feedback();
const scoreEl = element('score'), nextEl = element('next'), comboEl = element('combo');
const capacitiesEl = element('capacities');
capacitiesEl.innerHTML = CONFIG.rings.map((ring, i) => `<div class="capacity-row" id="capacity-${i}"><span class="orbit-name">0${i + 1}</span><div class="capacity-track">${Array.from({ length: ring.capacity }, () => '<i></i>').join('')}</div><span class="capacity-count"></span></div>`).join('');
let comboUntil = 0;
let comboLabel = '';

function updateHud() {
  const signature = `${game.score}:${game.next}:${game.objects.length}:${game.objects.map(o => o.ring).join(',')}:${game.status}:${best}`;
  if (signature === hudCache) return;
  hudCache = signature;
  scoreEl.textContent = game.score.toLocaleString();
  element('best').textContent = best.toLocaleString();
  nextEl.textContent = String(game.next); nextEl.style.setProperty('--object-color', colorFor(game.next));
  element('capacity-total').textContent = `${game.objects.length}/${game.capacity}`;
  CONFIG.rings.forEach((ring, i) => {
    const count = game.count(i), row = element(`capacity-${i}`);
    row.classList.toggle('crowded', count >= ring.capacity);
    row.querySelectorAll('i').forEach((bar, index) => bar.classList.toggle('filled', index < count));
    row.querySelector('.capacity-count')!.textContent = `${count}/${ring.capacity}`;
  });
  const danger = game.objects.length > game.capacity;
  element('capacity-hint').textContent = danger ? 'Over capacity. Find a match!' : 'Make matches. Make room.';
  element('capacity-hint').classList.toggle('danger', danger);
  element('end-card').hidden = game.status !== 'over';
  if (game.status === 'over') {
    element('end-score').textContent = `${game.score.toLocaleString()} points. Another orbit awaits.`;
    element('announcement').textContent = `Out of space. Your score is ${game.score}. Restart to play again.`;
    aim = null;
    element('play-again').focus();
  }
}

function processEvents() {
  for (const event of game.drainEvents()) {
    renderer.handle(event, game); feedback.handle(event);
    if (event.type === 'merge') {
      scoreEl.classList.remove('score-pop'); void scoreEl.offsetWidth; scoreEl.classList.add('score-pop');
      if (game.score > best) {
        best = game.score;
        try { localStorage.setItem('orbit.best.v1', String(best)); } catch { /* Optional persistence. */ }
      }
      comboUntil = game.time + 1.9;
      comboLabel = event.depth > 1 ? `×${event.multiplier} CHAIN REACTION` : 'A LITTLE MORE SPACE';
      element('announcement').textContent = `Merged to ${event.value}. ${event.points} points.${event.depth > 1 ? ` Chain multiplier ${event.multiplier}.` : ''}`;
    }
  }
}

function cancelAim() {
  const oldPointer = pointer; pointer = null; aim = null;
  if (oldPointer !== null && canvas.hasPointerCapture(oldPointer)) canvas.releasePointerCapture(oldPointer);
}
function restart() {
  cancelAim(); game = new Game(CONFIG, seed); accumulator = 0; paused = false;
  renderer.reset(); hudCache = ''; comboUntil = 0; comboLabel = '';
  element('pause').textContent = 'Pause'; updateHud();
  element('announcement').textContent = 'New orbit. Drag from the planet to launch.';
}
function toggleLab() { debug = !debug; element('lab').hidden = !debug; }
function togglePause() { cancelAim(); paused = !paused; accumulator = 0; element('pause').textContent = paused ? 'Resume' : 'Pause'; }

canvas.addEventListener('pointerdown', event => {
  if (pointer !== null || event.button !== 0 || paused || game.status !== 'playing' || game.cooldown > 0) return;
  const { x, y } = renderer.position(event);
  if (Math.hypot(x, y) > CONFIG.planetRadius + 28) return;
  event.preventDefault(); feedback.unlock(); pointer = event.pointerId;
  canvas.setPointerCapture(pointer); aim = renderer.aim(x, y, game);
});
canvas.addEventListener('pointermove', event => {
  if (pointer !== event.pointerId) return;
  const { x, y } = renderer.position(event); aim = renderer.aim(x, y, game);
});
canvas.addEventListener('pointerup', event => {
  if (pointer !== event.pointerId) return;
  const { x, y } = renderer.position(event); const target = renderer.aim(x, y, game);
  if (target.valid && !paused) game.launch(target.ring, target.angle);
  cancelAim(); processEvents(); updateHud();
});
canvas.addEventListener('pointercancel', cancelAim);
canvas.addEventListener('lostpointercapture', () => { pointer = null; aim = null; });
canvas.addEventListener('contextmenu', event => event.preventDefault());
element('restart').addEventListener('click', restart);
element('play-again').addEventListener('click', restart);
element('sound').addEventListener('click', () => {
  feedback.enabled = !feedback.enabled;
  element('sound').innerHTML = feedback.enabled ? soundOn : soundOff;
  element('sound').setAttribute('aria-label', feedback.enabled ? 'Mute sound' : 'Enable sound');
  element('sound').setAttribute('aria-pressed', String(feedback.enabled));
  if (feedback.enabled) feedback.unlock();
});
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === 'd') toggleLab();
  if (event.key.toLowerCase() === 'r') restart();
  if (event.key.toLowerCase() === 'p' && debug) togglePause();
  if (event.key === 'Escape') { cancelAim(); if (debug) toggleLab(); }
  if (event.target !== canvas || paused || game.status !== 'playing') return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key)) {
    event.preventDefault();
    aim ??= { ring: 0, angle: -Math.PI / 2, valid: true };
    if (event.key === 'ArrowUp') aim.ring = Math.min(CONFIG.rings.length - 1, aim.ring + 1);
    if (event.key === 'ArrowDown') aim.ring = Math.max(0, aim.ring - 1);
    if (event.key === 'ArrowLeft') aim.angle -= 0.1;
    if (event.key === 'ArrowRight') aim.angle += 0.1;
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { feedback.unlock(); game.launch(aim.ring, aim.angle); processEvents(); updateHud(); }
  }
});
canvas.addEventListener('blur', () => { if (pointer === null) aim = null; });
let holdTimer: ReturnType<typeof setTimeout> | undefined;
element('brand').addEventListener('pointerdown', () => { holdTimer = setTimeout(toggleLab, 650); });
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) element('brand').addEventListener(type, () => clearTimeout(holdTimer));
element('brand').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleLab(); } });
element('close-lab').addEventListener('click', toggleLab);
element('pause').addEventListener('click', togglePause);
element('step').addEventListener('click', () => { if (!paused) togglePause(); game.step(CONFIG.fixedStep); processEvents(); updateHud(); });
element('lab-restart').addEventListener('click', restart);
element<HTMLSelectElement>('speed').addEventListener('change', event => { simulationSpeed = Number((event.target as HTMLSelectElement).value); });
const labValues = () => ({
  ring: Number(element<HTMLSelectElement>('ring').value),
  value: Math.max(1, Math.min(99, Math.trunc(Number(element<HTMLInputElement>('value').value) || 1))),
  angle: (Number(element<HTMLInputElement>('angle').value) || 0) * Math.PI / 180,
});
element('spawn').addEventListener('click', () => { const { ring, value, angle } = labValues(); game.spawn(ring, value, angle, true); updateHud(); });
element('merge').addEventListener('click', () => { const { ring, value, angle } = labValues(); feedback.unlock(); game.triggerMerge(ring, value, angle); processEvents(); updateHud(); });
element('clear').addEventListener('click', () => { game.clearRing(labValues().ring); updateHud(); });
element('lab').hidden = !debug;

let last = performance.now();
document.addEventListener('visibilitychange', () => { cancelAim(); accumulator = 0; last = performance.now(); });
window.addEventListener('blur', cancelAim);
function frame(now: number) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (!paused && !document.hidden) {
    accumulator += dt * simulationSpeed;
    while (accumulator >= CONFIG.fixedStep) { game.step(CONFIG.fixedStep); accumulator -= CONFIG.fixedStep; }
  }
  processEvents(); updateHud();
  comboEl.textContent = game.time < comboUntil ? comboLabel : '';
  comboEl.classList.toggle('visible', game.time < comboUntil);
  const drawStart = performance.now(); renderer.draw(game, aim, dt, debug, paused); renderMs = performance.now() - drawStart;
  labTime += dt;
  if (debug && labTime > 0.15) {
    labTime = 0;
    element('inspection').textContent = `t=${game.time.toFixed(2)}s  draw=${renderMs.toFixed(2)}ms\nseed=${seed >>> 0}\nobjects=${game.objects.length}/${game.capacity}\nmerges=${game.merges}  launches=${game.launches}\noverflow=${game.overflowTime.toFixed(2)}s\nstate=${game.status}`;
  }
  requestAnimationFrame(frame);
}
updateHud(); requestAnimationFrame(frame);
