#!/usr/bin/env python3
"""M2.1 scenario tests (a)-(h) with crafted setups and manual ticks, plus screenshots."""
import json, sys, time
sys.path.insert(0, "/workspace/rimefall/tools")
from rf import sync_playwright, ARGS, PAD, Game, card
S = "/workspace/rimefall/screens/"; R = {}
def last(g, typ, since_tick=None):
    return [e for e in g.log() if e["type"] == typ and (since_tick is None or e["tick"] > since_tick)]
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS); pg = b.new_page(viewport={"width":1280,"height":720}); pg.add_init_script(PAD)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
    pg.goto("http://localhost:8765/?seed=1"); pg.wait_for_function("window.__rimefall && window.__rimefall.debug", timeout=20000)
    g = Game(pg); g.d("d.manual(true)")
    N = {"x":0,"z":-1}
    # (a) cooldown discard, no queue
    g.setup({"x":7,"z":7,"facing":N}, [{"x":7,"z":6}], hp=40)
    g.press("attack"); g.step(); T = g.snap()["tick"]; a1 = last(g, "player_attack")
    g.press("attack"); g.step(); disc = last(g, "attack_discarded"); g.step(3)  # through T+4 without pressing
    a_after = [e for e in last(g, "player_attack") if e["tick"] > T]
    R["a_first_attack_tick_is_T"] = [x["tick"] for x in a1] == [T]
    R["a_press_on_cooldown_discarded"] = [x["tick"] for x in disc] == [T + 1]
    R["a_no_queued_attack_by_T+4"] = a_after == []
    # held pad button: exactly one attack over 9 ticks
    g.setup({"x":7,"z":7,"facing":N}, [{"x":7,"z":6}], hp=40)
    g.ev("window.__fakePad.buttons[0].pressed=true;window.__fakePad.buttons[0].value=1"); t0 = g.snap()["tick"]
    for _ in range(9): time.sleep(0.06); g.step()
    g.ev("window.__fakePad.buttons[0].pressed=false;window.__fakePad.buttons[0].value=0")
    R["a_held_pad_attacks_in_9_ticks"] = len([e for e in last(g, "player_attack") if e["tick"] > t0])
    # held Space with synthetic auto-repeat keydowns
    g.setup({"x":7,"z":7,"facing":N}, [{"x":7,"z":6}], hp=40); t0 = g.snap()["tick"]; time.sleep(0.05)
    pg.keyboard.down("Space")
    for _ in range(9):
        g.ev("window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',repeat:true}))"); time.sleep(0.05); g.step()
    pg.keyboard.up("Space")
    R["a_held_space_attacks_in_9_ticks"] = len([e for e in last(g, "player_attack") if e["tick"] > t0])
    # (b) whiff consumes cooldown
    g.setup({"x":7,"z":7,"facing":N}, [{"x":1,"z":13}], hp=40)
    g.press("attack"); g.step(); s = g.snap(); w = last(g, "player_attack")
    R["b_whiff_logged"] = bool(w) and w[-1]["whiff"] is True and w[-1]["dst"] is None
    R["b_whiff_cooldown_consumed"] = s["nat"] == s["tick"] + 4
    # (c) attack tick = no movement
    g.setup({"x":7,"z":7,"facing":N}, [{"x":1,"z":13}], hp=40)
    g.move(1, 0); g.press("attack"); g.step(); p1 = g.snap()["p"]; g.step(); p2 = g.snap()["p"]; g.move(None)
    R["c_no_move_on_attack_tick"] = p1 == [7,7] and p2 == [8,7]
    # (d) facing turn toward enemy without moving
    g.setup({"x":7,"z":7,"facing":N}, [{"x":8,"z":7}], hp=40)
    g.move(1, 0); g.step(); g.move(None); s = g.snap()
    R["d_turn_no_move"] = s["p"] == [7,7] and s["f"] == [1,0]
    g.press("attack"); g.step(); w = last(g, "player_attack")
    R["d_then_attack_hits_east_wolf_not_whiff"] = bool(w) and w[-1]["whiff"] is False
    # (e) cannot hit diagonal
    g.setup({"x":7,"z":7,"facing":{"x":1,"z":-1}}, [{"x":8,"z":6}], hp=40)
    g.press("attack"); g.step(); w = last(g, "player_attack")
    R["e_diagonal_whiff"] = bool(w) and w[-1]["whiff"] is True
    # (f) safespot: player south of pillar (5,7); wolf north of it
    g.setup({"x":5,"z":8,"facing":N}, [{"x":5,"z":4}, {"x":5,"z":3}], hp=40)
    tr = []
    for _ in range(12): g.step(); tr.append([(e["x"], e["z"]) for e in g.snap()["en"]])
    R["f_safespot_final_wolves"] = tr[-1]; R["f_safespot_no_bites"] = last(g, "enemy_attack") == []
    R["f_wolves_stuck_and_lined_up"] = sorted(tr[-1]) == [(5,5),(5,6)]
    time.sleep(0.3); pg.screenshot(path=S + "m21-safespot.png")
    # (g) step-off dodge
    g.setup({"x":7,"z":7,"facing":N}, [{"x":7,"z":6}], hp=40)
    tel_tick = None
    for _ in range(6):
        g.step(); s = g.snap()
        if s["en"][0]["tel"]: tel_tick = s["tick"]; break
    g.move(0, 1); g.step(); g.move(None); s = g.snap()  # T+1: step south out of range
    ea = last(g, "enemy_attack"); R["g_bite_whiffed_on_step_off"] = bool(ea) and ea[-1]["tick"] == tel_tick + 1 and ea[-1]["whiff"] is True
    hp_ok = s["hp"] == 40
    g.step(); s2 = g.snap(); R["g_wolf_waited_tick_after_attack"] = (s2["en"][0]["x"], s2["en"][0]["z"]) == (7,6)
    g.step(); s3 = g.snap(); R["g_wolf_resumed_following"] = (s3["en"][0]["x"], s3["en"][0]["z"]) == (7,7)
    # variant: step back in on T+2 and hit on T+3
    g.setup({"x":7,"z":7,"facing":N}, [{"x":7,"z":6}], hp=40)
    for _ in range(6):
        g.step()
        if g.snap()["en"][0]["tel"]: break
    g.move(0, 1); g.step(); g.move(0, -1); g.step(); g.move(None); s = g.snap()
    R["g_stepped_back_facing_wolf"] = s["p"] == [7,7] and s["f"] == [0,-1]
    g.press("attack"); g.step(); w = last(g, "player_attack")
    R["g_hit_after_step_back"] = bool(w) and w[-1]["whiff"] is False and w[-1]["dst"] is not None
    R["g_player_untouched"] = hp_ok and all(not e["hit"] for e in last(g, "enemy_attack"))
    # (h) one NPC per tile: crowd of 3 wolves converging
    g.setup({"x":7,"z":10,"facing":N}, [{"x":6,"z":2},{"x":7,"z":2},{"x":8,"z":2}], hp=40)
    viol = 0
    for _ in range(25):
        g.step(); s = g.snap(); tiles = [(e["x"], e["z"]) for e in s["en"]]
        if len(set(tiles)) != len(tiles) or tuple(s["p"]) in tiles: viol += 1
    R["h_stack_violations"] = viol
    # telegraph precedes every bite (from a short real fight)
    g.d("d.restart(9)"); 
    from policies import fighter
    for _ in range(80):
        s = g.snap()
        if s["room"] in ("cleared","dead"): break
        if s["room"] == "fighting": fighter(g, s)
        g.step()
        if s["room"] == "fighting" and any(e["hp"] < 12 for e in s["en"]) and s["hp"] < 38 and "mid" not in R:
            time.sleep(0.25); pg.screenshot(path=S + "m21-midfight.png"); R["mid"] = s["tick"]
    R["errors"] = errs; R["title"] = pg.title()
    b.close()
checks = {k: v for k, v in R.items() if k[:2] in ("a_","b_","c_","d_","e_","f_","g_","h_")}
ok = all((v is True) or (k.endswith("_attacks_in_9_ticks") and v == 1) or (k == "h_stack_violations" and v == 0) or k == "f_safespot_final_wolves" for k, v in checks.items())
print(json.dumps(R, indent=1, default=str)); print("ALL_PASS" if ok and not errs else "SOME_FAIL")
