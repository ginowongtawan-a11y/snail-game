const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const GROUND_Y = H - 40;

// ---------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------
const scoreEl = document.getElementById('score');
const timeEl = document.getElementById('time');
const livesEl = document.getElementById('lives');
const muteBtn = document.getElementById('mute-btn');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const endScreen = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endReason = document.getElementById('end-reason');
const finalScoreEl = document.getElementById('final-score');
const wrapper = document.getElementById('game-wrapper');

// ---------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------
let gameRunning = false;
let gameOverPermanent = false; // true once lives reach 0 (no replay without reload)
let score = 0;
let timeLeft = 60;
let lives = 3;
let gameSpeed = 5;              // scroll / obstacle speed, ramps up over time
let elapsedFrames = 0;

let obstacleTimerId = null;
let gameTimerId = null;
let invulnerable = false;       // brief invulnerability after getting hit

// Parallax background offsets
let bgFar = 0;
let bgNear = 0;
let groundOffset = 0;

// ---------------------------------------------------------------------
// Player: Turbo the Snail
// ---------------------------------------------------------------------
const GRAVITY = 0.9;
const JUMP_FORCE = -14.5;

const player = {
  x: 80,
  y: GROUND_Y - 34,
  width: 46,
  height: 34,
  vy: 0,
  onGround: true,
  legAnim: 0,
};

function jump() {
  if (!gameRunning) return;
  if (player.onGround) {
    player.vy = JUMP_FORCE;
    player.onGround = false;
    playJumpSound();
  }
}

// ---------------------------------------------------------------------
// Obstacles
// ---------------------------------------------------------------------
const OBSTACLE_TYPES = ['cone', 'sign', 'rock'];
let obstacles = [];

function spawnObstacle() {
  const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
  let w, h;
  if (type === 'cone') { w = 24; h = 34; }
  else if (type === 'sign') { w = 30; h = 42; }
  else { w = 34; h = 26; }

  obstacles.push({
    x: W + 20,
    y: GROUND_Y - h,
    width: w,
    height: h,
    type,
  });
}

/* =========================================================================
   FUNCTION 1: การสุ่มเวลาของอุปสรรคที่จะออกมาในแต่ละครั้ง
   - อุปสรรคแต่ละตัวจะออกมาในช่วงเวลาที่ "สุ่ม" และไม่เท่ากันเสมอ
   - ยิ่งเวลาผ่านไปเกมจะยากขึ้นเล็กน้อย (ช่วงเวลาสุ่มจะแคบลง)
   ========================================================================= */
function scheduleNextObstacle() {
  if (!gameRunning) return;

  spawnObstacle();

  // ช่วงเวลาสุ่มจะลดลงตามเวลาที่ผ่านไป เพื่อเพิ่มความยากขึ้นเรื่อย ๆ
  const difficultyFactor = Math.min(elapsedFrames / (60 * 60), 1); // 0 -> 1 over ~60s
  const minDelay = 1400 - difficultyFactor * 500;   // 1400ms -> 900ms
  const maxDelay = 3000 - difficultyFactor * 1200;  // 3000ms -> 1800ms

  const randomDelay = Math.random() * (maxDelay - minDelay) + minDelay;

  obstacleTimerId = setTimeout(scheduleNextObstacle, randomDelay);
}

/* =========================================================================
   FUNCTION 2: เงื่อนไขการจับเวลา (60 วินาที)
   - นับถอยหลังทีละ 1 วินาที เมื่อครบ 60 วินาที ให้ยุติเกมและสรุปคะแนน
   ========================================================================= */
function startGameTimer() {
  timeLeft = 60;
  timeEl.textContent = timeLeft;

  gameTimerId = setInterval(() => {
    if (!gameRunning) return;
    timeLeft--;
    timeEl.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(gameTimerId);
      endGame('time');
    }
  }, 1000);
}

/* =========================================================================
   FUNCTION 3: การนับจำนวนชีวิตในเกม (3 ชีวิต)
   - ชนอุปสรรค 1 ครั้ง เสีย 1 ชีวิต
   - เมื่อชีวิตหมด (0) เกมจะจบถาวร ต้องเปิดไฟล์ใหม่ (รีเฟรชหน้า) ถึงจะเล่นได้อีก
   ========================================================================= */
function loseLife() {
  if (invulnerable || !gameRunning) return;

  lives--;
  updateLivesUI();
  playCollisionSound();
  flashHit();

  if (lives <= 0) {
    endGame('lives');
    return;
  }

  // ให้เวลาผู้เล่นตั้งตัวหลังโดนชน (กันโดนซ้ำทันที)
  invulnerable = true;
  setTimeout(() => { invulnerable = false; }, 1200);
}

function updateLivesUI() {
  const hearts = ['❤', '❤', '❤'];
  livesEl.innerHTML = hearts
    .map((h, i) => `<span class="heart" style="opacity:${i < lives ? 1 : 0.2}">${h}</span>`)
    .join('');
}

function flashHit() {
  wrapper.classList.remove('hit-flash');
  void wrapper.offsetWidth; // reflow to restart animation
  wrapper.classList.add('hit-flash');
}

// ---------------------------------------------------------------------
// End game / permanent lock (part of Function 3's requirement)
// ---------------------------------------------------------------------
function endGame(reason) {
  gameRunning = false;
  clearTimeout(obstacleTimerId);
  clearInterval(gameTimerId);
  stopBackgroundMusic();

  if (reason === 'lives') {
    gameOverPermanent = true;
    endTitle.textContent = '💥 หมดชีวิตแล้ว!';
    endReason.textContent = 'คุณใช้ครบ 3 ชีวิตแล้ว ไม่สามารถเล่นซ้ำได้จนกว่าจะเปิดไฟล์ใหม่ (รีเฟรชหน้าเว็บ)';
  } else {
    gameOverPermanent = true; // single playthrough per page load
    endTitle.textContent = '⏰ หมดเวลา!';
    endReason.textContent = 'ครบ 60 วินาทีแล้ว นี่คือสรุปผลคะแนนของคุณ';
  }

  finalScoreEl.textContent = Math.floor(score);
  endScreen.classList.remove('hidden');
}

// ---------------------------------------------------------------------
// FUNCTION 4: Sound — background music + sound effects (Web Audio API)
// ไม่ต้องพึ่งไฟล์เสียงภายนอก ใช้การสังเคราะห์เสียงสดในเบราว์เซอร์
// ---------------------------------------------------------------------
let audioCtx = null;
let muted = false;
let bgMusicNodes = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone({ freq = 440, type = 'sine', duration = 0.15, volume = 0.2, glideTo = null }) {
  if (muted || !audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  if (glideTo) {
    osc.frequency.exponentialRampToValueAtTime(glideTo, audioCtx.currentTime + duration);
  }
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

function playJumpSound() {
  playTone({ freq: 300, glideTo: 700, type: 'square', duration: 0.18, volume: 0.15 });
}

function playCollisionSound() {
  playTone({ freq: 180, glideTo: 40, type: 'sawtooth', duration: 0.3, volume: 0.25 });
}

function startBackgroundMusic() {
  if (muted || !audioCtx) return;
  stopBackgroundMusic();

  // Simple looping ambient arpeggio using two detuned oscillators + LFO filter
  const master = audioCtx.createGain();
  master.gain.value = 0.05;
  master.connect(audioCtx.destination);

  const notes = [261.63, 329.63, 392.0, 329.63]; // C E G E arpeggio loop
  let noteIndex = 0;

  const intervalId = setInterval(() => {
    if (muted) return;
    const freq = notes[noteIndex % notes.length];
    noteIndex++;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  }, 350);

  bgMusicNodes = { master, intervalId };
}

function stopBackgroundMusic() {
  if (bgMusicNodes) {
    clearInterval(bgMusicNodes.intervalId);
    bgMusicNodes.master.disconnect();
    bgMusicNodes = null;
  }
}

function toggleMute() {
  muted = !muted;
  muteBtn.textContent = muted ? '🔇' : '🔊';
  if (muted) stopBackgroundMusic();
  else if (gameRunning) startBackgroundMusic();
}

// ---------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------
function drawBackground() {
  // sky gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#8fd6ff');
  grad.addColorStop(1, '#d9f4ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // far mountains (slow parallax)
  ctx.fillStyle = '#a9d6c2';
  for (let i = -1; i < 4; i++) {
    const baseX = (i * 260 - bgFar) % (260 * 4);
    ctx.beginPath();
    ctx.moveTo(baseX, GROUND_Y);
    ctx.lineTo(baseX + 130, GROUND_Y - 90);
    ctx.lineTo(baseX + 260, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }

  // near hills (faster parallax)
  ctx.fillStyle = '#7ec98f';
  for (let i = -1; i < 5; i++) {
    const baseX = (i * 180 - bgNear) % (180 * 5);
    ctx.beginPath();
    ctx.arc(baseX + 90, GROUND_Y + 10, 60, Math.PI, 0);
    ctx.fill();
  }

  // clouds
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 3; i++) {
    const cx = ((i * 300 - bgFar * 0.5) % (W + 200)) - 100;
    drawCloud(cx, 40 + i * 20);
  }
}

function drawCloud(x, y) {
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.arc(x + 16, y - 6, 16, 0, Math.PI * 2);
  ctx.arc(x + 32, y, 14, 0, Math.PI * 2);
  ctx.fill();
}

function drawGround() {
  ctx.fillStyle = '#c98b4b';
  ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  ctx.strokeStyle = '#a86a30';
  ctx.lineWidth = 3;
  for (let i = -1; i < W / 40 + 1; i++) {
    const x = (i * 40 - groundOffset % 40);
    ctx.beginPath();
    ctx.moveTo(x, GROUND_Y);
    ctx.lineTo(x - 10, H);
    ctx.stroke();
  }
}

// Turbo the racing snail, drawn with canvas primitives
function drawPlayer() {
  const { x, y, width, height } = player;
  ctx.save();
  // เลื่อนไปจุดขวาของตัวละครแล้วกลับด้านซ้าย-ขวา
  // เพื่อให้หัว/ก้านตา (ซึ่งวาดไว้ฝั่งซ้ายของโค้ด) หันไปทาง "ขวา" ตามทิศทางที่วิ่ง
  ctx.translate(x + width, y);
  ctx.scale(-1, 1);

  // shell
  ctx.fillStyle = '#ff8a3d';
  ctx.beginPath();
  ctx.ellipse(width * 0.55, height * 0.35, width * 0.35, height * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c9601a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(width * 0.55, height * 0.35, width * 0.18, 0, Math.PI * 2);
  ctx.stroke();

  // body
  ctx.fillStyle = '#8fd694';
  ctx.beginPath();
  ctx.moveTo(2, height);
  ctx.quadraticCurveTo(0, height * 0.55, width * 0.25, height * 0.5);
  ctx.quadraticCurveTo(width * 0.45, height * 0.35, width * 0.75, height * 0.55);
  ctx.quadraticCurveTo(width, height * 0.6, width, height);
  ctx.closePath();
  ctx.fill();

  // eye stalks
  const bob = player.onGround ? Math.sin(player.legAnim) * 2 : 0;
  ctx.strokeStyle = '#4f9d55';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(width * 0.18, height * 0.5);
  ctx.lineTo(width * 0.1, height * 0.15 + bob);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(width * 0.1, height * 0.15 + bob, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(width * 0.1, height * 0.15 + bob, 2, 0, Math.PI * 2);
  ctx.fill();

  // turbo speed lines when running
  if (player.onGround) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const off = (player.legAnim * 20 + i * 14) % 40;
      ctx.beginPath();
      ctx.moveTo(-off, height * 0.8);
      ctx.lineTo(-off - 10, height * 0.8);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawObstacle(o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.type === 'cone') {
    ctx.fillStyle = '#ff5b35';
    ctx.beginPath();
    ctx.moveTo(o.width / 2, 0);
    ctx.lineTo(o.width, o.height);
    ctx.lineTo(0, o.height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(o.width * 0.15, o.height * 0.6, o.width * 0.7, 4);
  } else if (o.type === 'sign') {
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(o.width / 2, o.height);
    ctx.lineTo(o.width / 2, o.height * 0.35);
    ctx.stroke();
    ctx.fillStyle = '#e33';
    ctx.beginPath();
    ctx.arc(o.width / 2, o.height * 0.3, o.width * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('STOP', o.width / 2, o.height * 0.34);
  } else {
    ctx.fillStyle = '#8a8a8a';
    ctx.beginPath();
    ctx.moveTo(0, o.height);
    ctx.lineTo(o.width * 0.2, o.height * 0.3);
    ctx.lineTo(o.width * 0.5, 0);
    ctx.lineTo(o.width * 0.85, o.height * 0.4);
    ctx.lineTo(o.width, o.height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
// Physics / collision
// ---------------------------------------------------------------------
function updatePlayer() {
  player.vy += GRAVITY;
  player.y += player.vy;

  const groundLevel = GROUND_Y - player.height;
  if (player.y >= groundLevel) {
    player.y = groundLevel;
    player.vy = 0;
    player.onGround = true;
  }

  if (player.onGround) player.legAnim += 0.3;
}

function updateObstacles() {
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.x -= gameSpeed;

    if (checkCollision(player, o) && !invulnerable) {
      loseLife();
      obstacles.splice(i, 1);
      continue;
    }

    if (o.x + o.width < 0) {
      obstacles.splice(i, 1);
      score += 10; // bonus for clearing an obstacle
    }
  }
}

function checkCollision(p, o) {
  const pad = 8; // forgiving hitbox
  return (
    p.x + pad < o.x + o.width &&
    p.x + p.width - pad > o.x &&
    p.y + pad < o.y + o.height &&
    p.y + p.height - pad > o.y
  );
}

// ---------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------
function gameLoop() {
  if (!gameRunning) return;

  elapsedFrames++;
  gameSpeed = 5 + Math.min(elapsedFrames / 600, 4); // ramps 5 -> 9
  bgFar += gameSpeed * 0.15;
  bgNear += gameSpeed * 0.4;
  groundOffset += gameSpeed;
  score += 0.12 * (gameSpeed / 5);

  updatePlayer();
  updateObstacles();

  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawGround();
  obstacles.forEach(drawObstacle);
  drawPlayer();

  scoreEl.textContent = Math.floor(score);

  requestAnimationFrame(gameLoop);
}

// ---------------------------------------------------------------------
// Game bootstrap / controls
// ---------------------------------------------------------------------
function resetState() {
  score = 0;
  lives = 3;
  timeLeft = 60;
  elapsedFrames = 0;
  gameSpeed = 5;
  obstacles = [];
  player.y = GROUND_Y - player.height;
  player.vy = 0;
  player.onGround = true;
  invulnerable = false;
  updateLivesUI();
  scoreEl.textContent = 0;
  timeEl.textContent = 60;
}

function startGame() {
  if (gameOverPermanent) return; // ล็อกเล่นซ้ำจนกว่าจะรีเฟรชหน้า
  initAudio();
  resetState();
  gameRunning = true;
  startScreen.classList.add('hidden');
  endScreen.classList.add('hidden');

  startBackgroundMusic();
  scheduleNextObstacle(); // FUNCTION 1
  startGameTimer();       // FUNCTION 2
  requestAnimationFrame(gameLoop);
}

// ---------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------
startBtn.addEventListener('click', startGame);
muteBtn.addEventListener('click', toggleMute);

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    jump();
  }
});
canvas.addEventListener('mousedown', jump);
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); jump(); }, { passive: false });

updateLivesUI();