/* ---------- network: rooms, lobby, tapes (db capability) ----------
   rooms/{CODE}            the table: players, turn, points, status (lobby, playing, done, closed)
   rooms/{CODE}/throws/tNNNN  one document per flip: who, power, angle, outcome, trail. This is the tape. */
var IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
var ART_URL = IN_CLAUDE ? 'https://claude.ai/artifact/VtqtCQyYzC9bHffeaR7Aao' : location.origin + location.pathname;
var NET = { db: null, user: null, uid: null, canWrite: null, ready: null, code: '', unsub: [], state: null, played: 0, queue: [], early: [], mine: {}, host: false, sawLobby: false, waitTimer: null, warned: false, tapesAt: 0 };

function netInit() {
  NET.ready = (async function () {
    try {
      if (!IN_CLAUDE && window.FIREBASE_CONFIG && window.firebase && window.firebase.firestore) {
        /* self-hosted: Firestore's compat API has the same shape as the claude.ai db (doc/collection/get/set/update/onSnapshot) */
        window.firebase.initializeApp(window.FIREBASE_CONFIG); NET.db = window.firebase.firestore(); try { NET.db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {} NET.self = true;
      } else if (IN_CLAUDE) {
        NET.db = await window.claude.use('db');
        NET.user = await window.claude.use('user');
        try { NET.dl = await window.claude.use('downloads'); } catch (e) { NET.dl = null; }
        if (NET.user && NET.user.id) { try { NET.uid = await NET.user.id(); } catch (e) {} }
        if (NET.user && NET.user.can) { try { NET.canWrite = await NET.user.can('data.write'); } catch (e) { NET.canWrite = null; } }
      }
    } catch (e) { NET.db = null; NET.initErr = e; }
    if (!NET.uid) { if (!S.pid) { S.pid = 'p' + Math.random().toString(36).slice(2, 10); save(); } NET.uid = S.pid; }
  })();
  return NET.ready;
}
function roomRef(code) { return NET.db.doc('rooms/' + code); }
function throwsRef(code) { return NET.db.collection('rooms/' + code + '/throws'); }
/* read-modify-write on a room without losing a write that lands at the same moment (two friends joining at once).
   fn(data or null) returns { upd, res }: upd is written if set, res is handed back. */
function roomTxn(code, fn) {
  var ref = roomRef(code);
  if (NET.db.runTransaction) return NET.db.runTransaction(function (tx) { return tx.get(ref).then(function (s) { var r = fn(s.exists ? s.data() : null) || {}; if (r.upd) tx.update(ref, r.upd); return r.res; }); });
  return (async function () {
    try { if (ref.acquire) await ref.acquire({ holder: NET.uid, ttlMs: 4000 }); } catch (e) {}
    var s = await ref.get(), r = fn(s.exists ? s.data() : null) || {};
    if (r.upd) await ref.update(r.upd);
    return r.res;
  })();
}
function newCode() { var A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', c = ''; for (var i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; return c; }
function tid(seq) { var s = String(seq); while (s.length < 4) s = '0' + s; return 't' + s; }
function iso() { return new Date().toISOString(); }
function fmtDate(s) { try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
function noWrite(e) {
  if (e && (e.code === 'invalid_argument' || e.code === 'not_granted')) { NET.canWrite = false; if (!NET.warned) { NET.warned = true; toast('Can\'t save to this table. You need Contributor access from whoever owns this page.'); } }
  else if (e && e.code === 'quota_exceeded') toast('The tape library is full. Older tapes need deleting before new games can be saved.');
}
var toastTimer = null;
function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3500); if (current !== 'match') { $('linkNote').textContent = msg; } }
function setupMsg() {
  if (IN_CLAUDE) return 'Playing by link and tapes need you signed in to claude.ai with access to this page.';
  if (!window.FIREBASE_CONFIG) return 'Play by link is not set up on this site yet: firebase-config.js is empty. Paste your Firebase web config into it and redeploy.';
  if (!(window.firebase && window.firebase.firestore)) return 'The Firebase library did not load (an ad blocker or network filter may be blocking gstatic.com). Reload or try another network.';
  return 'Could not start the database' + (NET.initErr && NET.initErr.message ? ': ' + NET.initErr.message : '.');
}
function dbErr(e) {
  var c = e && e.code ? String(e.code) : '';
  if (c === 'permission-denied') return 'The database refused the write. In Firebase open Firestore Database, then Rules, paste firestore.rules and press Publish.';
  if (c === 'not-found' || /database.*(not exist|does not)/i.test((e && e.message) || '')) return 'Firestore is not created yet. In Firebase choose Build, Firestore Database, Create database.';
  if (c === 'unavailable' || c === 'deadline-exceeded') return 'Cannot reach the database. Check the connection, or that the projectId in firebase-config.js is right.';
  if (c === 'unauthenticated' || c === 'invalid-argument') return 'The Firebase config looks wrong (' + c + '). Re-copy it from Project settings.';
  return 'Database error' + (c ? ' (' + c + ')' : '') + (e && e.message ? ': ' + String(e.message).slice(0, 120) : '.');
}
function renderLinkNote() {
  var n = $('linkNote');
  if (!NET.db) { n.textContent = setupMsg(); return; }
  if (NET.canWrite === false) { n.textContent = 'You can watch tapes and spectate tables. Making or joining a table needs Contributor access from whoever owns this page.'; return; }
  n.textContent = ''; if (IN_CLAUDE) $('roomNote').textContent += ' Players need to be signed in and have access to this page.';
}

/* ----- host: make a table ----- */
var roomOpts = { venue: 'cafeteria', stage: 'table', goal: 3, record: true };
['segVenue', 'segStage', 'segGoal'].forEach(function (id) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; Array.prototype.forEach.call($(id).children, function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); if (id === 'segStage') roomOpts.stage = b.dataset.v; else if (id === 'segVenue') roomOpts.venue = b.dataset.v; else roomOpts.goal = +b.dataset.v; sfx('tap'); }); });
$('togRoomRec').addEventListener('click', function () { roomOpts.record = !roomOpts.record; this.setAttribute('aria-pressed', String(roomOpts.record)); });
$('btnLink').addEventListener('click', function () {
  sfx('tap'); if (!NET.db) { toast(setupMsg()); return; }
  $('hostName').value = S.name || '';
  openMatch({ mode: 'link', players: [{ id: NET.uid, name: S.name || 'You', skin: S.active }], stageId: roomOpts.stage, venue: roomOpts.venue, goal: roomOpts.goal, me: 0, host: true });
  hideSheets(); $('sheetRoom').hidden = false;
});
$('btnRoomCancel').addEventListener('click', function () { M = null; show('home'); });
$('btnRoomCreate').addEventListener('click', async function () {
  var name = $('hostName').value.trim() || 'Host'; S.name = name; save(); this.disabled = true;
  try {
    var code = newCode();
    await roomRef(code).set({ code: code, host: NET.uid, created: iso(), status: 'lobby', mode: 'link', stage: roomOpts.stage, venue: roomOpts.venue, goal: roomOpts.goal, record: roomOpts.record, players: [{ id: NET.uid, name: name, skin: S.active }], pts: [0], turn: 0, seq: 0, winner: -1, next: '' });
    netEnter(code);
  } catch (e) { noWrite(e); toast('Could not make the table. ' + dbErr(e)); }
  this.disabled = false;
});

/* ----- joining ----- */
$('btnJoin').addEventListener('click', function () { openCode($('joinCode').value); });
$('joinCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') openCode(this.value); });
async function openCode(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); if (code.length < 5) { toast('Codes are 5 letters or numbers.'); return; }
  await NET.ready; if (!NET.db) { toast(setupMsg()); return; }
  var snap = null; try { snap = await roomRef(code).get(); } catch (e) { toast(dbErr(e)); return; }
  if (!snap || !snap.exists) { toast('No table with code ' + code + '.'); return; }
  var d = snap.data();
  if (d.status === 'done') { tapeOpen(code, d); return; }
  if (d.status === 'closed') { toast('That table was closed by the host.'); return; }
  var meIdx = d.players.findIndex(function (p) { return p.id === NET.uid; });
  openMatch({ mode: 'link', players: d.players, stageId: d.stage, venue: d.venue, goal: d.goal, code: code, record: d.record, host: d.host === NET.uid, me: meIdx });
  hideSheets(); $('sheetJoin').hidden = false;
  $('joinLabel').textContent = 'TABLE ' + code + ' · ' + STAGE_WORDS[d.stage] + ' · first to ' + d.goal;
  $('joinTitle').textContent = d.players.map(function (p) { return p.name.toUpperCase(); }).join(' vs ');
  $('joinName').value = S.name || '';
  var playing = d.status === 'playing';
  $('joinLine').textContent = meIdx >= 0 ? 'You are at this table.' : playing ? 'Game in progress. You can watch.' : d.players.length >= 6 ? 'This table is full (6). You can watch.' : (d.record ? 'This game is being taped.' : 'Not taped.');
  $('joinNameWrap').hidden = meIdx >= 0 || playing || d.players.length >= 6;
  $('btnJoinGo').hidden = !(meIdx >= 0 || (!playing && d.players.length < 6)); $('btnJoinGo').textContent = meIdx >= 0 ? 'Rejoin' : 'Join';
  $('btnWatch').hidden = meIdx >= 0 || !(playing || d.players.length >= 6);
  $('btnJoinGo').onclick = function () { var nm = $('joinName').value.trim() || 'Player'; S.name = nm; save(); netJoin(code, nm); };
  $('btnWatch').onclick = function () { netEnter(code); };
}
$('btnJoinCancel').addEventListener('click', function () { M = null; show('home'); });
async function netJoin(code, name) {
  try {
    var res = await roomTxn(code, function (d) {
      if (!d) return { res: 'gone' };
      if (d.players.some(function (p) { return p.id === NET.uid; }) || d.status !== 'lobby') return { res: 'enter' };
      if (d.players.length >= 6) return { res: 'full' };
      var players = d.players.concat([{ id: NET.uid, name: name, skin: S.active }]);
      return { upd: { players: players, pts: players.map(function () { return 0; }) }, res: 'enter' };
    });
    if (res === 'gone') { toast('No table with that code.'); return; }
    if (res === 'full') { toast('That table is full.'); return; }
    netEnter(code);
  } catch (e) { noWrite(e); toast('Could not join. ' + (NET.canWrite === false ? 'You need Contributor access to this page.' : dbErr(e))); }
}

/* ----- live room ----- */
function netEnter(code) {
  netLeave(false);
  NET.code = code; keepAwake(); NET.played = 0; NET.queue = []; NET.early = []; NET.mine = {}; NET.state = null; NET.sawLobby = false;
  NET.unsub.push(roomRef(code).onSnapshot(onRoom, function (e) { toast('Lost the connection to the table. ' + dbErr(e)); }));
  NET.unsub.push(throwsRef(code).orderBy('seq').onSnapshot(onThrows, function (e) {}));
}
function netLeave(full) {
  letSleep();
  clearInterval(NET.beat); NET.beat = null;
  NET.unsub.forEach(function (u) { try { u(); } catch (e) {} }); NET.unsub = [];
  if (full !== false && NET.state && NET.db && M && M.mode === 'link') {
    var d = NET.state;
    if (NET.host && (d.status === 'lobby' || d.status === 'playing')) roomRef(d.code).update({ status: 'closed' }).catch(function () {});
    else if (d.status === 'lobby') {
      if (!NET.host) { var uid = NET.uid; roomTxn(d.code, function (f) { if (!f || f.status !== 'lobby') return null; var players = f.players.filter(function (p) { return p.id !== uid; }); return { upd: { players: players, pts: players.map(function () { return 0; }) } }; }).catch(function () {}); }
    }
  }
  NET.code = ''; NET.state = null; NET.queue = []; NET.early = []; clearTimeout(NET.waitTimer); NET.waitTimer = null;
}
/* host heartbeat: if the host's phone disappears (tab closed, signal lost), guests end the game too */
/* keep phones awake during a table, and say hello again the moment the host comes back to the page */
var wakeLock = null;
function keepAwake() { try { if (navigator.wakeLock && document.visibilityState === 'visible' && NET.code) navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () {}); } catch (e) {} }
function letSleep() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState !== 'visible') return;
  NET.hbAt = Date.now(); keepAwake();
  var s = NET.state; if (NET.db && NET.host && s && (s.status === 'lobby' || s.status === 'playing')) roomRef(s.code).update({ hb: Date.now() }).catch(function () {});
});
function netBeat() {
  if (NET.beat) return; NET.hbAt = Date.now(); NET.hbV = NET.state && NET.state.hb;
  NET.beat = setInterval(function () {
    var s = NET.state; if (!s || !NET.db || (s.status !== 'lobby' && s.status !== 'playing')) { clearInterval(NET.beat); NET.beat = null; return; }
    if (NET.host) { roomRef(s.code).update({ hb: Date.now() }).catch(function () {}); return; }
    if (s.hb !== NET.hbV) { NET.hbV = s.hb; NET.hbAt = Date.now(); }
    else if (s.status === 'playing' && Date.now() - NET.hbAt > 120000) { toast('The host left, so the game ended.'); recStop(false); netLeave(false); M = null; show('home'); }
  }, 8000);
}
function onRoom(snap) {
  if (!snap.exists) { if (NET.state) { toast('The host left, so the game ended.'); recStop(false); netLeave(false); M = null; show('home'); } return; }
  var d = snap.data(), first = !NET.state; NET.state = d; NET.host = d.host === NET.uid;
  if (d.status === 'lobby' || d.status === 'playing') netBeat();
  var meIdx = d.players.findIndex(function (p) { return p.id === NET.uid; });
  if (d.next && meIdx >= 0 && !NET.host) { var nm = d.players[meIdx].name; netLeave(false); netJoin(d.next, nm); return; }
  if (d.status === 'closed') { toast('The host left, so the game ended.'); recStop(false); netLeave(false); M = null; show('home'); return; }
  if (d.status === 'lobby') { NET.sawLobby = true; renderLobby(d, meIdx); return; }
  if (!M || M.mode !== 'link' || M.code !== d.code) openMatch({ mode: 'link', players: d.players, stageId: d.stage, venue: d.venue, goal: d.goal, code: d.code, record: d.record, host: NET.host, me: meIdx, turn: d.turn });
  M.me = meIdx; M.host = NET.host; M.players = d.players;
  if (first && !NET.sawLobby) { NET.played = d.seq; M.seq = d.seq; M.pts = d.pts.slice(); }
  if (!M.started) { M.started = true; hideSheets(); $('roomTag').hidden = false; $('roomTag').textContent = d.code; matchIntro(); NET.early.forEach(function (t) { if (t.seq > NET.played && !NET.mine[t.seq]) NET.queue.push(t); }); NET.early = []; NET.queue.sort(function (a, b) { return a.seq - b.seq; }); }
  if (NET.queue.length) drain(); else applyRoom();
}
function onThrows(snap) {
  snap.docChanges().forEach(function (ch) {
    if (ch.type !== 'added') return; var t = ch.doc.data();
    if (NET.mine[t.seq]) { NET.played = Math.max(NET.played, t.seq); return; }
    if (!NET.state || !M || !M.started) { NET.early.push(t); return; }
    if (t.seq <= NET.played) return;
    NET.queue.push(t);
  });
  NET.queue.sort(function (a, b) { return a.seq - b.seq; });
  if (M && M.started) drain();
}
function drain() {
  if (!M || M.mode !== 'link' || M.busy || !NET.queue.length) return;
  var t = NET.queue.shift(); NET.played = Math.max(NET.played, t.seq);
  if (M.done) return drain();
  M.busy = true; inputEnabled = false; R.aim = null; M.turn = t.p; M.seq = t.seq; updateHud(); setHint('<b>' + esc(M.players[t.p].name) + '</b> flipped');
  var r = score(t.o, t.p, false);
  present(t.o, t.p, r, decTrail(t.tr), t.skin, false, function () { M.busy = false; if (NET.queue.length) drain(); else applyRoom(); });
}
function applyRoom() {
  var d = NET.state; if (!d || !M || M.mode !== 'link' || M.code !== d.code || M.done) return;
  if (M.busy || NET.queue.length) return;
  if (d.seq > NET.played) {
    if (!NET.waitTimer) NET.waitTimer = setTimeout(function () { NET.waitTimer = null; if (NET.state) NET.played = NET.state.seq; applyRoom(); }, 8000);
    return;
  }
  clearTimeout(NET.waitTimer); NET.waitTimer = null;
  M.pts = d.pts.slice(); M.turn = d.turn; M.seq = d.seq; M.players = d.players; updateHud();
  if (d.status === 'done') { endMatch(d.winner >= 0 ? d.winner : leaderIdx()); return; }
  beginTurn();
}
function netAfterLocalThrow() { applyRoom(); }
/* write a throw (ours), then move the table on */
function netThrow(t) {
  if (!NET.db || !M.code || NET.canWrite === false) return;
  if (M.mode === 'link' && M.me < 0) return;
  NET.mine[t.seq] = true;
  var code = M.code, mode = M.mode;
  var p = throwsRef(code).doc(tid(t.seq)).set(Object.assign({ at: iso() }, t));
  if (mode !== 'link') { p.catch(noWrite); return; }
  p.then(function () {
    /* score on the table's current state, so a skip or another write at the same moment is not overwritten */
    return roomTxn(code, function (d) {
      if (!d || d.status !== 'playing' || d.seq >= t.seq) return null;
      var pts = d.pts.slice(); pts[t.p] = (pts[t.p] || 0) + (t.o === 'cap' ? 2 : t.o === 'land' ? 1 : 0);
      var w = -1; pts.forEach(function (v, i) { if (w < 0 && v >= d.goal) w = i; });
      var upd = { seq: t.seq, pts: pts, turn: w >= 0 ? d.turn : (t.p + 1) % d.players.length, last: { seq: t.seq, p: t.p, o: t.o } };
      if (w >= 0) { upd.status = 'done'; upd.winner = w; upd.ended = iso(); }
      return { upd: upd, res: { d: d, pts: pts, w: w } };
    }).then(function (r) { if (!r || r.w < 0) return; if (!r.d.record) wipeThrows(code); else tapeIndex(r.d, r.pts, r.w); });
  }).catch(noWrite);
}
function wipeThrows(code) { throwsRef(code).get().then(function (s) { s.docs.forEach(function (doc) { throwsRef(code).doc(doc.id).delete().catch(function () {}); }); }).catch(function () {}); }
function netSkipTurn() { var d = NET.state; if (!d || !NET.host) return; roomRef(d.code).update({ turn: (d.turn + 1) % d.players.length }).catch(noWrite); }
async function netRematch() {
  var d = NET.state; if (!d || !NET.host) return;
  try {
    var code = newCode(), me = d.players.find(function (p) { return p.id === NET.uid; }) || { id: NET.uid, name: S.name || 'Host', skin: S.active };
    await roomRef(code).set({ code: code, host: NET.uid, created: iso(), status: 'lobby', mode: 'link', stage: d.stage, venue: d.venue || 'cafeteria', goal: d.goal, record: d.record, players: [me], pts: [0], turn: 0, seq: 0, winner: -1, next: '' });
    await roomRef(d.code).update({ next: code });
    netEnter(code);
  } catch (e) { noWrite(e); }
}
function renderLobby(d, meIdx) {
  if (!M || M.code !== d.code) openMatch({ mode: 'link', players: d.players, stageId: d.stage, venue: d.venue, goal: d.goal, code: d.code, record: d.record, host: NET.host, me: meIdx });
  M.players = d.players; M.pts = d.players.map(function () { return 0; }); M.me = meIdx; M.host = NET.host; M.started = false; updateHud();
  hideSheets(); $('sheetLobby').hidden = false;
  $('lobbyCode').textContent = d.code; $('lobbyLink').textContent = ART_URL + '#' + d.code;
  $('lobbyLabel').textContent = 'LOBBY · ' + STAGE_WORDS[d.stage] + ' · first to ' + d.goal + (d.record ? ' · taped' : ' · not taped');
  var ul = $('lobbyPlayers'); ul.innerHTML = '';
  d.players.forEach(function (p) { var li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('span'); a.textContent = p.name + (p.id === d.host ? ' · host' : '') + (p.id === NET.uid ? ' (you)' : ''); b.textContent = SKINS[p.skin] ? SKINS[p.skin].name : ''; li.appendChild(a); li.appendChild(b); ul.appendChild(li); });
  var hostName = (d.players.find(function (p) { return p.id === d.host; }) || {}).name || 'the host';
  $('lobbyNote').textContent = meIdx < 0 ? 'You are watching this table.' : NET.host ? (d.players.length < 2 ? 'Waiting for at least one more phone…' : d.players.length + ' phones in. Start when everyone is here.') : 'Waiting for ' + hostName + ' to start…';
  $('btnLobbyStart').hidden = !(NET.host && d.players.length >= 2);
  renderSaveNudge();
}
$('btnLobbyStart').addEventListener('click', function () { var d = NET.state; if (!d) return; sfx('tap'); roomRef(d.code).update({ status: 'playing', turn: 0, pts: d.players.map(function () { return 0; }), seq: 0, started: iso() }).catch(noWrite); });
$('btnLobbyLeave').addEventListener('click', function () { netLeave(); M = null; show('home'); });
function copyText(t) {
  return new Promise(function (res, rej) {
    function legacy() {
      try { var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'; document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, t.length); var ok = document.execCommand('copy'); document.body.removeChild(ta); ok ? res() : rej(); } catch (e) { rej(e); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(t).then(res).catch(legacy); else legacy();
  });
}
function copyLobbyLink() {
  var link = $('lobbyLink').textContent, b = $('btnCopy');
  copyText(link).then(function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy link'; }, 1500); })
    .catch(function () { try { window.prompt('Press and hold, select all, then copy:', link); } catch (e) {} });
}
$('btnCopy').addEventListener('click', copyLobbyLink);
$('lobbyLink').addEventListener('click', copyLobbyLink);
if (navigator.share) $('btnShare').hidden = false;
$('btnShare').addEventListener('click', function () {
  var link = $('lobbyLink').textContent, code = $('lobbyCode').textContent;
  try { navigator.share({ title: 'No Cap', text: 'Join my No Cap table. Code ' + code + ':', url: link }).catch(function () {}); } catch (e) { copyLobbyLink(); }
});

/* ----- saving the video (downloads capability) ----- */
function recSave() {
  if (REC.rec) { REC.saveQueued = true; recStop(false); return; }
  if (!REC.blob) { toast('No video to save yet.'); return; }
  if (!NET.dl) {
    if (!IN_CLAUDE) { try { var a = document.createElement('a'), u = URL.createObjectURL(REC.blob); a.href = u; a.download = recFile(); document.body.appendChild(a); a.click(); setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(u); }, 4000); REC.saved = true; renderSaveNudge(); toast('Saving ' + recFile()); } catch (e) { toast('Could not save the video here.'); } return; }
    toast('Saving files is not available in this viewer. Use your phone\'s screen recorder instead.'); return;
  }
  var name = recFile(); $('btnSave').disabled = true; $('btnSaveHome').disabled = true; $('btnSaveLobby').disabled = true;
  NET.dl.save({ filename: name, data: REC.blob }).then(function () { REC.saved = true; renderSaveNudge(); toast('Saved ' + name); }).catch(function (e) {
    var c = e && e.code; if (c === 'declined') return;
    toast(c === 'too_large' ? 'That video is too big to save on this device.' : c === 'rate_limited' ? 'A save prompt is already open.' : c === 'rejected_extension' || c === 'extension_not_enabled' ? 'Video files cannot be saved from this page here.' : 'Could not save the video here.');
  }).finally(function () { $('btnSave').disabled = false; $('btnSaveHome').disabled = false; $('btnSaveLobby').disabled = false; });
}

/* ----- recording local games (vs the kids, pass the phone) ----- */
function netRecordStart() {
  M.code = ''; if (!NET.db || !S.rec || NET.canWrite === false) return;
  var code = newCode(); M.code = code;
  roomRef(code).set({ code: code, host: NET.uid, created: iso(), status: 'playing', mode: M.mode, stage: M.stageId, venue: M.venue, goal: M.goal, record: true, players: M.players.map(function (p) { return { id: p.id, name: p.name, skin: p.skin }; }), pts: M.pts.slice(), turn: 0, seq: 0, winner: -1, next: '' }).catch(function (e) { noWrite(e); M.code = ''; });
}
function netRecordQuit() { if (NET.db && M && M.code && !M.done && (M.mode === 'ladder' || M.mode === 'two')) roomRef(M.code).update({ status: 'closed' }).catch(function () {}); }
function netRecordEnd(w) { if (!NET.db || !M.code) return; var m = M; roomRef(M.code).update({ status: 'done', winner: w, pts: M.pts.slice(), seq: M.seq, ended: iso() }).then(function () { tapeIndex({ code: m.code, created: m.createdAt || iso(), mode: m.mode, stage: m.stageId, venue: m.venue, goal: m.goal, players: m.players }, m.pts.slice(), w); }).catch(noWrite); }
/* the shelf: one small document per recorded game, ordered by time (a single-field order needs no index anywhere) */
function tapeIndex(d, pts, w) { if (!NET.db) return; NET.db.doc('tapes/' + d.code).set({ code: d.code, created: d.created || iso(), mode: d.mode || 'link', stage: d.stage, venue: d.venue || 'cafeteria', goal: d.goal, players: (d.players || []).map(function (p) { return { id: p.id, name: p.name, skin: p.skin }; }), pts: pts, winner: w, flips: (M && M.code === d.code) ? M.seq : 0 }).catch(function () {}); }

/* ----- tapes ----- */
async function loadTapes(force) {
  var ul = $('tapes'); if (!force && Date.now() - NET.tapesAt < 15000) return; NET.tapesAt = Date.now();
  if (!NET.db) { ul.innerHTML = '<li class="note">Tapes appear here once play by link is set up.</li>'; return; }
  var snap; try { snap = await NET.db.collection('tapes').orderBy('created', 'desc').limit(12).get(); } catch (e) { ul.innerHTML = '<li class="note"></li>'; ul.firstChild.textContent = 'Could not load tapes. ' + dbErr(e); return; }
  if (snap.empty) { ul.innerHTML = '<li class="note">No tapes yet. Every game you play goes here.</li>'; return; }
  ul.innerHTML = '';
  snap.docs.forEach(function (doc) {
    var d = doc.data(), li = document.createElement('li'), b = document.createElement('button'); b.className = 'tape';
    var t = document.createElement('div'); var tt = document.createElement('div'); tt.className = 't'; tt.textContent = (d.players || []).map(function (p) { return p.name; }).join(' vs ');
    var s = document.createElement('div'); s.className = 's'; s.textContent = fmtDate(d.created) + ' · ' + (STAGE_WORDS[d.stage] || '') + ' · first to ' + d.goal + ' · final ' + (d.pts || []).join('–') + (d.mode === 'ladder' ? ' · vs the table' : d.mode === 'two' ? ' · one phone' : ' · by link');
    t.appendChild(tt); t.appendChild(s); var r = document.createElement('div'); r.className = 'rec'; r.textContent = 'PLAY';
    b.appendChild(t); b.appendChild(r); b.addEventListener('click', function () { tapeOpen(d.code, d); }); li.appendChild(b); ul.appendChild(li);
  });
}
async function tapeOpen(code, d) {
  if (!NET.db) return;
  try {
    if (!d) { var s = await roomRef(code).get(); if (!s.exists) { toast('No tape with that code.'); return; } d = s.data(); }
    var ts = await throwsRef(code).orderBy('seq').get();
    openMatch({ mode: 'tape', players: d.players, stageId: d.stage, venue: d.venue, goal: d.goal, code: code, when: fmtDate(d.created) });
    M.tape = ts.docs.map(function (x) { return x.data(); }); M.tapeWinner = typeof d.winner === 'number' ? d.winner : -1;
    if (!M.tape.length) { $('epLine').textContent = 'This tape is empty (the game was not recorded, or no one flipped).'; }
  } catch (e) { toast('Could not load that tape.'); }
}
function tapePlay() {
  var i = 0, id = M.id;
  var step = function () {
    if (!M || M.id !== id || M.mode !== 'tape' || M.done) return;
    if (i >= M.tape.length) { endMatch(M.tapeWinner >= 0 ? M.tapeWinner : leaderIdx()); return; }
    var t = M.tape[i++]; M.turn = t.p; M.seq = t.seq; updateHud(); setHint('<b>' + esc(M.players[t.p].name) + '</b> · flip ' + t.seq + ' of ' + M.tape.length);
    var r = score(t.o, t.p, false); M.busy = true;
    present(t.o, t.p, r, decTrail(t.tr), t.skin, false, function () { M.busy = false; setTimeout(step, 400); });
  };
  step();
}

/* ---------- boot ---------- */
function start(hot) {
  load(); if (S.bottles.indexOf(S.active) < 0) S.active = S.bottles[0];
  show('home');
  netInit().then(function () { renderLinkNote(); loadTapes(true); var h = (location.hash || '').replace('#', ''); if (/^[A-Za-z0-9]{5}$/.test(h)) openCode(h); });
}
window.addEventListener('hashchange', function () { var h = (location.hash || '').replace('#', ''); if (/^[A-Za-z0-9]{5}$/.test(h)) openCode(h); });
var _show = show; show = function (id) { _show(id); if (id === 'home') loadTapes(false); };
try { if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(function () { return { screen: current === 'match' ? 'home' : current }; }); } catch (e) {}
if (typeof Matter === 'undefined') { document.querySelector('.hero p').textContent = 'The physics library did not load. Check your connection and reload.'; }
(window.claude && window.claude.hot && window.claude.hot.ready) ? window.claude.hot.ready(start) : start((window.claude && window.claude.hot && window.claude.hot.data) || {});
