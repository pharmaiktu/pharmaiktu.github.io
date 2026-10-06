# PharmAI — Innovative AI Applications in Pharmacology

Website of the **PharmAI** research group at Karadeniz Technical University —
built with [Pelican](https://getpelican.com) and the custom **Molecula** theme. English + Türkçe.

## Run locally

```bash
pip install -r requirements.txt
python dev.py          # → http://localhost:8001  (Türkçe: /tr/)
```

`dev.py` rebuilds the whole site whenever `content/`, `data/`, `themes/` or `pelicanconf.py` changes.

## Where is what?

| What | File |
|---|---|
| Team members | `data/members.yml` (photo → `content/images/team/`) |
| Projects | `data/projects.yml` |
| Research areas | `data/research.yml` |
| Theses | `data/theses.yml` |
| Publications | `content/extra/papers.bib` (`selected = "true"` → home page, `index = "SCI-E"` → badge) |
| News | `content/news/*.md` — one English file + one `-tr.md` file with the same `Slug` |
| UI texts (EN / TR) | `UI` and `UI_TR` in `pelicanconf.py` |
| Contact | `CONTACT` in `pelicanconf.py` |
| Theme | `themes/molecula/` (templates, `static/css/molecula.css`, `static/js/molecula.js`) |

Publication counts per member, member highlighting in author lists and the statistics on the
home page are computed automatically from `papers.bib` and the YAML files.

## Deploy

Pushing to `main` builds the site with `publishconf.py` and deploys it via GitHub Pages
(*Settings → Pages → Source: GitHub Actions*).
