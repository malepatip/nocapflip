#!/usr/bin/env node
// Upload nocapflip recordings to YouTube using the sidecar .json produced by the
// recorder. Scans OUT_DIR (default /sdcard/Download) for *.mp4 that have a
// matching *.json but no *.youtube.json, uploads each, and writes
// *.youtube.json ({ video_id, url, uploaded_at }) so re-runs skip them.
//
// Flags:
//   --file=/path/to/clip.mp4     upload one file (ignores "already uploaded" marker)
//   --dir=/path/to/dir           override OUT_DIR
//   --privacy=public|unlisted|private   override sidecar privacyStatus
//   --dry-run                    print what would be uploaded, don't call YouTube
//   --limit=N                    stop after N successful uploads (quota guard)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { google } = require('googleapis');

const CFG_DIR = path.join(os.homedir(), '.config', 'nocapflip-uploader');
const CRED_FILE = process.env.YT_CLIENT_SECRET || path.join(CFG_DIR, 'client-secret.json');
const TOKEN_FILE = path.join(CFG_DIR, 'token.json');
const CATEGORY_GAMING = '20';

function parseArgs(argv) {
  const out = { dir: process.env.OUT_DIR || '/sdcard/Download', dryRun: false, limit: Infinity };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--file=')) out.file = a.slice(7);
    else if (a.startsWith('--dir=')) out.dir = a.slice(6);
    else if (a.startsWith('--privacy=')) out.privacy = a.slice(10);
    else if (a.startsWith('--limit=')) out.limit = parseInt(a.slice(8), 10);
    else { console.error(`unknown arg: ${a}`); process.exit(2); }
  }
  return out;
}

function loadAuth() {
  if (!fs.existsSync(CRED_FILE)) { console.error(`missing ${CRED_FILE} — see uploader/README.md`); process.exit(1); }
  if (!fs.existsSync(TOKEN_FILE)) { console.error(`missing ${TOKEN_FILE} — run \`npm run auth\` first`); process.exit(1); }
  const { client_id, client_secret } = (JSON.parse(fs.readFileSync(CRED_FILE, 'utf8')).installed || JSON.parse(fs.readFileSync(CRED_FILE, 'utf8')).web);
  const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  const oAuth2 = new google.auth.OAuth2(client_id, client_secret);
  oAuth2.setCredentials(tokens);
  return oAuth2;
}

function sidecarsFor(mp4Path) {
  const base = mp4Path.replace(/\.mp4$/, '');
  return { json: `${base}.json`, thumb: `${base}.jpg`, marker: `${base}.youtube.json` };
}

function listPending(dir) {
  if (!fs.existsSync(dir)) { console.error(`dir not found: ${dir}`); process.exit(1); }
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.mp4'))
    .map((f) => path.join(dir, f))
    .filter((p) => {
      const s = sidecarsFor(p);
      return fs.existsSync(s.json) && !fs.existsSync(s.marker);
    });
}

async function uploadOne(youtube, mp4Path, opts) {
  const s = sidecarsFor(mp4Path);
  const meta = JSON.parse(fs.readFileSync(s.json, 'utf8'));
  const privacyStatus = opts.privacy || meta.privacyStatus || 'unlisted';
  const resource = {
    snippet: {
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      categoryId: CATEGORY_GAMING,
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: !!meta.madeForKids,
      embeddable: true,
    },
  };

  console.log(`[upload] ${path.basename(mp4Path)} · ${privacyStatus} · ${meta.title}`);
  if (opts.dryRun) return { id: 'dry-run' };

  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: resource,
    media: { body: fs.createReadStream(mp4Path) },
  });
  const videoId = res.data.id;
  console.log(`  → https://youtu.be/${videoId}`);

  if (fs.existsSync(s.thumb)) {
    try {
      await youtube.thumbnails.set({ videoId, media: { body: fs.createReadStream(s.thumb) } });
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
  const auth = loadAuth();
  const youtube = google.youtube({ version: 'v3', auth });

  const targets = opts.file ? [opts.file] : listPending(opts.dir);
  if (!targets.length) { console.log('nothing to upload'); return; }
  console.log(`${targets.length} file(s) to upload from ${opts.file ? 'arg' : opts.dir}`);

  let done = 0;
  for (const t of targets) {
    if (done >= opts.limit) { console.log(`hit --limit=${opts.limit}, stopping`); break; }
    try {
      await uploadOne(youtube, t, opts);
      done += 1;
    } catch (e) {
      const code = e.code || e.response?.status;
      console.error(`[fail] ${path.basename(t)} — ${code || ''} ${e.message}`);
      if (code === 403 && /quota/i.test(e.message)) {
        console.error('quota exhausted; stopping. (default daily quota is 10k units, ~6 uploads)');
        break;
      }
    }
  }
  console.log(`done · ${done}/${targets.length} uploaded`);
})().catch((e) => { console.error(e); process.exit(1); });
