"""PharmAI — KTÜ araştırma grubu sitesi (Pelican).

İçerik nerede?
  data/members.yml   → Ekip            data/projects.yml → Projeler
  data/research.yml  → Araştırma       data/theses.yml   → Tezler
  content/extra/papers.bib → Yayınlar  content/news/     → Haberler (Markdown)
Arayüz metinleri bu dosyanın sonundaki UI (İngilizce) ve UI_TR (Türkçe) sözlüklerinde.
"""
import datetime
import os
import re
import unicodedata

import yaml
from pybtex.database import parse_file

import opensci

CURRENT_YEAR = datetime.date.today().year

AUTHOR = "PharmAI"
SITENAME = "PharmAI"
SITEURL = ""
MAIN_SITEURL = ""          # statik dosyalar (görseller, tema) her iki dilde de buradan
PATH = "content"
TIMEZONE = "Europe/Istanbul"
DEFAULT_LANG = "en"
DEFAULT_DATE_FORMAT = "%d %b %Y"

THEME = "themes/molecula"
PLUGIN_PATHS = []
PLUGINS = ["i18n_subsites", "sitemap"]

# ── URL düzeni ──────────────────────────────────────────────────────────────
ARTICLE_PATHS = ["news"]
PAGE_PATHS = ["pages"]
ARTICLE_URL = "news/{slug}/"
ARTICLE_SAVE_AS = "news/{slug}/index.html"
ARTICLE_LANG_URL = "news/{slug}/"
ARTICLE_LANG_SAVE_AS = "news/{slug}/index.html"
PAGE_URL = "{slug}/"
PAGE_SAVE_AS = "{slug}/index.html"
PAGE_LANG_URL = "{slug}/"
PAGE_LANG_SAVE_AS = "{slug}/index.html"
DIRECT_TEMPLATES = ["index"]
ARCHIVES_SAVE_AS = AUTHORS_SAVE_AS = CATEGORIES_SAVE_AS = TAGS_SAVE_AS = ""
AUTHOR_SAVE_AS = CATEGORY_SAVE_AS = TAG_SAVE_AS = ""
DEFAULT_PAGINATION = False
SLUGIFY_SOURCE = "basename"

STATIC_PATHS = ["images", "extra"]
EXTRA_PATH_METADATA = {"extra/favicon.ico": {"path": "favicon.ico"}}
READERS = {"html": None}

FEED_ALL_ATOM = CATEGORY_FEED_ATOM = TRANSLATION_FEED_ATOM = None
AUTHOR_FEED_ATOM = AUTHOR_FEED_RSS = None

SITEMAP = {
    "format": "xml",
    "priorities": {"articles": 0.6, "indexes": 0.8, "pages": 0.7},
    "changefreqs": {"articles": "monthly", "indexes": "weekly", "pages": "monthly"},
}

# ── Grup bilgileri ──────────────────────────────────────────────────────────
FOUNDED = 2023  # kuruluş yılı (ana sayfa, hero etiketi, altbilgi)
CONTACT = {
    "email": "hulya@ktu.edu.tr",
    "address": {
        "en": "Karadeniz Technical University, Drug and Pharmaceutical Technology Application & Research Center (ILAFAR), Kanuni Campus, 61080 Trabzon, Türkiye",
        "tr": "Karadeniz Teknik Üniversitesi, İlaç ve Farmasötik Teknoloji Uygulama ve Araştırma Merkezi (İLAFAR), Kanuni Kampüsü, 61080 Trabzon, Türkiye",
    },
    "map": "https://www.openstreetmap.org/search?query=Karadeniz%20Teknik%20%C3%9Cniversitesi%20Trabzon",
    "avesis": "https://avesis.ktu.edu.tr/arastirma-grubu/pharmai",
    "github": "https://github.com/pharmaiktu",
    "huggingface": "https://huggingface.co/pharmaiktu",
}

# ── Veri dosyalarını oku ────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name):
    with open(os.path.join(_HERE, "data", name), encoding="utf-8") as fh:
        return yaml.safe_load(fh) or []


def _fold(s):
    """Türkçe harfleri ve aksanları sadeleştirerek karşılaştırma anahtarı üret."""
    s = s.replace("ı", "i").replace("İ", "I")
    return "".join(c for c in unicodedata.normalize("NFKD", s) if c.isalnum()).lower()


MEMBERS = _load("members.yml")
PROJECTS = _load("projects.yml")
RESEARCH = _load("research.yml")
THESES = sorted(_load("theses.yml"), key=lambda t: -int(t.get("year", 0)))
MEMBER_BY_SLUG = {m["slug"]: m for m in MEMBERS}
for _m in MEMBERS:
    _last, _first = [p.strip() for p in _m["bib"].split(",")]
    _m["_key"] = (_fold(_last), _fold(_first)[:1])
    _m["initials"] = "".join(w[0] for w in _m["name"].split()[:2] if w)
    _m["pub_count"] = 0

# ── Yayınlar (BibTeX → şablonlara hazır sözlükler) ──────────────────────────
PUBLICATIONS_SRC = os.path.join(_HERE, "content", "extra", "papers.bib")


def _clean(v):
    return re.sub(r"[{}]", "", v or "").replace("--", "–").strip()


def _publications():
    db = parse_file(PUBLICATIONS_SRC)
    pubs = []
    for key, e in db.entries.items():
        authors = []
        for p in e.persons.get("author", []):
            first = _clean(" ".join(p.first_names + p.middle_names))
            last = _clean(" ".join(p.prelast_names + p.last_names))
            if last.lower() == "others":
                authors.append({"name": "et al.", "member": None})
                continue
            k = (_fold(last), _fold(first)[:1])
            member = next((m for m in MEMBERS if m["_key"] == k), None)
            if member:
                member["pub_count"] += 1
            name = member["name"] if member else f"{first} {last}".strip()
            authors.append({"name": name, "member": member["slug"] if member else None})
        f = {k: _clean(v) for k, v in e.fields.items()}
        doi = f.get("doi", "")
        doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi)
        pubs.append({
            "key": key,
            "type": "journal" if e.type == "article" else "conference",
            "title": f.get("title", ""),
            "authors": authors,
            "venue": f.get("journal") or f.get("booktitle", ""),
            "volume": f.get("volume", ""), "number": f.get("number", ""), "pages": f.get("pages", ""),
            "address": f.get("address", ""), "note": f.get("note", ""),
            "year": int(f.get("year", 0) or 0),
            "doi": doi,
            "index": f.get("index", ""),
            "selected": f.get("selected", "").lower() == "true",
            "preview": f.get("preview", ""),
            "bibtex": _bibtex(e.type, key, e),
        })
    pubs.sort(key=lambda p: (-p["year"], p["type"] != "journal", p["title"]))
    return pubs


def _bibtex(kind, key, e):
    lines = []
    names = [" ".join(p.prelast_names + p.last_names) + ", " + " ".join(p.first_names + p.middle_names)
             for p in e.persons.get("author", [])]
    if names:
        lines.append("  author = {%s}" % " and ".join(_clean(n).strip(", ") for n in names))
    for fld in ("title", "journal", "booktitle", "volume", "number", "pages", "address", "year", "doi"):
        v = _clean(e.fields.get(fld, "")).replace("–", "--")
        if v:
            lines.append("  %s = {%s}" % (fld, v))
    return "@%s{%s,\n%s\n}" % (kind, key, ",\n".join(lines))


PUBLICATIONS = _publications()
PUB_BY_KEY = {p["key"]: p for p in PUBLICATIONS}
for _r in RESEARCH:
    _r["projects"] = [p for p in PROJECTS if p.get("area") == _r["key"]]
    _r["pubs"] = sorted((k for k in _r.get("pubs", []) if k in PUB_BY_KEY),
                        key=lambda k: (-PUB_BY_KEY[k]["year"], PUB_BY_KEY[k]["type"] != "journal"))

# ── Açık bilim: GitHub depoları + Hugging Face veri setleri (otomatik; bkz. opensci.py) ──
OPENSCI = opensci.load(org_github="pharmaiktu", org_hf="pharmaiktu")
for _r in RESEARCH:
    _r["opensci"] = [o for o in OPENSCI if o.get("area") == _r["key"]]

STATS = {
    "publications": len(PUBLICATIONS),
    "journals": sum(p["type"] == "journal" for p in PUBLICATIONS),
    "projects": len(PROJECTS),
    "members": len(MEMBERS),
    "theses": len(THESES),
    "scie": sum(p["index"] == "SCI-E" for p in PUBLICATIONS),
}

# ── Arayüz metinleri ────────────────────────────────────────────────────────
# Ekip sayfasındaki gruplar: (anahtar, bu grupta gösterilecek roller) — sıra members.yml sırasıdır
TEAM_GROUPS = [("researchers", ["academic", "research_staff", "research_assistant"]),
               ("students", ["phd", "msc", "grad"]),
               ("alumni", ["alumni"])]

NAV = [("research", "research"), ("team", "team"), ("projects", "projects"),
       ("publications", "publications"), ("code", "code"), ("news", "news"), ("contact", "contact")]

UI = {
    "lang_name": "English", "other_lang": "tr", "other_lang_label": "TR", "other_lang_title": "Türkçe",
    "nav": {"research": "Research", "team": "Team", "projects": "Projects", "publications": "Publications",
            "code": "Code & Data", "news": "News", "contact": "Contact"},
    "group_full": "Innovative AI Applications in Pharmacology",
    "group_short": "PharmAI Research Group",
    "university": "Karadeniz Technical University",
    "hero_eyebrow": "KTÜ · Research Group · Since {year}",
    "hero_title_1": "Where the lab bench",
    "hero_title_2": "meets the neural network.",
    "hero_lead": "We design artificial intelligence and data-science methods that accelerate traditional pharmacology — from sharper microscopy and 3D cell imaging to drug interactions and mechanism-of-action prediction.",
    "hero_cta_research": "Explore our research",
    "hero_cta_join": "Join the group",
    "hero_caption": "Molecules, cells, images and signals — one network.",
    "hero_glyphs": {"cell": "cell", "stack": "focus stack", "signal": "contractility", "mouse": "in vivo"},
    "stat_publications": "Publications", "stat_projects": "Funded projects", "stat_members": "Members",
    "stat_founded": "Founded", "stat_founded_note": "Trabzon, Türkiye", "stat_scie": "SCI-E articles", "stat_scie_note": "indexed in Web of Science", "stat_journals": "journal articles",
    "mission_badge": "Mission",
    "mission_title": "Pharmacology, accelerated by AI",
    "mission_text": "Our group carries out research that finds new solutions by applying artificial intelligence and data science to develop and accelerate traditional pharmacology methods. The work is led by researchers with complementary expertise in artificial intelligence, deep learning, data analytics, image processing and pharmacology.",
    "pillars": [
        ["layers", "Multidisciplinary", "AI engineers and pharmacologists in one team, from wet lab to GPU."],
        ["database", "Open datasets", "We build and share expert-annotated microscopy and signal datasets."],
        ["shield-check", "Rigorous & ethical", "Reproducible pipelines, careful validation and data governance."],
    ],
    "research_badge": "Research", "research_title": "What we work on",
    "research_sub": "Six connected directions, from the microscope to the clinic.",
    "research_more": "All research areas",
    "research_page_sub": "Our research spans 2D/3D microscopic imaging, extended depth of focus, shape from focus, autofocusing, cellular analysis, drug–drug and drug–target interactions, drug repurposing and mechanism-of-action prediction.",
    "related_pubs": "Publications", "related_projects": "Projects",
    "projects_badge": "Projects", "projects_title": "Funded projects",
    "projects_sub": "Research supported by TÜBİTAK, TÜSEB and KTÜ BAP.",
    "projects_page_sub": "Our research is funded by national programmes. The Turkish title is the official one.",
    "pi": "PI", "team_label": "Team", "ongoing": "Ongoing", "completed": "Completed",
    "team_badge": "Team", "team_title": "The people of PharmAI",
    "team_sub": "Faculty, researchers and students across Karadeniz Technical University and Trabzon University.",
    "roles": {"leader": "Group Leader", "academic": "Academic Staff", "research_staff": "Research Staff",
              "research_assistant": "Research Assistant", "phd": "PhD Students", "msc": "MSc Students", "grad": "Graduate Students",
              "alumni": "Alumni"},
    "groups": {"researchers": "Group Researchers", "students": "Graduate Students", "alumni": "Alumni"},
    "role_single": {"leader": "Group Leader", "academic": "Academic Staff", "research_staff": "Research Staff",
                    "research_assistant": "Research Assistant", "phd": "PhD Student", "msc": "MSc Student", "grad": "Graduate Student",
                    "alumni": "Alumnus"},
    "pubs_short": "publications",
    "theses_title": "Supervised theses", "msc": "MSc", "phd": "PhD", "advisor": "Advisor", "thesis_student": "Student",
    "pubs_badge": "Publications", "pubs_title": "Research output",
    "pubs_sub": "Journal articles and conference papers by PharmAI members.",
    "pubs_selected": "Selected publications", "pubs_all": "All publications",
    "filter_all": "All", "filter_journal": "Journal", "filter_conference": "Conference",
    "search_ph": "Search title, author, venue…", "no_results": "No publications match your search.",
    "copy_bib": "BibTeX", "copied": "Copied!", "abstract_note": "Abstract",
    "code_badge": "Open science", "code_title": "Code & data",
    "code_sub": "Our code on GitHub and our datasets on Hugging Face — updated automatically.",
    "code_home_sub": "Code and curated datasets we share with the community.",
    "code_repos": "Code repositories", "code_data": "Datasets & models",
    "gated": "Gated access", "gated_note": "Access is granted on request through Hugging Face.",
    "updated": "Updated", "downloads": "downloads", "stars": "stars", "view_on": "View on",
    "related_code": "Code & data",
    "os_kind": {"repo": "repository", "dataset": "dataset", "model": "model"},
    "news_badge": "News", "news_title": "Latest news", "news_all": "All news",
    "news_page_sub": "Papers, projects and events from the group.",
    "read_more": "Read more", "back_news": "All news",
    "contact_badge": "Contact", "contact_title": "Get in touch",
    "contact_sub": "We welcome students, visiting researchers, clinicians and industry partners.",
    "address": "Address", "email": "E-mail", "open_map": "Open in map", "avesis": "AVESİS group page",
    "join_title": "Join PharmAI",
    "join_text": "Interested in AI for pharmacology? Students (BSc projects, MSc, PhD), visiting scholars and partner labs are welcome. Send a short bio and your research interests by e-mail.",
    "join_cta": "Write to us",
    "footer_text": "Innovative AI applications in pharmacology at Karadeniz Technical University.",
    "footer_built": "Built with Pelican",
    "theme_toggle": "Toggle dark mode", "menu": "Menu",
}

UI_TR = dict(UI)
UI_TR.update({
    "lang_name": "Türkçe", "other_lang": "en", "other_lang_label": "EN", "other_lang_title": "English",
    "nav": {"research": "Araştırma", "team": "Ekip", "projects": "Projeler", "publications": "Yayınlar",
            "code": "Kod & Veri", "news": "Haberler", "contact": "İletişim"},
    "group_full": "Farmakoloji Araştırmalarında İnovatif Yapay Zekâ Uygulamaları",
    "group_short": "PharmAI Araştırma Grubu",
    "university": "Karadeniz Teknik Üniversitesi",
    "hero_eyebrow": "KTÜ · Araştırma Grubu · {year}'ten beri",
    "hero_title_1": "Laboratuvar tezgâhının",
    "hero_title_2": "sinir ağıyla buluştuğu yer.",
    "hero_lead": "Geleneksel farmakolojiyi hızlandıran yapay zekâ ve veri bilimi yöntemleri geliştiriyoruz: daha net mikroskopi ve 3B hücre görüntülemeden ilaç etkileşimlerine ve etki mekanizması tahminine.",
    "hero_cta_research": "Araştırmalarımız",
    "hero_cta_join": "Gruba katılın",
    "hero_caption": "Moleküller, hücreler, görüntüler ve sinyaller — tek bir ağ.",
    "hero_glyphs": {"cell": "hücre", "stack": "odak yığını", "signal": "kasılma", "mouse": "in vivo"},
    "stat_publications": "Yayın", "stat_projects": "Destekli proje", "stat_members": "Üye",
    "stat_founded": "Kuruluş", "stat_founded_note": "Trabzon, Türkiye", "stat_scie": "SCI-E makale", "stat_scie_note": "Web of Science dizininde", "stat_journals": "dergi makalesi",
    "mission_badge": "Misyon",
    "mission_title": "Yapay zekâyla hızlanan farmakoloji",
    "mission_text": "Grubumuz geleneksel farmakoloji yöntemlerini geliştirmek ve hızlandırmak amacıyla yapay zekâ ve veri bilimi alanlarını kullanarak yeni çözümler bulan araştırmalar gerçekleştirmektedir. Bu araştırmalar yapay zekâ, derin öğrenme, veri analitiği, görüntü işleme ve farmakoloji alanlarında uzman kişiler tarafından yürütülmektedir.",
    "pillars": [
        ["layers", "Disiplinlerarası", "Yapay zekâ mühendisleri ve farmakologlar aynı ekipte; laboratuvardan GPU'ya."],
        ["database", "Açık veri setleri", "Uzman etiketli mikroskopi ve sinyal veri setleri oluşturup paylaşıyoruz."],
        ["shield-check", "Titiz ve etik", "Tekrarlanabilir iş akışları, özenli doğrulama ve veri yönetişimi."],
    ],
    "research_badge": "Araştırma", "research_title": "Neler üzerinde çalışıyoruz",
    "research_sub": "Mikroskoptan kliniğe uzanan, birbirine bağlı altı yön.",
    "research_more": "Tüm araştırma alanları",
    "research_page_sub": "Çalışmalarımız 2B/3B mikroskobik görüntüleme, odaklama derinliğinin artırılması, odaktan şekil, otomatik odaklama, hücresel analiz, ilaç–ilaç ve ilaç–hedef etkileşimi, ilaç yeniden konumlandırma ve etki mekanizması tahminini kapsar.",
    "related_pubs": "Yayınlar", "related_projects": "Projeler",
    "projects_badge": "Projeler", "projects_title": "Destekli projeler",
    "projects_sub": "TÜBİTAK, TÜSEB ve KTÜ BAP destekli araştırmalar.",
    "projects_page_sub": "Araştırmalarımız ulusal programlarca desteklenmektedir.",
    "pi": "Yürütücü", "team_label": "Ekip", "ongoing": "Sürüyor", "completed": "Tamamlandı",
    "team_badge": "Ekip", "team_title": "PharmAI'nin insanları",
    "team_sub": "Karadeniz Teknik Üniversitesi ve Trabzon Üniversitesi'nden öğretim üyeleri, araştırmacılar ve öğrenciler.",
    "roles": {"leader": "Grup Başkanı", "academic": "Akademik Personel", "research_staff": "Araştırma Personeli",
              "research_assistant": "Araştırma Görevlisi", "phd": "Doktora Öğrencileri",
              "msc": "Yüksek Lisans Öğrencileri", "grad": "Lisansüstü Öğrenciler", "alumni": "Mezunlar"},
    "groups": {"researchers": "Grup Araştırmacıları", "students": "Lisansüstü Öğrenciler", "alumni": "Mezunlar"},
    "role_single": {"leader": "Grup Başkanı", "academic": "Akademik Personel", "research_staff": "Araştırma Personeli",
                    "research_assistant": "Araştırma Görevlisi", "phd": "Doktora Öğrencisi",
                    "msc": "Yüksek Lisans Öğrencisi", "grad": "Lisansüstü Öğrencisi", "alumni": "Mezun"},
    "pubs_short": "yayın",
    "theses_title": "Yönetilen tezler", "msc": "Yüksek Lisans", "phd": "Doktora", "advisor": "Danışman", "thesis_student": "Hazırlayan",
    "pubs_badge": "Yayınlar", "pubs_title": "Araştırma çıktıları",
    "pubs_sub": "PharmAI üyelerinin dergi makaleleri ve bildirileri.",
    "pubs_selected": "Öne çıkan yayınlar", "pubs_all": "Tüm yayınlar",
    "filter_all": "Tümü", "filter_journal": "Makale", "filter_conference": "Bildiri",
    "search_ph": "Başlık, yazar, dergi ara…", "no_results": "Aramanızla eşleşen yayın yok.",
    "copy_bib": "BibTeX", "copied": "Kopyalandı!", "abstract_note": "Özet bildiri",
    "code_badge": "Açık bilim", "code_title": "Kod & veri",
    "code_sub": "GitHub'daki kodlarımız ve Hugging Face'teki veri setlerimiz — otomatik güncellenir.",
    "code_home_sub": "Toplulukla paylaştığımız kodlar ve özenle hazırlanmış veri setleri.",
    "code_repos": "Kod depoları", "code_data": "Veri setleri ve modeller",
    "gated": "Onaylı erişim", "gated_note": "Erişim, Hugging Face üzerinden talep edilerek verilir.",
    "updated": "Güncelleme", "downloads": "indirme", "stars": "yıldız", "view_on": "Görüntüle:",
    "related_code": "Kod ve veri",
    "os_kind": {"repo": "depo", "dataset": "veri seti", "model": "model"},
    "news_badge": "Haberler", "news_title": "Son haberler", "news_all": "Tüm haberler",
    "news_page_sub": "Gruptan yayınlar, projeler ve etkinlikler.",
    "read_more": "Devamı", "back_news": "Tüm haberler",
    "contact_badge": "İletişim", "contact_title": "Bize ulaşın",
    "contact_sub": "Öğrencilere, misafir araştırmacılara, klinisyenlere ve sanayi ortaklarına kapımız açık.",
    "address": "Adres", "email": "E-posta", "open_map": "Haritada aç", "avesis": "AVESİS grup sayfası",
    "join_title": "PharmAI'ye katılın",
    "join_text": "Farmakolojide yapay zekâ ilginizi çekiyor mu? Öğrenciler (bitirme, yüksek lisans, doktora), misafir araştırmacılar ve iş birliği yapmak isteyen laboratuvarlar; kısa bir özgeçmiş ve ilgi alanlarınızla bize e-posta gönderin.",
    "join_cta": "Bize yazın",
    "footer_text": "Karadeniz Teknik Üniversitesi'nde farmakolojide inovatif yapay zekâ uygulamaları.",
    "footer_built": "Pelican ile hazırlandı",
    "theme_toggle": "Karanlık mod", "menu": "Menü",
})

SITEDESCRIPTION = "PharmAI — Innovative AI Applications in Pharmacology research group at Karadeniz Technical University."

I18N_SUBSITES = {
    "tr": {
        "UI": UI_TR,
        "DEFAULT_DATE_FORMAT": "%d.%m.%Y",
        "SITEDESCRIPTION": "PharmAI — Karadeniz Teknik Üniversitesi Farmakoloji Araştırmalarında İnovatif Yapay Zekâ Uygulamaları araştırma grubu.",
    }
}
