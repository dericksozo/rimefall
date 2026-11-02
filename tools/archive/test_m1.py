#!/usr/bin/env python3
"""Milestone 1 test harness: loads the game headless, checks console errors, movement per tick, blocking, gamepad path, screenshots."""
import json, sys, time
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/"
tag = sys.argv[2] if len(sys.argv) > 2 else "run"
S = "/workspace/rimefall/screens/"
FAKE_PAD = """
(() => {
  window.__fakePad = { axes:[0,0,0,0], buttons: Array.from({length:17},()=>({pressed:false,value:0,touched:false})), connected:false };
  const mk = () => ({ id:'Fake Xbox Wireless Controller (STANDARD GAMEPAD)', index:0, connected:true, mapping:'standard', timestamp:performance.now(),
     axes: window.__fakePad.axes.slice(), buttons: window.__fakePad.buttons.map(b=>({...b})) });
  navigator.getGamepads = () => window.__fakePad.connected ? [mk(),null,null,null] : [null,null,null,null];
  window.__connectPad = () => { window.__fakePad.connected = true; const e = new Event('gamepadconnected'); e.gamepad = mk(); window.dispatchEvent(e); };
})();
"""
res = {"errors": [], "checks": {}}
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg = b.new_page(viewport={"width":1280,"height":720})
    pg.add_init_script(FAKE_PAD)
    logs = []
    pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
    pg.on("pageerror", lambda e: res["errors"].append("pageerror: "+str(e)))
    pg.goto(URL); 
    try: pg.wait_for_function("window.__rimefall && window.__rimefall.tick >= 1", timeout=20000)
    except Exception as e: res["errors"].append("no hook/tick: "+str(e))
    st = lambda: pg.evaluate("(() => { const r=window.__rimefall; return {tick:r.tick, p:r.player, dev:r.inputDevice, paused:r.paused}; })()")
    pg.screenshot(path=S+f"m1-{tag}-start.png")
    s0 = st(); res["start"] = s0
    # Move east (D) for ~2.4s, sample per tick
    samples = []
    pg.keyboard.down("d"); t=time.time()
    while time.time()-t < 2.6:
        samples.append(st()); time.sleep(0.1)
        if time.time()-t > 1.2 and "mid" not in res: pg.screenshot(path=S+f"m1-{tag}-moving.png"); res["mid"]=1
    pg.keyboard.up("d"); time.sleep(0.7)
    s1 = st(); res["after_D"] = s1
    # per tick: tile changes at most 1 per tick
    bytick = {}
    for s in samples: bytick.setdefault(s["tick"], s["p"])
    ticks = sorted(bytick); steps = [abs(bytick[b2]["x"]-bytick[a]["x"])+abs(bytick[b2]["z"]-bytick[a]["z"]) for a,b2 in zip(ticks,ticks[1:])]
    res["checks"]["D_steps_per_tick"] = steps
    res["checks"]["moved_east"] = s1["p"]["x"] > s0["p"]["x"]
    # blocking: walk W for a long time until wall; then probe blockers
    info = pg.evaluate("(() => { const r=window.__rimefall; return {blockers:r.blockers}; })()")
    res["blockers"] = info["blockers"]
    pg.keyboard.down("w"); time.sleep(6); pg.keyboard.up("w"); time.sleep(0.7)
    s2 = st(); res["after_W_6s"] = s2
    w_ok = pg.evaluate(f"window.__rimefall.isWalkable({s2['p']['x']},{s2['p']['z']})")
    res["checks"]["on_walkable_after_W"] = w_ok
    pg.keyboard.down("a"); time.sleep(7); pg.keyboard.up("a"); time.sleep(0.7)
    s3 = st(); res["after_A_7s"] = s3
    res["checks"]["on_walkable_after_A"] = pg.evaluate(f"window.__rimefall.isWalkable({s3['p']['x']},{s3['p']['z']})")
    pg.screenshot(path=S+f"m1-{tag}-corner.png")
    # pause
    pg.keyboard.press("Escape"); time.sleep(1.5); a=st(); time.sleep(1.3); bb=st()
    res["checks"]["pause_stops_ticks"] = a["paused"] and a["tick"]==bb["tick"]
    pg.screenshot(path=S+f"m1-{tag}-paused.png")
    pg.keyboard.press("Escape"); time.sleep(0.8)
    res["checks"]["unpaused"] = not st()["paused"]
    # gamepad
    pg.evaluate("window.__connectPad()"); time.sleep(0.5)
    pg.screenshot(path=S+f"m1-{tag}-padconnect.png")
    g0 = st()
    pg.evaluate("window.__fakePad.axes[0]=0.9; window.__fakePad.axes[1]=0"); time.sleep(2.0)
    pg.evaluate("window.__fakePad.axes[0]=0; window.__fakePad.axes[1]=0"); time.sleep(0.7)
    g1 = st(); res["pad_before"]=g0; res["pad_after_right"]=g1
    res["checks"]["pad_moves"] = (g1["p"]["x"],g1["p"]["z"]) != (g0["p"]["x"],g0["p"]["z"])
    res["checks"]["pad_device"] = g1["dev"]
    # deadzone: small stick shouldn't move
    pg.evaluate("window.__fakePad.axes[0]=0.2"); time.sleep(1.5); g2=st(); pg.evaluate("window.__fakePad.axes[0]=0")
    res["checks"]["deadzone_holds"] = (g2["p"]["x"],g2["p"]["z"]) == (g1["p"]["x"],g1["p"]["z"])
    # start button pause
    pg.evaluate("window.__fakePad.buttons[9].pressed=true; window.__fakePad.buttons[9].value=1"); time.sleep(0.2)
    pg.evaluate("window.__fakePad.buttons[9].pressed=false; window.__fakePad.buttons[9].value=0"); time.sleep(0.3)
    res["checks"]["start_pauses"] = st()["paused"]
    pg.evaluate("window.__fakePad.buttons[9].pressed=true"); time.sleep(0.2); pg.evaluate("window.__fakePad.buttons[9].pressed=false"); time.sleep(0.3)
    # diagonal: hold d+s
    d0=st(); pg.keyboard.down("d"); pg.keyboard.down("s"); time.sleep(1.9); pg.keyboard.up("d"); pg.keyboard.up("s"); time.sleep(0.7); d1=st()
    res["diag"] = [d0["p"], d1["p"]]; res["checks"]["kbd_device_back"] = d1["dev"]
    pg.screenshot(path=S+f"m1-{tag}-final.png")
    fps = pg.evaluate("new Promise(r=>{let n=0;const t=performance.now();function f(){n++; if(performance.now()-t<1000) requestAnimationFrame(f); else r(n);} requestAnimationFrame(f);})")
    res["fps_headless"] = fps
    res["console"] = [l for l in logs if not l.startswith("debug")][:30]
    b.close()
print(json.dumps(res, indent=1))
