#!/usr/bin/env python3
"""extract.py <content.md> : writes files delimited by '=== FILE: path ===' ... '=== END FILE ===' into project root."""
import re, sys, os
root = "/workspace/rimefall"; txt = open(sys.argv[1]).read()
for m in re.finditer(r"^=== FILE: (\S+) ===\n(.*?)^=== END FILE ===", txt, re.S | re.M):
    p, body = m.group(1), m.group(2)
    body = re.sub(r"^```[a-z]*\n", "", body); body = re.sub(r"\n```\s*$", "\n", body)
    assert not p.startswith("/") and ".." not in p and not p.startswith("tools/") and not p.startswith("ai-log/")
    fp = os.path.join(root, p); os.makedirs(os.path.dirname(fp), exist_ok=True); open(fp, "w").write(body)
    print("wrote", p, len(body.splitlines()), "lines")
