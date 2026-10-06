#!/usr/bin/env bash
# Geliştirme sunucusunu arka planda (yeniden) başlatır: http://localhost:8001
cd "$(dirname "$0")"
PY="${PYTHON:-$HOME/miniconda3/envs/blog/bin/python}"
for p in $(pgrep -f "dev[.]py"); do [ "$p" != "$$" ] && kill "$p" 2>/dev/null; done
sleep 1
nohup "$PY" dev.py > /tmp/pharm_dev.log 2>&1 < /dev/null &
sleep 4
cat /tmp/pharm_dev.log
