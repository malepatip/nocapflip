#!/usr/bin/env node
// Upload nocapflip recordings to YouTube using the sidecar .json produced by the
// recorder. Scans OUT_DIR (default /sdcard/Download) for *.mp4 that have a
// matching *.json but no *.youtube.json, uploads each, and writes
// *.youtube.json ({ video_id, url, uploaded_at }) so re-runs skip them.
//
// Uses native fetch (undici) + YouTube's resumable upload API directly to
// bypass a gaxios/node-fetch gunzip bug on Termux (ERR_STREAM_PREMATURE_CLOSE
// on gzipped responses from googleapis.com).
//
// Flags:
//   --file=/path/to/clip.mp4     upload one file (ignores "already uploaded" marker)
//   --dir=/path/to/dir           override OUT_DIR
//   --privacy=public|unlisted|private   override sidecar privacyStatus
//   --dry-run                    print what would be uploaded, don't call YouTube
//   --limit=N                    stop after N attempts (quota guard — each attempt
//                                costs ~1600 units whether it succeeds or fails)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Readable } = require('stream');

const CFG_DIR = path.join(os.homedir(), '.config', 'nocapflip-uploader');
const CRED_FILE = process.env.YT_CLIENT_SECRET || path.join(CFG_DIR, 'client-secret.json');
const TOKEN_FILE = path.join(CFG_DIR, 'token.json');
const CATEGORY_GAMING = '20';
const NO_GZIP = { 'Accept-Encoding': 'identity' };

function parseArgs(argv) {
  const out = { dir: process.env.OUT_DIR || '/sdcard/Download', dryRun: false, limit: Infinity };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--file=')) out.file = a.slice(7);
    else if (a.startsWith('--dir=')) out.dir = a.slice(6);
    else if (a.startsWith('--privacy=')) out.privacy = a.slice(10);
    else if (a.startsWith('--limit=')) out.limit = parseInt(a.slice(8), 10);
    else if (a === '--long') out.long = true;
    else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  return out;
}

function sidecarsFor(mp4Path) {
  const base = mp4Path.replace(/\.mp4$/, '');
  return { json: `${base}.json`, thumb: `${base}.jpg`, marker: `${base}.youtube.json` };
}

function listPending(dir, opts = {}) {
  if (!fs.existsSync(dir)) { console.error(`dir not found: ${dir}`); process.exit(1); }
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.mp4'))
    .map((f) => path.join(dir, f))
    .filter((p) => {
      const s = sidecarsFor(p);
      if (!fs.existsSync(s.json) || fs.existsSync(s.marker)) return false;
      if (opts.long) {
        const meta = JSON.parse(fs.readFileSync(s.json, 'utf8'));
        return meta.shorts === false;
      }
      return true;
    });
}

async function refreshAccessToken() {
  if (!fs.existsSync(CRED_FILE)) { console.error(`missing ${CRED_FILE} — see uploader/README.md`); process.exit(1); }
  if (!fs.existsSync(TOKEN_FILE)) { console.error(`missing ${TOKEN_FILE} — run \`npm run auth\` first`); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
  const { client_id, client_secret } = raw.installed || raw.web;
  const tok = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...NO_GZIP },
    body: new URLSearchParams({
      client_id, client_secret, refresh_token: tok.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`refresh ${res.status}: ${body}`);
  const data = JSON.parse(body);
  if (!data.access_token) throw new Error('refresh ok but no access_token');
  return data.access_token;
}

async function uploadVideoResumable(accessToken, mp4Path, meta, privacyStatus) {
  const stat = fs.statSync(mp4Path);
  // Step 1: initiate resumable upload — small POST, metadata only.
  const isShort = meta.shorts !== false;
  const title = (!isShort || meta.title.includes('#Shorts') || meta.title.includes('#shorts'))
    ? meta.title.slice(0, 100)
    : (meta.title + ' #Shorts').slice(0, 100);
  const recordingDate = meta.match && meta.match.recordedAt
    ? meta.match.recordedAt
    : (meta.recordedAt || new Date().toISOString());
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status,recordingDetails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': String(stat.size),
      ...NO_GZIP,
    },
    body: JSON.stringify({
      snippet: {
        title,
        description: meta.description,
        tags: meta.tags,
        categoryId: CATEGORY_GAMING,
        defaultLanguage: 'en',
        defaultAudioLanguage: 'en',
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: !!meta.madeForKids,
        embeddable: true,
      },
      recordingDetails: { recordingDate },
    }),
  });
  if (!init.ok) throw new Error(`init ${init.status}: ${await init.text()}`);
  const uploadUrl = init.headers.get('location');
  if (!uploadUrl) throw new Error('init ok but no Location header');

  // Step 2: PUT the file bytes to the upload URL.
  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(stat.size),
      ...NO_GZIP,
    },
    body: Readable.toWeb(fs.createReadStream(mp4Path)),
    duplex: 'half',
  });
  if (!put.ok) throw new Error(`put ${put.status}: ${await put.text()}`);
  return JSON.parse(await put.text());
}

async function setThumbnail(accessToken, videoId, jpgPath) {
  const buf = fs.readFileSync(jpgPath);
  const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'image/jpeg',
      'Content-Length': String(buf.length),
      ...NO_GZIP,
    },
    body: buf,
  });
  if (!res.ok) throw new Error(`thumbnail ${res.status}: ${await res.text()}`);
}

async function uploadOne(accessToken, mp4Path, opts) {
  const s = sidecarsFor(mp4Path);
  const meta = JSON.parse(fs.readFileSync(s.json, 'utf8'));
  const privacyStatus = opts.privacy || meta.privacyStatus || 'unlisted';
  console.log(`[upload] ${path.basename(mp4Path)} · ${privacyStatus} · ${meta.title}`);
  if (opts.dryRun) return { id: 'dry-run' };

  const result = await uploadVideoResumable(accessToken, mp4Path, meta, privacyStatus);
  const videoId = result.id;
  console.log(`  → https://youtu.be/${videoId}`);

  if (fs.existsSync(s.thumb)) {
    try {
      await setThumbnail(accessToken, videoId, s.thumb);
      console.log('  thumbnail set');
    } catch (e) {
      console.warn('  thumbnail failed (channel may need verification):', e.message);
    }
  }

  fs.writeFileSync(s.marker, JSON.stringify({
    video_id: videoId,
    url: `https://youtu.be/${videoId}`,
    uploaded_at: new Date().toISOString(),
    privacyStatus,
  }, null, 2));
  return { id: videoId };
}

(async () => {
  const opts = parseArgs(process.argv);
  const targets = opts.file ? [opts.file] : listPending(opts.dir, opts);
  if (!targets.length) { console.log('nothing to upload'); return; }
  console.log(`${targets.length} file(s) to ${opts.dryRun ? 'process' : 'upload'} from ${opts.file ? 'arg' : opts.dir}`);

  const accessToken = opts.dryRun ? null : await refreshAccessToken();

  let attempts = 0;
  let success = 0;
  for (const t of targets) {
    if (attempts >= opts.limit) { console.log(`hit --limit=${opts.limit}, stopping`); break; }
    attempts += 1;
    try {
      await uploadOne(accessToken, t, opts);
      success += 1;
    } catch (e) {
      const msg = e.message || String(e);
      console.error(`[fail] ${path.basename(t)} — ${msg.slice(0, 400)}`);
      if (/quotaExceeded/i.test(msg) || /quota/i.test(msg)) {
        console.error('API quota exhausted; stopping.');
        break;
      }
      if (/uploadLimitExceeded/i.test(msg) || /exceeded the number of videos/i.test(msg)) {
        console.error('channel upload rate limit hit — verify the channel at youtube.com/verify to raise it. stopping.');
        break;
      }
    }
  }
  console.log(`done · ${success}/${attempts} successful (${targets.length} candidate${targets.length === 1 ? '' : 's'})`);
})().catch((e) => { console.error(e); process.exit(1); });
