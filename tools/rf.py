"""Shared Playwright helpers for Rimefall tests (tooling only)."""
from playwright.sync_api import sync_playwright
PAD = """(() => {
  const id='Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
  window.__fakePad={axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
  navigator.getGamepads=()=>[{id,index:0,connected:true,mapping:'standard',timestamp:performance.now(),
    axes:window.__fakePad.axes.slice(),buttons:window.__fakePad.buttons.map(b=>({...b}))},null,null,null];
})();"""
ARGS = ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]
SNAP = """() => { const r = window.__rimefall; return { tick: r.tick, p: [r.player.x, r.player.z], f: [r.player.facing.x, r.player.facing.z], hp: r.hp, food: r.food,
  room: r.roomState, nat: r.nextAttackTick, en: r.enemies.filter(e => e.alive).map(e => ({id:e.id, x:e.x, z:e.z, hp:e.hp, tel:e.telegraph, nat:e.nextAttackTick, wait:e.waitUntilTick})) }; }"""
card = lambda a, b: abs(a[0]-b[0]) + abs(a[1]-b[1]) == 1
class Game:
    def __init__(self, pg): self.pg = pg; self.ev = pg.evaluate
    def d(self, js): return self.ev(f"(() => {{ const d = window.__rimefall.debug; return {js}; }})()")
    def snap(self): return self.ev(SNAP)
    def step(self, n=1): self.d(f"d.step({n})")
    def move(self, dx=None, dz=None): self.d("d.setMove(null)" if dx is None else f"d.setMove({dx},{dz})")
    def press(self, a): self.d(f"d.press('{a}')")
    def log(self): return self.ev("window.__rimefall.combatLog")
    def setup(self, player, wolves, **kw):
        import json; cfg = {"player": player, "wolves": wolves}; cfg.update(kw); self.d(f"d.setup({json.dumps(cfg)})")
    def walkable(self, x, z): return self.ev(f"window.__rimefall.isWalkable({x},{z})")
