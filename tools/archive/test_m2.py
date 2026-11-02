#!/usr/bin/env python3
"""M2 combat tests using debug hooks (manual ticking): cadence, cardinal-only melee, no stacking, pathing around pillars,
eat delay, room clear, death, screenshots, and a balance sim over N seeds."""
import json, sys, time
from playwright.sync_api import sync_playwright
NSIM = int(sys.argv[1]) if len(sys.argv) > 1 else 20
PAD = open('/workspace/rimefall/tools/test_movement.py').read().split('PAD = """')[1].split('"""')[0]
S = "/workspace/rimefall/screens/"; R = {}
SNAP = """() => { const r = window.__rimefall; return { tick: r.tick, p: [r.player.x, r.player.z], hp: r.hp, food: r.food, target: r.targetId,
  room: r.roomState, nat: r.nextAttackTick, en: r.enemies.map(e => ({id:e.id, x:e.x, z:e.z, hp:e.hp, alive:e.alive, tel:e.telegraph})) }; }"""
def card(a, b): return abs(a[0]-b[0]) + abs(a[1]-b[1]) == 1
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width":1280,"height":720}); pg.add_init_script(PAD)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
    pg.goto("http://localhost:8765/?seed=1"); pg.wait_for_function("window.__rimefall && window.__rimefall.debug", timeout=20000)
    ev = pg.evaluate
    D = lambda js: ev(f"(() => {{ const d = window.__rimefall.debug; return {js}; }})()")
    snap = lambda: ev(SNAP)
    D("d.manual(true)")
    # ---------- scripted fight with checks ----------
    def run_fight(policy, max_ticks=400, record=True, shot_at=None):
        hist = []; stack_viol = []; blocked_viol = []
        for i in range(max_ticks):
            s = snap()
            if s["room"] in ("cleared", "dead"): break
            policy(s)
            D("d.step(1)"); s2 = snap(); hist.append(s2)
            alive = [e for e in s2["en"] if e["alive"]]
            tiles = [(e["x"], e["z"]) for e in alive]
            if len(set(tiles)) != len(tiles) or tuple(s2["p"]) in tiles: stack_viol.append(s2["tick"])
            for t in tiles:
                if not ev(f"window.__rimefall.isWalkable({t[0]},{t[1]})"): blocked_viol.append((s2["tick"], t))
            if shot_at and shot_at(s2):
                time.sleep(0.15); pg.screenshot(path=S + shot_at.name); shot_at = None
        return hist, stack_viol, blocked_viol
    def fighter(s):
        # stand still; keep an adjacent target; eat when low
        D("d.setMove(null)")
        if s["hp"] < 15 and s["food"] > 0: D("d.press('eat')"); return
        alive = {e["id"]: e for e in s["en"] if e["alive"]}
        adj = [e for e in alive.values() if card(s["p"], (e["x"], e["z"]))]
        t = alive.get(s["target"])
        if t is None: D("d.press('attack')")
        elif adj and not card(s["p"], (t["x"], t["z"])): D("d.press('cycle')")
    class Shot:
        def __init__(s, name, cond): s.name = name; s.cond = cond
        def __call__(s, st): return s.cond(st)
    mid = Shot("m2-midfight.png", lambda st: st["room"] == "fighting" and any(e["alive"] and e["hp"] < 12 for e in st["en"]) and st["hp"] < 36)
    hist, sv, bv = run_fight(fighter, shot_at=mid)
    log = ev("window.__rimefall.combatLog")
    R["fight1_result"] = hist[-1]["room"]; R["fight1_ticks"] = len(hist); R["fight1_hp_end"] = hist[-1]["hp"]
    R["stack_violations"] = sv; R["blocked_tile_violations"] = bv
    bytick = {h["tick"]: h for h in hist}
    pa = [e for e in log if e["type"] == "player_attack"]; ea = [e for e in log if e["type"] == "enemy_attack"]; eats = [e for e in log if e["type"] == "eat"]
    # cardinal-only: positions at the tick of attack (state after step == positions used at that tick)
    def pos_of(tick, ent):
        h = bytick.get(tick)
        if not h: return None
        if ent == "player": return tuple(h["p"])
        for e in h["en"]:
            if e["id"] == ent: return (e["x"], e["z"])
    diag = []
    for e in pa:
        a, t = pos_of(e["tick"], "player"), pos_of(e["tick"], e["dst"])
        if a and t and not card(a, t): diag.append(("player", e["tick"], a, t))
    for e in ea:
        a, t = pos_of(e["tick"], e["src"]), pos_of(e["tick"], "player")
        if a and t and not card(a, t): diag.append(("enemy", e["tick"], a, t))
    R["non_cardinal_attacks"] = diag
    gaps = [b2["tick"] - a2["tick"] for a2, b2 in zip(pa, pa[1:])]
    R["player_attack_gaps"] = gaps
    R["player_attack_gap_lt4"] = [g for g in gaps if g < 4]
    # late attacks: target adjacent & cooldown ready & alive at a tick but no attack
    late = []
    pa_ticks = {e["tick"] for e in pa}; eat_ticks = {e["tick"] for e in eats}
    for a2, b2 in zip(pa, pa[1:]):
        for t in range(a2["tick"] + 4, b2["tick"]):
            h = bytick.get(t); hp_ = bytick.get(t - 1)
            if not h or not hp_: continue
            tgt = next((e for e in hp_["en"] if e["id"] == hp_["target"] and e["alive"]), None)
            if tgt and card(tuple(hp_["p"]), (tgt["x"], tgt["z"])) and tuple(h["p"]) == tuple(hp_["p"]) and t not in eat_ticks and hp_["nat"] <= t:
                tg2 = next((e for e in h["en"] if e["id"] == hp_["target"]), None)
                if tg2 and card(tuple(h["p"]), (tg2["x"], tg2["z"])): late.append(t)
    R["missed_ready_attack_ticks"] = late
    R["eat_events"] = [(e["tick"], e.get("dmg")) for e in eats]
    R["attack_cadence_example"] = [e["tick"] for e in pa][:10]
    R["enemy_attack_ticks_by_wolf"] = {}
    for e in ea: R["enemy_attack_ticks_by_wolf"].setdefault(str(e["src"]), []).append(e["tick"])
    R["telegraph_before_bite"] = all(any(en["id"] == e["src"] and en["tel"] for en in bytick.get(e["tick"] - 1, {"en": []})["en"]) for e in ea) if ea else None
    if R["fight1_result"] == "cleared":
        time.sleep(0.2); pg.screenshot(path=S + "m2-cleared.png")
    # ---------- eat delay test: need damage taken, then eat 1 tick after an attack at T -> next attack at T+5 ----------
    D("d.restart(7)"); eat_test = {}
    for _ in range(300):
        s = snap()
        if s["room"] != "fighting" and s["room"] != "countdown": break
        alive = {e["id"]: e for e in s["en"] if e["alive"]}
        tg = alive.get(s["target"]); adj = [e for e in alive.values() if card(s["p"], (e["x"], e["z"]))]
        if tg is None: D("d.press('attack')")
        elif adj and not card(s["p"], (tg["x"], tg["z"])): D("d.press('cycle')")
        n0 = len(ev("window.__rimefall.combatLog")); D("d.step(1)")
        lg = ev("window.__rimefall.combatLog")[n0:]; s = snap()
        if s["hp"] < 40 and s["hp"] > 12 and s["food"] > 0 and any(e["type"] == "player_attack" for e in lg):
            T = s["tick"]; D("d.step(1)"); D("d.press('eat')"); p_before = snap()["p"]; D("d.step(1)"); s2 = snap()
            eats = [e["tick"] for e in ev("window.__rimefall.combatLog") if e["type"] == "eat"]
            eat_test = {"attack_tick": T, "eat_tick": eats[-1:], "nextAttackTick_after_eat": s2["nat"], "expected": T + 5, "hp_before_after": [s["hp"], s2["hp"]]}
            for _ in range(8): D("d.step(1)")
            nxt = [e["tick"] for e in ev("window.__rimefall.combatLog") if e["type"] == "player_attack" and e["tick"] > T]
            eat_test["next_attack_tick_actual"] = nxt[:1]; break
    R["eat_delay"] = eat_test
    # ---------- pathing around pillar: player at (5,8), pillar at (5,7) north ----------
    D("d.restart(3)")
    path_ok = None
    for _ in range(4):  # countdown; walk to (5,8)
        D("d.setMove(-1, 1)"); D("d.step(1)")
    for _ in range(4):
        s = snap()
        if s["p"][0] > 5: D("d.setMove(-1, 0)")
        elif s["p"][1] < 8: D("d.setMove(0, 1)")
        else: D("d.setMove(null)")
        D("d.step(1)")
    D("d.setMove(null)"); R["pillar_test_player"] = snap()["p"]
    arrive = None
    for i in range(40):
        D("d.step(1)"); s = snap()
        if any(e["alive"] and card(s["p"], (e["x"], e["z"])) for e in s["en"]): arrive = i; break
    R["pillar_test_wolf_adjacent_after_ticks"] = arrive; R["pillar_test_wolves"] = snap()["en"]
    # ---------- death screen ----------
    D("d.restart(5)")
    for _ in range(300):
        D("d.step(1)")
        if snap()["room"] == "dead": break
    R["death_state"] = snap()["room"]; time.sleep(0.2); pg.screenshot(path=S + "m2-dead.png")
    # restart via attack press
    D("d.press('attack')"); D("d.step(1)"); R["after_restart_press"] = snap()["room"]
    # ---------- balance sim ----------
    sims = []
    for seed in range(100, 100 + NSIM):
        D(f"d.restart({seed})")
        h, sv2, bv2 = run_fight(fighter, record=False)
        last = snap()
        sims.append({"seed": seed, "result": last["room"], "hp": last["hp"], "food": last["food"], "ticks": len(h), "stack": len(sv2), "blocked": len(bv2)})
    R["sim"] = sims
    wins = [s for s in sims if s["result"] == "cleared"]
    R["sim_summary"] = {"n": len(sims), "wins": len(wins), "win_rate": round(len(wins)/max(1,len(sims)), 2),
        "avg_hp_left_on_win": round(sum(s["hp"] for s in wins)/max(1,len(wins)), 1), "avg_food_left_on_win": round(sum(s["food"] for s in wins)/max(1,len(wins)), 2),
        "avg_ticks": round(sum(s["ticks"] for s in sims)/len(sims), 1), "any_stack_or_blocked": sum(s["stack"] + s["blocked"] for s in sims)}
    R["errors"] = errs; R["title"] = pg.title()
    b.close()
print(json.dumps(R, indent=1, default=str))
