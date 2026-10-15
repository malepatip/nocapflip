#!/data/data/com.termux/files/usr/bin/bash
# Usage: ./run-offline.sh [N]   # default N=1. Fully offline (Playwright + bundled Firefox in Debian proot).
# Produces: /sdcard/Download/<base>.webm (recording) → transcoded to <base>.mp4 → <base>.jpg thumbnail + <base>.json.
# No Browserbase quota needed; one-time setup downloads Playwright's Firefox (~100MB) and ffmpeg.
set -u
N="${1:-1}"
OUT_DIR="${OUT_DIR:-/sdcard/Download}"

proot-distro login debian -- bash -c "cd /root/recorder && OUT_DIR='$OUT_DIR' N='$N' CONCURRENCY='${CONCURRENCY:-1}' LONG_FORM='${LONG_FORM:-}' STAGE='${STAGE:-}' GOAL='${GOAL:-}' CUT_RATE='${CUT_RATE:-}' HANG_SIGMA='${HANG_SIGMA:-}' PRIVACY='${PRIVACY:-}' node record-offline.js" || true

# Post-processing: transcode webm → mp4 and extract thumbnails.
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not installed; skipping transcode + thumbnails"; exit 0; }
cd "$OUT_DIR"
for webm in nocap-*.webm; do
  [ -f "$webm" ] || continue
  base="${webm%.webm}"
  mp4="${base}.mp4"
  [ -f "$mp4" ] && continue
  # Firefox webm is often missing a duration tag; re-mux first so ffmpeg can read it.
  tmp="${base}.fixed.webm"
  ffmpeg -y -err_detect ignore_err -i "$webm" -c copy "$tmp" >/dev/null 2>&1 || cp "$webm" "$tmp"
  ffmpeg -y -i "$tmp" -c:v libx264 -preset veryfast -crf 20 -c:a aac -b:a 128k -movflags +faststart "$mp4" >/dev/null 2>&1 \
    && echo "[mp4] $mp4" \
    || { echo "[fail] transcode $webm"; rm -f "$tmp"; continue; }
  rm -f "$tmp" "$webm"
done
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
