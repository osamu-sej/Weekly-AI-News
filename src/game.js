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
    wave: 1,
    combo: 0,
    comboTimer: 0,
    shake: 0,
    stars: Array.from({ length: 150 }, () => ({ x: rand(0, W), y: rand(0, H), z: rand(.18, 1.8), s: rand(.4, 2.4) })),
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
      options: [],
      trail: [],
    },
  };
  spawnTimer = 0;
  powerTimer = 2.3;
  ui.overlay.classList.add('hidden');
  ui.status.textContent = 'オプションを回収して火力を拡張';
}

function addOption() {
  const p = state.player;
  if (p.options.length >= 4) {
    p.laser = clamp(p.laser + 42, 0, 100);
    addScore(800, 'レーザー再充填');
    return;
  }
  p.options.push({ x: p.x - 46 - p.options.length * 12, y: p.y, phase: rand(0, 10), fire: 0 });
  addScore(1200, 'OPTION LINKED');
}

function addScore(points, message) {
  state.score += points * (1 + Math.min(state.combo, 35) * 0.04);
  state.combo = clamp(state.combo + 1, 0, 50);
  state.comboTimer = 2.2;
  if (message) ui.status.textContent = message;
}

function spawnEnemy() {
  const wave = state.wave;
  const typeRoll = Math.random();
  const heavy = typeRoll > .78 && wave > 1;
  const seeker = typeRoll > .56 && !heavy;
  state.enemies.push({
    x: W + 50,
    y: rand(92, H - 92),
    baseY: rand(100, H - 100),
    r: heavy ? 30 : seeker ? 21 : 17,
    hp: heavy ? 58 + wave * 8 : seeker ? 22 + wave * 3 : 12 + wave * 2,
    maxHp: heavy ? 58 + wave * 8 : seeker ? 22 + wave * 3 : 12 + wave * 2,
    speed: heavy ? rand(65, 95) : seeker ? rand(125, 170) : rand(105, 150),
    amp: rand(22, 78),
    freq: rand(1.2, 2.7),
    t: rand(0, 9),
    type: heavy ? 'heavy' : seeker ? 'seeker' : 'drone',
    fire: rand(.4, 2.1),
  });
}

function spawnPowerup(x = W + 40, y = rand(95, H - 95), forced = false) {
  state.powerups.push({ x, y, r: 15, vx: forced ? -90 : -130, vy: rand(-18, 18), t: 0 });
}

function shootFrom(x, y, optionIndex = -1) {
  const power = state.player.options.length;
  state.bullets.push({ x: x + 24, y, vx: 720, vy: 0, r: 4.5, dmg: 8 + power * 1.4, life: 1.4, hue: optionIndex < 0 ? '#4efcff' : '#ff4fd8' });
  if (power >= 2 && optionIndex < 0) {
    state.bullets.push({ x: x + 16, y: y - 9, vx: 690, vy: -42, r: 3.5, dmg: 5, life: 1.2, hue: '#ffd166' });
    state.bullets.push({ x: x + 16, y: y + 9, vx: 690, vy: 42, r: 3.5, dmg: 5, life: 1.2, hue: '#ffd166' });
  }
}

function fireLaser() {
  const p = state.player;
  if (p.laser < 34 || p.laserCooldown > 0) return;
  p.laser -= 34;
  p.laserCooldown = .42;
  state.shake = 9;
  state.beams.push({ x: p.x + 28, y: p.y, life: .22, maxLife: .22, width: 22 + p.options.length * 7, dmg: 44 + p.options.length * 16 });
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
  const p = state.player;
  state.wave = 1 + Math.floor(state.time / 24);
  p.invuln = Math.max(0, p.invuln - dt);
  p.fire -= dt;
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
  p.trail.unshift({ x: p.x - 20, y: p.y, life: .32 });
  p.trail = p.trail.slice(0, 14).map(t => ({ ...t, life: t.life - dt }));

  p.options.forEach((o, i) => {
    const targetX = p.x - 54 - i * 34;
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
  if (keys.has('shift')) fireLaser();

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const pack = 1 + Math.floor(Math.random() * Math.min(4, state.wave + 1));
    for (let i = 0; i < pack; i += 1) spawnEnemy();
    spawnTimer = Math.max(.42, 1.35 - state.wave * .055);
  }
  powerTimer -= dt;
  if (powerTimer <= 0) {
    spawnPowerup();
    powerTimer = rand(8, 13);
  }

  updateEntities(dt);
  updateUi();
}

function updateEntities(dt) {
  const p = state.player;
  state.stars.forEach(star => {
    star.x -= (45 + star.z * 120) * dt;
    if (star.x < -8) { star.x = W + 8; star.y = rand(0, H); star.z = rand(.18, 1.8); }
  });

  state.bullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; });
  state.bullets = state.bullets.filter(b => b.life > 0 && b.x < W + 80 && b.y > -80 && b.y < H + 80);

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
    enemy.x -= enemy.speed * dt;
    enemy.y = enemy.baseY + Math.sin(enemy.t * enemy.freq) * enemy.amp;
    if (enemy.type === 'seeker') enemy.y += (p.y - enemy.y) * dt * .65;
    enemy.fire -= dt;
    if (enemy.fire <= 0 && enemy.x < W - 80) {
      const a = Math.atan2(p.y - enemy.y, p.x - enemy.x);
      state.enemyBullets.push({ x: enemy.x - enemy.r, y: enemy.y, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: 5, life: 3.5 });
      enemy.fire = enemy.type === 'heavy' ? .75 : rand(1.25, 2.4);
    }
  });

  state.enemyBullets.forEach(b => { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; });
  state.enemyBullets = state.enemyBullets.filter(b => b.life > 0 && b.x > -60 && b.y > -60 && b.y < H + 60);

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
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0 && enemy.x > -90);
  state.powerups = state.powerups.filter(pow => pow.x > -60);
}

function collide() {
  const p = state.player;
  for (const enemy of state.enemies) {
    for (const bullet of state.bullets) {
      if (bullet.life > 0 && dist(enemy, bullet) < enemy.r + bullet.r) {
        enemy.hp -= bullet.dmg;
        bullet.life = 0;
        burst(bullet.x, bullet.y, bullet.hue, 4, .45);
      }
    }
    if (enemy.hp <= 0) {
      const value = enemy.type === 'heavy' ? 850 : enemy.type === 'seeker' ? 420 : 240;
      addScore(value, enemy.type === 'heavy' ? '大型機撃破 — カプセル確率UP' : 'ENEMY DOWN');
      burst(enemy.x, enemy.y, enemy.type === 'heavy' ? '#ffd166' : '#4efcff', enemy.type === 'heavy' ? 42 : 22, enemy.type === 'heavy' ? 1.4 : 1);
      state.shake = Math.max(state.shake, enemy.type === 'heavy' ? 8 : 3);
      if (Math.random() < (enemy.type === 'heavy' ? .72 : .16)) spawnPowerup(enemy.x, enemy.y, true);
    } else if (p.invuln <= 0 && dist(enemy, p) < enemy.r + p.r) {
      damagePlayer(enemy.type === 'heavy' ? 28 : 16);
      enemy.hp = 0;
      burst(enemy.x, enemy.y, '#ff4fd8', 26, 1.2);
    }
  }

  for (const bullet of state.enemyBullets) {
    if (p.invuln <= 0 && dist(bullet, p) < p.r + bullet.r) {
      bullet.life = 0;
      damagePlayer(10);
      burst(bullet.x, bullet.y, '#ff4fd8', 12, .8);
    }
  }

  for (const pow of state.powerups) {
    if (dist(pow, p) < p.r + pow.r + 10) {
      pow.x = -999;
      addOption();
      burst(p.x, p.y, '#ffd166', 34, 1.25);
      state.shake = 5;
    }
  }
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
  ui.overlayText.textContent = `最終スコア ${fmt(state.score)} / Wave ${String(state.wave).padStart(2, '0')}。もう一度出撃して、オプション編隊を完成させよう。`;
  ui.startButton.textContent = 'RETRY MISSION';
  ui.overlay.classList.remove('hidden');
}

function updateUi() {
  const p = state.player;
  ui.score.textContent = fmt(state.score);
  ui.wave.textContent = String(state.wave).padStart(2, '0');
  ui.options.textContent = `${p.options.length}/4`;
  ui.laser.textContent = `${Math.round(p.laser)}%`;
  ui.shieldBar.style.width = `${clamp(p.shield, 0, 100)}%`;
  ui.comboBar.style.width = `${clamp(state.combo * 2, 0, 100)}%`;
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
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#020613');
  g.addColorStop(.55, '#071838');
  g.addColorStop(1, '#16051d');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  state.stars.forEach(star => {
    ctx.globalAlpha = .22 + star.z * .34;
    ctx.fillStyle = star.z > 1.25 ? '#4efcff' : '#ffffff';
    ctx.fillRect(star.x, star.y, star.s * star.z * 2.7, star.s);
  });
  ctx.restore();

  for (let i = 0; i < 6; i += 1) {
    const x = (W - ((state.time * (30 + i * 9)) % (W + 360))) + i * 120;
    ctx.strokeStyle = `rgba(78,252,255,${.04 + i * .008})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x - 180, H * .32, x + 160, H * .62, x - 80, H);
    ctx.stroke();
  }
}

function drawShip(x, y, scale = 1, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = 22;
  ctx.shadowColor = '#4efcff';
  const body = ctx.createLinearGradient(-22, -18, 32, 18);
  body.addColorStop(0, '#23315f');
  body.addColorStop(.45, '#f5fbff');
  body.addColorStop(1, '#4efcff');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(35, 0); ctx.lineTo(-18, -21); ctx.lineTo(-6, -6); ctx.lineTo(-34, 0); ctx.lineTo(-6, 6); ctx.lineTo(-18, 21); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff4fd8';
  ctx.beginPath(); ctx.ellipse(-20, 0, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#04101c';
  ctx.beginPath(); ctx.ellipse(8, 0, 9, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const p = state.player;
  p.trail.forEach((t, i) => drawGlow(t.x - i * 5, t.y, 18 - i, '#4efcff', Math.max(0, t.life * .5)));
  p.options.forEach((o, i) => {
    drawGlow(o.x, o.y, 17, '#ff4fd8', .45);
    ctx.fillStyle = i % 2 ? '#ffd166' : '#ff4fd8';
    ctx.beginPath(); ctx.arc(o.x, o.y, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
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
    drawGlow(enemy.x, enemy.y, enemy.r * 1.5, enemy.type === 'heavy' ? '#ffd166' : '#ff4fd8', .2);
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(Math.PI);
    ctx.fillStyle = enemy.type === 'heavy' ? '#7a3b10' : enemy.type === 'seeker' ? '#6420a8' : '#172858';
    ctx.strokeStyle = enemy.type === 'heavy' ? '#ffd166' : '#ff4fd8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(enemy.r + 8, 0);
    ctx.lineTo(-enemy.r, -enemy.r * .75);
    ctx.lineTo(-enemy.r * .55, 0);
    ctx.lineTo(-enemy.r, enemy.r * .75);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(enemy.x - enemy.r, enemy.y - enemy.r - 12, enemy.r * 2, 4);
    ctx.fillStyle = hp > .45 ? '#4efcff' : '#ff4fd8';
    ctx.fillRect(enemy.x - enemy.r, enemy.y - enemy.r - 12, enemy.r * 2 * hp, 4);
  });
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
  state.bullets.forEach(b => drawGlow(b.x, b.y, b.r * 3, b.hue, .8));
  state.enemyBullets.forEach(b => drawGlow(b.x, b.y, b.r * 3, '#ff4fd8', .75));
}

function drawPowerups() {
  state.powerups.forEach(pow => {
    const pulse = 1 + Math.sin(pow.t * 8) * .12;
    drawGlow(pow.x, pow.y, 30 * pulse, '#ffd166', .45);
    ctx.save();
    ctx.translate(pow.x, pow.y);
    ctx.rotate(pow.t * 3);
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(255,209,102,.18)';
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const a = i / 6 * Math.PI * 2;
      const r = i % 2 ? 10 : 18;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
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
