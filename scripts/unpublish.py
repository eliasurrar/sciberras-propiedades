#!/usr/bin/env python3
"""
unpublish.py — quita una propiedad por título.

Match: case-insensitive, normaliza acentos, contains-substring.
Si match es ambiguo (>1 resultado), aborta y los lista (Claude debe pedir
desambiguación a Elias).

Uso:
  unpublish.py --title "Casa moderna en Las Condes"             # dry-run, lista candidatos
  unpublish.py --title "Casa moderna en Las Condes" --confirm   # ejecuta

Output: JSON con {action, matches:[{id,title,type,image}], removed_id?, pushed?}
"""
import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import unicodedata

ROOT = "/Users/openclaw/Desktop/real-estate"
SITE = os.path.join(ROOT, "docs")
DATA_FILE = os.path.join(SITE, "data", "listings.json")
LOG = os.path.join(ROOT, "logs", "unpublish.log")


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
    targets = ["docs/data/listings.json", "docs/images/",
               "docs/sitemap.xml", "docs/prop/", "docs/robots.txt"]
    if os.path.isdir(os.path.join(ROOT, "docs", "videos")):
        targets.append("docs/videos/")
    # IndexNow keyfile
    docs_path = os.path.join(ROOT, "docs")
    for fname in os.listdir(docs_path):
        if fname.endswith(".txt") and fname != "robots.txt":
            targets.append(f"docs/{fname}")
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
    p.add_argument("--title", required=True)
    p.add_argument("--confirm", action="store_true",
                   help="Ejecuta la eliminación (sin esto solo lista candidatos)")
    p.add_argument("--id", help="Eliminar por id exacto (bypassa match por título)")
    p.add_argument("--no-push", action="store_true")
    args = p.parse_args()

    with open(DATA_FILE) as f:
        data = json.load(f)
    listings = data["listings"]

    if args.id:
        matches = [l for l in listings if l.get("id") == args.id]
    else:
        matches = find_matches(listings, args.title)

    def listing_images(l):
        if isinstance(l.get("images"), list) and l["images"]:
            return list(l["images"])
        if l.get("image"):
            return [l["image"]]
        return []

    def listing_videos(l):
        if isinstance(l.get("videos"), list) and l["videos"]:
            return list(l["videos"])
        return []

    summary = {
        "action":  "preview" if not args.confirm else "remove",
        "matches": [{"id": l["id"], "title": l["title"], "type": l["type"],
                     "images": listing_images(l),
                     "videos": listing_videos(l)}
                    for l in matches],
    }

    if not matches:
        summary["error"] = "no_match"
        log(f"no match for title={args.title!r}")
        print(json.dumps(summary, ensure_ascii=False))
        return 4

    if len(matches) > 1 and not args.id:
        summary["error"] = "ambiguous"
        log(f"ambiguous: {len(matches)} matches for title={args.title!r}")
        print(json.dumps(summary, ensure_ascii=False))
        return 5

    if not args.confirm:
        log(f"dry-run: would remove id={matches[0]['id']}")
        print(json.dumps(summary, ensure_ascii=False))
        return 0

    target = matches[0]
    data["listings"] = [l for l in listings if l["id"] != target["id"]]
    data["updated_at"] = dt.datetime.now().astimezone().isoformat(timespec="seconds")

    for img_rel in listing_images(target):
        img_path = os.path.join(SITE, img_rel) if img_rel else None
        if img_path and os.path.exists(img_path):
            os.remove(img_path)
            log(f"removed image {img_path}")

    for vid_rel in listing_videos(target):
        vid_path = os.path.join(SITE, vid_rel) if vid_rel else None
        if vid_path and os.path.exists(vid_path):
            os.remove(vid_path)
            log(f"removed video {vid_path}")

    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    log(f"removed id={target['id']} title={target['title']!r}; remaining={len(data['listings'])}")

    # SEO: regenera sitemap.xml + páginas estáticas por listing
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import seo_helpers
    seo_helpers.regenerate_all()
    log("regenerated sitemap.xml + per-listing pages")

    summary["removed_id"]    = target["id"]
    summary["removed_title"] = target["title"]

    if args.no_push:
        summary["pushed"] = False
        print(json.dumps(summary, ensure_ascii=False))
        return 0

    if commit_and_push(f"unpublish: {target['title']}"):
        summary["pushed"] = True
        log("pushed to origin/main")
    else:
        summary["pushed"] = False
        log("commit/push step did not push")

    # IndexNow: avisa a Bing/Yandex/etc que la URL ya no existe (al
    # crawlearla obtienen 404 y la sacan del índice). También refrescamos
    # sitemap/home para que vean los cambios al toque.
    if summary["pushed"]:
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
