#!/usr/bin/env node
/* Offline recorder: Playwright + bundled Firefox (patched), no Browserbase, no network cost.
   Produces webm (Firefox's MediaRecorder can't do mp4). A post-step in run.sh transcodes to mp4.
   Env: N (default 1), OUT_DIR (default /sdcard/Download), NOCAP_URL (default https://nocapflip.com). */
const { firefox } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const FIRST_NAMES = ['Ash','Blu','Cal','Dax','Eli','Fox','Gus','Hal','Ivy','Jax',
  'Kai','Lee','Max','Nia','Ori','Pax','Quinn','Rio','Sky','Tye','Uma','Vee','Wren','Xan','Yuki','Zed',
  'Beck','Cruz','Drew','Finn','Grey','Hollis','Indy','Juno','Knox','Lane','Milo','Nico','Ode','Perry','Reese','Sage'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

async function playOne({ url, outDir, longForm }) {
  const browser = await firefox.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 540, height: 960 } });

    await ctx.addInitScript(() => {
      try {
        const prev = JSON.parse(localStorage.getItem('nocap.v1') || '{}');
        prev.rec = true;
        prev.clip = false;
        prev.sound = true;
        prev.clock = false;
        prev.audio = Math.random() < 0.5 ? 'clean' : 'fart';
        prev.active = prev.active || 'tap';
        localStorage.setItem('nocap.v1', JSON.stringify(prev));
      } catch (e) {}
      window.requestAnimationFrame = function (cb) { return setTimeout(() => cb(performance.now()), 16); };
      window.cancelAnimationFrame = clearTimeout;
      window.addEventListener('load', () => {
        setTimeout(() => {
          const noop = () => {};
          window.netRecordStart = noop;
          window.netRecordEnd = noop;
          window.netRecordQuit = noop;
          window.netThrow = noop;
          window.tapeIndex = noop;
          // Firefox's MediaRecorder: webm/opus-vp9 only; let the game pick its default.
        }, 200);
      });
    });

    const page = await ctx.newPage();
    page.on('console', (m) => {
      const t = m.text();
      if (/openMatch|humanThrow|flop|land|cap|REC|M\.|match/i.test(t)) console.log('page>', t);
    });

    console.log('[goto]', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => typeof window.openMatch === 'function' && typeof window.humanThrow === 'function' && typeof window.Matter !== 'undefined' && window.SKINS && window.IDEAL, { timeout: 30000 });

    const names = [pick(FIRST_NAMES), pick(FIRST_NAMES)];
    while (names[1] === names[0]) names[1] = pick(FIRST_NAMES);

    const cfg = await page.evaluate(([names, longForm]) => {
      const venues = ['cafeteria','classroom','restroom','gym','hallway','outside'];
      const stages = ['table','table','table','tray'];
      const skinKeys = Object.keys(window.SKINS);
      const venue = venues[Math.floor(Math.random()*venues.length)];
      const stage = stages[Math.floor(Math.random()*stages.length)];
      const goal  = longForm ? [7, 10][Math.floor(Math.random()*2)] : [2, 3][Math.floor(Math.random()*2)];
      const skinA = skinKeys[Math.floor(Math.random()*skinKeys.length)];
      const skinB = skinKeys[Math.floor(Math.random()*skinKeys.length)];
      window.openMatch({
        mode: 'two', venue, stageId: stage, goal,
        players: [{ id:'p1', name: names[0], skin: skinA }, { id:'p2', name: names[1], skin: skinB }],
      });
      document.getElementById('btnStart').click();
      return { venue, stage, goal, skinA, skinB };
    }, [names, longForm]);
    console.log('[match]', names.join(' vs '), cfg);

    await page.waitForFunction(() => window.M && !window.M.done && (window.inputEnabled || window.M.busy), { timeout: 15000 });

    let throws = 0;
    const matchStart = Date.now();
    const MAX_MATCH_MS = longForm ? 900000 : 300000;
    while (Date.now() - matchStart < MAX_MATCH_MS) {
      const doneState = await page.evaluate(() => ({ done: !window.M || window.M.done === true, pts: (window.M||{}).pts, seq: (window.M||{}).seq }));
      if (doneState.done) { console.log('[loop] M.done pts=', doneState.pts); break; }
      try {
        await page.waitForFunction(() => window.M && !window.M.done && window.inputEnabled && !window.M.busy, { timeout: 20000, polling: 200 });
      } catch (e) {
        console.log('[loop] waitForInput timed out; done=', (await page.evaluate(() => !!(window.M && window.M.done))));
        break;
      }
      const res = await page.evaluate(() => {
        const m = window.M, skin = window.SKINS[m.players[m.turn].skin], ideal = window.IDEAL[m.stageId][skin.type];
        const jitterP = (Math.random()-0.5) * 0.14;
        const jitterA = (Math.random()-0.5) * 10;
        const power = Math.max(0.4, Math.min(1.4, ideal[0] * (1 + jitterP)));
        const angle = Math.max(45, Math.min(130, ideal[1] + jitterA));
        const seqBefore = m.seq;
        window.humanThrow(power, angle);
        return { power, angle, turn: m.turn, pts: m.pts.slice(), seqBefore };
      });
      throws++;
      if (throws % 3 === 0 || throws < 5) console.log(`[throw ${throws}] p${res.turn} power=${res.power.toFixed(2)} angle=${res.angle.toFixed(0)} pts=${res.pts.join('-')}`);
      try {
        await page.waitForFunction((prev) => (window.M && (window.M.done || window.M.seq > prev)), res.seqBefore, { polling: 150, timeout: 20000 });
      } catch (e) {}
      await page.evaluate(() => {
        const venues = ['cafeteria','classroom','restroom','gym','hallway','outside'];
        const cur = window.R && window.R.venue ? window.R.venue : 'cafeteria';
        const next = venues[(venues.indexOf(cur) + 1) % venues.length];
        if (window.R) window.R.venue = next;
      });
    }
    console.log('[match] loop ended, throws=', throws);

    await page.waitForFunction(() => window.M && window.M.done === true, undefined, { timeout: longForm ? 120000 : 15000, polling: 200 });
    await page.waitForFunction(() => window.REC && window.REC.blob && !window.REC.rec, undefined, { timeout: longForm ? 180000 : 30000, polling: 300 });

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

    const [a, b] = names;
    const winnerIdx = (result.pts[0] >= result.goal) ? 0 : (result.pts[1] >= result.goal ? 1 : (result.pts[0] > result.pts[1] ? 0 : 1));
    const winner = names[winnerIdx], loser = names[1-winnerIdx];
    const scoreRaw = result.pts.join('–');
    const scoreW   = `${result.pts[winnerIdx]}–${result.pts[1-winnerIdx]}`;
    const venueName = { cafeteria: 'the cafeteria', classroom: 'the classroom', restroom: 'the restroom', gym: 'the gym', hallway: 'the hallway', outside: 'outside' }[result.venue] || result.venue;
    const stageName = { table: 'the lunch table', tray: 'a lunch tray', books: 'a stack of textbooks', stool: 'a stool' }[result.stage] || result.stage;
    const shortTitles = [
      `${winner} cooks ${loser} ${scoreW} on ${stageName} 🧢`,
      `No Cap bottle flip: ${a} vs ${b} in ${venueName}`,
      `${winner} wins ${scoreW} — flipping on ${stageName} #shorts`,
      `${a} vs ${b}: bottle flip battle (${scoreRaw}) in ${venueName}`,
      `Nice flip! ${winner} takes it ${scoreW} on ${stageName}`,
      `${a} vs ${b} — first to ${result.goal} in ${venueName}`,
      `Bottle flip faceoff: ${scoreRaw} final · ${venueName}`,
      `${winner} is him. ${scoreW} on ${stageName}.`,
    ];
    const longTitles = [
      `${a} vs ${b} — First to ${result.goal} Bottle Flip Battle (${scoreRaw}) in ${venueName}`,
      `${winner} Wins ${scoreW} in an Epic Bottle Flip Match | No Cap Flip`,
      `Full Match: ${a} vs ${b} on ${stageName} — First to ${result.goal} | No Cap Flip`,
      `${winner} Cooks ${loser} First to ${result.goal} | Bottle Flip Battle ${venueName}`,
      `${a} vs ${b}: Complete Bottle Flip Battle — ${scoreRaw} Final`,
    ];
    const titles = longForm ? longTitles : shortTitles;
    const title = titles[Math.floor(Math.random() * titles.length)].slice(0, 100);
    const description = longForm ? [
      `🎮 Play No Cap Flip free in your browser → https://nocapflip.com`,
      ``,
      `Full bottle flip battle: ${a} vs ${b} on ${stageName} in ${venueName}. First to ${result.goal} wins. Final score: ${a} ${result.pts[0]} – ${result.pts[1]} ${b}. ${winner} takes the W.`,
      ``,
      `Subscribe for daily bottle-flip battles 👇`,
      `Which school venue should we add next? Drop it in the comments!`,
      ``,
      `#nocapflip #bottleflip #bottleflipchallenge #gaming #physicsgame #browsergame #schoolgames #indiegame`,
    ].join('\n') : [
      `🎮 Play No Cap Flip free in your browser → https://nocapflip.com`,
      ``,
      `${a} vs ${b} on ${stageName} in ${venueName}. First to ${result.goal}. Final: ${a} ${result.pts[0]} – ${result.pts[1]} ${b}. ${winner} takes the W.`,
      ``,
      `Which school venue should we add next? Drop it in the comments 👇`,
      `Subscribe for daily bottle-flip battles.`,
      ``,
      `#Shorts #nocapflip #bottleflip #bottleflipchallenge #gaming #physicsgame #browsergame #schoolgames #indiegame`,
    ].join('\n');
    const tags = longForm ? [
      'nocapflip', 'bottle flip', 'bottleflip', 'bottle flip challenge',
      result.venue, 'school game', 'browser game', 'physics game',
      'gen z', 'gaming', 'indie game', winner.toLowerCase(), loser.toLowerCase(),
      'no cap', result.audio === 'clean' ? 'wah wah' : 'fart sounds',
    ].slice(0, 15) : [
      'nocapflip', 'bottle flip', 'bottleflip', 'bottle flip challenge', 'shorts',
      result.venue, 'cafeteria flip', 'school game', 'browser game', 'physics game',
      'gen z', 'gaming', 'indie game', winner.toLowerCase(), loser.toLowerCase(),
      'no cap', 'nice', result.audio === 'clean' ? 'wah wah' : 'fart sounds',
    ].slice(0, 15);

    const sidecar = {
      file: path.basename(file),
      title, description, tags,
      category: 'Gaming', privacyStatus: 'public', madeForKids: false, shorts: !longForm,
      match: {
        players: names, winner, winnerIdx,
        pts: result.pts, scoreRaw, scoreW,
        goal: result.goal, venue: result.venue, stage: result.stage,
        audio: result.audio, duration_s: result.duration_s,
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
  const url = process.env.NOCAP_URL || 'https://nocapflip.com';
  const outDir = process.env.OUT_DIR || '/sdcard/Download';
  const n = parseInt(process.env.N || process.argv[2] || '1', 10);
  const longForm = !!process.env.LONG_FORM;
  const concurrency = Math.max(1, Math.min(3, parseInt(process.env.CONCURRENCY || '1', 10)));  // Firefox is heavier; default 1
  let next = 0, saved = 0;
  async function worker(id) {
    while (true) {
      const i = next++; if (i >= n) return;
      console.log(`\n=== game ${i+1} / ${n} [w${id}] ===`);
      try { await playOne({ url, outDir, longForm }); saved++; }
      catch (e) { console.error(`[game ${i+1}] failed:`, e && e.stack || e); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, n) }, (_, k) => worker(k + 1)));
  console.log(`\n[done] saved ${saved} game(s) of ${n} requested (concurrency=${concurrency})`);
})();
