import { CONFIG, colorFor } from './config';
import { angularDistance, Game, type GameEvent, TAU } from './game';
import type { Forecast } from './prediction';

export interface Aim { ring: number; angle: number; valid: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; total: number; color: string; size: number }
interface Impact { ring: number; angle: number; value: number; age: number; points: number; depth: number; id: number }
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private planet: HTMLCanvasElement;
  private particles: Particle[] = [];
  private impacts: Impact[] = [];
  private stars = Array.from({ length: 72 }, (_, i) => ({
    x: ((i * 179 + 29) % 640), y: ((i * 283 + 73) % 640), size: i % 9 === 0 ? 1.3 : 0.7,
  }));
  private elapsed = 0;
  private shake = 0;
  private cssScale = 1;
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.planet = this.makePlanet();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }
  private resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const size = this.canvas.getBoundingClientRect().width;
    this.cssScale = size / 640;
    this.canvas.width = Math.round(size * ratio);
    this.canvas.height = this.canvas.width;
  }
  position(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * 640 - 320, y: (event.clientY - rect.top) / rect.height * 640 - 320 };
  }
  aim(x: number, y: number, game: Game): Aim {
    const distance = Math.hypot(x, y);
    let ring = 0;
    for (let i = 1; i < game.config.rings.length; i++) {
      if (distance > (game.config.rings[i - 1].radius + game.config.rings[i].radius) / 2) ring = i;
    }
    return { ring, angle: Math.atan2(y, x), valid: distance > game.config.planetRadius + 28 };
  }
  reset() { this.impacts = []; this.particles = []; this.shake = 0; }
  handle(event: GameEvent, game: Game) {
    if (event.type !== 'merge') return;
    this.impacts.push({ ...event, age: 0 });
    this.shake = this.reducedMotion ? 0 : Math.min(2.4, 0.8 + event.depth * 0.4);
    if (this.reducedMotion) return;
    const radius = game.config.rings[event.ring].radius;
    const count = 14 + Math.min(event.depth, 4) * 7;
    for (let i = 0; i < count; i++) {
      const angle = i / count * TAU + event.angle;
      const speed = 25 + (i * 17 % 60) + event.depth * 8;
      const life = 0.4 + (i % 5) * 0.12;
      this.particles.push({ x: Math.cos(event.angle) * radius, y: Math.sin(event.angle) * radius,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, total: life,
        color: colorFor(event.value), size: i % 3 === 0 ? 2 : 1 });
    }
    this.particles = this.particles.slice(-240);
  }
  private makePlanet() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d')!;
    c.translate(128, 128);
    const atmosphere = c.createRadialGradient(-8, -8, 73, 0, 0, 123);
    atmosphere.addColorStop(0, '#8ffff522'); atmosphere.addColorStop(0.7, '#61ead012'); atmosphere.addColorStop(1, '#61ead000');
    c.fillStyle = atmosphere; c.beginPath(); c.arc(0, 0, 123, 0, TAU); c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, 88, 0, TAU); c.clip();
    const body = c.createRadialGradient(-35, -40, 1, 14, 25, 115);
    body.addColorStop(0, '#b7ffeb'); body.addColorStop(0.26, '#71cbb6'); body.addColorStop(0.58, '#2e746b'); body.addColorStop(0.85, '#102d30'); body.addColorStop(1, '#07191f');
    c.fillStyle = body; c.fillRect(-90, -90, 180, 180);
    // Curved surface bands, generated once rather than recomputed every frame.
    for (let i = 0; i < 25; i++) {
      c.strokeStyle = i % 3 === 0 ? '#d7fff518' : '#082f3019'; c.lineWidth = 1.5 + i % 4;
      c.beginPath();
      c.moveTo(-105, -95 + i * 8);
      c.bezierCurveTo(-50, -120 + i * 7, -30, 5 + i * 4, 106, -65 + i * 9); c.stroke();
    }
    for (let i = 0; i < 500; i++) {
      c.fillStyle = i % 2 ? '#effff509' : '#0728270e';
      c.fillRect((i * 73 % 180) - 90, (i * 113 % 180) - 90, 1, 1);
    }
    const shade = c.createLinearGradient(-60, -70, 75, 78);
    shade.addColorStop(0, '#05101700'); shade.addColorStop(0.5, '#05101705'); shade.addColorStop(1, '#030a17d9');
    c.fillStyle = shade; c.fillRect(-90, -90, 180, 180); c.restore();
    c.strokeStyle = '#baffea38'; c.lineWidth = 0.8; c.beginPath(); c.arc(0, 0, 87.5, 0, TAU); c.stroke();
    return canvas;
  }
  private circle(x: number, y: number, radius: number, fill?: string, stroke?: string) {
    const c = this.ctx; c.beginPath(); c.arc(x, y, radius, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.stroke(); }
  }
  private object(x: number, y: number, value: number, scale = 1, alpha = 1) {
    const c = this.ctx, color = colorFor(value), radius = CONFIG.objectRadius * scale;
    c.save(); c.globalAlpha = alpha;
    c.shadowColor = color + '75'; c.shadowBlur = 13;
    this.circle(x, y, radius, color + '16'); c.shadowBlur = 0;
    const body = c.createLinearGradient(x, y - radius, x, y + radius);
    body.addColorStop(0, color + '35'); body.addColorStop(1, '#111824');
    c.fillStyle = body; c.fill(); c.lineWidth = 1.2; c.strokeStyle = color + 'b0'; c.stroke();
    c.fillStyle = '#f6fbff'; c.font = `600 ${Math.max(17, 13 / this.cssScale) * scale}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(value), x, y + 0.5);
    c.restore();
  }
  draw(game: Game, aim: Aim | null, dt: number, debug: boolean, paused: boolean, forecast: Forecast | null = null) {
    const c = this.ctx;
    this.elapsed += dt;
    this.shake *= Math.exp(-dt * 15);
    for (const impact of this.impacts) impact.age += dt;
    this.impacts = this.impacts.filter(impact => impact.age < 1.1);
    for (const particle of this.particles) { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; }
    this.particles = this.particles.filter(particle => particle.life > 0);
    c.setTransform(this.canvas.width / 640, 0, 0, this.canvas.height / 640, 0, 0);
    c.clearRect(0, 0, 640, 640);
    for (const star of this.stars) {
      c.globalAlpha = 0.1 + 0.1 * (1 + Math.sin(this.elapsed * 0.3 + star.x));
      this.circle(star.x, star.y, star.size, '#a9bbd2');
    }
    c.globalAlpha = 1; c.save();
    c.translate(320 + Math.sin(this.elapsed * 78) * this.shake, 320 + Math.cos(this.elapsed * 93) * this.shake * 0.5);
    const halo = c.createRadialGradient(0, 0, 10, 0, 0, 285);
    halo.addColorStop(0, '#65e2cb0b'); halo.addColorStop(0.55, '#65e2cb03'); halo.addColorStop(1, '#65e2cb00');
    this.circle(0, 0, 285); c.fillStyle = halo; c.fill();
    const chain = this.impacts.filter(impact => impact.depth > 1 && impact.age < 0.8).at(-1);
    if (chain && !this.reducedMotion) {
      const light = c.createRadialGradient(0, 0, 35, 0, 0, 280);
      light.addColorStop(0, colorFor(chain.value) + '15'); light.addColorStop(1, colorFor(chain.value) + '00');
      c.globalAlpha = (1 - chain.age / 0.8) * Math.min(chain.depth / 3, 1);
      this.circle(0, 0, 280); c.fillStyle = light; c.fill(); c.globalAlpha = 1;
    }
    if (game.overflowTime > 0) {
      c.lineWidth = 1.3; c.strokeStyle = '#eeac9270';
      const radius = game.config.rings.at(-1)!.radius + 13;
      c.beginPath(); c.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, game.overflowTime / game.config.capacityGrace)); c.stroke();
    }
    game.config.rings.forEach((ring, index) => {
      const count = game.count(index), crowded = count >= ring.capacity;
      const selected = aim?.valid && aim.ring === index;
      const blocked = selected && forecast?.kind === 'blocked';
      const color = crowded ? '#eeac92' : '#83b7ba';
      c.lineWidth = selected ? 1.5 : 0.8;
      c.shadowBlur = selected ? 10 : 0; c.shadowColor = '#91ead7';
      this.circle(0, 0, ring.radius, undefined, selected ? blocked ? '#eeac928c' : '#91ead78c' : color + (crowded ? '55' : '25'));
      c.shadowBlur = 0;
      // Quiet clockwise marker on each orbit.
      const marker = -Math.PI / 2 + game.time * ring.speed;
      c.strokeStyle = selected ? '#91ead7' : color + '45'; c.lineWidth = 1.3;
      c.beginPath(); c.arc(0, 0, ring.radius, marker, marker + 0.1); c.stroke();
      if (debug) {
        c.fillStyle = crowded ? '#eeac92' : '#91ead7'; c.font = '11px monospace'; c.textAlign = 'center';
        c.fillText(`R${index + 1}  ${count}/${ring.capacity}  ${ring.speed.toFixed(2)} rad/s`, 0, -ring.radius - 9);
      }
    });
    // A merge sends a short luminous wave along its orbital trail.
    for (const impact of this.impacts) {
      const t = impact.age / game.config.mergeAnimationDuration;
      if (t >= 1) continue;
      const r = game.config.rings[impact.ring].radius;
      c.globalAlpha = (1 - t) * 0.6; c.lineWidth = 2;
      c.strokeStyle = colorFor(impact.value);
      c.beginPath(); c.arc(0, 0, r, impact.angle - t * 0.65, impact.angle + t * 1.8); c.stroke();
      const x = Math.cos(impact.angle) * r, y = Math.sin(impact.angle) * r;
      c.lineWidth = 1; this.circle(x, y, CONFIG.objectRadius + easeOut(t) * 32, undefined, colorFor(impact.value));
      c.globalAlpha = 1;
    }
    for (const object of game.objects) {
      const ring = game.config.rings[object.ring];
      const t = 1 - object.flight / game.config.flightDuration;
      const r = object.flight > 0 ? game.config.planetRadius + easeOut(t) * (ring.radius - game.config.planetRadius) : ring.radius;
      if (object.flight === 0) {
        const length = object.boost > 0 ? 0.38 : 0.17;
        for (let segment = 0; segment < 12; segment++) {
          c.strokeStyle = colorFor(object.value); c.globalAlpha = (1 - segment / 12) * (object.boost > 0 ? 0.25 : 0.12);
          c.lineWidth = 1.5 - segment / 12;
          c.beginPath(); c.arc(0, 0, r, object.angle - length * (segment + 1) / 12, object.angle - length * segment / 12); c.stroke();
        }
        c.globalAlpha = 1;
      }
      const impact = this.impacts.find(item => item.id === object.id);
      const pop = impact && !this.reducedMotion ? 1 + Math.sin(Math.min(1, impact.age / game.config.mergeAnimationDuration) * Math.PI) * 0.25 : 1;
      const x = Math.cos(object.angle) * r, y = Math.sin(object.angle) * r;
      this.object(x, y, object.value, pop);
      if (aim?.valid && object.id === forecast?.targetId) {
        c.lineWidth = 1.4; c.setLineDash(forecast.kind === 'blocked' ? [3, 3] : []);
        this.circle(x, y, CONFIG.objectRadius + 7, undefined, forecast.kind === 'blocked' ? '#eeac92' : '#91ead7');
        c.setLineDash([]);
      }
      if (debug) {
        c.font = '9px monospace'; c.textAlign = 'center'; c.fillStyle = '#99a9bd';
        c.fillText(`#${object.id} ${(object.angle * 180 / Math.PI).toFixed(0)}° ${object.speed.toFixed(2)}`, x, y + 30);
      }
    }
    const planetSize = game.config.planetRadius * 256 / 88;
    c.drawImage(this.planet, -planetSize / 2, -planetSize / 2, planetSize, planetSize);
    if (game.launches === 0 && !aim && !paused) {
      const pulse = this.reducedMotion ? 0 : (Math.sin(this.elapsed * 1.8) + 1) / 2;
      c.lineWidth = 1; this.circle(0, 0, game.config.planetRadius + 10 + pulse * 3, undefined, `rgba(145,234,215,${0.1 + pulse * 0.12})`);
    }
    if (aim?.valid) {
      const radius = game.config.rings[aim.ring].radius, x = Math.cos(aim.angle) * radius, y = Math.sin(aim.angle) * radius;
      const color = forecast?.kind === 'blocked' || forecast?.endsRun ? '#eeac92' : '#91ead7';
      c.setLineDash([3, 7]); c.lineWidth = 1; c.strokeStyle = color + '55';
      c.beginPath(); c.moveTo(Math.cos(aim.angle) * 58, Math.sin(aim.angle) * 58); c.lineTo(x, y); c.stroke();
      c.strokeStyle = color + '60'; c.beginPath();
      const sweep = forecast?.contactAngle !== null && forecast?.contactAngle !== undefined ? normalizeSweep(aim.angle, forecast.contactAngle) : game.config.boostSpeed * game.config.boostDuration;
      c.arc(0, 0, radius, aim.angle, aim.angle + sweep); c.stroke(); c.setLineDash([]);
      if (forecast?.contactAngle !== null && forecast?.contactAngle !== undefined) {
        const cx = Math.cos(forecast.contactAngle) * radius, cy = Math.sin(forecast.contactAngle) * radius;
        c.lineWidth = 1; c.setLineDash([2, 4]); this.circle(cx, cy, CONFIG.objectRadius + 3, undefined, color + 'a0'); c.setLineDash([]);
        this.circle(cx, cy, 3, color);
      }
      this.object(x, y, game.next, 1.1, 0.8);
      c.fillStyle = '#adcfca'; c.font = '10px system-ui'; c.textAlign = 'center';
      c.fillText(`ORBIT ${aim.ring + 1}`, x, y + (y > 0 ? 39 : -35));
      c.fillStyle = color; c.font = '11px system-ui';
      c.fillText(forecast?.kind === 'chain' ? 'RELEASE FOR A CHAIN' : forecast?.kind === 'match' ? 'RELEASE TO MATCH' : 'RELEASE TO PLACE', 0, 82);
    }
    if (!aim && chain) {
      const multiplier = Math.min(game.config.maxMultiplier, 1 + (chain.depth - 1) * game.config.comboStep);
      c.globalAlpha = Math.min(1, (0.8 - chain.age) * 4); c.fillStyle = colorFor(chain.value);
      c.font = '600 12px system-ui'; c.textAlign = 'center'; c.fillText(`×${multiplier} CHAIN`, 0, 81); c.globalAlpha = 1;
    }
    for (const particle of this.particles) {
      c.globalAlpha = particle.life / particle.total;
      this.circle(particle.x, particle.y, particle.size, particle.color);
    }
    c.globalAlpha = 1;
    for (const impact of this.impacts) {
      // A fast chain replaces its earlier reward label while retaining both bursts.
      if (this.impacts.some(newer => newer.id > impact.id && newer.ring === impact.ring && angularDistance(newer.angle, impact.angle) < 0.45)) continue;
      const r = game.config.rings[impact.ring].radius;
      c.globalAlpha = Math.min(1, (1.1 - impact.age) * 3);
      c.textAlign = 'center'; c.fillStyle = colorFor(impact.value); c.font = `${impact.depth > 1 ? 600 : 500} 13px system-ui`;
      c.fillText(`+${impact.points}${impact.depth > 1 ? `  ×${Math.min(game.config.maxMultiplier, 1 + (impact.depth - 1) * game.config.comboStep)}` : ''}`,
        Math.cos(impact.angle) * r, Math.sin(impact.angle) * r - 30 - impact.age * 24);
    }
    c.globalAlpha = 1;
    if (paused) { c.fillStyle = '#c5d2e5'; c.font = '10px system-ui'; c.textAlign = 'center'; c.fillText('SIMULATION PAUSED', 0, 84); }
    c.restore();
  }
}

function normalizeSweep(from: number, to: number) { return ((to - from) % TAU + TAU) % TAU; }
