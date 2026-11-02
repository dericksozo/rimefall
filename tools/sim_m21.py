#!/usr/bin/env python3
"""Balance sim for M2.1: runs fighter and dodger policies over N seeds with optional tune JSON. Usage: sim_m21.py N '{tune json}'"""
import json, sys
sys.path.insert(0, "/workspace/rimefall/tools")
from rf import sync_playwright, ARGS, Game, card
from policies import fighter, dodger_engage as dodger
N = int(sys.argv[1]) if len(sys.argv) > 1 else 20; TUNE = sys.argv[2] if len(sys.argv) > 2 else None
def run(g, pol, seed):
    g.d(f"d.restart({seed})"); viol = 0; minhp = 99
    for t in range(600):
        s = g.snap(); minhp = min(minhp, s["hp"])
        if s["room"] in ("cleared", "dead"): break
        tiles = [(e["x"], e["z"]) for e in s["en"]]
        if len(set(tiles)) != len(tiles) or tuple(s["p"]) in tiles: viol += 1
        if s["room"] == "fighting": pol(g, s)
        g.step(1)
    return {"res": s["room"], "hp": s["hp"], "food": s["food"], "ticks": t, "viol": viol, "minhp": minhp}
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={"width":480,"height":270})
    pg.goto("http://localhost:8765/?seed=1"); pg.wait_for_function("window.__rimefall && window.__rimefall.debug"); g = Game(pg)
    g.d("d.manual(true)")
    if TUNE: g.d(f"d.tune({TUNE})")
    out = {}
    for name, pol in (("fighter", fighter), ("dodger", dodger)):
        rs = [run(g, pol, sd) for sd in range(200, 200 + N)]; w = [r for r in rs if r["res"] == "cleared"]
        out[name] = {"win_rate": round(len(w)/N, 2), "avg_hp_win": round(sum(r["hp"] for r in w)/max(1,len(w)),1),
                     "avg_food_left_win": round(sum(r["food"] for r in w)/max(1,len(w)),2), "avg_ticks": round(sum(r["ticks"] for r in rs)/N,1),
                     "stack_viol": sum(r["viol"] for r in rs), "timeouts": sum(1 for r in rs if r["res"] not in ("cleared","dead"))}
    b.close()
print(json.dumps({"tune": TUNE, **out}))
