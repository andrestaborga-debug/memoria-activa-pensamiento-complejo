/* Nebula Defense — engine, rendering, input, UI bindings.
 * Depends on data.js (window.NDData).
 */
(() => {
  const D = window.NDData;
  const SAVE_KEY = "nebula-defense-v1";

  // ── Canvas & view ───────────────────────────────────────────
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  let dpr = 1, viewW = 0, viewH = 0;
  let scale = 1, ox = 0, oy = 0;

  function fit() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    scale = Math.min(viewW / D.WORLD_W, viewH / D.WORLD_H);
    ox = (viewW - D.WORLD_W * scale) / 2;
    oy = (viewH - D.WORLD_H * scale) / 2;
  }

  function s2w(sx, sy) { return [(sx - ox) / scale, (sy - oy) / scale]; }

  // ── Path geometry helpers ───────────────────────────────────
  function buildPath(points) {
    const segLens = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i+1][0] - points[i][0];
      const dy = points[i+1][1] - points[i][1];
      const l = Math.hypot(dx, dy);
      segLens.push(l);
      total += l;
    }
    return { points, segLens, totalLen: total };
  }

  function pointAt(path, dist) {
    if (dist <= 0) {
      const p0 = path.points[0];
      return { x: p0[0], y: p0[1] };
    }
    let acc = 0;
    for (let i = 0; i < path.segLens.length; i++) {
      if (acc + path.segLens[i] >= dist) {
        const t = (dist - acc) / path.segLens[i];
        const a = path.points[i], b = path.points[i+1];
        return { x: a[0] + (b[0]-a[0])*t, y: a[1] + (b[1]-a[1])*t };
      }
      acc += path.segLens[i];
    }
    const last = path.points[path.points.length - 1];
    return { x: last[0], y: last[1] };
  }

  function distToPath(path, px, py) {
    let best = Infinity;
    for (let i = 0; i < path.points.length - 1; i++) {
      const a = path.points[i], b = path.points[i+1];
      const dx = b[0]-a[0], dy = b[1]-a[1];
      const len2 = dx*dx + dy*dy;
      if (len2 === 0) continue;
      let t = ((px - a[0]) * dx + (py - a[1]) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a[0] + dx*t, cy = a[1] + dy*t;
      const d = Math.hypot(px - cx, py - cy);
      if (d < best) best = d;
    }
    return best;
  }

  // ── Game state ──────────────────────────────────────────────
  let game = null;
  let currentMapId = null;
  let speedMult = 1;
  let paused = false;
  let selectedTower = null;
  let placingType = null;
  let placingPos = null;
  let endShown = false;

  function newGame(mapId) {
    const map = D.MAPS.find(m => m.id === mapId);
    const paths = map.paths.map(buildPath);
    return {
      map, paths,
      waves: D.generateWaves(map.difficulty),
      waveIndex: 0,
      waveActive: false,
      pendingSpawns: [],
      money: D.startMoney(map.difficulty),
      lives: D.START_LIVES,
      towers: [], enemies: [], projectiles: [], particles: [],
      time: 0,
      ended: false, victory: false,
      kills: 0,
    };
  }

  // ── Wave logic ──────────────────────────────────────────────
  function startWave(g) {
    if (g.waveActive || g.ended) return;
    if (g.waveIndex >= D.TOTAL_WAVES) return;
    g.waveIndex++;
    const wave = g.waves[g.waveIndex - 1];
    g.waveActive = true;
    for (const grp of wave.groups) {
      for (let i = 0; i < grp.count; i++) {
        const pathIndex = i % g.paths.length;
        g.pendingSpawns.push({
          spawnAt: g.time + grp.delay + i * grp.gap,
          type: grp.type, hpMul: grp.hpMul, pathIndex,
        });
      }
    }
    g.pendingSpawns.sort((a, b) => a.spawnAt - b.spawnAt);
  }

  function spawnEnemy(g, type, hpMul, pathIndex, distOffset = 0) {
    const def = D.ENEMIES[type];
    const pIdx = pathIndex % g.paths.length;
    g.enemies.push({
      type, def,
      pathIndex: pIdx,
      dist: distOffset,
      hp: def.hp * hpMul,
      maxHp: def.hp * hpMul,
      speed: def.speed,
      reward: def.reward,
      armor: def.armor || 0,
      regen: def.regen || 0,
      onDeath: def.onDeath,
      size: def.size,
      color: def.color,
      statuses: { slow: 0, slowDur: 0 },
      alive: true,
      reachedEnd: false,
    });
  }

  function processSpawns(g) {
    while (g.pendingSpawns.length && g.pendingSpawns[0].spawnAt <= g.time) {
      const s = g.pendingSpawns.shift();
      spawnEnemy(g, s.type, s.hpMul, s.pathIndex);
    }
  }

  // ── Enemies ─────────────────────────────────────────────────
  function posOf(g, e) { return pointAt(g.paths[e.pathIndex], e.dist); }

  function updateEnemies(g, dt) {
    for (const e of g.enemies) {
      if (!e.alive) continue;
      let speedMul = 1;
      if (e.statuses.slowDur > 0) {
        speedMul = 1 - e.statuses.slow;
        e.statuses.slowDur -= dt;
        if (e.statuses.slowDur <= 0) e.statuses.slow = 0;
      }
      e.dist += e.speed * speedMul * dt;
      const path = g.paths[e.pathIndex];
      if (e.dist >= path.totalLen) {
        e.alive = false;
        e.reachedEnd = true;
        g.lives -= 1;
        continue;
      }
      if (e.regen) e.hp = Math.min(e.maxHp, e.hp + e.regen * dt);
    }
  }

  // ── Towers ──────────────────────────────────────────────────
  function buildTower(g, type, x, y) {
    const def = D.TOWERS[type];
    if (!def || g.money < def.cost) return null;
    g.money -= def.cost;
    const t = {
      type, def, x, y,
      level: 0,
      totalSpent: def.cost,
      stats: composeStats(def.base),
      cooldown: 0,
      angle: -Math.PI / 2,
      targetMode: "first",
      target: null,
    };
    g.towers.push(t);
    return t;
  }

  function composeStats(base) {
    return {
      range: base.range,
      fireRate: base.fireRate,
      damage: base.damage,
      projSpeed: base.projSpeed || 0,
      projType: base.projType,
      splash: base.splash || 0,
      splashDmg: base.splashDmg || 0,
      status: base.status ? { ...base.status } : null,
      pierce: base.pierce || 0,
      chains: base.chains || 0,
      chainRange: base.chainRange || 0,
      chainFalloff: base.chainFalloff || 0,
      armorPierce: base.armorPierce || false,
    };
  }

  function upgradeTower(g, t) {
    const next = t.def.upgrades[t.level];
    if (!next || g.money < next.cost) return false;
    g.money -= next.cost;
    t.totalSpent += next.cost;
    t.level++;
    Object.assign(t.stats, next.set);
    if (next.set.status) t.stats.status = { ...next.set.status };
    return true;
  }

  function sellTower(g, t) {
    const refund = Math.floor(t.totalSpent * 0.7);
    g.money += refund;
    const i = g.towers.indexOf(t);
    if (i >= 0) g.towers.splice(i, 1);
    return refund;
  }

  function findTarget(g, t) {
    let best = null;
    let bestKey = -Infinity;
    const r2 = t.stats.range * t.stats.range;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const ep = posOf(g, e);
      const dx = ep.x - t.x, dy = ep.y - t.y;
      if (dx*dx + dy*dy > r2) continue;
      let key;
      switch (t.targetMode) {
        case "first":  key = e.dist; break;
        case "last":   key = -e.dist; break;
        case "strong": key = e.hp; break;
        case "close":  key = -(dx*dx + dy*dy); break;
        default:       key = e.dist;
      }
      if (key > bestKey) { bestKey = key; best = e; }
    }
    return best;
  }

  function updateTowers(g, dt) {
    for (const t of g.towers) {
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const tg = findTarget(g, t);
      if (!tg) { t.target = null; continue; }
      t.target = tg;
      const tp = posOf(g, tg);
      t.angle = Math.atan2(tp.y - t.y, tp.x - t.x);
      fireTower(g, t, tg, tp);
      t.cooldown = 1 / t.stats.fireRate;
    }
  }

  // ── Combat ──────────────────────────────────────────────────
  function applyDamage(g, e, dmg, armorPierce) {
    if (!e.alive) return;
    let actual = dmg;
    if (!armorPierce && e.armor) actual = dmg * (1 - e.armor);
    e.hp -= actual;
    if (e.hp <= 0) {
      e.alive = false;
      g.money += e.reward;
      g.kills++;
      addBurst(g, posOf(g, e), e.color, 10);
      if (e.onDeath) {
        for (let i = 0; i < e.onDeath.count; i++) {
          const off = (i - (e.onDeath.count - 1) / 2) * (e.onDeath.offset || 16);
          spawnEnemy(g, e.onDeath.type, 1, e.pathIndex, Math.max(0, e.dist - 30 + off));
        }
      }
    }
  }

  function applyStatus(e, status) {
    if (!status || !e.alive) return;
    if (status.slow && status.dur) {
      e.statuses.slow = Math.max(e.statuses.slow, status.slow);
      e.statuses.slowDur = Math.max(e.statuses.slowDur, status.dur);
    }
  }

  function explode(g, x, y, radius, dmg, armorPierce, color, status) {
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const ep = posOf(g, e);
      const d = Math.hypot(ep.x - x, ep.y - y);
      if (d <= radius) {
        const falloff = 1 - d / radius;
        applyDamage(g, e, dmg * (0.5 + 0.5 * falloff), armorPierce);
        if (status) applyStatus(e, status);
      }
    }
    addBurst(g, { x, y }, color, 20, 1);
  }

  function enemiesAlongLine(g, x1, y1, x2, y2, thickness) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len === 0) return [];
    const ux = dx / len, uy = dy / len;
    const hits = [];
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const ep = posOf(g, e);
      const rx = ep.x - x1, ry = ep.y - y1;
      const tt = rx * ux + ry * uy;
      if (tt < 0 || tt > len) continue;
      const cx = x1 + ux * tt, cy = y1 + uy * tt;
      const d = Math.hypot(ep.x - cx, ep.y - cy);
      if (d <= thickness + e.size * 0.6) hits.push({ e, t: tt });
    }
    hits.sort((a, b) => a.t - b.t);
    return hits.map(h => h.e);
  }

  function fireTower(g, t, target, tp) {
    const s = t.stats;
    if (s.projType === "bullet") {
      const targetSpeed = target.speed * (target.statuses.slowDur > 0 ? (1 - target.statuses.slow) : 1);
      const dist = Math.hypot(tp.x - t.x, tp.y - t.y);
      const flight = dist / s.projSpeed;
      const path = g.paths[target.pathIndex];
      const future = pointAt(path, Math.min(path.totalLen - 1, target.dist + targetSpeed * flight));
      const fdx = future.x - t.x, fdy = future.y - t.y;
      const fl = Math.max(1, Math.hypot(fdx, fdy));
      g.projectiles.push({
        x: t.x, y: t.y,
        vx: (fdx / fl) * s.projSpeed, vy: (fdy / fl) * s.projSpeed,
        life: 2,
        type: "bullet", color: t.def.color,
        damage: s.damage, splash: s.splash, splashDmg: s.splashDmg,
        status: s.status, armorPierce: s.armorPierce,
      });
    } else if (s.projType === "lob") {
      const T = 0.9;
      const targetSpeed = target.speed * (target.statuses.slowDur > 0 ? (1 - target.statuses.slow) : 1);
      const path = g.paths[target.pathIndex];
      const future = pointAt(path, Math.min(path.totalLen - 1, target.dist + targetSpeed * T));
      g.projectiles.push({
        x: t.x, y: t.y, sx: t.x, sy: t.y, ex: future.x, ey: future.y,
        elapsed: 0, T, type: "lob", color: t.def.color,
        damage: s.damage, splash: s.splash, splashDmg: s.splashDmg,
        status: s.status, armorPierce: s.armorPierce,
      });
    } else if (s.projType === "beam") {
      const enemies = enemiesAlongLine(g, t.x, t.y, tp.x, tp.y, 12);
      let hits = 0;
      for (const e of enemies) {
        if (hits > s.pierce) break;
        applyDamage(g, e, s.damage, s.armorPierce);
        if (s.status) applyStatus(e, s.status);
        hits++;
      }
      g.particles.push({ type: "beam", x1: t.x, y1: t.y, x2: tp.x, y2: tp.y, life: 0.12, maxLife: 0.12, color: t.def.color });
    } else if (s.projType === "rail") {
      const farX = t.x + Math.cos(t.angle) * s.range;
      const farY = t.y + Math.sin(t.angle) * s.range;
      const enemies = enemiesAlongLine(g, t.x, t.y, farX, farY, 16);
      let hits = 0;
      for (const e of enemies) {
        if (hits > s.pierce) break;
        applyDamage(g, e, s.damage, s.armorPierce);
        if (s.status) applyStatus(e, s.status);
        hits++;
      }
      g.particles.push({ type: "rail", x1: t.x, y1: t.y, x2: farX, y2: farY, life: 0.22, maxLife: 0.22, color: t.def.color });
    } else if (s.projType === "chain") {
      const visited = new Set();
      let current = target;
      let dmg = s.damage;
      let prev = { x: t.x, y: t.y };
      let i = 0;
      while (current && i <= s.chains) {
        applyDamage(g, current, dmg, s.armorPierce);
        if (s.status) applyStatus(current, s.status);
        const cp = posOf(g, current);
        g.particles.push({ type: "arc", x1: prev.x, y1: prev.y, x2: cp.x, y2: cp.y, life: 0.18, maxLife: 0.18, color: t.def.color });
        visited.add(current);
        prev = cp;
        let next = null, nd = Infinity;
        for (const e of g.enemies) {
          if (!e.alive || visited.has(e)) continue;
          const ep = posOf(g, e);
          const d = Math.hypot(ep.x - cp.x, ep.y - cp.y);
          if (d < s.chainRange && d < nd) { nd = d; next = e; }
        }
        current = next;
        dmg *= s.chainFalloff;
        i++;
      }
    }
  }

  function updateProjectiles(g, dt) {
    for (let i = g.projectiles.length - 1; i >= 0; i--) {
      const p = g.projectiles[i];
      let remove = false;
      if (p.type === "bullet") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.life -= dt;
        for (const e of g.enemies) {
          if (!e.alive) continue;
          const ep = posOf(g, e);
          if (Math.hypot(ep.x - p.x, ep.y - p.y) <= e.size + 4) {
            applyDamage(g, e, p.damage, p.armorPierce);
            if (p.status) applyStatus(e, p.status);
            if (p.splash) explode(g, p.x, p.y, p.splash, p.splashDmg, p.armorPierce, p.color, p.status);
            remove = true; break;
          }
        }
        if (p.x < -50 || p.x > D.WORLD_W + 50 || p.y < -50 || p.y > D.WORLD_H + 50) remove = true;
        if (p.life <= 0) remove = true;
      } else if (p.type === "lob") {
        p.elapsed += dt;
        const t = Math.min(1, p.elapsed / p.T);
        p.x = p.sx + (p.ex - p.sx) * t;
        p.y = p.sy + (p.ey - p.sy) * t - Math.sin(t * Math.PI) * 90;
        if (t >= 1) {
          explode(g, p.ex, p.ey, p.splash, p.splashDmg, p.armorPierce, p.color, p.status);
          let closest = null, cd = Infinity;
          for (const e of g.enemies) {
            if (!e.alive) continue;
            const ep = posOf(g, e);
            const d = Math.hypot(ep.x - p.ex, ep.y - p.ey);
            if (d < cd) { cd = d; closest = e; }
          }
          if (closest && cd < 30) applyDamage(g, closest, p.damage, p.armorPierce);
          remove = true;
        }
      }
      if (remove) g.projectiles.splice(i, 1);
    }
  }

  function addBurst(g, pos, color, n, scaleP = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (50 + Math.random() * 150) * scaleP;
      g.particles.push({
        type: "spark", x: pos.x, y: pos.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.5, maxLife: 0.5, color,
      });
    }
  }

  function updateParticles(g, dt) {
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const p = g.particles[i];
      p.life -= dt;
      if (p.life <= 0) { g.particles.splice(i, 1); continue; }
      if (p.type === "spark") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vx *= 0.93; p.vy *= 0.93;
      }
    }
  }

  // ── Main update tick (sub-stepped at higher speeds) ─────────
  function tick(dt) {
    if (paused || !game || game.ended) return;
    const totalDt = dt * speedMult;
    const steps = speedMult > 1 ? speedMult : 1;
    const sub = totalDt / steps;
    for (let i = 0; i < steps; i++) updateOnce(sub);
  }

  function updateOnce(dt) {
    game.time += dt;
    processSpawns(game);
    updateEnemies(game, dt);
    updateTowers(game, dt);
    updateProjectiles(game, dt);
    updateParticles(game, dt);
    game.enemies = game.enemies.filter(e => e.alive);
    if (game.lives <= 0) { game.ended = true; game.victory = false; return; }
    if (game.waveActive && game.pendingSpawns.length === 0 && game.enemies.length === 0) {
      game.waveActive = false;
      game.money += 25 + game.waveIndex * 8;
      if (game.waveIndex >= D.TOTAL_WAVES) { game.ended = true; game.victory = true; }
    }
  }

  // ── Rendering ───────────────────────────────────────────────
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!game) return;
    ctx.scale(dpr, dpr);
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    drawMap(game);
    drawDecor(game);
    drawPath(game);
    drawTowers(game);
    drawEnemies(game);
    drawProjectiles(game);
    drawParticles(game);
    drawSelection(game);
  }

  function drawMap(g) {
    const grad = ctx.createLinearGradient(0, 0, 0, D.WORLD_H);
    grad.addColorStop(0, g.map.bg[0]);
    grad.addColorStop(1, g.map.bg[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, D.WORLD_W, D.WORLD_H);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= D.WORLD_W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, D.WORLD_H); ctx.stroke();
    }
    for (let y = 0; y <= D.WORLD_H; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(D.WORLD_W, y); ctx.stroke();
    }
  }

  function drawDecor(g) {
    for (const d of g.map.decor || []) {
      ctx.fillStyle = d.c + "33";
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = d.c + "88";
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawPath(g) {
    for (const path of g.paths) {
      const w = g.map.pathWidth;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = w + 8;
      strokePolyline(path.points);
      ctx.strokeStyle = "#293566";
      ctx.lineWidth = w;
      strokePolyline(path.points);
      ctx.strokeStyle = "rgba(92,242,255,0.4)";
      ctx.lineWidth = 2; ctx.setLineDash([14, 16]);
      strokePolyline(path.points);
      ctx.setLineDash([]);
      ctx.fillStyle = "#5cf2ff";
      ctx.beginPath(); ctx.arc(path.points[0][0], path.points[0][1], 12, 0, Math.PI * 2); ctx.fill();
      const last = path.points[path.points.length - 1];
      ctx.fillStyle = "#ff7a7a";
      ctx.beginPath(); ctx.arc(last[0], last[1], 16, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 18px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("CORE", last[0], last[1]);
    }
  }

  function strokePolyline(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  function drawTowers(g) {
    for (const t of g.towers) {
      ctx.fillStyle = "#1a2553";
      ctx.strokeStyle = "#3a4a8a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = t.def.color + "44";
      ctx.beginPath(); ctx.arc(t.x, t.y, 18, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(t.x, t.y); ctx.rotate(t.angle);
      ctx.fillStyle = t.def.color;
      ctx.fillRect(-6, -5, 26, 10);
      ctx.fillStyle = "#0c1230";
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      for (let i = 0; i < t.level; i++) {
        ctx.fillStyle = t.def.color;
        ctx.beginPath(); ctx.arc(t.x - 8 + i * 8, t.y + 22, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawEnemies(g) {
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const p = posOf(g, e);
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, e.size, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath(); ctx.arc(p.x - e.size * 0.3, p.y - e.size * 0.3, e.size * 0.45, 0, Math.PI * 2); ctx.fill();
      if (e.armor > 0) {
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, e.size + 3, 0, Math.PI * 2); ctx.stroke();
      }
      if (e.statuses.slowDur > 0) {
        ctx.fillStyle = "rgba(154,216,255,0.35)";
        ctx.beginPath(); ctx.arc(p.x, p.y, e.size + 5, 0, Math.PI * 2); ctx.fill();
      }
      if (e.hp < e.maxHp) {
        const w = Math.max(22, e.size * 2);
        const x = p.x - w / 2, y = p.y - e.size - 9;
        ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(x, y, w, 4);
        const ratio = e.hp / e.maxHp;
        ctx.fillStyle = ratio > 0.5 ? "#6cf09c" : ratio > 0.25 ? "#ffd166" : "#ff7a7a";
        ctx.fillRect(x, y, w * ratio, 4);
      }
    }
  }

  function drawProjectiles(g) {
    for (const p of g.projectiles) {
      if (p.type === "bullet") {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.color + "55";
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === "lob") {
        ctx.fillStyle = p.color + "44";
        ctx.beginPath(); ctx.arc(p.ex, p.ey, p.splash, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = p.color + "88"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.ex, p.ey, p.splash, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawParticles(g) {
    for (const p of g.particles) {
      if (p.type === "spark") {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === "beam" || p.type === "arc" || p.type === "rail") {
        ctx.globalAlpha = Math.min(1, p.life / p.maxLife);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.type === "rail" ? 6 : 3;
        ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawSelection(g) {
    if (selectedTower) {
      ctx.strokeStyle = "rgba(92,242,255,0.7)"; ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(selectedTower.x, selectedTower.y, selectedTower.stats.range, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (placingType && placingPos) {
      const def = D.TOWERS[placingType];
      const valid = canPlace(g, placingPos.x, placingPos.y, placingType);
      ctx.fillStyle = valid ? "rgba(108,240,156,0.18)" : "rgba(255,122,122,0.18)";
      ctx.strokeStyle = valid ? "rgba(108,240,156,0.8)" : "rgba(255,122,122,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(placingPos.x, placingPos.y, def.base.range, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#1a2553"; ctx.strokeStyle = def.color;
      ctx.beginPath(); ctx.arc(placingPos.x, placingPos.y, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = def.color; ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(def.icon, placingPos.x, placingPos.y);
    }
  }

  // ── Placement check ────────────────────────────────────────
  function canPlace(g, x, y) {
    if (x < 30 || y < 30 || x > D.WORLD_W - 30 || y > D.WORLD_H - 30) return false;
    for (const path of g.paths) {
      if (distToPath(path, x, y) < g.map.pathWidth / 2 + 22) return false;
    }
    for (const t of g.towers) {
      if (Math.hypot(t.x - x, t.y - y) < 46) return false;
    }
    return true;
  }

  function onPath(g, x, y) {
    for (const path of g.paths) {
      if (distToPath(path, x, y) < g.map.pathWidth / 2 + 4) return true;
    }
    return false;
  }

  // ── Input ──────────────────────────────────────────────────
  function setupInput() {
    canvas.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      handleTap(sx, sy);
    });
  }

  function handleTap(sx, sy) {
    if (!game) return;
    const [wx, wy] = s2w(sx, sy);
    if (placingType) {
      if (canPlace(game, wx, wy)) {
        const def = D.TOWERS[placingType];
        if (game.money >= def.cost) {
          buildTower(game, placingType, wx, wy);
          updateHUD();
        } else {
          toast("Not enough credits");
        }
      } else {
        toast("Cannot build there");
      }
      placingType = null; placingPos = null;
      return;
    }
    // dismiss open sheets if not placing
    if (!$("tower-picker").classList.contains("hidden") || !$("tower-menu").classList.contains("hidden")) {
      hide("tower-picker"); hide("tower-menu");
      selectedTower = null;
      return;
    }
    // hit a tower?
    let hit = null;
    for (const t of game.towers) {
      if (Math.hypot(t.x - wx, t.y - wy) <= 26) { hit = t; break; }
    }
    if (hit) { selectedTower = hit; openTowerMenu(hit); return; }
    if (!onPath(game, wx, wy) && wx >= 0 && wx <= D.WORLD_W && wy >= 0 && wy <= D.WORLD_H) {
      selectedTower = null;
      openTowerPicker(wx, wy);
    }
  }

  // ── HUD / UI ───────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function show(id) { $(id).classList.remove("hidden"); }
  function hide(id) { $(id).classList.add("hidden"); }

  let toastTimer;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => el.classList.add("hidden"), 200);
    }, 1400);
  }

  function updateHUD() {
    if (!game) return;
    $("hud-lives").textContent = Math.max(0, game.lives);
    $("hud-money").textContent = "$ " + game.money;
    $("hud-wave").textContent = game.waveIndex + " / " + D.TOTAL_WAVES;
    $("hud-map").textContent = game.map.name;
    const btn = $("btn-wave");
    btn.disabled = game.waveActive || game.ended;
    btn.textContent = game.waveActive
      ? "WAVE " + game.waveIndex
      : (game.waveIndex >= D.TOTAL_WAVES ? "DONE" : "START WAVE " + (game.waveIndex + 1));
  }

  function openTowerPicker(wx, wy) {
    const list = $("tower-list");
    list.innerHTML = "";
    for (const id of Object.keys(D.TOWERS)) {
      const def = D.TOWERS[id];
      const card = document.createElement("button");
      card.className = "tower-card" + (game.money < def.cost ? " disabled" : "");
      card.innerHTML = `
        <div class="tc-row">
          <div class="tc-icon" style="color:${def.color};font-size:18px">${def.icon}</div>
          <div style="flex:1">
            <div class="tc-name">${def.name}</div>
            <div class="tc-cost">$ ${def.cost}</div>
          </div>
        </div>
        <div class="tc-desc">${def.desc}</div>`;
      card.addEventListener("click", () => {
        if (game.money < def.cost) { toast("Not enough credits"); return; }
        placingType = id;
        placingPos = { x: wx, y: wy };
        hide("tower-picker");
      });
      list.appendChild(card);
    }
    show("tower-picker");
  }

  function openTowerMenu(t) {
    $("tm-name").textContent = t.def.name + " · L" + t.level;
    const s = t.stats;
    $("tm-stats").innerHTML = `
      <div class="tm-stat"><b>DAMAGE</b>${Math.round(s.damage)}</div>
      <div class="tm-stat"><b>RATE</b>${s.fireRate.toFixed(2)}/s</div>
      <div class="tm-stat"><b>RANGE</b>${Math.round(s.range)}</div>
      <div class="tm-stat"><b>DPS</b>${Math.round(s.damage * s.fireRate)}</div>`;
    const ups = $("tm-upgrades"); ups.innerHTML = "";
    if (t.level >= t.def.upgrades.length) {
      const m = document.createElement("div");
      m.className = "tm-upgrade maxed";
      m.innerHTML = `<div><div class="tmu-name">Maxed</div><div class="tmu-desc">No further upgrades.</div></div><div class="tmu-cost">★</div>`;
      ups.appendChild(m);
    } else {
      const up = t.def.upgrades[t.level];
      const btn = document.createElement("button");
      btn.className = "tm-upgrade" + (game.money < up.cost ? " disabled" : "");
      btn.innerHTML = `<div><div class="tmu-name">${up.name}</div><div class="tmu-desc">${up.desc}</div></div><div class="tmu-cost">$ ${up.cost}</div>`;
      btn.addEventListener("click", () => {
        if (upgradeTower(game, t)) { updateHUD(); openTowerMenu(t); }
        else toast("Not enough credits");
      });
      ups.appendChild(btn);
    }
    $("tm-target").textContent = "Target: " + cap(t.targetMode);
    $("tm-target").onclick = () => {
      const order = ["first", "last", "strong", "close"];
      t.targetMode = order[(order.indexOf(t.targetMode) + 1) % order.length];
      $("tm-target").textContent = "Target: " + cap(t.targetMode);
    };
    $("tm-sell").textContent = "Sell ($ " + Math.floor(t.totalSpent * 0.7) + ")";
    $("tm-sell").onclick = () => {
      const refund = sellTower(game, t);
      selectedTower = null; hide("tower-menu");
      updateHUD(); toast("Refunded $ " + refund);
    };
    show("tower-menu");
  }

  function cap(s) { return s[0].toUpperCase() + s.slice(1); }

  // ── Persistence ────────────────────────────────────────────
  function saveProgress(extra = {}) {
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
      Object.assign(data, extra);
      if (extra.cleared) data.cleared = { ...(data.cleared || {}), ...extra.cleared };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {}
  }
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}"); } catch (e) { return {}; }
  }
  function unlockedMaps() {
    const cleared = (loadProgress().cleared) || {};
    const u = { crescent: true };
    if (cleared.crescent) u.twin = true;
    if (cleared.twin) u.spiral = true;
    return u;
  }

  // ── Menu / map select ──────────────────────────────────────
  function renderMapGrid() {
    const grid = $("map-grid"); grid.innerHTML = "";
    const unlocked = unlockedMaps();
    const cleared = loadProgress().cleared || {};
    for (const m of D.MAPS) {
      const card = document.createElement("button");
      const lock = !unlocked[m.id];
      card.className = "map-card" + (lock ? " locked" : "");
      const star = cleared[m.id] ? " ★" : "";
      const dots = "■".repeat(m.difficulty) + "□".repeat(3 - m.difficulty);
      card.innerHTML = `
        <div class="mc-name">${m.name}${star}</div>
        <div class="mc-meta">Difficulty: ${dots}${lock ? " · Locked" : ""}</div>
        <canvas width="220" height="100"></canvas>`;
      const c = card.querySelector("canvas");
      const cc = c.getContext("2d");
      const sxr = c.width / D.WORLD_W, syr = c.height / D.WORLD_H;
      const grad = cc.createLinearGradient(0, 0, 0, c.height);
      grad.addColorStop(0, m.bg[0]); grad.addColorStop(1, m.bg[1]);
      cc.fillStyle = grad; cc.fillRect(0, 0, c.width, c.height);
      cc.strokeStyle = "#5cf2ff"; cc.lineWidth = 2;
      cc.lineCap = "round"; cc.lineJoin = "round";
      for (const path of m.paths) {
        cc.beginPath();
        for (let i = 0; i < path.length; i++) {
          const px = path[i][0] * sxr, py = path[i][1] * syr;
          if (i === 0) cc.moveTo(px, py); else cc.lineTo(px, py);
        }
        cc.stroke();
      }
      card.addEventListener("click", () => {
        if (lock) { toast("Clear previous map first"); return; }
        startGame(m.id);
      });
      grid.appendChild(card);
    }
  }

  function startGame(mapId) {
    currentMapId = mapId;
    game = newGame(mapId);
    selectedTower = null; placingType = null; placingPos = null;
    paused = false; speedMult = 1; endShown = false;
    $("btn-speed").textContent = "▶ 1×";
    hide("menu"); hide("end"); hide("pause"); hide("tower-picker"); hide("tower-menu");
    show("hud"); show("actions");
    updateHUD();
    saveProgress({ lastMap: mapId });
  }

  function showMenu() {
    hide("hud"); hide("actions"); hide("tower-picker"); hide("tower-menu");
    hide("end"); hide("pause");
    show("menu");
    renderMapGrid();
    const p = loadProgress();
    $("btn-continue").style.display = p.lastMap ? "" : "none";
  }

  function handleEnd() {
    if (endShown) return;
    endShown = true;
    $("end-title").textContent = game.victory ? "Victory" : "Defeat";
    $("end-sub").textContent = game.victory
      ? `All ${D.TOTAL_WAVES} waves cleared. The core is safe.`
      : "The core was overrun.";
    if (game.victory) {
      const cleared = {}; cleared[currentMapId] = true;
      saveProgress({ cleared });
    }
    show("end");
  }

  // ── Bind UI ────────────────────────────────────────────────
  function bindUI() {
    $("btn-pause").addEventListener("click", () => { paused = true; show("pause"); });
    $("btn-resume").addEventListener("click", () => { paused = false; hide("pause"); });
    $("btn-to-menu").addEventListener("click", () => { paused = false; game = null; showMenu(); });
    $("btn-end-menu").addEventListener("click", () => { game = null; showMenu(); });
    $("btn-retry").addEventListener("click", () => { startGame(currentMapId); });
    $("btn-wave").addEventListener("click", () => { if (game) { startWave(game); updateHUD(); }});
    $("btn-speed").addEventListener("click", () => {
      speedMult = speedMult === 1 ? 2 : speedMult === 2 ? 3 : 1;
      $("btn-speed").textContent = "▶ " + speedMult + "×";
    });
    $("btn-continue").addEventListener("click", () => {
      const p = loadProgress();
      if (p.lastMap) startGame(p.lastMap);
    });
    $("btn-reset").addEventListener("click", () => {
      if (confirm("Reset all progress?")) {
        localStorage.removeItem(SAVE_KEY);
        renderMapGrid();
        $("btn-continue").style.display = "none";
        toast("Progress reset");
      }
    });
    document.querySelectorAll("[data-close]").forEach(b => {
      b.addEventListener("click", () => hide(b.getAttribute("data-close")));
    });
  }

  // ── Boot & loop ────────────────────────────────────────────
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    tick(dt);
    render();
    if (game) {
      updateHUD();
      if (game.ended) handleEnd();
    }
    requestAnimationFrame(loop);
  }

  function boot() {
    fit();
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", () => setTimeout(fit, 100));
    setupInput();
    bindUI();
    showMenu();
    requestAnimationFrame(loop);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
