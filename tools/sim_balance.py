#!/usr/bin/env python3
"""Balance sim: passive-but-hitting player (stand still, keep an adjacent target, eat < 15 HP) vs room, N seeds. Usage: sim_balance.py URL N"""
import json, sys
from playwright.sync_api import sync_playwright
URL = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 else 20
SNAP = """() => { const r = window.__rimefall; return { p: [r.player.x, r.player.z], hp: r.hp, food: r.food, target: r.targetId, room: r.roomState,
  en: r.enemies.map(e => ({id:e.id, x:e.x, z:e.z, alive:e.alive})) }; }"""
card = lambda a, b: abs(a[0]-b[0]) + abs(a[1]-b[1]) == 1
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"]); pg = b.new_page(viewport={"width":640,"height":360})
    pg.goto(URL); pg.wait_for_function("window.__rimefall && window.__rimefall.debug"); ev = pg.evaluate
    ev("window.__rimefall.debug.manual(true)"); out = []
    for seed in range(100, 100 + N):
        ev(f"window.__rimefall.debug.restart({seed})"); minhp = 99; t = 0
        for t in range(500):
            s = ev(SNAP); minhp = min(minhp, s["hp"])
            if s["room"] in ("cleared", "dead"): break
            alive = {e["id"]: e for e in s["en"] if e["alive"]}
            adj = [e for e in alive.values() if card(s["p"], (e["x"], e["z"]))]
            tg = alive.get(s["target"])
            if s["hp"] < 15 and s["food"] > 0: ev("window.__rimefall.debug.press('eat')")
            elif tg is None: ev("window.__rimefall.debug.press('attack')")
            elif adj and not card(s["p"], (tg["x"], tg["z"])): ev("window.__rimefall.debug.press('cycle')")
            ev("window.__rimefall.debug.step(1)")
        out.append({"seed": seed, "res": s["room"], "hp": s["hp"], "minhp": minhp, "food": s["food"], "ticks": t})
    b.close()
w = [o for o in out if o["res"] == "cleared"]
print(json.dumps({"n": N, "win_rate": round(len(w)/N, 2), "avg_hp_end_win": round(sum(o["hp"] for o in w)/max(1,len(w)),1),
  "avg_min_hp_win": round(sum(o["minhp"] for o in w)/max(1,len(w)),1), "avg_food_used_win": round(sum(4-o["food"] for o in w)/max(1,len(w)),2),
  "avg_ticks": round(sum(o["ticks"] for o in out)/N,1)}))
