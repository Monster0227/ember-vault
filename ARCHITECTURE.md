# Ember Dungeon engine upgrade — 5.5

## Core structure

`engine-core.js` contains `ObjectPool`, `InputQueue`, `HeroFSM`, `Physics`, `sweepAABB`, and `AudioPool`. The same code is embedded at the beginning of `dist/js/ember.js`, preserving file:// operation, the full-unlock iframe, and the existing VM tests. Edit the core source and synchronize the embedded preamble before publishing.

Hero states are grouped into ground (idle/run), air (rise/fall), combat (attack), and control (hurt/dash/roll). Attack entry starts its timeline; frame 2 at 60 Hz emits the weapon/audio event exactly once. The hitbox opens at that event and closes before recovery ends. Roll may cancel an attack after 65% of its duration. A bounded typed-array queue retains attack/roll input for 200 ms; jump retains a 200 ms buffer. Existing skill and enemy state machines remain separate.

Physics receives displacement = velocity × dt, sweeps against solid rectangles, chooses the earliest impact, removes velocity into the normal, and processes up to four sliding contacts. One-way platforms only intersect downward movement from above. The current fall-through platform is excluded until the player's top clears it. Moving platforms carry the rider before the sweep. Ground acceleration/friction is 22/s; airborne input steering is 11/s and drag without input is 2/s. Existing gravity, double jumps, coyote time, pogo and moving/crumbling platforms remain.

The fixed pools preallocate 512 particles and 256 hostile projectiles, drop excess emissions, reclaim expired entries in place, and reset on stage changes. Emission uses positional arguments, not temporary object literals. Audio uses 16 reusable oscillator/gain voices for `beep`; music and specialized boss audio remain on their existing buses. Dash/dodge ghost trails remain enabled.

The static sky gradient is cached using OffscreenCanvas with HTMLCanvasElement fallback, invalidated on biome/size changes. Animated parallax layers remain live.

## Phone and high jumps

Landscape touch mode reserves 132 CSS pixels below the world canvas for controls. Canvas logical height is 420 on touch screens (620 on desktop); width follows the available play area. The camera tracks rising characters vertically. rAF scheduling happens before the frame work, so a transient rendering exception does not permanently cancel the loop (errors are still reported).

## Verification and limitations

- 100 existing gameplay checks pass; assertions expecting instant attack activation now wait through the explicit frame-2 startup.
- `check-core.cjs` checks pool exhaustion/reuse, queue expiration, animation events/cancel timing, sweep walls/corners, one-way landings and fall-through.
- `tests/check-jump-render.cjs` exercises 845 simulation/draw samples across all 13 stages, including y = -800.
- Visible browser: double jump and 740×360 touch layout checked. Actual phone/WebView freeze has not been reproduced; real-device validation is still needed.
- **Strict zero-allocation across the whole main loop is NOT achieved.** Legacy UI strings, geometry arrays/closures, gradients, loot, player-thrown weapons and several effects still allocate. The new queue, sweep scratch and fixed object pool operations reuse memory, but this is not a whole-engine heap/GC certification.
- This is an incremental player engine integration, not a full replacement of every enemy/boss state machine. `HeroFSM` extends `HierarchicalFSM`, whose transitions find the common ancestor, run exit/entry hooks and bubble events to parent states using a reusable path.
- Existing overlap resolution assumes valid non-overlapping starting geometry. Sweeps do not implement a general penetration solver or fully relative moving-solid TOI.

## Development

`integrate-engine.cjs` records the one-time migration from 5.4; it is not an incremental build command. Source for continued work is `dist/` plus `engine-core.js`. Run `node check-core.cjs`, and the gameplay/viewport/render checks under tests/ plus the local music checks before packaging.
