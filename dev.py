"""Yerel geliştirme: siteyi derler, http://localhost:8001 adresinde sunar ve
content/, data/, themes/ ya da pelicanconf.py değiştikçe baştan derler.

    python dev.py            # varsayılan port 8001
    python dev.py 8080

Not: `pelican -r` ayarları yalnız bir kez okur; data/*.yml ve papers.bib
değişikliklerini görmez. Bu betik her değişiklikte ayrı bir süreçte derler.
"""
import functools
import http.server
import os
import subprocess
import sys
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
WATCH = ["content", "data", "themes", "pelicanconf.py", "opensci.py"]


def snapshot():
    stamp = {}
    for w in WATCH:
        p = os.path.join(ROOT, w)
        if os.path.isfile(p):
            stamp[p] = os.path.getmtime(p)
            continue
        for d, _, files in os.walk(p):
            for f in files:
                if f == "opensci_cache.json":   # derlemenin kendi yazdığı önbellek; izlenirse döngü olur
                    continue
                fp = os.path.join(d, f)
                stamp[fp] = os.path.getmtime(fp)
    return stamp


def build():
    t = time.time()
    r = subprocess.run([sys.executable, "-m", "pelican", "content", "-o", "output", "-s", "pelicanconf.py", "-q"],
                       cwd=ROOT, capture_output=True, text=True)
    msg = "derlendi" if r.returncode == 0 else "HATA"
    print(f"[{time.strftime('%H:%M:%S')}] {msg} ({time.time() - t:.1f} sn)", flush=True)
    if r.returncode or r.stderr.strip():
        print((r.stdout + r.stderr).strip(), flush=True)


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=os.path.join(ROOT, "output"))
    handler.log_message = lambda *a: None
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler).serve_forever()


if __name__ == "__main__":
    build()
    threading.Thread(target=serve, daemon=True).start()
    print(f"→ http://localhost:{PORT}/  (TR: /tr/)  — Ctrl+C ile durdur", flush=True)
    last = snapshot()
    try:
        while True:
            time.sleep(1)
            now = snapshot()
            if now != last:
                last = now
                build()
    except KeyboardInterrupt:
        pass
