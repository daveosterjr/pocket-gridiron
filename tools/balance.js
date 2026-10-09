// Headless balance check: node tools/balance.js [games]
require('../js/data.js'); require('../js/core.js'); require('../js/engine.js');
const PG = globalThis.PG, N = +process.argv[2] || 100;
const pool = PG.MONS.filter((m) => !PG.isLegendary(m));
const presets = PG.presetSquads();
let pts = 0, plays = 0, att = 0, cmp = 0, pyd = 0, car = 0, ryd = 0, ints = 0, sacks = 0, ties = 0, hi = 0, to = 0, homeW = 0, fav = 0, favN = 0;
const calls = {};
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const a = i % 3 ? PG.autoFill(PG.newSquad('A'), pool) : presets[i % 8], b = i % 2 ? PG.autoFill(PG.newSquad('B'), pool) : presets[(i + 3) % 8];
  const g = PG.simulate(a, b, { firstPoss: i % 2 });
  pts += g.score[0] + g.score[1]; hi = Math.max(hi, ...g.score);
  if (g.score[0] === g.score[1]) ties++; else { if (g.score[0] > g.score[1]) homeW++; const d = PG.squadOvr(a) - PG.squadOvr(b); if (Math.abs(d) >= 2) { favN++; if ((d > 0) === (g.score[0] > g.score[1])) fav++; } }
  for (const t of g.teams) { plays += t.st.plays; to += t.st.to; for (const p of t.players) { att += p.st.att; cmp += p.st.cmp; pyd += p.st.pyd; car += p.st.car; ryd += p.st.ryd; ints += p.st.int; sacks += p.st.sack; } }
}
const G = N * 2;
console.log(`games ${N} in ${Date.now() - t0}ms | pts/team ${(pts / G).toFixed(1)} hi ${hi} | plays/team ${(plays / G).toFixed(1)} | cmp% ${(100 * cmp / att).toFixed(1)} att/team ${(att / G).toFixed(1)} yds/att ${(pyd / att).toFixed(1)} | car/team ${(car / G).toFixed(1)} ypc ${(ryd / car).toFixed(1)} | int/team ${(ints / G).toFixed(2)} sacks/team ${(sacks / G).toFixed(2)} TO/team ${(to / G).toFixed(2)} | ties ${ties} homeW ${homeW} | favourite wins ${fav}/${favN}`);
