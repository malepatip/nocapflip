#!/usr/bin/env node
// One-time OAuth: opens a loopback server, prints the consent URL, catches the
// callback, exchanges the code for a refresh token, and writes it to
// ~/.config/nocapflip-uploader/token.json. Re-run only when the token is revoked.

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { URL, URLSearchParams } = require('url');

const CFG_DIR = path.join(os.homedir(), '.config', 'nocapflip-uploader');
const CRED_FILE = process.env.YT_CLIENT_SECRET || path.join(CFG_DIR, 'client-secret.json');
const TOKEN_FILE = path.join(CFG_DIR, 'token.json');
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

function loadClientSecret() {
  if (!fs.existsSync(CRED_FILE)) {
    console.error(`Missing ${CRED_FILE}.`);
    console.error('Create an OAuth 2.0 Client ID (type: Desktop) in Google Cloud Console');
    console.error('(APIs & Services → Credentials), download the JSON, and save it there.');
    console.error('Or set YT_CLIENT_SECRET=/path/to/client_secret.json.');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
  const section = raw.installed || raw.web;
  if (!section) { console.error('client-secret.json missing "installed" or "web" section'); process.exit(1); }
  return section;
}

async function exchangeCode(code, clientId, clientSecret, redirectUri) {
  // Native fetch (undici) instead of google-auth-library's gaxios/node-fetch,
  // which hits ERR_STREAM_PREMATURE_CLOSE on gzipped responses in Termux.
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept-Encoding': 'identity' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`token endpoint ${res.status}: ${body}`);
  return JSON.parse(body);
}

function startServer(clientId, clientSecret) {
  return new Promise((resolve, reject) => {
    let redirectUri;
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, `http://127.0.0.1`);
        if (!u.searchParams.has('code')) {
          res.writeHead(400); res.end('no code'); return;
        }
        const code = u.searchParams.get('code');
        const tokens = await exchangeCode(code, clientId, clientSecret, redirectUri);
        if (!tokens.refresh_token) {
          res.writeHead(500); res.end('No refresh_token returned. Revoke access at myaccount.google.com and retry.');
          reject(new Error('no refresh_token (likely re-consent needed; revoke and retry)'));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok — you can close this tab');
        server.close();
        resolve(tokens);
      } catch (e) {
        res.writeHead(500); res.end(String(e));
        reject(e);
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      redirectUri = `http://127.0.0.1:${port}/`;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'select_account consent',
      });
      console.log('\nOpen this URL in a browser signed in as the YouTube channel owner:\n');
      console.log(url);
      console.log('\nWATCH FOR a channel picker — if your Google account owns multiple YouTube channels,');
      console.log('Google will ask which channel to grant access to. Pick the right one carefully.');
      console.log(`\nAfter approving, Google will redirect to ${redirectUri} — this process will catch it.\n`);
    });
  });
}

async function verifyChannel(accessToken) {
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
    headers: { Authorization: 'Bearer ' + accessToken, 'Accept-Encoding': 'identity' },
  });
  const data = await res.json();
  if (!data.items || !data.items.length) throw new Error('channels.list returned no items: ' + JSON.stringify(data));
  return data.items.map((ch) => ({
    id: ch.id,
    title: ch.snippet.title,
    handle: ch.snippet.customUrl || null,
    subscribers: ch.statistics.subscriberCount,
    videos: ch.statistics.videoCount,
  }));
}

(async () => {
  const { client_id, client_secret } = loadClientSecret();
  const tokens = await startServer(client_id, client_secret);
  fs.mkdirSync(CFG_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  console.log(`Wrote ${TOKEN_FILE}`);
  const channels = await verifyChannel(tokens.access_token);
  console.log('\n=== Bound YouTube channel(s) ===');
  for (const ch of channels) {
    console.log(`  ${ch.title}  (id=${ch.id}, handle=${ch.handle || '-'}, subs=${ch.subscribers}, videos=${ch.videos})`);
  }
  console.log('\nIf this is not "nocapflip", re-run `node auth.js` and pick the right channel on the picker.');
})().catch((e) => { console.error(e); process.exit(1); });
