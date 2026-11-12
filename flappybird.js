"use strict";

// ---------- config ----------
const W = 360, H = 640;
const GROUND_H = 80, GROUND_Y = H - GROUND_H;
const STEP = 1000 / 60; // fixed physics step

const BIRD_W = 34, BIRD_H = 24;
const GRAVITY = 0.38, FLAP = -6.6, MAX_FALL = 9;
const PIPE_W = 64, PIPE_H = 512;
const GAP_START = 175, GAP_MIN = 135;
const SPEED_START = 2.1, SPEED_MAX = 3.4;
const PIPE_SPACING = 210;

// ---------- state ----------
let canvas, ctx, dpr = 1;
let birdImg, topImg, botImg, bgImg;
let state = "ready"; // ready | playing | paused | dead
let bird, pipes, particles, popups, clouds, weatherParts;
let score, best, newBest, speed, groundX, bgX, shake, flash, deadAt, frame;
let weather = "none", weatherTimer = 0;
let audioCtx, muted = false;

try { best = parseInt(localStorage.getItem("highScore"), 10) || 0; } catch (e) { best = 0; }
try { muted = localStorage.getItem("muted") === "1"; } catch (e) {}

// ---------- audio ----------
function ac() {
  if (!audioCtx) {
    const A = window.AudioContext || window.webkitAudioContext;
    if (A) audioCtx = new A();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
function tone(freq, dur, type = "square", vol = 0.08, slideTo = null, delay = 0) {
  if (muted) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dur);
}
const sfx = {
  flap: () => tone(380, 0.12, "triangle", 0.12, 720),
  score: () => { tone(880, 0.09, "square", 0.06); tone(1320, 0.14, "square", 0.06, null, 0.08); },
  hit: () => {
    tone(160, 0.18, "sawtooth", 0.14, 60);
    if (!muted) {
      const s = document.getElementById("gameOverSound");
      s.currentTime = 0; s.play().catch(() => {});
    }
  },
  medal: () => [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.15, "triangle", 0.08, null, i * 0.09)),
};

// ---------- setup ----------
function load(src) {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(i); i.src = src; });
}

window.addEventListener("load", async () => {
  canvas = document.getElementById("board");
  ctx = canvas.getContext("2d");
  [birdImg, topImg, botImg, bgImg] = await Promise.all([
    load("flappybird.png"), load("toppipe.png"), load("bottompipe.png"), load("flappybirdbg.png"),
  ]);
  clouds = Array.from({ length: 5 }, (_, i) => ({
    x: Math.random() * W, y: 40 + Math.random() * 260, s: 0.6 + Math.random() * 0.9, v: 0.1 + Math.random() * 0.2,
  }));
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  bindInput();
  reset("ready");
  let last = performance.now(), acc = 0;
  (function loop(now) {
    acc += Math.min(now - last, 100); last = now;
    while (acc >= STEP) { tick(); acc -= STEP; }
    draw(acc / STEP);
    requestAnimationFrame(loop);
  })(last);
});

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
}

function reset(next) {
  bird = { x: W / 3.2, y: H / 2 - 30, vy: 0, rot: 0, flapAnim: 0 };
  pipes = []; particles = []; popups = []; weatherParts = [];
  score = 0; newBest = false; speed = SPEED_START; shake = 0; flash = 0; frame = 0;
  groundX = 0; bgX = 0; deadAt = 0; weather = "none"; weatherTimer = 0;
  state = next;
}

// ---------- input ----------
function bindInput() {
  const action = (e) => {
    if (e && e.cancelable) e.preventDefault();
    ac();
    if (state === "ready") { state = "playing"; spawnPipe(W + 40); flap(); }
    else if (state === "playing") flap();
    else if (state === "dead" && performance.now() - deadAt > 600) reset("ready");
    else if (state === "paused") state = "playing";
  };
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (["Space", "ArrowUp", "KeyW", "KeyX", "Enter"].includes(e.code)) action(e);
    else if (e.code === "KeyP" || e.code === "Escape") togglePause();
    else if (e.code === "KeyM") { muted = !muted; try { localStorage.setItem("muted", muted ? "1" : "0"); } catch (_) {} }
  });
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (x > W - 46 && x < W - 8 && y > 8 && y < 46) { // top-right buttons
      if (state === "playing" || state === "paused") togglePause();
      return;
    }
    if (x > W - 90 && x < W - 52 && y > 8 && y < 46) {
      muted = !muted; try { localStorage.setItem("muted", muted ? "1" : "0"); } catch (_) {}
      return;
    }
    action(e);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && state === "playing") state = "paused"; });
  window.addEventListener("blur", () => { if (state === "playing") state = "paused"; });
}
function togglePause() {
  if (state === "playing") state = "paused";
  else if (state === "paused") state = "playing";
}
function flap() {
  bird.vy = FLAP; bird.flapAnim = 1;
  sfx.flap();
  for (let i = 0; i < 4; i++) particles.push({ x: bird.x + 4, y: bird.y + BIRD_H / 2, vx: -1.5 - Math.random() * 1.5, vy: Math.random() * 1.5 - 0.3, life: 18, max: 18, r: 2 + Math.random() * 2, c: "255,255,255" });
}

// ---------- game logic ----------
function currentGap() { return Math.max(GAP_MIN, GAP_START - score * 2.5); }

function spawnPipe(x) {
  const gap = currentGap();
  const margin = 70;
  const top = margin + Math.random() * (GROUND_Y - gap - margin * 2);
  pipes.push({ x, top, gap, passed: false, drift: score > 8 ? (Math.random() - 0.5) * 0.5 : 0, t: Math.random() * 6 });
}

function tick() {
  frame++;
  updateAmbient();
  if (state === "paused") return;

  // particles always update
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life--; }
  particles = particles.filter((p) => p.life > 0);
  for (const p of popups) { p.y -= 0.8; p.life--; }
  popups = popups.filter((p) => p.life > 0);
  if (shake > 0) shake *= 0.88; if (shake < 0.3) shake = 0;
  if (flash > 0) flash -= 0.06;

  if (state === "ready") {
    bird.y = H / 2 - 30 + Math.sin(frame / 14) * 8;
    bird.rot = Math.sin(frame / 14) * 0.1;
    groundX = (groundX - speed) % 24;
    return;
  }

  if (state === "dead") {
    bird.vy = Math.min(bird.vy + GRAVITY * 1.3, 12);
    bird.y = Math.min(bird.y + bird.vy, GROUND_Y - BIRD_H / 2);
    bird.rot = Math.min(bird.rot + 0.12, Math.PI / 2);
    return;
  }

  // playing
  speed = Math.min(SPEED_MAX, SPEED_START + score * 0.05);
  groundX = (groundX - speed) % 24;
  bgX = (bgX - speed * 0.2) % W;

  bird.vy = Math.min(bird.vy + GRAVITY, MAX_FALL);
  bird.y += bird.vy;
  bird.flapAnim = Math.max(0, bird.flapAnim - 0.08);
  const target = Math.max(-0.45, Math.min(bird.vy / 9, 1.2));
  bird.rot += (target - bird.rot) * 0.18;
  if (bird.y < 0) { bird.y = 0; bird.vy = 0; }

  for (const p of pipes) {
    p.x -= speed;
    if (p.drift) { p.t += 0.03; p.top = Math.max(50, Math.min(GROUND_Y - p.gap - 50, p.top + Math.sin(p.t) * p.drift)); }
    if (!p.passed && p.x + PIPE_W < bird.x) {
      p.passed = true; score++;
      sfx.score();
      popups.push({ x: bird.x + 20, y: bird.y - 10, life: 40, text: "+1" });
      if (score > 0 && score % 10 === 0) { sfx.medal(); popups.push({ x: W / 2, y: H / 3, life: 70, text: score + "!", big: true }); }
      if (score > best) { best = score; newBest = true; try { localStorage.setItem("highScore", best); } catch (_) {} }
    }
  }
  pipes = pipes.filter((p) => p.x > -PIPE_W - 10);
  const lastX = pipes.length ? pipes[pipes.length - 1].x : -999;
  if (lastX < W - PIPE_SPACING - (speed - SPEED_START) * 20) spawnPipe(W + 10);

  // collision (slightly forgiving elliptical-ish hitbox)
  const bx = bird.x + 5, by = bird.y + 4, bw = BIRD_W - 10, bh = BIRD_H - 8;
  let hit = bird.y + BIRD_H >= GROUND_Y;
  for (const p of pipes) {
    if (bx + bw > p.x && bx < p.x + PIPE_W && (by < p.top || by + bh > p.top + p.gap)) hit = true;
  }
  if (hit) die();
}

function die() {
  state = "dead"; deadAt = performance.now();
  shake = 10; flash = 1;
  sfx.hit();
  bird.vy = -3;
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
    particles.push({ x: bird.x + BIRD_W / 2, y: bird.y + BIRD_H / 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 35, max: 35, r: 2 + Math.random() * 3, c: i % 2 ? "255,214,64" : "255,255,255" });
  }
}

function updateAmbient() {
  for (const c of clouds) { c.x -= c.v * (state === "paused" ? 0 : 1); if (c.x < -100) c.x = W + 60; }
  if (state === "paused") return;
  weatherTimer--;
  if (weatherTimer <= 0) {
    weatherTimer = 600 + Math.random() * 600;
    weather = ["none", "none", "rain", "snow"][Math.floor(Math.random() * 4)];
  }
  if (weather !== "none" && weatherParts.length < 90 && Math.random() < 0.6) {
    weatherParts.push(weather === "rain"
      ? { x: Math.random() * (W + 60), y: -10, vx: -2, vy: 11 + Math.random() * 4 }
      : { x: Math.random() * W, y: -10, vx: Math.random() - 0.5, vy: 1 + Math.random() * 1.5, p: Math.random() * 6 });
  }
  for (const p of weatherParts) { p.x += p.vx + (p.p !== undefined ? Math.sin(frame / 30 + p.p) * 0.4 : 0); p.y += p.vy; }
  weatherParts = weatherParts.filter((p) => p.y < GROUND_Y);
  if (weather === "none" && weatherParts.length) weatherParts.length = Math.max(0, weatherParts.length - 1);
}

// ---------- rendering ----------
function draw() {
  const s = canvas.width / W;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  drawBackground();
  for (const p of pipes) drawPipe(p);
  drawGround();
  drawWeather();
  drawParticles();
  drawBird();
  for (const p of popups) {
    ctx.globalAlpha = Math.min(1, p.life / 25);
    text(p.text, p.x, p.y, p.big ? 56 : 22, "center", "#ffd740");
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.8})`; ctx.fillRect(0, 0, W, H); }
  drawHUD();
}

function drawBackground() {
  // sky gradient (always fills, so scaled bg image just adds detail)
  const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  g.addColorStop(0, "#4ec0ca"); g.addColorStop(1, "#bfeaf0");
  ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
  if (bgImg && bgImg.naturalWidth) {
    const iw = bgImg.naturalWidth * (H / bgImg.naturalHeight), x = bgX % iw;
    ctx.globalAlpha = 0.9;
    for (let ox = x - iw; ox < W; ox += iw) ctx.drawImage(bgImg, ox, 0, iw + 1, H);
    ctx.globalAlpha = 1;
  }
  for (const c of clouds) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    const r = 16 * c.s;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, 7); ctx.arc(c.x + r, c.y - r * 0.4, r * 1.2, 0, 7); ctx.arc(c.x + r * 2, c.y, r, 0, 7);
    ctx.fill();
  }
  if (weather === "rain") { ctx.fillStyle = "rgba(40,60,90,0.18)"; ctx.fillRect(0, 0, W, H); }
}

function drawPipe(p) {
  ctx.drawImage(topImg, p.x, p.top - PIPE_H, PIPE_W, PIPE_H);
  ctx.drawImage(botImg, p.x, p.top + p.gap, PIPE_W, PIPE_H);
}

function drawGround() {
  ctx.fillStyle = "#ded895"; ctx.fillRect(-10, GROUND_Y, W + 20, GROUND_H + 20);
  ctx.fillStyle = "#73bf2e"; ctx.fillRect(0, GROUND_Y, W, 14);
  ctx.fillStyle = "#528a1f"; ctx.fillRect(0, GROUND_Y + 14, W, 3);
  ctx.fillStyle = "#9be04a";
  for (let x = groundX - 24; x < W + 24; x += 24) {
    ctx.beginPath(); ctx.moveTo(x, GROUND_Y + 14); ctx.lineTo(x + 12, GROUND_Y + 14); ctx.lineTo(x + 24, GROUND_Y); ctx.lineTo(x + 12, GROUND_Y); ctx.fill();
  }
  ctx.fillStyle = "#c9c27a"; ctx.fillRect(0, GROUND_Y + 17, W, 2);
}

function drawBird() {
  ctx.save();
  ctx.translate(bird.x + BIRD_W / 2, bird.y + BIRD_H / 2);
  ctx.rotate(bird.rot);
  const sq = 1 + bird.flapAnim * 0.18;
  ctx.scale(1 / sq, sq);
  ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
  ctx.drawImage(birdImg, -BIRD_W / 2, -BIRD_H / 2, BIRD_W, BIRD_H);
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.fillStyle = `rgba(${p.c},${p.life / p.max})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
}

function drawWeather() {
  if (!weatherParts.length) return;
  if (weather === "rain") {
    ctx.strokeStyle = "rgba(200,220,255,0.6)"; ctx.lineWidth = 1.2; ctx.beginPath();
    for (const p of weatherParts) { ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.vx * 1.5, p.y + 9); }
    ctx.stroke();
  } else {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (const p of weatherParts) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, 7); ctx.fill(); }
  }
}

function text(str, x, y, size, align = "left", color = "#fff") {
  ctx.font = `bold ${size}px "Trebuchet MS", system-ui, sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round"; ctx.lineWidth = Math.max(3, size / 7);
  ctx.strokeStyle = "#2b2b2b"; ctx.strokeText(str, x, y);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

function panel(x, y, w, h) {
  ctx.fillStyle = "#ded895"; ctx.strokeStyle = "#543847"; ctx.lineWidth = 4;
  roundRect(x, y, w, h, 10); ctx.fill(); ctx.stroke();
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function medalFor(n) { return n >= 40 ? ["Platinum", "#e5f4ff"] : n >= 30 ? ["Gold", "#ffd740"] : n >= 20 ? ["Silver", "#d0d5da"] : n >= 10 ? ["Bronze", "#cd7f32"] : null; }

function drawHUD() {
  if (state === "playing" || state === "paused") text(String(score), W / 2, 90, 64, "center");
  if (state !== "ready") {
    // buttons
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(W - 46, 8, 38, 38, 8); ctx.fill(); roundRect(W - 90, 8, 38, 38, 8); ctx.fill();
    ctx.fillStyle = "#fff";
    if (state === "paused") { ctx.beginPath(); ctx.moveTo(W - 34, 17); ctx.lineTo(W - 34, 37); ctx.lineTo(W - 18, 27); ctx.fill(); }
    else { ctx.fillRect(W - 35, 17, 5, 20); ctx.fillRect(W - 24, 17, 5, 20); }
    text(muted ? "✕" : "♪", W - 71, 36, 22, "center");
  }

  if (state === "ready") {
    text("FLAPPY BIRD", W / 2, 150, 44, "center", "#ffb300");
    text("Tap, click or press Space", W / 2, 380, 20, "center");
    text("to flap", W / 2, 406, 20, "center");
    if (best) text("Best: " + best, W / 2, 450, 22, "center", "#ffd740");
    text("P pause · M mute", W / 2, GROUND_Y + 50, 14, "center", "#fff");
  } else if (state === "paused") {
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);
    text("PAUSED", W / 2, H / 2, 48, "center");
    text("Tap or press P to resume", W / 2, H / 2 + 36, 18, "center");
  } else if (state === "dead") {
    const t = Math.min(1, (performance.now() - deadAt) / 400);
    ctx.globalAlpha = t;
    text("GAME OVER", W / 2, 170 - (1 - t) * 20, 44, "center", "#ff7043");
    panel(50, 210 + (1 - t) * 20, W - 100, 170);
    ctx.fillStyle = "#c26a3a"; ctx.font = 'bold 14px "Trebuchet MS", sans-serif'; ctx.textAlign = "left";
    ctx.fillText("SCORE", 70, 245 + (1 - t) * 20); ctx.fillText("BEST", 70, 305 + (1 - t) * 20);
    ctx.textAlign = "right"; ctx.fillText("MEDAL", W - 70, 245 + (1 - t) * 20);
    text(String(score), 70 + 20, 280 + (1 - t) * 20, 34, "left");
    text(String(best), 70 + 20, 340 + (1 - t) * 20, 34, "left", newBest ? "#ffd740" : "#fff");
    const m = medalFor(score);
    if (m) {
      ctx.fillStyle = m[1]; ctx.strokeStyle = "#543847"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(W - 105, 285 + (1 - t) * 20, 24, 0, 7); ctx.fill(); ctx.stroke();
      text(m[0], W - 105, 335 + (1 - t) * 20, 14, "center");
    } else {
      ctx.fillStyle = "#b8b17a"; ctx.beginPath(); ctx.arc(W - 105, 285 + (1 - t) * 20, 24, 0, 7); ctx.fill();
    }
    if (newBest && score > 0) text("NEW", W / 2 + 30, 300 + (1 - t) * 20, 16, "left", "#ff5252");
    ctx.globalAlpha = 1;
    if (performance.now() - deadAt > 600 && Math.floor(performance.now() / 500) % 2 === 0)
      text("Tap to play again", W / 2, 440, 22, "center");
  }
}
