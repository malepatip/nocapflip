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
const STAGE_ENV = process.env.STAGE || '';                        // e.g. STAGE=hang for "Cut the bottle"; empty = random classic stage
const GOAL_ENV = parseInt(process.env.GOAL || '0', 10) || 0;      // override first-to-N
const CUT_RATE = Math.min(1, Math.max(0, parseFloat(process.env.CUT_RATE || '0.1')));   // hang: chance a turn stalls until the chainsaw cuts the rope
const HANG_SIGMA = parseFloat(process.env.HANG_SIGMA || '0.035'); // hang: aim noise (smaller = stacks more often)
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
        prev.seenCut = true; // skip the first-time "free flip" so the chainsaw is live on the hang stage
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
          // count throw outcomes (land/cap/stack/cut/wrong/flop) for the sidecar and the description
          window.__stats = {};
          const orig = window.onOutcome;
          if (typeof orig === 'function') window.onOutcome = function (o) { window.__stats[o] = (window.__stats[o] || 0) + 1; return orig.apply(this, arguments); };
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

    const cfg = await page.evaluate(([names, longForm, stageEnv, goalEnv]) => {
      const venues = ['cafeteria','classroom','restroom','gym','hallway','outside'];
      const stages = ['table','table','table','tray'];
      const skinKeys = Object.keys(window.SKINS);
      const venue = venues[Math.floor(Math.random()*venues.length)];
      const stage = stageEnv && window.IDEAL[stageEnv] ? stageEnv : stages[Math.floor(Math.random()*stages.length)];
      // hang ("Cut the bottle") stacks are rare, so its goals are smaller: ~4-6 min long form, ~1.5 min short
      const goal  = goalEnv > 0 ? goalEnv : stage === 'hang' ? (longForm ? [7, 10][Math.floor(Math.random()*2)] : 2) : longForm ? [7, 10][Math.floor(Math.random()*2)] : [2, 3][Math.floor(Math.random()*2)];
      const skinA = skinKeys[Math.floor(Math.random()*skinKeys.length)];
      const skinB = skinKeys[Math.floor(Math.random()*skinKeys.length)];
      window.openMatch({
        mode: 'two', venue, stageId: stage, goal,
        players: [{ id:'p1', name: names[0], skin: skinA }, { id:'p2', name: names[1], skin: skinB }],
      });
      document.getElementById('btnStart').click();
      return { venue, stage, goal, skinA, skinB };
    }, [names, longForm, STAGE_ENV, GOAL_ENV]);
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
      /* hang stage drama: now and then let the chainsaw win. The bot just waits for the countdown to run out. */
      if (cfg.stage === 'hang' && Math.random() < CUT_RATE) {
        const seq0 = await page.evaluate(() => window.M.seq);
        console.log('[cut] letting the chainsaw have this turn');
        try { await page.waitForFunction((prev) => window.M && (window.M.done || window.M.seq > prev), seq0, { polling: 200, timeout: 30000 }); } catch (e) { console.log('[cut] timer did not fire in 30s'); }
        throws++;
        continue;
      }
      const res = await page.evaluate(([hangSigma]) => {
        const m = window.M, skin = window.SKINS[m.players[m.turn].skin], ideal = window.IDEAL[m.stageId][skin.type];
        let power, angle;
        if (m.stageId === 'hang') {
          /* the target is a narrow sweet spot, so use gaussian noise around the ideal throw (player 1 a bit looser, player 2 a bit tighter) */
          const sigma = hangSigma * (m.turn === 0 ? 1.15 : 0.85);
          const g1 = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
          const g2 = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
          power = Math.max(0.3, Math.min(1.4, ideal[0] * (1 + g1 * sigma)));
          angle = Math.max(50, Math.min(100, ideal[1] + g2 * sigma * 60));
        } else {
          const jitterP = (Math.random()-0.5) * 0.14;
          const jitterA = (Math.random()-0.5) * 10;
          power = Math.max(0.4, Math.min(1.4, ideal[0] * (1 + jitterP)));
          angle = Math.max(45, Math.min(130, ideal[1] + jitterA));
        }
        const seqBefore = m.seq;
        window.humanThrow(power, angle);
        return { power, angle, turn: m.turn, pts: m.pts.slice(), seqBefore };
      }, [HANG_SIGMA]);
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

    // Fetch metadata and blob size first (small payload)
    const result = await page.evaluate(() => ({
      mime: (window.REC.blob||{}).type || '',
      size: (window.REC.blob||{}).size || 0,
      pts: (window.M.pts||[]).slice(), players: (window.M.players||[]).map(p=>p.name),
      venue: (window.M||{}).venue, stage: (window.M||{}).stageId, goal: (window.M||{}).goal,
      audio: (window.S||{}).audio, duration_s: (window.REC||{}).secs || null,
      stats: window.__stats || {},
    }));
    if (!result || !result.size) throw new Error('REC.blob missing or empty after match');
    if (longForm && result.duration_s && result.duration_s < 180) console.warn(`[warn] long-form video is only ${result.duration_s}s: vertical videos under 3 min are classified as Shorts by YouTube. Raise GOAL or lower HANG_SIGMA/raise it to lengthen.`);
    console.log('[stats]', JSON.stringify(result.stats), 'duration', result.duration_s + 's');

    // Transfer blob in 8 MB chunks to avoid CDP message size limits on large recordings
    const CHUNK = 8 * 1024 * 1024;
    const b64Chunks = [];
    for (let offset = 0; offset < result.size; offset += CHUNK) {
      const b64 = await page.evaluate(async ([off, len]) => {
        const slice = window.REC.blob.slice(off, off + len);
        const buf = await slice.arrayBuffer();
        const u = new Uint8Array(buf);
        let s = ''; const CH = 0x8000;
        for (let i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH));
        return btoa(s);
      }, [offset, Math.min(CHUNK, result.size - offset)]);
      b64Chunks.push(b64);
      console.log(`[blob] chunk ${b64Chunks.length} offset=${offset} size=${result.size}`);
    }

    const ext = /webm/.test(result.mime) ? 'webm' : /mp4/.test(result.mime) ? 'mp4' : 'webm';
    const base = `nocap-${stamp()}-${names[0]}-vs-${names[1]}-${result.pts.join('-')}`;
    const file = path.join(outDir, base + '.' + ext);
    const jsonFile = path.join(outDir, base + '.json');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(file, Buffer.concat(b64Chunks.map(c => Buffer.from(c, 'base64'))));

    const [a, b] = names;
    const winnerIdx = (result.pts[0] >= result.goal) ? 0 : (result.pts[1] >= result.goal ? 1 : (result.pts[0] > result.pts[1] ? 0 : 1));
    const winner = names[winnerIdx], loser = names[1-winnerIdx];
    const scoreRaw = result.pts.join('–');
    const scoreW   = `${result.pts[winnerIdx]}–${result.pts[1-winnerIdx]}`;
    const venueName = { cafeteria: 'the cafeteria', classroom: 'the classroom', restroom: 'the restroom', gym: 'the gym', hallway: 'the hallway', outside: 'outside' }[result.venue] || result.venue;
    const stageName = { table: 'the lunch table', tray: 'a lunch tray', books: 'a stack of textbooks', stool: 'a stool', hang: 'the hanging bottle' }[result.stage] || result.stage;
    const isHang = result.stage === 'hang';
    const st = result.stats || {};
    const hangLine = `Cut the Bottle: land your bottle upright cap to cap under the hanging one, then go again. Stall and the chainsaw cuts the rope. Stacks: ${st.stack || 0} · Cuts: ${st.cut || 0}.`;
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
    const hangShort = [
      `Bottle flip but a CHAINSAW is coming 🪚 ${a} vs ${b}`,
      `${winner} wins ${scoreW}: stack it before the chainsaw cuts the rope #shorts`,
      `Cap to cap! ${a} vs ${b} (${scoreRaw}) 🧢🪚`,
      `${a} vs ${b}: stack the bottle or get cut`,
    ];
    const hangLong = [
      `Cut the Bottle: ${a} vs ${b} — Land Cap to Cap Before the Chainsaw Cuts the Rope (${scoreRaw})`,
      `${winner} Wins ${scoreW} | Bottle Flip vs CHAINSAW | No Cap Flip`,
      `Full Match: ${a} vs ${b} — Cut the Bottle, First to ${result.goal} | No Cap Flip`,
      `Can You Stack It Before the Chainsaw Cuts the Rope? ${a} vs ${b}`,
    ];
    const titles = isHang ? (longForm ? hangLong : hangShort) : longForm ? longTitles : shortTitles;
    const title = titles[Math.floor(Math.random() * titles.length)].slice(0, 100);
    const description = longForm ? [
      `🎮 Play No Cap Flip free in your browser → https://nocapflip.com`,
      ``,
      isHang ? `Full match: ${a} vs ${b} in ${venueName}. First to ${result.goal} stacks wins. Final score: ${a} ${result.pts[0]} – ${result.pts[1]} ${b}. ${winner} takes the W.\n${hangLine}` : `Full bottle flip battle: ${a} vs ${b} on ${stageName} in ${venueName}. First to ${result.goal} wins. Final score: ${a} ${result.pts[0]} – ${result.pts[1]} ${b}. ${winner} takes the W.`,
      ``,
      `Subscribe for daily bottle-flip battles 👇`,
      `Which school venue should we add next? Drop it in the comments!`,
      ``,
      `#nocapflip #bottleflip #bottleflipchallenge #gaming #physicsgame #browsergame #schoolgames #indiegame`,
    ].join('\n') : [
      `🎮 Play No Cap Flip free in your browser → https://nocapflip.com`,
      ``,
      isHang ? `${a} vs ${b} in ${venueName}. First to ${result.goal} stacks. Final: ${a} ${result.pts[0]} – ${result.pts[1]} ${b}. ${winner} takes the W.\n${hangLine}` : `${a} vs ${b} on ${stageName} in ${venueName}. First to ${result.goal}. Final: ${a} ${result.pts[0]} – ${result.pts[1]} ${b}. ${winner} takes the W.`,
      ``,
      `Which school venue should we add next? Drop it in the comments 👇`,
      `Subscribe for daily bottle-flip battles.`,
      ``,
      `#Shorts #nocapflip #bottleflip #bottleflipchallenge #gaming #physicsgame #browsergame #schoolgames #indiegame`,
    ].join('\n');
    const hangTags = isHang ? ['cut the bottle', 'chainsaw', 'stack challenge', 'cap to cap'] : [];
    const tags = hangTags.concat(longForm ? [
      'nocapflip', 'bottle flip', 'bottleflip', 'bottle flip challenge',
      result.venue, 'school game', 'browser game', 'physics game',
      'gen z', 'gaming', 'indie game', winner.toLowerCase(), loser.toLowerCase(),
      'no cap', result.audio === 'clean' ? 'wah wah' : 'fart sounds',
    ].slice(0, 15) : [
      'nocapflip', 'bottle flip', 'bottleflip', 'bottle flip challenge', 'shorts',
      result.venue, 'cafeteria flip', 'school game', 'browser game', 'physics game',
      'gen z', 'gaming', 'indie game', winner.toLowerCase(), loser.toLowerCase(),
      'no cap', 'nice', result.audio === 'clean' ? 'wah wah' : 'fart sounds',
    ]).slice(0, 15);

    const sidecar = {
      file: path.basename(file),
      title, description, tags,
      category: 'Gaming', privacyStatus: process.env.PRIVACY || 'public', madeForKids: false, shorts: !longForm,
      match: {
        players: names, winner, winnerIdx,
        pts: result.pts, scoreRaw, scoreW,
        goal: result.goal, venue: result.venue, stage: result.stage,
        audio: result.audio, duration_s: result.duration_s, stats: result.stats,
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
