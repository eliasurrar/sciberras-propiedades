#!/usr/bin/env python3
"""inspect.py — imprime un listado humano del catálogo actual."""
import json, os, sys

DATA = "/Users/openclaw/Desktop/real-estate/site/data/listings.json"

with open(DATA) as f:
    data = json.load(f)

listings = data.get("listings", [])
print(f"Total: {len(listings)} publicaciones | actualizado {data.get('updated_at','—')}")
print("-" * 80)
for l in listings:
    print(f"[{l['type']:<13}] {l.get('currency','?')} {l.get('price',0):>8} · {l['title']}")
    print(f"  id={l['id']}  img={l.get('image','—')}")
    print(f"  {l.get('description','')[:120]}")
    print()
