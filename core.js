/* Ghost Co-op — deterministic game core (no DOM). Works in browser and Node. */
(function (root) {
  'use strict';

  var T = 32;            // tile size (px)
  var PW = 20, PH = 28;  // player size
  var SPEED = 3;         // px / frame
  var GRAV = 0.5;
  var JUMP = 9;          // initial jump velocity  (max jump height ~ 85px, i.e. < 3 tiles)
  var MAXFALL = 10;
  var LOOP_FRAMES = 1200; // 20 s at 60 fps
  var MAX_GHOSTS = 5;

  /* ---- Levels -------------------------------------------------------------
     #  wall        .  empty        S  spawn        E  exit
     a-c  pressure plate (lowercase)    A-C  door (uppercase) – a door letter
     written on the bottom row grows upward automatically to the ceiling.
     A door opens while ALL plates with the same letter are pressed.        */
  var LEVELS = [
    {
      name: 'First Echo', par: 1,
      hint: 'Stand on the plate, press R to save an echo. The echo keeps the door open for you.',
      rows: [
        '####################',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#S....a....A......E#',
        '####################'
      ]
    },
    {
      name: 'Step Up', par: 1,
      hint: 'The ledge is too high. Echoes are solid from above, so wait for your echo, hop on its head and jump again.',
      rows: [
        '####################',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#................E.#',
        '#...........########',
        '#...........########',
        '#S..........########',
        '####################'
      ]
    },
    {
      name: 'Two Keys', par: 2,
      hint: 'The door needs BOTH plates pressed at the same time. Save one echo per plate.',
      rows: [
        '####################',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#S..a...a..A.....E.#',
        '####################'
      ]
    },
    {
      name: 'Double Door', par: 2,
      hint: 'Open the first door with one echo, then reach the second plate and leave another echo there.',
      rows: [
        '####################',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#S..a..A...b..B...E#',
        '####################'
      ]
    },
    {
      name: 'Tower', par: 2,
      hint: 'Four tiles is too high even from one echo. Stack echoes: echo #2 stands on echo #1.',
      rows: [
        '####################',
        '#..................#',
        '#..................#',
        '#..................#',
        '#................E.#',
        '#...........########',
        '#...........########',
        '#...........########',
        '#S..........########',
        '####################'
      ]
    },
    {
      name: 'High Switch', par: 2,
      hint: 'The plate sits on a ledge. Echo #1 is a step, echo #2 holds the plate, and you need both again to cross.',
      rows: [
        '####################',
        '#..................#',
        '#..................#',
        '#..................#',
        '#..................#',
        '#.....a............#',
        '#..#####...........#',
        '#..#####...........#',
        '#S.#####...A.....E.#',
        '####################'
      ]
    }
  ];

  function parseLevel(def) {
    var rows = def.rows.map(function (r) { return r.split(''); });
    var h = rows.length, w = rows[0].length, c, r;
    rows.forEach(function (row, i) {
      if (row.length !== w) throw new Error('Level "' + def.name + '" row ' + i + ' has wrong length');
    });
    // grow doors upward
    for (r = h - 1; r >= 0; r--) {
      for (c = 0; c < w; c++) {
        var ch = rows[r][c];
        if (ch >= 'A' && ch <= 'Z') {
          var rr = r - 1;
          while (rr >= 1 && rows[rr][c] === '.') { rows[rr][c] = ch; rr--; }
        }
      }
    }
    var L = { name: def.name, hint: def.hint, par: def.par, cols: w, rows: h, tiles: rows,
              spawn: null, exit: null, plates: [], doors: {} };
    for (r = 0; r < h; r++) {
      for (c = 0; c < w; c++) {
        var ch2 = rows[r][c];
        if (ch2 === 'S') { L.spawn = { x: c * T + (T - PW) / 2, y: (r + 1) * T - PH }; rows[r][c] = '.'; }
        else if (ch2 === 'E') { L.exit = { c: c, r: r }; rows[r][c] = '.'; }
        else if (ch2 >= 'a' && ch2 <= 'z') { L.plates.push({ c: c, r: r, id: ch2.toUpperCase() }); rows[r][c] = '.'; }
        else if (ch2 >= 'A' && ch2 <= 'Z') { (L.doors[ch2] = L.doors[ch2] || []).push({ c: c, r: r }); }
      }
    }
    if (!L.spawn || !L.exit) throw new Error('Level "' + def.name + '" needs S and E');
    return L;
  }

  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  /* ---- Simulation --------------------------------------------------------- */
  function Sim(level, ghosts) {
    this.L = level;
    this.ghosts = ghosts || [];
    this.p = { x: level.spawn.x, y: level.spawn.y, vx: 0, vy: 0, ground: true, face: 1 };
    this.t = 0;
    this.rec = [{ x: this.p.x, y: this.p.y }];
    this.open = {};
    this.pressed = {};   // plate index -> bool (for rendering)
    this.coyote = 0;
    this.jumpBuf = 0;
    this.prevJ = false;
    this.won = false;
    this.events = [];    // 'jump' | 'land' | 'door' | 'plate'
    this._doors(0);
  }

  Sim.prototype.ghostPos = function (g, f) {
    var r = g.rec;
    return r[Math.min(f, r.length - 1)];
  };

  Sim.prototype.solid = function (c, r) {
    var L = this.L;
    if (c < 0 || r < 0 || c >= L.cols || r >= L.rows) return true;
    var ch = L.tiles[r][c];
    if (ch === '#') return true;
    if (ch >= 'A' && ch <= 'Z') return !this.open[ch];
    return false;
  };

  // Recompute plate / door state from actor positions at frame f.
  Sim.prototype._doors = function (f) {
    var L = this.L, self = this, actors = [{ x: this.p.x, y: this.p.y }], i;
    for (i = 0; i < this.ghosts.length; i++) actors.push(this.ghostPos(this.ghosts[i], f));
    var byId = {};
    L.plates.forEach(function (pl, idx) {
      var on = actors.some(function (a) {
        return overlap(a.x, a.y, PW, PH, pl.c * T, pl.r * T + T - 8, T, 8);
      });
      if (on && !self.pressed[idx]) self.events.push('plate');
      self.pressed[idx] = on;
      (byId[pl.id] = byId[pl.id] || []).push(on);
    });
    Object.keys(L.doors).forEach(function (id) {
      var want = !!byId[id] && byId[id].every(Boolean);
      if (!want) { // never close a door on top of somebody
        want = L.doors[id].some(function (d) {
          return actors.some(function (a) { return overlap(a.x, a.y, PW, PH, d.c * T, d.r * T, T, T); });
        });
      }
      if (want !== !!self.open[id]) self.events.push('door');
      self.open[id] = want;
    });
  };

  Sim.prototype._moveX = function (p) {
    var r0 = Math.floor(p.y / T), r1 = Math.floor((p.y + PH - 0.001) / T), r;
    if (p.vx > 0) {
      var c = Math.floor((p.x + PW - 0.001) / T);
      for (r = r0; r <= r1; r++) if (this.solid(c, r)) { p.x = c * T - PW; return; }
    } else if (p.vx < 0) {
      var c2 = Math.floor(p.x / T);
      for (r = r0; r <= r1; r++) if (this.solid(c2, r)) { p.x = (c2 + 1) * T; return; }
    }
  };

  Sim.prototype._moveY = function (p, prevBottom, f) {
    var c0 = Math.floor(p.x / T), c1 = Math.floor((p.x + PW - 0.001) / T), c, i;
    var wasGround = p.ground;
    p.ground = false;
    if (p.vy > 0) {
      var r = Math.floor((p.y + PH - 0.001) / T), best = null;
      for (c = c0; c <= c1; c++) {
        if (this.solid(c, r) && prevBottom <= r * T + 0.001) { best = best === null ? r * T : Math.min(best, r * T); }
      }
      // echoes are one-way platforms (solid from above)
      for (i = 0; i < this.ghosts.length; i++) {
        var gp = this.ghostPos(this.ghosts[i], f);
        if (p.x < gp.x + PW && p.x + PW > gp.x && prevBottom <= gp.y + 2 && p.y + PH >= gp.y) {
          best = best === null ? gp.y : Math.min(best, gp.y);
        }
      }
      if (best !== null) {
        p.y = best - PH; p.vy = 0; p.ground = true;
        if (!wasGround) this.events.push('land');
      }
    } else if (p.vy < 0) {
      var rt = Math.floor(p.y / T);
      for (c = c0; c <= c1; c++) if (this.solid(c, rt)) { p.y = (rt + 1) * T; p.vy = 0; break; }
    }
  };

  // inp: {l, r, j}
  Sim.prototype.step = function (inp) {
    if (this.won) return;
    this.events = [];
    var p = this.p, L = this.L;
    this._doors(this.t);

    var dir = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
    p.vx = dir * SPEED;
    if (dir) p.face = dir;
    p.x += p.vx;
    this._moveX(p);

    if (p.ground) this.coyote = 6; else if (this.coyote > 0) this.coyote--;
    if (inp.j && !this.prevJ) this.jumpBuf = 6; else if (this.jumpBuf > 0) this.jumpBuf--;
    this.prevJ = !!inp.j;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      p.vy = -JUMP; p.ground = false; this.coyote = 0; this.jumpBuf = 0;
      this.events.push('jump');
    }

    p.vy = Math.min(p.vy + GRAV, MAXFALL);
    var prevBottom = p.y + PH;
    p.y += p.vy;
    this._moveY(p, prevBottom, this.t + 1);

    this.t++;
    this.rec.push({ x: p.x, y: p.y });

    if (overlap(p.x, p.y, PW, PH, L.exit.c * T + 4, L.exit.r * T, T - 8, T)) {
      this.won = true;
      this.events.push('win');
    }
  };

  var api = {
    T: T, PW: PW, PH: PH, LOOP_FRAMES: LOOP_FRAMES, MAX_GHOSTS: MAX_GHOSTS,
    LEVELS: LEVELS, parseLevel: parseLevel, Sim: Sim
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GhostCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
