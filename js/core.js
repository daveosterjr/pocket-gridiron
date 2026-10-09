// Ratings, type matchups, salary cap and squad building. No DOM access in here.
(function () {
  const PG = (globalThis.PG = globalThis.PG || {});

  PG.LEGENDARY_IDS = [144, 145, 146, 150, 151];
  PG.CAP = 465;

  PG.TYPE_COLORS = {
    normal: '#a8a77a', fire: '#ee8130', water: '#6390f0', electric: '#f7d02c', grass: '#7ac74c', ice: '#96d9d6',
    fighting: '#c22e28', poison: '#a33ea1', ground: '#e2bf65', flying: '#a98ff3', psychic: '#f95587', bug: '#a6b91a',
    rock: '#b6a136', ghost: '#735797', dragon: '#6f35fc', dark: '#705746', steel: '#b7b7ce', fairy: '#d685ad',
  };

  // attacker -> [super effective, not very effective, no effect]
  const CHART = {
    normal: ['', 'rock steel', 'ghost'],
    fire: ['grass ice bug steel', 'fire water rock dragon', ''],
    water: ['fire ground rock', 'water grass dragon', ''],
    electric: ['water flying', 'electric grass dragon', 'ground'],
    grass: ['water ground rock', 'fire grass poison flying bug dragon steel', ''],
    ice: ['grass ground flying dragon', 'fire water ice steel', ''],
    fighting: ['normal ice rock dark steel', 'poison flying psychic bug fairy', 'ghost'],
    poison: ['grass fairy', 'poison ground rock ghost', 'steel'],
    ground: ['fire electric poison rock steel', 'grass bug', 'flying'],
    flying: ['grass fighting bug', 'electric rock steel', ''],
    psychic: ['fighting poison', 'psychic steel', 'dark'],
    bug: ['grass psychic dark', 'fire fighting poison flying ghost steel fairy', ''],
    rock: ['fire ice flying bug', 'fighting ground steel', ''],
    ghost: ['psychic ghost', 'dark', 'normal'],
    dragon: ['dragon', 'steel', 'fairy'],
    dark: ['psychic ghost', 'fighting dark fairy', ''],
    steel: ['ice rock fairy', 'fire water electric steel', ''],
    fairy: ['fighting dragon dark', 'fire poison steel', ''],
  };
  const EFF = {};
  for (const [atk, [sup, weak, none]] of Object.entries(CHART)) {
    EFF[atk] = {};
    sup.split(' ').forEach((t) => t && (EFF[atk][t] = 2));
    weak.split(' ').forEach((t) => t && (EFF[atk][t] = 0.5));
    none.split(' ').forEach((t) => t && (EFF[atk][t] = 0));
  }

  function typeBonus(a, b) {
    let best = 0;
    for (const at of a.types) {
      let e = 1;
      for (const dt of b.types) e *= EFF[at][dt] ?? 1;
      best = Math.max(best, e);
    }
    if (best === 0) return -6;
    return Math.max(-7, Math.min(7, Math.log2(best) * 3.5));
  }
  // Net rating swing for `a` in a one-on-one with `b`. Positive favours a.
  const edgeCache = new Map();
  PG.typeEdge = function (a, b) {
    const k = a.id * 200 + b.id;
    let v = edgeCache.get(k);
    if (v === undefined) edgeCache.set(k, (v = (typeBonus(a, b) - typeBonus(b, a)) * 0.6));
    return v;
  };

  const scale = (raw) => Math.max(30, Math.min(99, 35 + (60 * (raw - 20)) / 110));

  // Football attributes derived from the six base stats.
  PG.attrs = function (m) {
    if (m._a) return m._a;
    const a = {
      SPD: scale(m.spe),
      PWR: scale(0.6 * m.atk + 0.4 * Math.min(m.hp, 140)),
      ARM: scale(m.spa),
      ACC: scale(0.6 * m.spd + 0.4 * m.spa),
      HANDS: scale(0.5 * m.spd + 0.3 * m.spe + 0.2 * m.spa),
      BLOCK: scale(0.5 * m.def + 0.3 * Math.min(m.hp, 140) + 0.2 * m.atk),
      RUSH: scale(0.55 * m.atk + 0.25 * m.spe + 0.2 * Math.min(m.hp, 140)),
      TACKLE: scale(0.5 * m.atk + 0.3 * m.def + 0.2 * Math.min(m.hp, 140)),
      COVER: scale(0.45 * m.spe + 0.35 * m.spd + 0.2 * m.def),
      KICK: scale(0.5 * m.spa + 0.3 * m.atk + 0.2 * m.spd),
    };
    return (m._a = a);
  };

  PG.POS_WEIGHTS = {
    QB: { ARM: 0.4, ACC: 0.35, SPD: 0.15, PWR: 0.1 },
    RB: { SPD: 0.45, PWR: 0.4, HANDS: 0.15 },
    WR: { SPD: 0.5, HANDS: 0.4, PWR: 0.1 },
    TE: { HANDS: 0.3, BLOCK: 0.3, PWR: 0.2, SPD: 0.2 },
    OL: { BLOCK: 0.8, PWR: 0.2 },
    DL: { RUSH: 0.7, TACKLE: 0.3 },
    LB: { TACKLE: 0.4, COVER: 0.25, RUSH: 0.2, SPD: 0.15 },
    CB: { COVER: 0.65, SPD: 0.25, TACKLE: 0.1 },
    S: { COVER: 0.5, TACKLE: 0.3, SPD: 0.2 },
    K: { KICK: 1 },
  };
  PG.POS_HINT = {
    QB: 'Sp. Atk = arm strength, Sp. Def = accuracy',
    RB: 'Speed + Attack',
    WR: 'Speed + Sp. Def (hands)',
    TE: 'Hands, blocking and power',
    OL: 'Defense + HP',
    DL: 'Attack + Speed',
    LB: 'Attack, Defense and range',
    CB: 'Speed + Sp. Def',
    S: 'Coverage and tackling',
    K: 'Sp. Atk + Attack',
  };
  PG.rating = function (m, pos) {
    const a = PG.attrs(m);
    let r = 0;
    for (const [k, w] of Object.entries(PG.POS_WEIGHTS[pos])) r += a[k] * w;
    return Math.round(r);
  };
  PG.bst = (m) => m.hp + m.atk + m.def + m.spa + m.spd + m.spe;
  PG.cost = (m) => Math.max(4, Math.round((PG.bst(m) - 150) / 10));

  PG.SLOTS = [
    { key: 'QB', pos: 'QB', side: 'O' }, { key: 'RB', pos: 'RB', side: 'O' },
    { key: 'WR1', pos: 'WR', side: 'O' }, { key: 'WR2', pos: 'WR', side: 'O' }, { key: 'TE', pos: 'TE', side: 'O' },
    { key: 'OL1', pos: 'OL', side: 'O' }, { key: 'OL2', pos: 'OL', side: 'O' },
    { key: 'DL1', pos: 'DL', side: 'D' }, { key: 'DL2', pos: 'DL', side: 'D' },
    { key: 'LB1', pos: 'LB', side: 'D' }, { key: 'LB2', pos: 'LB', side: 'D' },
    { key: 'CB1', pos: 'CB', side: 'D' }, { key: 'CB2', pos: 'CB', side: 'D' }, { key: 'S', pos: 'S', side: 'D' },
    { key: 'K', pos: 'K', side: 'S' },
  ];

  PG.byId = (id) => PG.MONS[id - 1];
  PG.isLegendary = (m) => PG.LEGENDARY_IDS.includes(m.id);

  PG.squadCost = (sq) => Object.values(sq.slots).reduce((s, id) => s + (id ? PG.cost(PG.byId(id)) : 0), 0);
  PG.squadFull = (sq) => PG.SLOTS.every((s) => sq.slots[s.key]);
  PG.squadOvr = function (sq, side) {
    const sl = PG.SLOTS.filter((s) => (!side || s.side === side) && sq.slots[s.key]);
    if (!sl.length) return 0;
    return Math.round(sl.reduce((t, s) => t + PG.rating(PG.byId(sq.slots[s.key]), s.pos), 0) / sl.length);
  };

  // Fill empty slots with the best fits that keep the squad under the cap.
  PG.autoFill = function (sq, pool, rng = Math.random, cap = PG.CAP) {
    const used = new Set(Object.values(sq.slots).filter(Boolean));
    const open = PG.SLOTS.filter((s) => !sq.slots[s.key]);
    // Shuffle so repeated auto-fills (and preset teams) don't all look alike.
    const order = open.map((s) => [rng(), s]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    let budget = cap - PG.squadCost(sq);
    const minCost = Math.min(...pool.map(PG.cost));
    order.forEach((slot, i) => {
      const reserve = (order.length - i - 1) * Math.max(minCost, 14);
      const share = (budget - reserve) ;
      const target = Math.min(share, (budget / (order.length - i)) * 1.25);
      let best = null, bestScore = -1e9;
      for (const m of pool) {
        if (used.has(m.id)) continue;
        const c = PG.cost(m);
        if (c > share) continue;
        const score = PG.rating(m, slot.pos) - Math.max(0, c - target) * 1.4 + rng() * 5;
        if (score > bestScore) (bestScore = score), (best = m);
      }
      if (!best) best = pool.filter((m) => !used.has(m.id)).sort((a, b) => PG.cost(a) - PG.cost(b))[0];
      if (best) { sq.slots[slot.key] = best.id; used.add(best.id); budget -= PG.cost(best); }
    });
    return sq;
  };

  PG.newSquad = (name, color = '#e23b3b') => ({
    id: 'sq_' + Math.random().toString(36).slice(2, 9), name, color, slots: Object.fromEntries(PG.SLOTS.map((s) => [s.key, null])),
  });

  // Seeded RNG so preset rosters are identical for everyone.
  PG.mulberry = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // Pre-made league. Each team is built around a few captains, then filled out from its type pool.
  const PRESETS = [
    ['Cinnabar 49-Embers', '#e8622c', ['fire', 'ground'], { QB: 6, RB: 59, WR1: 78 }, 'Charizard slings it deep behind a scorching backfield.'],
    ['Cerulean Shellhawks', '#2f6fd6', ['water'], { OL1: 9, WR1: 121, QB: 55 }, 'Blastoise anchors the line. Starmie burns you outside.'],
    ['Viridian Vinekings', '#3f9a3a', ['grass', 'bug', 'poison'], { QB: 3, DL1: 123, RB: 127 }, 'Venusaur runs a patient, punishing offense.'],
    ['Vermilion Volt Chargers', '#e0b61c', ['electric', 'steel', 'normal'], { WR1: 25, RB: 26, WR2: 101 }, 'Pikachu and friends. Fastest team in the league.'],
    ['Saffron Psy-Ravens', '#d9457a', ['psychic', 'fairy', 'ghost'], { QB: 65, WR1: 64, S: 122 }, 'Alakazam reads every defense before the snap.'],
    ['Pewter Rock Steelers', '#8c7a4a', ['rock', 'ground'], { OL1: 95, OL2: 76, DL1: 112 }, 'Slow, mean, and impossible to move.'],
    ['Machamp Bay Brawlers', '#b8352f', ['fighting', 'normal'], { DL1: 68, LB1: 107, RB: 106 }, 'Four arms, zero missed tackles.'],
    ['Pidgeotdelphia Gust Eagles', '#5f8f8a', ['flying', 'normal'], { WR1: 18, WR2: 22, RB: 85 }, 'A track meet through the air.'],
    ['Lavender Town Raiders', '#6b4fa0', ['ghost', 'poison'], { QB: 94, CB1: 93, LB1: 34 }, 'Gengar haunts the pocket. Nobody sleeps the night before.'],
    ['Seafoam Dol-Fins', '#35a7c9', ['water', 'ice'], { QB: 131, WR1: 124, DL1: 91 }, 'Lapras leads a cool, clinical passing game.'],
    ['Safari Zone Bronc-Tauros', '#c98a3a', ['normal'], { RB: 128, OL1: 143, LB1: 115 }, 'Tauros stampedes behind a Snorlax-sized hole.'],
    ['Indigo Dragon-Jets', '#5a3fe0', ['dragon', 'flying', 'fire'], { LB1: 149, QB: 148, WR1: 142 }, 'Dragonite does everything. The rest just hang on.'],
  ];
  PG.presetSquads = function (withLegends) {
    const list = PRESETS.map(([name, color, types, caps, blurb], i) => {
      const sq = PG.newSquad(name, color);
      sq.id = 'preset_' + i; sq.preset = true; sq.blurb = blurb;
      Object.assign(sq.slots, caps);
      const pool = PG.MONS.filter((m) => !PG.isLegendary(m) && m.types.some((t) => types.includes(t)));
      return PG.autoFill(sq, pool, PG.mulberry(1000 + i * 77));
    });
    if (withLegends) {
      const sq = PG.newSquad('Mewtwo England Psy-triots', '#7d5fb8');
      sq.id = 'preset_legends'; sq.preset = true; sq.blurb = 'The dynasty. All five legendaries on one roster.';
      Object.assign(sq.slots, { QB: 150, WR1: 151, RB: 145, S: 144, LB1: 146 });
      list.push(PG.autoFill(sq, PG.MONS.filter((m) => !PG.isLegendary(m)), PG.mulberry(4242)));
    }
    return list;
  };
  PG.randomSquad = function (allowLegendary, name = 'Wild Draft') {
    const sq = PG.newSquad(name, ['#e23b3b', '#3d7be0', '#4c9a3a', '#e0b61c', '#8e3fa0', '#20a39e'][Math.floor(Math.random() * 6)]);
    return PG.autoFill(sq, PG.MONS.filter((m) => allowLegendary || !PG.isLegendary(m)));
  };
})();
