import { Game, normalize, type GameEvent } from './game';

export type MergeEvent = Extract<GameEvent, { type: 'merge' }>;
export interface Forecast {
  kind: 'match' | 'chain' | 'blocked' | 'open' | 'unavailable';
  ring: number;
  targetId: number | null;
  contactAngle: number | null;
  firstContactIn: number | null;
  merges: MergeEvent[];
  points: number;
  resultValue: number;
  endsRun: boolean;
}

/** Release-now forecast; future player inputs are deliberately excluded. */
export function predictLaunch(game: Game, ring: number, angle: number): Forecast {
  const forecast: Forecast = { kind: 'unavailable', ring, targetId: null, contactAngle: null,
    firstContactIn: null, merges: [], points: 0, resultValue: game.next, endsRun: false };
  const copy = game.clone();
  if (!copy.launch(ring, angle)) return forecast;
  const shot = copy.objects.at(-1)!;
  let branchId = shot.id;
  const start = copy.time;
  const horizon = game.config.forecast.horizon;
  copy.drainEvents();
  forecast.kind = 'open';
  for (let elapsed = 0; elapsed < horizon; elapsed += game.config.fixedStep) {
    copy.step(game.config.fixedStep);
    for (const event of copy.drainEvents()) {
      if (event.type !== 'merge' || !event.sources.includes(branchId)) continue;
      if (forecast.merges.length === 0) {
        forecast.targetId = event.sources.find(id => id !== branchId)!;
        forecast.contactAngle = event.angle;
        forecast.firstContactIn = copy.time - start;
      }
      branchId = event.id;
      forecast.merges.push(event); forecast.points += event.points; forecast.resultValue = event.value;
    }
    if (copy.status === 'over') { forecast.endsRun = true; break; }
    const branch = copy.objects.find(object => object.id === branchId)!;
    if (!branch) break;
    if (forecast.merges.length === 0 && forecast.kind !== 'blocked' && branch.flight === 0 && branch.boost > 0) {
      const neighbors = copy.objects.filter(object => object.ring === ring && object.id !== branchId && object.flight === 0);
      const lead = neighbors.sort((a, b) => normalize(a.angle - branch.angle) - normalize(b.angle - branch.angle))[0];
      const gap = Math.min((game.config.objectRadius * 2 + 3) / game.config.rings[ring].radius,
        Math.PI * 2 / (neighbors.length + 2) * 0.9);
      if (lead && lead.value !== branch.value && normalize(lead.angle - branch.angle) <= gap + 1e-6 && branch.speed < game.config.rings[ring].speed + game.config.boostSpeed - 1e-6) {
        forecast.kind = 'blocked'; forecast.targetId = lead.id;
        forecast.contactAngle = lead.angle; forecast.firstContactIn = copy.time - start;
      }
    }
    // Once the branch and every object on its orbit coast, no catch-up is possible.
    if (copy.objects.filter(object => object.ring === ring).every(object => object.flight === 0 && object.boost === 0)) break;
  }
  if (forecast.merges.length) forecast.kind = forecast.merges.length > 1 ? 'chain' : 'match';
  return forecast;
}
