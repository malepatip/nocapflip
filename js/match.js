/* ---------- screens ---------- */
var SCREENS = ['home', 'table', 'match'], current = 'home';
function show(id) { SCREENS.forEach(function (s) { $(s).hidden = s !== id; }); current = id; if (id === 'home') renderHome(); if (id === 'table') renderTable(); }
function hideSheets() { ['sheetEp', 'sheetEnd', 'sheetTwo', 'sheetRoom', 'sheetLobby', 'sheetJoin', 'sheetCut'].forEach(function (i) { $(i).hidden = true; }); }

function renderHome() {
  var st = S.stats, pct = st.flips ? Math.round(100 * st.lands / st.flips) : 0;
  $('homeStats').innerHTML = '<span><strong class="num">' + fmt(S.aura) + '</strong> aura · ' + rankFor(S.aura) + '</span><span><strong class="num">' + st.lands + '</strong> lands in <strong class="num">' + st.flips + '</strong> flips (' + pct + '%)</span><span><strong class="num">' + st.caps + '</strong> cap lands</span><span>best streak <strong class="num">' + st.best + '</strong></span><span><strong class="num">' + S.beaten.length + '</strong>/' + KIDS.length + ' kids beaten</span>';
  $('lastVideo').hidden = !REC.blob;
  $('togClip').setAttribute('aria-pressed', String(!!S.clip)); $('togSound').setAttribute('aria-pressed', String(!!S.sound)); $('togRec').setAttribute('aria-pressed', String(!!S.rec)); $('togClock').setAttribute('aria-pressed', String(!!S.clock)); $('togAudio').setAttribute('aria-pressed', String(S.audio === 'clean'));
}
function nextKid() { for (var i = 0; i < KIDS.length; i++) if (S.beaten.indexOf(KIDS[i].id) < 0) return i; return -1; }
function renderTable() {
  $('auraTag').textContent = fmt(S.aura) + ' aura · ' + rankFor(S.aura);
  var nx = nextKid(), ul = $('seats'); ul.innerHTML = '';
  KIDS.forEach(function (k, i) {
    var beaten = S.beaten.indexOf(k.id) >= 0, isNext = i === nx, locked = !beaten && !isNext;
    var li = document.createElement('li'); var b = document.createElement('button');
    b.className = 'seat' + (locked ? ' locked' : '') + (isNext ? ' next' : ''); b.disabled = locked;
    b.innerHTML = '<div class="stool" style="background:' + k.stool + '">' + (i + 1) + '</div><div class="who"><div class="name">' + k.name + (i === KIDS.length - 1 ? ' · head of the table' : '') + '</div><div class="line">' + k.line + '</div><div class="line">' + SKINS[k.skin].name + ' · ' + STAGE_WORDS[k.stage] + ' · ' + VENUES[k.venue].name + ' · first to ' + k.goal + '</div></div><div class="status ' + (beaten ? 'w' : isNext ? 'next' : '') + '">' + (beaten ? 'W' : isNext ? 'NEXT' : '') + '</div>';
    b.addEventListener('click', function () { openMatch({ mode: 'ladder', kid: k }); });
    li.appendChild(b); ul.appendChild(li);
  });
  var bp = $('backpack'); bp.innerHTML = '';
  S.bottles.forEach(function (sid) {
    var sk = SKINS[sid], sp = NC.BOTTLES[sk.type], bt = document.createElement('button'); bt.className = 'bottle-pick'; bt.setAttribute('aria-pressed', String(S.active === sid));
    var c = document.createElement('canvas'); c.width = 72; c.height = 144;
    var keep = ctx; ctx = c.getContext('2d'); ctx.setTransform(1.2, 0, 0, 1.2, 36, 80); drawBottle(0, 0, 0, sid); ctx = keep;
    bt.appendChild(c); var d = document.createElement('div'); d.textContent = sk.name; bt.appendChild(d); var sm = document.createElement('small'); sm.textContent = 'aura ×' + sp.aura; bt.appendChild(sm);
    bt.addEventListener('click', function () { S.active = sid; save(); renderTable(); sfx('tap'); });
    bp.appendChild(bt);
  });
}

/* ---------- match ----------
   M.mode: ladder (you vs a kid), two (pass the phone), link (phones over the network), tape (playback of a recording) */
var M = null, epTimer = null;
function openMatch(o) {
  netRecordQuit();
  var kid = o.kid || null, idx = kid ? KIDS.indexOf(kid) : -1;
  var players = o.players || (kid ? [{ id: 'me', name: 'You', skin: S.active }, { id: 'kid:' + kid.id, name: kid.name, skin: kid.skin }] : null);
  M = { id: Date.now() + Math.random(), mode: o.mode, kid: kid, stageId: o.stageId || (kid ? kid.stage : 'table'), venue: o.venue || (kid && kid.venue) || 'cafeteria', goal: o.goal || (kid ? kid.goal : 3), players: players, pts: players.map(function () { return 0; }),
    turn: o.turn || 0, me: typeof o.me === 'number' ? o.me : 0, flips: 0, lands: 0, caps: 0, auraStart: S.aura, ep: idx + 1, code: o.code || '', record: o.record !== false, clock: o.mode === 'tape' ? false : (o.clock === undefined ? !!S.clock : !!o.clock), host: !!o.host, seq: 0, busy: false, done: false, createdAt: new Date().toISOString() };
  M.practice = !!o.practice; M.lastO = '';
  if (M.stageId === 'hang') hangReset(hangSkin());
  R.stageId = M.stageId; R.venue = M.venue; R.pose = null; R.state = 'idle'; R.skin = players[M.turn].skin; R.aim = null; inputEnabled = false; R.lastHuman = null;
  $('match').classList.toggle('clip-on', !!S.clip);
  var title = M.mode === 'ladder' ? 'EP ' + M.ep + ' · vs ' + kid.name.toUpperCase() : M.mode === 'tape' ? 'TAPE · ' + M.code : (M.mode === 'link' ? M.code + ' · ' : '2P · ') + players.map(function (p) { return p.name.toUpperCase(); }).join(' vs ');
  $('clipbar').hidden = !S.clip; $('clipTitle').textContent = title;
  $('roomTag').hidden = !M.code || M.mode === 'ladder' || M.mode === 'two'; $('roomTag').textContent = M.code;
  hideSheets();
  if (M.mode === 'ladder' || M.mode === 'two' || M.mode === 'tape') {
    $('epLabel').textContent = M.mode === 'ladder' ? 'EPISODE ' + M.ep + ' OF ' + KIDS.length : M.mode === 'tape' ? 'TAPE · ' + M.code : '2 PLAYER';
    $('epVs').textContent = players.map(function (p, i) { return (M.mode === 'ladder' && i === 0 ? 'YOU' : p.name.toUpperCase()); }).join(' vs ');
    $('epLine').textContent = kid ? kid.line : M.mode === 'tape' ? 'Recorded ' + (o.when || '') + '. Every flip, as it happened.' : 'Pass the phone after every flip.';
    $('epRules').textContent = M.stageId === 'hang' ? 'First to ' + M.goal + ' stacks. Land upright ' + STAGE_WORDS.hang + ' before the blade cuts the rope. Stack it and you go again. Get cut and you lose your turn.' : 'First to ' + M.goal + ' lands. Cap land counts as 2. Land it ' + STAGE_WORDS[M.stageId] + ', in ' + VENUE_WORDS[M.venue] + '.' + (kid && !M.practice ? ' Win and the ' + SKINS[kid.skin].name.toLowerCase() + ' is yours.' : '');
    $('epCount').hidden = true; $('btnStart').hidden = false; $('btnStart').textContent = M.mode === 'tape' ? 'Play the tape' : 'Flip'; $('sheetEp').hidden = false;
  }
  updateHud(); show('match'); setHint('');
  if (M.mode === 'ladder' || M.mode === 'two') netRecordStart();
}
function leaderIdx() { var best = 0; M.pts.forEach(function (p, i) { if (p > M.pts[best]) best = i; }); return best; }
function updateHud() {
  var n = M.players.length, l = n > 2 ? M.turn : 0, r = n < 2 ? 0 : n > 2 ? (leaderIdx() === M.turn ? (M.turn + 1) % n : leaderIdx()) : 1;
  $('nameL').textContent = M.players[l].name; $('nameR').textContent = M.players[r].name;
  $('nameL').classList.toggle('active', M.turn === l); $('nameR').classList.toggle('active', M.turn === r);
  $('score').textContent = M.pts[l] + '\u2013' + M.pts[r]; $('goal').textContent = 'first to ' + M.goal + ' · ' + STAGE_WORDS[M.stageId];
  [['pipsL', l], ['pipsR', r]].forEach(function (x) { var h = ''; for (var k = 0; k < M.goal; k++) h += '<span class="pip' + (k < M.pts[x[1]] ? ' on' : '') + '"></span>'; $(x[0]).innerHTML = h; });
  $('matchAura').textContent = fmt(S.aura) + ' aura';
  var goal = 'FIRST TO ' + M.goal + (M.mode === 'ladder' ? ' · EP ' + M.ep : M.code ? ' · ' + M.code : '');
  if (M.players.length !== 2) R.board = { rows: M.players.map(function (p, i) { return { name: p.name, pts: M.pts[i], active: i === M.turn }; }), goal: goal };
  else R.board = { l: M.players[0].name, r: M.players[1].name, sl: M.pts[0], sr: M.pts[1], goal: goal };
}
$('btnStart').addEventListener('click', function () {
  sfx('tap'); this.blur();
  var go = function () { var id = M.id; $('sheetEp').hidden = true; matchIntro(); setTimeout(function () { if (!M || M.id !== id) return; if (M.mode === 'tape') tapePlay(); else beginTurn(); }, 1300); };
  if (S.clip) { $('btnStart').hidden = true; var c = 3; $('epCount').hidden = false; $('epCount').textContent = c; epTimer = setInterval(function () { c--; if (c <= 0) { clearInterval(epTimer); go(); } else $('epCount').textContent = c; sfx('tap'); }, 800); }
  else go();
});
/* title slate on the canvas + start the video */
function slateTitle() { return M.players.map(function (p, i) { return (M.mode === 'ladder' && i === 0 ? 'YOU' : p.name.toUpperCase()); }).join(' vs '); }
function slateLabel() { return M.mode === 'ladder' ? 'EPISODE ' + M.ep + ' OF ' + KIDS.length : M.mode === 'tape' ? 'TAPE · ' + M.code : M.mode === 'link' ? 'TABLE ' + M.code : '2 PLAYER · ONE PHONE'; }
function matchIntro() {
  var name = M.mode === 'ladder' ? 'ep' + M.ep + '-vs-' + M.kid.name : M.mode === 'tape' ? 'tape-' + M.code : M.players.map(function (p) { return p.name; }).join('-vs-');
  R.clockStart = performance.now(); R.clockEnd = 0;
  if (M.record !== false) recStart(name);
  slate(slateLabel(), slateTitle(), 'first to ' + M.goal + ' · ' + STAGE_WORDS[M.stageId], 1500);
}
function isAI() { return M.mode === 'ladder' && M.turn === 1; }
function myTurn() { return M.mode === 'two' || (M.mode === 'ladder' && M.turn === 0) || (M.mode === 'link' && M.turn === M.me); }
/* 20s per-turn shot clock on local human turns; timeout counts as a flop (goes through onOutcome so remote players see it) */
var CLOCK_MS = 20000, clockTimer = null, clockDeadline = 0;
function clockStop() { if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } var el = $('shotClock'); if (el) { el.hidden = true; el.classList.remove('low'); } }
var CUT_MS = 12000;
function hangSkin() { var a = ['tap', 'camo', 'water', 'glitter']; return a[Math.floor(Math.random() * a.length)]; }
/* hang stage: the blade replaces the shot clock; when it reaches the rope the bottle is cut and the turn is lost */
onCutExpire = function () {
  if (!M || M.done || M.stageId !== 'hang' || !myTurn() || isAI() || M.busy || R.state !== 'idle') return;
  var id = M.id; inputEnabled = false; drag = null; R.aim = null; M.last = { power: 0, angle: 0 }; M.busy = true;
  setHint('The blade got the rope · turn lost');
  hangCutNow(function () { if (!M || M.id !== id) return; M.busy = false; onOutcome('cut', []); });
};
function clockStart() {
  clockStop(); if (!M || M.done || !M.clock || isAI() || !myTurn() || M.stageId === 'hang') return;
  clockDeadline = Date.now() + CLOCK_MS;
  var el = $('shotClock'), n = $('shotClockN'); if (!el || !n) return; el.hidden = false;
  var id = M.id, tick = function () {
    if (!M || M.id !== id || M.done || !M.clock || !myTurn() || isAI()) { clockStop(); return; }
    var left = Math.max(0, clockDeadline - Date.now()); n.textContent = Math.ceil(left / 1000); el.classList.toggle('low', left <= 5000);
    if (left <= 0) { clockStop(); shotClockExpired(); }
  };
  tick(); clockTimer = setInterval(tick, 200);
}
function shotClockExpired() {
  if (!M || M.done || !myTurn() || isAI() || M.busy) return;
  inputEnabled = false; M.last = { power: 0, angle: 0 }; setHint('Shot clock expired · flop'); onOutcome('flop', []);
}
function beginTurn() {
  if (!M || M.done) return;
  clockStop();
  var hang = M.stageId === 'hang';
  if (hang) { if (M.lastO === 'stack' || M.lastO === 'cut') hangReset(hangSkin()); M.lastO = ''; cutPark(); }
  updateHud(); R.state = 'idle'; R.aim = null; R.skin = M.players[M.turn].skin; R.pose = null;
  var who = esc(M.players[M.turn].name);
  if (isAI()) { inputEnabled = false; setHint('<b>' + who + '</b> is flipping…'); var id = M.id; setTimeout(function () { if (M && M.id === id && current === 'match') aiThrow(); }, 900); }
  else if (myTurn()) { inputEnabled = true; setHint((M.mode === 'two' ? '<b>' + who + '</b>, s' : 'S') + 'wipe <b>up</b> to flip' + (hang ? ' · land it under the bottle before the blade cuts' : '') + (R.lastHuman ? ' · Space repeats your last flip' : '')); clockStart(); if (hang) cutStart(CUT_MS); }
  else { inputEnabled = false; setHint('Waiting on <b>' + who + '</b>…' + (M.host ? ' <button class="btn btn-ghost" id="btnSkip" style="min-height:28px;padding:2px 8px;font-size:13px">skip their turn</button>' : '')); var sk = $('btnSkip'); if (sk) sk.addEventListener('click', netSkipTurn); }
}
function humanThrow(power, angle) {
  clockStop(); cutStop();
  inputEnabled = false; R.lastHuman = { power: power, angle: angle }; S.stats.flips++; M.flips++;
  setHint('Power <b>' + power.toFixed(2) + '</b> · angle <b>' + Math.round(angle) + '°</b>'); sfx('tap');
  M.last = { power: power, angle: angle };
  startThrow(power, angle, M.players[M.turn].skin);
}
function aiThrow() {
  if (!M || current !== 'match') return;
  var sk = SKINS[M.kid.skin], ideal = IDEAL[M.stageId][sk.type], sigma = 0.12 - 0.1 * M.kid.skill;
  var p = ideal[0] * (1 + gauss() * sigma), a = ideal[1] + gauss() * sigma * 60; M.last = { power: p, angle: a };
  startThrow(p, a, M.kid.skin);
}
function mult(i) { return NC.BOTTLES[SKINS[M.players[i].skin].type].aura; }

/* A throw just settled on this device (ours, or a kid's). */
onOutcome = function (o, trail) {
  if (!M || current !== 'match' || M.done) return;
  var me = M.turn, human = myTurn() && !isAI();
  M.lastO = o;
  if (M.mode === 'link' || M.mode === 'ladder' || M.mode === 'two') netThrow({ seq: M.seq + 1, p: me, skin: M.players[me].skin, power: M.last.power, angle: M.last.angle, o: o, tr: encTrail(trail) });
  M.seq++;
  var r = score(o, me, human);
  M.busy = true;
  var finish = function () { M.busy = false; if (M.mode === 'link') netAfterLocalThrow(); else afterThrow(); };
  present(o, me, r, trail, M.players[me].skin, true, finish);
};
/* Apply a throw to the scoreboard and aura; returns what to show. */
function score(o, who, human) {
  var delta = 0, text = '', cls = '', sub = '', name = M.players[who].name;
  if (o === 'land' || o === 'cap' || o === 'stack') {
    var big = o === 'cap' || o === 'stack';
    M.pts[who] += o === 'cap' ? 2 : 1;
    if (human) { delta = (big ? AURA.cap : AURA.land) * mult(who); S.stats.streak++; S.stats.best = Math.max(S.stats.best, S.stats.streak); S.stats.lands++; if (big) S.stats.caps++; M.lands++; if (big) M.caps++; }
    text = o === 'stack' ? 'CAP TO CAP' : o === 'cap' ? 'CAP LAND' : (human ? 'LANDED' : name.toUpperCase() + ' LANDED'); cls = big ? '' : 'green';
    sub = (delta ? '+' + fmt(delta) + ' aura' : '') + (o === 'cap' ? ' · no cap' : '') + (o === 'stack' ? ' · go again' : '') + (human && S.stats.streak > 1 ? ' · ' + S.stats.streak + ' in a row' : '');
  } else {
    if (human) { delta = AURA.flop; S.stats.streak = 0; }
    text = o === 'cut' ? 'CUT' : o === 'wrong' ? (M.stageId === 'hang' ? 'NOT UNDER IT' : M.stageId === 'tray' ? 'NOT THE TRAY' : M.stageId === 'books' ? 'NOT THE BOOKS' : 'NOT THE STOOL') : (human ? 'FLOP' : name.toUpperCase() + ' FLOPPED'); cls = 'red small';
    sub = (o === 'cut' ? 'the blade got it · turn lost' : '') + (delta ? (o === 'cut' ? ' · ' : '') + fmt(delta) + ' aura' : '');
  }
  if (human && S.stats.flips > 0 && S.stats.flips % 67 === 0) sub += (sub ? ' · ' : '') + 'SIX SEVEN';
  if (human) { S.aura = Math.max(0, S.aura + delta); save(); }
  return { text: text, cls: cls, sub: sub, land: o === 'land' || o === 'cap' || o === 'stack' };
}
/* Show a throw's result: the settle, a slow-mo replay on a land, then the stamp. live=true means the throw was just simulated here. */
function present(o, who, r, trail, skin, live, done) {
  var id = M.id, hang = M.stageId === 'hang', after = r.land ? 1300 : 900, snd = o === 'cut' ? '' : r.land ? (o === 'cap' || o === 'stack' ? 'cap' : 'land') : 'flop', played = false, hs = live ? 0.33 : 0.17;
  if (o === 'stack') after = 2000;
  var stamp = function () {
    if (!M || M.id !== id) return;
    if (!played && snd) sfx(snd);
    showStamp(r.text, r.cls, r.sub, after + 600); updateHud();
    if (o === 'stack') hangLower();
    setTimeout(function () { if (M && M.id === id) done(); }, after);
  };
  /* a cut has no throw to replay: the blade snaps and the bottle drops (already done when the timer ran out locally) */
  if (o === 'cut') { hangCutNow(function () { stamp(); }); return; }
  var highlight = function () { if (r.land) { showStamp('REPLAY', 'small', '', 1400); playReplay(trail, skin, stamp, hs); } else { if (live) { sfx('flop'); played = true; } setTimeout(stamp, live ? 350 : 500); } };
  if (live || !trail || !trail.length) highlight(); else playReplay(trail, skin, highlight, 0.6, true);
}
function afterThrow() {
  if (!M || M.done) return;
  var w = winner(); if (w >= 0) endMatch(w); else { if (!(M.stageId === 'hang' && M.lastO === 'stack')) M.turn = (M.turn + 1) % M.players.length; beginTurn(); }
}
function winner() { for (var i = 0; i < M.pts.length; i++) if (M.pts[i] >= M.goal) return i; return -1; }
function endMatch(w) {
  if (!M || M.done) return; M.done = true; inputEnabled = false; clockStop(); cutStop(); R.clockEnd = performance.now();
  var mine = M.mode === 'ladder' ? w === 0 : M.mode === 'link' ? w === M.me : true, delta = 0, newBottle = null, wn = M.players[w].name.toUpperCase();
  if (M.mode === 'ladder') { delta = mine ? AURA.win : AURA.lose; if (mine && !M.practice) { if (S.beaten.indexOf(M.kid.id) < 0) S.beaten.push(M.kid.id); if (S.bottles.indexOf(M.kid.skin) < 0) { S.bottles.push(M.kid.skin); newBottle = SKINS[M.kid.skin].name; } } }
  if (M.mode === 'link' && M.me >= 0) delta = mine ? AURA.win : AURA.lose;
  if (delta) { S.aura = Math.max(0, S.aura + delta); save(); }
  sfx(mine ? 'win' : 'lose');
  if (M.mode === 'ladder' || M.mode === 'two') netRecordEnd(w);
  $('endLabel').textContent = M.mode === 'ladder' ? 'EPISODE ' + M.ep + ' · ' + (mine ? 'W' : 'L') : M.mode === 'tape' ? 'TAPE · ' + M.code : M.code ? 'TABLE ' + M.code : 'GAME';
  var kn = M.kid ? M.kid.name.toUpperCase() : '';
  $('endTitle').textContent = M.mode === 'ladder' ? (mine ? 'W. ' + kn + ' IS COOKED.' : 'L. ' + kn + ' KEEPS IT.') : M.mode === 'link' ? (M.me < 0 ? wn + ' WINS' : mine ? 'W. YOU COOKED THE TABLE.' : 'L. ' + wn + ' WINS.') : wn + ' WINS';
  $('endLine').textContent = M.mode === 'ladder' ? (mine ? (newBottle ? 'The ' + newBottle.toLowerCase() + ' is in your backpack now.' : M.practice ? 'Stacked it, cut or not. Run it back.' : 'Already had that bottle. Took the aura anyway.') + (M.ep === KIDS.length ? ' You are the bottle flip champion of 4th period lunch.' : '') : 'Run it back. The bottle is still on the table.') : M.mode === 'tape' ? 'That was the tape. Screen-record it in clip mode if you want it on your channel.' : 'Final ' + M.pts.join('–') + '.' + (M.record ? ' This game is on tape.' : '');
  $('endDelta').textContent = delta ? (delta > 0 ? '+' : '') + fmt(delta) + ' aura · ' + fmt(S.aura) + ' total' : ''; $('endDelta').className = 'delta ' + (delta >= 0 ? 'up' : 'down');
  $('endRecap').innerHTML = '<div><b class="num">' + M.flips + '</b><span>your flips</span></div><div><b class="num">' + M.lands + '</b><span>lands</span></div><div><b class="num">' + M.caps + '</b><span>cap lands</span></div>';
  var nk = nextKid();
  $('btnNext').hidden = !(M.mode === 'ladder' && !M.practice && mine && nk >= 0); $('btnNext').textContent = nk >= 0 ? 'Next: ' + KIDS[nk].name : '';
  $('btnAgain').hidden = M.mode === 'link' && !M.host; $('btnAgain').textContent = M.mode === 'tape' ? 'Play it again' : M.mode === 'link' ? 'Run it back (new table, same link rules)' : 'Run it back';
  $('btnToTable').textContent = M.mode === 'ladder' ? 'Back to the table' : M.mode === 'link' && !M.host ? 'Leave (the host can start a rematch)' : 'Home';
  slate($('endLabel').textContent, $('endTitle').textContent, 'final ' + M.pts.join('–') + (delta ? ' · ' + (delta > 0 ? '+' : '') + fmt(delta) + ' aura' : ''), 2600, { url: 'nocapflip.com', action: 'SUBSCRIBE for more' });
  var recording = !!REC.rec; $('btnSave').hidden = !recording; $('endVideo').hidden = !recording; if (recording) { $('endVideo').textContent = 'Recording the end card… the video is ready in a few seconds.'; var mid = M.id; setTimeout(function () { if (M && M.id === mid) recStop(false); }, 2700); }
  hideSheets(); $('sheetEnd').hidden = false;
}
function recDone(got) {
  if (got) { $('endVideo').textContent = 'Video ' + recLen() + ' · ' + recSize() + ' · ' + recExt() + ', ' + cv.width + '×' + cv.height + ' vertical'; $('endVideo').hidden = false; $('btnSave').hidden = false; $('lastVideo').hidden = false; $('videoNote').textContent = recLen() + ' · ' + recSize() + ' · ' + REC.name; }
  else { $('endVideo').textContent = 'The recording came out empty on this browser.'; }
  if (REC.saveQueued) { REC.saveQueued = false; recSave(); }
  renderSaveNudge();
}
function renderSaveNudge() { $('lastVideo').hidden = !REC.blob; $('btnSaveLobby').hidden = !recUnsaved(); }
/* the next game's recording replaces the last video, so ask once before moving on without saving it */
var leaveArmed = null;
function guardVideo(btn, go) {
  if (!(REC.rec || recUnsaved()) || leaveArmed === btn) { leaveArmed = null; go(); return; }
  leaveArmed = btn; var keep = btn.textContent; btn.textContent = 'Video not saved. Tap again to go on';
  setTimeout(function () { if (leaveArmed === btn) { leaveArmed = null; btn.textContent = keep; } }, 3000);
}
$('btnSave').addEventListener('click', function () { recSave(); });
$('btnSaveHome').addEventListener('click', function () { recSave(); });
$('btnSaveLobby').addEventListener('click', function () { recSave(); });
$('btnNext').addEventListener('click', function () { guardVideo(this, function () { var i = nextKid(); if (i >= 0) openMatch({ mode: 'ladder', kid: KIDS[i] }); else show('table'); }); });
$('btnAgain').addEventListener('click', function () { guardVideo(this, function () { if (M.mode === 'ladder') openMatch({ mode: 'ladder', kid: M.kid, stageId: M.practice ? M.stageId : undefined, goal: M.practice ? M.goal : undefined, practice: M.practice }); else if (M.mode === 'two') openMatch({ mode: 'two', players: M.players, stageId: M.stageId, venue: M.venue, goal: M.goal }); else if (M.mode === 'tape') tapeOpen(M.code); else netRematch(); }); });
$('btnToTable').addEventListener('click', function () { guardVideo(this, function () { var mode = M.mode, toTable = mode === 'ladder' && !M.practice; cutStop(); recStop(false); netLeave(); M = null; R.slate = null; R.stamps = []; show(toTable ? 'table' : 'home'); }); });
$('btnQuit').addEventListener('click', function () { clearInterval(epTimer); var mode = M && M.mode, toTable = mode === 'ladder' && !M.practice; cutStop(); netRecordQuit(); recStop(false); netLeave(); M = null; R.slate = null; R.stamps = []; show(toTable ? 'table' : 'home'); });

/* ---------- 2 player, one phone ---------- */
var twoStage = 'table';
$('btnTwo').addEventListener('click', function () { twoStage = 'table'; sfx('tap'); openMatch({ mode: 'two', players: [{ id: 'p1', name: 'Player 1', skin: S.active }, { id: 'p2', name: 'Player 2', skin: S.active }] }); hideSheets(); $('sheetTwo').hidden = false; });
/* ---------- Cut the bottle (hang stage) ---------- */
$('btnCut').addEventListener('click', function () { sfx('tap'); $('sheetCut').hidden = !$('sheetCut').hidden; });
$('btnCutCancel').addEventListener('click', function () { $('sheetCut').hidden = true; });
$('btnCutKid').addEventListener('click', function () { sfx('tap'); var k = KIDS[Math.floor(Math.random() * KIDS.length)]; openMatch({ mode: 'ladder', kid: k, stageId: 'hang', goal: 2, practice: true }); });
$('btnCutTwo').addEventListener('click', function () { twoStage = 'hang'; sfx('tap'); openMatch({ mode: 'two', stageId: 'hang', players: [{ id: 'p1', name: 'Player 1', skin: S.active }, { id: 'p2', name: 'Player 2', skin: S.active }] }); hideSheets(); $('sheetTwo').hidden = false; });
$('btnCutLink').addEventListener('click', function () { $('sheetCut').hidden = true; $('btnLink').click(); var b = $('segStage').querySelector('[data-v="hang"]'); if (b) b.click(); });
var twoVenue = 'cafeteria';
$('segVenue2').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; Array.prototype.forEach.call($('segVenue2').children, function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); twoVenue = b.dataset.v; sfx('tap'); });
$('btnTwoStart').addEventListener('click', function () { var a = $('p1').value.trim() || 'Player 1', b = $('p2').value.trim() || 'Player 2'; openMatch({ mode: 'two', venue: twoVenue, stageId: twoStage, players: [{ id: 'p1', name: a, skin: S.active }, { id: 'p2', name: b, skin: S.active }] }); });
$('btnTwoCancel').addEventListener('click', function () { netRecordQuit(); M = null; show('home'); });

/* ---------- home / table buttons ---------- */
$('btnLadder').addEventListener('click', function () { sfx('tap'); show('table'); });
$('btnHome1').addEventListener('click', function () { show('home'); });
$('togClip').addEventListener('click', function () { S.clip = !S.clip; save(); renderHome(); });
$('togSound').addEventListener('click', function () { S.sound = !S.sound; save(); renderHome(); if (S.sound) sfx('tap'); });
$('togRec').addEventListener('click', function () { S.rec = !S.rec; save(); renderHome(); });
$('togClock').addEventListener('click', function () { S.clock = !S.clock; save(); renderHome(); if (M && !M.code) M.clock = S.clock; });
$('togAudio').addEventListener('click', function () { S.audio = S.audio === 'clean' ? 'fart' : 'clean'; save(); renderHome(); });
var resetArmed = false;
$('btnReset').addEventListener('click', function () { if (!resetArmed) { resetArmed = true; $('btnReset').textContent = 'Tap again to wipe aura, bottles and the seating chart'; setTimeout(function () { resetArmed = false; $('btnReset').textContent = 'Reset progress'; }, 3000); return; }
  resetArmed = false; S = { aura: 0, beaten: [], bottles: ['tap'], active: 'tap', stats: { flips: 0, lands: 0, caps: 0, best: 0, streak: 0 }, clip: S.clip, sound: S.sound, rec: S.rec, clock: S.clock, audio: S.audio, name: S.name, pid: S.pid }; save(); $('btnReset').textContent = 'Reset progress'; renderTable(); });
