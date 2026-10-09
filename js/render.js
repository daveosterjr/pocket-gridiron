// Canvas renderer for a live game, plus the shareable lineup card.
(function () {
  const PG = (globalThis.PG = globalThis.PG || {});
  const W = PG.FIELD_W;

  PG.Renderer = function (canvas) {
    const ctx = canvas.getContext('2d');
    const cam = { x: 60, y: W / 2, init: false };
    const fx = { banners: [], confetti: [], pops: [] };
    let view = { s: 10, vertical: false, cw: 0, ch: 0 };

    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1), r = canvas.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      view.cw = canvas.width; view.ch = canvas.height; view.dpr = dpr;
      view.vertical = r.height > r.width * 1.05;
      const cross = view.vertical ? view.cw : view.ch, along = view.vertical ? view.ch : view.cw;
      view.s = Math.max(cross / (W + 5), along / 72);
      view.along = along / view.s; view.cross = cross / view.s;
    }
    // world -> screen
    function X(x, y) { return view.vertical ? view.cw / 2 + (y - cam.y) * view.s : view.cw / 2 + (x - cam.x) * view.s; }
    function Y(x, y) { return view.vertical ? view.ch / 2 - (x - cam.x) * view.s : view.ch / 2 + (y - cam.y) * view.s; }
    // screen-space input vector -> world vector
    function toWorld(dx, dy) { return view.vertical ? { x: -dy, y: dx } : { x: dx, y: dy }; }

    function updateCam(g, dt) {
      const b = g.ball, d = PG.dirOf(g.poss);
      let tx = b.x + (g.phase === 'presnap' || g.phase === 'live' ? d * view.along * 0.12 : 0), ty = b.y;
      const hx = view.along / 2, hy = view.cross / 2;
      tx = view.along >= 122 ? 60 : Math.max(hx - 1, Math.min(121 - hx, tx));
      ty = view.cross >= W + 4 ? W / 2 : Math.max(hy - 2.5, Math.min(W + 2.5 - hy, ty));
      if (!cam.init) { cam.x = tx; cam.y = ty; cam.init = true; }
      const k = 1 - Math.exp(-dt * 4);
      cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    }

    function rect(x0, y0, x1, y1) { // world-aligned rectangle
      const ax = X(x0, y0), ay = Y(x0, y0), bx = X(x1, y1), by = Y(x1, y1);
      ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
    }
    function line(x0, y0, x1, y1) { ctx.beginPath(); ctx.moveTo(X(x0, y0), Y(x0, y0)); ctx.lineTo(X(x1, y1), Y(x1, y1)); ctx.stroke(); }

    function drawField(g) {
      const s = view.s;
      ctx.fillStyle = '#14351f'; ctx.fillRect(0, 0, view.cw, view.ch);
      for (let x = 10; x < 110; x += 5) { ctx.fillStyle = (x / 5) % 2 ? '#2f8f46' : '#2a8340'; rect(x, 0, x + 5, W); }
      ctx.fillStyle = g.teams[0].color; rect(0, 0, 10, W);
      ctx.fillStyle = g.teams[1].color; rect(110, 0, 120, W);
      ctx.fillStyle = 'rgba(0,0,0,.18)'; rect(0, 0, 10, W); rect(110, 0, 120, W);
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, s * 0.14);
      for (let x = 10; x <= 110; x += 5) line(x, 0, x, W);
      ctx.lineWidth = Math.max(2, s * 0.3); ctx.strokeStyle = '#fff';
      line(0, 0, 120, 0); line(0, W, 120, W); line(0, 0, 0, W); line(120, 0, 120, W);
      // Hash marks.
      ctx.lineWidth = Math.max(1, s * 0.1); ctx.strokeStyle = 'rgba(255,255,255,.55)';
      for (let x = 11; x < 110; x++) if (x % 5) { line(x, 19.5, x, 20.5); line(x, W - 20.5, x, W - 19.5); }
      // Yard numbers.
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = `800 ${Math.round(s * 3.4)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let x = 20; x <= 100; x += 10) { const n = x <= 60 ? x - 10 : 110 - x; ctx.fillText(n, X(x, 8), Y(x, 8)); ctx.fillText(n, X(x, W - 8), Y(x, W - 8)); }
      // End zone names.
      ctx.font = `900 ${Math.round(s * 3.6)}px system-ui, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.85)';
      for (const [t, x] of [[0, 5], [1, 115]]) {
        ctx.save(); ctx.translate(X(x, W / 2), Y(x, W / 2)); if (!view.vertical) ctx.rotate(t ? Math.PI / 2 : -Math.PI / 2);
        ctx.fillText(g.teams[t].name.toUpperCase().slice(0, 22), 0, 0, s * (view.vertical ? W - 4 : W - 6)); ctx.restore();
      }
      // Goal posts.
      ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = Math.max(2, s * 0.35);
      line(0.6, W / 2 - 3.1, 0.6, W / 2 + 3.1); line(119.4, W / 2 - 3.1, 119.4, W / 2 + 3.1);
      // Scrimmage and first-down markers.
      if (g.phase === 'presnap' || g.phase === 'live' || g.phase === 'special') {
        const los = g.play ? g.play.startLos : g.los;
        ctx.lineWidth = Math.max(2, s * 0.28);
        ctx.strokeStyle = 'rgba(70,140,255,.9)'; line(los, 0, los, W);
        if (!g.goalToGo) { ctx.strokeStyle = 'rgba(255,220,40,.95)'; line(g.fdx, 0, g.fdx, W); }
      }
    }

    function drawPlayer(g, p, time) {
      const s = view.s, sx = X(p.x, p.y), sy = Y(p.x, p.y);
      const size = Math.max(30 * view.dpr, Math.min(70 * view.dpr, s * 4.6));
      const moving = Math.hypot(p.vx, p.vy);
      const bob = g.phase === 'live' ? Math.abs(Math.sin(time * 11 + p.mon.id)) * Math.min(1, moving / 4) * size * 0.08 : 0;
      const team = g.teams[p.team], isCtrl = g.ctrl === p, hasBall = g.ball.carrier === p && g.ball.state === 'held';
      // Team disc.
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(sx, sy + size * 0.02, size * 0.42, size * 0.2, 0, 0, 7); ctx.fill();
      ctx.lineWidth = Math.max(2, size * 0.07); ctx.strokeStyle = team.color; ctx.beginPath(); ctx.ellipse(sx, sy, size * 0.4, size * 0.18, 0, 0, 7); ctx.stroke();
      if (isCtrl) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, size * 0.05); ctx.beginPath(); ctx.ellipse(sx, sy, size * (0.5 + Math.sin(time * 8) * 0.04), size * 0.24, 0, 0, 7); ctx.stroke(); }
      ctx.save();
      ctx.translate(sx, sy - bob);
      if (p.stun > 0) ctx.rotate(Math.sin(time * 20) * 0.25 + 0.5);
      const screenFace = view.vertical ? (p.vy > 0.4 ? 1 : p.vy < -0.4 ? -1 : 1) : p.face;
      if (screenFace < 0) ctx.scale(-1, 1);
      if (p.juke > 0) ctx.globalAlpha = 0.65;
      ctx.drawImage(PG.sprite(p.mon), -size / 2, -size * 0.88, size, size);
      ctx.restore();
      if (hasBall) drawBallAt(sx + size * 0.28, sy - size * 0.3, size * 0.13);
      // Badges.
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (p.label && g.human === p.team && g.phase === 'live' && !g.play.thrown && g.play.kind === 'pass') {
        const r = size * 0.24, by = sy - size * 1.02;
        ctx.fillStyle = '#ffd84a'; ctx.beginPath(); ctx.arc(sx, by, r, 0, 7); ctx.fill();
        ctx.strokeStyle = '#1c1c28'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#1c1c28'; ctx.font = `900 ${Math.round(r * 1.4)}px system-ui, sans-serif`; ctx.fillText(p.label, sx, by + 1);
      } else if (isCtrl || hasBall) {
        ctx.font = `800 ${Math.round(Math.max(10 * view.dpr, size * 0.24))}px system-ui, sans-serif`;
        ctx.lineWidth = 3 * view.dpr; ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.fillStyle = '#fff';
        ctx.strokeText(p.mon.name, sx, sy - size * 0.98); ctx.fillText(p.mon.name, sx, sy - size * 0.98);
      }
    }
    function drawBallAt(x, y, r) {
      ctx.fillStyle = '#8a4b22'; ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r, -0.5, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, r * 0.25); ctx.beginPath(); ctx.moveTo(x - r * 0.6, y + r * 0.3); ctx.lineTo(x + r * 0.6, y - r * 0.3); ctx.stroke();
    }

    function draw(g, dt, time) {
      updateCam(g, dt);
      drawField(g);
      const order = g.on.slice().sort((a, b) => Y(a.x, a.y) - Y(b.x, b.y));
      for (const p of order) drawPlayer(g, p, time);
      if (g.ball.state === 'air') {
        const b = g.ball, sx = X(b.x, b.y), sy = Y(b.x, b.y), s = view.s;
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(sx, sy, s * 0.6, s * 0.3, 0, 0, 7); ctx.fill();
        drawBallAt(sx, sy - b.z * s * 0.55, s * (0.5 + b.z * 0.03));
      }
      // Effects.
      for (const c of fx.confetti) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 500 * dt * view.dpr; c.life -= dt; ctx.fillStyle = c.col; ctx.fillRect(c.x, c.y, c.w, c.w * 0.6); }
      fx.confetti = fx.confetti.filter((c) => c.life > 0);
      for (const p of fx.pops) {
        p.life -= dt; const a = Math.max(0, p.life / 0.9);
        ctx.globalAlpha = a; ctx.font = `900 ${Math.round(16 * view.dpr)}px system-ui, sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 3 * view.dpr; ctx.strokeStyle = '#000'; ctx.fillStyle = p.col;
        const sx = X(p.wx, p.wy), sy = Y(p.wx, p.wy) - (1 - a) * 30 * view.dpr - 34 * view.dpr;
        ctx.strokeText(p.text, sx, sy); ctx.fillText(p.text, sx, sy); ctx.globalAlpha = 1;
      }
      fx.pops = fx.pops.filter((p) => p.life > 0);
      const bn = fx.banners[0];
      if (bn) {
        bn.life -= dt; const t = 1.8 - bn.life, a = Math.min(1, t * 6, bn.life * 3), sc = 1 + Math.max(0, 0.25 - t) * 2;
        ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(view.cw / 2, view.ch * 0.3); ctx.scale(sc, sc);
        const fs = Math.min(view.cw / (bn.text.length * 0.62), 64 * view.dpr);
        ctx.font = `900 italic ${Math.round(fs)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = fs * 0.16; ctx.strokeStyle = '#11131c'; ctx.lineJoin = 'round'; ctx.strokeText(bn.text, 0, 0);
        ctx.fillStyle = bn.col; ctx.fillText(bn.text, 0, 0); ctx.restore();
        if (bn.life <= 0) fx.banners.shift();
      }
    }

    return {
      resize, draw, toWorld,
      resetCam() { cam.init = false; },
      banner(text, col = '#ffd84a') { if (fx.banners.length > 1) fx.banners.length = 1; fx.banners.push({ text, col, life: 1.8 }); },
      pop(p, text, col = '#fff') { fx.pops.push({ wx: p.x, wy: p.y, text, col, life: 0.9 }); },
      confetti(cols) {
        for (let i = 0; i < 90; i++) fx.confetti.push({ x: Math.random() * view.cw, y: -20 - Math.random() * view.ch * 0.3, vx: (Math.random() - 0.5) * 200, vy: Math.random() * 200, w: (6 + Math.random() * 6) * view.dpr, col: cols[i % cols.length], life: 2.6 });
      },
      // Which labelled receiver is under this canvas-relative point?
      pickReceiver(g, px, py) {
        let best = null, bd = 60 * view.dpr;
        for (const p of g.on) if (p.label && p.team === g.human) { const dd = Math.hypot(X(p.x, p.y) - px * view.dpr, Y(p.x, p.y) - view.s * 2 - py * view.dpr); if (dd < bd) { bd = dd; best = p; } }
        return best;
      },
    };
  };

  // ---------- shareable lineup card ----------
  const CARD_ROWS = [
    ['S'], ['CB1', 'LB1', 'LB2', 'CB2'], ['DL1', 'DL2'], null, ['WR1', 'OL1', 'OL2', 'TE', 'WR2'], ['QB'], ['RB', 'K'],
  ];
  PG.CARD_ROWS = CARD_ROWS;
  // The two base stats that matter most at each position, shown on the share card.
  const KEY_STATS = { QB: ['spa', 'spd'], RB: ['spe', 'atk'], WR: ['spe', 'spd'], TE: ['atk', 'hp'], OL: ['def', 'hp'], DL: ['atk', 'spe'], LB: ['atk', 'def'], CB: ['spe', 'spd'], S: ['spd', 'spe'], K: ['spa', 'atk'] };
  const STAT_LABEL = { hp: 'HP', atk: 'ATK', def: 'DEF', spa: 'SP.ATK', spd: 'SP.DEF', spe: 'SPEED' };
  PG.grade = function (ovr) {
    return ovr >= 86 ? 'S' : ovr >= 82 ? 'A+' : ovr >= 79 ? 'A' : ovr >= 76 ? 'B+' : ovr >= 73 ? 'B' : ovr >= 70 ? 'C+' : ovr >= 66 ? 'C' : 'D';
  };
  PG.drawLineupCard = function (sq, url) {
    const cv = document.createElement('canvas'), Wc = 1080, Hc = 1500;
    cv.width = Wc; cv.height = Hc;
    const c = cv.getContext('2d');
    c.fillStyle = '#10131f'; c.fillRect(0, 0, Wc, Hc);
    // Header.
    c.fillStyle = sq.color; c.fillRect(0, 0, Wc, 150);
    const hg = c.createLinearGradient(0, 0, Wc, 0); hg.addColorStop(0, 'rgba(0,0,0,.05)'); hg.addColorStop(1, 'rgba(0,0,0,.45)');
    c.fillStyle = hg; c.fillRect(0, 0, Wc, 150);
    c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = '900 italic 60px system-ui, sans-serif'; c.fillText(sq.name.toUpperCase(), 44, 66, 660);
    c.font = '700 26px system-ui, sans-serif'; c.globalAlpha = 0.9;
    c.fillText(`STARTING LINEUP  ·  CAP ${PG.squadCost(sq)}/${PG.CAP}`, 46, 118); c.globalAlpha = 1;
    const boxes = [['OVR', PG.squadOvr(sq)], ['OFF', PG.squadOvr(sq, 'O')], ['DEF', PG.squadOvr(sq, 'D')]];
    boxes.forEach(([lab, v], i) => {
      const x = 730 + i * 112;
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(x, 26, 100, 98, 14); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '900 50px system-ui, sans-serif'; c.fillText(v || '–', x + 50, 66);
      c.font = '800 20px system-ui, sans-serif'; c.globalAlpha = 0.8; c.fillText(lab, x + 50, 104); c.globalAlpha = 1;
    });
    // Field.
    const fy = 150, fh = Hc - 150 - 70;
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#2f8f46' : '#2a8340'; c.fillRect(0, fy + (i * fh) / 8, Wc, fh / 8 + 1); }
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 3;
    for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(0, fy + (i * fh) / 8); c.lineTo(Wc, fy + (i * fh) / 8); c.stroke(); }
    const rowY = [0.07, 0.215, 0.36, 0.458, 0.545, 0.7, 0.86];
    c.strokeStyle = 'rgba(70,140,255,.95)'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, fy + fh * rowY[3]); c.lineTo(Wc, fy + fh * rowY[3]); c.stroke();
    c.font = '800 20px system-ui, sans-serif'; c.fillStyle = 'rgba(255,255,255,.6)'; c.textAlign = 'left';
    c.fillText('DEFENSE', 20, fy + 22); c.fillText('OFFENSE', 20, fy + fh * rowY[3] + 24);
    CARD_ROWS.forEach((row, ri) => {
      if (!row) return;
      const y = fy + fh * rowY[ri];
      row.forEach((key, i) => {
        const x = row.length === 1 ? Wc / 2 : key === 'K' ? Wc * 0.84 : key === 'RB' ? Wc * 0.42 : Wc * (0.11 + (0.78 * i) / (row.length - 1));
        const slot = PG.SLOTS.find((s) => s.key === key), id = sq.slots[key], m = id && PG.byId(id);
        c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.ellipse(x, y + 34, 58, 20, 0, 0, 7); c.fill();
        c.strokeStyle = sq.color; c.lineWidth = 6; c.stroke();
        if (m) c.drawImage(PG.sprite(m), x - 54, y - 64, 108, 108);
        // Name plate.
        c.fillStyle = 'rgba(12,14,24,.88)'; c.beginPath(); c.roundRect(x - 96, y + 42, 192, 76, 10); c.fill();
        c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = '800 23px system-ui, sans-serif'; c.fillText(m ? m.name : 'Empty', x, y + 58, 172);
        c.font = '700 18px system-ui, sans-serif'; c.fillStyle = '#aab3d0';
        c.fillText(m ? `${slot.pos}  ·  ${PG.rating(m, slot.pos)} OVR` : slot.pos, x, y + 80);
        if (m) { c.font = '700 16px system-ui, sans-serif'; c.fillStyle = '#ffd84a'; c.fillText(KEY_STATS[slot.pos].map((k) => `${STAT_LABEL[k]} ${m[k]}`).join('  '), x, y + 103, 184); }
        if (m) { // rating badge
          const r = PG.rating(m, slot.pos);
          c.fillStyle = r >= 85 ? '#ffd84a' : r >= 75 ? '#7be08a' : r >= 65 ? '#e8ecf8' : '#f0a070';
          c.beginPath(); c.arc(x + 58, y - 44, 23, 0, 7); c.fill();
          c.fillStyle = '#10131f'; c.font = '900 25px system-ui, sans-serif'; c.fillText(r, x + 58, y - 43);
        }
      });
    });
    // Footer.
    c.fillStyle = '#10131f'; c.fillRect(0, Hc - 70, Wc, 70);
    c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '900 italic 30px system-ui, sans-serif'; c.fillText('POCKET GRIDIRON', 40, Hc - 34);
    c.textAlign = 'right'; c.font = '600 24px system-ui, sans-serif'; c.fillStyle = '#aab3d0'; c.fillText(url || 'Can your squad beat mine?', Wc - 40, Hc - 34);
    return cv;
  };
})();
