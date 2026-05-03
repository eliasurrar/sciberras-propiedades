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
import urllib.request
from pathlib import Path

ROOT = Path("/Users/openclaw/Desktop/real-estate")
SITE = ROOT / "docs"
DATA = SITE / "data" / "listings.json"
IMAGES = SITE / "images"
VIDEOS = SITE / "videos"
LOG = ROOT / "logs" / "publish.log"
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm"}

VALID_TYPES = {"casa", "departamento", "terreno"}
VALID_CURRENCIES = {"UF", "CLP", "USD"}
VALID_OPERATIONS = {"venta", "arriendo"}
VALID_REGIONS = {"metropolitana", "valparaiso"}
MAX_IMAGE_DIM = 2400      # max width/height in px (retina-friendly, web-optimized)
JPEG_QUALITY  = 90        # 0-100 (sips formatOptions)
UF_API = "https://mindicador.cl/api/uf"
UF_FETCH_TIMEOUT = 5  # seconds


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
    """Resize the image to MAX_IMAGE_DIM and save as JPEG via sips.

    sips --resampleHeightWidthMax only downscales; smaller sources keep
    their native dimensions. Quality is JPEG q90 — the source should be
    a Telegram *document* (not "photo") so the input isn't already
    Telegram-compressed.
    """
    IMAGES.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, dst)
    rc = subprocess.call([
        "/usr/bin/sips",
        "--resampleHeightWidthMax", str(MAX_IMAGE_DIM),
        "--setProperty", "format", "jpeg",
        "--setProperty", "formatOptions", str(JPEG_QUALITY),
        str(dst),
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if rc != 0:
        raise RuntimeError(f"sips failed (rc={rc}) processing {src}")


def get_image_dims(path: Path) -> tuple[int, int] | None:
    """Read pixel dimensions of a JPEG via sips. Returns None on failure."""
    try:
        out = subprocess.check_output(
            ["/usr/bin/sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)],
            stderr=subprocess.DEVNULL, text=True,
        )
        w = h = None
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("pixelWidth:"):
                w = int(line.split(":", 1)[1].strip())
            elif line.startswith("pixelHeight:"):
                h = int(line.split(":", 1)[1].strip())
        if w and h:
            return (w, h)
    except Exception as e:
        log(f"sips dims failed for {path}: {e!r}")
    return None


def orientation_for(w: int, h: int) -> str:
    """'v' for portrait, 'h' for landscape (square defaults to 'h')."""
    return "v" if h > w else "h"


WEB_SAFE_VIDEO_CODECS = {"h264", "avc1"}


def _video_codec(path: Path) -> str:
    """Return the v:0 codec name (e.g. 'h264', 'hevc', 'vp9') or '' if unknown."""
    if not shutil.which("ffprobe"):
        return ""
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(path)],
            text=True,
        ).strip()
        return out.splitlines()[0].strip().lower() if out else ""
    except Exception as e:
        log(f"ffprobe codec check failed for {path}: {e!r}")
        return ""


def copy_video(src: Path, dst: Path) -> None:
    """Copy and (if needed) transcode video to H.264/AAC for universal browser support.

    iPhone records HEVC and Telegram sometimes re-wraps it as VP9-in-MP4 — both
    fail in Safari/Chrome respectively. We probe the codec; if it's not in
    WEB_SAFE_VIDEO_CODECS, we transcode with libx264 + AAC + faststart.
    """
    VIDEOS.mkdir(parents=True, exist_ok=True)

    codec = _video_codec(src)
    if codec in WEB_SAFE_VIDEO_CODECS or not shutil.which("ffmpeg"):
        if codec and codec not in WEB_SAFE_VIDEO_CODECS:
            log(f"warn: ffmpeg missing — copying {src.name} as-is despite codec={codec}")
        shutil.copy(src, dst)
        return

    log(f"transcoding {src.name} ({codec}) → H.264/AAC")
    rc = subprocess.call(
        ["ffmpeg", "-y", "-i", str(src),
         "-c:v", "libx264", "-preset", "medium", "-crf", "23",
         "-c:a", "aac", "-b:a", "128k",
         "-movflags", "+faststart",
         str(dst)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if rc != 0 or not dst.exists():
        log(f"ffmpeg transcode failed (rc={rc}) for {src} — falling back to copy")
        shutil.copy(src, dst)


def get_video_meta(path: Path) -> dict:
    """Best-effort video metadata via ffprobe if available; returns {} on failure."""
    meta: dict = {"size_bytes": path.stat().st_size}
    if not shutil.which("ffprobe"):
        return meta
    try:
        out = subprocess.check_output(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height,duration",
                "-of", "csv=p=0",
                str(path),
            ],
            text=True,
        ).strip()
        parts = out.split(",")
        if len(parts) >= 2:
            try:
                meta["w"] = int(parts[0]); meta["h"] = int(parts[1])
                meta["orientation"] = orientation_for(meta["w"], meta["h"])
            except ValueError:
                pass
        if len(parts) >= 3 and parts[2]:
            try: meta["duration_s"] = round(float(parts[2]), 1)
            except ValueError: pass
    except Exception as e:
        log(f"ffprobe failed for {path}: {e!r}")
    return meta


def load_listings() -> dict:
    with open(DATA) as f:
        return json.load(f)


def refresh_uf_rate(payload: dict) -> None:
    """Best-effort UF rate refresh from mindicador.cl. Never raises."""
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


def save_listings(payload: dict) -> None:
    payload["updated_at"] = dt.datetime.now().astimezone().isoformat(timespec="seconds")
    with open(DATA, "w") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


def git(*args: str) -> int:
    return subprocess.call(["git", *args], cwd=ROOT)


def git_publish(commit_msg: str) -> bool:
    if (ROOT / ".git").is_dir():
        targets = ["docs/data/listings.json", "docs/images/",
                   "docs/sitemap.xml", "docs/prop/", "docs/robots.txt"]
        if VIDEOS.is_dir():
            targets.append("docs/videos/")
        # IndexNow keyfile (debe estar accesible en el dominio)
        for kf in SITE.glob("*.txt"):
            if kf.name not in {"robots.txt"}:
                targets.append(f"docs/{kf.name}")
        if git("add", *targets) != 0:
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
    ap.add_argument("--video",        nargs="+", default=[],
                    help="Optional path(s) to video files (.mp4/.mov/.webm).")
    ap.add_argument("--title",        required=True)
    ap.add_argument("--description",  required=True)
    ap.add_argument("--price",        required=True, type=float)
    ap.add_argument("--currency",     default="UF", choices=sorted(VALID_CURRENCIES))
    ap.add_argument("--type",         dest="ptype", required=True, choices=sorted(VALID_TYPES))
    ap.add_argument("--operation",    default="venta", choices=sorted(VALID_OPERATIONS),
                    help="venta o arriendo")
    ap.add_argument("--bedrooms",     type=int, default=None)
    ap.add_argument("--bathrooms",    type=int, default=None)
    ap.add_argument("--area-built",   dest="area_built", type=float, default=None,
                    help="Superficie construida en m²")
    ap.add_argument("--area-lot",     dest="area_lot", type=float, default=None,
                    help="Superficie del terreno en m²")
    ap.add_argument("--parking",      type=int, default=None,
                    help="Cantidad de estacionamientos")
    ap.add_argument("--commune",      default=None, help="Comuna (ej: Nogales)")
    ap.add_argument("--region",       default=None, choices=sorted(VALID_REGIONS))
    ap.add_argument("--pool",         action="store_true", help="Tiene piscina")
    ap.add_argument("--furnished",    action="store_true", help="Amoblado")
    ap.add_argument("--no-push",      action="store_true",
                    help="Skip git commit/push (use for dry-runs)")
    args = ap.parse_args()

    sources = [Path(p).expanduser() for p in args.image]
    for src in sources:
        if not src.is_file():
            print(f"ERROR: image not found: {src}", file=sys.stderr)
            sys.exit(2)

    video_sources = [Path(p).expanduser() for p in (args.video or [])]
    for src in video_sources:
        if not src.is_file():
            print(f"ERROR: video not found: {src}", file=sys.stderr)
            sys.exit(2)
        if src.suffix.lower() not in VIDEO_EXTS:
            print(f"ERROR: unsupported video format: {src.suffix}", file=sys.stderr)
            sys.exit(2)

    listing_id = make_id(args.title)

    image_rel_paths = []
    image_meta: list[dict] = []
    for idx, src in enumerate(sources, start=1):
        suffix = "" if (len(sources) == 1 and idx == 1) else f"-{idx}"
        image_name = f"{listing_id}{suffix}.jpg"
        dst = IMAGES / image_name
        process_image(src, dst)
        image_rel_paths.append(f"images/{image_name}")
        dims = get_image_dims(dst)
        if dims:
            image_meta.append({"w": dims[0], "h": dims[1],
                               "orientation": orientation_for(*dims)})
        else:
            image_meta.append({"orientation": "h"})

    video_rel_paths: list[str] = []
    video_meta: list[dict] = []
    for idx, src in enumerate(video_sources, start=1):
        ext = src.suffix.lower()
        suffix = "" if (len(video_sources) == 1 and idx == 1) else f"-{idx}"
        video_name = f"{listing_id}{suffix}{ext}"
        dst = VIDEOS / video_name
        copy_video(src, dst)
        video_rel_paths.append(f"videos/{video_name}")
        video_meta.append(get_video_meta(dst))

    payload = load_listings()
    listing = {
        "id":          listing_id,
        "title":       args.title.strip(),
        "description": args.description.strip(),
        "price":       args.price,
        "currency":    args.currency,
        "type":        args.ptype,
        "operation":   args.operation,
        "images":      image_rel_paths,
        "image_meta":  image_meta,
        "created_at":  dt.datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    if video_rel_paths:
        listing["videos"] = video_rel_paths
        listing["video_meta"] = video_meta
    if args.bedrooms is not None:    listing["bedrooms"]      = args.bedrooms
    if args.bathrooms is not None:   listing["bathrooms"]     = args.bathrooms
    if args.area_built is not None:  listing["area_built_m2"] = args.area_built
    if args.area_lot is not None:    listing["area_lot_m2"]   = args.area_lot
    if args.parking is not None:     listing["parking"]       = args.parking
    if args.pool:                    listing["pool"]          = True
    if args.furnished:               listing["furnished"]     = True
    if args.commune:                 listing["commune"]       = args.commune.strip()
    if args.region:                  listing["region"]        = args.region
    payload.setdefault("listings", []).insert(0, listing)
    refresh_uf_rate(payload)
    save_listings(payload)
    n_video_msg = f", {len(video_rel_paths)} video/s" if video_rel_paths else ""
    log(f"added {listing_id}: {args.title} ({len(image_rel_paths)} foto/s{n_video_msg})")

    # SEO: regenera sitemap.xml + páginas estáticas por listing
    sys.path.insert(0, str(Path(__file__).parent))
    import seo_helpers
    seo_helpers.regenerate_all()
    log("regenerated sitemap.xml + per-listing pages")

    pushed = False
    if not args.no_push:
        commit_msg = f"publish: {args.title} ({listing_id}, {len(image_rel_paths)} foto/s{n_video_msg})"
        pushed = git_publish(commit_msg)

    # IndexNow: notifica a Bing/Yandex/Naver/Seznam que hay URL nueva
    # (Google no participa de IndexNow → eso queda manual / sitemap).
    indexnow_result = None
    if pushed:
        indexnow_result = seo_helpers.ping_indexnow([
            seo_helpers.listing_url(listing_id),
            f"{seo_helpers.CANONICAL}/",
            f"{seo_helpers.CANONICAL}/sitemap.xml",
        ])
        log(f"indexnow: {indexnow_result}")

    print(json.dumps({"ok": True, "listing": listing, "pushed": pushed,
                      "indexnow": indexnow_result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
