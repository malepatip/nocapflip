#!/usr/bin/env node
/* Headless-record N nocapflip 2-player matches via Browserbase, saves webm to /sdcard/Download/.
   Env: BROWSERBASE_API_KEY. Optional: NOCAP_URL (default https://nocapflip.com), N (default 1), OUT_DIR (default /sdcard/Download). */
const BBMod = require('@browserbasehq/sdk');
const Browserbase = BBMod.default || BBMod.Browserbase || BBMod;
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const FIRST_NAMES = ['Ash','Blu','Cal','Dax','Eli','Fox','Gus','Hal','Ivy','Jax',
  'Kai','Lee','Max','Nia','Ori','Pax','Quinn','Rio','Sky','Tye','Uma','Vee','Wren','Xan','Yuki','Zed',
  'Beck','Cruz','Drew','Finn','Grey','Hollis','Indy','Juno','Knox','Lane','Milo','Nico','Ode','Perry','Reese','Sage'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

async function playOne({ apiKey, url, outDir }) {
  const bb = new Browserbase({ apiKey });
  // 15 minutes per session — field is api_timeout, not timeout
  const session = await bb.sessions.create({
    api_timeout: 900,
    browserSettings: { viewport: { width: 540, height: 960 } },
  });
  console.log('[session]', session.id, 'expiresAt=', session.expiresAt);
  const browser = await chromium.connectOverCDP(session.connectUrl);
  try {
    const ctx = browser.contexts()[0] || await browser.newContext();
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.setViewportSize({ width: 540, height: 960 });
    // Headless chromium throttles rAF when the tab isn't "focused"; keep it hot.
    try { await page.bringToFront(); } catch (e) {}
    const cdp = await ctx.newCDPSession(page);
    try { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) {}
    try { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); } catch (e) {}
    try { await cdp.send('Page.setWebLifecycleState', { state: 'active' }); } catch (e) {}

    // S.rec=true so canvas MediaRecorder runs; stub out the Firestore writes so we don't pollute the tape shelf.
    await ctx.addInitScript(() => {
      try {
        const prev = JSON.parse(localStorage.getItem('nocap.v1') || '{}');
        prev.rec = true;        // enable canvas recording
        prev.clip = false;
        prev.sound = true;
        prev.clock = false;
        prev.audio = Math.random() < 0.5 ? 'clean' : 'fart';
        prev.active = prev.active || 'tap';
        localStorage.setItem('nocap.v1', JSON.stringify(prev));
      } catch (e) {}
      // headless chromium throttles rAF for backgrounded tabs; force a 60fps timer-driven loop
      window.requestAnimationFrame = function (cb) { return setTimeout(() => cb(performance.now()), 16); };
      window.cancelAnimationFrame = clearTimeout;
      // after the game loads, stub out the Firestore writers so no tape shelf entry is created,
      // and force mp4 output from MediaRecorder (chromium supports it since v126)
      window.addEventListener('load', () => {
        setTimeout(() => {
          const noop = () => {};
          window.netRecordStart = noop;
          window.netRecordEnd = noop;
          window.netRecordQuit = noop;
          window.netThrow = noop;
          window.tapeIndex = noop;
          window.recMime = function () {
            const prefer = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
            for (let i = 0; i < prefer.length; i++) { try { if (window.MediaRecorder.isTypeSupported(prefer[i])) return prefer[i]; } catch (e) {} }
            return '';
          };
        }, 200);
      });
    });

    page.on('console', (m) => {
      const t = m.text();
      if (/openMatch|humanThrow|flop|land|cap|REC|M\.|match/i.test(t)) console.log('page>', t);
    });

    console.log('[goto]', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof window.openMatch === 'function' && typeof window.humanThrow === 'function' && typeof window.Matter !== 'undefined' && window.SKINS && window.IDEAL, { timeout: 30000 });

    const names = [pick(FIRST_NAMES), pick(FIRST_NAMES)];
    while (names[1] === names[0]) names[1] = pick(FIRST_NAMES);

    const cfg = await page.evaluate((names) => {
      const venues = ['cafeteria','classroom','restroom','gym','hallway','outside'];
      // bias to easier stages so the match finishes within our time budget
      const stages = ['table','table','table','tray'];
      const skinKeys = Object.keys(window.SKINS);
      const venue = venues[Math.floor(Math.random()*venues.length)];
      const stage = stages[Math.floor(Math.random()*stages.length)];
      const goal  = [2, 3][Math.floor(Math.random()*2)];  // 2 or 3, never 5
      const skinA = skinKeys[Math.floor(Math.random()*skinKeys.length)];
      const skinB = skinKeys[Math.floor(Math.random()*skinKeys.length)];
      window.openMatch({
        mode: 'two', venue, stageId: stage, goal,
        players: [{ id:'p1', name: names[0], skin: skinA }, { id:'p2', name: names[1], skin: skinB }],
      });
      document.getElementById('btnStart').click();
      return { venue, stage, goal, skinA, skinB };
    }, names);
    console.log('[match]', names.join(' vs '), cfg);

    // intro slate runs for ~1.5s then beginTurn fires; wait for the first turn's inputEnabled or busy
    await page.waitForFunction(() => window.M && !window.M.done && (window.inputEnabled || window.M.busy), { timeout: 15000 });

    // throw loop: wait for input, throw, wait for seq to increment (next turn ready).
    let throws = 0;
    const matchStart = Date.now();
    const MAX_MATCH_MS = 300000;  // 5 min cap
    while (Date.now() - matchStart < MAX_MATCH_MS) {
      const doneState = await page.evaluate(() => ({ done: !window.M || window.M.done === true, pts: (window.M||{}).pts, seq: (window.M||{}).seq }));
      if (doneState.done) { console.log('[loop] M.done pts=', doneState.pts, 'seq=', doneState.seq); break; }
      // wait up to 20s for inputEnabled on our turn
      try {
        await page.waitForFunction(() => window.M && !window.M.done && window.inputEnabled && !window.M.busy, { timeout: 20000, polling: 200 });
      } catch (e) {
        console.log('[loop] waitForInput timed out; done=', (await page.evaluate(() => !!(window.M && window.M.done))));
        break;
      }
      const res = await page.evaluate(() => {
        const m = window.M, skin = window.SKINS[m.players[m.turn].skin], ideal = window.IDEAL[m.stageId][skin.type];
        // tighter jitter → higher land rate, shorter match
        const jitterP = (Math.random()-0.5) * 0.14;  // ±7%
        const jitterA = (Math.random()-0.5) * 10;    // ±5 deg
        const power = Math.max(0.4, Math.min(1.4, ideal[0] * (1 + jitterP)));
        const angle = Math.max(45, Math.min(130, ideal[1] + jitterA));
        const seqBefore = m.seq;
        window.humanThrow(power, angle);
        return { power, angle, turn: m.turn, pts: m.pts.slice(), seqBefore };
      });
      throws++;
      if (throws % 3 === 0 || throws < 5) console.log(`[throw ${throws}] p${res.turn} power=${res.power.toFixed(2)} angle=${res.angle.toFixed(0)} pts=${res.pts.join('-')}`);
      // wait for seq to advance (= throw settled) or match done, up to 20s. Playwright: waitForFunction(fn, arg, options).
      try {
        await page.waitForFunction((prev) => (window.M && (window.M.done || window.M.seq > prev)), res.seqBefore, { polling: 150, timeout: 20000 });
      } catch (e) {
        console.log('[loop] throw did not settle in 20s');
      }
      // cycle the backdrop (R.venue in render.js) to the next venue after each throw settles,
      // so the clip has multiple backgrounds. Physics stage stays the same.
      await page.evaluate(() => {
        const venues = ['cafeteria','classroom','restroom','gym','hallway','outside'];
        const cur = window.R && window.R.venue ? window.R.venue : 'cafeteria';
        const next = venues[(venues.indexOf(cur) + 1) % venues.length];
        if (window.R) window.R.venue = next;
      });
    }
    console.log('[match] loop ended, throws=', throws);

    await page.waitForFunction(() => window.M && window.M.done === true, undefined, { timeout: 15000, polling: 200 });
    // recStop fires 2.7s after endMatch, then MediaRecorder's onstop sets REC.blob. Allow generous time.
    await page.waitForFunction(() => window.REC && window.REC.blob && !window.REC.rec, undefined, { timeout: 30000, polling: 300 });

    // pull blob as base64 through CDP, chunk-safe
    const result = await page.evaluate(async () => {
      const b = window.REC.blob;
      const buf = await b.arrayBuffer();
      const u = new Uint8Array(buf);
      let s = ''; const CH = 0x8000;
      for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
      return {
        mime: b.type, size: b.size, b64: btoa(s),
        pts: (window.M.pts||[]).slice(), players: (window.M.players||[]).map(p=>p.name),
        venue: (window.M||{}).venue, stage: (window.M||{}).stageId, goal: (window.M||{}).goal,
        audio: (window.S||{}).audio, duration_s: (window.REC||{}).secs || null,
      };
    });

    const ext = /webm/.test(result.mime) ? 'webm' : /mp4/.test(result.mime) ? 'mp4' : 'webm';
    const base = `nocap-${stamp()}-${names[0]}-vs-${names[1]}-${result.pts.join('-')}`;
    const file = path.join(outDir, base + '.' + ext);
    const jsonFile = path.join(outDir, base + '.json');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(file, Buffer.from(result.b64, 'base64'));

    // YouTube-ready sidecar: title, description, tags, raw match info for later tooling
    const [a, b] = names;
    const winnerIdx = (result.pts[0] >= result.goal) ? 0 : (result.pts[1] >= result.goal ? 1 : (result.pts[0] > result.pts[1] ? 0 : 1));
    const winner = names[winnerIdx], loser = names[1-winnerIdx];
    const scoreRaw = result.pts.join('–');                       // player-order score: pts[0]–pts[1] (good for A-vs-B lines)
    const scoreW   = `${result.pts[winnerIdx]}–${result.pts[1-winnerIdx]}`;  // winner-first score (good for winner-focused lines)
    const venueName = { cafeteria: 'the cafeteria', classroom: 'the classroom', restroom: 'the restroom', gym: 'the gym', hallway: 'the hallway', outside: 'outside' }[result.venue] || result.venue;
    const stageName = { table: 'the lunch table', tray: 'a lunch tray', books: 'a stack of textbooks', stool: 'a stool' }[result.stage] || result.stage;
    const titles = [
      `${winner} cooks ${loser} ${scoreW} on ${stageName} 🧢`,
      `No Cap bottle flip: ${a} vs ${b} in ${venueName}`,
      `${winner} wins ${scoreW} — flipping on ${stageName} #shorts`,
      `${a} vs ${b}: bottle flip battle (${scoreRaw}) in ${venueName}`,
      `Nice flip! ${winner} takes it ${scoreW} on ${stageName}`,
      `${a} vs ${b} — first to ${result.goal} in ${venueName}`,
      `Bottle flip faceoff: ${scoreRaw} final · ${venueName}`,
      `${winner} is him. ${scoreW} on ${stageName}.`,
    ];
    const title = titles[Math.floor(Math.random() * titles.length)].slice(0, 100);
    const description = [
      `${a} vs ${b} — a water-bottle-flip game at nocapflip.com.`,
      `Venue: ${venueName}. Surface: ${stageName}. First to ${result.goal} wins. Final score: ${a} ${result.pts[0]}, ${b} ${result.pts[1]}. ${winner} wins.`,
      ``,
      `🎮 Play yourself: https://nocapflip.com`,
      ``,
      `#nocapflip #bottleflip #shorts #gaming #physics #browsergame #indiegame #bottleflipchallenge #schoolgames`,
    ].join('\n');
    const tags = [
      'nocapflip', 'bottle flip', 'bottleflip', 'bottle flip challenge', 'shorts',
      result.venue, 'cafeteria flip', 'school game', 'browser game', 'physics game',
      'gen z', 'gaming', 'indie game', winner.toLowerCase(), loser.toLowerCase(),
      'no cap', 'nice', result.audio === 'clean' ? 'wah wah' : 'fart sounds',
    ].slice(0, 15);

    const sidecar = {
      file: path.basename(file),
      title, description, tags,
      category: 'Gaming',
      privacyStatus: 'public',
      madeForKids: false,
      shorts: true,
      match: {
        players: names,
        winner, winnerIdx,
        pts: result.pts, score,
        goal: result.goal, venue: result.venue, stage: result.stage,
        audio: result.audio, duration_s: result.duration_s,
        scoreRaw, scoreW,
        recordedAt: new Date().toISOString(),
      },
    };
    fs.writeFileSync(jsonFile, JSON.stringify(sidecar, null, 2));
    console.log('[saved]', file, result.size, 'bytes · winner', winner, '· title:', title);
    return file;
  } finally {
    try { await browser.close(); } catch (e) {}
  }
}

(async () => {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  if (!apiKey) { console.error('missing BROWSERBASE_API_KEY'); process.exit(1); }
  const url = process.env.NOCAP_URL || 'https://nocapflip.com';
  const outDir = process.env.OUT_DIR || '/sdcard/Download';
  const n = parseInt(process.env.N || process.argv[2] || '1', 10);
  let saved = 0;
  for (let i = 0; i < n; i++) {
    console.log(`\n=== game ${i+1} / ${n} ===`);
    try { await playOne({ apiKey, url, outDir }); saved++; }
    catch (e) {
      const msg = (e && (e.message || String(e))) || '';
      const quota = (e && e.status === 402) || /402|limit reached|browser minutes/i.test(msg);
      if (quota) {
        console.error(`[stop] Browserbase quota exceeded after ${saved} game(s). Remaining ${n - i} skipped. Upgrade at https://browserbase.com/plans`);
        break;
      }
      console.error('[game] failed:', e && e.stack || e);
    }
  }
  console.log(`\n[done] saved ${saved} game(s) of ${n} requested`);
})();
