# Milestone 2: deliberate planning

The vertical prototype establishes the interaction. This milestone tests whether information and one bounded choice make the same screen more interesting over repeated runs.

## Implement now

1. Two upcoming numbers beyond the ready object; a reserve slot that can store or exchange the ready number once between launches. Storing an object advances the queue; exchanging does not draw randomness. No limit on time spent considering a move.
2. A live aim forecast from a private simulation copy. Trace the launched object's merge lineage, distinguish blockers from empty space, and show chain potential. Predictions assume release now and no subsequent launches; update while aiming. Bound the lookahead and refresh rate for mobile performance.
3. Stronger but restrained chain feedback, readable crowding/grace feedback, pause/resume, and end-of-run statistics. Debug modifications mark the run as practice and cannot update the personal best.
4. Unit checks for queue/reserve and forecast agreement, browser checks for the new controls and feedback, screenshot verification at desktop and small-phone sizes.

## Architecture tradeoff

Keep the deterministic `Game` separate from presentation. Add one small prediction module using `Game.clone()` and the same fixed step. Copy every future-affecting value, including the RNG, cooldown, flight progress, and combo lineage. Forecasting must never consume live events or future numbers. This is easier to keep correct than analytical collision estimates while the rules remain experimental.

## Evaluation

Does reserve create a useful choice or simply postpone a bad launch? Does showing the next two numbers encourage setting up a chain? Does forecast make blocking comprehensible without solving the entire puzzle for the player? Compare runs with reserve disabled. Check forecast CPU timing with a crowded board before increasing lookahead or adding rules.

## Later milestones

- Balance: measure dead ends, session length, ring congestion, and spawn distribution using local debug tools.
- Replayability: seeded challenges and a compact run/replay format, after the core planning rules settle.
- Shipping: offline asset bundling, device profiling, mobile packaging, native audio/haptics, and releases.

Keep account systems, currencies, cosmetics, and level progression outside this milestone.
