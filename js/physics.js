/* No Cap · physics core. Works in the page (window.Matter) and in Node for tuning. */
(function (root) {
  var M = root.Matter;
  var W = 540, H = 960, TABLE_Y = 700, FLOOR_Y = 930, LAUNCH_X = 150;
  var STEP = 1000 / 60;

  var TUNE = {
    gravity: 0.85,        // Matter gravity.y (scale 0.001)
    v0: 22,               // launch speed at power 1 (px per frame)
    omega: 0.118,         // spin at power 1 (rad per frame)
    omegaPow: 0.35,       // spin grows a little with power (0 = constant spin)
    contactSpin: 0.5,     // angular velocity kept per frame while touching and tumbling fast (slosh)
    contactSpinSlow: 0.985, // kept per frame while touching and rocking slowly
    contactFastAbove: 0.03,
    contactSpinInv: 1,   // kept per frame while touching cap-first
    contactSlide: 0.9,    // x velocity kept per frame while touching
    capTol: 0.04,          // radians from fully inverted that still counts as a cap land
    capSpin: 0.004,        // max angular speed for a cap land
    uprightTol: 0.14,     // radians from upright for a land
    restFrames: 14,
    maxFrames: 420
  };

  var BOTTLES = {
    water:   { name: 'Crinkly water bottle', w: 26, h: 70, capW: 11, capH: 9, fill: 0.34, density: 0.0012, waterDensity: 0.012, restitution: 0.08, friction: 0.7, aura: 1 },
    glitter: { name: 'Glitter bottle',       w: 26, h: 70, capW: 11, capH: 9, fill: 0.34, density: 0.0012, waterDensity: 0.012, restitution: 0.08, friction: 0.7, aura: 1 },
    sports:  { name: 'Sports-drink bottle',  w: 32, h: 62, capW: 14, capH: 9, fill: 0.36, density: 0.0016, waterDensity: 0.014, restitution: 0.06, friction: 0.75, aura: 1 },
    hype:    { name: 'Hype drink bottle',    w: 24, h: 74, capW: 11, capH: 10, fill: 0.32, density: 0.0016, waterDensity: 0.012, restitution: 0.1, friction: 0.65, aura: 2 },
    flask:   { name: 'Insulated flask',      w: 28, h: 80, capW: 16, capH: 10, fill: 0.3, density: 0.004, waterDensity: 0.01, restitution: 0.1, friction: 0.6, aura: 3 },
    tumbler: { name: 'The 40 oz',            w: 36, h: 92, capW: 22, capH: 8, fill: 0.3, density: 0.005, waterDensity: 0.012, restitution: 0.2, friction: 0.55, aura: 5, handle: true }
  };

  /* platforms: x,y = top-left, w,h size. target = which platform counts (index) or 'table' */
  var STAGES = {
    table: { table: [40, 500], target: 'table', platforms: [] },
    tray:  { table: [40, 500], target: 0, platforms: [
      { x: 250, y: TABLE_Y - 12, w: 170, h: 12, kind: 'tray' },
      { x: 250, y: TABLE_Y - 22, w: 7, h: 10, kind: 'lip' },
      { x: 413, y: TABLE_Y - 22, w: 7, h: 10, kind: 'lip' } ] },
    books: { table: [40, 500], target: 0, platforms: [
      { x: 255, y: TABLE_Y - 44, w: 140, h: 44, kind: 'books' } ] },
    stool: { table: [40, 250], target: 0, platforms: [
      { x: 262, y: 790, w: 112, h: 16, kind: 'stool' } ] }
  };

  function norm(a) { a = a % (2 * Math.PI); if (a > Math.PI) a -= 2 * Math.PI; if (a <= -Math.PI) a += 2 * Math.PI; return a; }

  function makeWorld(stageId) {
    var st = STAGES[stageId];
    var engine = M.Engine.create({ gravity: { x: 0, y: TUNE.gravity, scale: 0.001 }, positionIterations: 8, velocityIterations: 6 });
    var statics = [];
    var surfaces = []; // {body, x0, x1, top, target}
    var tw = st.table[1] - st.table[0];
    var table = M.Bodies.rectangle(st.table[0] + tw / 2, TABLE_Y + 14, tw, 28, { isStatic: true, friction: 0.8, restitution: 0.05, label: 'table' });
    statics.push(table);
    surfaces.push({ body: table, x0: st.table[0], x1: st.table[1], top: TABLE_Y, target: st.target === 'table', kind: 'table' });
    var floor = M.Bodies.rectangle(W / 2, FLOOR_Y + 20, W + 400, 40, { isStatic: true, friction: 0.9, restitution: 0.02, label: 'floor' });
    statics.push(floor);
    st.platforms.forEach(function (p, i) {
      var b = M.Bodies.rectangle(p.x + p.w / 2, p.y + p.h / 2, p.w, p.h, { isStatic: true, friction: 0.8, restitution: 0.05, label: p.kind });
      statics.push(b);
      if (p.kind !== 'lip') surfaces.push({ body: b, x0: p.x, x1: p.x + p.w, top: p.y, target: st.target === i, kind: p.kind });
    });
    M.Composite.add(engine.world, statics);
    return { engine: engine, statics: statics, surfaces: surfaces, stage: st, stageId: stageId };
  }

  function makeBottle(id, x, baseY) {
    var s = BOTTLES[id];
    var cy = baseY - s.h / 2;
    var opts = { friction: s.friction, restitution: s.restitution, frictionAir: 0.004 };
    var body = M.Bodies.rectangle(x, cy, s.w, s.h, Object.assign({ density: s.density }, opts));
    var cap = M.Bodies.rectangle(x, cy - s.h / 2 - s.capH / 2, s.capW, s.capH, Object.assign({ density: s.density }, opts));
    var wh = s.h * s.fill;
    var water = M.Bodies.rectangle(x, cy + s.h / 2 - wh / 2, s.w - 2, wh, Object.assign({ density: s.waterDensity }, opts));
    var parts = [body, cap, water];
    if (s.handle) parts.push(M.Bodies.rectangle(x + s.w / 2 + 6, cy + 6, 10, 36, Object.assign({ density: s.density * 0.6 }, opts)));
    var comp = M.Body.create(Object.assign({ parts: parts, label: 'bottle', spec: id }, opts));
    comp.frictionAir = 0.004;
    comp.spec = id;
    return comp;
  }

  function throwVec(power, angleDeg) {
    var a = angleDeg * Math.PI / 180;
    var v = TUNE.v0 * power;
    return { vx: v * Math.cos(a), vy: -v * Math.sin(a), omega: TUNE.omega * Math.pow(power, TUNE.omegaPow) };
  }

  /* A single throw: creates the bottle, launches it, steps until it settles. */
  function Throw(world, bottleId, power, angleDeg) {
    this.world = world;
    this.bottle = makeBottle(bottleId, LAUNCH_X, TABLE_Y);
    M.Composite.add(world.engine.world, this.bottle);
    var t = throwVec(power, angleDeg);
    M.Body.setVelocity(this.bottle, { x: t.vx, y: t.vy });
    M.Body.setAngularVelocity(this.bottle, t.omega);
    this.frames = 0; this.rest = 0; this.outcome = null; this.where = null;
    this.trail = [];
  }
  Throw.prototype.record = function () {
    var p = this.bottle.parts[1];
    this.trail.push([p.position.x, p.position.y, this.bottle.angle]);
  };
  Throw.prototype.step = function () {
    if (this.outcome) return this.outcome;
    var b = this.bottle, w = this.world;
    M.Engine.update(w.engine, STEP);
    this.frames++;
    var touching = M.Query.collides(b, w.statics).length > 0;
    if (touching) {
      var baseDown = Math.abs(norm(b.angle)) < Math.PI / 2;
      var fast = Math.abs(b.angularVelocity) > TUNE.contactFastAbove;
      M.Body.setAngularVelocity(b, b.angularVelocity * (fast ? (baseDown ? TUNE.contactSpin : TUNE.contactSpinInv) : (baseDown ? TUNE.contactSpinSlow : 1)));
      M.Body.setVelocity(b, { x: b.velocity.x * TUNE.contactSlide, y: b.velocity.y });
    }
    this.record();
    var a = norm(b.angle), sp = Math.hypot(b.velocity.x, b.velocity.y), asp = Math.abs(b.angularVelocity);
    /* cap assist: inverted, slow, cap on a surface */
    if (touching && Math.abs(Math.abs(a) - Math.PI) < TUNE.capTol && asp < TUNE.capSpin && Math.abs(b.velocity.y) < 5 && Math.abs(b.velocity.x) < 2.5) {
      var cap = b.parts[2];
      var capBottom = cap.bounds.max.y;
      var surf = this.surfaceUnder(b.position.x, capBottom, 6);
      if (surf) {
        M.Body.setStatic(b, true);
        M.Body.setAngle(b, Math.PI);
        var capBottom2 = b.parts[2].bounds.max.y;
        M.Body.setPosition(b, { x: b.position.x, y: b.position.y - (capBottom2 - surf.top) });
        this.record();
        this.where = surf;
        return this.finish(surf.target ? 'cap' : 'wrong');
      }
    }
    if (b.position.y > H + 80 || b.position.x < -120 || b.position.x > W + 120) return this.finish('flop');
    if (sp < 0.2 && asp < 0.005) this.rest++; else this.rest = 0;
    if (this.rest >= TUNE.restFrames || this.frames >= TUNE.maxFrames) {
      var lowest = -1e9; b.parts.slice(1).forEach(function (p) { lowest = Math.max(lowest, p.bounds.max.y); });
      var s = this.surfaceUnder(b.position.x, lowest, 5);
      this.where = s;
      if (s && Math.abs(a) < TUNE.uprightTol) return this.finish(s.target ? 'land' : 'wrong');
      if (s && Math.abs(Math.abs(a) - Math.PI) < TUNE.uprightTol) return this.finish(s.target ? 'cap' : 'wrong');
      return this.finish('flop');
    }
    return null;
  };
  Throw.prototype.surfaceUnder = function (x, bottomY, tol) {
    var best = null;
    this.world.surfaces.forEach(function (s) {
      if (x >= s.x0 && x <= s.x1 && Math.abs(bottomY - s.top) <= tol) { if (!best || s.top < best.top) best = s; }
    });
    return best;
  };
  Throw.prototype.finish = function (o) { this.outcome = o; return o; };
  Throw.prototype.remove = function () { M.Composite.remove(this.world.engine.world, this.bottle); };

  function simulate(stageId, bottleId, power, angleDeg) {
    var w = makeWorld(stageId);
    var t = new Throw(w, bottleId, power, angleDeg);
    var o; while (!(o = t.step())) {}
    return { outcome: o, frames: t.frames, trail: t.trail };
  }

  /* Grid search for the most reliable throw; returns the centre of the best success cluster. */
  function searchIdeal(stageId, bottleId, opts) {
    opts = opts || {};
    var pmin = opts.pmin || 0.6, pmax = opts.pmax || 1.5, ps = opts.ps || 0.02;
    var amin = opts.amin || 50, amax = opts.amax || 95, as = opts.as || 2.5;
    var grid = [], np = Math.round((pmax - pmin) / ps) + 1, na = Math.round((amax - amin) / as) + 1;
    for (var i = 0; i < np; i++) { grid.push([]); for (var j = 0; j < na; j++) {
      var o = simulate(stageId, bottleId, pmin + i * ps, amin + j * as).outcome;
      grid[i].push(o === 'land' || o === 'cap' ? 1 : 0);
    } }
    var best = null;
    for (var i2 = 0; i2 < np; i2++) for (var j2 = 0; j2 < na; j2++) {
      var sum = 0, cnt = 0;
      for (var di = -2; di <= 2; di++) for (var dj = -1; dj <= 1; dj++) {
        var ii = i2 + di, jj = j2 + dj; if (ii < 0 || jj < 0 || ii >= np || jj >= na) continue;
        sum += grid[ii][jj]; cnt++;
      }
      var sc = sum / cnt + grid[i2][j2] * 0.01;
      if (!best || sc > best.score) best = { power: +(pmin + i2 * ps).toFixed(3), angle: +(amin + j2 * as).toFixed(1), score: sc };
    }
    best.grid = grid; best.rate = grid.flat().reduce(function (a, b) { return a + b; }, 0) / (np * na);
    return best;
  }

  root.NC = { M: M, W: W, H: H, TABLE_Y: TABLE_Y, FLOOR_Y: FLOOR_Y, LAUNCH_X: LAUNCH_X, STEP: STEP, TUNE: TUNE,
    BOTTLES: BOTTLES, STAGES: STAGES, norm: norm, makeWorld: makeWorld, makeBottle: makeBottle, throwVec: throwVec,
    Throw: Throw, simulate: simulate, searchIdeal: searchIdeal };
})(typeof window !== 'undefined' ? window : globalThis);
