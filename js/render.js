/* ---------- rendering ---------- */
var cv = $('cv'), ctx = cv.getContext('2d'), DPR = 2; /* fixed: the canvas backing store is 1080×1920, which is what the video records */
cv.width = NC.W * DPR; cv.height = NC.H * DPR;
var R = { stageId: 'table', state: 'idle', thr: null, pose: null, skin: 'tap', aim: null, replay: null, acc: 0, last: 0, board: null, surfaceY: NC.TABLE_Y, camY: 0 };

/* speckled laminate, drawn once */
var lam = document.createElement('canvas'); lam.width = 120; lam.height = 120;
(function () { var c = lam.getContext('2d'); c.fillStyle = '#d9c69d'; c.fillRect(0, 0, 120, 120); var cols = ['#c9b283', '#e8d8b4', '#b89b66', '#f0e4c8'];
  for (var i = 0; i < 260; i++) { c.fillStyle = cols[i % 4]; c.globalAlpha = .7; c.fillRect(Math.random() * 120, Math.random() * 120, 1 + Math.random() * 2, 1 + Math.random() * 1.5); } })();
var lamPat = null;

function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

/* ---------- venues: where in the school you are flipping ---------- */
var VENUES = {
  cafeteria: { name: 'Cafeteria', seat: 'stool', top: 'lam', floor: '#b9b3a7', floorLine: '#8f897d', wallTop: '#cfe0d1' },
  classroom: { name: 'Classroom', seat: 'chair', top: 'wood', floor: '#d8d2c0', floorLine: '#a79f8a', wallTop: '#e8dfc7' },
  restroom:  { name: 'Restroom', seat: 'bin', top: 'counter', floor: '#c4ccd0', floorLine: '#8e999f', wallTop: '#dbe8ee' },
  gym:       { name: 'Gym', seat: 'ball', top: 'bench', floor: '#c98b4d', floorLine: '#8c5a2b', wallTop: '#e9c35a' },
  hallway:   { name: 'Hallway', seat: 'none', top: 'bench', floor: '#c9c4b6', floorLine: '#938d7d', wallTop: '#d9d6c8' },
  outside:   { name: 'Outside', seat: 'none', top: 'picnic', floor: '#6f7378', floorLine: '#4d5156', wallTop: '#7fc1ee' }
};
var VENUE_ORDER = ['cafeteria', 'classroom', 'restroom', 'gym', 'hallway', 'outside'];
var VENUE_WORDS = { cafeteria: 'the cafeteria', classroom: 'the classroom', restroom: 'the restroom', gym: 'the gym', hallway: 'the hallway', outside: 'outside by the fence' };

function blocks(fill, line, y0, y1, bh, bw) {
  ctx.fillStyle = fill; ctx.fillRect(0, y0, NC.W, y1 - y0); ctx.strokeStyle = line; ctx.lineWidth = 2;
  for (var y = y0; y < y1; y += bh) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(NC.W, y); ctx.stroke(); var off = Math.round((y - y0) / bh) % 2 ? bw / 2 : 0; for (var x = off; x < NC.W; x += bw) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(y + bh, y1)); ctx.stroke(); } }
}
function tiles(fill, line, y0, y1, s) {
  ctx.fillStyle = fill; ctx.fillRect(0, y0, NC.W, y1 - y0); ctx.strokeStyle = line; ctx.lineWidth = 1.5;
  for (var y = y0; y <= y1; y += s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(NC.W, y); ctx.stroke(); }
  for (var x = 0; x <= NC.W; x += s) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
}
function paper(x, y, w, h, col, rot) { ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.fillStyle = col; ctx.fillRect(0, 0, w, h); ctx.fillStyle = 'rgba(30,42,35,.35)'; for (var i = 0; i < Math.floor(h / 8) - 1; i++) ctx.fillRect(5, 8 + i * 8, w - 10 - (i % 3) * 6, 2); ctx.fillStyle = '#d9342b'; ctx.beginPath(); ctx.arc(w / 2, 3, 2.5, 0, 7); ctx.fill(); ctx.restore(); }
function sign(title, lines, head, tx) {
  ctx.save(); ctx.translate(36, 60); ctx.rotate(-0.02); ctx.fillStyle = '#fbf7ec'; ctx.fillRect(0, 0, 150, 190); ctx.fillStyle = head; ctx.fillRect(0, 0, 150, 34);
  ctx.fillStyle = tx || '#fff'; ctx.font = '700 15px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(title, 75, 23, 140);
  ctx.fillStyle = '#1e2a23'; ctx.font = '500 12px Fredoka, sans-serif'; lines.forEach(function (t, i) { ctx.fillText(t, 75, 70 + i * 24, 138); });
  ctx.strokeStyle = head; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(75, 150, 18, 0, 7); ctx.stroke(); ctx.restore();
}
/* the classic school wall clock: round, black rim, wire cage over the face; here it is also the match stopwatch */
function cagedClock(cx, cy) {
  var ce = R.clockStart ? ((R.clockEnd || performance.now()) - R.clockStart) / 1000 : 0, cm = Math.floor(ce / 60), cs = Math.floor(ce % 60);
  ctx.save(); ctx.translate(cx, cy);
  ctx.fillStyle = '#1e2a23'; ctx.beginPath(); ctx.arc(0, 0, 38, 0, 7); ctx.fill();
  ctx.fillStyle = '#fbf7ec'; ctx.beginPath(); ctx.arc(0, 0, 33, 0, 7); ctx.fill();
  ctx.strokeStyle = '#1e2a23'; ctx.lineWidth = 2; for (var k = 0; k < 12; k++) { var ta = k * Math.PI / 6; ctx.beginPath(); ctx.moveTo(Math.sin(ta) * 26, -Math.cos(ta) * 26); ctx.lineTo(Math.sin(ta) * 31, -Math.cos(ta) * 31); ctx.stroke(); }
  var sa = (ce % 60) / 60 * Math.PI * 2, ha = ce / 3600 * Math.PI * 2;
  ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(ha) * 15, -Math.cos(ha) * 15); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = '#d9342b'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(sa) * 28, -Math.cos(sa) * 28); ctx.stroke();
  ctx.fillStyle = '#1e2a23'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
  /* wire cage: rings and a mesh of curves over the glass */
  ctx.strokeStyle = 'rgba(70,76,82,.85)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(0, 0, 41, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 27, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.stroke();
  for (var j = 0; j < 8; j++) { var wa = j * Math.PI / 4; ctx.beginPath(); ctx.moveTo(Math.sin(wa) * 13, -Math.cos(wa) * 13); ctx.lineTo(Math.sin(wa) * 41, -Math.cos(wa) * 41); ctx.stroke(); }
  ctx.fillStyle = '#6c737b'; for (var m = 0; m < 4; m++) { var ba = m * Math.PI / 2 + Math.PI / 4; ctx.fillRect(Math.sin(ba) * 41 - 3, -Math.cos(ba) * 41 - 3, 6, 6); }
  ctx.fillStyle = '#1e2a23'; ctx.fillRect(-34, 50, 68, 26); ctx.fillStyle = '#6fe09a'; ctx.font = '22px "Luckiest Guy", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.fillText(cm + ':' + (cs < 10 ? '0' : '') + cs, 0, 71);
  ctx.restore();
}
var BG = {
  cafeteria: function () {
    blocks('#cfe0d1', 'rgba(80,110,90,.22)', 0, 440, 48, 96);
    ctx.fillStyle = 'rgba(70,120,90,.42)'; ctx.fillRect(0, 440, NC.W, 500); blocks('rgba(70,120,90,.42)', 'rgba(60,100,75,.25)', 444, NC.FLOOR_Y, 48, 96);
    ctx.fillStyle = '#5e8f72'; ctx.fillRect(0, 436, NC.W, 8);
    /* menu board */
    ctx.fillStyle = '#25312b'; ctx.fillRect(210, 44, 190, 96); ctx.strokeStyle = '#a98e5c'; ctx.lineWidth = 6; ctx.strokeRect(210, 44, 190, 96);
    ctx.fillStyle = '#f4f1e6'; ctx.font = '700 15px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText("TODAY'S LUNCH", 305, 68); ctx.font = '500 13px Fredoka, sans-serif'; ['Pizza (rectangle)', 'Tater tots', 'Chocolate milk'].forEach(function (t, i) { ctx.fillText(t, 305, 90 + i * 17); });
    /* trash can, mascot banner */
    ctx.fillStyle = '#4a4f55'; ctx.fillRect(480, 840, 44, 90); ctx.fillStyle = '#6c737b'; ctx.fillRect(476, 834, 52, 10);
  },
  classroom: function () {
    blocks('#e8dfc7', 'rgba(150,130,90,.2)', 0, 440, 48, 96);
    ctx.fillStyle = '#7b9ab8'; ctx.fillRect(0, 440, NC.W, NC.FLOOR_Y - 440); ctx.fillStyle = '#5d7b99'; ctx.fillRect(0, 436, NC.W, 8);
    /* whiteboard with a Do Now */
    ctx.fillStyle = '#f7f9fa'; ctx.fillRect(210, 50, 190, 112); ctx.strokeStyle = '#9aa4ab'; ctx.lineWidth = 6; ctx.strokeRect(210, 50, 190, 112); ctx.fillStyle = '#9aa4ab'; ctx.fillRect(210, 160, 190, 8);
    ctx.fillStyle = '#2a5bd7'; ctx.font = '700 15px Fredoka, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('DO NOW:', 222, 76); ctx.fillStyle = '#1e2a23'; ctx.font = '500 13px Fredoka, sans-serif'; ctx.fillText('1. Phones in the caddy', 222, 98); ctx.fillText('2. Open your Chromebook', 222, 118); ctx.fillText('3. Quiz at 10:15', 222, 138);
    ctx.fillStyle = '#d9342b'; ctx.fillRect(330, 152, 26, 5); ctx.fillStyle = '#2a5bd7'; ctx.fillRect(360, 152, 22, 5);
    /* cubbies / bookshelf along the lower wall */
    for (var i = 0; i < 5; i++) { ctx.fillStyle = '#b89463'; ctx.fillRect(30 + i * 100, 470, 90, 120); ctx.fillStyle = '#8c6c3f'; ctx.fillRect(34 + i * 100, 474, 82, 52); ctx.fillRect(34 + i * 100, 532, 82, 52); var cols = ['#d9342b', '#2a5bd7', '#2f9e5b', '#f4b41b']; for (var b = 0; b < 4; b++) { ctx.fillStyle = cols[(i + b) % 4]; ctx.fillRect(40 + i * 100 + b * 18, 482 + (b % 2) * 6, 13, 38 - (b % 2) * 6); ctx.fillRect(40 + i * 100 + b * 18, 540, 13, 36); } }
    /* flag by the door */
    ctx.fillStyle = '#6c737b'; ctx.fillRect(498, 170, 4, 90); ctx.fillStyle = '#fbf7ec'; ctx.fillRect(458, 176, 40, 26); ctx.fillStyle = '#d9342b'; for (var s = 0; s < 4; s++) ctx.fillRect(458, 176 + s * 7, 40, 3.5); ctx.fillStyle = '#2a4b9b'; ctx.fillRect(458, 176, 18, 14);
  },
  restroom: function () {
    tiles('#dbe8ee', 'rgba(110,140,155,.35)', 0, 440, 36);
    ctx.fillStyle = '#4c8ca6'; ctx.fillRect(0, 436, NC.W, 8);
    /* stall partitions with the gap under the door */
    for (var i = 0; i < 4; i++) { var x = 14 + i * 134; ctx.fillStyle = '#5d9bb3'; ctx.fillRect(x, 444, 120, 396); ctx.fillStyle = '#4a8299'; ctx.fillRect(x, 444, 120, 8); ctx.fillStyle = '#3d6e83'; ctx.fillRect(x + 100, 560, 8, 24); ctx.fillStyle = '#d6dde0'; ctx.fillRect(x + 8, 454, 6, 386); }
    tiles('#c4ccd0', 'rgba(100,110,115,.4)', 840, NC.FLOOR_Y, 30);
    /* mirror, soap, paper towels, hand dryer */
    ctx.fillStyle = '#e9f4f8'; ctx.fillRect(210, 44, 190, 110); ctx.strokeStyle = '#9aa4ab'; ctx.lineWidth = 6; ctx.strokeRect(210, 44, 190, 110); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(240, 140); ctx.lineTo(300, 56); ctx.stroke(); ctx.beginPath(); ctx.moveTo(300, 140); ctx.lineTo(332, 96); ctx.stroke();
    ctx.fillStyle = '#d6dde0'; ctx.fillRect(420, 190, 54, 44); ctx.fillStyle = '#9aa4ab'; ctx.fillRect(432, 226, 30, 6); ctx.fillStyle = '#bfc8cc'; ctx.fillRect(210, 170, 22, 34); ctx.fillStyle = '#6c737b'; ctx.fillRect(216, 164, 10, 7);
  },
  gym: function () {
    blocks('#e9c35a', 'rgba(150,110,20,.22)', 0, 440, 48, 96);
    ctx.fillStyle = '#7a1f2b'; ctx.fillRect(0, 440, NC.W, NC.FLOOR_Y - 440); ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 2; for (var x = 0; x < NC.W; x += 90) { ctx.beginPath(); ctx.moveTo(x, 440); ctx.lineTo(x, NC.FLOOR_Y); ctx.stroke(); } for (var y = 520; y < NC.FLOOR_Y; y += 120) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(NC.W, y); ctx.stroke(); }
    ctx.fillStyle = '#4c1019'; ctx.fillRect(0, 436, NC.W, 8);
    /* championship banners and a hoop */
    function banner(x, y, t1, t2) { ctx.fillStyle = '#7a1f2b'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 80, y); ctx.lineTo(x + 80, y + 108); ctx.lineTo(x + 40, y + 90); ctx.lineTo(x, y + 108); ctx.fill(); ctx.fillStyle = '#e9c35a'; ctx.font = '700 12px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t1, x + 40, y + 34); ctx.font = '22px "Luckiest Guy", "Arial Black", sans-serif'; ctx.fillText(t2, x + 40, y + 62); }
    banner(214, 40, 'STATE', '2019'); banner(304, 40, 'DISTRICT', '2022');
    ctx.fillStyle = '#6c737b'; ctx.fillRect(496, 190, 10, 40); ctx.fillStyle = '#f4f7f8'; ctx.fillRect(468, 150, 64, 46); ctx.strokeStyle = '#9aa4ab'; ctx.lineWidth = 3; ctx.strokeRect(468, 150, 64, 46); ctx.strokeStyle = '#d9342b'; ctx.lineWidth = 3; ctx.strokeRect(486, 172, 28, 20); ctx.strokeStyle = '#e8752a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(500, 202, 18, 5, 0, 0, 7); ctx.stroke();
  },
  hallway: function () {
    blocks('#d9d6c8', 'rgba(130,125,100,.22)', 0, 440, 48, 96);
    var cols = ['#2f6fb0', '#2f6fb0', '#3b78b8'];
    for (var i = 0; i < 8; i++) { var x = 6 + i * 66; ctx.fillStyle = cols[i % 3]; ctx.fillRect(x, 440, 62, NC.FLOOR_Y - 440); ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(x + 59, 440, 3, NC.FLOOR_Y - 440); ctx.fillStyle = 'rgba(255,255,255,.28)'; for (var v = 0; v < 4; v++) ctx.fillRect(x + 12, 462 + v * 6, 38, 2); ctx.fillStyle = '#c8ccd0'; ctx.fillRect(x + 46, 600, 5, 22); ctx.fillStyle = '#1e2a23'; ctx.fillRect(x + 22, 560, 16, 6); }
    ctx.fillStyle = '#245a92'; ctx.fillRect(0, 432, NC.W, 10);
    /* bulletin board of flyers, exit sign */
    ctx.fillStyle = '#b8935a'; ctx.fillRect(206, 44, 200, 130); ctx.fillStyle = '#d9c293'; ctx.fillRect(212, 50, 188, 118);
    paper(222, 60, 44, 54, '#fbf7ec', -0.06); paper(274, 58, 40, 46, '#f4b41b', 0.05); paper(322, 62, 46, 58, '#9ad2e8', -0.03); paper(236, 120, 48, 40, '#ffb4c2', 0.04); paper(296, 114, 44, 44, '#fbf7ec', -0.05);
    ctx.fillStyle = '#d9342b'; ctx.fillRect(470, 200, 56, 22); ctx.fillStyle = '#fff'; ctx.font = '700 13px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('EXIT', 498, 216);
  },
  outside: function () {
    var g = ctx.createLinearGradient(0, 0, 0, 440); g.addColorStop(0, '#7fc1ee'); g.addColorStop(1, '#cfe9f7'); ctx.fillStyle = g; ctx.fillRect(0, 0, NC.W, 440);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; [[80, 90, 34], [150, 78, 26], [380, 150, 30], [430, 138, 22]].forEach(function (c) { ctx.beginPath(); ctx.arc(c[0], c[1], c[2], 0, 7); ctx.arc(c[0] + c[2], c[1] + 6, c[2] * .8, 0, 7); ctx.arc(c[0] - c[2] * .8, c[1] + 8, c[2] * .7, 0, 7); ctx.fill(); });
    /* school brick wall */
    ctx.fillStyle = '#a94f3a'; ctx.fillRect(0, 300, NC.W, 140); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 2; for (var y = 300; y < 440; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(NC.W, y); ctx.stroke(); for (var x = (y / 14) % 2 ? 0 : 14; x < NC.W; x += 28) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 14); ctx.stroke(); } }
    ctx.fillStyle = '#d8d2c2'; ctx.fillRect(0, 294, NC.W, 8);
    /* asphalt court with painted lines */
    ctx.fillStyle = '#6f7378'; ctx.fillRect(0, 440, NC.W, NC.FLOOR_Y - 440); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 520); ctx.lineTo(NC.W, 520); ctx.stroke(); ctx.beginPath(); ctx.arc(270, 520, 90, 0, Math.PI); ctx.stroke();
    /* chain-link fence */
    ctx.strokeStyle = 'rgba(70,76,82,.8)'; ctx.lineWidth = 1.4; for (var d = -440; d < NC.W + 440; d += 22) { ctx.beginPath(); ctx.moveTo(d, 440); ctx.lineTo(d + 400, 840); ctx.stroke(); ctx.beginPath(); ctx.moveTo(d + 400, 440); ctx.lineTo(d, 840); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, NC.W, 440); ctx.clip(); ctx.restore();
    ctx.fillStyle = '#6c737b'; ctx.fillRect(0, 436, NC.W, 10); ctx.fillRect(0, 836, NC.W, 10); [0, 270, 528].forEach(function (x) { ctx.fillRect(x, 436, 12, 410); });
    ctx.fillStyle = '#1e2a23'; ctx.fillStyle = '#fbf7ec'; ctx.fillRect(210, 330, 170, 52); ctx.fillStyle = '#2a5bd7'; ctx.fillRect(210, 330, 170, 14); ctx.fillStyle = '#fff'; ctx.font = '700 11px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('WILDCAT HIGH', 295, 341); ctx.fillStyle = '#1e2a23'; ctx.font = '700 12px Fredoka, sans-serif'; ctx.fillText('PICTURE DAY FRIDAY', 295, 364);
  }
};
var SIGN = {
  cafeteria: ['WASH YOUR HANDS', ['20 seconds.', 'Yes, every time.', 'Yes, you.'], '#2a5bd7'],
  classroom: ['BE RESPECTFUL', ['Be responsible.', 'Be safe.', 'Phones away.'], '#2f9e5b'],
  restroom: ['WASH YOUR HANDS', ['20 seconds.', 'Soap. Water. Done.', 'No vaping.'], '#2a5bd7'],
  gym: ['GO WILDCATS', ['Dress code: PE', 'Sneakers only.', 'Hydrate.'], '#7a1f2b', '#e9c35a'],
  hallway: ['HALL PASS', ['Required in halls.', 'Tardy bell: 8:05.', 'No running.'], '#d9342b'],
  outside: ['BUS LANE', ['Wait behind the line.', 'Stay off the fence.', 'Bell rings at 3:10.'], '#f4b41b', '#1e2a23']
};
function tableTop(v, t0, t1, TY) {
  var tw = t1 - t0, top = VENUES[v].top;
  if (top === 'lam') { if (!lamPat) lamPat = ctx.createPattern(lam, 'repeat'); ctx.fillStyle = lamPat; ctx.fillRect(t0, TY, tw, 28); }
  else if (top === 'wood') { ctx.fillStyle = '#c99d62'; ctx.fillRect(t0, TY, tw, 28); ctx.strokeStyle = 'rgba(110,70,30,.35)'; ctx.lineWidth = 1.5; for (var x = t0 + 10; x < t1; x += 34) { ctx.beginPath(); ctx.moveTo(x, TY + 4); ctx.lineTo(x + 18, TY + 4); ctx.moveTo(x + 12, TY + 14); ctx.lineTo(x + 30, TY + 14); ctx.stroke(); } ctx.fillStyle = '#6b4a24'; ctx.fillRect(t0, TY + 22, tw, 6); }
  else if (top === 'counter') { ctx.fillStyle = '#d9dcdd'; ctx.fillRect(t0, TY, tw, 28); ctx.fillStyle = 'rgba(100,100,100,.25)'; for (var i = 0; i < 90; i++) ctx.fillRect(t0 + ((i * 53) % tw), TY + ((i * 17) % 22), 2, 2); ctx.fillStyle = '#9aa4ab'; ctx.fillRect(t0, TY + 22, tw, 6); }
  else if (top === 'bench') { ctx.fillStyle = '#b57b43'; ctx.fillRect(t0, TY, tw, 28); ctx.strokeStyle = 'rgba(70,40,15,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(t0, TY + 9); ctx.lineTo(t1, TY + 9); ctx.moveTo(t0, TY + 19); ctx.lineTo(t1, TY + 19); ctx.stroke(); }
  else { ctx.fillStyle = '#7d8790'; ctx.fillRect(t0, TY, tw, 28); ctx.fillStyle = 'rgba(30,40,45,.45)'; for (var j = 0; j < tw; j += 22) { ctx.fillRect(t0 + j + 4, TY + 6, 12, 4); ctx.fillRect(t0 + j + 4, TY + 16, 12, 4); } }
  var g = ctx.createLinearGradient(0, TY + 22, 0, TY + 28); g.addColorStop(0, 'rgba(232,232,232,.9)'); g.addColorStop(.5, 'rgba(138,143,149,.9)'); g.addColorStop(1, 'rgba(216,216,216,.9)');
  ctx.fillStyle = g; ctx.fillRect(t0, TY + 22, tw, 6); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(t0, TY, tw, 2);
}
function tableProp(v, t0, TY) {
  var x = t0 + 18;
  if (v === 'cafeteria') { ctx.fillStyle = '#fbf7ec'; ctx.fillRect(x, TY - 46, 30, 46); ctx.fillStyle = '#2a5bd7'; ctx.fillRect(x, TY - 46, 30, 12); ctx.beginPath(); ctx.moveTo(x, TY - 46); ctx.lineTo(x + 15, TY - 58); ctx.lineTo(x + 30, TY - 46); ctx.fill(); }
  else if (v === 'classroom') { ctx.fillStyle = '#2a5bd7'; ctx.fillRect(x, TY - 34, 26, 34); ctx.strokeStyle = '#f4b41b'; ctx.lineWidth = 4; [[6, -48], [13, -52], [20, -46]].forEach(function (p, i) { ctx.strokeStyle = ['#f4b41b', '#d9342b', '#2f9e5b'][i]; ctx.beginPath(); ctx.moveTo(x + p[0], TY - 34); ctx.lineTo(x + p[0] + 2, TY + p[1]); ctx.stroke(); }); }
  else if (v === 'restroom') { ctx.fillStyle = '#f2f4f5'; ctx.fillRect(x, TY - 36, 22, 36); ctx.fillStyle = '#9aa4ab'; ctx.fillRect(x + 8, TY - 46, 6, 10); ctx.fillRect(x + 8, TY - 48, 18, 4); }
  else if (v === 'gym') { ctx.fillStyle = '#e8752a'; ctx.beginPath(); ctx.moveTo(x + 15, TY - 54); ctx.lineTo(x + 34, TY); ctx.lineTo(x - 4, TY); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(x + 6, TY - 30, 18, 6); }
  else if (v === 'hallway') { ctx.fillStyle = '#d9342b'; rr(x - 4, TY - 50, 40, 50, 8); ctx.fill(); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - 4, TY - 28, 40, 4); ctx.fillStyle = '#f4b41b'; ctx.fillRect(x + 8, TY - 38, 16, 6); }
  else { ctx.fillStyle = '#b8935a'; rr(x, TY - 32, 30, 32, 4); ctx.fill(); ctx.fillStyle = '#fbf7ec'; ctx.fillRect(x + 8, TY - 38, 14, 8); }
}
function seatProp(v, t0, TY) {
  if (v === 'stool') drawStool(100, 790, 100, '#d9342b', t0 + 40);
  else if (v === 'chair') { ctx.fillStyle = '#d9342b'; rr(70, 760, 78, 14, 6); ctx.fill(); ctx.fillRect(70, 700, 10, 66); ctx.fillStyle = '#b72a22'; rr(66, 690, 18, 52, 6); ctx.fill(); ctx.strokeStyle = '#6c737b'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(78, 774); ctx.lineTo(78, NC.FLOOR_Y); ctx.moveTo(140, 774); ctx.lineTo(140, NC.FLOOR_Y); ctx.stroke(); }
  else if (v === 'bin') { ctx.fillStyle = '#4a4f55'; ctx.fillRect(80, 820, 50, 110); ctx.fillStyle = '#6c737b'; ctx.fillRect(76, 814, 58, 10); }
  else if (v === 'ball') { ctx.fillStyle = '#e8752a'; ctx.beginPath(); ctx.arc(110, 902, 28, 0, 7); ctx.fill(); ctx.strokeStyle = '#4c1d0a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(110, 902, 28, 0, 7); ctx.moveTo(82, 902); ctx.lineTo(138, 902); ctx.moveTo(110, 874); ctx.lineTo(110, 930); ctx.stroke(); }
}
function drawRoom(st) {
  var W = NC.W, H = NC.H, TY = NC.TABLE_Y, vn = VENUES[R.venue] ? R.venue : 'cafeteria', V = VENUES[vn];
  BG[vn]();
  /* floor strip */
  ctx.fillStyle = V.floor; ctx.fillRect(0, NC.FLOOR_Y, W, H - NC.FLOOR_Y); ctx.fillStyle = V.floorLine; ctx.fillRect(0, NC.FLOOR_Y, W, 4);
  cagedClock(456, 112);
  var sg = SIGN[vn]; sign(sg[0], sg[1], sg[2], sg[3]);
  /* table legs, apron */
  var t0 = st.table[0], t1 = st.table[1], tw = t1 - t0;
  ctx.fillStyle = '#4a4f55'; ctx.fillRect(t0 + 6, TY + 28, tw - 12, 10);
  ctx.strokeStyle = '#6c737b'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(t0 + 40, TY + 38); ctx.lineTo(t0 + 70, NC.FLOOR_Y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(t1 - 40, TY + 38); ctx.lineTo(t1 - 70, NC.FLOOR_Y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(t0 + 40, TY + 38); ctx.lineTo(t0 + 10, NC.FLOOR_Y); ctx.stroke();
  seatProp(V.seat, t0, TY);
  tableTop(vn, t0, t1, TY); tableProp(vn, t0, TY);
  /* platforms */
  st.platforms.forEach(function (p) {
    if (p.kind === 'tray') { ctx.fillStyle = '#c9b08a'; rr(p.x - 2, p.y - 12, p.w + 4, p.h + 12, 5); ctx.fill(); ctx.fillStyle = '#e4d1ad'; ctx.fillRect(p.x + 6, p.y - 4, p.w - 12, 4); ctx.fillStyle = '#a98e5c'; ctx.fillRect(p.x + 60, p.y - 8, 3, 8); ctx.fillRect(p.x + 115, p.y - 8, 3, 8); }
    else if (p.kind === 'books') { var cols = ['#d9342b', '#2a5bd7', '#2f9e5b'], n = 3, bh = p.h / n; for (var i = 0; i < n; i++) { var by = p.y + i * bh, sh = (i % 2) * 6; ctx.fillStyle = cols[i]; rr(p.x + sh, by, p.w - sh * 2, bh, 3); ctx.fill(); ctx.fillStyle = '#fbf7ec'; ctx.fillRect(p.x + sh + 10, by + 3, p.w - sh * 2 - 14, bh - 6); ctx.fillStyle = cols[i]; ctx.fillRect(p.x + sh + 10, by + 3, 4, bh - 6); } }
    else if (p.kind === 'stool') { drawStool(p.x + p.w / 2, p.y, p.w, '#2a5bd7', st.table[1] - 40); }
  });
}
function drawStool(cx, top, w, col, postX) {
  ctx.strokeStyle = '#6c737b'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(postX, NC.TABLE_Y + 38); ctx.lineTo(cx, top + 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, top + 10); ctx.lineTo(cx, NC.FLOOR_Y); ctx.stroke();
  ctx.fillStyle = col; rr(cx - w / 2, top, w, 16, 8); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(cx - w / 2 + 6, top + 3, w - 12, 4, 2); ctx.fill();
}

function drawBottle(x, y, a, skinId, flying) {
  var sk = SKINS[skinId], s = NC.BOTTLES[sk.type], w = s.w, h = s.h;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  /* shadow of the handle / body outline */
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#1e2a23';
  if (sk.handle) { ctx.beginPath(); ctx.moveTo(w / 2, -16); ctx.bezierCurveTo(w / 2 + 22, -16, w / 2 + 22, 28, w / 2, 28); ctx.lineWidth = 7; ctx.strokeStyle = '#1e2a23'; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = sk.label; ctx.stroke(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#1e2a23'; }
  var body = new Path2D();
  body.moveTo(-w / 2, h / 2 - 4); body.quadraticCurveTo(-w / 2, h / 2, -w / 2 + 4, h / 2); body.lineTo(w / 2 - 4, h / 2); body.quadraticCurveTo(w / 2, h / 2, w / 2, h / 2 - 4);
  body.lineTo(w / 2, -h / 2 + 16); body.quadraticCurveTo(w / 2, -h / 2 + 4, s.capW / 2 + 1, -h / 2 + 1); body.lineTo(-s.capW / 2 - 1, -h / 2 + 1); body.quadraticCurveTo(-w / 2, -h / 2 + 4, -w / 2, -h / 2 + 16); body.closePath();
  if (sk.metal) { var mg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); mg.addColorStop(0, sk.label); mg.addColorStop(.35, '#fff'); mg.addColorStop(.6, sk.body); mg.addColorStop(1, sk.label); ctx.fillStyle = mg; }
  else ctx.fillStyle = sk.body;
  ctx.fill(body);
  if (!sk.metal && sk.liquid) {
    ctx.save(); ctx.clip(body);
    var d = (h / 2 - s.fill * h) * Math.abs(Math.cos(a)) + (w / 2 - s.fill * w) * Math.abs(Math.sin(a));
    ctx.rotate(-a); ctx.fillStyle = sk.liquid; ctx.fillRect(-120, d, 240, 240);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-120, d, 240, 2);
    if (sk.glitter) { ctx.fillStyle = '#fff'; for (var i = 0; i < 14; i++) { var gx = ((i * 37) % 24) - 12, gy = d + 4 + ((i * 53) % 40); ctx.fillRect(gx, gy, 2, 2); } }
    ctx.restore();
  }
  if (sk.dark) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-w / 2 + 3, -h / 2 + 10, 4, h - 20); }
  /* label band */
  ctx.fillStyle = sk.label; ctx.fillRect(-w / 2, -6, w, sk.metal ? 10 : 20);
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(-w / 2 + 5, 0, w - 10, sk.metal ? 3 : 6);
  if (sk.type === 'water') { for (var k = 0; k < 4; k++) { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-w / 2 + 2, 14 + k * 9); ctx.lineTo(w / 2 - 2, 14 + k * 9); ctx.stroke(); } }
  ctx.lineWidth = 2.5; ctx.strokeStyle = '#1e2a23'; ctx.stroke(body);
  /* cap */
  ctx.fillStyle = sk.cap; rr(-s.capW / 2, -h / 2 - s.capH, s.capW, s.capH + 1, 2); ctx.fill(); ctx.stroke();
  if (sk.type === 'tumbler') { ctx.strokeStyle = '#1e2a23'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(4, -h / 2 - s.capH); ctx.lineTo(8, -h / 2 - s.capH - 22); ctx.stroke(); ctx.strokeStyle = sk.label; ctx.lineWidth = 1.5; ctx.stroke(); }
  /* highlight */
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-w / 2 + 5, -h / 2 + 14); ctx.lineTo(-w / 2 + 5, h / 2 - 12); ctx.stroke();
  ctx.restore();
}
function drawShadow(x, y, h) {
  var surf = surfaceAt(x), lift = Math.max(0, surf - y - h / 2), k = Math.max(.25, 1 - lift / 420);
  ctx.save(); ctx.globalAlpha = .28 * k; ctx.fillStyle = '#1e2a23'; ctx.beginPath(); ctx.ellipse(x, surf - 1, 22 * k + 6, 5 * k + 1, 0, 0, 7); ctx.fill(); ctx.restore();
}
function surfaceAt(x) {
  var st = NC.STAGES[R.stageId], y = NC.FLOOR_Y;
  if (x >= st.table[0] && x <= st.table[1]) y = NC.TABLE_Y;
  st.platforms.forEach(function (p) { if (p.kind !== 'lip' && x >= p.x && x <= p.x + p.w) y = Math.min(y, p.y); });
  return y;
}
/* on the hang stage the board slides left so the hanging bottle and its rope never cover the score */
function boardX() { return R.stageId === 'hang' ? 175 : NC.W / 2 + 40; }
function boardY() { return R.stageId === 'hang' ? 330 : 360; }
function drawBoard() {
  var b = R.board; if (!b) return;
  if (b.rows) {
    var h = 44 + b.rows.length * 26;
    ctx.save(); ctx.translate(boardX(), boardY()); ctx.rotate(-0.015);
    ctx.fillStyle = '#fbf7ec'; ctx.fillRect(-150, -h / 2, 300, h);
    ctx.fillStyle = 'rgba(244,180,27,.85)'; ctx.fillRect(-120, -h / 2 - 10, 50, 16); ctx.fillRect(70, -h / 2 - 10, 50, 16);
    ctx.font = '700 11px Fredoka, sans-serif'; ctx.fillStyle = '#5a6a5f'; ctx.textAlign = 'center'; ctx.fillText(b.goal, 0, -h / 2 + 22);
    b.rows.forEach(function (r, i) {
      var y = -h / 2 + 44 + i * 26;
      if (r.active) { ctx.fillStyle = 'rgba(217,52,43,.12)'; ctx.fillRect(-140, y - 17, 280, 24); ctx.fillStyle = '#d9342b'; ctx.beginPath(); ctx.moveTo(-134, y - 12); ctx.lineTo(-124, y - 6); ctx.lineTo(-134, y); ctx.fill(); }
      ctx.fillStyle = '#1e2a23'; ctx.font = '700 15px Fredoka, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(r.name, -116, y, 190);
      ctx.textAlign = 'right'; ctx.font = '24px "Luckiest Guy", "Arial Black", sans-serif'; ctx.fillStyle = '#d9342b'; ctx.fillText(String(r.pts), 136, y + 3);
    });
    ctx.restore(); return;
  }
  ctx.save(); ctx.translate(boardX(), boardY()); ctx.rotate(-0.015);
  ctx.fillStyle = '#fbf7ec'; ctx.fillRect(-150, -46, 300, 92);
  ctx.fillStyle = 'rgba(244,180,27,.85)'; ctx.fillRect(-120, -56, 50, 16); ctx.fillRect(70, -56, 50, 16);
  ctx.fillStyle = '#1e2a23'; ctx.font = '700 15px Fredoka, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(b.l, -136, -6, 120); ctx.textAlign = 'right'; ctx.fillText(b.r, 136, -6, 120);
  ctx.textAlign = 'center'; ctx.font = '38px "Luckiest Guy", "Arial Black", sans-serif'; ctx.fillStyle = '#d9342b'; ctx.fillText(b.sl + '  -  ' + b.sr, 0, 36);
  ctx.font = '700 11px Fredoka, sans-serif'; ctx.fillStyle = '#5a6a5f'; ctx.fillText(b.goal, 0, -28);
  ctx.restore();
}
function drawAim() {
  var a = R.aim; if (!a) return;
  var x0 = NC.LAUNCH_X, y0 = NC.TABLE_Y - 10, L = Math.min(240, a.len), ang = a.angle * Math.PI / 180;
  var x1 = x0 + Math.cos(ang) * L, y1 = y0 - Math.sin(ang) * L;
  ctx.save(); ctx.strokeStyle = 'rgba(30,42,35,.55)'; ctx.setLineDash([8, 8]); ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.setLineDash([]); ctx.fillStyle = a.ok ? '#f4b41b' : '#d9342b'; ctx.strokeStyle = '#1e2a23'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x1, y1, 11, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  var st = NC.STAGES[R.stageId];
  var vn = VENUES[R.venue] ? R.venue : 'cafeteria';
  var p = null;
  if (R.state === 'replay' && R.replay) { var fr = R.replay.trail[Math.min(R.replay.trail.length - 1, Math.floor(R.replay.i))]; p = { x: fr[0], y: fr[1], a: fr[2], skin: R.replay.skin }; }
  else if (R.state === 'flight' && R.thr) { var b = R.thr.bottle.parts[1]; p = { x: b.position.x, y: b.position.y, a: R.thr.bottle.angle, skin: R.skin }; }
  else if (R.pose) p = R.pose;
  else p = { x: NC.LAUNCH_X, y: NC.TABLE_Y - NC.BOTTLES[SKINS[R.skin].type].h / 2, a: 0, skin: R.skin };
  /* camera follows the bottle when it's high above the canvas top; lerps back as it falls */
  var MARGIN = 240;
  var target = (R.state === 'flight' || R.state === 'replay') ? Math.max(0, MARGIN - p.y) : 0;
  R.camY += (target - R.camY) * 0.18; if (Math.abs(R.camY - target) < 0.4) R.camY = target;
  /* fill the strip exposed above the room by the camera pan with the venue's wall-top color */
  if (R.camY > 0) { ctx.fillStyle = VENUES[vn].wallTop || '#8fb49a'; ctx.fillRect(0, 0, NC.W, Math.ceil(R.camY) + 1); }
  ctx.save(); ctx.translate(0, R.camY);
  drawRoom(st); drawBoard(); if (st.hang) drawHang();
  drawShadow(p.x, p.y, NC.BOTTLES[SKINS[p.skin].type].h);
  drawBottle(p.x, p.y, p.a, p.skin);
  if (st.hang) drawSplash();
  if (R.state === 'idle') drawAim();
  ctx.restore();
  drawScoreHUD();
  drawStamps(); drawSlate();
}
function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function drawScoreHUD() {
  if (typeof M === 'undefined' || !M || !M.players || !M.players.length || M.done) return;
  if (R.slate) return;
  var pad = 12, cw = NC.W, y = 24;
  if (M.players.length === 2) {
    var h = 60;
    ctx.save();
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#1e2a23';
    roundRect(ctx, pad, y, cw - pad * 2, h, 14); ctx.fill();
    ctx.globalAlpha = 1;
    var left = (M.players[0].name || '').toUpperCase().slice(0, 10);
    var right = (M.players[1].name || '').toUpperCase().slice(0, 10);
    ctx.textBaseline = 'middle';
    ctx.font = '24px "Luckiest Guy", "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'left'; ctx.fillStyle = M.turn === 0 ? '#f4b41b' : '#fbf7ec';
    ctx.fillText(left, pad + 16, y + h / 2, 150);
    ctx.textAlign = 'right'; ctx.fillStyle = M.turn === 1 ? '#f4b41b' : '#fbf7ec';
    ctx.fillText(right, cw - pad - 16, y + h / 2, 150);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fbf7ec';
    ctx.font = '32px "Luckiest Guy", "Arial Black", Impact, sans-serif';
    ctx.fillText(M.pts[0] + ' – ' + M.pts[1], cw / 2, y + h / 2, 160);
    ctx.restore();
  } else {
    var rowH = 22, h2 = M.players.length * rowH + 16;
    ctx.save();
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#1e2a23';
    roundRect(ctx, pad, y, 200, h2, 12); ctx.fill();
    ctx.globalAlpha = 1; ctx.textBaseline = 'middle';
    ctx.font = '16px "Luckiest Guy", "Arial Black", Impact, sans-serif';
    M.players.forEach(function (pl, i) {
      ctx.fillStyle = i === M.turn ? '#f4b41b' : '#fbf7ec';
      var ry = y + 10 + i * rowH + rowH / 2 - 4;
      ctx.textAlign = 'left'; ctx.fillText((pl.name || '').toUpperCase().slice(0, 10), pad + 12, ry, 130);
      ctx.textAlign = 'right'; ctx.fillText(String(M.pts[i]), pad + 190, ry, 30);
    });
    ctx.restore();
  }
}

/* ---------- stamps and slates, drawn on the canvas so they are in the video ---------- */
R.stamps = []; R.slate = null;
try { document.fonts.load('48px "Luckiest Guy"'); document.fonts.load('700 16px Fredoka'); } catch (e) {}
var STAMP_COLORS = { '': '#f4b41b', green: '#6fe09a', red: '#ff5a4e', blue: '#7fb3ff', small: '#fbf7ec' };
function showStamp(text, cls, sub, ms) {
  var parts = (cls || '').split(' ').filter(Boolean), small = parts.indexOf('small') >= 0, color = STAMP_COLORS[parts.filter(function (c) { return c !== 'small'; })[0] || ''] || '#f4b41b';
  if (parts.length === 1 && parts[0] === 'small') color = STAMP_COLORS.small;
  R.stamps = [{ text: text, sub: sub || '', color: color, size: small ? 44 : 78, t0: performance.now(), ms: ms }];
}
function backOut(x) { var c = 1.7016; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); }
function bigText(text, x, y, size, color, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.font = size + 'px "Luckiest Guy", "Arial Black", Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.fillStyle = '#1e2a23'; ctx.fillText(text, 6, 6, 500); ctx.lineWidth = Math.max(4, size * .09); ctx.strokeStyle = '#1e2a23'; ctx.strokeText(text, 0, 0, 500); ctx.fillStyle = color; ctx.fillText(text, 0, 0, 500); ctx.restore();
}
function drawStamps() {
  var now = performance.now();
  R.stamps = R.stamps.filter(function (st) { return now - st.t0 < st.ms; });
  R.stamps.forEach(function (st) {
    var age = now - st.t0, k = backOut(Math.min(1, age / 420)), fade = age > st.ms - 200 ? (st.ms - age) / 200 : 1;
    ctx.save(); ctx.globalAlpha = Math.max(0, fade); ctx.translate(270, st.sub ? 400 : 430); ctx.scale(k, k);
    bigText(st.text, 0, 0, st.size, st.color, -0.1);
    if (st.sub) bigText(st.sub, 0, st.size * .62 + 14, 28, '#fbf7ec', -0.1);
    ctx.restore();
  });
}
function slate(label, title, line, ms, cta) { R.slate = { label: label, title: title, line: line, cta: cta || null, until: performance.now() + ms, t0: performance.now() }; }
function wrapLines(text, size, maxW) { ctx.font = size + 'px "Luckiest Guy", "Arial Black", Impact, sans-serif'; var words = text.split(' '), lines = [], cur = ''; words.forEach(function (w) { var t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); return lines; }
function drawSlate() {
  var sl = R.slate; if (!sl) return; var now = performance.now(); if (now > sl.until) { R.slate = null; return; }
  var a = Math.min(1, (now - sl.t0) / 250, (sl.until - now) / 250);
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(30,42,35,.6)'; ctx.fillRect(0, 0, NC.W, NC.H);
  var lines = wrapLines(sl.title, 46, 400), ctaH = sl.cta ? 72 : 0;
  var h = 150 + lines.length * 50 + (sl.line ? 40 : 0) + ctaH;
  ctx.translate(270, 440); ctx.rotate(-0.012); ctx.fillStyle = '#1e2a23'; ctx.fillRect(-224, -h / 2 + 8, 448, h); ctx.fillStyle = '#fbf7ec'; ctx.fillRect(-230, -h / 2, 448, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#d9342b'; ctx.font = '18px "Luckiest Guy", "Arial Black", sans-serif'; ctx.fillText(sl.label, -6, -h / 2 + 40, 400);
  ctx.fillStyle = '#1e2a23'; ctx.font = '46px "Luckiest Guy", "Arial Black", Impact, sans-serif'; lines.forEach(function (l, i) { ctx.fillText(l, -6, -h / 2 + 95 + i * 50, 420); });
  if (sl.line) { ctx.fillStyle = '#5a6a5f'; ctx.font = '600 18px Fredoka, sans-serif'; ctx.fillText(sl.line, -6, -h / 2 + 95 + lines.length * 50 + 10, 420); }
  if (sl.cta) {
    var ctaY = h / 2 - 58;
    ctx.fillStyle = '#d9342b'; ctx.font = '28px "Luckiest Guy", "Arial Black", sans-serif'; ctx.fillText(sl.cta.url || 'nocapflip.com', -6, ctaY, 420);
    ctx.fillStyle = '#f4b41b'; ctx.font = '20px "Luckiest Guy", "Arial Black", sans-serif'; ctx.fillText(sl.cta.action || 'SUBSCRIBE', -6, ctaY + 28, 420);
  } else {
    ctx.fillStyle = '#f4b41b'; ctx.font = '16px "Luckiest Guy", "Arial Black", sans-serif'; ctx.fillText('NO CAP · the unofficial sport of the lunch table', -6, h / 2 - 26, 420);
  }
  ctx.restore();
}

/* ---------- video recording of the stage (canvas + game audio) ---------- */
/* blob, name, mime and secs describe the last finished video; it stays until the next recording finishes, so starting a game never throws it away */
var REC = { rec: null, chunks: [], blob: null, mime: '', start: 0, timer: null, name: '', secs: 0, saveQueued: false, saved: true };
function recSupported() { return !!(window.MediaRecorder && cv.captureStream); }
function recMime() {
  var safari = /apple/i.test(navigator.vendor || '') && !/crios|fxios|edgios/i.test(navigator.userAgent);
  var webm = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'], mp4 = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'];
  var list = safari ? mp4.concat(webm) : webm.concat(mp4);
  for (var i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) {} }
  return '';
}
function recStart(name) {
  recStop(false); /* a recording still running (the end card) is kept, not thrown away */
  if (!recSupported() || !S.rec) return false;
  try {
    var stream = cv.captureStream(30);
    try { if (S.sound) { audio(); if (ADEST) ADEST.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); }); } } catch (e) {}
    var mime = recMime(); if (!mime) return false;
    var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 });
    var chunks = []; REC.rec = rec; REC.chunks = chunks; REC.start = Date.now();
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = function () { var got = chunks.length > 0; if (got) { REC.blob = new Blob(chunks, { type: mime.split(';')[0] }); REC.mime = mime; REC.name = name; REC.secs = Math.round((Date.now() - REC.start) / 1000); REC.saved = false; } if (REC.rec === rec) REC.rec = null; if (typeof recDone === 'function') recDone(got); };
    rec.start(1000);
    $('recBadge').hidden = false; $('recTime').textContent = '0:00';
    clearInterval(REC.timer); REC.timer = setInterval(function () { var t = Math.round((Date.now() - REC.start) / 1000); $('recTime').textContent = Math.floor(t / 60) + ':' + ('0' + t % 60).slice(-2); }, 1000);
    return true;
  } catch (e) { REC.rec = null; return false; }
}
function recStop(discard) {
  clearInterval(REC.timer); $('recBadge').hidden = true;
  if (REC.rec && REC.rec.state !== 'inactive') { if (discard) { REC.rec.onstop = null; REC.rec.ondataavailable = null; REC.chunks = []; } try { REC.rec.stop(); } catch (e) {} }
  if (discard) REC.rec = null;
}
function recUnsaved() { return !!REC.blob && !REC.saved && !REC.rec; }
function recExt() { return /mp4/.test(REC.mime) ? 'mp4' : 'webm'; }
function recFile() { var d = new Date(), ds = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); return 'nocap-' + REC.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + ds + '.' + recExt(); }
function recSize() { return REC.blob ? (REC.blob.size > 1048576 ? (REC.blob.size / 1048576).toFixed(1) + ' MB' : Math.round(REC.blob.size / 1024) + ' KB') : ''; }
function recLen() { var t = REC.secs || 0; return Math.floor(t / 60) + ':' + ('0' + t % 60).slice(-2); }

/* ---------- hang stage: the hanging bottle, the cutter, the splash ---------- */
var ROPE_TOP = -1500, ROPE_BLADE_GAP = 90;
var onCutExpire = null;
R.cut = { on: false, t0: 0, ms: 0, p: 0, snap: 0, sec: -1 }; R.splash = []; R.puddle = null; R.hang = null;
function hangSpec() { return NC.BOTTLES[NC.STAGES.hang.hang.bottle]; }
function hangPos() { var st = NC.STAGES.hang.hang, s = hangSpec(), cb = st.capBottom + (R.hang ? R.hang.off : 0); return { x: st.x, cap: cb, y: cb - s.capH - s.h / 2, top: cb - s.capH - s.h }; }
function hangReset(skin) { R.hang = { skin: skin || 'tap', off: 0, lower: null, fall: null, swing: null, prev: null, poked: false }; R.puddle = null; R.cut.on = false; R.cut.p = 0; R.cut.snap = 0; }
hangReset();
function cutStart(ms) { R.cut.on = true; R.cut.t0 = performance.now(); R.cut.ms = ms; R.cut.p = 0; R.cut.snap = 0; R.cut.sec = -1; }
function cutStop() { R.cut.on = false; }
function cutPark() { R.cut.on = false; R.cut.p = 0; R.cut.snap = 0; }
function splashColor() { var sk = SKINS[R.hang ? R.hang.skin : 'tap']; return (sk && sk.liquid) || 'rgba(150,200,230,.6)'; }
function spawnDrops(x, y, n, power) {
  for (var i = 0; i < n; i++) {
    var ang = -Math.PI * (0.05 + Math.random() * 0.9), sp = (2 + Math.random() * 9) * power;
    R.splash.push({ x: x + (Math.random() - 0.5) * 30, y: y, vx: Math.cos(ang) * sp * 1.5, vy: Math.sin(ang) * sp - 2, r: 2 + Math.random() * 5 });
  }
}
/* snip the rope: the blade snaps through, the bottle drops, hits the table and sprays water everywhere. done() runs once the mess has landed. */
function hangCutNow(done) {
  var h = R.hang; if (!h || h.fall) { if (done) done(); return; }
  R.cut.on = false; R.cut.snap = performance.now(); sfx('snip');
  var p = hangPos();
  setTimeout(function () {
    if (!R.hang || R.hang !== h) { if (done) done(); return; }
    h.fall = { x: p.x, y0: p.y, y: p.y, vy: 0, rot: Math.PI, done: done }; spawnDrops(p.x, p.y, 28, 0.7);
  }, 170);
}
/* after a stack: the rope pays out until the two caps touch */
function hangLower(done) {
  var h = R.hang; if (!h || h.fall) { if (done) done(); return; }
  var sp = NC.BOTTLES[SKINS[R.skin].type], capTop = NC.TABLE_Y - sp.h - sp.capH;
  h.swing = null; /* hang dead still so the caps meet */
  h.lower = { t0: performance.now(), ms: 900, to: capTop - NC.STAGES.hang.hang.capBottom, done: done };
}
/* a flying bottle that clips the hanger sets it swinging a little (visual only; the stack check stays static) */
/* rotated rectangle (centre, angle, w, h) against an axis-aligned one: separating-axis test */
function rectHitsAABB(cx, cy, ang, w, h, x0, y0, x1, y1) {
  var c = Math.cos(ang), s = Math.sin(ang), hw = w / 2, hh = h / 2;
  var ex = Math.abs(c) * hw + Math.abs(s) * hh, ey = Math.abs(s) * hw + Math.abs(c) * hh;
  var ax = (x0 + x1) / 2, ay = (y0 + y1) / 2, ahw = (x1 - x0) / 2, ahh = (y1 - y0) / 2;
  if (Math.abs(cx - ax) > ex + ahw || Math.abs(cy - ay) > ey + ahh) return false;
  var dx = ax - cx, dy = ay - cy, px = dx * c + dy * s, py = -dx * s + dy * c;
  return Math.abs(px) <= hw + ahw * Math.abs(c) + ahh * Math.abs(s) && Math.abs(py) <= hh + ahw * Math.abs(s) + ahh * Math.abs(c);
}
function hangPoke(now) {
  var h = R.hang, pos = null, skin = R.skin;
  if (R.state === 'flight' && R.thr) { var b = R.thr.bottle.parts[1]; pos = { x: b.position.x, y: b.position.y, a: R.thr.bottle.angle }; }
  else if (R.state === 'replay' && R.replay && R.replay.trail.length) { var fr = R.replay.trail[Math.min(R.replay.trail.length - 1, Math.floor(R.replay.i))]; if (fr) { pos = { x: fr[0], y: fr[1], a: fr[2] }; skin = R.replay.skin; } }
  if (!pos) { h.prev = null; h.poked = false; return; }
  var pr = h.prev; h.prev = pos;
  if (!pr || h.poked) return;
  var sp = Math.hypot(pos.x - pr.x, pos.y - pr.y);
  if (sp < 1.2) return;
  /* real geometry: the thrown bottle's body and cap against the hanger's body and cap */
  var p = hangPos(), hs = hangSpec(), s = NC.BOTTLES[SKINS[skin].type], d = s.h / 2 + s.capH / 2;
  var capX = pos.x + d * Math.sin(pos.a), capY = pos.y - d * Math.cos(pos.a);
  var hb = [p.x - hs.w / 2, p.top, p.x + hs.w / 2, p.cap - hs.capH], hc = [p.x - hs.capW / 2, p.cap - hs.capH, p.x + hs.capW / 2, p.cap];
  var hit = [hb, hc].some(function (r) { return rectHitsAABB(pos.x, pos.y, pos.a, s.w, s.h, r[0], r[1], r[2], r[3]) || rectHitsAABB(capX, capY, pos.a, s.capW, s.capH, r[0], r[1], r[2], r[3]); });
  if (hit) { h.poked = true; h.swing = { t0: now, amp: Math.min(0.12, 0.06 + sp * 0.005), dir: pos.x < p.x ? 1 : -1 }; sfx('tick'); }
}
function updateHang(now, dt) {
  var h = R.hang; if (!h) return;
  var k = dt / NC.STEP;
  if (!h.fall) hangPoke(now);
  if (h.lower) { var L = h.lower, q = Math.min(1, (now - L.t0) / L.ms); h.off = L.to * (1 - Math.pow(1 - q, 3)); if (q >= 1) { h.off = L.to; h.lower = null; sfx('tick'); if (L.done) L.done(); } }
  if (h.fall) {
    var f = h.fall, s = hangSpec(), landY = NC.TABLE_Y - s.w / 2 - 1;
    f.vy += 0.75 * k; f.y += f.vy * k;
    f.rot = Math.PI + Math.min(1, Math.max(0, (f.y - f.y0) / Math.max(1, landY - f.y0))) * Math.PI * 0.5;
    if (f.y >= landY) {
      f.y = landY; f.rot = Math.PI * 1.5; var d = f.done; f.done = null;
      spawnDrops(f.x, NC.TABLE_Y - 6, 170, 1.25); sfx('splash');
      R.puddle = { x: f.x, t0: now };
      if (d) setTimeout(d, 750);
    }
  }
  if (R.cut.on) {
    var el = now - R.cut.t0, left = R.cut.ms - el, sec = Math.ceil(left / 1000);
    R.cut.p = Math.min(1, el / R.cut.ms);
    if (sec !== R.cut.sec) { R.cut.sec = sec; if (sec > 0 && sec <= 3) sfx('tick'); }
    if (left <= 0) { R.cut.on = false; R.cut.p = 1; if (onCutExpire) onCutExpire(); }
  }
  var tableL = NC.STAGES.hang.table[0], tableR = NC.STAGES.hang.table[1];
  for (var i = R.splash.length - 1; i >= 0; i--) {
    var d2 = R.splash[i]; d2.vy += 0.5 * k; d2.x += d2.vx * k; d2.y += d2.vy * k;
    var ground = d2.x >= tableL && d2.x <= tableR ? NC.TABLE_Y : NC.FLOOR_Y;
    if (d2.vy > 0 && d2.y >= ground) R.splash.splice(i, 1);
  }
}
function drawBlade(p) {
  var by = p.top - ROPE_BLADE_GAP, now = performance.now(), pr = R.cut.p;
  if (R.cut.snap) pr = Math.min(1, pr + (now - R.cut.snap) / 170 * (1 - pr));
  /* a chainsaw on a rail: guide bar pointing at the rope, chain running and the engine shaking while it creeps closer */
  var dx = 60 * (1 - pr), shake = Math.sin(now / 15) * 1.2, phase = (now / 10) % 7; /* the chain always runs, even after the throw stops the countdown */
  ctx.save();
  ctx.strokeStyle = '#6c737b'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x - 6, by + 17); ctx.lineTo(p.x + 170, by + 17); ctx.stroke();
  ctx.translate(p.x - 2 + dx, by + shake);
  ctx.strokeStyle = '#1e2a23'; ctx.lineWidth = 2.5;
  ctx.fillStyle = '#9aa3ab'; rr(0, -7, 66, 14, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1e2a23';
  for (var ti = 0; ti < 11; ti++) { var tx = 66 - ((ti * 7 + phase) % 77); if (tx < 2 || tx > 62) continue; ctx.beginPath(); ctx.moveTo(tx, -7); ctx.lineTo(tx + 3.5, -12); ctx.lineTo(tx + 7, -7); ctx.fill(); ctx.beginPath(); ctx.moveTo(tx, 7); ctx.lineTo(tx + 3.5, 12); ctx.lineTo(tx + 7, 7); ctx.fill(); }
  ctx.fillStyle = '#2b313a'; rr(76, -46, 38, 14, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f26b1d'; rr(60, -34, 56, 44, 9); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d9d2c4'; rr(70, -26, 26, 14, 4); ctx.fill();
  ctx.fillStyle = '#1e2a23'; ctx.beginPath(); ctx.arc(104, -6, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#d9342b'; ctx.fillRect(56, -40, 6, 14);
  ctx.fillStyle = '#2b313a'; rr(112, -12, 14, 16, 5); ctx.fill(); ctx.stroke();
  if (R.cut.on) { var sec = Math.max(0, Math.ceil((R.cut.ms - (now - R.cut.t0)) / 1000)); ctx.font = '26px "Luckiest Guy", "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = sec <= 3 ? '#d9342b' : '#1e2a23'; ctx.fillText(String(sec), 95, -54); }
  ctx.restore();
}
function drawHang() {
  var h = R.hang; if (!h) return;
  var p = hangPos(), s = hangSpec(), now = performance.now();
  if (R.puddle) { var q = Math.min(1, (now - R.puddle.t0) / 900), w = 20 + 150 * (1 - Math.pow(1 - q, 3)); ctx.save(); ctx.fillStyle = splashColor(); ctx.beginPath(); ctx.ellipse(R.puddle.x, NC.TABLE_Y - 1, w, 7, 0, 0, 7); ctx.fill(); ctx.restore(); }
  if (!h.fall) {
    /* pendulum: rope and bottle rotate about a pivot 260 px above the bottle */
    var piv = p.top - 260, ang = 0;
    if (h.swing) { var t = (now - h.swing.t0) / 1000; if (t > 4) h.swing = null; else ang = h.swing.amp * h.swing.dir * Math.exp(-2.6 * t) * Math.sin(2 * Math.PI * 1.2 * t); }
    ctx.save(); ctx.strokeStyle = '#d8c49a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, ROPE_TOP); ctx.lineTo(p.x, piv); ctx.stroke();
    ctx.translate(p.x, piv); ctx.rotate(ang); ctx.translate(-p.x, -piv);
    ctx.beginPath(); ctx.moveTo(p.x, piv); ctx.lineTo(p.x, p.top); ctx.stroke();
    ctx.fillStyle = '#8a6b3a'; ctx.beginPath(); ctx.arc(p.x, p.top - 2, 4, 0, 7); ctx.fill();
    drawBottle(p.x, p.y, Math.PI, h.skin); ctx.restore();
    drawBlade(p);
  } else {
    var by = p.top - ROPE_BLADE_GAP;
    ctx.save(); ctx.strokeStyle = '#d8c49a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, ROPE_TOP); ctx.lineTo(p.x, by - 4); ctx.stroke(); ctx.restore();
    drawBottle(h.fall.x, h.fall.y, h.fall.rot, h.skin);
  }
}
function drawSplash() {
  if (!R.splash.length) return;
  ctx.save(); ctx.fillStyle = splashColor();
  R.splash.forEach(function (d) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill(); });
  ctx.restore();
}

/* ---------- loop ---------- */
var onOutcome = null;
function frame(ts) {
  requestAnimationFrame(frame);
  if ($('match').hidden) return;
  var dt = Math.min(50, ts - (R.last || ts)); R.last = ts;
  if (R.stageId === 'hang') updateHang(performance.now(), dt);
  if (R.state === 'flight' && R.thr) {
    R.acc += dt; var n = 0;
    while (R.acc >= NC.STEP && n < 4) { R.acc -= NC.STEP; n++; var o = R.thr.step(); if (o) { finishThrow(o); break; } }
  } else if (R.state === 'replay' && R.replay) {
    R.replay.i += dt / NC.STEP * R.replay.speed;
    if (R.replay.i >= R.replay.trail.length - 1) { R.replay.i = R.replay.trail.length - 1; R.state = 'settle'; var fr = R.replay.trail[R.replay.trail.length - 1]; R.pose = { x: fr[0], y: fr[1], a: fr[2], skin: R.replay.skin }; var d = R.replay.done; R.replay = null; if (d) d(); }
  }
  render();
}
function finishThrow(o) {
  var t = R.thr, b = t.bottle.parts[1];
  R.pose = { x: b.position.x, y: b.position.y, a: t.bottle.angle, skin: R.skin };
  R.state = 'settle';
  if (onOutcome) onOutcome(o, t.trail.slice());
}
function startThrow(power, angle, skinId) {
  R.skin = skinId; R.pose = null; R.aim = null;
  var world = NC.makeWorld(R.stageId);
  R.thr = new NC.Throw(world, SKINS[skinId].type, power, angle);
  R.acc = 0; R.state = 'flight';
}
/* speed: indices advanced per physics step. Highlights replay the last 90 frames at a third speed; remote throws play whole at full speed. */
function playReplay(trail, skin, done, speed, whole) {
  var start = whole ? 0 : Math.max(0, trail.length - 90);
  R.skin = skin; R.replay = { trail: trail.slice(start), i: 0, skin: skin, done: done, speed: speed || 0.33 }; R.state = 'replay';
}
/* trail <-> compact string (every 2nd frame, ints) for the db */
function encTrail(trail) { var out = [], n = trail.length; if (n) { var l = trail[n - 1]; while (n > 2 && Math.abs(trail[n - 2][0] - l[0]) < 0.3 && Math.abs(trail[n - 2][1] - l[1]) < 0.3 && Math.abs(trail[n - 2][2] - l[2]) < 0.005) n--; trail = trail.slice(0, n); } for (var i = 0; i < trail.length; i += 2) out.push(Math.round(trail[i][0]) + ',' + Math.round(trail[i][1]) + ',' + Math.round(trail[i][2] * 100)); if (trail.length % 2 === 0 && trail.length) { var l = trail[trail.length - 1]; out.push(Math.round(l[0]) + ',' + Math.round(l[1]) + ',' + Math.round(l[2] * 100)); } return out.join(';'); }
function decTrail(str) { if (!str) return []; return str.split(';').map(function (f) { var p = f.split(','); return [+p[0], +p[1], (+p[2]) / 100]; }); }
function goFull() { var el = document.documentElement; var fn = el.requestFullscreen || el.webkitRequestFullscreen; if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; } if (fn) { try { var p = fn.call(el); if (p && p.catch) p.catch(function () {}); } catch (e) {} } }
if (!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)) $('btnFull').hidden = true;
$('btnFull').addEventListener('click', goFull);

/* ---------- input ---------- */
var drag = null;
function stagePoint(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * NC.W / r.width, y: (e.clientY - r.top) * NC.H / r.height }; }
function aimFrom(p0, p1) { var dx = p1.x - p0.x, dy = p1.y - p0.y, len = Math.hypot(dx, dy), ang = Math.atan2(-dy, dx) * 180 / Math.PI; var power = Math.min(1.5, Math.max(0.3, len / 250)); return { len: len, angle: ang, power: power, ok: len > 40 && ang > 30 && ang < 150 }; }
var inputEnabled = false;
$('stage').addEventListener('pointerdown', function (e) { if (!inputEnabled || R.state !== 'idle' || R.slate) return; drag = stagePoint(e); R.aim = null; try { $('stage').setPointerCapture(e.pointerId); } catch (x) {} });
$('stage').addEventListener('pointermove', function (e) { if (!drag || R.state !== 'idle') return; R.aim = aimFrom(drag, stagePoint(e)); setHint(R.aim.ok ? 'Power <b>' + R.aim.power.toFixed(2) + '</b> · angle <b>' + Math.round(R.aim.angle) + '°</b> · let go to flip' : 'Swipe <b>up</b>, longer swipe = more power'); });
function endDrag(e) { if (!drag) return; var a = aimFrom(drag, stagePoint(e)); drag = null; R.aim = null; if (R.state !== 'idle' || !inputEnabled) return; if (a.ok) humanThrow(a.power, a.angle); else setHint('Swipe <b>up</b> to flip'); }
$('stage').addEventListener('pointerup', endDrag); $('stage').addEventListener('pointercancel', function () { drag = null; R.aim = null; });
document.addEventListener('keydown', function (e) { if ((e.key === ' ' || e.key === 'Enter') && inputEnabled && R.state === 'idle' && !$('match').hidden && R.lastHuman && document.activeElement.tagName !== 'BUTTON' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); humanThrow(R.lastHuman.power, R.lastHuman.angle); } });
function setHint(html) { $('hint').innerHTML = html; }
requestAnimationFrame(frame);
