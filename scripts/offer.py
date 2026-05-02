#!/usr/bin/env python3
"""
offer.py — pone o saca una oferta temporal sobre un listing publicado.

Match: por --id (exacto) o --title (substring case/accent-insensitive).
Si el match por título es ambiguo, se aborta con la lista de candidatos.

Uso:
  # set offer (dry-run primero, lista candidatos)
  offer.py --title "Vitacura"  --price 6000 --currency UF --until 2026-06-15
  # set offer (ejecuta + push)
  offer.py --title "Vitacura"  --price 6000 --currency UF --until 2026-06-15 --confirm

  # set sin fecha de vencimiento (oferta indefinida)
  offer.py --title "Vitacura"  --price 6000 --currency UF --confirm

  # quitar oferta
  offer.py --title "Vitacura" --clear --confirm

  # por id exacto
  offer.py --id departamento-vitacura-2d-2b-b487fd --price 6000 --confirm

Output JSON: {action, matches:[...], updated_id?, offer?, pushed?, error?}
Exit codes: 0 ok, 4 no_match, 5 ambiguous, 6 invalid_args, 1/3 unexpected
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import unicodedata
import urllib.request

ROOT = "/Users/openclaw/Desktop/real-estate"
SITE = os.path.join(ROOT, "docs")
DATA_FILE = os.path.join(SITE, "data", "listings.json")
LOG = os.path.join(ROOT, "logs", "offer.log")

VALID_CURRENCIES = {"UF", "CLP", "USD"}
UF_API = "https://mindicador.cl/api/uf"
UF_FETCH_TIMEOUT = 5  # seconds


def log(msg):
    ts = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}\n"
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a") as f:
        f.write(line)
    print(line, end="", file=sys.stderr)


def normalize(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()


def find_matches(listings, query):
    q = normalize(query)
    return [l for l in listings if q in normalize(l.get("title", ""))]


def parse_until(s):
    """Accept YYYY-MM-DD or full ISO. Returns ISO with end-of-day local time."""
    if not s:
        return None
    s = s.strip()
    # Try date-only first (most common Telegram input).
    try:
        d = dt.date.fromisoformat(s)
        # End of day in local tz so the offer lasts the full day.
        local_tz = dt.datetime.now().astimezone().tzinfo
        return dt.datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=local_tz).isoformat(timespec="seconds")
    except ValueError:
        pass
    # Try full ISO.
    try:
        d = dt.datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.astimezone()
        return d.isoformat(timespec="seconds")
    except ValueError:
        return None


def refresh_uf_rate(payload):
    """Best-effort: hit mindicador.cl and update uf_clp_rate. Never raises."""
    try:
        req = urllib.request.Request(UF_API, headers={"User-Agent": "sciberras-propiedades/1.0"})
        with urllib.request.urlopen(req, timeout=UF_FETCH_TIMEOUT) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        serie = data.get("serie") or []
        if not serie:
            return
        latest = serie[0]
        valor = latest.get("valor")
        fecha = latest.get("fecha")
        if isinstance(valor, (int, float)) and valor > 0:
            payload["uf_clp_rate"] = float(valor)
            if fecha:
                payload["uf_rate_updated_at"] = fecha
    except Exception as e:
        log(f"uf refresh skipped: {e!r}")


def git(*args, check=True):
    return subprocess.run(["git", "-C", ROOT] + list(args),
                          check=check, capture_output=True, text=True)


def commit_and_push(commit_msg):
    git("add", "docs/data/listings.json")
    if not git("status", "--porcelain").stdout.strip():
        return False
    git("commit", "-m", commit_msg)
    push = git("push", "origin", "main", check=False)
    if push.returncode != 0:
        log(f"push failed: {push.stderr.strip()}")
        return False
    return True


def main():
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--id",    help="Listing id exacto")
    g.add_argument("--title", help="Fragmento del título (matching insensitive)")

    p.add_argument("--price",    type=float, help="Precio de oferta")
    p.add_argument("--currency", choices=sorted(VALID_CURRENCIES),
                   help="Moneda de la oferta (default: misma que el listing)")
    p.add_argument("--until",    help="Vencimiento (YYYY-MM-DD o ISO). Opcional.")
    p.add_argument("--clear",    action="store_true",
                   help="Quita la oferta del listing en vez de setearla")
    p.add_argument("--confirm",  action="store_true",
                   help="Ejecuta los cambios. Sin esto, dry-run.")
    p.add_argument("--no-push",  action="store_true")
    args = p.parse_args()

    # Validate args
    if not args.clear and args.price is None:
        print(json.dumps({"error": "invalid_args",
                          "msg": "Falta --price (o usa --clear)"},
                         ensure_ascii=False))
        return 6
    if args.clear and (args.price is not None or args.currency or args.until):
        print(json.dumps({"error": "invalid_args",
                          "msg": "--clear no admite --price/--currency/--until"},
                         ensure_ascii=False))
        return 6

    until_iso = None
    if args.until:
        until_iso = parse_until(args.until)
        if not until_iso:
            print(json.dumps({"error": "invalid_args",
                              "msg": f"--until inválido: {args.until!r} (usa YYYY-MM-DD)"},
                             ensure_ascii=False))
            return 6

    with open(DATA_FILE) as f:
        data = json.load(f)
    listings = data.get("listings", [])

    if args.id:
        matches = [l for l in listings if l.get("id") == args.id]
    else:
        matches = find_matches(listings, args.title)

    summary = {
        "action": "preview" if not args.confirm else ("clear" if args.clear else "set"),
        "matches": [
            {
                "id": l["id"],
                "title": l["title"],
                "type": l.get("type"),
                "price": l.get("price"),
                "currency": l.get("currency"),
                "offer": l.get("offer"),
            }
            for l in matches
        ],
    }

    if not matches:
        summary["error"] = "no_match"
        log(f"no match for query={args.id or args.title!r}")
        print(json.dumps(summary, ensure_ascii=False))
        return 4

    if len(matches) > 1 and not args.id:
        summary["error"] = "ambiguous"
        log(f"ambiguous: {len(matches)} matches for title={args.title!r}")
        print(json.dumps(summary, ensure_ascii=False))
        return 5

    target = matches[0]

    # Build the planned offer object (or signal removal).
    if args.clear:
        new_offer = None
    else:
        currency = args.currency or target.get("currency") or "UF"
        new_offer = {
            "price":    float(args.price),
            "currency": currency,
            "started_at": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        }
        if until_iso:
            new_offer["until"] = until_iso

    summary["target"] = {
        "id": target["id"],
        "title": target["title"],
        "current_price": target.get("price"),
        "current_currency": target.get("currency"),
        "current_offer": target.get("offer"),
    }
    summary["offer"] = new_offer

    if not args.confirm:
        log(f"dry-run: would {'clear' if args.clear else 'set'} offer on id={target['id']}")
        print(json.dumps(summary, ensure_ascii=False))
        return 0

    # Apply mutation in-place and persist.
    for l in listings:
        if l["id"] == target["id"]:
            if new_offer is None:
                l.pop("offer", None)
            else:
                l["offer"] = new_offer
            break

    refresh_uf_rate(data)
    data["updated_at"] = dt.datetime.now().astimezone().isoformat(timespec="seconds")

    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    log(f"{'cleared' if args.clear else 'set'} offer on id={target['id']} ({target['title']!r})")

    summary["updated_id"] = target["id"]

    if args.no_push:
        summary["pushed"] = False
        print(json.dumps(summary, ensure_ascii=False))
        return 0

    msg = (f"offer: clear {target['title']}"
           if args.clear
           else f"offer: {new_offer['price']:g} {new_offer['currency']} on {target['title']}")
    if commit_and_push(msg):
        summary["pushed"] = True
        log("pushed to origin/main")
    else:
        summary["pushed"] = False
        log("commit/push step did not push")

    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main() or 0)
    except subprocess.CalledProcessError as e:
        log(f"subprocess failed: {e} stderr={e.stderr!r}")
        sys.exit(3)
    except Exception as e:
        log(f"ERROR: {e!r}")
        sys.exit(1)
