# Recorder

Headless-records 2-player nocapflip matches and writes a YouTube-ready package to a chosen directory. Two modes:

- **Online** (`record.js` / `run.sh`): Browserbase hosts the Chromium browser remotely. Needs `BROWSERBASE_API_KEY`, counts against your Browserbase browser-minutes quota. Writes mp4 directly.
- **Offline** (`record-offline.js` / `run-offline.sh`): Playwright's bundled Firefox runs locally in a Debian proot — no network cost, no quota. Writes webm; `run-offline.sh` transcodes to mp4 after.

## What each run produces, per match

- `nocap-<timestamp>-<p1>-vs-<p2>-<pts>.mp4` — the match video.
- `nocap-<timestamp>-...json` — sidecar with `title`, `description`, `tags`, plus raw `match` info (players, winner, score, venue, stage, audio mode, duration).
- `nocap-<timestamp>-...jpg` — a thumbnail grabbed from near the end-slate.

Each match randomizes names, venue, skins, and audio mode. The backdrop (`R.venue`) cycles through all six venues as the match progresses.

## Prereqs

- Node 20+ on a Linux-reporting platform (`process.platform === 'linux'`). On Termux you must run inside a Debian/Ubuntu proot — `playwright-core` hard-rejects `process.platform === 'android'`.
- `npm install` in this directory.
- For offline mode: `npm run setup-firefox` (one-time, ~100 MB).
- For online mode: `BROWSERBASE_API_KEY` in env.
- `ffmpeg` on the host that runs the `run*.sh` wrappers (used for thumbnails + webm→mp4 transcode).

## Run

Online (Browserbase):

```bash
BROWSERBASE_API_KEY=bb_live_... node record.js 15
# or on Phani's Termux + Debian-proot setup:
./run.sh 15
```

Offline (Firefox):

```bash
node record-offline.js 15
# or:
./run-offline.sh 15
```

Both wrappers also run `ffmpeg` after the recording loop to generate `.jpg` thumbnails for every mp4 that doesn't have one; `run-offline.sh` additionally transcodes each `.webm` → `.mp4` (H.264/AAC) and removes the webm.

## Notes / known landmines

- `bb.sessions.create({ api_timeout: 900 })` — the SDK field is `api_timeout`, **not** `timeout`. Passing `timeout` silently uses the 60s default and your session dies mid-match.
- `page.waitForFunction(fn, arg, options)` — options is the **third** positional. Passing `{timeout: ...}` as the second arg makes it the function's `arg` and the real options default (30s).
- Headless chromium / firefox throttle `requestAnimationFrame` for backgrounded tabs; both recorders override it to a `setTimeout(16ms)` shim so physics ticks consistently.
- `S.rec = true` must be set in localStorage **and** the Firestore writers (`netRecordStart`, `netRecordEnd`, `netRecordQuit`, `netThrow`, `tapeIndex`) must be stubbed to no-ops after `window.load`. Otherwise every automated run creates a tape shelf entry on nocapflip.com.
- Mp4 output in online mode uses `avc1.42E01E,mp4a.40.2` — supported in Chromium ≥ 126 via a runtime override of `window.recMime`. Firefox's MediaRecorder only emits webm, so offline mode records webm and transcodes afterward.
- Hitting the Browserbase quota throws a `402` error; the main loop catches it and stops cleanly instead of spamming failed sessions.
- Online mode supports `CONCURRENCY=1..3` (default 3) to run up to 3 games in parallel. Offline mode defaults to `CONCURRENCY=1` because launching several real Firefox instances is heavy on-device.
- System Chromium headless in a Termux proot dies (Android blocks loopback TCP and `--remote-debugging-pipe` SIGTRAPs the child). Playwright's bundled Firefox binary works fine — that's why the offline mode uses Firefox, not Chromium.
