// Original procedurally drawn mascots. Each one is built from the player's types, size and dex number.
(function () {
  const PG = (globalThis.PG = globalThis.PG || {});
  const S = 96;
  const cache = new Map(), urls = new Map();

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  const FEATURES = {
    fire(c, b, col) { // flame tuft
      c.fillStyle = '#ffb347';
      for (const [dx, h] of [[-7, 12], [0, 20], [7, 12]]) { c.beginPath(); c.moveTo(b.cx + dx - 5, b.top + 4); c.quadraticCurveTo(b.cx + dx - 2, b.top - h * 0.5, b.cx + dx, b.top - h); c.quadraticCurveTo(b.cx + dx + 5, b.top - h * 0.4, b.cx + dx + 5, b.top + 4); c.fill(); }
      c.fillStyle = '#ffe37a'; c.beginPath(); c.ellipse(b.cx, b.top - 3, 3, 6, 0, 0, 7); c.fill();
    },
    water(c, b, col) { // dorsal fin
      c.fillStyle = shade(col, -0.25); c.beginPath(); c.moveTo(b.cx - 8, b.top + 5); c.quadraticCurveTo(b.cx + 2, b.top - 20, b.cx + 10, b.top - 10); c.quadraticCurveTo(b.cx + 4, b.top - 2, b.cx + 9, b.top + 6); c.fill();
    },
    electric(c, b) { // bolt antenna
      c.strokeStyle = '#f7d02c'; c.lineWidth = 4; c.lineJoin = 'miter'; c.beginPath(); c.moveTo(b.cx - 2, b.top + 3); c.lineTo(b.cx + 5, b.top - 7); c.lineTo(b.cx - 3, b.top - 10); c.lineTo(b.cx + 6, b.top - 22); c.stroke();
    },
    grass(c, b) { // leaf sprout
      c.strokeStyle = '#3f7d2c'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(b.cx, b.top + 3); c.lineTo(b.cx, b.top - 8); c.stroke();
      c.fillStyle = '#5db33f';
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(b.cx + s * 8, b.top - 11, 9, 4.5, s * -0.5, 0, 7); c.fill(); }
    },
    ice(c, b) { // crystal spikes
      c.fillStyle = '#d7f4f2';
      for (const [dx, h] of [[-10, 10], [0, 17], [10, 10]]) { c.beginPath(); c.moveTo(b.cx + dx - 5, b.top + 5); c.lineTo(b.cx + dx, b.top - h); c.lineTo(b.cx + dx + 5, b.top + 5); c.fill(); }
    },
    fighting(c, b) { // headband with tails
      c.fillStyle = '#fff'; c.fillRect(b.cx - b.rx * 0.93, b.cy - b.ry * 0.62, b.rx * 1.86, 6);
      c.beginPath(); c.moveTo(b.cx + b.rx * 0.9, b.cy - b.ry * 0.6); c.lineTo(b.cx + b.rx + 12, b.cy - b.ry * 0.6 - 6); c.lineTo(b.cx + b.rx + 12, b.cy - b.ry * 0.6 + 3); c.fill();
    },
    poison(c, b, col) { // bubbles
      c.fillStyle = shade(col, 0.35);
      for (const [dx, dy, r] of [[-b.rx - 2, -b.ry * 0.5, 5], [b.rx + 3, -b.ry * 0.8, 4], [b.rx - 2, -b.ry - 6, 3]]) { c.beginPath(); c.arc(b.cx + dx, b.cy + dy, r, 0, 7); c.fill(); }
    },
    ground(c, b, col) { // stripes
      c.strokeStyle = shade(col, -0.35); c.lineWidth = 3;
      for (const k of [0.35, 0.6]) { c.beginPath(); c.moveTo(b.cx - b.rx * 0.8, b.cy + b.ry * k); c.quadraticCurveTo(b.cx, b.cy + b.ry * k + 5, b.cx + b.rx * 0.8, b.cy + b.ry * k); c.stroke(); }
    },
    flying(c, b, col) { // wings
      c.fillStyle = shade(col, 0.3);
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(b.cx + s * b.rx * 0.8, b.cy); c.quadraticCurveTo(b.cx + s * (b.rx + 20), b.cy - 22, b.cx + s * (b.rx + 16), b.cy + 2); c.quadraticCurveTo(b.cx + s * (b.rx + 6), b.cy + 4, b.cx + s * b.rx * 0.8, b.cy + 10); c.fill(); }
    },
    psychic(c, b) { // forehead gem
      c.fillStyle = '#ffe37a'; c.beginPath(); c.moveTo(b.cx, b.cy - b.ry * 0.78); c.lineTo(b.cx + 5, b.cy - b.ry * 0.6); c.lineTo(b.cx, b.cy - b.ry * 0.42); c.lineTo(b.cx - 5, b.cy - b.ry * 0.6); c.fill();
    },
    bug(c, b) { // antennae
      c.strokeStyle = '#4a5210'; c.lineWidth = 2.5;
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(b.cx + s * 6, b.top + 4); c.quadraticCurveTo(b.cx + s * 10, b.top - 12, b.cx + s * 17, b.top - 14); c.stroke(); c.fillStyle = '#4a5210'; c.beginPath(); c.arc(b.cx + s * 17, b.top - 14, 3, 0, 7); c.fill(); }
    },
    rock(c, b, col) { // craggy bumps
      c.fillStyle = shade(col, -0.3);
      for (const [dx, dy, r] of [[-b.rx * 0.7, -b.ry * 0.75, 7], [b.rx * 0.6, -b.ry * 0.85, 8], [0, -b.ry * 1.02, 6]]) { c.beginPath(); c.moveTo(b.cx + dx - r, b.cy + dy + r); c.lineTo(b.cx + dx, b.cy + dy - r); c.lineTo(b.cx + dx + r, b.cy + dy + r); c.fill(); }
    },
    ghost(c, b, col) { // wisp
      c.fillStyle = shade(col, 0.3); c.beginPath(); c.moveTo(b.cx - 4, b.top + 4); c.quadraticCurveTo(b.cx + 12, b.top - 8, b.cx + 2, b.top - 18); c.quadraticCurveTo(b.cx + 6, b.top - 6, b.cx + 6, b.top + 4); c.fill();
    },
    dragon(c, b) { // horns
      c.fillStyle = '#f3ead0';
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(b.cx + s * 5, b.top + 6); c.quadraticCurveTo(b.cx + s * 9, b.top - 10, b.cx + s * 18, b.top - 14); c.quadraticCurveTo(b.cx + s * 14, b.top - 2, b.cx + s * 14, b.top + 8); c.fill(); }
    },
    dark(c, b) { c.fillStyle = '#2b2118'; c.beginPath(); c.moveTo(b.cx - 12, b.top + 6); c.lineTo(b.cx - 8, b.top - 10); c.lineTo(b.cx, b.top + 2); c.lineTo(b.cx + 8, b.top - 10); c.lineTo(b.cx + 12, b.top + 6); c.fill(); },
    steel(c, b) { c.fillStyle = '#6d6d86'; for (const s of [-1, 1]) { c.beginPath(); c.arc(b.cx + s * b.rx * 0.95, b.cy, 5, 0, 7); c.fill(); } },
    fairy(c, b) { // bow
      c.fillStyle = '#ff9ccb';
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(b.cx, b.top + 2); c.lineTo(b.cx + s * 13, b.top - 7); c.lineTo(b.cx + s * 13, b.top + 9); c.fill(); }
      c.fillStyle = '#ffd1e6'; c.beginPath(); c.arc(b.cx, b.top + 2, 3.5, 0, 7); c.fill();
    },
    normal(c, b, col) { // round ears
      c.fillStyle = shade(col, -0.15);
      for (const s of [-1, 1]) { c.beginPath(); c.arc(b.cx + s * b.rx * 0.62, b.top + 5, 8, 0, 7); c.fill(); }
      c.fillStyle = shade(col, 0.4);
      for (const s of [-1, 1]) { c.beginPath(); c.arc(b.cx + s * b.rx * 0.62, b.top + 6, 4, 0, 7); c.fill(); }
    },
  };

  function draw(mon) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    const col = PG.TYPE_COLORS[mon.types[0]], col2 = PG.TYPE_COLORS[mon.types[1] || mon.types[0]];
    const rnd = PG.mulberry(mon.id * 7919);
    // Build: taller mons are bigger, heavier-for-their-height mons are wider.
    const size = Math.max(0.68, Math.min(1, 0.62 + Math.log10(mon.h + 2) * 0.24));
    const bulk = Math.max(0.82, Math.min(1.22, 0.8 + Math.log10(mon.w / Math.max(3, mon.h) + 2) * 0.22));
    const ry = 30 * size / Math.sqrt(bulk), rx = Math.min(34, 27 * size * bulk);
    const cx = S / 2, cy = S - 14 - ry;
    const b = { cx, cy, rx, ry, top: cy - ry };
    const ghost = mon.types.includes('ghost');

    // Secondary type drawn behind, primary on top.
    if (mon.types[1]) FEATURES[mon.types[1]](c, b, col2);
    if (!ghost) { // feet
      c.fillStyle = shade(col, -0.3);
      for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * rx * 0.48, cy + ry - 1, rx * 0.3, 6, 0, 0, 7); c.fill(); }
    }
    // Body.
    const g = c.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 3, cx, cy, Math.max(rx, ry) * 1.15);
    g.addColorStop(0, shade(col, 0.3)); g.addColorStop(1, shade(col, -0.18));
    c.fillStyle = g;
    c.beginPath();
    if (ghost) {
      c.moveTo(cx - rx, cy + ry * 0.7); c.bezierCurveTo(cx - rx, cy - ry * 1.4, cx + rx, cy - ry * 1.4, cx + rx, cy + ry * 0.7);
      for (let i = 0; i < 4; i++) { const x0 = cx + rx - (i * rx) / 2; c.quadraticCurveTo(x0 - rx / 4, cy + ry * 1.25, x0 - rx / 2, cy + ry * 0.7); }
    } else c.ellipse(cx, cy, rx, ry, 0, 0, 7);
    c.fill();
    c.lineWidth = 2.5; c.strokeStyle = shade(col, -0.5); c.stroke();
    // Belly patch in the secondary colour.
    c.fillStyle = mon.types[1] ? shade(col2, 0.25) : shade(col, 0.45);
    c.globalAlpha = 0.85; c.beginPath(); c.ellipse(cx, cy + ry * 0.38, rx * 0.56, ry * 0.42, 0, 0, 7); c.fill(); c.globalAlpha = 1;

    FEATURES[mon.types[0]](c, b, col);

    // Face.
    const ey = cy - ry * 0.22, ex = rx * (0.34 + rnd() * 0.1), er = 4.2 + rnd() * 2.4 * size, style = Math.floor(rnd() * 3);
    for (const s of [-1, 1]) {
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(cx + s * ex, ey, er, er * (style === 1 ? 0.75 : 1.1), 0, 0, 7); c.fill();
      c.fillStyle = '#1c1c28'; c.beginPath(); c.arc(cx + s * ex + 1, ey + 0.6, er * 0.55, 0, 7); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(cx + s * ex + 2.2, ey - 1.2, er * 0.2, 0, 7); c.fill();
      if (style === 2) { c.strokeStyle = '#1c1c28'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + s * (ex - er), ey - er - 2); c.lineTo(cx + s * (ex + er * 0.6), ey - er + 1.5); c.stroke(); }
    }
    c.strokeStyle = '#1c1c28'; c.lineWidth = 2; c.lineCap = 'round'; c.beginPath();
    const my = cy + ry * 0.08, mw = 4 + rnd() * 4;
    if (rnd() < 0.6) c.arc(cx, my - 1, mw, 0.2 * Math.PI, 0.8 * Math.PI); else { c.moveTo(cx - mw, my + 2); c.lineTo(cx + mw, my + 2); }
    c.stroke();
    return cv;
  }

  PG.sprite = function (mon) {
    let s = cache.get(mon.id);
    if (!s) cache.set(mon.id, (s = draw(mon)));
    return s;
  };
  PG.spriteURL = function (mon) {
    let u = urls.get(mon.id);
    if (!u) urls.set(mon.id, (u = PG.sprite(mon).toDataURL()));
    return u;
  };
})();
