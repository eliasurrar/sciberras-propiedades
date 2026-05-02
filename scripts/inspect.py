#!/usr/bin/env python3
"""inspect.py — imprime un listado humano del catálogo actual."""
import datetime as dt
import json

DATA = "/Users/openclaw/Desktop/real-estate/docs/data/listings.json"

with open(DATA) as f:
    data = json.load(f)


def listing_images(l):
    if isinstance(l.get("images"), list) and l["images"]:
        return list(l["images"])
    if l.get("image"):
        return [l["image"]]
    return []


def fmt_offer(l):
    o = l.get("offer")
    if not o or o.get("price") is None:
        return ""
    until = o.get("until")
    expired = ""
    if until:
        try:
            d = dt.datetime.fromisoformat(until.replace("Z", "+00:00"))
            if d < dt.datetime.now(d.tzinfo):
                expired = " [EXPIRADA]"
        except Exception:
            pass
    until_label = f" hasta {until[:10]}" if until else " (indefinida)"
    return f"  ⚡ OFERTA: {o.get('currency','?')} {o.get('price','?'):>8}{until_label}{expired}"


listings = data.get("listings", [])
print(f"Total: {len(listings)} publicaciones | actualizado {data.get('updated_at','—')}")
uf = data.get("uf_clp_rate")
uf_at = data.get("uf_rate_updated_at")
if uf:
    print(f"Tasa UF (cacheada): ${uf:,.2f} CLP{f' · al {uf_at[:10]}' if uf_at else ''}")
print("-" * 80)
for l in listings:
    imgs = listing_images(l)
    img_summary = f"{len(imgs)} foto/s" if imgs else "—"
    print(f"[{l['type']:<13}] {l.get('currency','?')} {l.get('price',0):>8} · {l['title']}")
    offer_line = fmt_offer(l)
    if offer_line:
        print(offer_line)
    print(f"  id={l['id']}  imgs={img_summary} (cover={imgs[0] if imgs else '—'})")
    print(f"  {l.get('description','')[:120]}")
    print()
