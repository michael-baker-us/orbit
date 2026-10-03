# Orbit: vertical prototype

## Decision before implementation

The repository is empty. Use TypeScript, Canvas 2D, Vite, and Vitest. No runtime framework or physics engine. DOM handles accessible controls; Canvas handles the game. Native packaging can later use Capacitor, but is outside this experiment.

The smallest useful slice is one screen with three configurable rings, a draggable launch from the planet, an explicit insertion preview, matching-number merges, chains, score, and capacity loss.

## Rule problems and bounded experiments

- Equal angular velocities prevent catch-up. New objects get a fixed-duration clockwise boost; a merge renews it. Resting objects retain the same predictable base speed per ring. The aim preview shows the capture point and boosted sweep.
- Unequal numbers cannot merge. They block the faster object, which queues behind them. This gives insertion angle a strategic purpose without realistic physics.
- A full board can still be rescued by a merge. Exceeding total safe capacity starts a short grace timer rather than ending immediately.
- Unrelated merges should not manufacture combos. Combo depth follows the merged object's lineage, with a configurable expiry window.
- Unbounded numbers become hard to read. Color cycles while the number remains explicit; the prototype does not impose a winning value.

## Phases

1. **Rules:** configuration, seeded random generator, fixed-step state, launch, collision/queue resolution, lineage combos, capacity grace. Unit tests around seam crossings, blocking, chains, and loss.
2. **Playable screen:** responsive canvas and DOM HUD, three rings, central planet, next preview, drag/cancel input, restart, keyboard alternative.
3. **Feel:** generated planet shading, orbital trails, merge particles/pop/ripples, score labels, restrained screen response, synthesized audio, replaceable haptic interface.
4. **Iteration:** hidden debug panel, pause/speed/spawn/clear/merge/inspect controls, README and architecture notes, CI, browser interaction and mobile layout checks.

## Evaluation after implementation

Play repeated 10–20 minute sessions. Record whether aim is predictable, blocking is legible, chains reward a decision, losses feel fair, and restarting is appealing. Tune boost, ring speeds, spawn weights, capacity, and grace before adding features. This prototype tests the hypothesis; polish and passing tests cannot establish that it is fun.
