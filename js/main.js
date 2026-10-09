// App shell: home screen, squad builder, share card, game loop and input.
(function () {
  const PG = globalThis.PG;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const COLORS = ['#e23b3b', '#e8622c', '#e0b61c', '#3f9a3a', '#20a39e', '#2f6fd6', '#6b4fa0', '#d9457a'];
  const KEY = 'pocket-gridiron-v1';

  // ---------- state ----------
  let state = { squads: [], legends: false, sound: true, record: { w: 0, l: 0, t: 0 }, home: null, away: 'preset_0', mode: 'play', seenHelp: false };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* first visit or storage blocked */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } };
  if (!state.squads.length) {
    const sq = PG.randomSquad(false, 'My Squad');
    state.squads.push(sq); state.home = sq.id; save();
  }
  let presets = PG.presetSquads(state.legends);
  const allTeams = () => [...state.squads, ...presets];
  const team = (id) => allTeams().find((t) => t.id === id);
  const pool = () => PG.MONS.filter((m) => state.legends || !PG.isLegendary(m));
  function problems(sq) {
    if (!PG.squadFull(sq)) return 'Lineup incomplete';
    if (PG.squadCost(sq) > PG.CAP) return 'Over the cap';
    if (!state.legends && Object.values(sq.slots).some((id) => PG.isLegendary(PG.byId(id)))) return 'Has locked legendaries';
    return '';
  }
  const ratingsHTML = (sq) => { const o = PG.squadOvr(sq); return `<span class="rt"><span class="grade">${PG.grade(o)}</span><span>OVR <b>${o}</b></span><span>OFF <b>${PG.squadOvr(sq, 'O')}</b></span><span>DEF <b>${PG.squadOvr(sq, 'D')}</b></span></span>`; };

  function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== id); window.scrollTo(0, 0); }
  function modal(html) { $('modalBox').innerHTML = html; $('modal').classList.remove('hidden'); }
  function closeModal() { $('modal').classList.add('hidden'); }
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !$('modal').dataset.sticky) closeModal(); });

  // ---------- sound ----------
  let ac = null;
  function beep(freq, dur = 0.08, type = 'square', vol = 0.05, slide = 0) {
    if (!state.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ac.currentTime + dur);
      g.gain.value = vol; g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    } catch (e) { /* audio unavailable */ }
  }
  const sfx = {
    snap: () => beep(220, 0.05), throw: () => beep(500, 0.18, 'sine', 0.05, 400), catch: () => beep(700, 0.06, 'triangle', 0.07),
    tackle: () => beep(110, 0.14, 'sawtooth', 0.08, -70), whistle: () => beep(1900, 0.22, 'sine', 0.03, 200), juke: () => beep(900, 0.07, 'triangle', 0.05, 500),
    score: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'square', 0.06), i * 110)),
    bad: () => [300, 220].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.05), i * 150)),
  };

  // ---------- home ----------
  function faces(sq, n = 7) { return `<div class="faces">${['QB', 'RB', 'WR1', 'TE', 'DL1', 'LB1', 'S'].slice(0, n).map((k) => sq.slots[k] ? `<img alt="" src="${PG.spriteURL(PG.byId(sq.slots[k]))}">` : '').join('')}</div>`; }
  let wild = null;
  function renderHome() {
    presets = PG.presetSquads(state.legends);
    if (wild) presets.push(wild);
    if (!team(state.home)) state.home = state.squads[0] ? state.squads[0].id : presets[0].id;
    if (!team(state.away)) state.away = presets[0].id;
    const { w, l, t } = state.record;
    $('record').textContent = `Record ${w}-${l}${t ? '-' + t : ''}`;
    $('legendToggle').textContent = state.legends ? 'Legendaries: unlocked' : 'Legendaries: locked';
    $('soundToggle').textContent = state.sound ? 'Sound: on' : 'Sound: off';
    for (const [el, id, lab] of [[$('pickHome'), state.home, state.mode === 'play' ? 'You (home)' : 'Home'], [$('pickAway'), state.away, state.mode === 'play' ? 'CPU (away)' : 'Away']]) {
      const sq = team(id);
      el.style.borderLeftColor = sq.color;
      el.innerHTML = `<div class="lab">${lab} · tap to change</div><div class="nm">${esc(sq.name)}</div>${ratingsHTML(sq)}`;
    }
    for (const b of $('modes').children) b.classList.toggle('on', b.dataset.mode === state.mode);
    const prob = problems(team(state.home)) || problems(team(state.away));
    $('kickoff').disabled = !!prob;
    $('kickoffNote').textContent = prob ? `Can't kick off: ${prob.toLowerCase()}. Edit the squad first.` : state.home === state.away ? 'Mirror match!' : '';
    $('mySquads').innerHTML = state.squads.map((sq) => card(sq, true)).join('') || '<p class="note">No squads yet.</p>';
    $('league').innerHTML = presets.map((sq) => card(sq, false)).join('');
    save();
  }
  function card(sq, mine) {
    const p = problems(sq);
    return `<div class="card" style="border-left-color:${sq.color}" data-id="${sq.id}">
      <div class="nm"><span>${esc(sq.name)}</span></div>${ratingsHTML(sq)}
      ${sq.blurb ? `<div class="blurb">${esc(sq.blurb)}</div>` : ''}${p ? `<div class="warn">${p}</div>` : ''}
      ${faces(sq)}
      <div class="acts">
        <button class="btn" data-act="home">Play as</button><button class="btn" data-act="away">Play against</button>
        ${mine ? '<button class="btn" data-act="edit">Edit</button>' : '<button class="btn" data-act="copy">Copy &amp; edit</button>'}
        <button class="btn" data-act="share">Lineup</button>${mine ? '<button class="btn danger" data-act="del">Delete</button>' : ''}
      </div></div>`;
  }
  function onCard(e) {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const id = b.closest('.card').dataset.id, sq = team(id), act = b.dataset.act;
    if (act === 'home') { state.home = id; renderHome(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (act === 'away') { state.away = id; renderHome(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    else if (act === 'edit') openBuilder(sq);
    else if (act === 'copy') { const c = JSON.parse(JSON.stringify(sq)); c.id = PG.newSquad('').id; delete c.preset; delete c.blurb; c.name = sq.name; openBuilder(c, true); }
    else if (act === 'share') shareCard(sq);
    else if (act === 'del') { if (confirm(`Delete ${sq.name}?`)) { state.squads = state.squads.filter((s) => s.id !== id); renderHome(); } }
  }
  $('mySquads').addEventListener('click', onCard); $('league').addEventListener('click', onCard);
  $('newSquad').onclick = () => openBuilder(PG.newSquad('New Squad', COLORS[state.squads.length % COLORS.length]), true);
  $('legendToggle').onclick = () => { state.legends = !state.legends; renderHome(); };
  $('soundToggle').onclick = () => { state.sound = !state.sound; renderHome(); sfx.catch(); };
  $('modes').onclick = (e) => { const b = e.target.closest('.mode'); if (b) { state.mode = b.dataset.mode; renderHome(); } };
  function pickTeam(side) {
    const row = (sq) => `<button data-id="${sq.id}" style="border-left-color:${sq.color}" ${problems(sq) ? 'disabled' : ''}><span>${esc(sq.name)}${problems(sq) ? ` <span class="warn">(${problems(sq)})</span>` : ''}</span>${ratingsHTML(sq)}</button>`;
    modal(`<h2>${side === 'home' ? 'Choose your team' : 'Choose the opponent'}</h2><div class="list-pick">
      <h4>My squads</h4>${state.squads.map(row).join('')}
      ${side === 'away' ? `<button data-id="__random" style="border-left-color:#888"><span>Wild Draft (random squad)</span></button>` : ''}
      <h4>The league</h4>${presets.map(row).join('')}</div>`);
    $('modalBox').querySelector('.list-pick').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      let id = b.dataset.id;
      if (id === '__random') { const r = PG.randomSquad(state.legends, 'Wild Draft'); r.id = 'random'; r.preset = true; presets.push(r); wild = r; id = r.id; }
      state[side] = id; closeModal(); renderHome();
    };
  }
  $('pickHome').onclick = () => pickTeam('home'); $('pickAway').onclick = () => pickTeam('away');
  $('kickoff').onclick = () => startGame(team(state.home), team(state.away), state.mode);

  // ---------- builder ----------
  let ed = null, edSel = 'QB', edNew = false;
  function openBuilder(sq, isNew) {
    ed = JSON.parse(JSON.stringify(sq)); edNew = !!isNew;
    edSel = (PG.SLOTS.find((s) => !ed.slots[s.key]) || PG.SLOTS[0]).key;
    $('bName').value = ed.name;
    $('poolType').innerHTML = '<option value="">All types</option>' + Object.keys(PG.TYPE_COLORS).filter((t) => PG.MONS.some((m) => m.types.includes(t))).map((t) => `<option>${t}</option>`).join('');
    $('poolSearch').value = '';
    show('builder'); renderBuilder();
  }
  function renderBuilder() {
    $('bColors').innerHTML = COLORS.map((c) => `<button style="background:${c}" class="${c === ed.color ? 'on' : ''}" data-c="${c}" aria-label="Team colour"></button>`).join('');
    const cost = PG.squadCost(ed);
    $('capFill').style.width = Math.min(100, (cost / PG.CAP) * 100) + '%';
    $('capFill').classList.toggle('over', cost > PG.CAP);
    $('capText').textContent = `Salary cap: ${cost} / ${PG.CAP}  ·  ${PG.CAP - cost >= 0 ? PG.CAP - cost + ' left' : cost - PG.CAP + ' over'}`;
    $('formation').innerHTML = PG.CARD_ROWS.map((row) => {
      if (!row) return '<div class="frow los"></div>';
      return `<div class="frow">${row.map((k) => {
        const slot = PG.SLOTS.find((s) => s.key === k), m = ed.slots[k] && PG.byId(ed.slots[k]);
        return `<button class="slot ${k === edSel ? 'sel' : ''}" data-k="${k}"><span class="pos">${slot.pos}</span>${m ? `<span class="ov">${PG.rating(m, slot.pos)}</span><img alt="" src="${PG.spriteURL(m)}"><div class="nm">${esc(m.name)}</div>` : `<div class="empty">+</div><div class="nm">Empty</div>`}</button>`;
      }).join('')}</div>`;
    }).join('');
    $('formation').style.borderColor = ed.color;
    $('bRatings').innerHTML = ratingsHTML(ed);
    renderPool();
  }
  function renderPool() {
    const slot = PG.SLOTS.find((s) => s.key === edSel), cur = ed.slots[edSel];
    const left = PG.CAP - PG.squadCost(ed) + (cur ? PG.cost(PG.byId(cur)) : 0);
    $('poolTitle').innerHTML = `Pick your ${slot.pos} <small>· ${PG.POS_HINT[slot.pos]}</small>${cur ? ' <button class="btn" id="bRemove" style="padding:2px 8px;font-size:12px">Remove</button>' : ''}`;
    const q = $('poolSearch').value.trim().toLowerCase(), ty = $('poolType').value, sort = $('poolSort').value;
    const used = new Map(Object.entries(ed.slots).filter(([, id]) => id).map(([k, id]) => [id, k]));
    let list = PG.MONS.filter((m) => (!q || m.name.toLowerCase().includes(q)) && (!ty || m.types.includes(ty)));
    const fit = (m) => PG.rating(m, slot.pos);
    list.sort(sort === 'fit' ? (a, b) => fit(b) - fit(a) : sort === 'value' ? (a, b) => fit(b) / (PG.cost(b) + 12) - fit(a) / (PG.cost(a) + 12) : sort === 'cost' ? (a, b) => PG.cost(a) - PG.cost(b) || fit(b) - fit(a) : (a, b) => a.id - b.id);
    $('pool').innerHTML = list.map((m) => {
      const locked = PG.isLegendary(m) && !state.legends, u = used.get(m.id);
      return `<button class="mon ${u ? 'used' : ''} ${PG.cost(m) > left ? 'pricey' : ''}" data-id="${m.id}" ${locked ? 'disabled' : ''}>
        <img alt="" loading="lazy" src="${PG.spriteURL(m)}">
        <div><div class="nm">${esc(m.name)} ${locked ? '<span class="lock">LOCKED</span>' : u ? `<span class="lock">${u}</span>` : ''}</div>
          <div class="types">${m.types.map((t) => `<span class="type" style="background:${PG.TYPE_COLORS[t]}">${t}</span>`).join('')}
          <span class="statline">HP ${m.hp} · ATK ${m.atk} · DEF ${m.def} · SPA ${m.spa} · SPD ${m.spd} · SPE ${m.spe}</span></div></div>
        <div class="r"><b>${fit(m)}</b><div class="cost">cost ${PG.cost(m)}</div></div></button>`;
    }).join('');
    const rm = $('bRemove'); if (rm) rm.onclick = () => { ed.slots[edSel] = null; renderBuilder(); };
  }
  $('formation').onclick = (e) => { const b = e.target.closest('.slot'); if (b) { edSel = b.dataset.k; renderBuilder(); } };
  $('pool').onclick = (e) => {
    const b = e.target.closest('.mon'); if (!b) return;
    const id = +b.dataset.id;
    for (const k in ed.slots) if (ed.slots[k] === id) ed.slots[k] = null; // moving a player between slots
    ed.slots[edSel] = id;
    const next = PG.SLOTS.find((s) => !ed.slots[s.key]);
    if (next) edSel = next.key;
    sfx.catch(); renderBuilder();
  };
  $('bColors').onclick = (e) => { const c = e.target.dataset.c; if (c) { ed.color = c; renderBuilder(); } };
  for (const id of ['poolSearch', 'poolType', 'poolSort']) $(id).addEventListener('input', renderPool);
  $('bName').oninput = () => { ed.name = $('bName').value; };
  $('bAuto').onclick = () => { PG.autoFill(ed, pool()); renderBuilder(); };
  $('bClear').onclick = () => { for (const k in ed.slots) ed.slots[k] = null; edSel = 'QB'; renderBuilder(); };
  $('bShare').onclick = () => shareCard(ed);
  $('bBack').onclick = () => { show('home'); renderHome(); };
  $('bSave').onclick = () => {
    ed.name = ($('bName').value || 'My Squad').trim();
    const i = state.squads.findIndex((s) => s.id === ed.id);
    if (i >= 0) state.squads[i] = ed; else state.squads.push(ed);
    if (edNew) state.home = ed.id;
    show('home'); renderHome();
  };

  // ---------- share card ----------
  function shareCard(sq) {
    const cv = PG.drawLineupCard(sq, location.hostname && location.hostname !== 'localhost' ? location.host : '');
    const fname = sq.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-lineup.png';
    modal(`<h2>${esc(sq.name)}</h2><img class="share-img" alt="Lineup card for ${esc(sq.name)}" src="${cv.toDataURL('image/png')}">
      <div class="modal-actions"><button class="btn" id="shClose">Close</button><button class="btn" id="shDown">Download image</button><button class="btn primary" id="shShare">Share</button></div>`);
    $('shClose').onclick = closeModal;
    const blob = () => new Promise((res) => cv.toBlob(res, 'image/png'));
    $('shDown').onclick = async () => { const a = document.createElement('a'); a.href = URL.createObjectURL(await blob()); a.download = fname; a.click(); };
    $('shShare').onclick = async () => {
      const file = new File([await blob()], fname, { type: 'image/png' });
      const text = `${sq.name} — ${PG.squadOvr(sq)} OVR. Think your squad can beat mine?`;
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: sq.name, text, url: location.href });
        else if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]); $('shShare').textContent = 'Copied image!'; }
        else $('shDown').click();
      } catch (e) { /* share sheet dismissed */ }
    };
  }

  // ---------- game ----------
  let G = null, R = null, raf = 0, speed = 1, paused = false, acc = 0, last = 0, gameMode = 'watch', matchup = null, callKey = '', btnSig = '', finalShown = false;
  const keys = new Set();
  const stick = { x: 0, y: 0, on: false };
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  function startGame(home, away, mode) {
    matchup = { home, away, mode };
    if (mode === 'instant') { G = PG.simulate(home, away, { firstPoss: Math.random() < 0.5 ? 0 : 1 }); gameMode = mode; return showFinal(); }
    gameMode = mode; finalShown = false;
    G = PG.createGame(home, away, { human: mode === 'play' ? 0 : null, firstPoss: mode === 'play' ? 0 : Math.random() < 0.5 ? 0 : 1 });
    show('game');
    R = R || PG.Renderer($('field'));
    R.resize(); R.resetCam();
    speed = 1; paused = false; acc = 0; last = performance.now(); callKey = ''; btnSig = '';
    $('speedBtns').innerHTML = mode === 'watch' ? [1, 2, 4, 8].map((s) => `<button data-s="${s}" class="${s === 1 ? 'on' : ''}">${s}×</button>`).join('') : '';
    $('gPause').textContent = 'Pause';
    $('logPanel').classList.add('hidden'); $('logPanel').innerHTML = '';
    $('stick').classList.toggle('hidden', !(mode === 'play' && touch));
    $('touchBtns').classList.toggle('hidden', mode !== 'play');
    $('touchBtns').innerHTML = ''; $('playcall').classList.add('hidden'); $('snapHint').classList.add('hidden');
    $('lastPlay').textContent = mode === 'play' ? 'You have the ball. Pick a play!' : 'Kickoff!';
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    if (mode === 'play' && !state.seenHelp) help();
  }
  function help() {
    paused = true;
    modal(`<h2>How to play</h2><div class="howto">
      <p><b>Pick a play</b>, then hit <b>SNAP</b> (Space).</p>
      <p><b>Move</b> with WASD / arrow keys, or the on-screen stick.</p>
      <p><b>Passing:</b> receivers get numbers. Press <b>1-4</b>, tap the receiver, or tap their button to throw. Green outline = open. After the catch you become the receiver.</p>
      <p><b>Running:</b> you control the ball carrier. <b>Space / JUKE</b> gives a short burst that shakes tacklers.</p>
      <p><b>Defense:</b> pick a call, then steer a defender into the ball carrier. <b>Space / SWITCH</b> jumps to the defender nearest the ball.</p>
      <p>Type matchups matter in every block, tackle and catch. Water tacklers love Fire runners.</p></div>
      <div class="modal-actions"><button class="btn primary" id="helpOk">Let's go</button></div>`);
    $('helpOk').onclick = () => { state.seenHelp = true; save(); paused = false; last = performance.now(); closeModal(); };
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!G) return;
    if (!paused && !G.over) {
      readInput();
      acc += dt * speed;
      let n = 0;
      while (acc >= PG.DT && n++ < 60) { acc -= PG.DT; PG.step(G); handleEvents(); if (G.over) break; }
      if (n >= 60) acc = 0;
    }
    R.draw(G, paused ? 0 : dt * Math.min(speed, 3), now / 1000);
    hud();
  }

  function readInput() {
    if (G.human == null) return;
    let dx = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
    let dy = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
    if (stick.on) { dx = stick.x; dy = stick.y; }
    const v = R.toWorld(dx, dy);
    G.input.mx = v.x; G.input.my = v.y;
  }

  function handleEvents() {
    for (const e of G.events) {
      const quiet = speed > 2;
      if (e.type === 'score') {
        R.banner(e.kind, '#ffd84a'); R.confetti([G.teams[e.team].color, '#fff', '#ffd84a']);
        if (G.human == null || e.team === G.human) sfx.score(); else sfx.bad();
      } else if (e.type === 'banner') { R.banner(e.text, e.team == null ? '#fff' : e.team === 0 ? '#9fe8ff' : '#ffb0a0'); if (e.text.startsWith('INTER')) sfx.bad(); }
      else if (e.type === 'snap') { if (!quiet) sfx.snap(); }
      else if (e.type === 'throw' || e.type === 'kick') { if (!quiet) sfx.throw(); }
      else if (e.type === 'catch') { if (!quiet) sfx.catch(); }
      else if (e.type === 'tackle') { if (!quiet) sfx.tackle(); R.pop(e.p, 'TACKLE', '#fff'); }
      else if (e.type === 'broken') { R.pop(e.p, 'BROKEN TACKLE!', '#ffd84a'); if (!quiet) sfx.juke(); }
      else if (e.type === 'shed') R.pop(e.p, "It's super effective!", '#7be08a');
      else if (e.type === 'juke') sfx.juke();
      else if (e.type === 'firstdown') R.pop(G.ball, 'FIRST DOWN', '#ffd84a');
      else if (e.type === 'whistle') { if (!quiet) sfx.whistle(); }
      else if (e.type === 'final') setTimeout(showFinal, speed > 2 ? 300 : 1600);
    }
    G.events.length = 0;
  }

  const fmtClock = (c) => `${Math.floor(c / 60)}:${String(Math.floor(c % 60)).padStart(2, '0')}`;
  const ORD = ['', '1st', '2nd', '3rd', '4th'];
  let hudSig = '', logLen = 0;
  function hud() {
    const sig = [G.score, G.quarter, Math.floor(G.clock), G.down, G.toGo, G.poss, Math.round(G.los), G.lastResult].join('|');
    if (sig !== hudSig) {
      hudSig = sig;
      for (const [el, i] of [[$('sbHome'), 0], [$('sbAway'), 1]]) {
        el.style.borderBottomColor = G.teams[i].color; el.classList.toggle('has', G.poss === i);
        el.innerHTML = `<span class="s">${G.score[i]}</span><span class="n">${esc(G.teams[i].name)}</span><span class="ball"></span>`;
      }
      $('sbClock').textContent = G.over ? 'FINAL' : `${G.quarter > 4 ? 'OT' : 'Q' + G.quarter} · ${fmtClock(G.clock)}`;
      $('sbDown').textContent = G.over ? '' : `${ORD[G.down] || ''} & ${G.goalToGo ? 'Goal' : G.toGo} · ${PG.yardLabel(G, G.los)}`;
      $('lastPlay').textContent = G.lastResult || $('lastPlay').textContent;
    }
    if (G.log.length !== logLen && !$('logPanel').classList.contains('hidden')) renderLog();
    if (gameMode === 'play') playUI();
  }
  function renderLog() {
    logLen = G.log.length;
    $('logPanel').innerHTML = G.log.slice().reverse().map((l) => `<div class="${l.big ? 'big' : ''}"><span>${l.q > 4 ? 'OT' : 'Q' + l.q} ${fmtClock(l.clock)}</span>${esc(l.text)}</div>`).join('') || '<div>No plays yet.</div>';
  }

  // Play-call menu, snap prompt and context buttons for the human player.
  function playUI() {
    const onOff = G.poss === G.human, needCall = G.phase === 'presnap' && G.needCall && !G.input.call && !G.over;
    const key = needCall ? `${G.hist.length}|${G.poss}|${G.down}|${G.los}` : '';
    if (key !== callKey) {
      callKey = key;
      const pc = $('playcall');
      if (!needCall) pc.classList.add('hidden');
      else {
        const list = onOff ? Object.entries(PG.OFF_PLAYS) : Object.entries(PG.DEF_PLAYS);
        const fg = PG.fgInfo(G);
        pc.innerHTML = `<h3>${onOff ? `Offense · ${ORD[G.down]} & ${G.goalToGo ? 'Goal' : G.toGo}` : 'Defense · call your coverage'}</h3><div class="plays">${list.map(([k, p], i) =>
          `<button data-k="${k}"><kbd>${i + 1}</kbd><b>${p.name}</b><small>${k === 'fg' ? `${fg.dist} yds · ${Math.round(fg.prob * 100)}%` : p.desc}</small></button>`).join('')}</div>`;
        pc.classList.remove('hidden');
      }
    }
    const wantSnap = G.phase === 'presnap' && onOff && !G.needCall && !G.input.snap && !G.over;
    $('snapHint').classList.toggle('hidden', !wantSnap);
    if (wantSnap) $('snapHint').textContent = touch ? 'SNAP' : 'SNAP  (Space)';
    // Context buttons.
    let html = '', sig = '';
    if (G.phase === 'live' && G.play) {
      const qbCanThrow = onOff && G.play.kind === 'pass' && !G.play.thrown && !G.play.scramble && G.ball.carrier === G.teams[G.human].by.QB;
      if (qbCanThrow) {
        const recs = G.on.filter((p) => p.label && p.team === G.human).sort((a, b) => a.label - b.label);
        const open = recs.map((r) => { let n = 99; for (const d of G.on) if (d.team !== r.team) n = Math.min(n, Math.hypot(d.x - r.x, d.y - r.y)); return n > 3 ? 'open' : n < 1.6 ? 'tight' : ''; });
        sig = 'pass' + open.join(',');
        html = recs.map((r, i) => `<button data-throw="${r.label}" class="${open[i]}"><i>${r.label}</i>${esc(r.mon.name)}</button>`).join('');
      } else if (G.ctrl && G.ball.carrier === G.ctrl) { sig = 'juke' + (G.ctrl.jukeCd > 0 ? 0 : 1); html = `<button class="act" data-act="1" ${G.ctrl.jukeCd > 0 ? 'style="opacity:.4"' : ''}>JUKE</button>`; }
      else if (G.ctrl) { sig = 'switch'; html = '<button class="act" data-act="1">SWITCH</button>'; }
    }
    if (sig !== btnSig) { btnSig = sig; $('touchBtns').innerHTML = html; }
  }
  $('playcall').onclick = (e) => { const b = e.target.closest('button[data-k]'); if (b) G.input.call = b.dataset.k; };
  $('snapHint').onclick = () => { if (G) G.input.snap = true; };
  $('touchBtns').addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button'); if (!b || !G) return;
    e.preventDefault();
    if (b.dataset.throw) G.input.throwTo = +b.dataset.throw; else G.input.action = true;
  });
  $('field').addEventListener('pointerdown', (e) => {
    if (!G || G.human == null || G.phase !== 'live') return;
    const r = $('field').getBoundingClientRect(), p = R.pickReceiver(G, e.clientX - r.left, e.clientY - r.top);
    if (p) G.input.throwTo = p.label;
  });

  // Virtual stick.
  (function () {
    const el = $('stick'), knob = $('knob');
    const move = (e) => {
      const r = el.getBoundingClientRect(); let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
      const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
      stick.x = x; stick.y = y; stick.on = true; knob.style.transform = `translate(${x * 34}px, ${y * 34}px)`;
    };
    const end = () => { stick.on = false; stick.x = stick.y = 0; knob.style.transform = ''; };
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); move(e); });
    el.addEventListener('pointermove', (e) => { if (stick.on) move(e); });
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  })();

  addEventListener('keydown', (e) => {
    if (!G || $('game').classList.contains('hidden') || e.target.tagName === 'INPUT') return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.add(k);
    if (gameMode !== 'play') { if (k === ' ') { e.preventDefault(); $('gPause').click(); } return; }
    if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
    if (e.repeat) return;
    if (k >= '1' && k <= '7') {
      if (G.phase === 'presnap' && G.needCall) { const list = Object.keys(G.poss === G.human ? PG.OFF_PLAYS : PG.DEF_PLAYS); if (list[+k - 1]) G.input.call = list[+k - 1]; }
      else if (G.phase === 'live') G.input.throwTo = +k;
    }
    if (k === ' ') { if (G.phase === 'presnap') { if (!G.needCall) G.input.snap = true; } else G.input.action = true; }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  addEventListener('blur', () => keys.clear());
  addEventListener('resize', () => { if (R && !$('game').classList.contains('hidden')) R.resize(); });

  $('speedBtns').onclick = (e) => { const s = e.target.dataset.s; if (!s) return; speed = +s; for (const b of $('speedBtns').children) b.classList.toggle('on', b.dataset.s === s); };
  $('gPause').onclick = () => { paused = !paused; last = performance.now(); $('gPause').textContent = paused ? 'Resume' : 'Pause'; };
  $('gSkip').onclick = () => { if (!G || G.over) return; if (gameMode === 'play' && !confirm('Let the CPU finish this game for you?')) return; PG.finishNow(G); showFinal(); };
  $('gLog').onclick = () => { $('logPanel').classList.toggle('hidden'); renderLog(); };
  $('gQuit').onclick = () => { if (G && !G.over && !confirm('Quit this game?')) return; endGame(); };
  function endGame() { cancelAnimationFrame(raf); G = null; closeModal(); delete $('modal').dataset.sticky; show('home'); renderHome(); }

  // ---------- final / box score ----------
  function leaders(t) {
    const P = t.players, top = (f) => P.slice().sort((a, b) => f(b) - f(a))[0];
    const out = [];
    const qb = top((p) => p.st.att); if (qb.st.att) out.push([qb, `${qb.st.cmp}/${qb.st.att}, ${qb.st.pyd} yds, ${qb.st.ptd} TD, ${qb.st.int} INT`]);
    const rb = top((p) => p.st.ryd); if (rb.st.car) out.push([rb, `${rb.st.car} car, ${rb.st.ryd} yds, ${rb.st.rtd} TD`]);
    const wr = top((p) => p.st.recyd); if (wr.st.rec) out.push([wr, `${wr.st.rec} rec, ${wr.st.recyd} yds, ${wr.st.rectd} TD`]);
    const df = top((p) => p.st.tkl + p.st.sack * 2 + p.st.pick * 3); if (df.st.tkl + df.st.pick) out.push([df, `${df.st.tkl} tkl${df.st.sack ? `, ${df.st.sack} sack` : ''}${df.st.pick ? `, ${df.st.pick} INT` : ''}`]);
    return out.map(([p, line]) => `<div class="ld"><img alt="" src="${PG.spriteURL(p.mon)}"><div><b>${esc(p.mon.name)}</b> <span class="note">${p.pos}</span><br>${line}</div></div>`).join('');
  }
  function showFinal() {
    if (finalShown && gameMode !== 'instant') return;
    finalShown = true;
    const [a, b] = G.score, [h, w] = G.teams;
    if (!matchup.home.preset || gameMode === 'play') { if (a > b) state.record.w++; else if (a < b) state.record.l++; else state.record.t++; save(); }
    const head = a === b ? "It's a tie!" : gameMode === 'play' ? (a > b ? 'You win!' : 'You lose!') : `${esc(G.teams[a > b ? 0 : 1].name)} win!`;
    if (gameMode === 'play') (a >= b ? sfx.score : sfx.bad)();
    const row = (lab, f) => `<tr><td>${f(h)}</td><td>${lab}</td><td>${f(w)}</td></tr>`;
    $('modal').dataset.sticky = '1';
    modal(`<h2>${head}</h2>
      <div class="final-score"><div class="${a > b ? 'w' : ''}"><div class="t" style="color:${h.color}">${esc(h.name)}</div><div class="n">${a}</div></div><div class="note">FINAL${G.quarter > 4 ? ' / OT' : ''}</div><div class="${b > a ? 'w' : ''}"><div class="t" style="color:${w.color}">${esc(w.name)}</div><div class="n">${b}</div></div></div>
      <table class="box">${row('Total yards', (t) => t.st.yds)}${row('Passing', (t) => t.st.pyd)}${row('Rushing', (t) => t.st.ryd)}${row('First downs', (t) => t.st.first)}${row('Turnovers', (t) => t.st.to)}${row('Plays', (t) => t.st.plays)}</table>
      <div class="leaders"><div><h4 style="color:${h.color}">${esc(h.name)}</h4>${leaders(h)}</div><div><h4 style="color:${w.color}">${esc(w.name)}</h4>${leaders(w)}</div></div>
      <details style="margin-top:10px"><summary class="note">Scoring plays</summary>${G.log.filter((l) => l.big).map((l) => `<div class="note" style="padding:3px 0">${l.q > 4 ? 'OT' : 'Q' + l.q} · ${esc(l.text)}</div>`).join('')}</details>
      <div class="modal-actions"><button class="btn" id="fHome">Home</button><button class="btn" id="fSwap">Swap sides</button><button class="btn primary" id="fAgain">Rematch</button></div>`);
    const again = (swap) => { delete $('modal').dataset.sticky; closeModal(); const m = matchup; if (swap) { state.home = m.away.id; state.away = m.home.id; startGame(m.away, m.home, m.mode); } else startGame(m.home, m.away, m.mode); };
    $('fHome').onclick = endGame; $('fAgain').onclick = () => again(false); $('fSwap').onclick = () => again(true);
  }

  // Debug hook for automated testing.
  PG._debug = { get game() { return G; }, state, startGame, team };
  renderHome();
})();
