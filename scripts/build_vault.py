#!/usr/bin/env python3
"""
Genera un vault de Obsidian a partir de:
- Glosario (const DATA en JS) → 91 fichas de concepto
- Índice (HTML estructurado)  → 19 fichas de obra + 7 ejes temáticos
"""
import json
import os
import re
import shutil
from html import unescape
from pathlib import Path

REPO = Path("/home/user/memoria-activa-pensamiento-complejo")
VAULT = REPO / "Obsidian Vault"

# ──────────────────────────────────────────────────────────────────────────
#  Utilidades
# ──────────────────────────────────────────────────────────────────────────

def sanitize_filename(name: str) -> str:
    """Quita caracteres no válidos en filenames cross-platform."""
    out = re.sub(r'[\\/:"*?<>|]', " ", name)
    return re.sub(r"\s+", " ", out).strip()


def html_to_md(html: str) -> str:
    """Conversor mínimo HTML → Markdown para los <p> del glosario."""
    if not html:
        return ""
    s = html
    s = re.sub(r"<p[^>]*>", "", s)
    s = re.sub(r"</p>", "\n\n", s)
    s = re.sub(r"<strong[^>]*>(.*?)</strong>", r"**\1**", s, flags=re.S)
    s = re.sub(r"<b[^>]*>(.*?)</b>", r"**\1**", s, flags=re.S)
    s = re.sub(r"<em[^>]*>(.*?)</em>", r"*\1*", s, flags=re.S)
    s = re.sub(r"<i[^>]*>(.*?)</i>", r"*\1*", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", "  \n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = unescape(s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def yaml_quote(value):
    """Comillado seguro para escalares YAML."""
    if value is None:
        return '""'
    s = str(value)
    if not s:
        return '""'
    s_escaped = s.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{s_escaped}"'


def yaml_list(items):
    if not items:
        return "[]"
    return "[" + ", ".join(yaml_quote(i) for i in items) + "]"


def write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


# ──────────────────────────────────────────────────────────────────────────
#  Cargar datos
# ──────────────────────────────────────────────────────────────────────────

GLOSARIO_HTML = (REPO / "Glosario - Pensamiento Complejo.html").read_text(encoding="utf-8")
m = re.search(r"^const DATA = (\[.*?\]);\s*$", GLOSARIO_HTML, re.M)
ENTRIES = json.loads(m.group(1))

# Mapas slug→term (para resolver wikilinks)
SLUG_TO_TERM = {e["slug"]: e["term"] for e in ENTRIES}

TRADITION_NAMES = {
    "morin": "Morin · El Método",
    "autopoiesis": "Autopoiesis · Maturana & Varela",
    "cybernetics": "Cibernética de 2° orden · von Foerster",
    "embodied": "Cognición encarnada · Varela/Thompson/Rosch + Merleau-Ponty",
    "predictive": "Mente predictiva · Clark + Friston",
    "iit": "Información integrada · Tononi",
    "panpsiquismo": "Panpsiquismo & identidad · Zuboff + Seager",
    "termodinamica": "Termodinámica del orden · Kauffman + Prigogine",
    "proceso": "Metafísica del proceso · Whitehead",
    "social": "Complejidad social · Sotolongo & Delgado",
}
TRADITION_ORDER = list(TRADITION_NAMES.keys())


# ──────────────────────────────────────────────────────────────────────────
#  Parser del Índice
# ──────────────────────────────────────────────────────────────────────────

def parse_index(html: str):
    """Parser regex-based del Índice. Devuelve lista de ejes con sus obras."""
    ejes = []

    # Cada <section class="eje" id="eje-N"> ... </section> con sus <article class="work">
    section_re = re.compile(
        r'<section class="eje"[^>]*id="(?P<id>eje-\d+)"[^>]*>(?P<inner>.*?)</section>',
        re.S,
    )

    for sm in section_re.finditer(html):
        inner = sm.group("inner")
        # No matchear la sección final "Constelación de puentes" — esa no tiene class="eje"
        num_m = re.search(r'<span class="eje-num">(.*?)</span>', inner, re.S)
        h2_m = re.search(r'<div class="eje-header">.*?<h2[^>]*>(.*?)</h2>', inner, re.S)
        blurb_m = re.search(r'<p class="eje-blurb"[^>]*>(.*?)</p>', inner, re.S)
        if not num_m or not h2_m:
            continue
        eje = {
            "num": html_to_md(num_m.group(1)).strip(),
            "title": html_to_md(h2_m.group(1)).replace("\n", " ").strip(),
            "blurb": html_to_md(blurb_m.group(1)).strip() if blurb_m else "",
            "works": [],
        }

        article_re = re.compile(
            r'<article class="work"[^>]*id="(?P<id>[^"]+)"[^>]*>(?P<body>.*?)</article>',
            re.S,
        )
        for am in article_re.finditer(inner):
            wid = am.group("id")
            wbody = am.group("body")
            title_m = re.search(r'<h3 class="work-title"[^>]*>(.*?)</h3>', wbody, re.S)
            meta_m = re.search(r'<div class="work-meta"[^>]*>(.*?)</div>', wbody, re.S)

            # Fields: split by <div class="field"> ... </div> (cada uno empieza con field-label)
            tesis = ""
            puentes = ""
            recursos = ""
            conceptos = []

            field_re = re.compile(
                r'<div class="field">\s*<div class="field-label"[^>]*>(?P<label>.*?)</div>(?P<rest>.*?)</div>\s*(?=<div class="field">|$)',
                re.S,
            )
            for fm in field_re.finditer(wbody):
                label = html_to_md(fm.group("label")).strip().lower()
                rest = fm.group("rest")
                if "tesis" in label:
                    body_m = re.search(r'<div class="field-body"[^>]*>(.*)', rest, re.S)
                    if body_m:
                        tesis = html_to_md(body_m.group(1)).strip()
                elif "concepto" in label:
                    for li_m in re.finditer(r"<li[^>]*>(.*?)</li>", rest, re.S):
                        conceptos.append(html_to_md(li_m.group(1)).strip())
                elif "puente" in label:
                    parts = re.findall(r'<p class="puente"[^>]*>(.*?)</p>', rest, re.S)
                    if parts:
                        puentes = "\n\n".join(html_to_md(p).strip() for p in parts)
                    else:
                        body_m = re.search(r'<div class="field-body"[^>]*>(.*)', rest, re.S)
                        if body_m:
                            puentes = html_to_md(body_m.group(1)).strip()
                elif "recurso" in label:
                    links = re.findall(
                        r'<a[^>]*class="recurso-link"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
                        rest, re.S,
                    )
                    if links:
                        recursos = "\n".join(
                            f"- [{html_to_md(t).strip()}](../../{href})" for href, t in links
                        )

            title_clean = html_to_md(title_m.group(1)).replace("\n", " ").strip() if title_m else ""
            meta_clean = html_to_md(meta_m.group(1)).strip() if meta_m else ""

            eje["works"].append({
                "id": wid,
                "title": title_clean,
                "meta": meta_clean,
                "tesis": tesis,
                "conceptos": conceptos,
                "puentes": puentes,
                "recursos": recursos,
            })

        ejes.append(eje)

    return ejes


INDEX_HTML = (REPO / "Indice_Memoria_Activa.html").read_text(encoding="utf-8")
EJES = parse_index(INDEX_HTML)
WORKS = [w for eje in EJES for w in eje["works"]]
print(f"[index] ejes: {len(EJES)}  works: {len(WORKS)}")
for eje in EJES:
    print(f"  {eje['num']} — {eje['title']}  ({len(eje['works'])} obras)")


# ──────────────────────────────────────────────────────────────────────────
#  Limpiar / preparar vault
# ──────────────────────────────────────────────────────────────────────────

if VAULT.exists():
    shutil.rmtree(VAULT)
VAULT.mkdir(parents=True)


# ──────────────────────────────────────────────────────────────────────────
#  Generar fichas de Concepto (91)
# ──────────────────────────────────────────────────────────────────────────

CONCEPTS_DIR = VAULT / "Conceptos"

# Para resolver wikilinks: usamos el `term` como filename. Si choca, sufijar con tradición.
term_to_filename = {}
filename_counts = {}
for e in ENTRIES:
    base = sanitize_filename(e["term"])
    if base in filename_counts:
        filename_counts[base] += 1
        fn = f"{base} ({e['tradition']})"
    else:
        filename_counts[base] = 1
        fn = base
    term_to_filename[e["term"]] = fn
    e["_filename"] = fn

slug_to_filename = {e["slug"]: e["_filename"] for e in ENTRIES}

for e in ENTRIES:
    refs_md = []
    for slug, label in zip(e.get("ref_slugs", []), e.get("refs", [])):
        target = slug_to_filename.get(slug)
        if target:
            if target == label:
                refs_md.append(f"[[{target}]]")
            else:
                refs_md.append(f"[[{target}|{label}]]")
        else:
            refs_md.append(label)

    fm = []
    fm.append("---")
    fm.append(f"term: {yaml_quote(e['term'])}")
    fm.append(f"slug: {yaml_quote(e['slug'])}")
    fm.append(f"tradition: {yaml_quote(e['tradition_label'])}")
    fm.append(f"tradition_id: {yaml_quote(e['tradition'])}")
    fm.append(f"author: {yaml_quote(e['author'])}")
    fm.append(f"work: {yaml_quote(e['work'])}")
    fm.append(f"theme: {yaml_quote(e['theme'])}")
    fm.append(f"source: {yaml_quote(e['source'])}")
    if e.get("volume"):
        fm.append(f"volume: {e['volume']}")
    fm.append(f"chip: {yaml_quote(e['chip_label'])}")
    fm.append(f"aliases: {yaml_list([e['slug']])}")
    fm.append(f"tags: {yaml_list(['concepto', 'tradicion/' + e['tradition'], 'tema/' + sanitize_filename(e['theme']).replace(' ', '-').lower()])}")
    fm.append("---")
    fm.append("")

    body = []
    body.append(f"# {e['term']}")
    body.append("")
    body.append(f"> **Esencia.** {e['essence']}")
    body.append("")
    body.append("## Explicación")
    body.append("")
    body.append(html_to_md(e["explanation"]))
    body.append("")
    body.append("## Cita literal")
    body.append("")
    body.append(f"> {e['quote']}")
    body.append("")
    body.append(f"— *{e['work']}* · {e['source']}")
    body.append("")
    body.append("## Referencias cruzadas")
    body.append("")
    if refs_md:
        for r in refs_md:
            body.append(f"- {r}")
    else:
        body.append("*(sin referencias cruzadas)*")
    body.append("")
    body.append("---")
    body.append("")
    trad_label = TRADITION_NAMES[e["tradition"]]
    trad_fn = sanitize_filename(trad_label)
    if trad_fn == trad_label:
        body.append(f"**Tradición:** [[{trad_label}]]  ")
    else:
        body.append(f"**Tradición:** [[{trad_fn}|{trad_label}]]  ")
    body.append(f"**Autor:** {e['author']}  ")
    body.append(f"**Tema:** [[Tema · {sanitize_filename(e['theme'])}|{e['theme']}]]")

    write(CONCEPTS_DIR / f"{e['_filename']}.md", "\n".join(fm + body) + "\n")

print(f"[conceptos] {len(ENTRIES)} fichas escritas en {CONCEPTS_DIR.relative_to(REPO)}")


# ──────────────────────────────────────────────────────────────────────────
#  Generar fichas de Obra (19)
# ──────────────────────────────────────────────────────────────────────────

WORKS_DIR = VAULT / "Obras"

# Mapa concepto del índice → ficha del glosario (case-insensitive, fuzzy básico)
def find_concept_filename(label):
    norm = label.strip().lower()
    for e in ENTRIES:
        if e["term"].lower() == norm:
            return e["_filename"]
    # quitar paréntesis y reintentar
    cleaned = re.sub(r"\(.*?\)", "", label).strip().lower()
    for e in ENTRIES:
        if e["term"].lower() == cleaned:
            return e["_filename"]
    return None


for eje in EJES:
    for w in eje["works"]:
        wid = w["id"]
        title_clean = re.sub(r"\*+", "", w["title"]).strip()
        fn = sanitize_filename(f"{wid} — {title_clean}")[:120]

        fm = []
        fm.append("---")
        fm.append(f"id: {yaml_quote(wid)}")
        fm.append(f"title: {yaml_quote(title_clean)}")
        fm.append(f"meta: {yaml_quote(w['meta'])}")
        fm.append(f"eje: {yaml_quote(eje['title'])}")
        fm.append(f"eje_num: {yaml_quote(eje['num'])}")
        fm.append(f"tags: {yaml_list(['obra', 'eje/' + eje['num'].replace(' ', '-').lower()])}")
        fm.append("---")
        fm.append("")

        body = []
        body.append(f"# {title_clean}")
        body.append("")
        body.append(f"*{w['meta']}*")
        body.append("")
        body.append(f"**Eje:** [[{eje['num']} — {sanitize_filename(eje['title'])}]]")
        body.append("")
        body.append("## Tesis central")
        body.append("")
        body.append(w["tesis"])
        body.append("")
        if w["conceptos"]:
            body.append("## Conceptos clave")
            body.append("")
            for c in w["conceptos"]:
                target = find_concept_filename(c)
                if target:
                    if target == c:
                        body.append(f"- [[{target}]]")
                    else:
                        body.append(f"- [[{target}|{c}]]")
                else:
                    body.append(f"- {c}")
            body.append("")
        if w.get("puentes"):
            body.append("## Puentes")
            body.append("")
            body.append(w["puentes"])
            body.append("")
        if w.get("recursos"):
            body.append("## Recursos")
            body.append("")
            body.append(w["recursos"])
            body.append("")

        write(WORKS_DIR / f"{fn}.md", "\n".join(fm + body) + "\n")

print(f"[obras] {len(WORKS)} fichas escritas en {WORKS_DIR.relative_to(REPO)}")


# ──────────────────────────────────────────────────────────────────────────
#  MOCs por Tradición
# ──────────────────────────────────────────────────────────────────────────

TRAD_DIR = VAULT / "Tradiciones"

for tid in TRADITION_ORDER:
    label = TRADITION_NAMES[tid]
    members = [e for e in ENTRIES if e["tradition"] == tid]
    if not members:
        continue

    fm = [
        "---",
        f"tradition: {yaml_quote(label)}",
        f"tradition_id: {yaml_quote(tid)}",
        f"tags: {yaml_list(['MOC', 'tradicion/' + tid])}",
        "---",
        "",
    ]
    body = [
        f"# {label}",
        "",
        f"**{len(members)} entradas** del corpus pertenecen a esta tradición.",
        "",
        "## Fichas",
        "",
    ]
    by_author = {}
    for e in members:
        by_author.setdefault(e["author"], []).append(e)
    for author in by_author:
        body.append(f"### {author}")
        body.append("")
        for e in sorted(by_author[author], key=lambda x: x["term"]):
            body.append(f"- [[{e['_filename']}]] — {e['essence']}")
        body.append("")

    fn = sanitize_filename(label)
    write(TRAD_DIR / f"{fn}.md", "\n".join(fm + body) + "\n")

print(f"[tradiciones] {len(TRADITION_ORDER)} MOCs escritos en {TRAD_DIR.relative_to(REPO)}")


# ──────────────────────────────────────────────────────────────────────────
#  MOCs por Eje (del Índice)
# ──────────────────────────────────────────────────────────────────────────

EJES_DIR = VAULT / "Ejes"

for eje in EJES:
    fn = sanitize_filename(f"{eje['num']} — {eje['title']}")
    fm = [
        "---",
        f"eje_num: {yaml_quote(eje['num'])}",
        f"eje_title: {yaml_quote(eje['title'])}",
        f"tags: {yaml_list(['MOC', 'eje/' + eje['num'].replace(' ', '-').lower()])}",
        "---",
        "",
    ]
    body = [
        f"# {eje['num']} — {eje['title']}",
        "",
        f"*{eje['blurb']}*",
        "",
        "## Obras de este eje",
        "",
    ]
    for w in eje["works"]:
        title_clean = re.sub(r"\*+", "", w["title"]).strip()
        wfn = sanitize_filename(f"{w['id']} — {title_clean}")[:120]
        body.append(f"- [[{wfn}|{title_clean}]] — *{w['meta']}*")
    body.append("")

    write(EJES_DIR / f"{fn}.md", "\n".join(fm + body) + "\n")

print(f"[ejes] {len(EJES)} MOCs escritos en {EJES_DIR.relative_to(REPO)}")


# ──────────────────────────────────────────────────────────────────────────
#  MOCs por Tema (del Glosario)
# ──────────────────────────────────────────────────────────────────────────

THEMES_DIR = VAULT / "Temas"
themes = {}
for e in ENTRIES:
    themes.setdefault(e["theme"], []).append(e)

for theme, members in themes.items():
    fn = f"Tema · {sanitize_filename(theme)}"
    fm = [
        "---",
        f"theme: {yaml_quote(theme)}",
        f"tags: {yaml_list(['MOC', 'tema/' + sanitize_filename(theme).replace(' ', '-').lower()])}",
        "---",
        "",
    ]
    body = [
        f"# Tema · {theme}",
        "",
        f"**{len(members)} entradas** del corpus tocan este tema.",
        "",
    ]
    for e in sorted(members, key=lambda x: x["term"]):
        body.append(f"- [[{e['_filename']}]] — *{e['tradition_label']}* — {e['essence']}")
    body.append("")

    write(THEMES_DIR / f"{fn}.md", "\n".join(fm + body) + "\n")

print(f"[temas] {len(themes)} MOCs escritos en {THEMES_DIR.relative_to(REPO)}")


# ──────────────────────────────────────────────────────────────────────────
#  Portada (00 - Memoria Activa.md)
# ──────────────────────────────────────────────────────────────────────────

portada = []
portada.append("---")
portada.append("tags: [\"MOC\", \"portada\"]")
portada.append("---")
portada.append("")
portada.append("# Memoria Activa del Pensamiento Complejo")
portada.append("")
portada.append("> Cartografía navegable de la obra de **Edgar Morin** y de trece autores afines en diálogo con *El Método*. Este vault es la versión Obsidian del corpus: 91 fichas de concepto + 19 fichas de obra organizadas en 7 ejes.")
portada.append("")
portada.append("## Empezar por acá")
portada.append("")
portada.append("- Abrí la **vista de grafo** (Cmd/Ctrl+G): cada nodo es una ficha, cada arista es una referencia cruzada.")
portada.append("- Buscá un concepto con Cmd/Ctrl+O (\"Quick switcher\") y escribí el término.")
portada.append("- Para navegar por temas o tradiciones, usá los MOCs de abajo.")
portada.append("")
def link(target_fn: str, visible: str) -> str:
    return f"[[{target_fn}]]" if target_fn == visible else f"[[{target_fn}|{visible}]]"


portada.append("## Ejes (del Índice)")
portada.append("")
for eje in EJES:
    fn = sanitize_filename(f"{eje['num']} — {eje['title']}")
    visible = f"{eje['num']} — {eje['title']}"
    portada.append(f"- {link(fn, visible)}")
portada.append("")
portada.append("## Tradiciones (del Glosario)")
portada.append("")
for tid in TRADITION_ORDER:
    members = [e for e in ENTRIES if e["tradition"] == tid]
    if members:
        label = TRADITION_NAMES[tid]
        portada.append(f"- {link(sanitize_filename(label), label)} *({len(members)} entradas)*")
portada.append("")
portada.append("## Temas (transversales)")
portada.append("")
for theme in sorted(themes.keys()):
    fn = f"Tema · {sanitize_filename(theme)}"
    portada.append(f"- {link(fn, theme)} *({len(themes[theme])})*")
portada.append("")
portada.append("---")
portada.append("")
portada.append("Este vault es un derivado del corpus HTML del repositorio. Los HTMLs siguen siendo el artefacto publicable; el vault es la herramienta de exploración y edición. Ver `README.md` del vault para detalles de sincronización.")
portada.append("")

write(VAULT / "00 - Memoria Activa.md", "\n".join(portada))


# ──────────────────────────────────────────────────────────────────────────
#  README del vault
# ──────────────────────────────────────────────────────────────────────────

readme = """# Vault de Obsidian — Memoria Activa del Pensamiento Complejo

Esta carpeta es un **vault de Obsidian** generado a partir del corpus HTML del repositorio. Es una vista paralela: los HTMLs siguen siendo el artefacto publicable; el vault es para **explorar la red de conceptos** (vista de grafo) y **editar/extender el corpus** en markdown.

## Cómo abrirlo

1. Instalá [Obsidian](https://obsidian.md) (gratis, multiplataforma).
2. Al abrir Obsidian → *Open folder as vault* → seleccioná esta carpeta `Obsidian Vault/`.
3. Empezá por la nota **`00 - Memoria Activa`** (es la portada del vault).
4. Abrí la vista de grafo con `Cmd/Ctrl+G` para ver la red de los conceptos.

## Qué hay adentro

```
Obsidian Vault/
├── 00 - Memoria Activa.md     ← portada / MOC principal
├── Conceptos/                  ← 91 fichas del Glosario
├── Obras/                      ← 19 fichas de obra del Índice
├── Tradiciones/                ← 10 MOCs (uno por tradición)
├── Ejes/                       ← 7 MOCs (uno por eje del Índice)
├── Temas/                      ← 18 MOCs (uno por tema transversal)
└── .obsidian/                  ← config mínima del vault
```

Cada ficha de concepto tiene:
- **frontmatter** YAML con metadata (autor, tradición, tema, fuente)
- **esencia, explicación, cita literal**
- **referencias cruzadas** como wikilinks `[[Otra ficha]]`

## Generación

El vault se genera con `scripts/build_vault.py` desde los HTMLs. Si editás el HTML, podés regenerar el vault corriendo el script (sobreescribe esta carpeta).

**Importante:** este es un vault paralelo, no sincronizado. Si editás aquí, los cambios **no** se reflejan en los HTMLs. Si querés que el vault sea la fuente única, hay que escribir el camino inverso (vault → HTML), que no está hecho.

## Convenciones

- Filename de ficha = el término (con tildes), sanitizado para filesystems.
- Wikilinks resuelven por filename: `[[Antropo-ética]]`.
- El `slug` original (e.g. `antropo-etica`) está en `aliases:` del frontmatter, así que también funciona como wikilink.
- Tags estructurales: `concepto`, `obra`, `MOC`, `tradicion/<id>`, `tema/<slug>`, `eje/<num>`.
"""

write(VAULT / "README.md", readme)


# ──────────────────────────────────────────────────────────────────────────
#  Configuración mínima de Obsidian
# ──────────────────────────────────────────────────────────────────────────

obsidian_dir = VAULT / ".obsidian"
obsidian_dir.mkdir(exist_ok=True)

# app.json — ajustes de la app
app_json = {
    "useMarkdownLinks": False,        # usar [[wikilinks]], no [text](url)
    "newLinkFormat": "shortest",
    "showInlineTitle": False,
    "alwaysUpdateLinks": True,
    "promptDelete": True,
}
(obsidian_dir / "app.json").write_text(json.dumps(app_json, indent=2), encoding="utf-8")

# core-plugins.json — habilitar grafo, búsqueda, switcher, tags, backlinks
core_plugins = [
    "file-explorer", "global-search", "switcher", "graph", "backlink",
    "outgoing-link", "tag-pane", "page-preview", "templates", "note-composer",
    "command-palette", "outline", "word-count", "file-recovery"
]
(obsidian_dir / "core-plugins.json").write_text(json.dumps(core_plugins, indent=2), encoding="utf-8")

# graph.json — colores básicos por tag
graph_json = {
    "collapse-filter": True,
    "search": "",
    "showTags": False,
    "showAttachments": False,
    "hideUnresolved": False,
    "showOrphans": True,
    "collapse-color-groups": False,
    "colorGroups": [
        {"query": "tag:#concepto", "color": {"a": 1, "rgb": 5419488}},
        {"query": "tag:#obra", "color": {"a": 1, "rgb": 14701138}},
        {"query": "tag:#MOC", "color": {"a": 1, "rgb": 16753920}},
    ],
    "collapse-display": False,
    "showArrow": False,
    "textFadeMultiplier": 0,
    "nodeSizeMultiplier": 1,
    "lineSizeMultiplier": 1,
    "collapse-forces": False,
    "centerStrength": 0.518713248970312,
    "repelStrength": 10,
    "linkStrength": 1,
    "linkDistance": 250,
    "scale": 1,
    "close": True,
}
(obsidian_dir / "graph.json").write_text(json.dumps(graph_json, indent=2), encoding="utf-8")

# workspace inicial: abrir portada
workspace = {
    "main": {
        "id": "main", "type": "split", "children": [
            {"id": "leaf-1", "type": "leaf", "state": {
                "type": "markdown", "state": {"file": "00 - Memoria Activa.md", "mode": "preview"}
            }}
        ]
    },
    "left": {"id": "left", "type": "split", "children": []},
    "right": {"id": "right", "type": "split", "children": []},
    "active": "leaf-1",
}
(obsidian_dir / "workspace.json").write_text(json.dumps(workspace, indent=2), encoding="utf-8")

print(f"[.obsidian] config mínima escrita")

# ──────────────────────────────────────────────────────────────────────────
print("\nVault listo en:", VAULT)
