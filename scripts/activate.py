#!/usr/bin/env python3
"""
activate.py — activa (o vuelve a desactivar) un listing con status:"inactive".

Match: por --id (exacto) o --title (substring case/accent-insensitive).
Si el match por título es ambiguo, se aborta con la lista de candidatos.

Uso:
  # dry-run, lista candidatos
  activate.py --title "Villa Los Alerces"

  # activa (aparece en catálogo, destacadas, búsqueda, sitemap, /prop/<id>/)
  activate.py --title "Villa Los Alerces" --confirm

  # vuelve a poner inactive (por si se activó por error)
  activate.py --title "Villa Los Alerces" --deactivate --confirm

  # por id exacto
  activate.py --id casa-los-alerces-quillota-a1b2c3 --confirm

Output JSON: {action, matches:[...], updated_id?, pushed?, error?}
Exit codes: 0 ok, 4 no_match, 5 ambiguous, 1/3 unexpected
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import unicodedata

ROOT = "/Users/openclaw/projects/real-estate"
SITE = os.path.join(ROOT, "docs")
DATA_FILE = os.path.join(SITE, "data", "listings.json")
LOG = os.path.join(ROOT, "logs", "activate.log")


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


def git(*args, check=True):
    return subprocess.run(["git", "-C", ROOT] + list(args),
                          check=check, capture_output=True, text=True)


def commit_and_push(commit_msg):
    targets = ["docs/data/listings.json", "docs/sitemap.xml", "docs/prop/"]
    git("add", *targets)
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

    p.add_argument("--deactivate", action="store_true",
                   help="En vez de activar, vuelve a marcar status:inactive")
    p.add_argument("--confirm", action="store_true",
                   help="Ejecuta el cambio (sin esto solo lista candidatos)")
    p.add_argument("--no-push", action="store_true")
    args = p.parse_args()

    with open(DATA_FILE) as f:
        data = json.load(f)
    listings = data.get("listings", [])

    if args.id:
        matches = [l for l in listings if l.get("id") == args.id]
    else:
        matches = find_matches(listings, args.title)

    summary = {
        "action": "preview" if not args.confirm
                  else ("deactivate" if args.deactivate else "activate"),
        "matches": [
            {"id": l["id"], "title": l["title"], "type": l.get("type"),
             "status": l.get("status", "active")}
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

    if not args.confirm:
        log(f"dry-run: would {'deactivate' if args.deactivate else 'activate'} id={target['id']}")
        print(json.dumps(summary, ensure_ascii=False))
        return 0

    for l in listings:
        if l["id"] == target["id"]:
            if args.deactivate:
                l["status"] = "inactive"
            else:
                l.pop("status", None)
            break

    data["updated_at"] = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    log(f"{'deactivated' if args.deactivate else 'activated'} id={target['id']} title={target['title']!r}")

    # SEO: regenera sitemap.xml + páginas estáticas (respeta status:inactive)
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import seo_helpers
    seo_helpers.regenerate_all()
    log("regenerated sitemap.xml + per-listing pages")

    summary["updated_id"] = target["id"]

    if args.no_push:
        summary["pushed"] = False
        print(json.dumps(summary, ensure_ascii=False))
        return 0

    verb = "deactivate" if args.deactivate else "activate"
    if commit_and_push(f"{verb}: {target['title']}"):
        summary["pushed"] = True
        log("pushed to origin/main")
    else:
        summary["pushed"] = False
        log("commit/push step did not push")

    if summary["pushed"] and not args.deactivate:
        result = seo_helpers.ping_indexnow([
            seo_helpers.listing_url(target["id"]),
            f"{seo_helpers.CANONICAL}/",
            f"{seo_helpers.CANONICAL}/sitemap.xml",
        ])
        summary["indexnow"] = result
        log(f"indexnow: {result}")

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
