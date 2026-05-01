#!/usr/bin/env python3
"""
publish.py — add a property listing (with one or more photos) to the site.

Workflow:
  1. Validate inputs and copy each photo into docs/images/ (resized via `sips`).
  2. Append a new entry to docs/data/listings.json. The listing stores an
     `images` array; the first image is the cover.
  3. git add + commit + push (deploy via GitHub Pages).
  4. Print the listing JSON to stdout for the caller (the Telegram-driven
     Claude session) to relay back to Elias.

Usage:
  publish.py \\
      --image /path/photo1.jpg /path/photo2.jpg /path/photo3.jpg \\
      --title "Casa en Las Condes" \\
      --description "3 dorms, jardín, 180 m²" \\
      --price 8500 \\
      --currency UF \\
      --type casa

  Single-photo publication still works:
  publish.py --image /path/photo.jpg --title "..." --description "..." ...
"""
import argparse
import datetime as dt
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path("/Users/openclaw/Desktop/real-estate")
SITE = ROOT / "docs"
DATA = SITE / "data" / "listings.json"
IMAGES = SITE / "images"
LOG = ROOT / "logs" / "publish.log"

VALID_TYPES = {"casa", "departamento", "terreno"}
VALID_CURRENCIES = {"UF", "CLP", "USD"}
MAX_IMAGE_DIM = 1600  # max width/height in px


def log(msg: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    ts = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(LOG, "a") as f:
        f.write(f"[{ts}] {msg}\n")


def slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"[áàäâ]", "a", s)
    s = re.sub(r"[éèëê]", "e", s)
    s = re.sub(r"[íìïî]", "i", s)
    s = re.sub(r"[óòöô]", "o", s)
    s = re.sub(r"[úùüû]", "u", s)
    s = re.sub(r"ñ", "n", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:60]


def make_id(title: str) -> str:
    base = slugify(title) or "listing"
    h = hashlib.sha1(f"{title}:{dt.datetime.now().isoformat()}".encode()).hexdigest()[:6]
    return f"{base}-{h}"


def process_image(src: Path, dst: Path) -> None:
    """Resize the image to MAX_IMAGE_DIM and save as JPEG via sips."""
    IMAGES.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, dst)
    rc = subprocess.call([
        "/usr/bin/sips",
        "--resampleHeightWidthMax", str(MAX_IMAGE_DIM),
        "--setProperty", "format", "jpeg",
        "--setProperty", "formatOptions", "80",
        str(dst),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if rc != 0:
        raise RuntimeError(f"sips failed (rc={rc}) processing {src}")


def load_listings() -> dict:
    with open(DATA) as f:
        return json.load(f)


def save_listings(payload: dict) -> None:
    payload["updated_at"] = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    with open(DATA, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


def git(*args: str) -> int:
    return subprocess.call(["git", *args], cwd=ROOT)


def git_publish(commit_msg: str) -> bool:
    if (ROOT / ".git").is_dir():
        if git("add", "docs/data/listings.json", "docs/images/") != 0:
            log("git add failed")
            return False
        if git("commit", "-m", commit_msg) != 0:
            log("git commit failed (maybe no changes?)")
            return False
        if git("push") != 0:
            log("git push failed")
            return False
        return True
    log("not a git repo yet — skipping commit/push")
    return False


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image",        required=True, nargs="+",
                    help="One or more paths to photo files. First is the cover.")
    ap.add_argument("--title",        required=True)
    ap.add_argument("--description",  required=True)
    ap.add_argument("--price",        required=True, type=float)
    ap.add_argument("--currency",     default="UF", choices=sorted(VALID_CURRENCIES))
    ap.add_argument("--type",         dest="ptype", required=True, choices=sorted(VALID_TYPES))
    ap.add_argument("--no-push",      action="store_true",
                    help="Skip git commit/push (use for dry-runs)")
    args = ap.parse_args()

    sources = [Path(p).expanduser() for p in args.image]
    for src in sources:
        if not src.is_file():
            print(f"ERROR: image not found: {src}", file=sys.stderr)
            sys.exit(2)

    listing_id = make_id(args.title)

    image_rel_paths = []
    for idx, src in enumerate(sources, start=1):
        suffix = "" if (len(sources) == 1 and idx == 1) else f"-{idx}"
        image_name = f"{listing_id}{suffix}.jpg"
        dst = IMAGES / image_name
        process_image(src, dst)
        image_rel_paths.append(f"images/{image_name}")

    payload = load_listings()
    listing = {
        "id":          listing_id,
        "title":       args.title.strip(),
        "description": args.description.strip(),
        "price":       args.price,
        "currency":    args.currency,
        "type":        args.ptype,
        "images":      image_rel_paths,
        "created_at":  dt.datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    payload.setdefault("listings", []).insert(0, listing)
    save_listings(payload)
    log(f"added {listing_id}: {args.title} ({len(image_rel_paths)} foto/s)")

    pushed = False
    if not args.no_push:
        commit_msg = f"publish: {args.title} ({listing_id}, {len(image_rel_paths)} foto/s)"
        pushed = git_publish(commit_msg)

    print(json.dumps({"ok": True, "listing": listing, "pushed": pushed}, ensure_ascii=False))


if __name__ == "__main__":
    main()
