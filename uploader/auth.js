#!/usr/bin/env node
// One-time OAuth: opens a loopback server, prints the consent URL, catches the
// callback, exchanges the code for a refresh token, and writes it to
// ~/.config/nocapflip-uploader/token.json. Re-run only when the token is revoked.

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

const CFG_DIR = path.join(os.homedir(), '.config', 'nocapflip-uploader');
const CRED_FILE = process.env.YT_CLIENT_SECRET || path.join(CFG_DIR, 'client-secret.json');
const TOKEN_FILE = path.join(CFG_DIR, 'token.json');
const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];

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

function startServer(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, `http://127.0.0.1`);
        if (!u.searchParams.has('code')) {
          res.writeHead(400); res.end('no code'); return;
        }
        const code = u.searchParams.get('code');
        const { tokens } = await oAuth2Client.getToken(code);
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
      const redirectUri = `http://127.0.0.1:${port}/`;
      oAuth2Client.redirectUri = redirectUri;
      const url = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
      });
      console.log('\nOpen this URL in a browser signed in as the YouTube channel owner:\n');
      console.log(url);
      console.log(`\nAfter approving, Google will redirect to ${redirectUri} — this process will catch it.\n`);
    });
  });
}

(async () => {
  const { client_id, client_secret } = loadClientSecret();
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret);
  const tokens = await startServer(oAuth2Client);
  fs.mkdirSync(CFG_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  console.log(`Wrote ${TOKEN_FILE}`);
})().catch((e) => { console.error(e); process.exit(1); });
