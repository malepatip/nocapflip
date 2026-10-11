# Uploader

Uploads the recorder's output (`*.mp4` + `*.json` sidecar + `*.jpg` thumbnail) to YouTube and marks each file with a `*.youtube.json` so re-runs skip it.

Lives in a sibling dir to `recorder/` (not inside it) because it must install via **Termux's native npm**, not the Debian proot's — the proot drops package files silently (see `MEMORY.md`). The recorder itself still runs in the proot (playwright-core refuses `android`).

## One-time setup

1. **Enable the API + create an OAuth client**
   - In Google Cloud Console → the `nocapflip-64f0a` project (or a new one):
     - APIs & Services → Library → enable **YouTube Data API v3**.
     - APIs & Services → OAuth consent screen → External, add Phani's Google account as a test user, add scope `youtube.upload`.
     - APIs & Services → Credentials → Create Credentials → OAuth Client ID → **Desktop app**. Download the JSON.
   - Save it as `~/.config/nocapflip-uploader/client-secret.json` (or set `YT_CLIENT_SECRET=/path/to/file`).

2. **Install deps (from Termux, not inside the proot)**
   ```bash
   cd /data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs/root/nocapflip/uploader
   npm install
   ```

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

# Cap per-run (quota guard — see below)
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
- **Token refresh**: `googleapis` refreshes the access token from the stored refresh token automatically; only re-run `npm run auth` if you revoke access or the refresh token expires (90 days for apps in Testing mode — publish the OAuth app to extend).
