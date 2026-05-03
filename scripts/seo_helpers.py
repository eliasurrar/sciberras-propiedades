"""SEO helpers — sitemap.xml, per-listing static HTML stubs, IndexNow pings.

Sitemap + páginas se regeneran cada vez que publish.py / unpublish.py
modifican listings.json. Los stubs en docs/prop/<id>/index.html dan a
Google/Bing contenido HTML real por listing (la SPA usa hash routes que
los crawlers no indexan bien); los visitantes humanos son redirigidos al
SPA por JS.

IndexNow (Bing/Yandex/Naver/Seznam) recibe un ping inmediato cuando
publicás o despublicás. Google no participa de IndexNow — para Google
sigue siendo "Solicitar indexación" manual en Search Console (o esperar
al próximo crawl del sitemap).
"""
import datetime as dt
import html
import json
import shutil
import sys
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path("/Users/openclaw/Desktop/real-estate")
SITE = ROOT / "docs"
DATA = SITE / "data" / "listings.json"
PROP_DIR = SITE / "prop"
SITEMAP = SITE / "sitemap.xml"

CANONICAL = "https://sciberraspropiedades.cl"
INDEXNOW_HOST = "sciberraspropiedades.cl"
INDEXNOW_KEY = "d602f9e564903c97aeb70fa6d08157a3"
INDEXNOW_KEYFILE = SITE / f"{INDEXNOW_KEY}.txt"
INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"

TYPE_LABEL = {
    "casa": "Casa",
    "departamento": "Departamento",
    "terreno": "Terreno",
}
OP_LABEL = {"venta": "Venta", "arriendo": "Arriendo"}


def _format_price(amount, currency):
    if amount is None:
        return ""
    if currency == "UF":
        return f"UF {amount:,.0f}".replace(",", ".")
    if currency in ("USD", "EUR"):
        sym = "US$" if currency == "USD" else "€"
        return f"{sym} {amount:,.0f}".replace(",", ".")
    return f"$ {amount:,.0f}".replace(",", ".")


def _short_desc(text, n=160):
    text = (text or "").strip().replace("\n", " ")
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(" ", 1)[0]
    return cut + "…"


def _listing_jsonld(l):
    cover = (l.get("images") or [""])[0]
    cover_url = f"{CANONICAL}/{cover}" if cover else None
    canonical = f"{CANONICAL}/prop/{l['id']}/"
    schema = {
        "@context": "https://schema.org",
        "@type": "RealEstateListing",
        "name": l.get("title", ""),
        "description": l.get("description", ""),
        "url": canonical,
        "datePosted": l.get("created_at"),
        "image": cover_url,
        "offers": {
            "@type": "Offer",
            "price": l.get("price"),
            "priceCurrency": "CLF" if l.get("currency") == "UF"
                              else (l.get("currency") or "CLP"),
            "availability": "https://schema.org/InStock",
        },
    }
    if l.get("commune"):
        schema["address"] = {
            "@type": "PostalAddress",
            "addressLocality": l["commune"],
            "addressRegion": l.get("region", ""),
            "addressCountry": "CL",
        }
    if l.get("bedrooms") is not None:
        schema["numberOfBedrooms"] = l["bedrooms"]
    if l.get("bathrooms") is not None:
        schema["numberOfBathroomsTotal"] = l["bathrooms"]
    if l.get("area_built_m2") is not None:
        schema["floorSize"] = {
            "@type": "QuantitativeValue",
            "value": l["area_built_m2"],
            "unitCode": "MTK",
        }
    if l.get("area_lot_m2") is not None:
        schema["lotSize"] = {
            "@type": "QuantitativeValue",
            "value": l["area_lot_m2"],
            "unitCode": "MTK",
        }
    return {k: v for k, v in schema.items() if v not in (None, "")}


def _listing_page_html(l):
    e = html.escape
    title = l.get("title", "")
    desc = l.get("description", "")
    short = _short_desc(desc)
    type_lbl = TYPE_LABEL.get(l.get("type"), l.get("type", ""))
    op_lbl = OP_LABEL.get(l.get("operation"), "Venta")
    cover = (l.get("images") or [""])[0]
    cover_url = f"{CANONICAL}/{cover}" if cover else ""
    canonical = f"{CANONICAL}/prop/{l['id']}/"
    spa_url = f"/#prop/{l['id']}"
    price_str = _format_price(l.get("price"), l.get("currency"))
    schema_json = json.dumps(_listing_jsonld(l), ensure_ascii=False)

    cover_img = (f'<img class="cover" src="/{e(cover)}" alt="{e(title)}" '
                 f'loading="eager">') if cover else ""
    commune_bit = f" · {e(l['commune'])}" if l.get("commune") else ""
    og_image = (f'<meta property="og:image" content="{e(cover_url)}">'
                f'<meta name="twitter:image" content="{e(cover_url)}">'
                if cover_url else "")

    return f"""<!DOCTYPE html>
<html lang="es-CL">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{e(title)} — Sciberras Propiedades</title>
<meta name="description" content="{e(short)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="{e(canonical)}">

<meta property="og:type" content="product">
<meta property="og:site_name" content="Sciberras Propiedades">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(short)}">
<meta property="og:url" content="{e(canonical)}">
<meta property="og:locale" content="es_CL">
{og_image}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(short)}">

<script type="application/ld+json">{schema_json}</script>

<script>
  // Visitantes con JS → SPA. Crawlers ven el contenido HTML estático abajo.
  if (typeof location !== 'undefined') {{
    location.replace('{spa_url}');
  }}
</script>
<style>
  body {{ font-family: system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
          max-width: 720px; margin: 40px auto; padding: 0 20px;
          color: #11141a; line-height: 1.55; }}
  h1 {{ margin: 0 0 8px; font-size: 26px; letter-spacing: -0.01em; }}
  .cover {{ width: 100%; height: auto; border-radius: 12px; margin: 16px 0;
            display: block; }}
  .meta {{ color: #555; margin: 0 0 12px; font-size: 14px; }}
  .price {{ font-weight: 600; font-size: 20px; margin: 0 0 16px; }}
  .desc {{ white-space: pre-wrap; margin: 0 0 24px; }}
  a.cta {{ display: inline-block; padding: 10px 16px; background: #11141a;
           color: #f5f0e1; border-radius: 8px; text-decoration: none;
           font-weight: 500; }}
  a.back {{ display: inline-block; padding: 8px 14px;
            border: 1px solid #11141a; border-radius: 8px;
            color: #11141a; text-decoration: none; font-size: 14px;
            margin-bottom: 16px; }}
</style>
</head>
<body>
<a class="back" href="/">← Volver al catálogo</a>
<main>
  <h1>{e(title)}</h1>
  <p class="meta">{e(type_lbl)} · {e(op_lbl)}{commune_bit}</p>
  <p class="price">{e(price_str)}</p>
  {cover_img}
  <p class="desc">{e(desc)}</p>
  <p><a class="cta" href="{spa_url}">Ver galería completa →</a></p>
</main>
</body>
</html>
"""


def write_listing_pages(listings):
    """Crea docs/prop/<id>/index.html para cada listing y elimina huérfanos."""
    PROP_DIR.mkdir(parents=True, exist_ok=True)
    seen_ids = set()
    for l in listings:
        if not l.get("id"):
            continue
        seen_ids.add(l["id"])
        d = PROP_DIR / l["id"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(_listing_page_html(l), encoding="utf-8")
    for sub in PROP_DIR.iterdir():
        if sub.is_dir() and sub.name not in seen_ids:
            shutil.rmtree(sub)


def write_sitemap(listings, updated_at=None):
    """Escribe docs/sitemap.xml con home + cada listing."""
    now = updated_at or dt.datetime.now().astimezone().isoformat(timespec="seconds")
    today = now[:10]
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
             '  <url>',
             f'    <loc>{CANONICAL}/</loc>',
             f'    <lastmod>{today}</lastmod>',
             '    <changefreq>weekly</changefreq>',
             '    <priority>1.0</priority>',
             '  </url>']
    for l in listings:
        if not l.get("id"):
            continue
        lm = (l.get("created_at") or now)[:10]
        lines += [
            '  <url>',
            f'    <loc>{CANONICAL}/prop/{l["id"]}/</loc>',
            f'    <lastmod>{lm}</lastmod>',
            '    <changefreq>monthly</changefreq>',
            '    <priority>0.8</priority>',
            '  </url>',
        ]
    lines.append('</urlset>')
    SITEMAP.write_text("\n".join(lines) + "\n", encoding="utf-8")


def regenerate_all():
    """Vuelve a generar páginas por listing + sitemap.xml desde listings.json."""
    with open(DATA, encoding="utf-8") as f:
        data = json.load(f)
    listings = data.get("listings", [])
    write_listing_pages(listings)
    write_sitemap(listings, updated_at=data.get("updated_at"))
    # Asegura que el keyfile de IndexNow exista (idempotente)
    if not INDEXNOW_KEYFILE.exists():
        INDEXNOW_KEYFILE.write_text(INDEXNOW_KEY + "\n", encoding="utf-8")
    return {
        "listings": len(listings),
        "sitemap": str(SITEMAP.relative_to(ROOT)),
        "prop_dir": str(PROP_DIR.relative_to(ROOT)),
    }


def listing_url(listing_id):
    return f"{CANONICAL}/prop/{listing_id}/"


def ping_indexnow(urls):
    """Notifica a IndexNow (Bing, Yandex, Naver, Seznam) sobre URLs nuevas
    o eliminadas. URLs eliminadas → cuando crawlean encuentran 404 y las
    sacan del índice. Devuelve dict con status/error; no lanza."""
    urls = sorted({u for u in (urls or []) if u})
    if not urls:
        return {"skipped": "no_urls"}
    payload = {
        "host": INDEXNOW_HOST,
        "key": INDEXNOW_KEY,
        "keyLocation": f"{CANONICAL}/{INDEXNOW_KEY}.txt",
        "urlList": urls,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        INDEXNOW_ENDPOINT,
        data=data,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read(500).decode("utf-8", "replace")
            return {"status": r.status, "urls": len(urls), "body": body}
    except urllib.error.HTTPError as e:
        # 200/202 = OK. 422 = una o más URLs inválidas (no fatal).
        body = e.read(500).decode("utf-8", "replace") if hasattr(e, "read") else ""
        return {"status": e.code, "urls": len(urls), "error": str(e), "body": body}
    except Exception as e:
        return {"error": str(e), "urls": len(urls)}


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "ping":
        # `python3 seo_helpers.py ping <url> [<url> ...]`
        print(json.dumps(ping_indexnow(sys.argv[2:]), ensure_ascii=False))
    else:
        print(json.dumps(regenerate_all(), ensure_ascii=False))
