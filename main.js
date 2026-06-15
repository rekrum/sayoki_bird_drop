const { Engine, Runner, Bodies, Composite, Events, Body } = Matter;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const nextPreview = document.getElementById('nextPreview');
const titleScreen = document.getElementById('titleScreen');
const pauseScreen = document.getElementById('pauseScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreText = document.getElementById('finalScoreText');
const newRecordText = document.getElementById('newRecordText');
const startButton = document.getElementById('startButton');
const retryButton = document.getElementById('retryButton');
const resumeButton = document.getElementById('resumeButton');
const pauseButton = document.getElementById('pauseButton');
const muteButton = document.getElementById('muteButton');
const shareButton = document.getElementById('shareButton');
const evolutionList = document.getElementById('evolutionList');

const W = canvas.width;
const H = canvas.height;
const FLOOR_Y = H - 42;
const DEADLINE_Y = 120;
const DROP_Y = 78;
const STORAGE_KEY = 'sayokiBirdDropHighScore';
const MUTE_KEY = 'sayokiBirdDropMuted';
const GAME_URL = 'https://rekrum.github.io/sayoki-bird-drop/';

const LEVELS = [
  { name: 'あおサヨキ', color: 'blue', radius: 28, score: 10, img: 'assets/sayoki_blue.png' },
  { name: 'あかサヨキ', color: 'red', radius: 34, score: 30, img: 'assets/sayoki_red.png' },
  { name: 'みどりサヨキ', color: 'green', radius: 42, score: 70, img: 'assets/sayoki_green.png' },
  { name: 'きいろサヨキ', color: 'yellow', radius: 52, score: 150, img: 'assets/sayoki_yellow.png' },
  { name: 'オレンジサヨキ', color: 'orange', radius: 64, score: 320, img: 'assets/sayoki_orange.png' },
  { name: 'ピンクサヨキ', color: 'pink', radius: 78, score: 680, img: 'assets/sayoki_pink.png' },
  { name: 'むらさきサヨキ', color: 'purple', radius: 94, score: 1450, img: 'assets/sayoki_purple.png' },
  { name: 'レインボーサヨキ', color: 'rainbow', radius: 112, score: 3200, img: 'assets/sayoki_rainbow.png' }
];

const images = {};
LEVELS.forEach(l => {
  const img = new Image();
  img.src = l.img;
  images[l.color] = img;
});
const bgImage = new Image();
bgImage.src = 'assets/background.png';

const sounds = {
  title: new Audio('assets/title.mp3'),
  game: new Audio('assets/game.mp3'),
  merge: new Audio('assets/merge.mp3'),
  gameover: new Audio('assets/gameover.mp3')
};
sounds.title.loop = true;
sounds.game.loop = true;
sounds.title.volume = 0.35;
sounds.game.volume = 0.35;
sounds.merge.volume = 0.8;
sounds.gameover.volume = 0.8;

let muted = localStorage.getItem(MUTE_KEY) === '1';
let highScore = Number(localStorage.getItem(STORAGE_KEY) || 0);
let engine, runner;
let birds = [];
let particles = [];
let floatingTexts = [];
let score = 0;
let nextLevel = 0;
let currentLevel = 0;
let sliderX = W / 2;
let targetX = W / 2;
let canDrop = true;
let running = false;
let gameOver = false;
let paused = false;
let merging = new Set();
let lastPointerDown = 0;

highScoreEl.textContent = highScore.toLocaleString();
updateMuteButton();

function randStartLevel() {
  return Math.floor(Math.random() * 3);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function playSound(name) {
  if (muted) return;
  const s = sounds[name];
  if (!s) return;
  s.currentTime = 0;
  s.play().catch(() => {});
}

function startMusic(name) {
  if (muted) return;
  Object.values(sounds).forEach(a => { if (a.loop) a.pause(); });
  const s = sounds[name];
  if (!s) return;
  s.currentTime = 0;
  s.play().catch(() => {});
}

function stopMusic() {
  Object.values(sounds).forEach(a => { if (a.loop) a.pause(); });
}

function setupEvolutionList() {
  evolutionList.innerHTML = LEVELS.map((l, i) => `
    <div class="evo-item" title="${l.name}">
      <img src="${l.img}" alt="${l.name}">${i < LEVELS.length - 1 ? '<span>›</span>' : ''}
    </div>
  `).join('');
}

function setupWorld() {
  engine = Engine.create();
  engine.gravity.y = 1.05;
  runner = Runner.create();
  birds = [];
  particles = [];
  floatingTexts = [];
  merging = new Set();
  score = 0;
  scoreEl.textContent = '0';
  canDrop = true;
  gameOver = false;
  paused = false;
  sliderX = W / 2;
  targetX = W / 2;

  const wallOpt = { isStatic: true, render: { visible: false }, friction: 0.85, restitution: 0.05 };
  Composite.add(engine.world, [
    Bodies.rectangle(W / 2, H + 25, W, 100, wallOpt),
    Bodies.rectangle(-26, H / 2, 52, H, wallOpt),
    Bodies.rectangle(W + 26, H / 2, 52, H, wallOpt)
  ]);

  Events.on(engine, 'collisionStart', handleCollision);
  currentLevel = randStartLevel();
  nextLevel = randStartLevel();
  updateNextPreview();
  Runner.run(runner, engine);
}

function createBird(x, y, levelIndex) {
  const level = LEVELS[levelIndex];
  const body = Bodies.circle(x, y, level.radius, {
    restitution: 0.12,
    friction: 0.78,
    frictionAir: 0.018,
    density: 0.0022,
    label: 'bird'
  });
  body.plugin = { levelIndex, bornAt: performance.now() };
  Composite.add(engine.world, body);
  birds.push(body);
  return body;
}

function dropBird() {
  if (!running || paused || !canDrop || gameOver) return;
  canDrop = false;
  const r = LEVELS[currentLevel].radius;
  const x = clamp(sliderX, r + 10, W - r - 10);
  const b = createBird(x, DROP_Y, currentLevel);
  Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.08);
  currentLevel = nextLevel;
  nextLevel = randStartLevel();
  updateNextPreview();
  setTimeout(() => { canDrop = true; }, 650);
}

function handleCollision(event) {
  if (paused || gameOver) return;
  for (const pair of event.pairs) {
    const a = pair.bodyA;
    const b = pair.bodyB;
    if (a.label !== 'bird' || b.label !== 'bird') continue;
    if (merging.has(a.id) || merging.has(b.id)) continue;
    if (a.plugin.levelIndex !== b.plugin.levelIndex) continue;
    if (a.plugin.levelIndex >= LEVELS.length - 1) continue;

    const now = performance.now();
    if (now - a.plugin.bornAt < 200 || now - b.plugin.bornAt < 200) continue;
    mergeBirds(a, b);
    break;
  }
}

function mergeBirds(a, b) {
  merging.add(a.id);
  merging.add(b.id);
  const next = a.plugin.levelIndex + 1;
  const x = (a.position.x + b.position.x) / 2;
  const y = (a.position.y + b.position.y) / 2;

  removeBird(a);
  removeBird(b);

  const gained = LEVELS[next].score;
  score += gained;
  scoreEl.textContent = score.toLocaleString();
  if (score > highScore) {
    highScore = score;
    localStorage.setItem(STORAGE_KEY, String(highScore));
    highScoreEl.textContent = highScore.toLocaleString();
  }
  playSound('merge');
  spawnBurst(x, y, LEVELS[next].color);
  floatingTexts.push({ x, y, text: `+${gained}`, life: 60, vy: -1.2 });

  setTimeout(() => {
    if (!engine || gameOver) return;
    const nb = createBird(x, y, next);
    Body.setVelocity(nb, { x: (Math.random() - 0.5) * 2, y: -2.2 });
    Body.setAngularVelocity(nb, (Math.random() - 0.5) * 0.12);
  }, 30);
}

function removeBird(body) {
  Composite.remove(engine.world, body);
  birds = birds.filter(v => v.id !== body.id);
}

function spawnBurst(x, y) {
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 4.5;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 34 + Math.random() * 16, size: 4 + Math.random() * 7 });
  }
}

function updateNextPreview() {
  nextPreview.src = LEVELS[nextLevel].img;
}

function updateSlider() {
  const r = LEVELS[currentLevel].radius;
  targetX = clamp(targetX, r + 12, W - r - 12);
  sliderX += (targetX - sliderX) * 0.28;
}

function checkGameOver() {
  if (gameOver) return;
  const danger = birds.some(b => b.speed < 0.35 && b.position.y - LEVELS[b.plugin.levelIndex].radius < DEADLINE_Y && performance.now() - b.plugin.bornAt > 1600);
  if (danger) endGame();
}

function endGame() {
  gameOver = true;
  running = false;
  paused = false;
  Runner.stop(runner);
  stopMusic();
  playSound('gameover');
  const isRecord = score >= highScore && score > 0;
  finalScoreText.textContent = `スコア：${score.toLocaleString()}`;
  newRecordText.textContent = isRecord ? 'NEW RECORD!' : `ハイスコア：${highScore.toLocaleString()}`;
  gameOverScreen.classList.add('show');
}

function drawBackground() {
  ctx.clearRect(0, 0, W, H);
  if (bgImage.complete) ctx.drawImage(bgImage, 0, 0, W, H);
  else {
    ctx.fillStyle = '#9be9ef';
    ctx.fillRect(0, 0, W, H);
  }

  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(18, DEADLINE_Y);
  ctx.lineTo(W - 18, DEADLINE_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = 'rgba(100,70,36,.24)';
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillRect(0, FLOOR_Y, W, 4);
}

function drawBird(body, alpha = 1) {
  const level = LEVELS[body.plugin.levelIndex];
  const img = images[level.color];
  const r = level.radius;
  const w = r * 2.4;
  const h = r * 2.05;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);
  ctx.shadowColor = 'rgba(25,55,80,.24)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 5;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawGhost() {
  const body = { position: { x: sliderX, y: DROP_Y }, angle: Math.sin(performance.now()/180)*0.04, plugin: { levelIndex: currentLevel } };
  drawBird(body, 0.92);
  ctx.strokeStyle = 'rgba(22,70,111,.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 8]);
  ctx.beginPath();
  ctx.moveTo(sliderX, DROP_Y + LEVELS[currentLevel].radius + 10);
  ctx.lineTo(sliderX, FLOOR_Y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawParticles() {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.life--;
    ctx.globalAlpha = Math.max(0, p.life / 45);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawFloatingTexts() {
  floatingTexts = floatingTexts.filter(t => t.life > 0);
  floatingTexts.forEach(t => {
    t.y += t.vy;
    t.life--;
    ctx.globalAlpha = Math.max(0, t.life / 60);
    ctx.font = '900 24px system-ui';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'white';
    ctx.fillStyle = '#e77b36';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillText(t.text, t.x, t.y);
  });
  ctx.globalAlpha = 1;
}

function loop() {
  if (running && !paused && !gameOver) updateSlider();
  drawBackground();
  birds.forEach(b => drawBird(b));
  if (running && !paused && !gameOver) drawGhost();
  drawParticles();
  drawFloatingTexts();
  if (running && !paused) checkGameOver();
  requestAnimationFrame(loop);
}

function startGame() {
  if (runner) Runner.stop(runner);
  if (engine) Engine.clear(engine);
  titleScreen.classList.remove('show');
  pauseScreen.classList.remove('show');
  gameOverScreen.classList.remove('show');
  setupWorld();
  running = true;
  paused = false;
  startMusic('game');
}

function togglePause(force) {
  if (!running || gameOver) return;
  paused = typeof force === 'boolean' ? force : !paused;
  if (paused) {
    Runner.stop(runner);
    sounds.game.pause();
    pauseScreen.classList.add('show');
    pauseButton.textContent = 'RESUME';
  } else {
    Runner.run(runner, engine);
    if (!muted) sounds.game.play().catch(() => {});
    pauseScreen.classList.remove('show');
    pauseButton.textContent = 'PAUSE';
  }
}

function toggleMute() {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  updateMuteButton();
  if (muted) stopMusic();
  else if (running && !paused && !gameOver) sounds.game.play().catch(() => {});
  else if (!running && !gameOver) sounds.title.play().catch(() => {});
}

function updateMuteButton() {
  muteButton.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
}

function canvasToX(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (W / rect.width);
}

canvas.addEventListener('pointermove', e => {
  targetX = canvasToX(e.clientX);
});
canvas.addEventListener('pointerdown', e => {
  lastPointerDown = performance.now();
  targetX = canvasToX(e.clientX);
});
canvas.addEventListener('pointerup', e => {
  targetX = canvasToX(e.clientX);
  if (performance.now() - lastPointerDown < 500) dropBird();
});

startButton.addEventListener('click', startGame);
retryButton.addEventListener('click', startGame);
resumeButton.addEventListener('click', () => togglePause(false));
pauseButton.addEventListener('click', () => togglePause());
muteButton.addEventListener('click', toggleMute);
shareButton.addEventListener('click', () => {
  const text =
`SAYOKI BIRD DROPで${score.toLocaleString()}点を取りました！

レインボーサヨキを目指せ！

あなたはどこまで進化できる？

#サヨキバード`;

  const shareUrl =
    `https://x.com/intent/post?text=${encodeURIComponent(text)}` +
    `&url=${encodeURIComponent(GAME_URL)}`;

  window.open(shareUrl, '_blank', 'noopener,noreferrer');
});

document.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!running && !gameOver) startGame();
    else if (gameOver) startGame();
    else dropBird();
  }
  if (e.code === 'ArrowLeft') {
    e.preventDefault();
    targetX -= 22;
  }
  if (e.code === 'ArrowRight') {
    e.preventDefault();
    targetX += 22;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    togglePause();
  }
});

setupEvolutionList();
if (!muted) sounds.title.play().catch(() => {});
loop();
