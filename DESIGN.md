# Rimefall — Design Doc

A ~10-minute browser 3D roguelike in frozen ruins, inspired by Old School RuneScape's PvM combat. Pure combat: no story, no skilling, no PvP, no bank.

## Run structure
- 5 rooms, then a Frost Giant boss room.
- Between rooms: pick 1 of 3 rewards (weapon tier upgrade, armor piece, food, or a perk such as faster attacks).
- Room 1: ice wolves (melee, weak to ranged). Room 2: frost mages (magic, weak to melee). Room 3: ice archers (ranged, weak to magic). Rooms 4–5: mixed, with elite variants.
- Boss: Frost Giant. Phases; each phase resists the player's current style, forcing swaps. Attacks: stomps (telegraphed tile AoE) and falling icicles.

## Core rules
- OSRS-style game tick of 0.6 s (600 ms), fixed, decoupled from 60 fps rendering.
- Tile grid. Player moves directly with WASD / left stick, one tile per tick. Diagonals allowed, but not through blocked corners. Rendered meshes interpolate smoothly between tiles across a tick.
- Combat triangle: melee / ranged / magic. Three gear loadouts swapped via 1/2/3 or D-pad; a swap applies on the next tick.
- Weapon attack speeds in ticks: sword 4, bow 3, staff 5. Attacks target the nearest enemy the player is facing.
- No prayers. Defense = dodging telegraphed tile attacks (tiles glow 1–2 ticks before impact) + eating food (costs a tick).

## Controls
| Action | Keyboard | Gamepad (standard mapping) |
|---|---|---|
| Move | WASD | Left stick |
| Attack / interact | Space | A (button 0) |
| Eat | E | X (button 2) |
| Swap gear melee/ranged/magic | 1 / 2 / 3 | D-pad (left/up/right or similar) |
| Pause | Esc | Start (button 9) |

## Look
Chunky low-poly, soft lighting, light fog, snow. Angled OSRS-like camera following the player. Placeholder primitive shapes first; later milestones swap in Tripo-generated low-poly GLB models via a per-entity mesh factory (rendering of each entity type is isolated behind a factory function). Animation is procedural (bobbing, lunges, squash/stretch), no rigging.

## Tech
Plain HTML + ES modules, Three.js from a CDN importmap, no build step. Modules: main.js, tick.js, input.js, world.js, render.js, entities.js (more later).

## Milestones
1. Grid, ticks, movement, controller input, placeholder shapes.
2. Combat with one enemy type.
3. Style triangle, gear swaps, all three enemies.
4. Rooms and loot picks between them.
5. Frost Giant boss.
6. Tripo models + polish.

## Process
All game code is written by DeepSeek-V4.1-Flash (reasoning_effort=max) via API; the director writes specs, tests in headless Chromium, and sends fix requests. Usage logged in ai-log/usage.jsonl.

## Combat rules (as of Milestone 2.1)
- **No lock-on.** The player has an 8-way facing; moving sets it. Pushing toward an enemy-occupied tile (or a wall/pillar on a cardinal) turns without moving. A faint wedge marks the facing tile.
- **Attack** (Space / ✕) is edge-triggered and evaluated on the next tick only. If the weapon is ready, the player swings at the facing tile: an enemy there (cardinal only) gets a hit roll; otherwise it's a whiff. Either way the cooldown is consumed (sword: 4 ticks). A press while on cooldown is discarded (no queueing, no auto-repeat). An attacking tick has no movement.
- **Eat** (E / □) consumes the tick; nextAttack = max(nextAttack, eatTick + 3). Eat beats attack in the same tick.
- **NPC movement (OSRS-naive, no pathfinding):** one step per tick toward the player: diagonal (if the target and both corners are free), else the x step, else the z step, else wait. One NPC per tile; NPCs never enter the player's tile. A diagonal-adjacent NPC steps along one axis to reach a cardinal tile. NPCs get stuck behind pillars (safespots) and line up behind each other.
- **NPC attack cycle:** the telegraph (crouch + glow) is shown on the tick before every attack. On the attack tick the bite rolls only if the player is still cardinally adjacent; otherwise it whiffs. Either way the cooldown is consumed, and the NPC does not move on the following tick. NPCs stand still while the player is in range.
- **Tick order:** 1) player input (eat > attack > move), 2) NPCs act in spawn order (attack if committed, else telegraph/move), 3) deaths and room state. So stepping off on the attack tick makes the bite whiff (OSRS step-off).
- **Numbers:** player 40 HP, defence 12; sword acc 18, max hit 6, speed 4. Ice wolf 12 HP, acc 18, def 15, max hit 5, speed 3. Simulated: stand-and-fight ~57% win, step-off player ~100%.
