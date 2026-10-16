// Verifies every level is solvable (and not trivially solvable) using scripted input.
// Run:  node test/solve.js
const C = require('../core.js');
const L = C.LEVELS.map(C.parseLevel);
const T = C.T, PW = C.PW;

function loop(level, ghosts, ctrl, max, stop) {
  const s = new C.Sim(level, ghosts);
  for (let i = 0; i < max && !s.won; i++) {
    s.step(ctrl(s, i));
    if (stop && stop(s, i)) break;
  }
  return s;
}
const idle = (n) => (s, i) => i < n;           // helper: true while still waiting
const R = { r: true }, N = {};

let fails = 0;
function check(name, cond) { console.log((cond ? 'PASS ' : 'FAIL ') + name); if (!cond) fails++; }

// ---- walk-through without any ghost must NOT win on levels 1..6
L.forEach((lv, i) => {
  const s = loop(lv, [], (s) => ({ r: true, j: s.t % 40 === 0 }), 900);
  check('L' + (i + 1) + ' cannot be beaten with zero echoes', !s.won);
});

// ---- Level 1
(function () {
  const lv = L[0];
  const g1 = loop(lv, [], (s) => (s.p.x < 6 * T + 10 ? R : N), 400, (s) => s.t > 120);
  const s = loop(lv, [{ rec: g1.rec }], () => R, 600);
  check('L1 solved with 1 echo', s.won);
})();

// ---- Level 2 : echo as a stepping stool (search for a working jump position)
(function () {
  const lv = L[1];
  const g1 = loop(lv, [], (s) => (s.p.x < 400 ? R : N), 400, (s) => s.t > 150);
  let ok = false;
  for (let jx = 200; jx < 364 && !ok; jx += 2) {
    const s = loop(lv, [{ rec: g1.rec }], (s, i) => {
      if (i < 150) return N;
      return { r: true, j: s.p.ground && s.p.x >= jx && s.p.x < 380 };
    }, 700);
    ok = s.won;
  }
  check('L2 solved with 1 echo (stool)', ok);
})();

// ---- Level 3 : two plates
(function () {
  const lv = L[2];
  const rec = (px) => loop(lv, [], (s) => (s.p.x < px ? R : N), 400, (s) => s.t > 120).rec;
  const gA = { rec: rec(4 * T + 10) };
  const gB = { rec: rec(8 * T + 10) };
  const one = loop(lv, [gA], () => R, 600);
  check('L3 NOT solved with only one echo', !one.won);
  const two = loop(lv, [gA, gB], () => R, 600);
  check('L3 solved with 2 echoes', two.won);
})();

// ---- Level 4 : double door
(function () {
  const lv = L[3];
  const gA = { rec: loop(lv, [], (s) => (s.p.x < 4 * T + 10 ? R : N), 400, (s) => s.t > 120).rec };
  const gB = { rec: loop(lv, [gA], (s) => (s.p.x < 11 * T + 10 ? R : N), 400, (s) => s.t > 200).rec };
  const one = loop(lv, [gA], () => R, 600);
  check('L4 NOT solved with 1 echo', !one.won);
  const two = loop(lv, [gA, gB], () => R, 600);
  check('L4 solved with 2 echoes', two.won);
})();

// ---- Level 5 : tower of two echoes
(function () {
  const lv = L[4];
  const g1 = loop(lv, [], (s) => (s.p.x < 400 ? R : N), 400, (s) => s.t > 150);
  const gA = { rec: g1.rec };
  let found = null;
  // echo #2 = hop onto echo #1 and stay put
  for (let jx = 200; jx < 364 && !found; jx += 2) {
    const s = loop(lv, [gA], (s, i) => {
      if (i < 150) return N;
      if (s.p.ground && s.p.y + C.PH < 270) return N;
      return { r: true, j: s.p.ground && s.p.x >= jx };
    }, 400, (s, i) => i > 150 && s.p.ground && s.p.y + C.PH < 270 && s.p.vx === 0 && i > 330);
    if (s.p.y + C.PH < 270 && s.p.ground) found = { jx: jx, rec: s.rec };
  }
  check('L5 echo #2 can stand on echo #1', !!found);
  if (!found) return;
  const gB = { rec: found.rec };
  let one = false, two = false;
  for (let jx = 200; jx < 364; jx += 2) {
    const mk = (ghosts) => loop(lv, ghosts, (s, i) => {
      if (i < 420) return N;
      return { r: true, j: s.p.ground && s.p.x >= jx && s.p.x < 380 };
    }, 900);
    if (mk([gA]).won) one = true;
    if (mk([gA, gB]).won) two = true;
  }
  check('L5 NOT solved with 1 echo', !one);
  check('L5 solved with 2 stacked echoes', two);
})();

// ---- Level 6 : plate on a ledge
(function () {
  const lv = L[5];
  const stool = { rec: loop(lv, [], (s) => (s.p.x < 90 ? R : N), 300, (s) => s.t > 100).rec };
  let plate = null;
  for (let jx = 36; jx < 76 && !plate; jx += 2) {
    const s = loop(lv, [stool], (s, i) => {
      if (i < 60) return N;
      if (s.p.x >= 6 * T + 4 && s.p.ground && s.p.y + C.PH === 6 * T) return N;
      return { r: true, j: s.p.ground && s.p.x >= jx && s.p.x < 90 };
    }, 500, (s, i) => s.p.x >= 6 * T + 4 && s.p.ground && s.p.y + C.PH === 6 * T && i > 200);
    if (s.p.ground && s.p.y + C.PH === 6 * T && s.p.x >= 6 * T) plate = { rec: s.rec, jx };
  }
  check('L6 echo #2 reaches the plate', !!plate);
  if (!plate) return;
  let won = false;
  for (let jx = 36; jx < 76 && !won; jx += 2) {
    won = loop(lv, [stool, { rec: plate.rec }], (s, i) => {
      if (i < 250) return N;
      return { r: true, j: s.p.ground && s.p.x >= jx && s.p.x < 90 };
    }, 1000).won;
  }
  check('L6 solved with 2 echoes', won);
})();

console.log(fails ? '\n' + fails + ' FAILED' : '\nAll levels verified.');
process.exit(fails ? 1 : 0);
