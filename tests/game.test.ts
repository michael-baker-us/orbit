import { describe, expect, it } from 'vitest';
import { CONFIG, type GameConfig } from '../src/config';
import { angularDistance, Game, normalize, TAU } from '../src/game';

const empty = (overrides: Partial<GameConfig> = {}) => new Game({ ...CONFIG, startingObjects: [], ...overrides }, 17);
function advance(game: Game, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / CONFIG.fixedStep); i++) game.step(CONFIG.fixedStep);
}

describe('deterministic circular movement', () => {
  it('moves inner rings faster and preserves equal-speed separation', () => {
    const game = empty();
    const a = game.spawn(0, 1, 0), b = game.spawn(0, 1, 2), outer = game.spawn(2, 1, 0);
    advance(game, 1);
    expect(a.angle).toBeGreaterThan(outer.angle);
    expect(normalize(b.angle - a.angle)).toBeCloseTo(2, 8);
    expect(game.merges).toBe(0);
  });
  it('reproduces launches and outcomes from a seed and fixed steps', () => {
    const a = new Game(CONFIG, 1234), b = new Game(CONFIG, 1234);
    for (let frame = 0; frame < 4800; frame++) {
      if (frame % 72 === 0) for (const game of [a, b]) game.launch((frame / 72) % 3, frame * 0.19);
      a.step(CONFIG.fixedStep); b.step(CONFIG.fixedStep);
    }
    expect(a.objects).toEqual(b.objects);
    expect(a.score).toBe(b.score);
    expect(a.status).toBe(b.status);
    expect(a.objects.every(object => Number.isFinite(object.angle) && object.angle >= 0 && object.angle < TAU)).toBe(true);
  });
});

describe('launch and collision', () => {
  it('enforces cooldown, rejects invalid targets, and does not merge during flight', () => {
    const game = empty(); game.next = 1;
    game.spawn(0, 1, 0);
    expect(game.launch(99, 0)).toBe(false);
    expect(game.launch(0, NaN)).toBe(false);
    expect(game.launch(0, 0)).toBe(true);
    expect(game.launch(0, 1)).toBe(false);
    advance(game, 0.2);
    expect(game.merges).toBe(0);
    advance(game, 0.2);
    expect(game.merges).toBe(1);
    expect(game.launch(1, 0)).toBe(true);
  });
  it('catches matching objects using the launch boost', () => {
    const game = empty();
    game.spawn(0, 1, 0, true); game.spawn(0, 1, 1);
    advance(game, 1);
    expect(game.objects).toHaveLength(1);
    expect(game.objects[0].value).toBe(2);
    expect(game.score).toBe(20);
  });
  it('resolves a matching contact across the angular seam', () => {
    const game = empty();
    game.spawn(0, 2, TAU - 0.12, true); game.spawn(0, 2, 0.1);
    game.step(CONFIG.fixedStep);
    expect(game.objects).toHaveLength(1);
    expect(game.objects[0].value).toBe(3);
  });
  it('never merges objects on different rings', () => {
    const game = empty(); game.spawn(0, 1, 0); game.spawn(1, 1, 0);
    advance(game, 2);
    expect(game.merges).toBe(0);
  });
  it('queues a boosted object behind an incompatible blocker', () => {
    const game = empty();
    const trailing = game.spawn(0, 1, 0, true), leading = game.spawn(0, 2, 0.8);
    advance(game, 2);
    expect(game.merges).toBe(0);
    const gap = (CONFIG.objectRadius * 2 + 3) / CONFIG.rings[0].radius;
    expect(normalize(leading.angle - trailing.angle)).toBeCloseTo(gap, 6);
    expect(trailing.speed).toBeCloseTo(leading.speed, 6);
  });
  it('settles a launch directly overlapping an incompatible object', () => {
    const game = empty();
    const a = game.spawn(0, 1, 1, true), b = game.spawn(0, 2, 1);
    game.step(CONFIG.fixedStep);
    expect(angularDistance(a.angle, b.angle)).toBeGreaterThan(0.3);
    expect(game.merges).toBe(0);
  });
});

describe('combo lineage', () => {
  it('renews boost and rewards a merge causing another merge', () => {
    const game = empty();
    game.spawn(0, 1, 0, true); game.spawn(0, 1, 0.1); game.spawn(0, 2, 0.8);
    advance(game, 1);
    expect(game.objects).toHaveLength(1);
    expect(game.objects[0].value).toBe(3);
    expect(game.objects[0].depth).toBe(2);
    expect(game.score).toBe(100);
    expect(game.drainEvents().filter(event => event.type === 'merge').map(event => event.multiplier)).toEqual([1, 2]);
  });
  it('does not count unrelated simultaneous merges as a combo', () => {
    const game = empty();
    for (const ring of [0, 1]) { game.spawn(ring, 1, 0); game.spawn(ring, 1, 0.05); }
    game.step(CONFIG.fixedStep);
    expect(game.score).toBe(40);
    expect(game.objects.map(object => object.depth)).toEqual([1, 1]);
  });
  it('expires old lineage and caps the multiplier', () => {
    const game = empty(); const a = game.spawn(0, 2, 0);
    a.depth = 8; a.lastMerge = -CONFIG.comboWindow - 1;
    game.spawn(0, 2, 0.05); game.step(CONFIG.fixedStep);
    expect(game.objects[0].depth).toBe(1);
    const b = game.objects[0]; b.depth = 8; b.lastMerge = game.time;
    game.spawn(0, 3, b.angle + 0.05); game.step(CONFIG.fixedStep);
    const event = game.drainEvents().at(-1);
    expect(event?.type === 'merge' && event.multiplier).toBe(CONFIG.maxMultiplier);
  });
  it('preserves an active chain when the other parent has a deeper expired chain', () => {
    const game = empty();
    const stale = game.spawn(0, 2, 0), active = game.spawn(0, 2, 0.1);
    stale.depth = 9; stale.lastMerge = -CONFIG.comboWindow - 1;
    active.depth = 2; active.lastMerge = game.time;
    game.step(CONFIG.fixedStep);
    expect(game.objects[0].depth).toBe(3);
  });
});

describe('capacity and lifecycle', () => {
  const small = () => empty({ rings: CONFIG.rings.map(ring => ({ ...ring, capacity: 1 })) });
  it('allows exact safe capacity and ends only after overflow grace', () => {
    const game = small();
    game.spawn(0, 1, 0); game.spawn(1, 2, 0); game.spawn(2, 3, 0);
    advance(game, 3); expect(game.status).toBe('playing');
    game.spawn(0, 4, 2);
    advance(game, CONFIG.capacityGrace - 0.05); expect(game.status).toBe('playing');
    advance(game, 0.1); expect(game.status).toBe('over');
    expect(game.launch(0, 0)).toBe(false);
    const time = game.time; game.step(CONFIG.fixedStep); expect(game.time).toBe(time);
  });
  it('resets overflow when a merge makes room', () => {
    const game = small();
    game.spawn(0, 1, 0, true); game.spawn(0, 1, 1.3); game.spawn(1, 2, 0); game.spawn(2, 3, 0);
    advance(game, 0.4); expect(game.overflowTime).toBeGreaterThan(0);
    advance(game, 0.6); expect(game.objects).toHaveLength(3); expect(game.overflowTime).toBe(0);
    advance(game, 3); expect(game.status).toBe('playing');
  });
  it('clears a ring and creates debug merges through the regular event path', () => {
    const game = empty(); game.spawn(0, 1, 2); game.clearRing(0);
    expect(game.count(0)).toBe(0);
    game.triggerMerge(0, 2); expect(game.score).toBe(40);
    expect(game.drainEvents()[0].type).toBe('merge');
  });
});
