import { describe, expect, it } from 'vitest';
import { CONFIG, type GameConfig } from '../src/config';
import { Game, TAU } from '../src/game';
import { predictLaunch, type MergeEvent } from '../src/prediction';

const empty = (overrides: Partial<GameConfig> = {}) => new Game({ ...CONFIG, startingObjects: [], ...overrides }, 42);
function advance(game: Game, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / CONFIG.fixedStep); i++) game.step(CONFIG.fixedStep);
}

describe('upcoming numbers and reserve', () => {
  it('promotes the visible upcoming number on a successful launch only', () => {
    const game = empty(); const queue = [...game.upcoming];
    expect(game.launch(-1, 0)).toBe(false); expect(game.upcoming).toEqual(queue);
    expect(game.launch(0, 0)).toBe(true);
    expect(game.next).toBe(queue[0]); expect(game.upcoming[0]).toBe(queue[1]);
    expect(game.upcoming).toHaveLength(CONFIG.upcomingCount);
    const next = game.next; expect(game.launch(0, 0)).toBe(false); expect(game.next).toBe(next);
  });
  it('stores the ready number once, then unlocks only after a successful launch', () => {
    const game = empty(); const ready = game.next, next = game.upcoming[0];
    expect(game.hold()).toBe(true); expect(game.reserved).toBe(ready); expect(game.next).toBe(next);
    expect(game.hold()).toBe(false); expect(game.launch(99, 0)).toBe(false); expect(game.holdLocked).toBe(true);
    expect(game.launch(0, 0)).toBe(true); expect(game.holdLocked).toBe(false);
  });
  it('swaps without rerolling or advancing the queue', () => {
    const game = empty(); game.hold(); game.launch(0, 0); advance(game, 0.4);
    const stored = game.reserved, ready = game.next, queue = [...game.upcoming];
    const control = game.clone();
    expect(game.hold()).toBe(true); expect(game.next).toBe(stored); expect(game.reserved).toBe(ready);
    expect(game.upcoming).toEqual(queue);
    game.launch(1, 1); control.launch(1, 1);
    expect(game.next).toBe(control.next); expect(game.upcoming).toEqual(control.upcoming);
  });
  it('supports disabling reserve or the upcoming preview and rejects holding after loss', () => {
    const game = empty({ reserveEnabled: false, upcomingCount: 0 });
    expect(game.hold()).toBe(false); expect(game.upcoming).toEqual([]);
    expect(game.launch(0, 0)).toBe(true); expect(game.next).toBeGreaterThan(0);
    const ended = empty(); ended.status = 'over'; expect(ended.hold()).toBe(false);
  });
});

describe('forecast uses the real deterministic rules', () => {
  it('predicts a launch lineage chain and the exact rewards', () => {
    const game = empty(); game.next = 1;
    game.spawn(0, 1, 0.55); game.spawn(0, 2, 1.4);
    const forecast = predictLaunch(game, 0, 0);
    expect(forecast.kind).toBe('chain'); expect(forecast.resultValue).toBe(3); expect(forecast.points).toBe(100);
    game.launch(0, 0); let branch = game.objects.at(-1)!.id;
    game.drainEvents(); const actual: MergeEvent[] = [];
    for (let i = 0; i < CONFIG.forecast.horizon / CONFIG.fixedStep; i++) {
      game.step(CONFIG.fixedStep);
      for (const event of game.drainEvents()) if (event.type === 'merge' && event.sources.includes(branch)) {
        actual.push(event); branch = event.id;
      }
    }
    expect(forecast.merges).toEqual(actual);
  });
  it('identifies an incompatible blocker instead of looking through it to a match', () => {
    const game = empty(); game.next = 1;
    const blocker = game.spawn(0, 2, 0.7); game.spawn(0, 1, 1.5);
    const forecast = predictLaunch(game, 0, 0);
    expect(forecast.kind).toBe('blocked'); expect(forecast.targetId).toBe(blocker.id);
    expect(forecast.points).toBe(0); expect(forecast.firstContactIn).toBeLessThan(CONFIG.boostDuration);
  });
  it('handles the seam and rejects cooldown or invalid targets', () => {
    const game = empty(); game.next = 2; game.spawn(0, 2, 0.3);
    expect(predictLaunch(game, 0, TAU - 0.1).kind).toBe('match');
    expect(predictLaunch(game, 9, 0).kind).toBe('unavailable');
    expect(predictLaunch(game, 0, NaN).kind).toBe('unavailable');
    game.launch(1, 0); expect(predictLaunch(game, 0, 0).kind).toBe('unavailable');
  });
  it('ignores unrelated merges when scoring the predicted shot', () => {
    const game = empty(); game.next = 1;
    game.spawn(1, 2, 0); game.spawn(1, 2, 0.05);
    const forecast = predictLaunch(game, 0, 0);
    expect(forecast.kind).toBe('open'); expect(forecast.points).toBe(0); expect(forecast.merges).toEqual([]);
  });
  it('does not mutate the board, events, reserve, future draws, or combo state', () => {
    const game = new Game(CONFIG, 1717); game.hold();
    const before = JSON.stringify(game); const control = game.clone();
    for (let ring = 0; ring < 3; ring++) predictLaunch(game, ring, 0.5);
    expect(JSON.stringify(game)).toBe(before);
    for (let i = 0; i < 12; i++) {
      game.launch(i % 3, i); control.launch(i % 3, i);
      advance(game, 0.5); advance(control, 0.5);
      expect(game.objects).toEqual(control.objects); expect(game.upcoming).toEqual(control.upcoming);
      expect(game.next).toBe(control.next); expect(game.score).toBe(control.score);
    }
  });
  it('includes capacity grace and a rescuing merge', () => {
    const config = { rings: CONFIG.rings.map(ring => ({ ...ring, capacity: 1 })) };
    const crowded = empty(config); crowded.next = 4;
    crowded.spawn(0, 1, 0); crowded.spawn(1, 2, 0); crowded.spawn(2, 3, 0);
    expect(predictLaunch(crowded, 0, 2).endsRun).toBe(true);
    crowded.next = 1;
    const rescue = predictLaunch(crowded, 0, -0.4);
    expect(rescue.kind).toBe('match'); expect(rescue.endsRun).toBe(false);
  });
  it('copies in-flight and boosted objects, then evolves independently', () => {
    const game = empty(); game.launch(0, 1); game.hold(); advance(game, 0.1);
    const copy = game.clone(); expect(copy.objects).toEqual(game.objects); expect(copy.reserved).toBe(game.reserved);
    advance(game, 1); advance(copy, 1); expect(copy.objects).toEqual(game.objects);
    copy.objects[0].angle = 0; copy.upcoming[0] = 99;
    expect(game.objects[0].angle).not.toBe(0); expect(game.upcoming[0]).not.toBe(99);
  });
});
