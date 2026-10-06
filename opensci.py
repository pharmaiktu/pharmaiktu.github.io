"""Açık bilim: GitHub depoları + Hugging Face veri setleri/modelleri (derleme sırasında otomatik).

- GitHub: https://api.github.com/orgs/<org>/repos   (GITHUB_TOKEN varsa kullanılır; Actions'ta otomatik vardır)
- Hugging Face: https://huggingface.co/api/{datasets,models}?author=<org>&full=true
- Ağ yoksa / API hata verirse data/opensci_cache.json'daki son başarılı sonuç kullanılır.
- PHARMAI_OFFLINE=1 ortam değişkeni ağı tamamen kapatır (yalnız önbellek).
- data/opensci.yml: listeden çıkarılacaklar, Türkçe açıklama, araştırma alanı (isteğe bağlı).
"""
import json
import logging
import os
import re
import time
import urllib.request

import yaml

log = logging.getLogger(__name__)
_HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(_HERE, "data", "opensci_cache.json")
CACHE_TTL = 600   # sn — yerelde sık derlemede API'yi yormamak için (Actions'ta önbellek eski olur, hep çeker)
TIMEOUT = 10


def _get(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": "pharmai-site", **(headers or {})})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.load(r)


def _github(org):
    h = {"Accept": "application/vnd.github+json"}
    if os.environ.get("GITHUB_TOKEN"):
        h["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    out = []
    for r in _get(f"https://api.github.com/orgs/{org}/repos?per_page=100&type=public&sort=pushed", h):
        if r.get("fork") or r.get("private"):
            continue
        out.append({
            "id": r["full_name"], "name": r["name"], "kind": "repo",
            "url": r["html_url"], "homepage": r.get("homepage") or "",
            "desc": (r.get("description") or "").strip(),
            "language": r.get("language") or "", "license": (r.get("license") or {}).get("spdx_id") or "",
            "stars": r.get("stargazers_count", 0), "forks": r.get("forks_count", 0),
            "topics": r.get("topics") or [], "archived": bool(r.get("archived")),
            "updated": (r.get("pushed_at") or "")[:10], "created": (r.get("created_at") or "")[:10],
        })
    return out


def _hf_summary(text, title):
    """Kart açıklamasından ilk anlamlı 1–2 cümleyi çıkar."""
    t = re.sub(r"\s+", " ", text or "").strip()
    if title and t.startswith(title):
        t = t[len(title):].strip()
    t = re.sub(r"^(Summary|Overview|Description)\.?\s*", "", t, flags=re.I)
    sents = re.split(r"(?<=[.!?])\s+", t)
    s = sents[0] if sents else ""
    if len(s) < 90 and len(sents) > 1:
        s += " " + sents[1]
    return s[:280].rstrip() + ("…" if len(s) > 280 else "")


def _hf(org):
    out = []
    for kind in ("datasets", "models"):
        for x in _get(f"https://huggingface.co/api/{kind}?author={org}&full=true"):
            if x.get("private") or x.get("disabled"):
                continue
            cd = x.get("cardData") or {}
            title = cd.get("pretty_name") or x["id"].split("/", 1)[1]
            out.append({
                "id": x["id"], "name": title, "kind": "dataset" if kind == "datasets" else "model",
                "url": f"https://huggingface.co/{'datasets/' if kind == 'datasets' else ''}{x['id']}",
                "desc": _hf_summary(x.get("description", ""), title),
                "license": (cd.get("license") or "").upper() if isinstance(cd.get("license"), str) else "",
                "size": (cd.get("size_categories") or [""])[0],
                "tasks": cd.get("task_categories") or [],
                "topics": [t for t in x.get("tags", []) if ":" not in t][:6],
                "gated": bool(x.get("gated")),
                "downloads": x.get("downloads", 0), "likes": x.get("likes", 0),
                "updated": (x.get("lastModified") or "")[:10], "created": (x.get("createdAt") or "")[:10],
            })
    return out


def load(org_github, org_hf):
    """Depolar + veri setleri; ağ hatasında önbellek."""
    cache = {}
    if os.path.exists(CACHE):
        with open(CACHE, encoding="utf-8") as fh:
            cache = json.load(fh)
    data = dict(cache)
    # CI'da checkout dosya tarihlerini "şimdi" yapar → orada TTL'ye bakma, her zaman çek
    fresh = (not os.environ.get("GITHUB_ACTIONS") and os.path.exists(CACHE)
             and time.time() - os.path.getmtime(CACHE) < CACHE_TTL)
    if os.environ.get("PHARMAI_OFFLINE") != "1" and not fresh:
        for key, fn, org in (("github", _github, org_github), ("hf", _hf, org_hf)):
            try:
                data[key] = fn(org)
            except Exception as e:  # ağ yok, oran sınırı vb.
                log.warning("opensci: %s alınamadı (%s) — önbellek kullanılıyor", key, e)
        with open(CACHE, "w", encoding="utf-8") as fh:  # içerik aynı olsa da yaz: TTL saati sıfırlanır
            json.dump(data, fh, ensure_ascii=False, indent=2)

    cfg_path = os.path.join(_HERE, "data", "opensci.yml")
    cfg = {}
    if os.path.exists(cfg_path):
        with open(cfg_path, encoding="utf-8") as fh:
            cfg = yaml.safe_load(fh) or {}
    exclude = set(cfg.get("exclude") or [])
    extra = cfg.get("items") or {}

    items = []
    for it in data.get("github", []) + data.get("hf", []):
        if it["id"] in exclude or it.get("archived"):
            continue
        it = dict(it, **(extra.get(it["id"]) or {}))
        if isinstance(it.get("desc"), str):
            it["desc"] = {"en": it["desc"], "tr": it["desc"]}
        items.append(it)
    items.sort(key=lambda i: i["updated"], reverse=True)   # en son güncellenen önce…
    items.sort(key=lambda i: not i.get("featured"))        # …öne çıkanlar en başta (sıralama kararlı)
    return items
