"""Scripted players for balance sims (tooling). Each returns an action for the next tick given a snapshot."""
from rf import card
DIRS = [(1,0),(-1,0),(0,1),(0,-1),(1,1),(1,-1),(-1,1),(-1,-1)]
def adj_wolves(s): return [e for e in s["en"] if card(s["p"], (e["x"], e["z"]))]
def facing_wolf(s):
    fx, fz = s["f"]; t = (s["p"][0]+fx, s["p"][1]+fz)
    if abs(fx) + abs(fz) != 1: return None
    return next((e for e in s["en"] if (e["x"], e["z"]) == t), None)
def fighter(g, s):
    """Stand and fight: never steps; turns to face an adjacent wolf; attacks when ready; eats < 15."""
    g.move(None)
    if s["hp"] < 15 and s["food"] > 0: g.press("eat"); return
    fw = facing_wolf(s); ready = s["tick"] + 1 >= s["nat"]
    if fw and ready: g.press("attack"); return
    if not fw:
        a = adj_wolves(s)
        if a: g.move(a[0]["x"]-s["p"][0], a[0]["z"]-s["p"][1])
def legal(g, s, dx, dz, occ):
    x, z = s["p"]; nx, nz = x+dx, z+dz
    if (nx, nz) in occ or not g.walkable(nx, nz): return False
    if dx and dz and (not g.walkable(x+dx, z) or not g.walkable(x, z+dz) or (x+dx, z) in occ or (x, z+dz) in occ): return False
    return True
def dodger(g, s):
    """OSRS step-off player: step directly away from a telegraphing adjacent wolf (unless it can trade an attack it is
    facing and ready for), step back in while that wolf is in its post-attack wait (which also faces it), attack when ready, eat < 15."""
    g.move(None)
    occ = {(e["x"], e["z"]) for e in s["en"]}; ready = s["tick"] + 1 >= s["nat"]; px, pz = s["p"]
    threat = [e for e in adj_wolves(s) if e["tel"]]
    fw = facing_wolf(s)
    if threat:
        if fw and ready and s["hp"] >= 15:
            g.press("attack"); return
        cands = []
        for dx, dz in DIRS:
            if not legal(g, s, dx, dz, occ): continue
            np_ = (px+dx, pz+dz)
            if any(card(np_, (e["x"], e["z"])) for e in s["en"] if e["tel"]): continue
            away = any((dx, dz) == (px-e["x"], pz-e["z"]) for e in threat)  # straight back from the wolf
            score = sum(1 for e in s["en"] if card(np_, (e["x"], e["z"]))) * 2 - (1 if away else 0)
            cands.append((score, dx, dz))
        if cands:
            cands.sort(); g.move(cands[0][1], cands[0][2]); return
    if s["hp"] < 15 and s["food"] > 0: g.press("eat"); return
    if fw and ready: g.press("attack"); return
    if not adj_wolves(s):
        # step back toward a frozen wolf two tiles away in a straight line (lands adjacent, facing it)
        for e in s["en"]:
            dx, dz = e["x"]-px, e["z"]-pz
            if abs(dx) + abs(dz) == 2 and (dx == 0 or dz == 0) and s["tick"] + 1 < e["wait"]:
                sx, sz = (dx > 0) - (dx < 0), (dz > 0) - (dz < 0)
                np_ = (px+sx, pz+sz)
                others = [o for o in s["en"] if o["id"] != e["id"] and card(np_, (o["x"], o["z"])) and o["tel"]]
                if legal(g, s, sx, sz, occ) and not others: g.move(sx, sz); return
    fighter(g, s)

_walk = {}
def _w(g, x, z):
    if (x, z) not in _walk: _walk[(x, z)] = g.walkable(x, z)
    return _walk[(x, z)]
def approach_step(g, s):
    """Player-side BFS (player is smart, NPCs are not): first step toward a free tile cardinally adjacent to any wolf."""
    from collections import deque
    occ = {(e["x"], e["z"]) for e in s["en"]}
    goals = {(e["x"]+dx, e["z"]+dz) for e in s["en"] for dx, dz in ((1,0),(-1,0),(0,1),(0,-1))}
    goals = {t for t in goals if _w(g, *t) and t not in occ}
    start = tuple(s["p"]); prev = {start: None}; q = deque([start])
    while q:
        c = q.popleft()
        if c in goals and c != start:
            while prev[c] != start: c = prev[c]
            return (c[0]-start[0], c[1]-start[1])
        for dx, dz in DIRS:
            n = (c[0]+dx, c[1]+dz)
            if n in prev or n in occ or not _w(g, *n): continue
            if dx and dz and (not _w(g, c[0]+dx, c[1]) or not _w(g, c[0], c[1]+dz)): continue
            prev[n] = c; q.append(n)
    return None
_last = {}
def dodger_engage(g, s):
    """dodger + breaks safespot stalemates: if no wolf adjacent and wolves haven't moved for 3 ticks, walk toward one."""
    key = tuple(sorted((e["x"], e["z"]) for e in s["en"]))
    st = _last.get("k"); _last["n"] = _last.get("n", 0) + 1 if st == key else 0; _last["k"] = key
    if not adj_wolves(s) and _last["n"] >= 3 and not any(e["tel"] for e in s["en"]):
        d = approach_step(g, s)
        if d: g.move(*d); return
    dodger(g, s)
