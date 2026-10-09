// Real-time 7-on-7 football simulation. Pure state + step(dt); rendering and input live elsewhere.
(function () {
  const PG = (globalThis.PG = globalThis.PG || {});

  const W = 53.33, CY = W / 2, DT = 1 / 30;
  const QUARTER = 300;
  const CARRY = 0.88; // speed multiplier while holding the ball
  PG.FIELD_W = W;
  PG.DT = DT;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  PG.OFF_PLAYS = {
    run_in: { name: 'Inside Run', kind: 'run', desc: 'Hand off up the middle' },
    run_out: { name: 'Outside Sweep', kind: 'run', desc: 'Toss to the edge' },
    pass_short: { name: 'Quick Slants', kind: 'pass', desc: 'Fast, safe throws' },
    pass_mid: { name: 'Dig & Comeback', kind: 'pass', desc: 'Intermediate routes' },
    pass_deep: { name: 'Hyper Bomb', kind: 'pass', desc: 'Go deep' },
    punt: { name: 'Punt', kind: 'special', desc: 'Flip the field' },
    fg: { name: 'Field Goal', kind: 'special', desc: 'Kick for 3' },
  };
  PG.DEF_PLAYS = {
    base: { name: 'Base Man', desc: 'Balanced' },
    blitz: { name: 'LB Blitz', desc: 'Send extra heat' },
    deep: { name: 'Deep Shell', desc: 'Take away the bomb' },
    run_stop: { name: 'Stack the Box', desc: 'Stuff the run' },
  };

  // Routes: waypoints as [yards downfield, yards toward middle], then keep going or sit.
  const ROUTES = {
    pass_short: {
      WR1: { pts: [[4, 0], [10, 9]], then: 'go' },
      WR2: { pts: [[6, 0], [5, -1]], then: 'sit' },
      TE: { pts: [[4, 0], [5, -7]], then: 'go' },
      RB: { pts: [[-1, -8], [2, -11]], then: 'sit' },
    },
    pass_mid: {
      WR1: { pts: [[12, 0], [12.5, 12]], then: 'go' },
      WR2: { pts: [[14, 0], [11, -3]], then: 'sit' },
      TE: { pts: [[9, 0], [16, 5]], then: 'go' },
      RB: { pts: [[-1, 7], [3, 10]], then: 'sit' },
    },
    pass_deep: {
      WR1: { pts: [[40, 0]], then: 'go' },
      WR2: { pts: [[15, 0], [34, 12]], then: 'go' },
      TE: { pts: [[8, 0], [9, 10]], then: 'go' },
      RB: null,
    },
  };

  function makeTeam(squad, idx) {
    const players = PG.SLOTS.map((s) => {
      const mon = PG.byId(squad.slots[s.key]);
      const a = PG.attrs(mon);
      return {
        team: idx, slot: s.key, pos: s.pos, side: s.side, mon, a, ovr: PG.rating(mon, s.pos),
        topSpeed: 5.3 + ((a.SPD - 30) / 69) * 3.4,
        x: 0, y: 0, vx: 0, vy: 0, face: 1,
        st: { att: 0, cmp: 0, pyd: 0, ptd: 0, int: 0, car: 0, ryd: 0, rtd: 0, rec: 0, recyd: 0, rectd: 0, tkl: 0, sack: 0, pick: 0, fg: 0, fga: 0 },
      };
    });
    const by = Object.fromEntries(players.map((p) => [p.slot, p]));
    return { idx, name: squad.name, color: squad.color, players, by, st: { plays: 0, yds: 0, pyd: 0, ryd: 0, to: 0, first: 0 } };
  }

  PG.createGame = function (home, away, opts = {}) {
    const g = {
      teams: [makeTeam(home, 0), makeTeam(away, 1)],
      score: [0, 0], quarter: 1, clock: opts.quarterLen || QUARTER, quarterLen: opts.quarterLen || QUARTER,
      poss: opts.firstPoss ?? 1, los: 0, down: 1, toGo: 10, fdx: 0,
      phase: 'presnap', phaseT: 0, t: 0,
      human: opts.human ?? null, // team index controlled by a person, or null
      input: { mx: 0, my: 0, action: false, throwTo: null, snap: false, call: null },
      rng: opts.rng || Math.random,
      ball: { x: 0, y: 0, z: 0, state: 'held', carrier: null },
      on: [], events: [], log: [], hist: [], drive: [], over: false, lastResult: '',
      play: null, kickoffTeam: opts.firstPoss ?? 1,
    };
    startDrive(g, g.poss, null);
    return g;
  };

  const dirOf = (t) => (t === 0 ? 1 : -1);
  const ownGoal = (t) => (t === 0 ? 10 : 110);
  const oppGoal = (t) => (t === 0 ? 110 : 10);
  PG.dirOf = dirOf;
  PG.yardLabel = function (g, x) {
    const y = Math.round(x - 10);
    if (y === 50) return '50';
    return y < 50 ? `${g.teams[0].name.split(' ')[0].slice(0, 3).toUpperCase()} ${y}` : `${g.teams[1].name.split(' ')[0].slice(0, 3).toUpperCase()} ${100 - y}`;
  };

  function emit(g, type, data = {}) { g.events.push({ type, ...data }); }
  function log(g, text, big) {
    g.log.push({ q: g.quarter, clock: g.clock, text, big: !!big, poss: g.poss });
    g.lastResult = text;
  }

  function startDrive(g, team, x) {
    g.poss = team;
    g.los = x == null ? ownGoal(team) + dirOf(team) * 25 : x;
    g.down = 1;
    setFirstDown(g);
    setupPresnap(g);
  }
  function setFirstDown(g) {
    const d = dirOf(g.poss);
    const goal = oppGoal(g.poss);
    const yardsToGoal = (goal - g.los) * d;
    g.toGo = Math.min(10, yardsToGoal);
    g.fdx = g.los + d * g.toGo;
    g.goalToGo = yardsToGoal <= 10;
  }

  function place(p, x, y, face) { p.x = x; p.y = y; p.vx = p.vy = 0; p.face = face; p.eng = null; p.stun = 0; p.immune = 0; p.tklCd = 0; p.role = 'idle'; p.wp = null; p.wpi = 0; p.juke = 0; p.jukeCd = 0; p.label = null; p.lagx = x; p.lagy = y; }

  function setupPresnap(g) {
    const o = g.teams[g.poss], dteam = g.teams[1 - g.poss], d = dirOf(g.poss), L = g.los;
    const O = o.by, D = dteam.by;
    place(O.OL1, L - d * 0.9, CY - 1.6, d); place(O.OL2, L - d * 0.9, CY + 1.6, d);
    place(O.TE, L - d * 0.9, CY + 4.6, d);
    place(O.QB, L - d * 4.5, CY, d); place(O.RB, L - d * 5.2, CY - 2.6, d);
    place(O.WR1, L - d * 0.9, CY - 18, d); place(O.WR2, L - d * 0.9, CY + 18, d);
    place(D.DL1, L + d * 0.9, CY - 2, -d); place(D.DL2, L + d * 0.9, CY + 2, -d);
    place(D.LB1, L + d * 4.5, CY - 4, -d); place(D.LB2, L + d * 4.5, CY + 5.5, -d);
    place(D.CB1, L + d * 5, CY - 18, -d); place(D.CB2, L + d * 5, CY + 18, -d);
    place(D.S, L + d * 13, CY, -d);
    g.on = [O.QB, O.RB, O.WR1, O.WR2, O.TE, O.OL1, O.OL2, D.DL1, D.DL2, D.LB1, D.LB2, D.CB1, D.CB2, D.S];
    g.ball = { x: L - d * 4.5, y: CY, z: 0, state: 'held', carrier: O.QB };
    g.phase = 'presnap';
    g.phaseT = 0;
    g.play = null;
    g.input.snap = false; g.input.call = null; g.input.throwTo = null; g.input.action = false;
    g.needCall = g.human != null;
    emit(g, 'presnap');
  }

  // ---------- play calling ----------
  function pick(g, weights) {
    let tot = 0;
    for (const k in weights) tot += Math.max(0, weights[k]);
    let r = g.rng() * tot;
    for (const k in weights) { r -= Math.max(0, weights[k]); if (r <= 0) return k; }
    return Object.keys(weights)[0];
  }
  function fgDistance(g) { return (oppGoal(g.poss) - g.los) * dirOf(g.poss) + 17; }
  function fgProb(kick, d) { return clamp(0.99 - Math.pow(Math.max(0, d - 18) / (38 + kick * 0.35), 2.2), 0.02, 0.99); }
  PG.fgInfo = function (g) { const d = fgDistance(g); return { dist: Math.round(d), prob: fgProb(g.teams[g.poss].by.K.a.KICK, d) }; };

  function aiOffense(g) {
    const t = g.teams[g.poss], me = g.score[g.poss], them = g.score[1 - g.poss];
    const toGoal = (oppGoal(g.poss) - g.los) * dirOf(g.poss);
    const late = g.quarter >= 4 && g.clock < 150;
    const trailing = me < them;
    if (g.down === 4) {
      const fd = fgDistance(g), kick = t.by.K.a.KICK;
      const desperate = trailing && g.quarter >= 4 && (g.clock < 120 || (them - me > 8 && g.clock < 300));
      const fgHelps = !desperate || them - me <= 3;
      if (fd <= 30 + kick * 0.28 && fgHelps && !(g.toGo <= 1 && toGoal < 4)) return 'fg';
      const go = desperate || (g.toGo <= 2 && toGoal < 55) || (g.toGo <= 4 && toGoal < 40 && fd > 30 + kick * 0.28);
      if (!go) return 'punt';
    }
    // Last-second field goal try.
    if ((g.quarter === 2 || (g.quarter >= 4 && me + 3 >= them && me <= them)) && g.clock < 8 && fgDistance(g) < 58) return 'fg';
    const passLean = (t.by.QB.ovr + (t.by.WR1.ovr + t.by.WR2.ovr) / 2 - t.by.RB.ovr - (t.by.OL1.ovr + t.by.OL2.ovr) / 2) / 40;
    let w;
    if (g.toGo <= 2) w = { run_in: 50, run_out: 18, pass_short: 26, pass_mid: 6, pass_deep: 2 };
    else if (g.toGo <= 6) w = { run_in: 22, run_out: 20, pass_short: 32, pass_mid: 20, pass_deep: 6 };
    else w = { run_in: 10, run_out: 10, pass_short: 26, pass_mid: 34, pass_deep: 20 };
    for (const k in w) w[k] *= k.startsWith('pass') ? 1 + passLean : 1 - passLean * 0.7;
    if (late && trailing) { w.run_in *= 0.2; w.run_out *= 0.3; w.pass_deep *= 1.6; }
    if (late && me > them) { w.run_in *= 2.2; w.run_out *= 1.6; w.pass_deep *= 0.3; }
    if (toGoal < 12) { w.pass_deep = 0; w.pass_mid *= 0.5; }
    return pick(g, w);
  }
  function aiDefense(g) {
    const w = { base: 40, blitz: 20, deep: 15, run_stop: 20 };
    if (g.toGo <= 2) { w.run_stop += 30; w.deep = 2; }
    if (g.toGo >= 8) { w.deep += 25; w.run_stop = 6; w.blitz += 8; }
    if (g.quarter >= 4 && g.clock < 120 && g.score[g.poss] < g.score[1 - g.poss]) { w.deep += 30; w.run_stop = 3; }
    return pick(g, w);
  }

  function snap(g, offCall, defCall) {
    const o = g.teams[g.poss], dt = g.teams[1 - g.poss], d = dirOf(g.poss), O = o.by, D = dt.by;
    const def = PG.OFF_PLAYS[offCall];
    g.play = { off: offCall, def: defCall, kind: def.kind, t: 0, startLos: g.los, thrown: false, handoff: false, runRead: false, scramble: false, target: null, qbNext: 0, side: g.rng() < 0.5 ? -1 : 1, result: null, turnover: false, passer: null, catchX: null };
    o.st.plays++;
    emit(g, 'snap', { off: offCall, def: defCall });

    if (def.kind === 'special') return startSpecial(g, offCall);

    const pl = g.play;
    O.OL1.role = O.OL2.role = 'block';
    O.OL1.blk = D.DL1; O.OL2.blk = D.DL2;
    if (def.kind === 'run') {
      O.QB.role = 'handoff';
      O.RB.role = 'runner';
      const inside = offCall === 'run_in';
      const hy = inside ? CY + pl.side * 0.2 : CY + pl.side * 13;
      O.RB.wp = inside ? [[g.los - d * 1.5, hy], [g.los + d * 1.5, hy]] : [[g.los - d * 3.5, CY + pl.side * 8], [g.los + d * 1, hy]];
      O.RB.wpi = 0;
      O.TE.role = 'block'; O.TE.blk = pl.side > 0 ? D.LB2 : D.LB1;
      O.WR1.role = 'block'; O.WR1.blk = D.CB1; O.WR2.role = 'block'; O.WR2.blk = D.CB2;
    } else {
      O.QB.role = 'qb';
      pl.passer = O.QB;
      const rts = ROUTES[offCall];
      let n = 1;
      for (const key of ['WR1', 'WR2', 'TE', 'RB']) {
        const p = O[key], r = rts[key];
        if (!r) { p.role = 'block'; p.blk = null; continue; }
        const inward = p.y < CY ? 1 : -1; // +y is toward middle for a player on the low-y side
        const sgn = key === 'RB' ? 1 : inward;
        p.role = 'route'; p.then = r.then; p.wpi = 0; p.label = n++;
        p.wp = r.pts.map(([f, m]) => [g.los + d * f, clamp(p.y + sgn * m, 2, W - 2)]);
      }
    }
    // Defense assignments.
    D.DL1.role = D.DL2.role = 'rush';
    const cushion = defCall === 'deep' ? 3 : 0;
    D.CB1.role = 'man'; D.CB1.cov = O.WR1; D.CB2.role = 'man'; D.CB2.cov = O.WR2;
    D.CB1.cush = D.CB2.cush = cushion;
    D.S.role = 'deep'; D.S.depth = defCall === 'deep' ? 19 : defCall === 'run_stop' ? 8 : 13;
    if (defCall === 'blitz') { D.LB1.role = 'rush'; D.LB2.role = 'man'; D.LB2.cov = O.TE; D.S.depth = 11; }
    else if (defCall === 'run_stop') { D.LB1.role = 'fit'; D.LB2.role = 'fit'; }
    else if (defCall === 'deep') { D.LB1.role = 'zone'; D.LB1.zy = CY - 8; D.LB2.role = 'zone'; D.LB2.zy = CY + 8; }
    else { D.LB1.role = 'man'; D.LB1.cov = O.RB; D.LB2.role = 'man'; D.LB2.cov = O.TE; }
    for (const p of dt.players) p.cush = p.cush || 0;
    g.phase = 'live';
    g.phaseT = 0;
  }

  // ---------- special teams (resolved with a short ball-flight animation) ----------
  function startSpecial(g, call) {
    const t = g.teams[g.poss], d = dirOf(g.poss), K = t.by.K, kick = K.a.KICK;
    const from = { x: g.los - d * 7, y: CY };
    let to, res;
    if (call === 'fg') {
      const fd = fgDistance(g), good = g.rng() < fgProb(kick, fd);
      K.st.fga++;
      to = { x: oppGoal(g.poss) + d * 10, y: CY + (good ? (g.rng() - 0.5) * 4 : (g.rng() < 0.5 ? -1 : 1) * (5 + g.rng() * 4)) };
      res = { type: 'fg', good, dist: Math.round(fd), kicker: K };
    } else {
      const toGoal = (oppGoal(g.poss) - g.los) * d;
      let net = 30 + kick * 0.16 + (g.rng() - 0.5) * 12;
      let land = g.los + d * net, touchback = false;
      if ((oppGoal(g.poss) - land) * d <= 0) { touchback = true; land = oppGoal(g.poss) - d * 20; net = toGoal - 20; }
      to = { x: land, y: CY + (g.rng() - 0.5) * 20 };
      res = { type: 'punt', net: Math.round(net), touchback, land, kicker: K };
    }
    g.play.special = { from, to, T: call === 'fg' ? 1.7 : 2.3, res };
    g.ball = { x: from.x, y: from.y, z: 0, state: 'air', carrier: null };
    g.phase = 'special';
    g.phaseT = 0;
    emit(g, 'kick');
  }
  function stepSpecial(g) {
    const s = g.play.special, k = clamp(g.phaseT / s.T, 0, 1);
    g.ball.x = s.from.x + (s.to.x - s.from.x) * k;
    g.ball.y = s.from.y + (s.to.y - s.from.y) * k;
    g.ball.z = Math.sin(k * Math.PI) * 12;
    g.clock = Math.max(0, g.clock - DT);
    if (k < 1) return;
    const r = s.res, team = g.poss, other = 1 - team;
    if (r.type === 'fg') {
      if (r.good) {
        g.score[team] += 3; r.kicker.st.fg++;
        log(g, `${r.kicker.mon.name} drills a ${r.dist}-yard field goal!`, true);
        emit(g, 'score', { team, kind: 'FIELD GOAL', pts: 3 });
        endPlay(g, { next: () => startDrive(g, other, null), stopClock: true });
      } else {
        log(g, `${r.kicker.mon.name} misses from ${r.dist} yards.`);
        emit(g, 'banner', { text: 'NO GOOD', team: other });
        const spot = g.los, deep = (oppGoal(team) - spot) * dirOf(team) < 20;
        endPlay(g, { next: () => startDrive(g, other, deep ? ownGoal(other) + dirOf(other) * 20 : spot), stopClock: true });
      }
    } else {
      log(g, `${r.kicker.mon.name} punts ${r.net} yards${r.touchback ? ' for a touchback' : ''}.`);
      endPlay(g, { next: () => startDrive(g, other, r.land), stopClock: true });
    }
  }

  // ---------- movement ----------
  function steer(p, tx, ty, speedMul = 1) {
    const dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy);
    const sp = p.topSpeed * speedMul;
    let wx = 0, wy = 0;
    if (dd > 0.05) { const k = Math.min(1, dd / 0.6); wx = (dx / dd) * sp * k; wy = (dy / dd) * sp * k; }
    accel(p, wx, wy);
  }
  function accel(p, wx, wy) {
    const a = 20 * DT;
    const dvx = wx - p.vx, dvy = wy - p.vy, m = Math.hypot(dvx, dvy);
    if (m <= a) { p.vx = wx; p.vy = wy; } else { p.vx += (dvx / m) * a; p.vy += (dvy / m) * a; }
  }
  function followWaypoints(p, mul = 1) {
    if (!p.wp || p.wpi >= p.wp.length) return false;
    const [tx, ty] = p.wp[p.wpi];
    if (Math.hypot(tx - p.x, ty - p.y) < 0.8) { p.wpi++; return followWaypoints(p, mul); }
    // Don't slow down for intermediate waypoints.
    const dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy) || 1;
    accel(p, (dx / dd) * p.topSpeed * mul, (dy / dd) * p.topSpeed * mul);
    return true;
  }

  function freeDefenders(g, team) { return g.on.filter((p) => p.team === team && !p.eng && p.stun <= 0); }

  // Ball-carrier AI: sample headings, prefer forward progress away from tacklers.
  function carrierAI(g, c) {
    const d = dirOf(c.team), threats = g.on.filter((p) => p.team !== c.team && p.stun <= 0);
    let best = 0, bestScore = -1e9;
    for (let i = -3; i <= 3; i++) {
      const ang = (i * 20 * Math.PI) / 180, ux = Math.cos(ang) * d, uy = Math.sin(ang);
      const px = c.x + ux * 2.6, py = c.y + uy * 2.6;
      let s = Math.cos(ang) * 1.0;
      for (const t of threats) {
        const dd = Math.hypot(t.x + t.vx * 0.25 - px, t.y + t.vy * 0.25 - py);
        if (dd < 4.2) s -= Math.pow(1 - dd / 4.2, 1.5) * (t.eng ? 0.5 : 1.7);
      }
      if (py < 3 || py > W - 3) s -= 1.5;
      if (i === c.lastAng) s += 0.22;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    c.lastAng = best;
    const ang = (best * 20 * Math.PI) / 180;
    accel(c, Math.cos(ang) * d * c.topSpeed * CARRY, Math.sin(ang) * c.topSpeed * CARRY);
  }

  function humanMove(g, p, mul = 1) {
    const { mx, my } = g.input, m = Math.hypot(mx, my);
    if (m < 0.15) { accel(p, 0, 0); return; }
    const k = Math.min(1, m);
    accel(p, (mx / m) * p.topSpeed * mul * k, (my / m) * p.topSpeed * mul * k);
  }

  function pressureOn(g, qb) {
    let near = 99;
    for (const p of g.on) if (p.team !== qb.team && !p.eng && p.stun <= 0) near = Math.min(near, dist(p, qb));
    return near;
  }
  function openness(g, r) {
    let near = 99;
    for (const p of g.on) if (p.team !== r.team) near = Math.min(near, Math.hypot(p.x - (r.x + r.vx * 0.3), p.y - (r.y + r.vy * 0.3)));
    return near;
  }

  function throwBall(g, qb, rec, throwaway) {
    const pl = g.play, d = dirOf(qb.team);
    const v = 17 + qb.a.ARM * 0.11;
    let ax = rec.x, ay = rec.y, T = 0.5;
    for (let i = 0; i < 4; i++) { T = Math.hypot(ax - qb.x, ay - qb.y) / v; ax = rec.x + rec.vx * T; ay = rec.y + rec.vy * T; }
    const dd = Math.hypot(ax - qb.x, ay - qb.y);
    const pressured = pressureOn(g, qb) < 2.6;
    const moving = Math.hypot(qb.vx, qb.vy) > qb.topSpeed * 0.6;
    const sigma = (0.45 + dd * 0.05) * (1 + (72 - qb.a.ACC) / 55) * (pressured ? 1.7 : 1) * (moving ? 1.25 : 1);
    const gauss = () => (g.rng() + g.rng() + g.rng() - 1.5) * 1.15;
    ax += gauss() * sigma; ay += gauss() * sigma;
    if (throwaway) { ax = qb.x + d * 14; ay = qb.y < CY ? -4 : W + 4; }
    ay = clamp(ay, -5, W + 5);
    T = Math.max(0.25, Math.hypot(ax - qb.x, ay - qb.y) / v);
    pl.thrown = true; pl.target = throwaway ? null : rec; pl.throwaway = !!throwaway;
    pl.air = { fx: qb.x, fy: qb.y, tx: ax, ty: ay, T, t: 0, h: clamp(dd * 0.16, 1.2, 9) };
    g.ball = { x: qb.x, y: qb.y, z: 1.5, state: 'air', carrier: null };
    qb.st.att++;
    qb.role = 'idle';
    emit(g, 'throw');
  }

  function qbAI(g, qb) {
    const pl = g.play, d = dirOf(qb.team);
    const dropX = pl.startLos - d * 7.5;
    const press = pressureOn(g, qb);
    if (pl.scramble) return;
    if (pl.windup) { accel(qb, 0, 0); if (pl.t >= pl.windup.at) { const w = pl.windup; pl.windup = null; throwBall(g, qb, w.rec, w.away); } return; }
    const wind = (rec, away) => { pl.windup = { rec, away, at: pl.t + 0.22 - (qb.a.ACC - 60) * 0.002 }; };
    // Slide away from the nearest free rusher while keeping depth.
    if (press < 4) {
      let rx = 0, ry = 0;
      for (const p of g.on) if (p.team !== qb.team && !p.eng) { const dd = dist(p, qb); if (dd < 5) { rx += (qb.x - p.x) / dd; ry += (qb.y - p.y) / dd; } }
      steer(qb, qb.x + rx * 3 - d * 0.5, qb.y + ry * 3, 0.85);
    } else steer(qb, dropX, CY, 0.8);

    const ready = pl.off === 'pass_short' ? 0.9 : pl.off === 'pass_mid' ? 1.5 : 2.0;
    if (pl.t < pl.qbNext) return;
    pl.qbNext = pl.t + 0.18;
    const recs = g.on.filter((p) => p.team === qb.team && p.role === 'route');
    let best = null, bestS = -1e9;
    for (const r of recs) {
      const open = openness(g, r), gain = (r.x - pl.startLos) * d, td = dist(r, qb);
      if (td > 22 + qb.a.ARM * 0.38) continue;
      const s = Math.min(open, 6) * 1.5 + Math.max(-2, gain) * (pl.off === 'pass_deep' ? 0.16 : 0.1) - td * 0.03 + (r.wpi > 0 ? 1 : 0) - (gain < 3 && pl.t < ready + 1.2 && press > 3.5 ? 3.5 : 0);
      r._open = open;
      if (s > bestS) { bestS = s; best = r; }
    }
    const patience = clamp((pl.t - ready) / 2.2, 0, 1);
    const need = 2.7 - patience * 1.6;
    if (press < 2.8 && pl.t > 0.6) {
      if (best && best._open > 1.5) return wind(best);
      if (qb.a.SPD > 60 && g.rng() < 0.5) { pl.scramble = true; qb.role = 'runner'; return; }
      if (g.rng() < 0.25 && best) return wind(best, true);
      if (g.rng() < 0.3 && best) return wind(best);
      return;
    }
    if (pl.t >= ready && best && best._open >= need) return wind(best);
    if (pl.t > ready + 2.6) {
      if (best && best._open > 1.0) return wind(best);
      if (qb.a.SPD > 55) { pl.scramble = true; qb.role = 'runner'; } else if (best) wind(best, true);
    }
  }

  function stepLive(g) {
    const pl = g.play, offT = g.poss, d = dirOf(offT), O = g.teams[offT].by, ball = g.ball;
    pl.t += DT;
    g.clock = Math.max(0, g.clock - DT);
    const humanOff = g.human === offT, humanDef = g.human === 1 - offT;
    const carrier = ball.carrier;

    // Handoff / toss timing on run plays.
    if (pl.kind === 'run' && !pl.handoff && pl.t > 0.35) {
      pl.handoff = true; ball.carrier = O.RB; pl.handT = pl.t; emit(g, 'handoff');
    }
    // Defense reads run once the back has it, or once anyone crosses the line with the ball.
    const c = ball.carrier;
    if (c && !pl.runRead) {
      const past = (c.x - pl.startLos) * dirOf(c.team) > -0.5;
      if ((pl.kind === 'run' && pl.handoff && pl.t > pl.handT + 0.35) || (c.team === offT && (c !== O.QB || pl.scramble) && past) || (c === O.QB && past) || pl.turnover) pl.runRead = true;
    }

    // Human player selection.
    let ctrl = null;
    if (humanOff) ctrl = ball.state === 'held' ? ball.carrier : (pl.target && pl.target.team === offT ? null : null);
    if (humanDef || (g.human != null && pl.turnover && c && c.team !== g.human)) {
      const mine = g.on.filter((p) => p.team === g.human);
      if (!g.ctrlDef || !mine.includes(g.ctrlDef)) g.ctrlDef = g.teams[g.human].by.S && mine.includes(g.teams[g.human].by.LB2) ? g.teams[g.human].by.LB2 : mine[0];
      if (g.input.action) {
        g.input.action = false;
        const bp = ball;
        g.ctrlDef = mine.filter((p) => !p.eng).sort((a, b) => dist(a, bp) - dist(b, bp))[0] || g.ctrlDef;
      }
      ctrl = g.ctrlDef;
    }
    if (g.human != null && pl.turnover && c && c.team === g.human) ctrl = c;
    g.ctrl = ctrl;

    for (const p of g.on) {
      if (p.stun > 0) { p.stun -= DT; accel(p, 0, 0); continue; }
      if (p.immune > 0) p.immune -= DT;
      if (p.tklCd > 0) p.tklCd -= DT;
      if (p.jukeCd > 0) p.jukeCd -= DT;
      if (p.juke > 0) p.juke -= DT;
      if (p.eng) continue; // handled in engagement pass
      const isOff = p.team === (c ? c.team : offT) && !(ball.state === 'air');
      const hasBall = c === p;

      // --- ball carrier ---
      if (hasBall) {
        if (p === ctrl) {
          if (g.input.action && p.jukeCd <= 0 && !(p === O.QB && pl.kind === 'pass' && !pl.scramble && (p.x - pl.startLos) * d < 0)) { p.juke = 0.45; p.jukeCd = 2.2; emit(g, 'juke'); }
          g.input.action = false;
          humanMove(g, p, p.juke > 0 ? 1.15 : CARRY + 0.03);
          if (p === O.QB && pl.kind === 'pass' && !pl.thrown) {
            if ((p.x - pl.startLos) * d > 0) pl.scramble = true;
            else if (g.input.throwTo != null) {
              const r = g.on.find((q) => q.team === offT && q.label === g.input.throwTo);
              if (r) throwBall(g, p, r);
            }
          }
          g.input.throwTo = null;
        } else if (p.role === 'handoff') steer(p, O.RB.x, O.RB.y, 0.5);
        else if (p.role === 'qb') qbAI(g, p);
        else if (p.role === 'runner' && p.wp && p.wpi < p.wp.length && (p.x - pl.startLos) * d < 1.5 && pl.t < 2.2) followWaypoints(p, 1);
        else carrierAI(g, p);
        continue;
      }
      if (p === ctrl && p.team === g.human) { humanMove(g, p, 1); continue; }

      // --- ball in the air ---
      if (ball.state === 'air' && pl.air) {
        const a = pl.air, dd = Math.hypot(a.tx - p.x, a.ty - p.y), left = a.T - a.t;
        if (p === pl.target) { steer(p, a.tx, a.ty, 1); continue; }
        if (p.team !== offT && a.t > 0.1 + (99 - p.a.COVER) * 0.004 && dd < 9 + left * 4) { steer(p, a.tx, a.ty, 1); continue; }
      }

      // --- offense without the ball ---
      if (p.team === offT && !pl.turnover) {
        if (p.role === 'route') {
          if (c && c !== O.QB && c.team === offT) { blockFor(g, p, c); continue; }
          if (pl.scramble) { blockFor(g, p, O.QB); continue; }
          if (!followWaypoints(p, 1)) {
            if (p.then === 'go') { const last = p.wp[p.wp.length - 1], prev = p.wp[p.wp.length - 2] || [pl.startLos, last[1]]; const ux = last[0] - prev[0], uy = last[1] - prev[1], m = Math.hypot(ux, uy) || 1; const ty = p.y + (uy / m) * 5; accel(p, (ux / m) * p.topSpeed, ty < 3 || ty > W - 3 ? 0 : (uy / m) * p.topSpeed); }
            else accel(p, 0, 0);
          }
          continue;
        }
        if (p.role === 'block') { blockFor(g, p, c && c.team === offT ? c : O.QB); continue; }
        if (p.role === 'handoff' || p.role === 'idle' || p.role === 'qb') { accel(p, 0, 0); continue; }
        if (p.role === 'runner' && !hasBall) { // waiting for the handoff
          followWaypoints(p, 0.9); continue;
        }
        accel(p, 0, 0);
        continue;
      }
      // After a turnover the old offense chases, the new offense escorts.
      if (pl.turnover && c) {
        if (p.team === c.team) steer(p, c.x + dirOf(c.team) * 3, p.y, 0.8); else pursue(p, c);
        continue;
      }

      // --- defense ---
      if (pl.runRead && c) { pursue(p, c); continue; }
      const qb = O.QB;
      if (p.role === 'rush') { pursue(p, c || qb); continue; }
      if (p.role === 'fit') { if (pl.t < 0.9) steer(p, pl.startLos + d * 1.2, p.y + (CY - p.y) * 0.4, 0.9); else pursue(p, c || qb); continue; }
      if (p.role === 'man') {
        const r = p.cov;
        // Reaction lag: trail a delayed copy of the receiver.
        const k = clamp(DT * (3.2 + (p.a.COVER - 60) * 0.06), 0.02, 0.5);
        p.lagx += (r.x + r.vx * 0.25 - p.lagx) * k * 3; p.lagy += (r.y + r.vy * 0.25 - p.lagy) * k * 3;
        // Hold depth until the receiver closes the cushion, then turn and run with him.
        const rv = Math.min(1, Math.hypot(r.vx, r.vy) / 5);
        let tx = p.lagx + d * (0.7 + 1.7 * rv + p.cush) + r.vx * 0.3;
        if ((tx - p.x) * d < 0) tx = p.x + (r.vx * d > 2 ? d * 0.8 : 0);
        steer(p, tx, p.lagy + (CY - r.y) * 0.04, 1.04);
        continue;
      }
      if (p.role === 'deep') {
        let deepest = pl.startLos + d * p.depth, wy = CY, wsum = 0;
        for (const r of g.on) if (r.team === offT && r.role === 'route') {
          const gain = (r.x - pl.startLos) * d;
          if (gain + 4 > (deepest - pl.startLos) * d) deepest = r.x + d * 4;
          if (gain > 8) { wy += r.y * gain; wsum += gain; }
        }
        const ty = wsum ? (wy - CY) / wsum : CY;
        steer(p, deepest, CY + (ty - CY) * 0.55, 0.9);
        continue;
      }
      if (p.role === 'zone') {
        let tx = pl.startLos + d * 9, ty = p.zy, nd = 7;
        for (const r of g.on) if (r.team === offT && r.role === 'route') { const dd = dist(r, p); if (dd < nd && Math.abs(r.y - p.zy) < 12) { nd = dd; tx = r.x + d; ty = r.y; } }
        steer(p, tx, ty, 0.9);
        continue;
      }
      accel(p, 0, 0);
    }

    engagements(g);
    integrate(g);
    if (ball.state === 'air') stepBallAir(g);
    else if (ball.carrier) { ball.x = ball.carrier.x; ball.y = ball.carrier.y; ball.z = 1; checkCarrier(g); }
  }

  function pursue(p, c) {
    const dd = dist(p, c), t = clamp(dd / (p.topSpeed + 0.1), 0, 0.9);
    steer(p, c.x + c.vx * t, c.y + c.vy * t, 1);
  }

  function blockFor(g, p, protect) {
    const pl = g.play;
    let tgt = p.blk && !p.blk.eng && p.blk.stun <= 0 && p.blk.immune <= 0 ? p.blk : null;
    if (!tgt || (pl.runRead && dist(tgt, protect) > 14)) {
      let bd = 12;
      tgt = null;
      for (const q of g.on) if (q.team !== p.team && !q.eng && q.stun <= 0 && q.immune <= 0) {
        const dd = dist(q, p) + dist(q, protect) * 0.5;
        if (dd < bd) { bd = dd; tgt = q; }
      }
    }
    if (!tgt) { steer(p, protect.x + dirOf(p.team) * 2, p.y, 0.7); return; }
    const pass = pl.kind === 'pass' && !pl.scramble && protect === g.teams[p.team].by.QB;
    if (pass && dist(tgt, p) > 4.5) {
      // Pass set: stay between the rusher and the passer rather than chasing.
      const dx = tgt.x - protect.x, dy = tgt.y - protect.y, m = Math.hypot(dx, dy) || 1;
      steer(p, protect.x + (dx / m) * 3.2, protect.y + (dy / m) * 3.2, 0.8);
    } else steer(p, tgt.x + tgt.vx * 0.15, tgt.y + tgt.vy * 0.15, 0.95);
    if (dist(tgt, p) < 1.35 && !(g.ctrl === tgt && g.rng() < 0.5)) { p.eng = tgt; tgt.eng = p; p.engT = 0; }
  }

  function engagements(g) {
    const pl = g.play, c = g.ball.carrier, offT = g.poss;
    for (const b of g.on) {
      if (!b.eng || b.team !== (pl.turnover ? -1 : offT)) continue;
      const r = b.eng; // b blocks r
      if (pl.turnover) { b.eng = r.eng = null; continue; }
      const goal = c && c.team === offT ? c : g.teams[offT].by.QB;
      const dx = goal.x - r.x, dy = goal.y - r.y, m = Math.hypot(dx, dy) || 1;
      const edge = r.a.RUSH * 0.6 + r.a.PWR * 0.4 - (b.a.BLOCK * 0.75 + b.a.PWR * 0.25) + PG.typeEdge(r.mon, b.mon);
      const push = r.topSpeed * clamp(0.14 + edge / 160, 0.03, 0.34) * (g.ctrl === r ? 1.6 : 1);
      r.vx = (dx / m) * push; r.vy = (dy / m) * push;
      b.x = r.x + (dx / m) * 1.0; b.y = r.y + (dy / m) * 1.0; b.vx = r.vx; b.vy = r.vy;
      b.engT += DT;
      // Ball thrown or carrier past them: blocks release.
      const rate = (pl.kind === 'run' ? 0.14 : 0.33) * (b.pos === 'OL' ? 1 : b.pos === 'TE' ? 1.6 : 3.2) * Math.exp(edge / 15) * (g.ctrl === r ? 2.2 : 1);
      const done = g.ball.state === 'air' || (c && c.team === offT && (c.x - r.x) * dirOf(offT) > 3 && c !== g.teams[offT].by.QB);
      if (done || g.rng() < rate * DT) {
        b.eng = r.eng = null;
        if (!done) { b.stun = 0.9; r.immune = 1.6; if (Math.abs(PG.typeEdge(r.mon, b.mon)) >= 2 && g.rng() < 0.5) emit(g, 'shed', { p: r }); }
        else r.immune = 0.4;
      }
    }
  }

  function integrate(g) {
    const on = g.on;
    for (const p of on) {
      p.x += p.vx * DT; p.y += p.vy * DT;
      if (Math.abs(p.vx) > 0.4) p.face = p.vx > 0 ? 1 : -1;
      if (p !== g.ball.carrier) p.y = clamp(p.y, 0.5, W - 0.5);
      p.x = clamp(p.x, 0.5, 119.5);
    }
    // Keep bodies from stacking.
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
      const a = on[i], b = on[j];
      if (a.eng === b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy);
      const min = a.team === b.team ? 1.0 : 0.7;
      if (dd < min && dd > 0.001) { const push = (min - dd) / 2; a.x -= (dx / dd) * push; a.y -= (dy / dd) * push; b.x += (dx / dd) * push; b.y += (dy / dd) * push; }
    }
  }

  function stepBallAir(g) {
    const pl = g.play, a = pl.air, ball = g.ball, offT = g.poss;
    a.t += DT;
    const k = clamp(a.t / a.T, 0, 1);
    ball.x = a.fx + (a.tx - a.fx) * k; ball.y = a.fy + (a.ty - a.fy) * k; ball.z = 1.5 + Math.sin(k * Math.PI) * a.h;
    if (k < 1) return;
    const spot = { x: a.tx, y: a.ty }, rec = pl.target, qb = pl.passer;
    const defs = g.on.filter((p) => p.team !== offT && p.stun <= 0).map((p) => ({ p, d: dist(p, spot) })).sort((x, y) => x.d - y.d);
    const inBounds = spot.y > 0.3 && spot.y < W - 0.3 && spot.x > 0.5 && spot.x < 119.5;
    const dR = rec ? dist(rec, spot) : 99;
    const near = defs[0];
    const incomplete = (why) => {
      log(g, why);
      emit(g, 'incomplete');
      endPlay(g, { stopClock: true, next: () => nextDown(g, 0) });
    };
    if (!inBounds || pl.throwaway) return incomplete(`${qb.mon.name} throws it away.`);
    const intercept = (dp) => {
      dp.st.pick++; qb.st.int++; g.teams[offT].st.to++;
      pl.turnover = true; pl.runRead = true;
      ball.state = 'held'; ball.carrier = dp;
      for (const p of g.on) { p.eng = null; p.label = null; }
      log(g, `INTERCEPTED! ${dp.mon.name} picks off ${qb.mon.name}!`, true);
      emit(g, 'banner', { text: 'INTERCEPTION!', team: dp.team });
      emit(g, 'int');
    };
    if (dR > 2.3) {
      if (near && near.d < 1.4 && g.rng() < 0.16 + (near.p.a.COVER - 60) / 200) return intercept(near.p);
      return incomplete(`${qb.mon.name}'s pass for ${rec.mon.name} falls incomplete.`);
    }
    let catchP = 0.89 - 0.08 * dR + (rec.a.HANDS - 70) / 180;
    for (const { p, d: dd } of defs) {
      if (dd > 2.6) break;
      const c = 1 - dd / 2.6, edge = p.a.COVER - rec.a.HANDS + PG.typeEdge(p.mon, rec.mon);
      const human = g.ctrl === p ? 1.5 : 1;
      const ip = c * 0.036 * (1 + edge / 50) * (dd < dR ? 2.2 : 1) * human;
      if (g.rng() < ip) return intercept(p);
      catchP -= c * clamp(0.5 + edge / 90, 0.15, 0.85) * human;
    }
    if (g.rng() < clamp(catchP, 0.04, 0.98)) {
      ball.state = 'held'; ball.carrier = rec;
      rec.x = rec.x + (spot.x - rec.x) * 0.6; rec.y = rec.y + (spot.y - rec.y) * 0.6;
      rec.role = 'runner'; rec.wp = null; rec.lastAng = 0; rec.vx *= 0.3; rec.vy *= 0.3;
      pl.caught = true; pl.catchX = rec.x; pl.receiver = rec;
      for (const p of g.on) p.label = null;
      emit(g, 'catch');
      checkCarrier(g);
    } else {
      const defended = near && near.d < 2.2;
      incomplete(defended ? `${near.p.mon.name} breaks up the pass to ${rec.mon.name}.` : `${rec.mon.name} can't hang on.`);
    }
  }

  function checkCarrier(g) {
    const pl = g.play, c = g.ball.carrier, ball = g.ball;
    if (!c || g.phase !== 'live') return;
    const d = dirOf(c.team);
    // Touchdown.
    if ((c.x - oppGoal(c.team)) * d >= 0) return touchdown(g, c);
    // Out of bounds.
    if (c.y <= 0.2 || c.y >= W - 0.2) return downAt(g, c, null, true);
    for (const t of g.on) {
      if (t.team === c.team || t.stun > 0 || t.eng || t.tklCd > 0) continue;
      const td = dist(t, c);
      if (td > 1.6) continue;
      t.tklCd = 0.6;
      const elus = c.a.PWR * 0.5 + c.a.SPD * 0.5;
      let p = 0.86 - Math.max(0, td - 1) * 0.35 + (t.a.TACKLE - elus + PG.typeEdge(t.mon, c.mon)) / 105;
      if (c.juke > 0) p -= 0.38;
      if (g.ctrl === t) p += 0.1;
      const isQB = c === g.teams[g.poss].by.QB && pl.kind === 'pass' && !pl.turnover && (c.x - pl.startLos) * d < 0;
      if (isQB) p += 0.15;
      if (g.rng() < clamp(p, 0.2, 0.97)) return downAt(g, c, t, false);
      t.stun = 0.6; c.vx *= 0.45; c.vy *= 0.45;
      emit(g, 'broken', { p: c, t });
      pl.broken = (pl.broken || 0) + 1;
    }
    ball.x = c.x; ball.y = c.y;
  }

  function creditYards(g, c, endX) {
    const pl = g.play, offT = g.poss, d = dirOf(offT), T = g.teams[offT];
    const yds = Math.round((endX - pl.startLos) * d);
    pl.yds = yds;
    if (pl.turnover) return yds;
    T.st.yds += yds;
    if (pl.caught) {
      const qb = pl.passer;
      qb.st.cmp++; qb.st.pyd += yds; c.st.rec++; c.st.recyd += yds; T.st.pyd += yds;
    } else if (pl.kind === 'pass' && c === T.by.QB && !pl.scramble && yds < 0) { T.st.pyd += yds; }
    else { c.st.car++; c.st.ryd += yds; T.st.ryd += yds; }
    return yds;
  }

  function touchdown(g, c) {
    const pl = g.play, team = c.team, K = g.teams[team].by.K;
    const yds = creditYards(g, c, oppGoal(g.poss));
    if (!pl.turnover) { if (pl.caught) { pl.passer.st.ptd++; c.st.rectd++; } else c.st.rtd++; }
    g.score[team] += 6;
    const how = pl.turnover ? `${c.mon.name} takes the interception to the house!` : pl.caught ? `${pl.passer.mon.name} finds ${c.mon.name} for a ${yds}-yard TOUCHDOWN!` : `${c.mon.name} runs it in from ${yds} yard${yds === 1 ? '' : 's'} out. TOUCHDOWN!`;
    const patGood = g.rng() < 0.9 + K.a.KICK / 1100;
    if (patGood) g.score[team] += 1;
    log(g, how + (patGood ? ` ${K.mon.name} adds the extra point.` : ` ${K.mon.name} misses the extra point!`), true);
    emit(g, 'score', { team, kind: 'TOUCHDOWN!', pts: 6, p: c });
    endPlay(g, { stopClock: true, long: true, next: () => startDrive(g, 1 - team, null) });
  }

  function downAt(g, c, tackler, oob) {
    const pl = g.play, offT = g.poss, d = dirOf(offT), T = g.teams[offT];
    if (tackler) { tackler.st.tkl++; emit(g, 'tackle', { p: c, t: tackler }); }
    const x = c.x;
    if (pl.turnover) {
      // Interception return ends here.
      const t = c.team, inOwnEZ = (x - ownGoal(t)) * dirOf(t) <= 0;
      log(g, `${c.mon.name} is brought down after the pick.`);
      return endPlay(g, { stopClock: true, next: () => startDrive(g, t, inOwnEZ ? ownGoal(t) + dirOf(t) * 20 : x) });
    }
    // Safety.
    if ((x - ownGoal(offT)) * d <= 0) {
      creditYards(g, c, x);
      g.score[1 - offT] += 2;
      log(g, `SAFETY! ${tackler ? tackler.mon.name : 'The defense'} drops ${c.mon.name} in the end zone.`, true);
      emit(g, 'score', { team: 1 - offT, kind: 'SAFETY!', pts: 2 });
      return endPlay(g, { stopClock: true, long: true, next: () => startDrive(g, 1 - offT, ownGoal(1 - offT) + dirOf(1 - offT) * 40) });
    }
    const yds = creditYards(g, c, x);
    const sack = pl.kind === 'pass' && c === T.by.QB && !pl.scramble && yds <= 0;
    let text;
    const eff = tackler ? PG.typeEdge(tackler.mon, c.mon) : 0;
    const flair = eff >= 3 ? " It's super effective!" : '';
    if (sack) { pl.sack = true; tackler && tackler.st.sack++; text = `SACK! ${tackler ? tackler.mon.name : 'The rush'} drops ${c.mon.name}${yds < 0 ? ` for a loss of ${-yds}` : ' at the line'}.${flair}`; emit(g, 'banner', { text: 'SACK!', team: 1 - offT }); }
    else if (pl.caught) text = `${pl.passer.mon.name} to ${c.mon.name} for ${yds} yard${Math.abs(yds) === 1 ? '' : 's'}${oob ? ', out of bounds' : tackler ? `, tackled by ${tackler.mon.name}` : ''}.`;
    else text = `${c.mon.name} ${pl.scramble ? 'scrambles' : 'runs'} for ${yds <= 0 ? (yds === 0 ? 'no gain' : `a loss of ${-yds}`) : `${yds} yard${yds === 1 ? '' : 's'}`}${oob ? ', out of bounds' : tackler ? `. Stopped by ${tackler.mon.name}` : ''}.${yds <= 0 ? flair : ''}`;
    if (yds >= 20) emit(g, 'banner', { text: `${yds}-YARD GAIN!`, team: offT });
    log(g, text, yds >= 20 || sack);
    endPlay(g, { stopClock: oob, next: () => nextDown(g, yds, x) });
  }

  function nextDown(g, yds, x) {
    const offT = g.poss, d = dirOf(offT);
    if (x != null) g.los = clamp(x, 10.5, 109.5);
    if (x != null && (g.los - g.fdx) * d >= -0.01) {
      g.teams[offT].st.first++;
      g.down = 1; setFirstDown(g);
      emit(g, 'firstdown');
    } else {
      g.down++;
      g.toGo = Math.max(1, Math.round((g.fdx - g.los) * d));
      if (g.down > 4) {
        log(g, `Turnover on downs! ${g.teams[1 - offT].name} take over.`, true);
        g.teams[offT].st.to++;
        emit(g, 'banner', { text: 'TURNOVER ON DOWNS', team: 1 - offT });
        return startDrive(g, 1 - offT, g.los);
      }
    }
    setupPresnap(g);
  }

  function endPlay(g, { next, stopClock, long }) {
    if (g.play) g.hist.push({ off: g.play.off, def: g.play.def, yds: g.play.yds ?? 0, caught: !!g.play.caught, air: g.play.catchX == null ? null : (g.play.catchX - g.play.startLos) * dirOf(g.poss), t: g.play.t, turnover: g.play.turnover, sack: !!g.play.sack });
    g.phase = 'dead';
    g.phaseT = 0;
    g.deadLen = long ? 2.6 : 1.5;
    g.pendingNext = next;
    g.stopClock = !!stopClock;
    g.ball.state = g.ball.carrier ? 'held' : 'dead';
    g.ctrl = null;
    emit(g, 'whistle');
  }

  function afterPlay(g) {
    // Run-off between plays when the clock is live.
    if (!g.stopClock && g.clock > 0) g.clock = Math.max(0, g.clock - 15);
    const next = g.pendingNext;
    g.pendingNext = null;
    if (g.clock <= 0) {
      const tied = g.score[0] === g.score[1];
      if (g.quarter === 2) {
        g.quarter = 3; g.clock = g.quarterLen;
        log(g, 'Halftime.', true); emit(g, 'banner', { text: 'HALFTIME', team: null });
        return startDrive(g, 1 - g.kickoffTeam, null);
      }
      if (g.quarter >= 4 && !tied) return finish(g);
      if (g.quarter >= 5) return finish(g);
      next();
      if (g.quarter === 4) { g.quarter = 5; g.clock = Math.round(g.quarterLen * 0.6); g.sudden = true; log(g, 'Overtime! Next score wins.', true); emit(g, 'banner', { text: 'OVERTIME', team: null }); return startDrive(g, g.kickoffTeam, null); }
      g.quarter++; g.clock = g.quarterLen;
      emit(g, 'banner', { text: `END OF Q${g.quarter - 1}`, team: null });
      return;
    }
    if (g.sudden && g.score[0] !== g.score[1]) return finish(g);
    next();
  }
  function finish(g) {
    g.over = true; g.phase = 'final';
    const [a, b] = g.score;
    log(g, a === b ? `Final: ${a}-${b}. It's a tie!` : `Final: ${g.teams[a > b ? 0 : 1].name} win ${Math.max(a, b)}-${Math.min(a, b)}!`, true);
    emit(g, 'final');
  }

  // Advance the game by one fixed tick.
  PG.step = function (g) {
    if (g.over) return;
    g.t += DT; g.phaseT += DT;
    if (g.phase === 'presnap') {
      const humanOff = g.human === g.poss, humanDef = g.human === 1 - g.poss;
      if (g.human != null && g.needCall) { if (!g.input.call) { g.phaseT = 0; return; } g.needCall = false; g.humanCall = g.input.call; g.input.call = null; g.phaseT = 0; }
      if (humanOff) { if (!g.input.snap) return; }
      else if (g.phaseT < (humanDef ? 1.3 : 1.1)) return;
      g.input.snap = false; g.input.action = false; g.input.throwTo = null;
      const off = humanOff ? g.humanCall : aiOffense(g);
      const def = humanDef ? g.humanCall : aiDefense(g);
      g.ctrlDef = null;
      snap(g, off, def);
    } else if (g.phase === 'live') {
      stepLive(g);
      if (g.phase === 'live' && g.play.t > 14) { // safety valve
        const c = g.ball.carrier || g.teams[g.poss].by.QB; g.ball.carrier = c; g.ball.state = 'held'; downAt(g, c, null, false);
      }
    } else if (g.phase === 'special') stepSpecial(g);
    else if (g.phase === 'dead') {
      for (const p of g.on) { accel(p, 0, 0); p.x += p.vx * DT; p.y += p.vy * DT; }
      if (g.phaseT >= g.deadLen) afterPlay(g);
    }
  };

  // Run a whole game with no rendering.
  PG.simulate = function (home, away, opts = {}) {
    const g = PG.createGame(home, away, opts);
    let guard = 0;
    while (!g.over && guard++ < 400000) { PG.step(g); g.events.length = 0; }
    return g;
  };
  PG.finishNow = function (g) {
    g.human = null; g.needCall = false;
    let guard = 0;
    while (!g.over && guard++ < 400000) { PG.step(g); g.events.length = 0; }
  };
})();
