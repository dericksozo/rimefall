#!/usr/bin/env python3
"""Fresh page from spawn: latency of first visual movement, continuous held glide speed, straight diagonal line, facing."""
import json, math, time
from playwright.sync_api import sync_playwright
PAD = open('/workspace/rimefall/tools/test_movement.py').read().split('PAD = """')[1].split('"""')[0]
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width":1280,"height":720}); pg.add_init_script(PAD)
    pg.goto("http://localhost:8765/"); pg.wait_for_function("window.__rimefall && window.__rimefall.tick>=2", timeout=20000)
    ev = pg.evaluate; T = lambda: ev("window.__rimefall.tick")
    t0 = T()
    while T() == t0: time.sleep(0.005)
    time.sleep(0.2)  # press ~200ms into a tick, i.e. ~400ms before next tick
    m0 = ev("window.__rimefall.meshWorld()"); tk0 = T()
    ev("window.__fakePad.axes[1]=-1"); ts = time.time(); S = []
    while time.time() - ts < 2.2:
        S.append((time.time()-ts, T(), ev("window.__rimefall.meshWorld()"), ev("[window.__rimefall.player.x,window.__rimefall.player.z]"))); time.sleep(0.02)
    ev("window.__fakePad.axes[1]=0")
    mv = lambda s: math.hypot(s[2]["x"]-m0["x"], s[2]["z"]-m0["z"])
    R["first_visual_move_ms"] = next((round(s[0]*1000) for s in S if mv(s) > 0.01), None)
    R["first_tick_ms"] = next((round(s[0]*1000) for s in S if s[1] > tk0), None)
    R["pre_glide_dist_at_tick"] = round(max(mv(s) for s in S if s[1] == tk0), 3)
    R["tiles"] = sorted({tuple(s[3]) for s in S})
    # straight line check: grid dir (-1,-1); perp deviation from line through m0
    ux, uz = -1/math.sqrt(2), -1/math.sqrt(2)
    R["max_perp_dev"] = round(max(abs((s[2]["x"]-m0["x"])*uz - (s[2]["z"]-m0["z"])*ux) for s in S), 4)
    # speed while moving (between first tick and arriving at last tile)
    sp = [(b2[0], math.hypot(b2[2]["x"]-a2[2]["x"], b2[2]["z"]-a2[2]["z"])/(b2[0]-a2[0])) for a2,b2 in zip(S,S[1:])]
    first_tick_t = R["first_tick_ms"]/1000
    mid = [v for t,v in sp if first_tick_t + 0.05 < t < first_tick_t + 1.1]
    R["held_speed_tiles_per_s_min_avg_max"] = [round(min(mid),2), round(sum(mid)/len(mid),2), round(max(mid),2)]
    R["expected_diag_speed"] = round(math.sqrt(2)/0.6, 2)
    R["facing"] = ev("window.__rimefall.player.facing")
    b.close()
print(json.dumps(R, indent=1))
