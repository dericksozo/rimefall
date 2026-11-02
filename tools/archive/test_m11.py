#!/usr/bin/env python3
"""M1.1 tests: camera-relative stick/keyboard mapping measured in SCREEN space, D-pad not moving, straight diagonal glide,
pre-glide latency, continuous held movement, PS hint, toast for pre-connected pad."""
import json, math, time, sys
from playwright.sync_api import sync_playwright
URL = "http://localhost:8765/"; S = "/workspace/rimefall/screens/"
PAD = """(() => {
  const id='Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)';
  window.__fakePad={axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
  navigator.getGamepads=()=>[{id,index:0,connected:true,mapping:'standard',timestamp:performance.now(),
    axes:window.__fakePad.axes.slice(),buttons:window.__fakePad.buttons.map(b=>({...b}))},null,null,null];
})();"""
R = {}
def ang(dx, dy):  # 0 = screen up, clockwise, degrees
    return math.degrees(math.atan2(dx, -dy)) % 360
def adiff(a, b): return abs((a - b + 180) % 360 - 180)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width":1280,"height":720}); pg.add_init_script(PAD)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: m.type=="error" and errs.append(m.text))
    pg.goto(URL); pg.wait_for_function("window.__rimefall && window.__rimefall.tick>=1", timeout=20000); time.sleep(0.3)
    R["toast_preconnected"] = pg.evaluate("document.getElementById('toast').textContent + ' | visible=' + document.getElementById('toast').classList.contains('visible')")
    ev = lambda js: pg.evaluate(js)
    T = lambda: ev("window.__rimefall.tick")
    def wait_tick(n=1):
        t0 = T()
        while T() < t0 + n: time.sleep(0.01)
    def stick(x, y): ev(f"window.__fakePad.axes[0]={x};window.__fakePad.axes[1]={y}")
    def one_step(x, y):
        stick(x, y); wait_tick(1); time.sleep(0.02)
        st = ev("(()=>{const r=window.__rimefall,p=r.player,d=r.lastMoveDir;return{p:[p.x,p.z],d:d,dev:r.inputDevice}})()")
        stick(0, 0); wait_tick(1); time.sleep(0.05)
        d = st["d"]; px, pz = st["p"]
        if not d: return {"stick":[x,y],"dir":None}
        # screen direction of chosen grid dir, measured from the tile before the move
        bx, bz = px - d["x"], pz - d["z"]  # if moved; if blocked, player didn't move — compute from current tile
        a = ev(f"window.__rimefall.tileToScreen({px},{pz})"); c = ev(f"window.__rimefall.tileToScreen({px+d['x']},{pz+d['z']})")
        sa = ang(c["x"]-a["x"], c["y"]-a["y"])
        return {"stick":[x,y], "stick_ang":round(ang(x,y),1), "grid_dir":[d["x"],d["z"]], "screen_ang":round(sa,1), "err_deg":round(adiff(sa, ang(x,y)),1), "tile_after":st["p"], "dev":st["dev"]}
    # Make sure we're centered: start at spawn
    R["stick_tests"] = [one_step(*v) for v in [(0,-1),(0,1),(1,0),(-1,0),(0.6,-0.8),(0.707,-0.707),(-0.707,0.707),(0.26,-0.97),(0.5,-0.866)]]
    # multi-tick up-screen run: every tick should move up the screen
    pos0 = ev("window.__rimefall.tileToScreen(window.__rimefall.player.x, window.__rimefall.player.z)")
    stick(0,-1); traj=[]
    for i in range(4):
        wait_tick(1); time.sleep(0.02); traj.append(ev("(()=>{const r=window.__rimefall;return [r.player.x,r.player.z]})()"))
    stick(0,0); wait_tick(1)
    R["up_run_tiles"] = traj
    # Keyboard W / D in screen space
    def key_step(keys):
        for k in keys: pg.keyboard.down(k)
        wait_tick(1); time.sleep(0.02); d = ev("window.__rimefall.lastMoveDir"); pl = ev("[window.__rimefall.player.x,window.__rimefall.player.z]")
        for k in keys: pg.keyboard.up(k)
        wait_tick(1)
        a = ev(f"window.__rimefall.tileToScreen({pl[0]},{pl[1]})"); c = ev(f"window.__rimefall.tileToScreen({pl[0]+d['x']},{pl[1]+d['z']})")
        return {"keys":keys, "grid_dir":[d["x"],d["z"]], "screen_ang":round(ang(c["x"]-a["x"], c["y"]-a["y"]),1)}
    R["keyboard"] = [key_step(k) for k in (["s"],["w"],["d"],["a"],["w","d"])]
    # D-pad must not move
    p0 = ev("[window.__rimefall.player.x,window.__rimefall.player.z]")
    for btn in (12,13,14,15):
        ev(f"window.__fakePad.buttons[{btn}].pressed=true;window.__fakePad.buttons[{btn}].value=1"); wait_tick(2)
        ev(f"window.__fakePad.buttons[{btn}].pressed=false;window.__fakePad.buttons[{btn}].value=0")
    R["dpad_moved"] = ev("[window.__rimefall.player.x,window.__rimefall.player.z]") != p0
    # Back to spawn region: walk down-screen a couple steps for room
    # Latency: from idle, press stick right mid-tick, sample mesh
    wait_tick(1); time.sleep(0.25)
    m0 = ev("window.__rimefall.meshWorld()"); tk0 = T(); stick(1,0); t0 = time.time(); samples = []
    while time.time() - t0 < 2.0:
        samples.append((round(time.time()-t0,3), T(), ev("window.__rimefall.meshWorld()"))); time.sleep(0.03)
    stick(0,0)
    first_move = next((s[0] for s in samples if math.hypot(s[2]["x"]-m0["x"], s[2]["z"]-m0["z"]) > 0.01), None)
    R["latency_first_visual_move_s"] = first_move
    R["first_tick_after_press_s"] = next((s[0] for s in samples if s[1] > tk0), None)
    # Continuous: speed between consecutive samples after first tick shouldn't hit ~0 while moving
    sp = [math.hypot(b2[2]["x"]-a2[2]["x"], b2[2]["z"]-a2[2]["z"])/(b2[0]-a2[0]+1e-6) for a2,b2 in zip(samples,samples[1:]) if a2[1] > tk0]
    R["held_speed_min_max"] = [round(min(sp),2), round(max(sp),2)] if sp else None
    wait_tick(2)
    # Straight diagonal glide: hold diagonal, sample mesh within a tick, check deviation from line
    stick(0.707,0.707); wait_tick(1); dev=[]; tk=T(); pts=[]
    while T() == tk: pts.append(ev("window.__rimefall.meshWorld()")); time.sleep(0.02)
    d = ev("window.__rimefall.lastMoveDir"); pl = ev("[window.__rimefall.player.x,window.__rimefall.player.z]")
    stick(0,0)
    R["diag_dir"] = d
    if d and d["x"] and d["z"]:
        # line through pts: check cross-product deviation from straight line in direction d
        L = math.hypot(d["x"], d["z"]); ux, uz = d["x"]/L, d["z"]/L
        x0, z0 = pts[0]["x"], pts[0]["z"]
        R["diag_max_perp_dev"] = round(max(abs((q["x"]-x0)*uz - (q["z"]-z0)*ux) for q in pts), 4)
    wait_tick(2)
    R["hint_pad"] = ev("window.__rimefall.hintText")
    pg.locator("#hint").screenshot(path=S+"m11-hint-gamepad.png"); pg.screenshot(path=S+"m11-gamepad-full.png")
    pg.keyboard.press("d"); time.sleep(0.2); R["hint_kbd"] = ev("window.__rimefall.hintText")
    pg.locator("#hint").screenshot(path=S+"m11-hint-keyboard.png")
    R["errors"] = errs; R["title"] = pg.title()
    b.close()
print(json.dumps(R, indent=1))
