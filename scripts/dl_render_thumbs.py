import sys, io, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oxy import Client
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = json.load(open(os.path.join(ROOT, "data", "projects.json"), encoding="utf-8"))
c = Client(login=False)
print("출구", c.ip()["ip"])
ok = skip = fail = 0
for p in d["projects"]:
    if not p["renders"]:
        continue
    folder = os.path.join(ROOT, *p["localDir"].split("/"))
    for n, r in enumerate(p["renders"], 1):
        dest = os.path.join(folder, f"render_{n}__{r['id']}.jpg")
        st, _ = c.download(r["thumb"], dest)
        ok += st == "ok"; skip += st == "skip"; fail += st not in ("ok", "skip")
    print(f"  {p['name'][:18]:18} {len(p['renders'])}장")
print(f"ok {ok} skip {skip} fail {fail}")
