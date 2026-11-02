#!/usr/bin/env python3
"""Corner-cut check: from (6,7), NW to (5,6) must be blocked because (5,7) is a pillar. Then NE (7,6) open diagonal must work."""
import time, json
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"])
    pg = b.new_page(); pg.goto("http://localhost:8765/")
    pg.wait_for_function("window.__rimefall && window.__rimefall.tick>=1", timeout=20000)
    P = lambda: pg.evaluate("[window.__rimefall.player.x, window.__rimefall.player.z]")
    pg.keyboard.down("a")
    while P()[0] != 6: time.sleep(0.03)
    pg.keyboard.up("a"); time.sleep(0.1); out = {"start": P()}
    pg.keyboard.down("a"); pg.keyboard.down("w"); time.sleep(1.5); pg.keyboard.up("a"); pg.keyboard.up("w"); time.sleep(0.1)
    out["after_NW_blocked_corner"] = P()
    pg.keyboard.down("d"); pg.keyboard.down("w")
    while P()[1] == 7: time.sleep(0.03)
    pg.keyboard.up("d"); pg.keyboard.up("w"); out["after_NE_open"] = P()
    print(json.dumps(out)); b.close()
