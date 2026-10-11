# Uploader

Uploads the recorder's output (`*.mp4` + `*.json` sidecar + `*.jpg` thumbnail) to YouTube and marks each file with a `*.youtube.json` so re-runs skip it.

Lives in a sibling dir to `recorder/` (not inside it) because the recorder needs to install in the Debian proot (playwright-core refuses `android`) and the proot's npm silently drops package files (see `MEMORY.md`). The uploader has no deps — just Node's built-in `fetch` — but runs best from Termux native node for the same networking reason.

## Why no `googleapis` dep?

An early version used `googleapis` + `google-auth-library`. Both route everything through `gaxios`+`node-fetch`, which hits `ERR_STREAM_PREMATURE_CLOSE` on Termux when decoding gzipped responses from `oauth2.googleapis.com` and `youtube.googleapis.com`. Rewrote the OAuth exchange and the resumable upload with native fetch (undici) + `Accept-Encoding: identity` — no decompression, no bug.

## One-time setup

1. **Enable the API + create an OAuth client**
   - Google Cloud Console → `nocapflip-64f0a` project:
     - APIs & Services → Library → enable **YouTube Data API v3**.
     - OAuth consent screen → User type **External**; add `phani.malepati@gmail.com` (lowercase — the form rejects auto-capped first letters) as a test user; add scopes `youtube.upload` and `youtube.readonly`.
     - Credentials → Create Credentials → OAuth Client ID → **Desktop app** (NOT Web application — Desktop lets the loopback redirect flow work without pre-registering ports). Download JSON.
   - Save as `~/.config/nocapflip-uploader/client-secret.json` (or set `YT_CLIENT_SECRET=/path/to/file`).

2. **No install needed** — zero runtime deps. Node 20+ required (uses native `fetch` with streaming body + `duplex: "half"`).

3. **Grant the refresh token (one-time)**
   ```bash
   npm run auth
   ```
   Open the printed URL on any device signed in as the channel owner, approve, Google redirects to `http://127.0.0.1:<port>/` which this process catches. Token is written to `~/.config/nocapflip-uploader/token.json` (mode 0600).

## Upload

```bash
# Scan /sdcard/Download, upload everything with a sidecar that isn't already marked
npm run upload

# One file
node upload.js --file=/sdcard/Download/nocap-2026...-finn-vs-rae-5-3.mp4

# Different dir
node upload.js --dir=/sdcard/nocap-batch

# Dry-run first (prints titles, no API calls)
node upload.js --dry-run

# Override sidecar visibility
node upload.js --privacy=unlisted

# Cap per-run (quota guard — counts ATTEMPTS, not successes; see below)
node upload.js --limit=5
```

Successful upload writes `<base>.youtube.json`:
```json
{"video_id":"abc123","url":"https://youtu.be/abc123","uploaded_at":"...","privacyStatus":"public"}
```

## Notes / landmines

- **Quota**: `videos.insert` costs ~1600 units; default daily quota is 10 000 → **~6 uploads/day**. For more, request a quota increase in Google Cloud Console. The script stops cleanly on `403 quotaExceeded`.
- **Channel verification**: unverified channels can't set custom thumbnails and are capped at 15-minute uploads. The script logs a thumbnail failure but continues.
- **`privacyStatus`**: the recorder's sidecar currently defaults to `"public"` (see `recorder/record.js`). If you want to review before going public, either change that default to `"unlisted"` or pass `--privacy=unlisted` here.
- **Shorts**: nothing to do — YouTube auto-classifies uploads under 60s with a vertical aspect ratio (540x960 ✓) as Shorts.
- **`.youtube.json` marker**: delete it to force a re-upload of a given mp4.
- **Token refresh**: the script exchanges the stored refresh token for a fresh access token on every run; only re-run `npm run auth` if you revoke access or the refresh token expires (90 days for apps in Testing mode — publish the OAuth app to extend).
- **Scopes**: the token must include `youtube.upload` (write) and `youtube.readonly` (needed by `auth.js` to confirm which channel it bound to). Delete/cleanup requires `youtube.force-ssl` — not granted, so cleanup is done in YouTube Studio.
