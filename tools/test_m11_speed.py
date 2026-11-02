#!/usr/bin/env python3
"""Per-rAF sampling of mesh position during held movement to detect hitches between tiles."""
import json, math, time
from playwright.sync_api import sync_playwright
PAD = open('/workspace/rimefall/tools/test_m11.py').read().split('PAD = """')[1].split('"""')[0]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width":800,"height":450}); pg.add_init_script(PAD)
    pg.goto("http://localhost:8765/"); pg.wait_for_function("window.__rimefall && window.__rimefall.tick>=2", timeout=20000)
    S = pg.evaluate("""() => new Promise(res => { const r = window.__rimefall, out = []; const t0 = performance.now();
      window.__fakePad.axes[1] = -1;
      (function f(){ const m = r.meshWorld(); out.push([performance.now()-t0, r.tick, m.x, m.z]);
        if (performance.now()-t0 < 2200) requestAnimationFrame(f); else { window.__fakePad.axes[1]=0; res(out);} })(); })""")
    b.close()
# After first tick, until arrival at (4,4): speeds per frame
tk0 = S[0][1]; ft = next(s[0] for s in S if s[1] > tk0)
seg = [s for s in S if s[0] > ft]
sp = []
for a, c in zip(seg, seg[1:]):
    d = math.hypot(c[2]-a[2], c[3]-a[3]); sp.append((round(c[0]-ft), round(d/((c[0]-a[0])/1000), 2), c[1]))
moving = [x for x in sp if x[0] < 3*600 - 50]
print("frames", len(S), "first tick at ms", round(ft))
print("speeds (ms_since_tick1, tiles/s, tick):", moving)
