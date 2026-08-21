#!/usr/bin/env python3
"""Move the moov atom to the front of MP4s in the library, in place.

Why: an MP4 with its moov atom at the end cannot be played progressively. A
browser has to fetch the tail of the file before it can show a duration or start
decoding, which over a network share is an extra request plus a seek on a
possibly large file. That was the one real benefit the removed transcoding
feature provided (`-movflags +faststart`), and it did not need a second copy of
every video to deliver it.

This is a remux, not a re-encode: `-c copy`, so the streams are byte-identical
and the file size changes only by the size of the relocated index. It is a
one-off - new v.redd.it downloads get +faststart at mux time in the downloader.

Two things this is careful about, both learned the hard way:

  * ffmpeg picks its output muxer from the file EXTENSION. A temp file named
    `foo.mp4.tmp` fails with "Unable to find a suitable output format", so the
    temp always ends in a real `.mp4`.
  * The library is on a network mount. Muxing with +faststart rewrites the index
    in place and is seek-heavy, so it happens on local disk and only a
    sequential copy touches the share. `os.replace` across that boundary fails
    with EXDEV, so it is copy-then-rename on the far side.

Dry-run by default. Nothing is modified without --apply.

    python3 faststart.py /mnt/media/Photos            # report only
    python3 faststart.py /mnt/media/Photos --apply    # rewrite in place
"""
import argparse
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import uuid

# faststart is an MP4-family concept. Matroska/WebM index differently and are
# left alone.
REMUXABLE = (".mp4", ".m4v", ".mov")
SKIP_DIRS = {"transcodes", "thumbnails", ".tmp-transcode"}


def top_level_boxes(path, limit=64):
    """Yield (name, size) for the top-level boxes of an ISO-BMFF file."""
    with open(path, "rb") as f:
        for _ in range(limit):
            header = f.read(8)
            if len(header) < 8:
                return
            size, name = struct.unpack(">I4s", header)
            name = name.decode("latin-1")
            if size == 1:                       # 64-bit extended size
                ext = f.read(8)
                if len(ext) < 8:
                    return
                size = struct.unpack(">Q", ext)[0]
                header_len = 16
            elif size == 0:                     # extends to EOF
                yield name, None
                return
            else:
                header_len = 8
            yield name, size
            if size < header_len:
                return                          # malformed; stop rather than loop
            f.seek(size - header_len, os.SEEK_CUR)


def needs_faststart(path):
    """True when moov comes after mdat (so the file can't stream progressively).

    Returns False for anything unreadable or not recognisably MP4 - this script
    should never be the reason a file gets touched on a guess.
    """
    try:
        order = [name for name, _ in top_level_boxes(path)]
    except (OSError, struct.error):
        return False
    if "moov" not in order or "mdat" not in order:
        return False
    return order.index("moov") > order.index("mdat")


def remux(src, tmp_dir):
    """Remux `src` to a faststart copy in `tmp_dir`. Returns the temp path."""
    out = os.path.join(tmp_dir, "%s.mp4" % uuid.uuid4().hex)
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", src, "-map", "0", "-c", "copy",
         "-movflags", "+faststart", "-y", out],
        capture_output=True, timeout=900,
    )
    if proc.returncode != 0 or not os.path.exists(out) or os.path.getsize(out) == 0:
        detail = proc.stderr.decode(errors="ignore").strip()[-300:]
        raise RuntimeError(detail or "ffmpeg produced nothing")
    return out


def publish(tmp_path, dest):
    """Swap the remuxed file in with sequential writes only."""
    staged = dest + ".faststart.tmp"
    shutil.copyfile(tmp_path, staged)   # sequential; safe on a network share
    os.replace(staged, dest)            # same filesystem, so atomic


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", help="library root to walk")
    ap.add_argument("--apply", action="store_true",
                    help="actually rewrite files (default: report only)")
    ap.add_argument("--tmp", default=None,
                    help="local scratch dir for muxing (default: system temp)")
    ap.add_argument("--limit", type=int, default=0,
                    help="stop after this many rewrites (0 = no limit)")
    args = ap.parse_args()

    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found on PATH")

    tmp_dir = args.tmp or tempfile.mkdtemp(prefix="faststart-")
    os.makedirs(tmp_dir, exist_ok=True)

    scanned = needing = fixed = failed = 0
    for dirpath, dirnames, filenames in os.walk(args.root):
        dirnames[:] = [d for d in dirnames if d.lower() not in SKIP_DIRS]
        for name in filenames:
            if not name.lower().endswith(REMUXABLE):
                continue
            path = os.path.join(dirpath, name)
            scanned += 1
            if not needs_faststart(path):
                continue
            needing += 1
            rel = os.path.relpath(path, args.root)
            if not args.apply:
                print("would fix: %s" % rel)
                continue
            tmp_path = None
            try:
                tmp_path = remux(path, tmp_dir)
                publish(tmp_path, path)
                fixed += 1
                print("fixed: %s" % rel)
            except Exception as e:                      # noqa: BLE001
                failed += 1
                print("FAILED: %s: %s" % (rel, e), file=sys.stderr)
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    os.remove(tmp_path)
            if args.limit and fixed >= args.limit:
                print("hit --limit %d, stopping" % args.limit)
                break
        else:
            continue
        break

    print("\nscanned %d MP4s; %d need faststart; %d rewritten; %d failed%s"
          % (scanned, needing, fixed, failed,
             "" if args.apply else "  (dry run - pass --apply)"))


if __name__ == "__main__":
    main()
