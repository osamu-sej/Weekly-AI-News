const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');

const ui = {
  score: document.querySelector('#score'),
  wave: document.querySelector('#wave'),
  options: document.querySelector('#options'),
  laser: document.querySelector('#laser'),
  shieldBar: document.querySelector('#shieldBar'),
  comboBar: document.querySelector('#comboBar'),
  overlay: document.querySelector('#overlay'),
  overlayTitle: document.querySelector('#overlayTitle'),
  overlayText: document.querySelector('#overlayText'),
  startButton: document.querySelector('#startButton'),
  status: document.querySelector('#status'),
};

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const pointer = { active: false, x: W * 0.22, y: H * 0.5 };

const STAGES = [
  { name: 'STAGE 1: 月光残骸帯', duration: 34, tint: '#4efcff', enemyBias: ['drone', 'drone', 'seeker'] },
  { name: 'STAGE 2: 紫電アステロイド', duration: 40, tint: '#ff4fd8', enemyBias: ['drone', 'seeker', 'blade', 'heavy'] },
  { name: 'STAGE 3: ネオン要塞中枢', duration: 46, tint: '#ffd166', enemyBias: ['seeker', 'blade', 'heavy', 'turret'] },
];

const POWERUP_TYPES = {
  option: { label: 'OPTION LINKED', color: '#ffd166' },
  spread: { label: 'SPREAD CANNON +', color: '#4efcff' },
  missile: { label: 'HOMING POD +', color: '#ff4fd8' },
  laser: { label: 'LASER CELL', color: '#9dff6a' },
  shield: { label: 'SHIELD REPAIR', color: '#ffffff' },
};

let state;
let last = performance.now();
let spawnTimer = 0;
let powerTimer = 3.5;
let rafId = 0;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const rand = (min, max) => min + Math.random() * (max - min);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fmt = (score) => String(Math.floor(score)).padStart(6, '0');

function resetGame() {
  state = {
    running: true,
    time: 0,
    score: 0,
    stage: 1,
    stageTime: 0,
    stageStarted: true,
    bossSpawned: false,
    missionComplete: false,
    combo: 0,
    comboTimer: 0,
    shake: 0,
    stars: Array.from({ length: 170 }, () => ({ x: rand(0, W), y: rand(0, H), z: rand(.18, 1.8), s: rand(.4, 2.4) })),
    bullets: [],
    enemyBullets: [],
    enemies: [],
    particles: [],
    powerups: [],
    beams: [],
    player: {
      x: 150,
      y: H / 2,
      r: 18,
      shield: 100,
      invuln: 0,
      fire: 0,
      laser: 100,
      laserCooldown: 0,
      spreadLevel: 0,
      missileLevel: 0,
      missileFire: 0,
      options: [],
      trail: [],
    },
  };
  spawnTimer = 0;
  powerTimer = 2.1;
  ui.overlay.classList.add('hidden');
  ui.startButton.textContent = 'START MISSION';
  ui.status.textContent = `${STAGES[0].name} — 装備カプセルを回収`;
}

function choosePowerupType(forcedOption = false) {
  const p = state.player;
  if (forcedOption && p.options.length < 4 && Math.random() < .5) return 'option';
  const table = ['spread', 'missile', 'laser', 'shield'];
  if (p.options.length < 4) table.push('option', 'option');
  if (p.spreadLevel >= 3) table.splice(table.indexOf('spread'), 1);
  if (p.missileLevel >= 3) table.splice(table.indexOf('missile'), 1);
  return table[Math.floor(Math.random() * table.length)] || 'laser';
}

function collectPowerup(type) {
  const p = state.player;
  if (type === 'option') {
    if (p.options.length >= 4) {
      p.laser = clamp(p.laser + 42, 0, 100);
      addScore(800, 'オプション最大 — レーザー再充填');
      return;
    }
    p.options.push({ x: p.x - 46 - p.options.length * 12, y: p.y, phase: rand(0, 10), fire: 0 });
    addScore(1200, POWERUP_TYPES.option.label);
    return;
  }
  if (type === 'spread') {
    p.spreadLevel = clamp(p.spreadLevel + 1, 0, 3);
    addScore(900, `SPREAD CANNON Lv.${p.spreadLevel}`);
    return;
  }
  if (type === 'missile') {
    p.missileLevel = clamp(p.missileLevel + 1, 0, 3);
    addScore(900, `HOMING POD Lv.${p.missileLevel}`);
    return;
  }
  if (type === 'shield') {
    p.shield = clamp(p.shield + 28, 0, 100);
    p.invuln = Math.max(p.invuln, .55);
    addScore(500, 'SHIELD REPAIR');
    return;
  }
  p.laser = clamp(p.laser + 45, 0, 100);
  addScore(650, 'LASER CELL');
}

function addScore(points, message) {
  state.score += points * (1 + Math.min(state.combo, 35) * 0.04);
  state.combo = clamp(state.combo + 1, 0, 50);
  state.comboTimer = 2.2;
  if (message) ui.status.textContent = message;
}

function currentStage() {
  return STAGES[state.stage - 1];
}

function spawnEnemy(type) {
  const stage = currentStage();
  const chosen = type || stage.enemyBias[Math.floor(Math.random() * stage.enemyBias.length)];
  const specs = {
    drone: { r: 18, hp: 14, speed: [112, 160], amp: [18, 64], freq: [1.4, 3], score: 260 },
    seeker: { r: 22, hp: 26, speed: [135, 185], amp: [24, 72], freq: [1.7, 3.4], score: 440 },
    blade: { r: 20, hp: 32, speed: [175, 235], amp: [70, 130], freq: [2.4, 4.2], score: 520 },
    heavy: { r: 32, hp: 72, speed: [64, 100], amp: [15, 48], freq: [.9, 1.8], score: 920 },
    turret: { r: 28, hp: 54, speed: [76, 112], amp: [8, 30], freq: [1, 1.8], score: 740 },
  }[chosen];
  const hp = specs.hp + state.stage * 5 + state.stageTime * .45;
  state.enemies.push({
    x: W + 50,
    y: rand(92, H - 92),
    baseY: rand(100, H - 100),
    r: specs.r,
    hp,
    maxHp: hp,
    speed: rand(...specs.speed),
    amp: rand(...specs.amp),
    freq: rand(...specs.freq),
    score: specs.score,
    t: rand(0, 9),
    type: chosen,
    fire: rand(.35, 1.8),
  });
}

function spawnBoss() {
  const stage = state.stage;
  const hp = 520 + stage * 310;
  state.enemies.push({
    x: W + 140,
    y: H / 2,
    baseY: H / 2,
    r: 72 + stage * 8,
    hp,
    maxHp: hp,
    speed: 54,
    amp: 128,
    freq: .9 + stage * .16,
    score: 5500 + stage * 2200,
    t: 0,
    type: 'boss',
    fire: 1,
    phase: 0,
  });
  state.bossSpawned = true;
  state.shake = 14;
  ui.status.textContent = `WARNING: ${stage === 3 ? '要塞中枢コア' : `Stage ${stage} Boss`} 接近`;
}

function spawnPowerup(x = W + 40, y = rand(95, H - 95), forced = false, type = choosePowerupType(forced)) {
  const meta = POWERUP_TYPES[type];
  state.powerups.push({ x, y, r: 15, vx: forced ? -90 : -130, vy: rand(-18, 18), t: 0, type, color: meta.color });
}

function shootFrom(x, y, optionIndex = -1) {
  const p = state.player;
  const power = p.options.length;
  const isOption = optionIndex >= 0;
  state.bullets.push({ x: x + 26, y, vx: 760, vy: 0, r: 4.6, dmg: 8 + power * 1.4, life: 1.4, hue: isOption ? '#ff4fd8' : '#4efcff', kind: 'bolt' });

  if (!isOption) {
    const spread = p.spreadLevel;
    for (let i = 1; i <= spread; i += 1) {
      const angle = i * 40;
      state.bullets.push({ x: x + 18, y: y - 8, vx: 700, vy: -angle, r: 3.7, dmg: 5.2, life: 1.25, hue: '#ffd166', kind: 'bolt' });
      state.bullets.push({ x: x + 18, y: y + 8, vx: 700, vy: angle, r: 3.7, dmg: 5.2, life: 1.25, hue: '#ffd166', kind: 'bolt' });
    }
  }

  if (power >= 2 && !isOption) {
    state.bullets.push({ x: x + 16, y: y - 15, vx: 690, vy: -54, r: 3.5, dmg: 5, life: 1.2, hue: '#9dff6a', kind: 'bolt' });
    state.bullets.push({ x: x + 16, y: y + 15, vx: 690, vy: 54, r: 3.5, dmg: 5, life: 1.2, hue: '#9dff6a', kind: 'bolt' });
  }
}

function fireMissiles() {
  const p = state.player;
  if (p.missileLevel <= 0 || p.missileFire > 0) return;
  const volleys = Math.min(3, p.missileLevel);
  for (let i = 0; i < volleys; i += 1) {
    const offset = (i - (volleys - 1) / 2) * 18;
    state.bullets.push({
      x: p.x + 4,
      y: p.y + offset,
      vx: 450,
      vy: offset * 2,
      r: 6,
      dmg: 14,
      life: 2.25,
      hue: '#ff4fd8',
      kind: 'missile',
      smoke: 0,
    });
  }
  p.missileFire = Math.max(.34, .82 - p.missileLevel * .12);
}

function fireLaser() {
  const p = state.player;
  if (p.laser < 34 || p.laserCooldown > 0) return;
  p.laser -= 34;
  p.laserCooldown = .42;
  state.shake = 9;
  state.beams.push({ x: p.x + 34, y: p.y, life: .22, maxLife: .22, width: 22 + p.options.length * 7 + p.spreadLevel * 2, dmg: 44 + p.options.length * 16 + p.spreadLevel * 8 });
  p.options.forEach((o, i) => state.beams.push({ x: o.x + 20, y: o.y, life: .18, maxLife: .18, width: 10 + i * 2, dmg: 24 }));
}

function burst(x, y, color = '#4efcff', count = 18, force = 1) {
  for (let i = 0; i < count; i += 1) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(70, 420) * force;
    state.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(.28, .85), maxLife: rand(.5, 1), size: rand(1.2, 5.2), color });
  }
}

function update(dt) {
  if (!state?.running) return;
  state.time += dt;
  state.stageTime += dt;
  const p = state.player;
  p.invuln = Math.max(0, p.invuln - dt);
  p.fire -= dt;
  p.missileFire -= dt;
  p.laserCooldown -= dt;
  p.laser = clamp(p.laser + dt * (8 + p.options.length * 2), 0, 100);
  state.shake = Math.max(0, state.shake - dt * 30);
  state.comboTimer -= dt;
  if (state.comboTimer <= 0) state.combo = Math.max(0, state.combo - dt * 10);

  const dx = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
  const dy = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0);
  const speed = keys.has('alt') ? 190 : 340;
  if (pointer.active) {
    p.x += (pointer.x - p.x) * Math.min(1, dt * 9);
    p.y += (pointer.y - p.y) * Math.min(1, dt * 9);
  } else if (dx || dy) {
    const len = Math.hypot(dx, dy) || 1;
    p.x += dx / len * speed * dt;
    p.y += dy / len * speed * dt;
  }
  p.x = clamp(p.x, 42, W * .55);
  p.y = clamp(p.y, 58, H - 58);
  p.trail.unshift({ x: p.x - 24, y: p.y, life: .32 });
  p.trail = p.trail.slice(0, 16).map(t => ({ ...t, life: t.life - dt }));

  p.options.forEach((o, i) => {
    const targetX = p.x - 58 - i * 34;
    const targetY = p.y + Math.sin(state.time * 4 + i * 1.4) * (32 + i * 8);
    o.x += (targetX - o.x) * Math.min(1, dt * 7.5);
    o.y += (targetY - o.y) * Math.min(1, dt * 7.5);
    o.fire -= dt;
    if (o.fire <= 0) {
      shootFrom(o.x, o.y, i);
      o.fire = .18;
    }
  });

  if (p.fire <= 0) {
    shootFrom(p.x, p.y);
    p.fire = keys.has(' ') ? .075 : .105;
  }
  fireMissiles();
  if (keys.has('shift')) fireLaser();

  const bossAlive = state.enemies.some(enemy => enemy.type === 'boss');
  if (!state.bossSpawned && state.stageTime >= currentStage().duration) spawnBoss();

  spawnTimer -= dt;
  if (!bossAlive && !state.bossSpawned && spawnTimer <= 0) {
    const pack = 1 + Math.floor(Math.random() * Math.min(4, state.stage + 2));
    for (let i = 0; i < pack; i += 1) spawnEnemy();
    spawnTimer = Math.max(.36, 1.2 - state.stage * .11 - state.stageTime * .004);
  }
  powerTimer -= dt;
  if (powerTimer <= 0) {
    spawnPowerup();
    powerTimer = rand(7, 11);
  }

  updateEntities(dt);
  updateUi();
}

function updateEntities(dt) {
  const p = state.player;
  state.stars.forEach(star => {
    star.x -= (45 + star.z * 120 + state.stage * 8) * dt;
    if (star.x < -8) { star.x = W + 8; star.y = rand(0, H); star.z = rand(.18, 1.8); }
  });

  state.bullets.forEach(b => {
    if (b.kind === 'missile') {
      const target = state.enemies.reduce((best, enemy) => {
        const d = Math.hypot(enemy.x - b.x, enemy.y - b.y);
        return d < (best?.d ?? Infinity) ? { enemy, d } : best;
      }, null)?.enemy;
      if (target) {
        const desired = Math.atan2(target.y - b.y, target.x - b.x);
        const current = Math.atan2(b.vy, b.vx);
        let delta = desired - current;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const next = current + clamp(delta, -dt * 3.8, dt * 3.8);
        const speed = clamp(Math.hypot(b.vx, b.vy) + dt * 120, 430, 650);
        b.vx = Math.cos(next) * speed;
        b.vy = Math.sin(next) * speed;
      }
      b.smoke -= dt;
      if (b.smoke <= 0) {
        burst(b.x - 8, b.y, '#7f8cff', 1, .2);
        b.smoke = .04;
      }
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
  });
  state.bullets = state.bullets.filter(b => b.life > 0 && b.x < W + 100 && b.y > -100 && b.y < H + 100);

  state.beams.forEach(beam => {
    beam.life -= dt;
    state.enemies.forEach(enemy => {
      if (enemy.x > beam.x && Math.abs(enemy.y - beam.y) < beam.width + enemy.r) {
        enemy.hp -= beam.dmg * dt * 7;
        burst(enemy.x - enemy.r, enemy.y, '#ffffff', 1, .35);
      }
    });
  });
  state.beams = state.beams.filter(beam => beam.life > 0);

  state.enemies.forEach(enemy => {
    enemy.t += dt;
    if (enemy.type === 'boss') {
      enemy.x += (W - 190 - enemy.x) * Math.min(1, dt * .9);
      enemy.y = H / 2 + Math.sin(enemy.t * enemy.freq) * enemy.amp;
      enemy.phase = Math.floor((1 - enemy.hp / enemy.maxHp) * 3);
      enemy.fire -= dt;
      if (enemy.fire <= 0) {
        fireBossPattern(enemy);
        enemy.fire = Math.max(.34, .86 - state.stage * .08 - enemy.phase * .08);
      }
      return;
    }
    enemy.x -= enemy.speed * dt;
    enemy.y = enemy.baseY + Math.sin(enemy.t * enemy.freq) * enemy.amp;
    if (enemy.type === 'seeker') enemy.y += (p.y - enemy.y) * dt * .7;
    if (enemy.type === 'blade') enemy.x -= Math.max(0, Math.sin(enemy.t * 3.1)) * 65 * dt;
    enemy.fire -= dt;
    if (enemy.fire <= 0 && enemy.x < W - 80) {
      fireEnemyShot(enemy);
      enemy.fire = enemy.type === 'heavy' || enemy.type === 'turret' ? .75 : rand(1.05, 2.2);
    }
  });

  state.enemyBullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; });
  state.enemyBullets = state.enemyBullets.filter(b => b.life > 0 && b.x > -80 && b.x < W + 120 && b.y > -80 && b.y < H + 80);

  state.powerups.forEach(pow => {
    pow.t += dt;
    pow.x += pow.vx * dt;
    pow.y += (pow.vy + Math.sin(pow.t * 6) * 18) * dt;
  });

  state.particles.forEach(pt => {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= .985; pt.vy *= .985; pt.life -= dt;
  });
  state.particles = state.particles.filter(pt => pt.life > 0);

  collide();
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0 && enemy.x > -120);
  state.powerups = state.powerups.filter(pow => pow.x > -60);
}

function fireEnemyShot(enemy) {
  const p = state.player;
  const a = Math.atan2(p.y - enemy.y, p.x - enemy.x);
  const speed = enemy.type === 'blade' ? 250 : 215;
  state.enemyBullets.push({ x: enemy.x - enemy.r, y: enemy.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 5, life: 3.5, color: enemy.type === 'turret' ? '#ffd166' : '#ff4fd8' });
  if (enemy.type === 'heavy' || enemy.type === 'turret') {
    state.enemyBullets.push({ x: enemy.x - enemy.r, y: enemy.y - 12, vx: Math.cos(a - .18) * 205, vy: Math.sin(a - .18) * 205, r: 5, life: 3.5, color: '#ffd166' });
    state.enemyBullets.push({ x: enemy.x - enemy.r, y: enemy.y + 12, vx: Math.cos(a + .18) * 205, vy: Math.sin(a + .18) * 205, r: 5, life: 3.5, color: '#ffd166' });
  }
}

function fireBossPattern(enemy) {
  const p = state.player;
  const base = Math.atan2(p.y - enemy.y, p.x - enemy.x);
  const count = 5 + state.stage + enemy.phase;
  for (let i = 0; i < count; i += 1) {
    const offset = (i - (count - 1) / 2) * .16;
    const speed = 185 + state.stage * 18 + enemy.phase * 12;
    state.enemyBullets.push({ x: enemy.x - enemy.r * .8, y: enemy.y + (i - count / 2) * 7, vx: Math.cos(base + offset) * speed, vy: Math.sin(base + offset) * speed, r: 6, life: 4, color: i % 2 ? '#ff4fd8' : '#ffd166' });
  }
}

function collide() {
  const p = state.player;
  for (const enemy of state.enemies) {
    for (const bullet of state.bullets) {
      if (bullet.life > 0 && dist(enemy, bullet) < enemy.r + bullet.r) {
        enemy.hp -= bullet.dmg;
        bullet.life = 0;
        burst(bullet.x, bullet.y, bullet.hue, bullet.kind === 'missile' ? 14 : 4, bullet.kind === 'missile' ? .9 : .45);
      }
    }
    if (enemy.hp <= 0) {
      destroyEnemy(enemy);
    } else if (p.invuln <= 0 && dist(enemy, p) < enemy.r + p.r) {
      damagePlayer(enemy.type === 'boss' ? 34 : enemy.type === 'heavy' ? 28 : 16);
      if (enemy.type !== 'boss') enemy.hp = 0;
      burst(enemy.x, enemy.y, '#ff4fd8', 26, 1.2);
    }
  }

  for (const bullet of state.enemyBullets) {
    if (p.invuln <= 0 && dist(bullet, p) < p.r + bullet.r) {
      bullet.life = 0;
      damagePlayer(10);
      burst(bullet.x, bullet.y, bullet.color || '#ff4fd8', 12, .8);
    }
  }

  for (const pow of state.powerups) {
    if (dist(pow, p) < p.r + pow.r + 10) {
      pow.x = -999;
      collectPowerup(pow.type);
      burst(p.x, p.y, pow.color, 34, 1.25);
      state.shake = 5;
    }
  }
}

function destroyEnemy(enemy) {
  addScore(enemy.score, enemy.type === 'boss' ? 'BOSS BREAK!' : enemy.type === 'heavy' ? '大型機撃破 — カプセル確率UP' : 'ENEMY DOWN');
  const color = enemy.type === 'heavy' || enemy.type === 'turret' ? '#ffd166' : enemy.type === 'boss' ? '#ffffff' : '#4efcff';
  burst(enemy.x, enemy.y, color, enemy.type === 'boss' ? 110 : enemy.type === 'heavy' ? 42 : 22, enemy.type === 'boss' ? 2.1 : enemy.type === 'heavy' ? 1.4 : 1);
  state.shake = Math.max(state.shake, enemy.type === 'boss' ? 18 : enemy.type === 'heavy' ? 8 : 3);
  if (enemy.type === 'boss') {
    clearStage();
  } else if (Math.random() < (enemy.type === 'heavy' || enemy.type === 'turret' ? .62 : .17)) {
    spawnPowerup(enemy.x, enemy.y, true);
  }
}

function clearStage() {
  state.enemyBullets = [];
  if (state.stage >= STAGES.length) {
    missionClear();
    return;
  }
  state.stage += 1;
  state.stageTime = 0;
  state.bossSpawned = false;
  spawnTimer = 1.4;
  powerTimer = 2.5;
  state.player.shield = clamp(state.player.shield + 24, 0, 100);
  spawnPowerup(W * .72, H / 2, true, 'option');
  ui.status.textContent = `${currentStage().name} へ突入`;
}

function damagePlayer(amount) {
  const p = state.player;
  p.shield -= amount;
  p.invuln = 1.15;
  state.combo = 0;
  state.shake = 12;
  ui.status.textContent = '被弾！シールド再同期中';
  if (p.shield <= 0) gameOver();
}

function gameOver() {
  state.running = false;
  ui.overlayTitle.textContent = 'MISSION FAILED';
  ui.overlayText.textContent = `最終スコア ${fmt(state.score)} / Stage ${state.stage}。装備カプセルで火力を作り、3面のボス撃破を目指そう。`;
  ui.startButton.textContent = 'RETRY MISSION';
  ui.overlay.classList.remove('hidden');
}

function missionClear() {
  state.running = false;
  state.missionComplete = true;
  ui.overlayTitle.textContent = 'MISSION COMPLETE';
  ui.overlayText.textContent = `最終スコア ${fmt(state.score)}。3面構成のネオン要塞を突破しました。次はノーダメージと最大コンボに挑戦！`;
  ui.startButton.textContent = 'PLAY AGAIN';
  ui.overlay.classList.remove('hidden');
}

function updateUi() {
  const p = state.player;
  const boss = state.enemies.find(enemy => enemy.type === 'boss');
  ui.score.textContent = fmt(state.score);
  ui.wave.textContent = boss ? `B${state.stage}` : `${state.stage}-${Math.min(3, 1 + Math.floor(state.stageTime / (currentStage().duration / 3)))}`;
  ui.options.textContent = `${p.options.length}/4 S${p.spreadLevel} M${p.missileLevel}`;
  ui.laser.textContent = `${Math.round(p.laser)}%`;
  ui.shieldBar.style.width = `${clamp(p.shield, 0, 100)}%`;
  ui.comboBar.style.width = `${boss ? clamp((boss.hp / boss.maxHp) * 100, 0, 100) : clamp(state.combo * 2, 0, 100)}%`;
}

function draw() {
  const shakeX = rand(-state.shake, state.shake);
  const shakeY = rand(-state.shake, state.shake);
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBackground();
  drawPlayer();
  drawPowerups();
  drawEnemies();
  drawProjectiles();
  drawParticles();
  ctx.restore();
}

function drawBackground() {
  const stage = currentStage();
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#020613');
  g.addColorStop(.55, state.stage === 2 ? '#210c35' : '#071838');
  g.addColorStop(1, state.stage === 3 ? '#2a1806' : '#16051d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  state.stars.forEach(star => {
    ctx.globalAlpha = .22 + star.z * .34;
    ctx.fillStyle = star.z > 1.25 ? stage.tint : '#ffffff';
    ctx.fillRect(star.x, star.y, star.s * star.z * 2.7, star.s);
  });
  ctx.restore();

  for (let i = 0; i < 7; i += 1) {
    const x = (W - ((state.time * (30 + i * 9)) % (W + 360))) + i * 120;
    ctx.strokeStyle = hexToRgba(stage.tint, .04 + i * .008);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x - 180, H * .32, x + 160, H * .62, x - 80, H);
    ctx.stroke();
  }

  if (state.stage === 3) {
    ctx.save();
    ctx.globalAlpha = .16;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    for (let y = 90; y < H; y += 110) {
      ctx.beginPath();
      ctx.moveTo(W - ((state.time * 70) % 220), y);
      ctx.lineTo(W, y + 35);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawShip(x, y, scale = 1, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 24;
  ctx.shadowColor = '#4efcff';

  const body = ctx.createLinearGradient(-40, -22, 44, 22);
  body.addColorStop(0, '#15285c');
  body.addColorStop(.42, '#f5fbff');
  body.addColorStop(1, '#4efcff');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(46, 0);
  ctx.lineTo(12, -12);
  ctx.lineTo(-18, -28);
  ctx.lineTo(-10, -8);
  ctx.lineTo(-42, -19);
  ctx.lineTo(-25, 0);
  ctx.lineTo(-42, 19);
  ctx.lineTo(-10, 8);
  ctx.lineTo(-18, 28);
  ctx.lineTo(12, 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255,79,216,.95)';
  ctx.beginPath(); ctx.ellipse(-30, 0, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#04101c';
  ctx.beginPath(); ctx.ellipse(13, 0, 11, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(2, -14); ctx.lineTo(28, 0); ctx.lineTo(2, 14); ctx.stroke();

  ctx.shadowBlur = 16;
  ctx.shadowColor = '#ff4fd8';
  ctx.fillStyle = '#ff4fd8';
  ctx.beginPath(); ctx.moveTo(-45, -7); ctx.lineTo(-70, 0); ctx.lineTo(-45, 7); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const p = state.player;
  p.trail.forEach((t, i) => drawGlow(t.x - i * 5, t.y, 18 - i, '#4efcff', Math.max(0, t.life * .5)));
  p.options.forEach((o, i) => {
    drawGlow(o.x, o.y, 18, i % 2 ? '#ffd166' : '#ff4fd8', .45);
    ctx.save();
    ctx.translate(o.x, o.y);
    ctx.rotate(state.time * 2.8 + i);
    ctx.fillStyle = i % 2 ? '#ffd166' : '#ff4fd8';
    ctx.beginPath();
    ctx.moveTo(13, 0); ctx.lineTo(2, -9); ctx.lineTo(-11, -6); ctx.lineTo(-7, 0); ctx.lineTo(-11, 6); ctx.lineTo(2, 9); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  });
  drawShip(p.x, p.y, 1, p.invuln > 0 ? .55 + Math.sin(state.time * 40) * .25 : 1);
  if (p.invuln > 0) {
    ctx.strokeStyle = 'rgba(78,252,255,.55)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, 35 + Math.sin(state.time * 12) * 3, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawEnemies() {
  state.enemies.forEach(enemy => {
    const hp = enemy.hp / enemy.maxHp;
    if (enemy.type === 'boss') {
      drawBoss(enemy, hp);
      return;
    }
    const colors = {
      drone: ['#172858', '#4efcff'],
      seeker: ['#6420a8', '#ff4fd8'],
      blade: ['#1f3d33', '#9dff6a'],
      heavy: ['#7a3b10', '#ffd166'],
      turret: ['#33235f', '#ffd166'],
    }[enemy.type];
    drawGlow(enemy.x, enemy.y, enemy.r * 1.8, colors[1], .2);
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(Math.PI + Math.sin(enemy.t * 2) * .08);
    ctx.fillStyle = colors[0];
    ctx.strokeStyle = colors[1];
    ctx.lineWidth = 3;
    if (enemy.type === 'heavy') drawHeavyHull(enemy.r);
    else if (enemy.type === 'seeker') drawSeekerHull(enemy.r);
    else if (enemy.type === 'blade') drawBladeHull(enemy.r);
    else if (enemy.type === 'turret') drawTurretHull(enemy.r, enemy.t);
    else drawDroneHull(enemy.r);
    ctx.restore();
    drawEnemyHp(enemy, hp);
  });
}

function drawDroneHull(r) {
  ctx.beginPath();
  ctx.moveTo(r + 12, 0); ctx.lineTo(r * .15, -r * .65); ctx.lineTo(-r * .95, -r * .9); ctx.lineTo(-r * .52, 0); ctx.lineTo(-r * .95, r * .9); ctx.lineTo(r * .15, r * .65); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(r * .2, 0, r * .34, r * .18, 0, 0, Math.PI * 2); ctx.fill();
}

function drawSeekerHull(r) {
  ctx.beginPath();
  ctx.moveTo(r + 12, 0); ctx.quadraticCurveTo(0, -r * 1.05, -r * 1.15, -r * .28); ctx.lineTo(-r * .42, 0); ctx.lineTo(-r * 1.15, r * .28); ctx.quadraticCurveTo(0, r * 1.05, r + 12, 0); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffb3f0'; ctx.beginPath(); ctx.arc(r * .15, 0, r * .22, 0, Math.PI * 2); ctx.fill();
}

function drawBladeHull(r) {
  ctx.beginPath();
  ctx.moveTo(r + 16, 0); ctx.lineTo(-r * .2, -r * .36); ctx.lineTo(-r * 1.3, -r * 1.1); ctx.lineTo(-r * .78, 0); ctx.lineTo(-r * 1.3, r * 1.1); ctx.lineTo(-r * .2, r * .36); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-r * .45, -r * .68); ctx.lineTo(r * .4, 0); ctx.lineTo(-r * .45, r * .68); ctx.stroke();
}

function drawHeavyHull(r) {
  ctx.beginPath();
  ctx.rect(-r * 1.15, -r * .72, r * 2, r * 1.44);
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r * .85, -r * .55); ctx.lineTo(r * 1.35, 0); ctx.lineTo(r * .85, r * .55); ctx.stroke();
  ctx.fillStyle = '#ffd166'; ctx.fillRect(-r * .75, -r * .16, r * .75, r * .32);
}

function drawTurretHull(r, t) {
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = i / 8 * Math.PI * 2 + t;
    const rr = i % 2 ? r * .75 : r * 1.12;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 1.25, 0); ctx.stroke();
}

function drawBoss(enemy, hp) {
  drawGlow(enemy.x, enemy.y, enemy.r * 2.25, '#ffd166', .22);
  ctx.save();
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(Math.PI);
  const r = enemy.r;
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#3b1458');
  g.addColorStop(.52, '#a6474f');
  g.addColorStop(1, '#ffd166');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(r * 1.28, 0);
  ctx.lineTo(r * .55, -r * .55);
  ctx.lineTo(-r * .38, -r * .92);
  ctx.lineTo(-r * .92, -r * .36);
  ctx.lineTo(-r * .64, 0);
  ctx.lineTo(-r * .92, r * .36);
  ctx.lineTo(-r * .38, r * .92);
  ctx.lineTo(r * .55, r * .55);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#4efcff';
  ctx.lineWidth = 3;
  for (let i = -1; i <= 1; i += 1) {
    ctx.beginPath(); ctx.moveTo(-r * .45, i * r * .34); ctx.lineTo(r * .78, i * r * .16); ctx.stroke();
  }
  ctx.fillStyle = '#04101c';
  ctx.beginPath(); ctx.arc(r * .18, 0, r * .2 + Math.sin(state.time * 8) * 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,.2)';
  ctx.fillRect(W * .25, 74, W * .5, 8);
  ctx.fillStyle = hp > .45 ? '#ffd166' : '#ff4fd8';
  ctx.fillRect(W * .25, 74, W * .5 * hp, 8);
}

function drawEnemyHp(enemy, hp) {
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect(enemy.x - enemy.r, enemy.y - enemy.r - 12, enemy.r * 2, 4);
  ctx.fillStyle = hp > .45 ? '#4efcff' : '#ff4fd8';
  ctx.fillRect(enemy.x - enemy.r, enemy.y - enemy.r - 12, enemy.r * 2 * hp, 4);
}

function drawProjectiles() {
  state.beams.forEach(beam => {
    const a = beam.life / beam.maxLife;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowBlur = 35;
    ctx.shadowColor = '#4efcff';
    const g = ctx.createLinearGradient(beam.x, beam.y, W, beam.y);
    g.addColorStop(0, 'rgba(255,255,255,.95)');
    g.addColorStop(.12, 'rgba(78,252,255,.9)');
    g.addColorStop(1, 'rgba(255,79,216,.18)');
    ctx.strokeStyle = g;
    ctx.lineWidth = beam.width;
    ctx.beginPath(); ctx.moveTo(beam.x, beam.y); ctx.lineTo(W + 80, beam.y + Math.sin(state.time * 24) * 4); ctx.stroke();
    ctx.restore();
  });
  state.bullets.forEach(b => {
    if (b.kind === 'missile') {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      drawGlow(0, 0, b.r * 3, b.hue, .65);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-7, -5); ctx.lineTo(-3, 0); ctx.lineTo(-7, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      drawGlow(b.x, b.y, b.r * 3, b.hue, .8);
    }
  });
  state.enemyBullets.forEach(b => drawGlow(b.x, b.y, b.r * 3, b.color || '#ff4fd8', .75));
}

function drawPowerups() {
  state.powerups.forEach(pow => {
    const pulse = 1 + Math.sin(pow.t * 8) * .12;
    drawGlow(pow.x, pow.y, 30 * pulse, pow.color, .45);
    ctx.save();
    ctx.translate(pow.x, pow.y);
    ctx.rotate(pow.t * 3);
    ctx.strokeStyle = pow.color; ctx.lineWidth = 3;
    ctx.fillStyle = hexToRgba(pow.color, .18);
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = i / 6 * Math.PI * 2;
      const r = i % 2 ? 10 : 18;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 12px "Exo 2", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pow.type[0].toUpperCase(), 0, 1);
    ctx.restore();
  });
}

function drawParticles() {
  state.particles.forEach(pt => drawGlow(pt.x, pt.y, pt.size * 2, pt.color, pt.life / pt.maxLife));
}

function drawGlow(x, y, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = r * 2;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r * .34, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function loop(now) {
  const dt = Math.min(.033, (now - last) / 1000);
  last = now;
  update(dt);
  if (state) draw();
  rafId = requestAnimationFrame(loop);
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * W, y: (event.clientY - rect.top) / rect.height * H };
}

window.addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());
  if ([' ', 'Shift', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
canvas.addEventListener('pointerdown', (event) => { pointer.active = true; Object.assign(pointer, pointFromEvent(event)); canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', (event) => { if (pointer.active) Object.assign(pointer, pointFromEvent(event)); });
canvas.addEventListener('pointerup', () => { pointer.active = false; });
canvas.addEventListener('contextmenu', (event) => { event.preventDefault(); if (state?.running) fireLaser(); });
ui.startButton.addEventListener('click', () => resetGame());

resetGame();
state.running = false;
ui.overlay.classList.remove('hidden');
cancelAnimationFrame(rafId);
rafId = requestAnimationFrame((now) => { last = now; loop(now); });
