#!/data/data/com.termux/files/usr/bin/bash
# Usage: ./run.sh [N]   # default N=1. Produces /sdcard/Download/<base>.mp4 + .json + .jpg thumbnail per game.
# Needs: BROWSERBASE_API_KEY in env or ~/.nocapflip-recorder.env
set -u
N="${1:-1}"
: "${BROWSERBASE_API_KEY:=}"
if [ -z "$BROWSERBASE_API_KEY" ] && [ -f "$HOME/.nocapflip-recorder.env" ]; then
  . "$HOME/.nocapflip-recorder.env"
fi
if [ -z "$BROWSERBASE_API_KEY" ]; then
  echo "Set BROWSERBASE_API_KEY (export it, or put it in ~/.nocapflip-recorder.env)."
  exit 1
fi

OUT_DIR="${OUT_DIR:-/sdcard/Download}"

proot-distro login debian -- bash -c "cd /root/recorder && BROWSERBASE_API_KEY='$BROWSERBASE_API_KEY' OUT_DIR='$OUT_DIR' N='$N' node record.js" || true

# Post-processing: generate a thumbnail per mp4 that doesn't already have one.
# Grab a frame near the end-match slate (last ~2s of video) so the "{WINNER} WINS" text shows.
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not installed; skipping thumbnails"; exit 0; }
cd "$OUT_DIR"
for mp4 in nocap-*.mp4; do
  [ -f "$mp4" ] || continue
  base="${mp4%.mp4}"
  jpg="${base}.jpg"
  [ -f "$jpg" ] && continue
  dur=$(ffprobe -v quiet -of csv=p=0 -show_entries format=duration "$mp4" 2>/dev/null | head -1)
  dur=${dur%.*}
  case "$dur" in ''|*[!0-9]*) dur=10;; esac
  pick=$((dur > 3 ? dur - 2 : dur))
  ffmpeg -ss "$pick" -i "$mp4" -frames:v 1 -q:v 2 "$jpg" -y >/dev/null 2>&1 && echo "[thumb] $jpg"
done
