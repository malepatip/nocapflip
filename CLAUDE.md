# No Cap (nocapflip.com): project notes for Claude Code

Browser water-bottle-flip game for US Gen Z/Alpha, modeled on penfight.xyz. The owner (Phani) monetizes by recording games for YouTube, so recording and clips matter. Theme: school lunch table, US teen school settings (cafeteria, gym, hallway, bathroom, classroom, caged round wall clock). Keep props close to real US school settings. Real recorded fart sounds play on flops.

## Stack and layout (static site, no build step)
- `index.html`: CSS, markup, script tags (order matters): matter-js, firebase app+firestore compat, `firebase-config.js`, `js/farts.js`, `physics.js`, `data.js`, `render.js`, `match.js`, `net.js`
- `js/physics.js`: NC namespace, Matter.js bottle sim (table [40,500], TABLE_Y=700, FLOOR_Y=930, LAUNCH_X=150)
- `js/data.js`: ideal-throw table, skins, nine-kid ladder (KIDS have a `venue`), audio/fart code
- `js/render.js`: venues, caged clock, drawing, REC badge and recording, input
- `js/match.js`: match flow, HUD, endMatch
- `js/net.js`: play by link (Firestore), heartbeat, wake lock, Share/copy, tapes
- `js/farts.js`: 10 mp3 fart recordings as base64 (fartscroll.js by The Onion, MIT)
- `firebase-config.js`: public web config (project `nocapflip-64f0a`); `firestore.rules`: DB rules
- Canvas 540x960, DPR fixed at 2. Matter.js 0.20.0 from cdnjs with jsDelivr fallback.

## Firestore model
`rooms/{CODE}` (code, host, created, status lobby|playing|done|closed, mode, stage, venue, goal, record, players[], pts[], turn, seq, winner, next, hb, last, started, ended); `rooms/{CODE}/throws/tNNNN`; `tapes/{CODE}`.

## Deploy
GitHub `malepatip/nocapflip` -> Cloudflare Workers Builds (static assets). `wrangler.jsonc` = {name "nocapflip", compatibility_date, assets.directory "./"}; build command empty; deploy command `npx wrangler deploy`. `.assetsignore` must list: wrangler.jsonc, .assetsignore, README.md, CLAUDE.md, firestore.rules, .git, node_modules. Push to `main` goes live in about a minute. Domain: nocapflip.com (Cloudflare).

## Hard-won lessons (do not regress)
- Never close a table on `pagehide` (fires when switching apps on phones). Host closes the table only on an explicit Leave, or if `playing` and silent for over 120 s (heartbeat `hb`).
- Host identity is stored in localStorage `S.pid`, so the host must reopen in the same browser; there is a Rejoin path.
- Clipboard API needs fallbacks; use `navigator.share` for the Share button; tap-to-copy link box that wraps; use Screen Wake Lock.
- Recording: canvas.captureStream(30) plus AudioContext MediaStreamDestination into MediaRecorder; download via `<a download>`.
- When the admin/host leaves, the game quits (owner's standing wish).
- Player names and room fields come from Firestore and are attacker-controlled: never put them into innerHTML unescaped (use `esc()` from data.js, or textContent).
- Room read-modify-writes (join, leave, scoring a throw) go through `roomTxn()` (Firestore transaction), never get-then-update.
- The last video stays in `REC.blob` until the next recording finishes; `recStart` must not discard it. End-screen buttons ask before moving on with an unsaved video.
- `firestore.rules` deploys via `firebase deploy --only firestore:rules` (project `nocapflip-64f0a`); the Cloudflare push does not touch it (and `.assetsignore` keeps it out of the bundle).
- Firestore writes need an authenticated Firebase user: `net.js` calls `firebase.auth().signInAnonymously()` on load; rooms carry a `playerIds` array mirroring `players[].id` so rules can check `request.auth.uid in playerIds` or `== host`.
- The browser API key is locked in Google Cloud to referrers `https://nocapflip.com/*` and `https://www.nocapflip.com/*`, and to four APIs (`firestore`, `identitytoolkit`, `securetoken`, `firebaseinstallations`); adding Analytics, FCM, Storage, Hosting, etc. will need the service added to that allowlist.
- Do not put JS lines mentioning "firebase-config.js" into index.html by scripted filtering (it once leaked raw code onto the page).

## Open items
- Ideas offered: 1200x630 social preview image; more venues (bus, science lab, locker room, main office); per-turn shot clock.
