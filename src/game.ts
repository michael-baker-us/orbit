import { CONFIG, type GameConfig } from './config';

export const TAU = Math.PI * 2;
export const normalize = (angle: number) => ((angle % TAU) + TAU) % TAU;
export const angularDistance = (a: number, b: number) => Math.min(normalize(a - b), normalize(b - a));

export interface OrbitalObject {
  id: number; ring: number; value: number; angle: number;
  flight: number; boost: number; depth: number; lastMerge: number; speed: number;
}
export type GameEvent =
  | { type: 'launch'; ring: number; angle: number; value: number }
  | { type: 'merge'; ring: number; angle: number; value: number; depth: number; multiplier: number; points: number; id: number; sources: [number, number] }
  | { type: 'hold'; value: number }
  | { type: 'over'; score: number };

/** No browser, drawing, wall clock, sound, or global randomness in the rules. */
export class Game {
  objects: OrbitalObject[] = [];
  events: GameEvent[] = [];
  score = 0;
  time = 0;
  merges = 0;
  launches = 0;
  next = 1;
  upcoming: number[] = [];
  reserved: number | null = null;
  holdLocked = false;
  maxChain = 0;
  cooldown = 0;
  overflowTime = 0;
  status: 'playing' | 'over' = 'playing';
  private sequence = 0;
  private randomState: number;

  constructor(public readonly config: GameConfig = CONFIG, seed = 42) {
    this.randomState = seed >>> 0;
    for (const object of config.startingObjects) this.spawn(object.ring, object.value, object.angle);
    this.next = this.chooseNext();
    this.upcoming = Array.from({ length: config.upcomingCount }, () => this.chooseNext());
  }

  /** Copies future-affecting state without advancing the live RNG or copying its event queue. */
  clone(): Game {
    const copy = new Game({ ...this.config, startingObjects: [] }, 0);
    copy.objects = this.objects.map(object => ({ ...object }));
    copy.score = this.score; copy.time = this.time; copy.merges = this.merges;
    copy.launches = this.launches; copy.next = this.next; copy.upcoming = [...this.upcoming];
    copy.reserved = this.reserved; copy.holdLocked = this.holdLocked; copy.maxChain = this.maxChain;
    copy.cooldown = this.cooldown; copy.overflowTime = this.overflowTime; copy.status = this.status;
    copy.sequence = this.sequence; copy.randomState = this.randomState;
    return copy;
  }

  private advanceQueue() {
    this.next = this.upcoming.shift() ?? this.chooseNext();
    while (this.upcoming.length < this.config.upcomingCount) this.upcoming.push(this.chooseNext());
  }

  hold(): boolean {
    if (!this.config.reserveEnabled || this.status !== 'playing' || this.holdLocked) return false;
    const ready = this.next;
    if (this.reserved === null) this.advanceQueue();
    else this.next = this.reserved;
    this.reserved = ready; this.holdLocked = true;
    this.events.push({ type: 'hold', value: this.next });
    return true;
  }

  get capacity() { return this.config.rings.reduce((sum, ring) => sum + ring.capacity, 0); }
  count(ring: number) { return this.objects.filter(object => object.ring === ring).length; }
  private random() {
    this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }
  private chooseNext() {
    const difficulty = this.config.difficulty;
    const shift = Math.min(difficulty.maxExtraTwoWeight, Math.floor(this.merges / difficulty.everyMerges) * difficulty.extraTwoWeight);
    const weights = this.config.spawnDistribution.map(item => ({ ...item, weight: item.weight + (item.value === 2 ? shift : item.value === 1 ? -shift : 0) }));
    let roll = this.random() * weights.reduce((sum, item) => sum + item.weight, 0);
    for (const item of weights) { roll -= item.weight; if (roll <= 0) return item.value; }
    return weights.at(-1)!.value;
  }

  spawn(ring: number, value: number, angle: number, boosted = false): OrbitalObject {
    if (!this.config.rings[ring] || !Number.isInteger(value) || value < 1) throw new RangeError('Invalid orbital object');
    const object: OrbitalObject = {
      id: ++this.sequence, ring, value, angle: normalize(angle), flight: 0,
      boost: boosted ? this.config.boostDuration : 0, depth: 0, lastMerge: -Infinity,
      speed: this.config.rings[ring].speed,
    };
    this.objects.push(object);
    return object;
  }

  launch(ring: number, angle: number): boolean {
    if (this.status !== 'playing' || this.cooldown > 0 || !this.config.rings[ring] || !Number.isFinite(angle)) return false;
    const object = this.spawn(ring, this.next, angle, true);
    object.flight = this.config.flightDuration;
    this.events.push({ type: 'launch', ring, angle: object.angle, value: object.value });
    this.advanceQueue();
    this.holdLocked = false;
    this.cooldown = this.config.launchCooldown;
    this.launches++;
    return true;
  }

  private merge(a: OrbitalObject, b: OrbitalObject) {
    const activeDepth = Math.max(...[a, b].map(object => this.time - object.lastMerge <= this.config.comboWindow ? object.depth : 0));
    const depth = activeDepth + 1;
    const multiplier = Math.min(this.config.maxMultiplier, 1 + (depth - 1) * this.config.comboStep);
    const points = this.config.scoreBase * 2 ** a.value * multiplier;
    const merged = this.spawn(a.ring, a.value + 1, b.angle, true);
    merged.depth = depth;
    merged.lastMerge = this.time;
    this.objects = this.objects.filter(object => object.id !== a.id && object.id !== b.id);
    this.score += points;
    this.merges++;
    this.maxChain = Math.max(this.maxChain, depth);
    this.events.push({ type: 'merge', ring: merged.ring, angle: merged.angle, value: merged.value, depth, multiplier, points, id: merged.id, sources: [a.id, b.id] });
  }

  /** Step with a fixed dt in production. Pair ordering is stable, including 0/2π. */
  step(dt: number) {
    if (this.status !== 'playing') return;
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (const object of this.objects) {
      if (object.flight > 0) { object.flight = Math.max(0, object.flight - dt); continue; }
      object.speed = this.config.rings[object.ring].speed + (object.boost > 0 ? this.config.boostSpeed : 0);
      object.boost = Math.max(0, object.boost - dt);
    }
    for (let ring = 0; ring < this.config.rings.length; ring++) {
      const objects = this.objects.filter(object => object.ring === ring && object.flight === 0).sort((a, b) => a.angle - b.angle || a.id - b.id);
      if (objects.length < 2) continue;
      const gap = Math.min((this.config.objectRadius * 2 + 3) / this.config.rings[ring].radius, TAU / (objects.length + 1) * 0.9);
      const consumed = new Set<number>();
      // Resolve approaching matching neighbors before constraining traffic.
      for (let i = 0; i < objects.length; i++) {
        const a = objects[i], b = objects[(i + 1) % objects.length];
        if (consumed.has(a.id) || consumed.has(b.id)) continue;
        const distance = normalize(b.angle - a.angle);
        if (a.value === b.value && distance <= gap + Math.max(0, a.speed - b.speed) * dt + 1e-8) {
          this.merge(a, b); consumed.add(a.id); consumed.add(b.id);
        }
      }
      const remaining = objects.filter(object => !consumed.has(object.id));
      // Propagate the leading object's speed through a queue, without pushing it.
      if (remaining.length > 1) for (let pass = 0; pass < remaining.length; pass++) {
        for (let i = 0; i < remaining.length; i++) {
          const a = remaining[i], b = remaining[(i + 1) % remaining.length];
          const distance = normalize(b.angle - a.angle);
          a.speed = Math.min(a.speed, b.speed + Math.max(0, distance - gap) / dt);
        }
      }
      // Initial overlap with a blocker settles behind it rather than passing through.
      if (remaining.length > 1) for (let i = remaining.length - 1; i >= 0; i--) {
        const a = remaining[i], b = remaining[(i + 1) % remaining.length];
        if (a.value !== b.value && normalize(b.angle - a.angle) < gap) a.angle = normalize(b.angle - gap);
      }
    }
    for (const object of this.objects) if (object.flight === 0) object.angle = normalize(object.angle + object.speed * dt);
    this.overflowTime = this.objects.length > this.capacity ? this.overflowTime + dt : 0;
    if (this.overflowTime >= this.config.capacityGrace) {
      this.status = 'over'; this.events.push({ type: 'over', score: this.score });
    }
  }

  clearRing(ring: number) { this.objects = this.objects.filter(object => object.ring !== ring); this.overflowTime = 0; }
  /** Create a real matching contact so the normal collision path drives debug effects. */
  triggerMerge(ring: number, value: number, angle = -Math.PI / 2) {
    this.spawn(ring, value, angle, true);
    this.spawn(ring, value, angle + 0.08);
    this.step(this.config.fixedStep);
  }
  drainEvents() { return this.events.splice(0); }
}
