#!/data/data/com.termux/files/usr/bin/bash
# One command for the phone: record N long-form "Cut the bottle" matches, then upload them to YouTube.
#
#   ./long.sh            # 1 long-form video, uploaded as UNLISTED so you can review it first
#   ./long.sh 3          # 3 videos
#   PRIVACY=public ./long.sh
#   NO_UPLOAD=1 ./long.sh          # record only
#   STAGE= ./long.sh               # classic random stages instead of Cut the bottle
#   GOAL=7 CUT_RATE=0.15 HANG_SIGMA=0.05 ./long.sh
#
# Knobs (all optional):
#   STAGE       default "hang" (Cut the bottle). Empty string = classic random stages.
#   GOAL        first-to-N stacks. Default random 7 or 10 for long form.
#   CUT_RATE    chance per turn that the chainsaw is allowed to win (default 0.1).
#   HANG_SIGMA  aim noise; smaller = more stacks = shorter video (default 0.035).
#   PRIVACY     public | unlisted | private for the upload (default unlisted here).
#   OUT_DIR     where files go (default /sdcard/Download).
#
# Long form must run over 3 minutes, otherwise YouTube treats a vertical video as a Short.
# The recorder prints a warning when a video comes out shorter than that.
set -u
cd "$(dirname "$0")" || exit 1
N="${1:-1}"
OUT_DIR="${OUT_DIR:-/sdcard/Download}"
export OUT_DIR LONG_FORM=1 STAGE="${STAGE-hang}" PRIVACY="${PRIVACY:-unlisted}"

./run-offline.sh "$N"

[ -n "${NO_UPLOAD:-}" ] && { echo "[long] NO_UPLOAD set; recordings are in $OUT_DIR"; exit 0; }
cd ../uploader || { echo "[long] ../uploader not found"; exit 1; }
node upload.js --dir="$OUT_DIR" --privacy="$PRIVACY"
