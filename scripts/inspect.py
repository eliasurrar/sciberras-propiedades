#!/usr/bin/env python3
"""inspect.py — imprime un listado humano del catálogo actual."""
import json, os, sys

DATA = "/Users/openclaw/Desktop/real-estate/docs/data/listings.json"

with open(DATA) as f:
    data = json.load(f)

def listing_images(l):
    if isinstance(l.get("images"), list) and l["images"]:
        return list(l["images"])
    if l.get("image"):
        return [l["image"]]
    return []

listings = data.get("listings", [])
print(f"Total: {len(listings)} publicaciones | actualizado {data.get('updated_at','—')}")
print("-" * 80)
for l in listings:
    imgs = listing_images(l)
    img_summary = f"{len(imgs)} foto/s" if imgs else "—"
    print(f"[{l['type']:<13}] {l.get('currency','?')} {l.get('price',0):>8} · {l['title']}")
    print(f"  id={l['id']}  imgs={img_summary} (cover={imgs[0] if imgs else '—'})")
    print(f"  {l.get('description','')[:120]}")
    print()
