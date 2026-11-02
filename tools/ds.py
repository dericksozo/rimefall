#!/usr/bin/env python3
"""DeepSeek caller: ds.py <name> <prompt_file> [--effort max] [--max-tokens N]
Saves prompt/response to ai-log, appends usage.jsonl, prints content to ai-log/<name>.content.md"""
import json, os, sys, time, urllib.request, argparse, datetime
ap = argparse.ArgumentParser()
ap.add_argument("name"); ap.add_argument("prompt_file")
ap.add_argument("--effort", default="max"); ap.add_argument("--max-tokens", type=int, default=64000)
ap.add_argument("--system", default=None)
ap.add_argument("--field", default="reasoning_effort")
a = ap.parse_args()
LOG = "/workspace/rimefall/ai-log"
msgs = []
if a.system: msgs.append({"role": "system", "content": open(a.system).read()})
msgs.append({"role": "user", "content": open(a.prompt_file).read()})
body = {"model": "deepseek-flash", "messages": msgs, "max_tokens": a.max_tokens, a.field: a.effort}
json.dump(body, open(f"{LOG}/{a.name}.request.json", "w"), indent=1)
req = urllib.request.Request("https://api.deepseek.com/chat/completions", data=json.dumps(body).encode(),
    headers={"Content-Type": "application/json", "Authorization": "Bearer " + os.environ["DEEPSEEK_API_KEY"]})
t0 = time.time()
try:
    raw = urllib.request.urlopen(req, timeout=1500).read().decode()
except urllib.error.HTTPError as e:
    raw = e.read().decode(); print("HTTP", e.code, raw); open(f"{LOG}/{a.name}.error.json","w").write(raw); sys.exit(1)
open(f"{LOG}/{a.name}.response.json", "w").write(raw)
r = json.loads(raw); u = r.get("usage", {})
rec = {"ts": datetime.datetime.now().isoformat(), "name": a.name, "effort_field": a.field, "effort": a.effort,
       "secs": round(time.time()-t0,1), "prompt_tokens": u.get("prompt_tokens"), "completion_tokens": u.get("completion_tokens"),
       "reasoning_tokens": (u.get("completion_tokens_details") or {}).get("reasoning_tokens"),
       "cache_hit": u.get("prompt_cache_hit_tokens"), "usage_raw": u, "finish": r["choices"][0].get("finish_reason")}
open(f"{LOG}/usage.jsonl", "a").write(json.dumps(rec) + "\n")
m = r["choices"][0]["message"]
open(f"{LOG}/{a.name}.content.md", "w").write(m.get("content") or "")
if m.get("reasoning_content"): open(f"{LOG}/{a.name}.reasoning.md", "w").write(m["reasoning_content"])
print(json.dumps(rec))
