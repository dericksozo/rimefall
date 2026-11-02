#!/usr/bin/env python3
"""Movement regression suite (1.2 behavior): north-facing camera, 30+ tick noisy-stick run (no skipped/stopped ticks, no flips, constant speed, exact lerp),
tick interval regularity, corner sliding, D-pad no-move, gamepad hint styling, screenshots."""
import json, math, time, statistics as st
from playwright.sync_api import sync_playwright
PAD = """(() => {
  const id='Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
  window.__fakePad={axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
  navigator.getGamepads=()=>[{id,index:0,connected:true,mapping:'standard',timestamp:performance.now(),
    axes:window.__fakePad.axes.slice(),buttons:window.__fakePad.buttons.map(b=>({...b}))},null,null,null];
})();"""
S = "/workspace/rimefall/screens/"; R = {}
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width":1280,"height":720}); pg.add_init_script(PAD)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
    import sys; pg.goto("http://localhost:8765/" + (sys.argv[1] if len(sys.argv)>1 else "?noenemies=1")); pg.wait_for_function("window.__rimefall && window.__rimefall.tick>=2", timeout=20000)
    ev = pg.evaluate; T = lambda: ev("window.__rimefall.tick"); P = lambda: ev("[window.__rimefall.player.x,window.__rimefall.player.z]")
    def wait_tick(n=1):
        t0 = T()
        while T() < t0 + n: time.sleep(0.005)
    a = ev("window.__rimefall.tileToScreen(7,7)"); n = ev("window.__rimefall.tileToScreen(7,6)"); e = ev("window.__rimefall.tileToScreen(8,7)")
    R["screen_north_vec"] = [round(n["x"]-a["x"],1), round(n["y"]-a["y"],1)]; R["screen_east_vec"] = [round(e["x"]-a["x"],1), round(e["y"]-a["y"],1)]
    pg.screenshot(path=S+"reg-start.png")
    # stick up 1 tick -> north
    ev("window.__fakePad.axes[1]=-1"); wait_tick(1); ev("window.__fakePad.axes[1]=0"); time.sleep(0.02)
    R["stick_up_moved_to"] = P(); R["stick_up_dir"] = ev("window.__rimefall.lastMoveDir"); wait_tick(1)
    # now at (7,6). Noisy run along row z=6 between x=1 and x=13, 34 ticks, driven per frame in page.
    run = ev("""() => new Promise(res => {
      const r = window.__rimefall, out = []; let dir = 1; const tStart = r.tick; let dip = 0; let seed = 12345;
      const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
      (function f(){
        const p = r.player; if (p.x >= 13) dir = -1; if (p.x <= 1) dir = 1;
        const base = dir > 0 ? 90 : 270; const ang = (base + (rnd()*16 - 8)) * Math.PI/180;
        if (dip <= 0 && rnd() < 0.08) dip = 1 + Math.floor(rnd()*3);
        const mag = dip > 0 ? 0.3 : 0.85 + rnd()*0.15; dip--;
        window.__fakePad.axes[0] = Math.sin(ang)*mag; window.__fakePad.axes[1] = -Math.cos(ang)*mag;
        const m = r.meshWorld(); out.push([performance.now(), r.tick, m.x, m.z, r.lastTickTime, dir]);
        if (r.tick - tStart < 34) requestAnimationFrame(f); else { window.__fakePad.axes[0]=0; window.__fakePad.axes[1]=0; res({frames: out, log: r.moveLog.slice(-36), tStart}); }
      })(); })""")
    log = [m for m in run["log"] if m["tick"] > run["tStart"]][:33]
    moves = [(m["toX"]-m["fromX"], m["toZ"]-m["fromZ"]) for m in log]
    R["noisy_run_ticks"] = len(moves)
    R["noisy_run_stops"] = sum(1 for d in moves if d == (0,0))
    R["noisy_run_non_EW_moves"] = sum(1 for d in moves if d[1] != 0)
    R["noisy_run_tiles_moved"] = sum(abs(d[0]) for d in moves)
    R["x_path"] = [m["toX"] for m in log]
    fr = run["frames"]
    ltt = sorted({f[4] for f in fr}); iv = [round(b2-a2,3) for a2,b2 in zip(ltt,ltt[1:])]
    R["tick_intervals_ms_min_max"] = [min(iv), max(iv)]
    # exact-lerp check: mesh x should equal from + clamp((now-lastTickTime)/600)*(to-from)
    bylog = {m["tick"]: m for m in run["log"]}; errs_l = []; speeds = []
    for f in fr:
        m = bylog.get(f[1])
        if not m: continue
        al = min(1, max(0, (f[0]-f[4])/600)); ex = m["fromX"] + al*(m["toX"]-m["fromX"])
        errs_l.append(abs(f[2]-ex))
    for a2, b2 in zip(fr, fr[1:]):
        if a2[1] == b2[1] or True:
            dt = b2[0]-a2[0]
            if dt > 4: speeds.append(abs(b2[2]-a2[2])/dt*1000)
    R["lerp_max_err_tiles"] = round(max(errs_l), 4)
    R["speed_tiles_per_s_mean_std_min_max"] = [round(st.mean(speeds),3), round(st.pstdev(speeds),3), round(min(speeds),3), round(max(speeds),3)]
    R["frames"] = len(fr)
    # Corner sliding. Go to (6,7): from current position, walk via keyboard deterministic steps.
    def key_tick(keys):
        for k in keys: pg.keyboard.down(k)
        wait_tick(1); time.sleep(0.01)
        for k in keys: pg.keyboard.up(k)
        res = (P(), ev("window.__rimefall.lastMoveDir")); wait_tick(1); return res
    # navigate to (6,7): first to row 6 col 6
    for _ in range(20):
        x, z = P()
        if (x, z) == (6, 7): break
        if z < 6: key_tick(["s"])
        elif x > 6: key_tick(["a"])
        elif x < 6: key_tick(["d"])
        elif z == 6: key_tick(["s"])
    R["corner_start"] = P()
    R["NW_from_6_7_neighbour_blocked"] = key_tick(["a","w"])   # expect slide to (6,6) (x component (5,7) blocked)
    key_tick(["s"]); key_tick(["s"])  # to (6,8)
    R["at"] = P()
    R["NW_from_6_8_target_blocked"] = key_tick(["a","w"])     # target (5,7) pillar -> x first -> (5,8)
    # stick diagonal with larger z magnitude from (6,8)? go back
    key_tick(["d"]); R["at2"] = P()
    ev("window.__fakePad.axes[0]=-0.6;window.__fakePad.axes[1]=-0.8"); wait_tick(1); time.sleep(0.01); ev("window.__fakePad.axes[0]=0;window.__fakePad.axes[1]=0")
    R["stick_37deg_from_6_8"] = [P(), ev("window.__rimefall.lastMoveDir")]; wait_tick(1)
    # D-pad
    p0 = P()
    for btn in (12,13,14,15):
        ev(f"window.__fakePad.buttons[{btn}].pressed=true"); wait_tick(2); ev(f"window.__fakePad.buttons[{btn}].pressed=false")
    R["dpad_moved"] = P() != p0
    R["hint_pad_html"] = ev("document.getElementById('hint').innerHTML")
    pg.locator("#hint").screenshot(path=S+"reg-hint-gamepad.png"); pg.screenshot(path=S+"reg-gamepad-view.png")
    R["errors"] = errs; R["title"] = pg.title(); b.close()
print(json.dumps(R, indent=1))
# --- assertions ---
A = {
 "north_up": R["screen_north_vec"][0] == 0 and R["screen_north_vec"][1] < 0,
 "east_right": R["screen_east_vec"][0] > 0 and abs(R["screen_east_vec"][1]) < 0.5,
 "stick_up_north": R["stick_up_dir"] == {"x":0,"z":-1},
 "noisy_33_tiles_no_stops_no_flips": R["noisy_run_tiles_moved"] == 33 and R["noisy_run_stops"] == 0 and R["noisy_run_non_EW_moves"] == 0,
 "ticks_exact_600": R["tick_intervals_ms_min_max"] == [600.0, 600.0],
 "lerp_err_lt_0.06": R["lerp_max_err_tiles"] < 0.06,
 "slide_neighbour_blocked": R["NW_from_6_7_neighbour_blocked"][0] == [6,6],
 "slide_target_blocked": R["NW_from_6_8_target_blocked"][0] == [5,8],
 "slide_larger_component": R["stick_37deg_from_6_8"][0] == [6,7],
 "dpad_no_move": not R["dpad_moved"],
 "no_errors": not R["errors"],
}
print("ASSERTIONS", json.dumps(A)); print("ALL_PASS" if all(A.values()) else "SOME_FAIL")
