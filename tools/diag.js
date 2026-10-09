require('../js/data.js'); require('../js/core.js'); require('../js/engine.js');
const PG = globalThis.PG, N = +process.argv[2] || 60, pool = PG.MONS.filter((m) => !PG.isLegendary(m));
const agg = {};
for (let i = 0; i < N; i++) {
  const g = PG.simulate(PG.autoFill(PG.newSquad('A'), pool), PG.autoFill(PG.newSquad('B'), pool));
  for (const h of g.hist) for (const key of [h.off, 'vs ' + h.def]) {
    const a = (agg[key] = agg[key] || { n: 0, yds: 0, cmp: 0, air: 0, big: 0, to: 0, sack: 0, t: 0 });
    a.n++; a.yds += h.turnover ? 0 : h.yds; a.t += h.t || 0; if (h.caught) { a.cmp++; a.air += h.air; } if (h.yds >= 25) a.big++; if (h.turnover) a.to++; if (h.sack) a.sack++;
  }
}
for (const [k, a] of Object.entries(agg)) console.log(k.padEnd(12), 'n', String(a.n).padEnd(5), 'avg', (a.yds / a.n).toFixed(1).padEnd(5), 'cmp%', (100 * a.cmp / a.n).toFixed(0).padEnd(3), 'air/c', (a.air / (a.cmp || 1)).toFixed(1).padEnd(5), 'big%', (100 * a.big / a.n).toFixed(0).padEnd(3), 'to%', (100 * a.to / a.n).toFixed(1).padEnd(4), 'sack%', (100 * a.sack / a.n).toFixed(1), 'dur', (a.t / a.n).toFixed(1));
