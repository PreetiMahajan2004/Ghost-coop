/* Ghost Co-op — rendering, input, UI. Uses GhostCore (core.js). */
(function () {
  'use strict';
  var C = window.GhostCore, T = C.T, PW = C.PW, PH = C.PH;
  var LEVELS = C.LEVELS.map(C.parseLevel);
  var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height;

  var DOOR_COL = { A: '#ff5d8f', B: '#ffb347', C: '#6df2c1' };
  var GHOST_COL = ['#6df2c1', '#8ab4ff', '#ff9ee0', '#ffd36e', '#b79cff'];

  /* ---------- persistence (safe) ---------- */
  var KEY = 'ghostcoop.v1';
  var save = { stars: {} };
  try { var raw = localStorage.getItem(KEY); if (raw) save = JSON.parse(raw) || save; } catch (e) {}
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

  /* ---------- audio ---------- */
  var actx = null, muted = false;
  function beep(f, d, type, vol, slide) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'square'; o.frequency.value = f;
      if (slide) o.frequency.linearRampToValueAtTime(f + slide, actx.currentTime + d);
      g.gain.value = vol || 0.04;
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
    } catch (e) {}
  }
  var SFX = {
    jump: function () { beep(380, 0.12, 'square', 0.03, 260); },
    land: function () { beep(120, 0.06, 'triangle', 0.05); },
    plate: function () { beep(660, 0.08, 'sine', 0.06); },
    door: function () { beep(220, 0.2, 'sawtooth', 0.025, -60); },
    save: function () { beep(520, 0.25, 'sine', 0.07, 400); },
    win: function () { beep(523, 0.15, 'triangle', 0.07); setTimeout(function () { beep(659, 0.15, 'triangle', 0.07); }, 130); setTimeout(function () { beep(784, 0.3, 'triangle', 0.07); }, 260); }
  };

  /* ---------- state ---------- */
  var cur = 0, level, ghosts, sim, state = 'menu', particles = [], shake = 0;

  function startLevel(i) {
    cur = i; level = LEVELS[i]; ghosts = [];
    sim = new C.Sim(level, ghosts);
    document.getElementById('lvlName').textContent = (i + 1) + '. ' + level.name;
    document.getElementById('hint').textContent = level.hint;
    hide('menu'); hide('win'); state = 'play'; updateHud();
  }
  function retryLoop() { sim = new C.Sim(level, ghosts); updateHud(); }
  function resetLevel() { ghosts.length = 0; retryLoop(); toast('All echoes cleared'); }
  function commit(auto) {
    if (state !== 'play') return;
    if (sim.t < 10) { toast('Move a little first'); return; }
    if (ghosts.length >= C.MAX_GHOSTS) { toast('Max ' + C.MAX_GHOSTS + ' echoes — reset the level'); return; }
    ghosts.push({ rec: sim.rec });
    burst(sim.p.x + PW / 2, sim.p.y + PH / 2, GHOST_COL[(ghosts.length - 1) % 5], 18);
    sim = new C.Sim(level, ghosts);
    SFX.save(); toast(auto ? 'Time up — echo saved!' : 'Echo #' + ghosts.length + ' saved');
    updateHud();
  }

  /* ---------- UI helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function hide(id) { $(id).classList.add('hidden'); }
  function show(id) { $(id).classList.remove('hidden'); }
  var toastT = 0;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 1400); }
  function updateHud() {
    $('loopInfo').textContent = 'Echoes ' + ghosts.length + '/' + C.MAX_GHOSTS + '  ·  Loop ' + (ghosts.length + 1);
  }
  function buildMenu() {
    var box = $('levels'); box.innerHTML = '';
    LEVELS.forEach(function (L, i) {
      var unlocked = i === 0 || save.stars[i - 1] > 0;
      var b = document.createElement('button');
      b.className = 'lv'; b.disabled = !unlocked;
      var s = save.stars[i] || 0;
      b.innerHTML = '<b>' + (i + 1) + '. ' + L.name + '</b><span class="st">' + '★'.repeat(s) + '☆'.repeat(3 - s) + '</span>';
      b.onclick = function () { startLevel(i); };
      box.appendChild(b);
    });
  }
  function showMenu() { buildMenu(); show('menu'); state = 'menu'; }

  /* ---------- input ---------- */
  var keys = {}, touch = { l: false, r: false, j: false };
  var MAP = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'j', w: 'j', W: 'j', ' ': 'j' };
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var m = MAP[e.key];
    if (m) { keys[m] = true; e.preventDefault(); return; }
    if (state === 'play' && !e.repeat) {
      if (e.key === 'r' || e.key === 'R') commit(false);
      else if (e.key === 'z' || e.key === 'Z' || e.key === 'Backspace') { e.preventDefault(); retryLoop(); }
      else if (e.key === 'x' || e.key === 'X') resetLevel();
    }
    if (e.key === 'Escape') { state === 'menu' ? (cur >= 0 && level && startLevel(cur)) : showMenu(); }
  });
  window.addEventListener('keyup', function (e) { var m = MAP[e.key]; if (m) keys[m] = false; });
  window.addEventListener('blur', function () { keys = {}; touch.l = touch.r = touch.j = false; });
  Array.prototype.forEach.call(document.querySelectorAll('.tbtn'), function (b) {
    var k = b.dataset.k;
    function on(e) { e.preventDefault(); touch[k] = true; b.classList.add('on'); }
    function off(e) { e.preventDefault(); touch[k] = false; b.classList.remove('on'); }
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });
  $('btnCommit').onclick = function () { commit(false); };
  $('btnRetry').onclick = retryLoop;
  $('btnReset').onclick = resetLevel;
  $('btnMenu').onclick = showMenu;
  $('btnMute').onclick = function () { muted = !muted; $('btnMute').textContent = muted ? '🔇' : '🔊'; };
  $('btnAgain').onclick = function () { startLevel(cur); };
  $('btnNext').onclick = function () { if (cur + 1 < LEVELS.length) startLevel(cur + 1); else showMenu(); };

  /* ---------- particles ---------- */
  function burst(x, y, col, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, s = 0.5 + Math.random() * 2.5;
      particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 30 + Math.random() * 20, c: col });
    }
  }

  /* ---------- win ---------- */
  function onWin() {
    state = 'won'; SFX.win();
    var n = ghosts.length, stars = n <= level.par ? 3 : (n === level.par + 1 ? 2 : 1);
    if (!save.stars[cur] || save.stars[cur] < stars) save.stars[cur] = stars;
    persist();
    $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('winText').textContent = 'Solved with ' + n + ' echo' + (n === 1 ? '' : 'es') + ' (par ' + level.par + ').';
    $('btnNext').textContent = cur + 1 < LEVELS.length ? 'Next level ▶' : 'All levels ▶';
    burst(level.exit.c * T + T / 2, level.exit.r * T + T / 2, '#ffe28a', 50);
    setTimeout(function () { if (state === 'won') show('win'); }, 700);
  }

  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function drawBody(x, y, col, alpha, face, ghost, t) {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = col; rr(x, y, PW, PH, 6); ctx.fill();
    if (ghost) { // wavy bottom hint
      ctx.fillStyle = '#0b0d1a55';
      for (var i = 0; i < 3; i++) ctx.fillRect(x + 2 + i * 6, y + PH - 3 + Math.sin(t / 6 + i) * 1.5, 4, 3);
    }
    ctx.fillStyle = '#0b0d1a';
    var ex = face > 0 ? 4 : 0;
    ctx.fillRect(x + 3 + ex, y + 7, 4, 6); ctx.fillRect(x + 11 + ex, y + 7, 4, 6);
    ctx.restore();
  }

  function draw() {
    var L = level, i, j;
    ctx.save();
    if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.85; if (shake < 0.3) shake = 0; }
    // background
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#111636'); g.addColorStop(1, '#0a0d22');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffffff08'; ctx.lineWidth = 1;
    for (i = 0; i <= L.cols; i++) { ctx.beginPath(); ctx.moveTo(i * T + .5, 0); ctx.lineTo(i * T + .5, H); ctx.stroke(); }
    for (j = 0; j <= L.rows; j++) { ctx.beginPath(); ctx.moveTo(0, j * T + .5); ctx.lineTo(W, j * T + .5); ctx.stroke(); }

    // walls
    for (j = 0; j < L.rows; j++) for (i = 0; i < L.cols; i++) {
      var ch = L.tiles[j][i];
      if (ch === '#') {
        ctx.fillStyle = '#232a5c'; ctx.fillRect(i * T, j * T, T, T);
        ctx.fillStyle = '#323b7c'; ctx.fillRect(i * T, j * T, T, 3);
        ctx.fillStyle = '#1a1f47'; ctx.fillRect(i * T, j * T + T - 3, T, 3);
      } else if (ch >= 'A' && ch <= 'Z') {
        var open = sim.open[ch], col = DOOR_COL[ch] || '#fff';
        ctx.globalAlpha = open ? 0.12 : 0.85; ctx.fillStyle = col; ctx.fillRect(i * T + 8, j * T, T - 16, T);
        ctx.globalAlpha = 1;
        if (!open) { ctx.fillStyle = '#0003'; for (var k = 0; k < 4; k++) ctx.fillRect(i * T + 8, j * T + k * 8 + 3, T - 16, 2); }
        else { ctx.strokeStyle = col; ctx.setLineDash([3, 4]); ctx.strokeRect(i * T + 8.5, j * T + .5, T - 17, T - 1); ctx.setLineDash([]); }
      }
    }
    // plates
    L.plates.forEach(function (p, idx) {
      var col = DOOR_COL[p.id] || '#fff', down = sim.pressed[idx];
      ctx.fillStyle = col; ctx.globalAlpha = down ? 1 : 0.8;
      var h = down ? 3 : 7;
      rr(p.c * T + 2, p.r * T + T - h, T - 4, h, 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (down) { ctx.globalAlpha = 0.25; ctx.fillRect(p.c * T, p.r * T + T - 14, T, 14); ctx.globalAlpha = 1; }
    });
    // exit
    var ex = L.exit.c * T, ey = L.exit.r * T, pulse = 0.6 + Math.sin(sim.t / 12) * 0.25;
    var rg = ctx.createRadialGradient(ex + T / 2, ey + T / 2, 2, ex + T / 2, ey + T / 2, T * 0.9);
    rg.addColorStop(0, 'rgba(255,226,138,' + pulse + ')'); rg.addColorStop(1, 'rgba(255,226,138,0)');
    ctx.fillStyle = rg; ctx.fillRect(ex - T / 2, ey - T / 2, T * 2, T * 2);
    ctx.strokeStyle = '#ffe28a'; ctx.lineWidth = 2; rr(ex + 6, ey + 2, T - 12, T - 2, 8); ctx.stroke(); ctx.lineWidth = 1;

    // echoes
    ghosts.forEach(function (gh, n) {
      var pos = sim.ghostPos(gh, sim.t), done = sim.t >= gh.rec.length - 1;
      var prev = sim.ghostPos(gh, Math.max(0, sim.t - 1));
      var face = pos.x >= prev.x ? 1 : -1;
      drawBody(pos.x, pos.y, GHOST_COL[n % 5], done ? 0.45 : 0.7, face, true, sim.t);
      ctx.fillStyle = '#fff9'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(n + 1), pos.x + PW / 2, pos.y - 3);
    });
    // player
    var p = sim.p;
    drawBody(p.x, p.y, '#ffffff', 1, p.face, false, sim.t);
    ctx.strokeStyle = '#fff6'; ctx.strokeRect(p.x - 1.5, p.y - 1.5, PW + 3, PH + 3);

    // particles
    particles = particles.filter(function (q) { return q.life > 0; });
    particles.forEach(function (q) {
      q.x += q.vx; q.y += q.vy; q.vy += 0.04; q.life--;
      ctx.globalAlpha = Math.max(0, q.life / 50); ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, 3, 3);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /* ---------- main loop ---------- */
  var last = performance.now(), acc = 0, STEP = 1000 / 60;
  function frame(now) {
    acc += Math.min(100, now - last); last = now;
    while (acc >= STEP) {
      acc -= STEP;
      if (state === 'play') {
        sim.step({ l: keys.l || touch.l, r: keys.r || touch.r, j: keys.j || touch.j });
        sim.events.forEach(function (ev) {
          if (SFX[ev]) SFX[ev]();
          if (ev === 'land') burst(sim.p.x + PW / 2, sim.p.y + PH, '#9aa6ff', 4);
          if (ev === 'door') shake = 3;
        });
        if (sim.won) onWin();
        else if (sim.t >= C.LOOP_FRAMES) commit(true);
      } else if (state === 'won') { sim.t++; }
    }
    if (level) {
      draw();
      $('timefill').style.transform = 'scaleX(' + Math.max(0, 1 - sim.t / C.LOOP_FRAMES) + ')';
    }
    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  level = LEVELS[0]; ghosts = []; sim = new C.Sim(level, ghosts);
  showMenu();
  requestAnimationFrame(frame);
  window.__ghost = { startLevel: startLevel, get sim() { return sim; }, commit: commit }; // handy for testing
})();
