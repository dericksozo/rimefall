Let me plan briefly and then write the files.

Architecture:
- index.html: importmap, canvas container, HUD DOM, overlay for pause, toast, hint. Loads src/main.js.
- style.css: styling.
- src/world.js: SIZE=15, tiles blocked set, pillars list, isWalkable.
- src/tick.js: TickLoop class with accumulator, tick count, alpha, subscribe(cb), pause/resume, update(dt).
- src/input.js: Input class: keyboard listeners, gamepad polling, direction (8-dir snap), actions queue, device tracking, pause immediate callback.
- src/entities.js: createEntityMesh(kind) -> THREE.Group. Player, pillar, wall.
- src/render.js: Renderer class: scene, camera, lights, fog, floor tiles, walls, pillars, snow, player mesh; update(playerState, alpha) interpolate.
- src/main.js: wire everything, game state (player pos, prev pos, facing, move per tick), HUD updates, test hook, resize.

Key details:
- Tick: accumulate dt, TICK_MS=600. Update loop: ticker.update(now); if paused, skip accumulating.
- Alpha for interpolation: alpha = accumulator / TICK_MS, clamped 0..1. Actually we want interpolation from previous tile to current tile: at tick end, player moves from prev to current; the render interpolates prev->current using alpha. When paused, alpha stays at current value? Spec: paused = no ticks. Freeze alpha too (keep last). Fine.

Better: at tick N, the player commits move: prev = old, cur = new. Then over the following tick, render lerps prev->cur. So alpha goes 0..1 as accumulator goes 0..TICK. That means meshes render one tick behind the logical state, which is standard. Test hook player position should return current tile (logical). Fine.

- Movement: each tick, read input.getDirection(); if non-null, compute target; diagonals require target walkable AND both orthogonal neighbours walkable; if valid, move; facing = direction (last attempted direction — set facing even if blocked).

- Input: keyboard keydown/keyup tracking. Directions from held keys combination. Keyboard: W/ArrowUp -> -z (north). Which direction is north? Let's define forward = -z. Map: up (W) => dz=-1, down (S) => dz=+1, left (A) => dx=-1, right (D) => dx=+1. Combine both axes -> diagonal.

- Gamepad: poll every frame in main loop. axes[0], axes[1]; radial deadzone: magnitude > 0.3 -> direction. Snap by angle: 8 sectors; use atan2(ax, -ay) -> angle in radians; index = round(angle / (PI/4)) mod 8. Actually simpler: horizontal sign and vertical sign with deadzone: dx = |ax|>0.3 ? sign(ax) : 0; dz = |ay|>0.3 ? sign(ay) : 0; if both, normalize? That gives 8 dirs but is a square deadzone not radial. Spec says radial deadzone 0.3 and snap by angle 45° sectors. Do: mag = hypot(ax,ay); if mag < 0.3 -> null; else angle = atan2(ax, -ay) (so up = 0), sector = Math.round(angle / (Math.PI/4)), then k = ((sector % 8) + 8) % 8; dirs table index 0 = up (-z) going clockwise: 0: (0,-1), 1: (1,-1), 2: (1,0), 3: (1,1), 4: (0,1), 5: (-1,1), 6: (-1,0), 7: (-1,-1). Correct.

- Device switching: on keydown of a movement key, device = 'keyboard'. On gamepad movement beyond deadzone or button press, device = 'gamepad: ' + id. Direction at tick time: use the current device's direction? Spec: "Buffered movement: at tick time, the direction currently held (latest input device to produce input wins) decides the move." So track direction per device; at tick, if device is keyboard use keyboard dir else pad dir. Hmm, but if gamepad held and keyboard not pressed, device becomes... device only switches when used. Simpler: getDirection() returns direction of the current device; if that's null, could fallback to other device? Spec says latest device wins. I'll do: preferred = current device's direction; if null, use the other device's direction (helps usability), but keep device label as last-used. Actually simpler and matching: return current device dir (fallback to other if null? ambiguous). Keep it: use the most recent non-null input; implement as: if keyboard dir non-null and gamepad dir non-null, use current device. Otherwise use whichever is non-null. That satisfies "latest input device to produce input wins" naturally.

- Action queue: edge-detected presses pushed into an array; main consumes at tick (except pause which is immediate). Also handle pause toggle immediately: input assigns onPause callback.

- Gamepad connect detection: gamepadconnected event -> device? Should show toast and maybe set device to gamepad. Spec: toast on connect. Also polling detection: track pad ids seen; when a new pad appears during polling, treat as connection (toast). Handle gamepaddisconnected. Keep a Set of connected ids. Avoid double toast for both event and polling — poll-based detection can be the single source: each frame, get list of gamepads; compare with known set; new -> connect toast; missing -> disconnect toast. But gamepaddisconnected event is needed for ids. Using poll-only detection is simpler and handles both cases; also listen to events to store id mapping. I'll do: maintain Map from index -> {id}. Each frame, gather gamepads with connected && mapping. Compare to previous set of ids. That covers everything. Also add gamepadconnected listener that just stores id in a map for indices (some browsers). Polling with index key works since id is included in Gamepad object.

- Render:
  - Renderer: WebGLRenderer antialias, shadowMap enabled PCFSoft, outputColorSpace SRGBColorSpace.
  - Scene fog: FogExp2? use THREE.Fog(color, 20, 60). Camera distance 14, pitch ~50°.
  - Camera: offset computed: yaw south-east-ish: camera positioned at player + (dx, dy, dz) where direction toward camera is southeast: x+, z+ (south-east). Let distance=14, pitch=50° from horizontal. Height = 14*sin(50°) ≈ 10.7; horizontal = 14*cos(50°) ≈ 9.0. Yaw 45° => offset x = 9*sin? Let's set camera offset = (h*0.7, height, h*0.7) with h=9 => (6.4, 10.7, 6.4). Look at player position + small height (0.8). Smoothly lerp camera target.
  - Floor: for each tile 0..14, a box geometry 0.96 x 0.12 x 0.96 at y=-0.06 top at 0? Let's have tile top at y=0, box height 0.2 centered at -0.1. Slight per-tile color variation using HSL-ish variation. Flat shading. Grid lines: gap between tiles shows dark base plane below? "thin darker grid lines visible between tiles" — with 0.96 size tiles there's a 0.04 gap; put a dark plane at y=-0.12 beneath to show as grid. Good.
  - Walls: perimeter low walls: for each edge tile, boxes; simpler: 4 long boxes around the room: width 15.5, height 1.2, thickness 0.6 placed at edges. Use createEntityMesh('wall')? Spec says wall kind in factory. Let me build walls via factory: create wall segment group and clone/position. Actually per-tile walls would be 15*4=60 groups; fine but maybe heavy-ish. Better to have a single 'wall' group representing a segment of length 1 and place 4*15 = 60? That's a lot of draw calls (60 groups with a couple meshes each). Acceptable but can reduce: use wall segments along each edge as 15 pieces each -> 60 meshes. Fine for 60fps but let's instead build 4 wall runs using a group with a long box. But requirement: factory kinds include "wall" and entity visuals only from factory. I'll make createEntityMesh('wall') return a group with a 1x1 chunky wall block; and place ~perimeter with fewer: along each side use 15 blocks? Simpler: create one wall mesh per edge tile, 14 per side x 4 = 56. That's fine (each is a box + snow cap = 2 meshes, ~112 draw calls). Add ~15 floor... 225 floor tiles as separate meshes = 225 draw calls. Hmm, could be fine in headless Chromium but let's optimize: floor via InstancedMesh? But per-tile color variation needs instance colors — InstancedMesh supports setColorAt. That's efficient. But code complexity. 225 boxes is fine honestly for a browser; but with shadows on each casting/receiving... floor shouldn't cast shadows (receive only). Let me use InstancedMesh for floor tiles with per-instance color. Keep it compact: geometry BoxGeometry(0.96, 0.2, 0.96), material MeshLambertMaterial({vertexColors? no, instanceColor handled automatically}). Use MeshStandardMaterial flatShading. setColorAt per instance. Shadows: receiveShadow = true. InstancedMesh supports receiveShadow.

Actually simpler and still fine: use a single merged approach? I'll go with InstancedMesh — ~10 lines.

  - Walls: use factory 'wall' but place with instancing? Not via factory then. Requirement 6 says factory for entity visuals. Walls are entities; use factory. 4 walls as long boxes: I can call createEntityMesh('wall') once, then for the 4 sides, clone the group and scale along the length. Group scale x=15 would scale snow cap too, which is okay-ish. Hmm, stretching is fine visually for a wall run. But each clone shares geometry — fine. Let's do: const wallProto = createEntityMesh('wall'); for each side: w = wallProto.clone(); w.scale.set(15,1,1) for north/south, rotate for east/west; position. That gives 4 wall runs, each a box with snow. Clean and cheap. But wall kind's base unit should be 1 tile long. Scaling 15x makes snow stretched but acceptable. Alternatively create separate long walls in factory via param. Keep simple: factory 'wall' returns 1x1.2x0.6 block? Let me design wall as a group with a box geometry 1 x 1.1 x 0.5 with snow cap 1.02 x 0.12 x 0.52 at y=1.1. Then clone & scale x=15 -> box becomes 15 long. Snow cap stretched but fine, looks like a snow ridge.

  Camera needs to see whole room: room spans -0.5..14.5 in world coords if tile centers at (x, z). Let's set world position of tile = (x, z) directly, so room center at 7,7. Camera distance 14 units from player.

  Player mesh world position = lerp(prevTile, curTile) with tile coordinates as world x/z, y=0.

  - Snow particles: BufferGeometry with ~800 points, random within box around center (x/z ±12, y 0..14), material PointsMaterial size 0.08, color white, transparent, opacity 0.8, depthWrite false. Update in render loop: y -= speed*dt; wrap. Add slight x drift.

  - Lights: HemisphereLight(0xcfe8ff, 0x445566, 0.9); DirectionalLight(0xfff4e0, 1.6) at (10, 18, 6) with shadow camera covering the room (ortho -14..14), mapSize 2048, castShadow. Ambient maybe not needed.

  - Sun shadow camera target: set light.target position at room center and add to scene.

  - Tone mapping: ACESFilmic maybe. Keep default? Use renderer.toneMapping = THREE.ACESFilmicToneMapping, exposure 1.0.

  - The player mesh facing: rotation.y = angle from facing vector. Facing dir (dx, dz): mesh forward should be +z or -z? Create player model facing -z? Let's define model's "front" faces +z (e.g., visor on +z side). Then rotation.y = atan2(dx, dz) maps facing (dx,dz) to yaw where local +z goes to that direction. For facing (0,-1) => atan2(0,-1)=π -> model rotates 180°, front faces -z. Good.

  Face changes smoothly: lerp yaw? Simple set with damping using shortest angle. Keep simple: rotate toward target yaw at rate.

  - Step bob: while moving, bob = |sin(progress * PI * 2)| * 0.08? Better: bob = sin(alpha * PI) * 0.12 when moving this tick. Pass moving flag.

- main.js: 
  - setup: scene render via Render, input, ticker.
  - player = {x:7,z:7,prevX:7,prevZ:7,facing:{x:0,z:1}}.
  - tick subscription: consume actions (attack/eat/swap log to console, since not implemented — maybe show toast "Combat not yet implemented"? Spec says do not implement combat. Just log `[rimefall] action: attack`).
  - Movement at tick: dir = input.getDirection(); if dir: facing = dir; try move.
  - HUD update each frame (or on tick) with tick count, tile, input device.
  - Pause overlay toggle via input.onPause callback.
  - Test hook: window.__rimefall = { get tick(){...}, get player(){return {x,z,facing:{...}}} — spec says player -> {x,z,facing}. Facing format: likely string like "north"? Hmm. Safer: facing as {x,z}? Director tests may check facing. Ambiguous. I'll return facing as an object {x,z} plus a string? Can't have both under one key. Provide object {x, z} — no wait. Let me think: "get player() -> {x, z, facing}" — facing likely a direction vector or a name. I'll provide facing as {x, z} object since it's directional vector and easy to test, and add `facingName` maybe. Hmm, a test might do player.facing.x? Could be. Or might compare to string. To hedge, I can return facing as object but... Actually I could make facing object with a toString? That's hacky. I'll do facing: {x:.., z:..} and also player.facingName: 'north' etc. Also maybe make `facing` object include `toString()`. Simpler: return facing as {x, z}. Hmm risk. Many such specs use facing as a vector. I'll go with vector object.

  Wait—maybe safer: return facing as a string like "south-east"? Tests written by a director checking "facing" would need to know the format from the code. They test by reading state; ambiguity is a risk either way. Vector {x,z} is most common. Provide both: get player() returns {x, z, facing: {x,z}, facingName}. Good.

  - window.__rimefall also: get inputDevice(), get paused(), isWalkable(x,z), blockers. blockers as array of {x,z}.
  - console.log('[rimefall] ready') once first frame rendered (after first renderer.render call). Use a flag, log in requestAnimationFrame after render.

  - Resize handling in render.js.

- Pause: Ticker.paused toggles; alpha frozen. Also when paused, still render (snow maybe pause too? keep snow animating or freeze; simplest: keep rendering and snow animating, but ticks stop). Show overlay.

Input details:
- keydown: prevent default for arrows/space; ignore repeats for actions; movement uses held set. On any keydown -> device keyboard and mark lastKeyboardTime.
- Esc keydown edge -> pause callback immediately (not queued).
- Space/E/1/2/3 -> queue actions.
- Gamepad buttons edge detection: previous button states array per pad; on press (pressed && !prev), queue action (+ set device). Buttons: 0 attack, 2 eat, 12 swap1, 14 swap2, 15 swap3, 9 pause. Wait spec: "D-pad 14/12/15 = swap gear 1/2/3". So 14→swap1, 12→swap2, 15→swap3. Yes odd but follow spec.
- For pause from gamepad, call onPause immediately on edge.
- Polling must run each frame: input.pollGamepads() called from main loop before ticker update. Handle connect/disconnect detection inside poll.
- getDirection: returns {x,z} or null.

Gamepad id formatting: device string "gamepad: <id>" where id is gamepad.id (long string) — fine.

Toast management in main.js: showToast(text, ms) sets DOM text and adds class visible, clear timeout.

Now the player mesh needs to face and be positioned; render.js stores this.playerMesh. Render.update({x,z}, alpha, moving, facing) or pass state object from main. I'll have render.setPlayerTiles? Simpler: render.update(dt, playerState, alpha, moving) where playerState has prevX, prevZ, x, z, facing. Compute interpolation: px = lerp(prevX, x, alpha). Also extrapolation issue: on first tick alpha=0 shows prev = spawn = same. fine.

Camera follows the interpolated player position smoothly: camTarget.lerp(desired, 1 - exp(-dt*8)).

Snow update in render.update with dt real (not paused? snow keeps falling when paused — fine, or freeze; keep falling).

Render also needs to update HUD? no, main does.

World layout: 15x15, walls at edges are impassable: isWalkable returns x>=1 && x<=13 && z>=1 && z<=13 (interior) and not in blockers. Hmm, but spec says tile coords 0..14, boundary impassable. Floor should cover 0..14. Walls sit on the boundary ring at y. Good.

Blockers: 6 pillars + 1 two-tile broken wall = 8 blocked tiles, deterministic. Avoid spawn (7,7) and its 8 neighbours.
Choose: pillars at (3,3), (11,3), (3,11), (11,11), (7,3)? that's near spawn column but not neighbour. Let's ensure no blocked tile within Chebyshev distance 1 of (7,7): forbidden x,z in 6..8 & 6..8.
Pillars: (3,3), (11,4), (4,11), (11,11), (5,7), (9,9)? Check (5,7) fine. Broken wall two tiles: (6,10),(7,10)? not near spawn (dist z 3). Fine.
Let's pick:
pillars: [{x:3,z:3},{x:11,z:3},{x:3,z:11},{x:11,z:11},{x:5,z:7},{x:9,z:2}]
broken wall: [{x:9,z:10},{x:10,z:10}]
Hmm keep away from spawn radius 2: (5,7) is 2 away, fine. (9,10) is 3 away.
Blockers list = array of {x,z,type}. Export `blockers` (list of tiles) and maybe `pillars`, `brokenWall`. Spec: "Export isWalkable(x,z) and the list of blockers." blockers used in test hook as list; likely array of {x,z}. I'll export blockers as array of {x, z, kind} objects; test hook exposes same. isWalkable handles bounds & blockers.

Also render needs to know pillar positions to place meshes: export pillars, brokenWall too.

Create floor only for 0..14 including boundary (so under walls there's floor). Walls placed on boundary ring centers (x=0 etc.).

Entity factory:
createEntityMesh('player'): group:
 - body: BoxGeometry(0.55,0.7,0.38) blue tunic, y=0.55
 - head: IcosahedronGeometry? chunky low-poly sphere: SphereGeometry(0.22, 6, 5) flat shading, skin color, y=1.05
 - helmet: ConeGeometry(0.26,0.25,6) y=1.22 icy blue + maybe a cap Band? keep simple.
 - arms: two boxes 0.14x0.45x0.16 at ±0.36, y=0.6, tunic color.
 - legs: two boxes 0.18x0.3x0.2 at ±0.14, y=0.2, dark.
 - a small nose/visor? Add a small box on front (+z) 0.1x0.06x0.06 at y=1.05,z=0.22 for facing readability.
 All meshes castShadow. Use MeshStandardMaterial flatShading true.

createEntityMesh('pillar'): octagonal column: CylinderGeometry(0.34,0.4,1.6,8) icy stone, y=0.8; snow cap: CylinderGeometry(0.36,0.38,0.14,8) white at y=1.65; maybe broken top: slight rotation of top? Add a chipped chunk: small box at top offset. Keep 2-3 meshes.

createEntityMesh('wall'): box 1 x 1.1 x 0.5 stone bluish + snow cap box 1.02 x 0.1 x 0.54 at y=1.15, plus irregularity via a couple of smaller boxes? Keep simple.

But wall runs scaled 15x in x. If proto positioned with center at origin, then placing at (7, 0.55, -0.25)? Wall at north edge z=0: place at z=0 (tile center), size z 0.5 -> occupies z -0.25..0.25 which is on the boundary tile. Fine. Scale x 15 => spans x -0.5..14.5 if positioned at x=7. Good. y offset 0: proto's boxes are above y=0.

For east/west: rotate y by π/2 then scale.x=15 -> since scale applied in local space before rotation, works: group.scale.set(15,1,1), group.rotation.y = Math.PI/2, position (0, 0, 7). Good.

But careful: when cloning and setting scale, group children positions are local so scaling stretches the whole run. Good.

Floor tiles: instanced mesh; also a base dark plane at y=-0.14 size 15.2x15.2 (grid line color). Tiles at y=-0.08 with height 0.18 => top at 0.01? Let's: tile box height 0.18, center y=-0.09 => top at 0, bottom -0.18. Base plane at y=-0.17 (dark). Gap 0.04 between tiles shows dark plane below. But with 0.96 tile size, gap of 0.04. Base plane at y=-0.17 is below tile bottoms (-0.18)? Set base y=-0.16. Tiles bottom -0.18 below plane; plane visible in gaps at -0.16 which is above tile bottom, fine, seen through gaps. Grid lines visible. Good. Use base box thickness 0.1? Plane is fine but may z-fight? No overlap.

Actually the player's feet at y=0 on top of tiles. Good.

Snow points y range 0..14, x/z -2..16 or around room. Fine.

Camera: use PerspectiveCamera(48, aspect, 0.1, 200). Offset relative to target: (6.5, 10.5, 6.5) gives pitch atan(10.5/9.19)=48.8°, distance sqrt(10.5²+9.19²)=13.95 ≈14. Good.

Camera smoothing: camPos.lerp(desired, 1-exp(-8*dt)); camera.position.copy(camPos); camera.lookAt(lookTarget lerped similarly). Use a single follow target that lerps toward player pos.

Renderer resize: window resize -> set size, camera aspect.

Main loop:
```
let last = performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min((now-last)/1000, 0.1); last = now;
  input.pollGamepads();  // uses performance; edge detection
  ticker.update(now);    // handles pause
  const p = player;
  const alpha = ticker.alpha;
  render.update(dt, p, alpha, movingFlag);
  updateHUD();
  render.render();
  if(!ready){ready=true; console.log('[rimefall] ready');}
}
```
ticker.update(now) internally accumulates: keep lastTime; if paused return; dt = now - lastTime; lastTime = now; acc += dt; while acc >= TICK_MS: acc -= TICK_MS; tick++; run callbacks. alpha = acc/TICK_MS. On unpause reset lastTime to now to avoid jump. Also clamp dt to avoid spiral (max 5 ticks per update).

Important: alpha semantics — after tick executes, player already at new tile, alpha starts near 0. Render interpolates prev->cur. Since prev/cur set at tick time, at alpha ~1 just before next tick the player is at cur. Good.

But when paused, alpha frozen mid-way — player frozen between tiles. Acceptable, or snap to cur on pause? Keep frozen; visually fine.

Movement flag for bob: set `moving = true` when last tick moved; reset? Track `player.movedThisTick`. Bob based on alpha: while moving, bob = |sin(alpha*PI)| * 0.1. When idle, 0. Fine, and bob resets each tick.

Facing rotation: target yaw = atan2(facing.x, facing.z). Damped: compute shortest diff and apply factor 1-exp(-12*dt).

Now HUD:
Title "RIMEFALL" maybe; panel with Tick, Tile, Input. Controls hint bottom-left. Pause overlay centered "PAUSED".

Toast top-center.

Test hook isWalkable must be exported function from world.js. main imports.

Input device changes: device string set when keyboard movement key pressed or any action key; when gamepad activity: stick beyond deadzone or any button press.

Detect gamepads appearing via polling: keep map prevPads: Map(index -> id). Each poll: for each pad index 0..3 (getGamepads returns 4 slots), if gp && gp.connected: compare id with prev index; if different -> onConnect(id); Also if a pad index disappears -> onDisconnect(id). Since indices can shuffle, compare by id sets. Use Set of ids seen. newIds - oldIds -> connect; old - new -> disconnect. That handles index changes.

Also add listeners gamepadconnected/disconnected just to trigger an immediate poll (harmless) — but avoid double toasts by relying on set comparison which is idempotent per frame. If poll runs each frame, event listeners unnecessary; but spec asks to listen. I'll add listeners that record `pendingPoll = true` and store id for connect; but the set comparison would also fire. To avoid duplicates, keep it simple: listeners only log to console.debug? Spec: "Listen to gamepadconnected/gamepaddisconnected and also detect gamepads that appear via polling". I'll add listeners that call this.pollGamepads() immediately; the set-based detection prevents duplicates.

Pad state tracking for edges: prevButtons Map(index -> boolean[]). On poll for each pad: for each button index we care, pressed = gp.buttons[i]?.pressed; edge if pressed && !prev[i]. Need per-pad prev state; key by index. When pads shuffle, minor issue but fine.

Actions: this.actions = [] queue; consumeActions() returns and clears? Main consumes at tick: `for (const a of input.consumeActions())`. Ticks happen possibly multiple per frame; consume once per tick. Fine.

Actions thrown away when paused? Queue accumulates; on unpause, actions fire at next tick. Spec: pause applies immediately; queued actions consumed next tick. Acceptable.

Eat/swap/attack when not implemented: main logs console.log('[rimefall] action:', a) and maybe toast? Avoid toasts spam. Just log debug. Note "no console errors" — console.log fine.

Escape key: browsers may use it; keydown preventDefault for Escape in game? Fine.

Gamepad Start button 9 escape: edge -> togglePause immediately.

Now style.css: dark translucent panels, yellow text (#ffcc55), pixel-ish font stack: "Courier New", monospace? Use font-family: ui-monospace, "Courier New", monospace; image-rendering for text not needed. Chunky borders: 2px solid #6b5a2a? Add box-shadow inset.

HUD element IDs: #hud with spans #hud-tick, #hud-tile, #hud-input; #pause-overlay; #toast; #hint; #loading maybe.

index.html: canvas appended by renderer to #app div. Add `<div id="app"></div>` plus overlays. Importmap + module script src="./src/main.js".

Let's also guard: if WebGL fails? Not needed.

Prevent context menu? Not needed.

Focus: keyboard events on window so fine.

Let me now write the code carefully but compactly.

tick.js:

```js
export const TICK_MS = 600;
export class Ticker {
  constructor(tickMs = TICK_MS) {
    this.tickMs = tickMs;
    this.tick = 0;
    this.acc = 0;
    this.alpha = 0;
    this.paused = false;
    this.lastTime = 0;
    this.callbacks = [];
    this._now = null;
  }
  subscribe(fn) { this.callbacks.push(fn); return () => {...}; }
  setPaused(v) { if (this.paused === v) return; this.paused = v; if (!v) { this.lastTime = this._now ?? performance.now(); } }
  update(now) {
    this._now = now;
    if (this.lastTime === 0) { this.lastTime = now; this.alpha = 0; return; }
    if (this.paused) { this.lastTime = now; return; }
    let dt = now - this.lastTime;
    this.lastTime = now;
    if (dt > this.tickMs * 5) dt = this.tickMs * 5; // avoid spiral
    this.acc += dt;
    let guard = 0;
    while (this.acc >= this.tickMs && guard++ < 5) {
      this.acc -= this.tickMs;
      this.tick++;
      for (const cb of this.callbacks) cb(this.tick);
    }
    this.alpha = Math.min(1, this.acc / this.tickMs);
  }
}
```
Caveat: when paused, alpha frozen at last value — fine. When unpause, lastTime reset.

But the first call alpha = 0 and lastTime set; render with alpha 0 shows prev tile = spawn. fine.

input.js:

```js
const KEY_DIRS = { KeyW:[0,-1], ArrowUp:[0,-1], KeyS:[0,1], ArrowDown:[0,1], KeyA:[-1,0], ArrowLeft:[-1,0], KeyD:[1,0], ArrowRight:[1,0] };
const ACTION_KEYS = { Space:'attack', KeyE:'eat', Digit1:'swap1', Digit2:'swap2', Digit3:'swap3' };
const DEADZONE = 0.3;
const PAD_DIRS = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
const PAD_ACTIONS = { 0:'attack', 2:'eat', 14:'swap1', 12:'swap2', 15:'swap3' };
const PAD_PAUSE = 9;

export class Input {
  constructor({ onPause, onToast } = {}) {
    this.onPause = onPause || (()=>{});
    this.onToast = onToast || (()=>{});
    this.device = 'keyboard';
    this.keys = new Set();
    this.actions = [];
    this.padIds = new Map(); // index -> id
    this.padButtons = new Map(); // index -> bool[]
    this.padDir = null;
    this.padActiveId = null;
    this.connectedIds = new Set();
    this._onKeyDown = ...;
    window.addEventListener('keydown', ...);
    window.addEventListener('keyup', ...);
    window.addEventListener('blur', () => this.keys.clear());
    const gp = (e) => this.pollGamepads();
    window.addEventListener('gamepadconnected', gp);
    window.addEventListener('gamepaddisconnected', gp);
  }
```

Handle keydown:
```
if (e.code === 'Escape') { if (!e.repeat) { this.setDevice('keyboard'); this.onPause(); } e.preventDefault(); return; }
if (e.repeat) { if (KEY_DIRS[e.code]) { this.setDevice('keyboard'); e.preventDefault(); } return; }
if (KEY_DIRS[e.code]) { this.keys.add(e.code); this.setDevice('keyboard'); e.preventDefault(); return; }
const a = ACTION_KEYS[e.code];
if (a) { this.actions.push(a); this.setDevice('keyboard'); e.preventDefault(); }
```
keyup: keys.delete(e.code).

keyboardDir(): both axes from keys.
```
let dx=0,dz=0;
for (const code of this.keys){ const d=KEY_DIRS[code]; if(!d) continue; dx+=d[0]; dz+=d[1]; }
dx = Math.sign(dx); dz = Math.sign(dz);
return (dx||dz) ? {x:dx,z:dz} : null;
```

pollGamepads:
```
const pads = navigator.getGamepads ? navigator.getGamepads() : [];
const seen = new Set();
for (let i=0;i<pads.length;i++){
  const gp = pads[i];
  if (!gp || !gp.connected) { this.padButtons.delete(i); continue; }
  seen.add(gp.id);
  if (!this.connectedIds.has(gp.id)) { this.connectedIds.add(gp.id); this.onToast('🎮 Controller connected: ' + gp.id, 'connect'); }
  // stick
  const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
  const mag = Math.hypot(ax, ay);
  let dir = null;
  if (mag >= DEADZONE) {
    const ang = Math.atan2(ax, -ay);
    const sector = ((Math.round(ang / (Math.PI/4)) % 8) + 8) % 8;
    dir = { x: PAD_DIRS[sector][0], z: PAD_DIRS[sector][1] };
    this.setDevice('gamepad: ' + gp.id);
  }
  if (i === this.activePadIndex || !this.padDirOwner) ... 
```
Hmm multiple pads. Keep it simple: the first connected pad drives direction (or last active). Use: if no activePadSet or activePadIndex's pad is gone, choose this index. Simpler: gather dir from first pad with stick beyond deadzone; store this.padDir. For buttons, scan all pads and edge-detect using padButtons per index.

But direction must persist while stick held. Let's compute `this.padDir` fresh each poll from any pad's stick (first pad with direction). Since poll runs every frame, direction persists automatically from the axes.

Edge buttons per pad index:
```
let prev = this.padButtons.get(i);
if (!prev) { prev = new Array(gp.buttons.length).fill(false); this.padButtons.set(i, prev); }
for (const [bi, action] of Object.entries(PAD_ACTIONS)) { const idx=+bi; const pressed = !!gp.buttons[idx]?.pressed; if (pressed && !prev[idx]) { this.actions.push(action); this.setDevice('gamepad: '+gp.id); } prev[idx]=pressed; }
const pausePressed = !!gp.buttons[PAD_PAUSE]?.pressed; if (pausePressed && !prev[PAD_PAUSE]) { this.setDevice(...); this.onPause(); } prev[PAD_PAUSE]=pausePressed;
```
Careful with old prev arrays when button count changes — fine.

Also should set device on button press even if action is attack etc. Yes.

Disconnect detection after loop: for each id in connectedIds, if !seen.has(id) -> delete & toast 'Controller disconnected'. But seen only includes pads present. Also clean padButtons for removed indices? Minor.

getDirection():
```
const kb = this.keyboardDir();
const pad = this.padDir;
if (this.device.startsWith('gamepad')) return pad || kb;
return kb || pad;
```
Wait, if device is gamepad but stick returns to neutral while keyboard held, fallback kb -> moves. Fine.

consumeActions(){ const a=this.actions; this.actions=[]; return a; }

setDevice(d){ if (this.device !== d) { this.device = d; } this.padDir? no }

Note: for keyboard, device should only change to keyboard on actual key use. setDevice called on keydown.

One issue: this.padDir should reset to null if no pad direction — set each poll: this.padDir = padDir.

Device label for HUD: "keyboard" or "gamepad: <id>".

World.js:

```js
export const ROOM_SIZE = 15;
export const MIN = 0, MAX = 14;
export const SPAWN = { x: 7, z: 7 };
export const pillars = [ {x:3,z:3}, ... ];
export const brokenWall = [ {x:9,z:10}, {x:10,z:10} ];
export const blockers = [ ...pillars.map(p=>({...p,kind:'pillar'})), ...brokenWall.map(...) ];
const blocked = new Set(blockers.map(b=>`${b.x},${b.z}`));
export function isWalkable(x,z){ if(!Number.isInteger(x)||!Number.isInteger(z)) return false; if (x<1||x>13||z<1||z>13) return false; return !blocked.has(`${x},${z}`); }
export function inRoom(x,z){...}
export function tileToWorld? not needed
```

Wait: isWalkable(0,...) false due to boundary; test hook expects false at boundary presumably.

Pillar at (9,2)? Let's finalize layout:
pillars: (3,3),(11,3),(3,11),(11,11),(5,7),(9,5)? Ensure not near spawn within Chebyshev 1: (9,5) fine? diff (2,-2) -> still not adjacent. OK. Also avoid blocking paths too much. Broken wall vertical at (9,10),(10,10) horizontal? Just place (9,10),(9,11)? (9,11) adjacent to pillar? no. Let's use broken wall tiles (9,9),(10,9). Check not adjacent to spawn: (9,9) diff (2,2) fine.

Final:
pillars: {3,3},{11,3},{3,11},{11,11},{5,7},{9,4}
brokenWall: {9,9},{10,9}

entities.js:

```js
import * as THREE from 'three';

const MAT = (color, opts={}) => new THREE.MeshStandardMaterial({ color, flatShading:true, roughness:0.9, metalness:0.05, ...opts });

function box(w,h,d,color,x=0,y=0,z=0){ const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), MAT(color)); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; return m; }

export function createEntityMesh(kind) {
  const g = new THREE.Group();
  if (kind === 'player') { ...build... }
  else if (kind === 'pillar') {...}
  else if (kind === 'wall') {...}
  else throw new Error(...)
  g.userData.kind = kind;
  return g;
}
```

Player parts:
body = box(0.56,0.66,0.36,0x3b6fd4, 0,0.62,0)
belt? box(0.58,0.1,0.38,0x2a3a55,0,0.32,0)
head = new THREE.Mesh(new THREE.SphereGeometry(0.21,7,5), MAT(0xe8c39a)); y=1.1
helmet = new THREE.Mesh(new THREE.ConeGeometry(0.26,0.28,7), MAT(0xbcd9ef)); y=1.28
visor/front marker: box(0.1,0.07,0.08, 0x223344, 0, 1.1, 0.2) facing +z
arms: box(0.14,0.44,0.16,0x345fbb, ±0.35,0.6,0)
legs: box(0.18,0.32,0.2,0x2f3f5c, ±0.13,0.16,0)
shield maybe: box(0.1,0.36,0.34, 0x8fb8d8, -0.4,0.62,0)? Adds OSRS vibe. Fine.

Pillar:
base = cylinder(0.42,0.46,0.18,8) at y=0.09 color 0x8fa8bd
shaft = cylinder(0.32,0.38,1.5,8) at y=0.9, rotation.y random? deterministic; add slight tilt rotation.z = 0.04
snow = cylinder(0.34,0.4,0.16,8) white at y=1.68, plus small cone? Add broken chunk box on top offset.
Colors: icy stone 0x9fb6cb, snow 0xf2f8ff.

Wall:
box(1.0,1.0,0.5, 0x8ea6bb, 0,0.5,0); snow cap box(1.02,0.12,0.54,0xf2f8ff, 0,1.06,0); a couple darker blocks? keep 2 meshes. Maybe add base trim.

Note castShadow for all.

render.js:

```js
import * as THREE from 'three';
import { createEntityMesh } from './entities.js';
import { ROOM_SIZE, MIN, MAX, pillars, brokenWall, isWalkable } from './world.js';

export class Render {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias:true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbcd6e8);
    this.scene.fog = new THREE.Fog(0xbcd6e8, 22, 46);

    this.camera = new THREE.PerspectiveCamera(48, innerWidth/innerHeight, 0.1, 200);
    this.camOffset = new THREE.Vector3(6.7, 10.6, 6.7);
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this.follow = new THREE.Vector3(7, 0, 7);  // smoothed player position
    this._initLights(); this._initFloor(); this._initRoom(); this._initEntities(); this._initSnow();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }
```

_initLights: hemisphere(0xeaf4ff, 0x3d4a5a, 0.9); dir light 0xfff6e0 intensity 2.2 position (8,16,6)... shadow camera bounds -13..13, near 1 far 45, mapSize 2048, bias -0.0005, normalBias 0.02. Target 7,0,7 added.

With ACES tone mapping and intensities, tune: hemi 1.0, dir 2.0.

_initFloor:
- base dark plane: Mesh(PlaneGeometry(15.6,15.6), MeshStandardMaterial({color:0x2c4257, roughness:1})), rotation.x=-PI/2, y=-0.15. receiveShadow.
- tiles: InstancedMesh(BoxGeometry(0.94,0.18,0.94), MeshStandardMaterial({flatShading:true, roughness:0.95}), 15*15). Position (x, -0.09, z). Colors: pale blue-white varied: base HSL around 0.58 hue, lightness 0.78-0.88. Use color.setHSL(0.56 + rand*0.03, 0.18 + rand*0.12, 0.78 + rand*0.1). Deterministic random via mulberry32 seed.
- tile receiveShadow true.
- Also maybe slight per-tile rotation? no.

Actually InstancedMesh with instanceColor requires material with vertexColors? No: instanceColor is automatically used when set; three handles it via USE_INSTANCING_COLOR. Yes, setColorAt works with MeshStandardMaterial.

_initRoom: walls:
```
const proto = createEntityMesh('wall');
const sides = [
 {pos:[7,0,0], rot:0},
 {pos:[7,0,14], rot:0},
 {pos:[0,0,7], rot:Math.PI/2},
 {pos:[14,0,7], rot:Math.PI/2},
];
for (const s of sides){ const w = proto.clone(); w.position.set(...); w.rotation.y = s.rot; w.scale.set(15,1,1); this.scene.add(w); }
```
Hmm scale 15 also scales y? no, set(15,1,1). But snow cap box scaled in x only — fine. Shadows from walls: each clone casts; shadow camera covers room edge partly. Fine.

Also pillars & broken wall:
```
for (const p of pillars){ const m = createEntityMesh('pillar'); m.position.set(p.x,0,p.z); m.rotation.y = ((p.x*7+p.z*13)%8)*(Math.PI/4); this.scene.add(m); }
for (const b of brokenWall){ const m = createEntityMesh('wall'); m.position.set(b.x,0,b.z); m.scale.set(1,0.7,1); m.rotation.y = Math.PI/2; this.scene.add(m); }
```
Wait broken wall tile: wall block 1x0.5 occupies z half? For a broken wall inside the room occupying 1 tile, use rotate? A wall block thickness 0.5 along z, length 1.0 along x. Rotating π/2 makes it along z. For two tiles at (9,9),(10,9) side by side in x, don't rotate: each 1.0 long along x, adjacent => forms 2-tile wall. Good, no rotation. Scale y 0.7 for "broken" lower height.

Player mesh: this.playerMesh = createEntityMesh('player'); scene.add.

_initSnow:
```
const N = 900;
positions Float32Array; speeds array
x in [-2, 16], y [0,14], z [-2,16]
PointsMaterial({color:0xffffff, size:0.14, transparent:true, opacity:0.85, depthWrite:false, sizeAttenuation:true})
```
Keep speeds in Float32Array.

resize: camera.aspect, updateProjectionMatrix, renderer.setSize.

update(dt, player, alpha, moving):
```
const ix = THREE.MathUtils.lerp(player.prevX, player.x, alpha);
const iz = THREE.MathUtils.lerp(player.prevZ, player.z, alpha);
this.follow.lerp(new Vector3(ix,0,iz), 1 - Math.exp(-10*dt));
const bob = moving ? Math.sin(alpha*Math.PI) * 0.12 : 0;
this.playerMesh.position.set(ix, bob, iz);
// facing rotation
const targetYaw = Math.atan2(player.facing.x, player.facing.z);
... shortest
this.playerMesh.rotation.y += diff * (1 - Math.exp(-14*dt));
// camera
const desired = follow + camOffset; smooth camPos
```
Camera follow should be smooth: this.camPos.lerp(desired, 1-exp(-6*dt)) but if lerp factor based on dt. Use a separate camPos vector initialized at first update. Initialize camPos = follow + offset in constructor. Then:
```
const desired = tmp.copy(this.follow).add(this.camOffset);
this.camPos.lerp(desired, 1 - Math.exp(-7*dt));
this.camera.position.copy(this.camPos);
this.camLook.lerp(tmp2.set(this.follow.x, 0.9, this.follow.z), 1 - Math.exp(-10*dt));
this.camera.lookAt(this.camLook);
```
Hmm follow lerp plus camPos lerp double smoothing; maybe just camPos smoothing with lookAt directly at player. Simpler: follow = lerp of player pos (fast, 1-exp(-12dt)); camPos lerp to follow+offset (1-exp(-7dt)); camLook copy follow + y 0.8. Fine.

Initial camera at spawn: in constructor set follow (7,0,7), camPos = follow + offset, camLook = (7,0.8,7).

Snow update:
```
const pos = this.snow.geometry.attributes.position;
for (let i=0;i<count;i++){ let y = pos.getY(i) - speeds[i]*dt; if (y<0) { y += 14; } pos.setY(i, y); }
pos.needsUpdate = true;
```
900 points per frame is fine. Could add wind drift x.

render(): this.renderer.render(scene, camera).

Player facing rotation initialization to face south (0,1) -> yaw 0 (model front +z). Good.

main.js:

```js
import { Ticker, TICK_MS } from './tick.js';
import { Input } from './input.js';
import * as world from './world.js';
import { Render } from './render.js';

const hud = {...};
const player = { x: world.SPAWN.x, z: world.SPAWN.z, prevX:..., prevZ:..., facing: {x:0,z:1}, moved:false };
const ticker = new Ticker();
let toastTimer = 0;

function showToast(text, ms=3000){ const el = document.getElementById('toast'); el.textContent = text; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>el.classList.remove('visible'), ms); }

const input = new Input({ onPause: togglePause, onToast: (msg)=>showToast(msg) });

function togglePause(){ setPaused(!ticker.paused); }
function setPaused(v){ ticker.setPaused(v); document.getElementById('pause-overlay').classList.toggle('visible', v); }

ticker.subscribe((t) => {
  for (const a of input.consumeActions()) { if (a==='attack'||a==='eat'||a.startsWith('swap')) console.log('[rimefall] action queued for later milestone:', a); }
  const dir = input.getDirection();
  player.moved = false;
  if (dir) {
    player.facing = { x: dir.x, z: dir.z };
    tryMove(dir.x, dir.z);
  }
});
```
Wait consume actions: attack might consume tick later; not now.

tryMove:
```
const nx = player.x + dx, nz = player.z + dz;
let ok = world.isWalkable(nx, nz);
if (ok && dx !== 0 && dz !== 0) {
  ok = world.isWalkable(player.x + dx, player.z) && world.isWalkable(player.x, player.z + dz);
}
if (!ok) return;
player.prevX = player.x; player.prevZ = player.z; player.x = nx; player.z = nz; player.moved = true;
```
Hmm: when not moving, prevX should equal x so interpolation doesn't glide backwards! Important: if we don't update prev on non-move ticks, then next move sets prev=current (correct) and at tick time interpolation from old prev to new current. But render uses prev→cur each tick; if no move, prev stays from last move (two tiles away?) No: after a move, prev = old pos, cur = new. On subsequent no-move ticks, prev remains the older tile, and render would interpolate from prev to cur again during the next tick — but alpha starts at 0, so first frame shows prev (old tile!) causing a backward jump, then glides forward again. Bad. Fix: at the start of each tick, set prevX/prevZ = x/z. Then if move happens, prev is the old position and cur new. If no move, prev==cur. So in tick callback: `player.prevX = player.x; player.prevZ = player.z;` before attempting move. Then tryMove only updates x/z. Good.

Initial: prev = spawn.

Moving flag for bob: moved this tick. But bob driven by alpha only means at alpha 0 bob 0 and returns to 0 at alpha 1 — a nice step arc. If next tick no move, moving=false, bob 0. Good.

Tick callbacks also need actions consumed even if paused? Not run when paused.

HUD update each frame:
```
hud.tick.textContent = ticker.tick;
hud.tile.textContent = `(${player.x}, ${player.z})`;
hud.input.textContent = input.device;
```
Only update text when changed to avoid layout churn? Fine either way; set only when changed for perf.

Render update call:
```
render.update(dt, player, ticker.alpha, player.moved);
```
But player.moved flips false when a tick runs without movement; between ticks it stays. Fine.

Also alpha when paused stays; moving bob stays mid-motion — fine.

Ready log: after first renderer.render; use flag.

Test hook:
```
window.__rimefall = {
  get tick(){ return ticker.tick; },
  get player(){ return { x: player.x, z: player.z, facing: { x: player.facing.x, z: player.facing.z }, facingName: nameOf(player.facing) }; },
  get inputDevice(){ return input.device; },
  get paused(){ return ticker.paused; },
  isWalkable: (x,z)=>world.isWalkable(x,z),
  blockers: world.blockers,
};
```
Hmm "blockers" maybe expect array of {x,z}. Ours have kind extra, fine.

Also could expose alpha. Not required but harmless. Keep minimal plus maybe get alpha.

facingName helper mapping.

Also handle player possibly expected to include prev? no.

Also add `window.__rimefall.version`.

Edge case: Esc pause immediate on keydown, and `onPause` toggles. Ensure pause overlay element exists.

Also gamepad pause toggles via onPause.

Keyboard Escape might exit pointer lock etc; fine.

Also add `document.addEventListener('visibilitychange')`? Not needed.

Potential issue: keydown for Space scrolls; preventDefault.

Headless Chromium: Fonts fine. `navigator.getGamepads` exists.

Another detail: window blur clears keys (prevent stuck movement).

Also prevent arrow key scrolling via preventDefault.

For "toast" on disconnect: id not available after disconnect using set diff (we know the id). Good: showToast('Controller disconnected').

Spec says toast text "🎮 Controller connected: <id>" and "Controller disconnected". Fine.

Now CSS.

```css
* { box-sizing: border-box; }
html, body { margin:0; height:100%; overflow:hidden; background:#0b1620; font-family: ui-monospace, "Courier New", monospace; color:#ffd257; }
#app { position:fixed; inset:0; }
#app canvas { display:block; }
#hud { position:fixed; top:12px; left:12px; padding:10px 12px; background: rgba(10,18,26,.78); border:2px solid #7a5c1e; border-radius:4px; box-shadow: 0 0 0 2px rgba(0,0,0,.5), inset 0 0 12px rgba(0,0,0,.6); font-size:13px; line-height:1.5; letter-spacing:.4px; min-width: 210px; user-select:none; }
#hud .title { color:#ffb347; font-weight:bold; letter-spacing:2px; margin-bottom:4px; text-shadow: 1px 1px 0 #000; }
#hud .row { display:flex; justify-content:space-between; gap:14px; }
#hud .k { color:#9fb6c9; }
#hud .v { color:#ffe08a; }
#hint { position:fixed; left:12px; bottom:12px; ... }
#toast { position:fixed; top:16px; left:50%; transform:translate(-50%,-12px); opacity:0; transition: opacity .25s, transform .25s; background:rgba(10,18,26,.9); border:2px solid #7a5c1e; padding:8px 14px; color:#ffe08a; border-radius:4px; pointer-events:none; font-size:13px; max-width:70vw; text-align:center; }
#toast.visible { opacity:1; transform:translate(-50%,0); }
#pause-overlay { position:fixed; inset:0; display:none; place-items:center; background:rgba(4,10,16,.55); backdrop-filter: blur(2px); z-index:10; }
#pause-overlay.visible { display:grid; }
#pause-overlay .box { font-size:42px; letter-spacing:8px; color:#ffd257; text-shadow: 3px 3px 0 #000, 0 0 24px rgba(255,200,80,.35); border:3px double #a8792a; padding: 18px 42px; background: rgba(8,14,20,.85); }
```
Also a subtle vignette? skip.

index.html includes HUD markup:
```html
<div id="app"></div>
<div id="hud">
  <div class="title">RIMEFALL</div>
  <div class="row"><span class="k">Tick</span><span class="v" id="hud-tick">0</span></div>
  <div class="row"><span class="k">Tile</span><span class="v" id="hud-tile">(7, 7)</span></div>
  <div class="row"><span class="k">Input</span><span class="v" id="hud-input">keyboard</span></div>
</div>
<div id="hint">
  <b>WASD</b> move · <b>Space</b> attack · <b>E</b> eat · <b>1/2/3</b> gear · <b>Esc</b> pause<br>
  <span>Gamepad: left stick move · A attack · X eat · D-pad swap · Start pause</span>
</div>
<div id="toast"></div>
<div id="pause-overlay"><div class="box">PAUSED</div></div>
<script type="importmap">...</script>
<script type="module" src="./src/main.js"></script>
```

Pointer-events none for hud/hint? HUD is non-interactive; set pointer-events none so it doesn't block canvas.

Test hook requirement: console log once first frame renders.

One more thing: shadows on instanced floor receive yes.

Check flat shading on box geometry is irrelevant but fine.

Renderer: ensure `renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))`.

Snow points size 0.14 with sizeAttenuation, material color 0xffffff, opacity .9. Points spread over whole room plus margin.

Let me also add a slight "snow mound" or decorative? Not needed.

Potential problem: shadow map with directional light target at room center and shadow camera ±13 covering walls; mapSize 2048 gives ~0.0127 units/texel fine.

Pillar color and floor may be same-ish; differentiate with saturation.

Now let me write actual files. Keep total compact.

Careful about importmap paths: `"three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"`, `"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"`. We don't use addons.

Now write each file fully.

tick.js also export TICK_MS.

Input: need this.padDir updated each poll; also device switching while stick held: setDevice each poll when mag>deadzone would constantly set; setDevice handles no-op.

But device switch to gamepad only when input actually produced — stick held qualifies each poll. Good.

Potential subtle issue: when gamepad disconnects and device was gamepad, HUD label remains "gamepad: id" though pad gone. Minor; could fallback to keyboard. Add: on disconnect if this.device includes id -> this.device='keyboard'.

Let me write input carefully.

```js
const KEY_DIR = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const KEY_ACTION = { Space:'attack', KeyE:'eat', Digit1:'swap1', Digit2:'swap2', Digit3:'swap3', Numpad1:'swap1', Numpad2:'swap2', Numpad3:'swap3' };
const PAD_DIRS = [...];
const PAD_ACTION = { 0:'attack', 2:'eat', 14:'swap1', 12:'swap2', 15:'swap3' };
const PAD_PAUSE_BUTTON = 9;
const DEADZONE = 0.3;

export class Input {
  constructor(hooks = {}) {
    this.onPause = hooks.onPause || (()=>{});
    this.onToast = hooks.onToast || (()=>{});
    this.device = 'keyboard';
    this.actions = [];
    this.keys = new Set();
    this.padDir = null;
    this.padButtonState = new Map();
    this.connectedIds = new Set();
    this._bindKeyboard();
    const poll = () => this.pollGamepads();
    window.addEventListener('gamepadconnected', poll);
    window.addEventListener('gamepaddisconnected', poll);
  }
  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') { e.preventDefault(); if (!e.repeat) { this.device = 'keyboard'; this.onPause(); } return; }
      if (KEY_DIR[e.code]) { e.preventDefault(); this.device = 'keyboard'; this.keys.add(e.code); return; }
      const act = KEY_ACTION[e.code];
      if (act) { e.preventDefault(); this.device = 'keyboard'; if (!e.repeat) this.actions.push(act); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }
  keyboardDir() {
    let x = 0, z = 0;
    for (const code of this.keys) { const d = KEY_DIR[code]; if (!d) continue; x += d[0]; z += d[1]; }
    x = Math.sign(x); z = Math.sign(z);
    return (x || z) ? { x, z } : null;
  }
  getDirection() {
    const kb = this.keyboardDir();
    const pad = this.padDir;
    if (this.device.startsWith('gamepad')) return pad || kb;
    return kb || pad;
  }
  consumeActions() { const a = this.actions; this.actions = []; return a; }
  pollGamepads() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const seen = new Set();
    let dir = null;
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      if (!gp || !gp.connected) { this.padButtonState.delete(i); continue; }
      seen.add(gp.id);
      if (!this.connectedIds.has(gp.id)) {
        this.connectedIds.add(gp.id);
        this.onToast(`🎮 Controller connected: ${gp.id}`);
      }
      // stick
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (Math.hypot(ax, ay) >= DEADZONE && !dir) {
        const angle = Math.atan2(ax, -ay);
        const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
        dir = { x: PAD_DIRS[sector][0], z: PAD_DIRS[sector][1] };
        this.device = `gamepad: ${gp.id}`;
      }
      // buttons
      let prev = this.padButtonState.get(i);
      if (!prev || prev.length !== gp.buttons.length) {
        prev = new Array(gp.buttons.length).fill(false);
        this.padButtonState.set(i, prev);
      }
      for (const key in PAD_ACTION) {
        const idx = Number(key);
        const pressed = !!(gp.buttons[idx] && gp.buttons[idx].pressed);
        if (pressed && !prev[idx]) {
          this.device = `gamepad: ${gp.id}`;
          this.actions.push(PAD_ACTION[key]);
        }
        prev[idx] = pressed;
      }
      const pausePressed = !!(gp.buttons[PAD_PAUSE_BUTTON] && gp.buttons[PAD_PAUSE_BUTTON].pressed);
      if (pausePressed && !prev[PAD_PAUSE_BUTTON]) {
        this.device = `gamepad: ${gp.id}`;
        this.onPause();
      }
      prev[PAD_PAUSE_BUTTON] = pausePressed;
    }
    for (const id of Array.from(this.connectedIds)) {
      if (!seen.has(id)) {
        this.connectedIds.delete(id);
        this.onToast('Controller disconnected');
        if (this.device === `gamepad: ${id}`) this.device = 'keyboard';
      }
    }
    this.padDir = dir;
  }
}
```
Wait: setting device to gamepad on stick each poll means if keyboard used later, keydown sets keyboard; but next poll with stick held resets to gamepad, even without new input. "whichever was used most recently" — held stick technically continuously active. Acceptable.

Also `this.device = 'keyboard'` on Escape then pause toggles. Fine.

Note: padButtonState keyed by index; when disconnected and index reused, prev resets on length mismatch or delete. In the disconnect branch we delete state for that index. Good. But we delete at the top when gp null; connected pads keep.

One issue: pause button detection when paused; since onPause toggles, unpause works. Good.

Now Render class details. Need temp vectors to avoid allocation—minor; use preallocated.

Let me write render.js:

```js
import * as THREE from 'three';
import { createEntityMesh } from './entities.js';
import { ROOM_SIZE, MIN, MAX, pillars, brokenWall } from './world.js';

const TILE_TOP = 0;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Render {
  constructor(container) { ... }
  ...
}
```

Init lights:
```
const hemi = new THREE.HemisphereLight(0xdcecff, 0x2c3a4a, 1.15);
this.scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
sun.position.set(9, 17, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -13; right = 13; top = 13; bottom = -13; near = 1; far = 50;
sun.shadow.camera.updateProjectionMatrix? not needed since set before render? Actually need sun.shadow.camera.updateProjectionMatrix() after changing ortho bounds—three updates shadow camera on first shadow render? It calls updateMatrices; the projection matrix must be updated. DirectionalLightShadow.updateMatrices calls camera.updateProjectionMatrix? Let me recall: LightShadow.updateMatrices -> sets camera position/lookAt and calls this.camera.updateMatrixWorld, then multiplies matrices. I believe DirectionalLightShadow's camera projection needs manual updateProjectionMatrix after changing frustum. Common pattern sets bounds then calls updateProjectionMatrix. I'll call it explicitly to be safe.
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
sun.target.position.set(7, 0, 7); scene.add(sun.target); scene.add(sun);
```

Floor instanced:
```
const geo = new THREE.BoxGeometry(0.94, 0.18, 0.94);
const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.02, flatShading: true });
const inst = new THREE.InstancedMesh(geo, mat, ROOM_SIZE * ROOM_SIZE);
inst.receiveShadow = true;
const dummy = new THREE.Object3D();
const color = new THREE.Color();
const rand = mulberry32(1337);
let i = 0;
for (let x = MIN; x <= MAX; x++) for (let z = MIN; z <= MAX; z++) {
  dummy.position.set(x, -0.09, z);
  dummy.rotation.set(0, 0, 0);
  dummy.updateMatrix();
  inst.setMatrixAt(i, dummy.matrix);
  const t = rand();
  color.setHSL(0.56 + t * 0.03, 0.16 + rand() * 0.14, 0.76 + rand() * 0.1);
  inst.setColorAt(i, color);
  i++;
}
inst.instanceMatrix.needsUpdate = true;
if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
this.scene.add(inst);
```
Note fog affects. Since sRGB output, colors defined in sRGB—three converts. setHSL uses linear-srgb working color space? Color.setHSL has colorSpace param default SRGB in r152+? Actually `setHSL(h,s,l, colorSpace = ColorManagement.workingColorSpace)`? In three r170, Color.setHSL(h, s, l, colorSpace = SRGBColorSpace)? Let me recall: `setHSL( h, s, l, colorSpace = ColorManagement.workingColorSpace )`. Hmm, I think Color methods setRGB/setHSL default to working color space (linear-srgb) in recent versions? Checking memory: three.js Color.setRGB(r,g,b, colorSpace = ColorManagement.workingColorSpace). setHSL similar. Since we pass standard css-like numbers, colors may appear brighter/different but still fine. To be safe use `color.setHSL(h, s, l, THREE.SRGBColorSpace)` if signature supports 4th arg — it does in r170? setHSL( h, s, l, colorSpace = ColorManagement.workingColorSpace ) — I'm fairly confident there's a colorSpace param. If not, extra arg ignored. Actually if the function has 3 params, passing 4 is harmless. But if colorSpace param is 4th and default working, passing SRGB gives expected. Fine either way.

Base grid plane:
```
const base = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE + 0.2, ROOM_SIZE + 0.2), new THREE.MeshStandardMaterial({ color: 0x22384a, roughness: 1 }));
base.rotation.x = -Math.PI / 2;
base.position.set(7, -0.16, 7);
base.receiveShadow = true;
scene.add(base);
```
Careful: tile bottom is at -0.18, base at -0.16 above bottom (inside the tile) — gaps show base at -0.16, fine. But the base plane overlaps tiles horizontally? Plane at y=-0.16, tiles span -0.18..0. Gap 0.06 wide; visible dark line. Good.

Walls: proto = createEntityMesh('wall'); clone four.

Snow:

```
const COUNT = 900;
const pos = new Float32Array(COUNT * 3);
this.snowSpeed = new Float32Array(COUNT);
const rand2 = mulberry32(99);
for (let i = 0; i < COUNT; i++) {
  pos[i*3] = -1 + rand2() * 17;
  pos[i*3+1] = rand2() * 13;
  pos[i*3+2] = -1 + rand2() * 17;
  this.snowSpeed[i] = 0.6 + rand2() * 1.1;
}
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.85, depthWrite: false });
this.snow = new THREE.Points(g, m);
this.snow.frustumCulled = false;
this.scene.add(this.snow);
this.snowCount = COUNT;
```

Update method signature: update(dt, player, alpha, moving).

Facing yaw target: `Math.atan2(player.facing.x, player.facing.z)`.

Angle diff:
```
let d = targetYaw - this.playerMesh.rotation.y;
d = Math.atan2(Math.sin(d), Math.cos(d));
this.playerMesh.rotation.y += d * (1 - Math.exp(-16 * dt));
```

Player position y bob + maybe lean. Keep.

Camera:
```
this.follow.lerp(tmp.set(ix, 0, iz), 1 - Math.exp(-14 * dt));
tmp.copy(this.follow).add(this.camOffset);
this.camPos.lerp(tmp, 1 - Math.exp(-6 * dt));
this.camera.position.copy(this.camPos);
this.camLook.copy(this.follow); this.camLook.y = 0.9;
this.camera.lookAt(this.camLook);
```
camLook abrupt? follow is smoothed, fine.

Init camPos: since follow starts (7,0,7), set camPos = (7,0,7)+offset and camera position copy, lookAt.

Render snow in update:
```
const attr = this.snow.geometry.attributes.position;
for (let i = 0; i < this.snowCount; i++) {
  let y = attr.getY(i) - this.snowSpeed[i] * dt;
  let x = attr.getX(i) + dt * 0.35;
  if (y < -0.2) y += 13.5;
  if (x > 16) x -= 17;
  attr.setX(i, x); attr.setY(i, y);
}
attr.needsUpdate = true;
```
Fine.

resize:
```
this.camera.aspect = innerWidth / innerHeight;
this.camera.updateProjectionMatrix();
this.renderer.setSize(innerWidth, innerHeight);
```

Now main.

Also need to update HUD tick only when changed:
```
let lastHud = { tick:-1, tile:'', input:'' };
function updateHUD(){
  if (ticker.tick !== lastHud.tick) { hudTick.textContent = String(ticker.tick); lastHud.tick = ticker.tick; }
  const tile = `(${player.x}, ${player.z})`;
  if (tile !== lastHud.tile) { hudTile.textContent = tile; lastHud.tile = tile; }
  if (input.device !== lastHud.input) { hudInput.textContent = input.device; lastHud.input = input.device; }
}
```

Test hook log ready after first render. Also expose paused via getter. `paused` overlay sync with ticker.paused.

Also main should handle the case where tab is hidden: RAF pauses; ticker accumulates only when frames resume, and dt clamped to 5 ticks. Fine.

One more: ticker.update takes now from RAF timestamp (DOMHighResTimeStamp same origin as performance.now). Good.

Let's also reset ticker.lastTime on unpause: setPaused(false) sets lastTime = null so next update initializes. Implement: in setPaused, if unpausing, this.lastTime = -1; and in update if lastTime < 0 then set to now and return (keeping acc). Actually simpler: `this.lastTime = performance.now()` at unpause. In update: if lastTime === 0 -> set. Use flag `this._needReset = true`. I'll set lastTime = -1 and check `if (this.lastTime < 0) { this.lastTime = now; this.alpha = this.acc/this.tickMs; return; }`.

Hmm first update (lastTime = -1? initialized 0) — use `this.lastTime = -1` in constructor and in update if <0 initialize and return. That means first frame no ticks; fine.

Also alpha initial 0.

One catch: RAF timestamps start at navigation; consistent.

Now, movement buffering: direction is read at tick time from currently held keys/stick. Good.

Ensure facing updates only when direction non-null (last attempted direction even if blocked). Yes: set facing before tryMove.

Now check spawn clear: pillars/broken wall none within 6..8 x 6..8? (9,9) outside. Good.

Check wall rendering position at north z=0: block depth 0.5 spans z -0.25..0.25 centered at z=0 — partially outside the floor (floor extends -0.5..14.5 for tile 0 center 0). Fine.

But wait: floor tile at z=0 is rendered under wall; wall sits on top; good.

Camera offset southeast (positive x, positive z) — camera looks toward northwest. Directional sun from (9,17,7) relative to center (7,0,7) -> from southeast-ish too, shadows cast northwest. Fine.

Player starts at (7,7); camera at (13.7,10.6,13.7) essentially, within room-ish but above walls; fog starts at 22 — camera distance ~14 from player; far corner up to ~24 units away -> fog fades distant corner. Fine.

Fog near 22 far 46: room diagonal ~20 max from camera... Actually camera-to-far-corner distance could be ~26. Slight fog on edges, atmospheric. Good.

Check that the player is visible: camera looks at follow y=0.9.

Now entities.js materials: cache materials? Each mesh creates new material — with ~few entities fine. Floor uses its own.

Let me write the entity factory to return group centered at tile origin with base at y=0.

Player details final:
```
if (kind === 'player') {
  const tunic = 0x3f74d6, trim = 0x24406f, skin = 0xe9c39b, steel = 0xcfe4f5, dark = 0x24313f;
  g.add(box(0.58, 0.64, 0.4, tunic, 0, 0.66, 0));      // torso
  g.add(box(0.6, 0.12, 0.42, trim, 0, 0.4, 0));         // belt
  g.add(box(0.2, 0.34, 0.22, dark, -0.14, 0.17, 0));    // leg L
  g.add(box(0.2, 0.34, 0.22, dark, 0.14, 0.17, 0));     // leg R
  g.add(box(0.16, 0.44, 0.18, tunic, -0.37, 0.68, 0));  // arm L
  g.add(box(0.16, 0.44, 0.18, tunic, 0.37, 0.68, 0));   // arm R
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), mat(skin));
  head.position.set(0, 1.16, 0); head.castShadow = true; g.add(head);
  const helm = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.3, 7), mat(steel));
  helm.position.set(0, 1.4, 0); helm.castShadow = true; g.add(helm);
  g.add(box(0.12, 0.07, 0.08, dark, 0, 1.16, 0.21));    // eyes/visor toward +z
  // small round shield on left
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8), mat(0x8fb6d6));
  shield.rotation.z = Math.PI / 2; shield.position.set(-0.46, 0.7, 0); shield.castShadow = true; g.add(shield);
}
```
Shield cylinder axis Y rotated z 90° -> axis along X. Fine.

Pillar:
```
const stone = 0x9db4c8, dark = 0x7c93a8, snow = 0xf3f9ff;
base cylinder(0.44, 0.5, 0.22, 8) y 0.11 color dark
shaft cylinder(0.32, 0.4, 1.35, 8) y 0.9 stone
top slab cylinder(0.36, 0.4, 0.18, 8) at 1.62 stone? and snow cap cylinder(0.34, 0.4, 0.16, 8) at y 1.72 snow
Add a chipped chunk: box(0.22, 0.16, 0.3, dark, 0.22, 1.5, 0.08)
```
Keep height ~1.8.

Wall:
```
box(1.0, 1.05, 0.5, 0x93aabe, 0, 0.525, 0)
box(1.04, 0.12, 0.56, 0xf3f9ff, 0, 1.1, 0)  // snow
box(1.0, 0.14, 0.56, 0x6f869a, 0, 0.07, 0)   // trim base
```

Now world.js includes pillar data and isWalkable.

Final check on test hook: `get tick()` returns ticker.tick. `get player()` returns {x,z,facing}. `get inputDevice()`. `get paused()`. isWalkable function. blockers.

Potential test: `__rimefall.isWalkable(7,7) === true`, `isWalkable(0,0) === false`, blockers length 8. They might test that all blockers report !isWalkable. Good.

Movement test likely: press KeyW and wait 700ms, player.z decreased by 1. Our tick loop with alpha etc. Let's trace: at load, first frame sets lastTime. Player at (7,7). Test dispatches keydown W. Next tick after up to 600ms: direction (0,-1), facing set, try move to (7,6) walkable, prev=(7,7), cur=(7,6). Yes.

Diagonal corner test: press W+D; target (8,6) with orthogonals (8,7),(7,6) — both walkable. Moves.

Blocked: walking into pillar — facing updates, position unchanged.

Holding direction for 2 seconds yields ~3 moves. Fine.

Potential requirement: "Buffered movement ... latest input device to produce input wins". Fine.

Gamepad in headless: none.

Now the ready log: `[rimefall] ready` exactly.

Let me also add `window.__rimefall.get alpha()`? Not needed but harmless. I'll add `get alpha()`.

Careful: exposing `blockers` as the imported array — fine.

Also to be safe, put a fallback for WebGL context creation? skip.

Let me write the files now. Count ~700 lines.

index.html done. style.css.

One consideration: "sRGB output" — renderer.outputColorSpace = THREE.SRGBColorSpace (default in r170 anyway).

Let me write code.

render.js full:

```js
import * as THREE from 'three';
import { createEntityMesh } from './entities.js';
import { ROOM_SIZE, MIN, MAX, pillars, brokenWall } from './world.js';

const CENTER = (MIN + MAX) / 2;

function mulberry32(seed) { ... }

export class Render {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb9d3e6);
    this.scene.fog = new THREE.Fog(0xb9d3e6, 21, 45);

    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camOffset = new THREE.Vector3(6.6, 10.4, 6.6);
    this.follow = new THREE.Vector3(CENTER, 0, CENTER);
    this.camPos = this.follow.clone().add(this.camOffset);
    this.camLook = this.follow.clone();
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();

    this._buildLights();
    this._buildFloor();
    this._buildWalls();
    this._buildProps();
    this._buildPlayer();
    this._buildSnow();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }
  ...
}
```

Note camLook initialized (7,0,7) y 0; set .y=0.9.

Build floor: base plane then instanced tiles.

_buildWalls:
```
const proto = createEntityMesh('wall');
const runs = [
  { x: CENTER, z: MIN, rot: 0 },
  { x: CENTER, z: MAX, rot: 0 },
  { x: MIN, z: CENTER, rot: Math.PI / 2 },
  { x: MAX, z: CENTER, rot: Math.PI / 2 },
];
for (const r of runs) {
  const wall = proto.clone();
  wall.position.set(r.x, 0, r.z);
  wall.rotation.y = r.rot;
  wall.scale.set(ROOM_SIZE, 1, 1);
  this.scene.add(wall);
}
```
Wall long dimension: box width 1 along local x scaled to 15. Room floor width 15 (from -0.5 to 14.5). Good.

But shadows: cloned groups have castShadow set on meshes already.

_buildProps: pillars and broken wall.

_buildPlayer: this.playerMesh = createEntityMesh('player'); add; rotation.y = 0 (faces +z, south).

_buildSnow as above.

update(dt, player, alpha, moving):
```
const ix = player.prevX + (player.x - player.prevX) * alpha;
const iz = player.prevZ + (player.z - player.prevZ) * alpha;
const bob = moving ? Math.sin(alpha * Math.PI) * 0.11 : 0;
this.playerMesh.position.set(ix, bob, iz);
const targetYaw = Math.atan2(player.facing.x, player.facing.z);
let dy = targetYaw - this.playerMesh.rotation.y;
dy = Math.atan2(Math.sin(dy), Math.cos(dy));
this.playerMesh.rotation.y += dy * (1 - Math.exp(-16 * Math.min(dt, 0.05)));
// camera
this.follow.lerp(this._tmpA.set(ix, 0, iz), 1 - Math.exp(-14 * Math.min(dt, 0.1)));
this._tmpB.copy(this.follow).add(this.camOffset);
this.camPos.lerp(this._tmpB, 1 - Math.exp(-6 * Math.min(dt, 0.1)));
this.camera.position.copy(this.camPos);
this.camLook.copy(this.follow); this.camLook.y = 0.9;
this.camera.lookAt(this.camLook);
// snow
...
```
Careful using this._tmpA inside lerp then _tmpB copy follow. Fine.

Since follow smoothing is fast (14), and camPos slower, total good.

Public render() { this.renderer.render(...) }.

destroy not needed.

Now main.js full:

```js
import { Input } from './input.js';
import { Ticker } from './tick.js';
import { Render } from './render.js';
import { SPAWN, blockers, isWalkable } from './world.js';

const hud = {
  tick: document.getElementById('hud-tick'),
  tile: document.getElementById('hud-tile'),
  input: document.getElementById('hud-input'),
  toast: document.getElementById('toast'),
  pause: document.getElementById('pause-overlay'),
};

let toastTimer = 0;
function showToast(text, ms = 3000) {
  hud.toast.textContent = text;
  hud.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hud.toast.classList.remove('visible'), ms);
}

const ticker = new Ticker();
const render = new Render(document.getElementById('app'));

const player = {
  x: SPAWN.x, z: SPAWN.z,
  prevX: SPAWN.x, prevZ: SPAWN.z,
  facing: { x: 0, z: 1 },
  moved: false,
};

const input = new Input({ onPause: togglePause, onToast: showToast });

function togglePause() {
  ticker.setPaused(!ticker.paused);
  hud.pause.classList.toggle('visible', ticker.paused);
}

function tryMove(dx, dz) {
  const nx = player.x + dx, nz = player.z + dz;
  if (!isWalkable(nx, nz)) return false;
  if (dx !== 0 && dz !== 0) {
    if (!isWalkable(player.x + dx, player.z) || !isWalkable(player.x, player.z + dz)) return false;
  }
  player.x = nx; player.z = nz;
  return true;
}

ticker.subscribe(() => {
  player.prevX = player.x;
  player.prevZ = player.z;
  player.moved = false;
  for (const action of input.consumeActions()) {
    // Combat and gear land in later milestones; log for now.
    console.log(`[rimefall] action buffered: ${action} (not implemented in milestone 1)`);
  }
  const dir = input.getDirection();
  if (dir) {
    player.facing = { x: dir.x, z: dir.z };
    player.moved = tryMove(dir.x, dir.z);
  }
});
```
Wait ordering: prev set before move. Good. moved true only if moved.

Then loop and HUD, test hook.

Note: consumeActions should be called at tick time; if multiple actions queued, all consumed. Fine.

HUD:
```
const hudState = { tick: -1, tile: '', input: '' };
function updateHud() {
  if (ticker.tick !== hudState.tick) { hudState.tick = ticker.tick; hud.tick.textContent = String(ticker.tick); }
  const tile = `(${player.x}, ${player.z})`;
  if (tile !== hudState.tile) { hudState.tile = tile; hud.tile.textContent = tile; }
  if (input.device !== hudState.input) { hudState.input = input.device; hud.input.textContent = input.device; }
}
```

Main loop:
```
let last = -1;
let ready = false;
function frame(now) {
  requestAnimationFrame(frame);
  if (last < 0) last = now;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  input.pollGamepads();
  ticker.update(now);
  render.update(dt, player, ticker.alpha, player.moved);
  render.render();
  updateHud();
  if (!ready) { ready = true; console.log('[rimefall] ready'); }
}
requestAnimationFrame(frame);
```
But render.update before first ticker tick: alpha 0; player prev = cur; fine.

Important: ticker.update first call initializes lastTime and returns. Good.

One issue: player.moved remains true until next tick sets false; render bob uses alpha which resets to 0 after tick executes; then next frames alpha grows -> bob arc. Good. If a tick happens with no movement, moved false, no bob.

Test hook:
```
const FACING_NAMES = { '0,1':'south', '0,-1':'north', '1,0':'east', '-1,0':'west', '1,1':'south-east', ... };
window.__rimefall = {
  get tick() { return ticker.tick; },
  get alpha() { return ticker.alpha; },
  get player() { return { x: player.x, z: player.z, facing: { x: player.facing.x, z: player.facing.z }, facingName: facingName(player.facing) }; },
  get inputDevice() { return input.device; },
  get paused() { return ticker.paused; },
  isWalkable,
  blockers,
};
```
`isWalkable` shorthand from import works.

Also maybe expose world dims? not required.

Now style.css and index.html.

One more check: `hud.pause` id 'pause-overlay'.

index.html hint text.

Everything ready. Write files.

Potential pitfall: In render.js I import ROOM_SIZE, MIN, MAX, pillars, brokenWall from world.js. Ensure names exported: ROOM_SIZE=15, MIN=0, MAX=14, SPAWN, pillars, brokenWall, blockers, isWalkable.

Also wall runs at MIN/MAX use floor tile centers 0 and 14 — correct.

Make sure `createEntityMesh('wall')` proto clone: THREE.Group.clone() clones children meshes sharing material and geometry — fine.

Shadow: wall run meshes castShadow true, receiveShadow true.

InstancedMesh castShadow default false (good).

Do the pillars cast shadows? factory sets castShadow true.

Let me now write out all files.

One more detail on tick alpha when paused then unpaused: setPaused(false) sets lastTime = -1 (or performance.now()). Implement in Ticker.setPaused:
```
setPaused(v) {
  v = !!v;
  if (this.paused === v) return;
  this.paused = v;
  if (!v) this.lastTime = -1; // resync on resume
}
```
In update: `if (this.lastTime < 0) { this.lastTime = now; this.alpha = Math.min(1, this.acc / this.tickMs); return; }`. Constructor lastTime = -1.

Alpha after resume remains where it was until ticks progress. Fine.

Also if acc accumulated a lot before pause? acc < tickMs always. Fine.

Edge: while paused, update called but returns before touching lastTime? I set lastTime = now? On resume we reset to -1 so it doesn't matter. In paused branch just return (after setting nothing). But `this._now` not needed.

Ok writing now.

CSS font: monospace stack.

Also prevent text selection & touch scrolling.

Let me produce the final answer with 8 files. Keep comments brief.

Double-check gamepad button index mapping per spec: "D-pad 14/12/15 = swap gear 1/2/3". Implemented PAD_ACTION {14:'swap1',12:'swap2',15:'swap3'}. Good. Note key 0 A attack, 2 X eat, 9 Start pause.

D-pad movement is not used. Good.

Keyboard arrows supported.

Radial deadzone 0.3, 45° sectors. Good.

Input device string exactly "gamepad: <id>" — our template `gamepad: ${gp.id}`. Keyboard 'keyboard'. Good.

Toast exactly "🎮 Controller connected: <id>" and "Controller disconnected". Good.

HUD shows "Input: keyboard|gamepad: <id>" — our row label "Input" plus value. Good.

Test hook required fields.

Now, one possible concern: `navigator.getGamepads` may return array with nulls; handled.

`gp.axes[0] || 0` converts -0 to 0? fine.

buttons possibly undefined; handled.

Now writing.

Also make sure `this.padDir = dir` even when no pads -> null, so stale direction cleared. Yes at end.

But if `!navigator.getGamepads` early return leaves padDir stale — irrelevant.

One subtlety: gamepad polling sets device to gamepad whenever stick is beyond deadzone, including immediately after load if a pad rests drift; unlikely.

Finish.

Let me double check InstancedMesh color: material color white, setColorAt per instance requires `inst.instanceColor.needsUpdate = true` after all set. Fine.

Three r170: `renderer.outputColorSpace` exists. `THREE.SRGBColorSpace` exists. PCFSoftShadowMap exists. Fog exists. PointsMaterial fine. `CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)` fine.

`ACESFilmicToneMapping` exists.

Check DirectionalLightShadow camera update. I'll call `sun.shadow.camera.updateProjectionMatrix()`.

Write out.

For the wall run scaled by 15: the base trim and snow cap scale too; okay.

Potential visual issue: The room's floor at y=0 and base plane -0.16; camera near 0.1 fine.

Now final file content.

main.js: make sure togglePause is hoisted before input creation (function declaration hoisted). Yes.

Also when input triggers pause during construction? no.

`hud.pause` overlay toggles class 'visible' and CSS #pause-overlay { display:none } .visible { display:grid }.

Note initial HTML overlay lacks visible.

Ready log after first render: renderer.render called inside frame; ready flag set after first frame.

Ok.

One more: `window.__rimefall` object should ideally exist before first frame for tests — define after setup synchronously, fine.

Writing final answer now. Aim compact ~750 lines.

Let me write world.js carefully:

```js
// Static, deterministic room layout for Rimefall milestone 1.

export const ROOM_SIZE = 15;
export const MIN = 0;
export const MAX = ROOM_SIZE - 1; // 14
export const SPAWN = { x: 7, z: 7 };

/** Impassable interior props (pillars + one broken wall section). */
export const pillars = [
  { x: 3, z: 3 },
  { x: 11, z: 3 },
  { x: 3, z: 11 },
  { x: 11, z: 11 },
  { x: 5, z: 7 },
  { x: 9, z: 4 },
];

export const brokenWall = [
  { x: 9, z: 9 },
  { x: 10, z: 9 },
];

export const blockers = [
  ...pillars.map((p) => ({ x: p.x, z: p.z, kind: 'pillar' })),
  ...brokenWall.map((p, i) => ({ x: p.x, z: p.z, kind: 'wall' })),
];

const blockedTiles = new Set(blockers.map((b) => `${b.x},${b.z}`));

/** True when a tile is inside the playable floor and not occupied by a prop. */
export function isWalkable(x, z) {
  if (!Number.isInteger(x) || !Number.isInteger(z)) return false;
  if (x < 1 || x > MAX - 1 || z < 1 || z > MAX - 1) return false; // perimeter wall ring
  return !blockedTiles.has(`${x},${z}`);
}
```

MAX-1 = 13. Good.

Hmm spawn (7,7) — pillar (5,7) is two west; not adjacent. (9,4) far. Good.

entities.js — write.

render.js — write.

Check `pillars` imported in render and used.

In render `_buildProps` broken wall scale y 0.65.

One more thought on wall runs at z=0 and z=14: The wall block depth 0.5 centered at edge tile center; tiles at z=0 floor under. Camera looks from southeast, north wall visible from inside. Fine.

Maybe raise walls to 1.3 tall? Player head at 1.5; low wall 1.1. "low icy stone walls" yes.

Now write.

For style.css use `image-rendering: pixelated`? not relevant.

Let me finalize.

Potential issue with `color.setHSL(..., THREE.SRGBColorSpace)`: In r170 signature is setHSL(h, s, l, colorSpace = ColorManagement.workingColorSpace). Passing SRGBColorSpace fine. Values 0.76-0.86 lightness produce pale blue. Good.

Base plane color 0x22384a dark slate blue.

Scene background 0xb9d3e6 and fog same; okay.

Snow color white over pale background; fine.

Time to output.