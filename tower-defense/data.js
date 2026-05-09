/* Nebula Defense — static game data
 * All coordinates use a virtual world of WORLD_W × WORLD_H pixels.
 * The renderer letterboxes this world inside the canvas.
 */
(function (global) {
  const WORLD_W = 1600;
  const WORLD_H = 900;

  /* ── Maps ─────────────────────────────────────────────────────
   * Each path is a polyline; enemies travel from path[0] → path[end].
   * pathWidth defines the no-build corridor (in world units).
   */
  const MAPS = [
    {
      id: "crescent",
      name: "Crescent Ridge",
      difficulty: 1,
      bg: ["#0d1638", "#1a1042"],
      pathWidth: 56,
      paths: [[
        [-30, 220],
        [320, 220],
        [320, 540],
        [780, 540],
        [780, 220],
        [1180, 220],
        [1180, 700],
        [1630, 700],
      ]],
      decor: [
        { type: "crystal", x: 520, y: 360, r: 36, c: "#5cf2ff" },
        { type: "crystal", x: 980, y: 420, r: 28, c: "#b377ff" },
        { type: "crystal", x: 200, y: 720, r: 44, c: "#6cf09c" },
      ],
    },
    {
      id: "twin",
      name: "Twin Conduits",
      difficulty: 2,
      bg: ["#101a3e", "#3a1644"],
      pathWidth: 50,
      paths: [
        [
          [-30, 200],
          [400, 200],
          [400, 460],
          [1100, 460],
          [1100, 760],
          [1630, 760],
        ],
        [
          [-30, 760],
          [220, 760],
          [220, 320],
          [900, 320],
          [900, 600],
          [1330, 600],
          [1330, 140],
          [1630, 140],
        ],
      ],
      decor: [
        { type: "crystal", x: 700, y: 140, r: 30, c: "#5cf2ff" },
        { type: "crystal", x: 600, y: 760, r: 32, c: "#b377ff" },
      ],
    },
    {
      id: "spiral",
      name: "Spiral Vault",
      difficulty: 3,
      bg: ["#1a0e3a", "#481350"],
      pathWidth: 48,
      paths: [[
        [-30, 80],
        [1500, 80],
        [1500, 820],
        [120, 820],
        [120, 220],
        [1320, 220],
        [1320, 680],
        [280, 680],
        [280, 380],
        [1130, 380],
        [1130, 540],
        [460, 540],
        [460, 460],
        [1700, 460],
      ]],
      decor: [
        { type: "crystal", x: 800, y: 460, r: 50, c: "#ffd166" },
      ],
    },
  ];

  /* ── Towers ───────────────────────────────────────────────────
   * Stats are at level 0 (just built). Upgrades replace fields.
   */
  const TOWERS = {
    pulse: {
      id: "pulse",
      name: "Pulse Cannon",
      icon: "◎",
      color: "#5cf2ff",
      desc: "Reliable single-target. Cheap and quick.",
      cost: 100,
      base: { range: 150, fireRate: 1.4, damage: 9, projSpeed: 700, projType: "bullet" },
      upgrades: [
        { name: "Tuned Coils", desc: "+rate, +damage", cost: 120, set: { fireRate: 2.0, damage: 12 } },
        { name: "High-Vel Rounds", desc: "+range, +damage", cost: 220, set: { range: 200, damage: 18, projSpeed: 900 } },
        { name: "Overdrive", desc: "Massive damage burst", cost: 480, set: { fireRate: 2.6, damage: 32, range: 220 } },
      ],
    },
    mortar: {
      id: "mortar",
      name: "Plasma Mortar",
      icon: "◉",
      color: "#ff9f5c",
      desc: "Lobs splash damage. Strong vs groups.",
      cost: 240,
      base: { range: 200, fireRate: 0.6, damage: 22, splash: 60, splashDmg: 16, projSpeed: 420, projType: "lob" },
      upgrades: [
        { name: "Wider Blast", desc: "+splash radius", cost: 200, set: { splash: 90, splashDmg: 22 } },
        { name: "Heavy Shells", desc: "+damage", cost: 360, set: { damage: 44, splashDmg: 32 } },
        { name: "Saturation Fire", desc: "+rate, +splash", cost: 700, set: { fireRate: 1.0, splash: 120, splashDmg: 50, damage: 60 } },
      ],
    },
    cryo: {
      id: "cryo",
      name: "Cryo Emitter",
      icon: "❄",
      color: "#9ad8ff",
      desc: "Slows enemies in range. Light damage.",
      cost: 180,
      base: { range: 130, fireRate: 1.6, damage: 4, projSpeed: 800, projType: "bullet",
              status: { slow: 0.4, dur: 1.6 } },
      upgrades: [
        { name: "Deep Freeze", desc: "Stronger slow", cost: 180, set: { status: { slow: 0.55, dur: 2.2 }, damage: 6 } },
        { name: "Frost Field", desc: "Splash chill", cost: 320, set: { splash: 70, splashDmg: 4, status: { slow: 0.6, dur: 2.4 }, damage: 8 } },
        { name: "Absolute Zero", desc: "Brief freeze", cost: 600, set: { splash: 100, splashDmg: 8, status: { slow: 0.85, dur: 2.6 }, damage: 14, fireRate: 2.0 } },
      ],
    },
    laser: {
      id: "laser",
      name: "Laser Array",
      icon: "≡",
      color: "#ff6b9a",
      desc: "Fast piercing beams. Great DPS.",
      cost: 280,
      base: { range: 150, fireRate: 4.0, damage: 5, projSpeed: 1200, projType: "beam", pierce: 1 },
      upgrades: [
        { name: "Focus Lens", desc: "+damage, +range", cost: 240, set: { damage: 8, range: 190 } },
        { name: "Twin Emitter", desc: "+pierce", cost: 380, set: { pierce: 3, damage: 11 } },
        { name: "Phase Beam", desc: "Ignores armor", cost: 720, set: { pierce: 5, damage: 18, fireRate: 5.5, armorPierce: true } },
      ],
    },
    tesla: {
      id: "tesla",
      name: "Tesla Coil",
      icon: "⚡",
      color: "#ffe066",
      desc: "Chain lightning between enemies.",
      cost: 360,
      base: { range: 150, fireRate: 1.0, damage: 16, projType: "chain", chains: 3, chainRange: 130, chainFalloff: 0.7 },
      upgrades: [
        { name: "Conductive Mesh", desc: "+chains, +range", cost: 280, set: { chains: 5, chainRange: 160 } },
        { name: "Overcharge", desc: "+damage, +rate", cost: 460, set: { damage: 28, fireRate: 1.4 } },
        { name: "Storm Core", desc: "Massive chain", cost: 880, set: { chains: 8, damage: 50, chainFalloff: 0.85, range: 200 } },
      ],
    },
    railgun: {
      id: "railgun",
      name: "Railgun",
      icon: "↣",
      color: "#c8a2ff",
      desc: "Long-range hyper-velocity slug. Pierces armor.",
      cost: 480,
      base: { range: 280, fireRate: 0.45, damage: 75, projSpeed: 1800, projType: "rail", pierce: 4, armorPierce: true },
      upgrades: [
        { name: "Long Barrel", desc: "+range, +damage", cost: 360, set: { range: 360, damage: 110 } },
        { name: "Mag Accelerator", desc: "+rate", cost: 540, set: { fireRate: 0.8, damage: 140 } },
        { name: "Singularity Slug", desc: "Devastating slug", cost: 1100, set: { damage: 320, fireRate: 0.9, pierce: 8, range: 420 } },
      ],
    },
  };

  /* ── Enemies ──────────────────────────────────────────────────
   * armor: 0..1 damage reduction (unless armorPierce)
   * regen: hp/sec
   * onDeath: spawn { type, count, offset }
   */
  const ENEMIES = {
    drone:   { id: "drone",   name: "Drone",      hp: 22,   speed: 80,  reward: 4,  size: 14, color: "#7fb3ff", armor: 0 },
    striker: { id: "striker", name: "Striker",    hp: 55,   speed: 100, reward: 8,  size: 16, color: "#ff8e72", armor: 0 },
    wraith:  { id: "wraith",  name: "Wraith",     hp: 90,   speed: 80,  reward: 12, size: 16, color: "#b377ff", armor: 0, regen: 6 },
    carrier: { id: "carrier", name: "Carrier",    hp: 200,  speed: 55,  reward: 18, size: 22, color: "#6cf09c", armor: 0.15,
               onDeath: { type: "drone", count: 3, offset: 18 } },
    juggernaut:{ id:"juggernaut", name:"Juggernaut", hp: 900, speed: 40, reward: 70, size: 28, color: "#ffd166", armor: 0.45 },
    swarmer: { id: "swarmer", name: "Swarmer",    hp: 14,   speed: 130, reward: 3,  size: 11, color: "#5cf2ff", armor: 0 },
    behemoth:{ id: "behemoth",name: "Behemoth",   hp: 5000, speed: 28,  reward: 350, size: 40, color: "#ff5e7a", armor: 0.55 },
  };

  /* ── Wave generation ─────────────────────────────────────────
   * 20 waves. Boss at 10 (juggernaut) and 20 (behemoth). Mini bosses sprinkled.
   * Difficulty scales with map.difficulty.
   */
  const TOTAL_WAVES = 20;

  function generateWaves(mapDiff) {
    const waves = [];
    for (let w = 1; w <= TOTAL_WAVES; w++) {
      const groups = [];
      const power = 1 + (w - 1) * 0.18 + (mapDiff - 1) * 0.25;
      const isBoss = w === 10 || w === 20;
      const isMini = w === 5 || w === 15;

      if (isBoss) {
        groups.push({ type: w === 20 ? "behemoth" : "juggernaut", count: 1, gap: 0.5, delay: 1.0,
                      hpMul: w === 20 ? 1.0 : 1.0 });
        groups.push({ type: "striker", count: Math.floor(8 + w * 0.6), gap: 0.5, delay: 2.0, hpMul: 1.0 });
        groups.push({ type: "drone",   count: Math.floor(20 + w * 0.5), gap: 0.25, delay: 4.0, hpMul: 1.0 });
        if (w === 20) {
          groups.push({ type: "wraith", count: 12, gap: 0.6, delay: 6.0, hpMul: 1.0 });
          groups.push({ type: "carrier", count: 4, gap: 1.2, delay: 10.0, hpMul: 1.0 });
        }
      } else if (isMini) {
        groups.push({ type: "juggernaut", count: 1, gap: 0.5, delay: 1.0, hpMul: 0.55 });
        groups.push({ type: "striker", count: 6 + w, gap: 0.4, delay: 1.5, hpMul: 1.0 });
        groups.push({ type: "drone", count: 12 + w, gap: 0.3, delay: 3.0, hpMul: 1.0 });
      } else {
        // Mix common enemies. Earlier waves mostly drones, later add variety.
        const droneCount  = Math.max(0, Math.floor(8 + w * 1.4));
        const strikerCount = w >= 3 ? Math.floor(2 + w * 0.7) : 0;
        const wraithCount  = w >= 6 ? Math.floor(1 + w * 0.35) : 0;
        const carrierCount = w >= 8 ? Math.floor(w * 0.18) : 0;
        const swarmCount   = w >= 4 && w % 2 === 0 ? Math.floor(8 + w * 0.6) : 0;

        if (droneCount)  groups.push({ type: "drone",  count: droneCount,  gap: 0.55, delay: 0,   hpMul: 1.0 });
        if (strikerCount)groups.push({ type: "striker",count: strikerCount,gap: 0.7,  delay: 1.5, hpMul: 1.0 });
        if (wraithCount) groups.push({ type: "wraith", count: wraithCount, gap: 0.9,  delay: 3.0, hpMul: 1.0 });
        if (carrierCount)groups.push({ type: "carrier",count: carrierCount,gap: 1.4,  delay: 4.5, hpMul: 1.0 });
        if (swarmCount)  groups.push({ type: "swarmer",count: swarmCount,  gap: 0.18, delay: 6.0, hpMul: 1.0 });
      }

      // Apply scaling
      for (const g of groups) {
        g.hpMul *= power;
      }
      waves.push({ index: w, groups });
    }
    return waves;
  }

  // Starting credits & lives per map
  const START_LIVES = 20;
  function startMoney(mapDiff) {
    return [650, 600, 550][mapDiff - 1] || 600;
  }

  global.NDData = {
    WORLD_W, WORLD_H,
    MAPS, TOWERS, ENEMIES,
    TOTAL_WAVES,
    generateWaves,
    START_LIVES,
    startMoney,
  };
})(window);
