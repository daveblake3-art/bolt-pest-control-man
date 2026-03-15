// ═══════════════════════════════════════════════════════════
// BOLT PEST CONTROL MAN — SMB3-Style Platformer
// ═══════════════════════════════════════════════════════════

(function() {
'use strict';

// ── Constants ──────────────────────────────────────────────
const TILE = 16;
const GRAVITY = 0.48;
const MAX_FALL = 8;
const WALK_SPEED = 1.8;
const RUN_SPEED = 3.2;
const WALK_ACCEL = 0.12;
const RUN_ACCEL = 0.18;
const FRICTION = 0.82;
const JUMP_FORCE = -9.5;
const STOMP_BOUNCE = -5;
const SPRAY_SPEED = 5;
const INVULN_TIME = 90;

const SCREEN_W = 256;
const SCREEN_H = 240;

// Tile IDs
const T = {
  AIR: 0, GROUND: 1, BRICK: 2, QUESTION: 3, PIPE_TL: 4, PIPE_TR: 5,
  PIPE_BL: 6, PIPE_BR: 7, USED: 8, CLOUD: 9, HILL: 10, BUSH: 11,
  PLATFORM: 12, SPIKE: 13, FLAG_POLE: 14, FLAG_TOP: 15,
  DECO_1: 16, DECO_2: 17
};

// Enemy types
const E = { ROACH: 0, SPIDER: 1, ANT: 2, BEETLE: 3, FLY: 4 };

// Power-up types
const P = { HARDHAT: 0, SPRAY: 1, BOOTS: 2 };

// Game states
const STATE = { TITLE: 0, PLAYING: 1, DYING: 2, GAMEOVER: 3, WIN: 4, LEVELTRANS: 5 };

// ── Canvas Setup ───────────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = SCREEN_W;
canvas.height = SCREEN_H;

function resizeCanvas() {
  const wrapper = document.getElementById('game-wrapper');
  const ww = wrapper.clientWidth;
  const wh = wrapper.clientHeight;
  const touchH = isTouchDevice ? 180 : 0;
  const availH = wh - touchH;
  const aspect = SCREEN_W / SCREEN_H;
  let cw, ch;
  if (ww / availH > aspect) {
    ch = availH;
    cw = ch * aspect;
  } else {
    cw = ww;
    ch = cw / aspect;
  }
  canvas.style.width = Math.floor(cw) + 'px';
  canvas.style.height = Math.floor(ch) + 'px';
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 50);

// ── Color Palette (NES-inspired) ───────────────────────────
const PAL = {
  sky: '#5c94fc',       skyDark: '#3c4ca0',
  ground: '#c84c0c',    groundDark: '#a0380c',
  brick: '#d87c34',     brickDark: '#a0580c',
  question: '#fcbc3c',  questionDark: '#c89c00',
  pipe: '#30a030',      pipeDark: '#1c6c1c',
  used: '#888888',
  white: '#fcfcfc',     black: '#000000',
  skin: '#fcb898',      uniform: '#2038ec',
  uniformDark: '#0018b0', belt: '#fcbc3c',
  green: '#30a030',     red: '#e44040',
  brown: '#8c5010',     darkBrown: '#5c3400',
  cloud: '#fcfcfc',     cloudShade: '#d0d0f0',
  hillGreen: '#50b050', hillDark: '#308030',
  bushGreen: '#40a840', bushDark: '#287028',
  flagRed: '#e44040',
  roachBrown: '#6c3800', spiderGray: '#404040',
  antRed: '#c83030',    beetleGreen: '#207020',
  flyPurple: '#8040c0',
  hardhatYellow: '#fcbc3c', sprayCan: '#40a0fc',
  bootsRed: '#e44040',
  coinGold: '#fcbc3c',  coinShine: '#fce8a0',
  platform: '#8080c0',
  textShadow: '#202020'
};

// ── Audio Engine (Web Audio API procedural SFX) ────────────
let audioCtx = null;
let musicEnabled = true;
let sfxEnabled = true;

function initAudio() {
  if (audioCtx) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch(e) {}
}

function playTone(freq, dur, type, vol, slide) {
  if (!audioCtx || !sfxEnabled) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    if (slide) osc.frequency.linearRampToValueAtTime(slide, audioCtx.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch(e) {}
}

function sfxJump() { playTone(300, 0.15, 'square', 0.12, 600); }
function sfxStomp() { playTone(200, 0.2, 'square', 0.15, 80); }
function sfxPowerup() {
  playTone(520, 0.1, 'square', 0.12);
  setTimeout(() => playTone(660, 0.1, 'square', 0.12), 100);
  setTimeout(() => playTone(780, 0.15, 'square', 0.12), 200);
}
function sfxCoin() { playTone(988, 0.06, 'square', 0.1); setTimeout(() => playTone(1319, 0.12, 'square', 0.1), 60); }
function sfxHurt() { playTone(200, 0.3, 'sawtooth', 0.15, 80); }
function sfxDie() { playTone(400, 0.15, 'square', 0.15, 100); setTimeout(() => playTone(200, 0.4, 'sawtooth', 0.15, 50), 150); }
function sfxSpray() { playTone(800, 0.1, 'sawtooth', 0.08, 200); }
function sfxBrick() { playTone(140, 0.08, 'triangle', 0.15); }
function sfxFlagpole() {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'square', 0.1), i * 150));
}

// ── Input System ───────────────────────────────────────────
const keys = {};
const justPressed = {};

document.addEventListener('keydown', e => {
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;
  e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.code] = false; e.preventDefault(); });

function clearJustPressed() { for (const k in justPressed) delete justPressed[k]; }

// Touch controls
const touchState = { left: false, right: false, up: false, jump: false, run: false };
const touchJustPressed = { jump: false, run: false };
let isTouchDevice = false;

function setupTouch() {
  const tc = document.getElementById('touch-controls');
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    isTouchDevice = true;
    tc.style.display = 'block';
  }

  function bind(id, key) {
    const el = document.getElementById(id);
    const onDown = (e) => { e.preventDefault(); touchState[key] = true; if (key === 'jump' || key === 'run') touchJustPressed[key] = true; el.classList.add('active'); initAudio(); };
    const onUp = (e) => { e.preventDefault(); touchState[key] = false; el.classList.remove('active'); };
    el.addEventListener('touchstart', onDown, { passive: false });
    el.addEventListener('touchend', onUp, { passive: false });
    el.addEventListener('touchcancel', onUp, { passive: false });
    el.addEventListener('mousedown', onDown);
    el.addEventListener('mouseup', onUp);
    el.addEventListener('mouseleave', onUp);
  }

  bind('btn-left', 'left');
  bind('btn-right', 'right');
  bind('btn-up', 'up');
  bind('btn-jump', 'jump');
  bind('btn-run', 'run');
}

function isLeft() { return keys['ArrowLeft'] || keys['KeyA'] || touchState.left; }
function isRight() { return keys['ArrowRight'] || keys['KeyD'] || touchState.right; }
function isJump() { return keys['Space'] || keys['KeyZ'] || keys['ArrowUp'] || touchState.jump; }
function isRun() { return keys['ShiftLeft'] || keys['ShiftRight'] || keys['KeyX'] || touchState.run; }
function isJumpJustPressed() { return justPressed['Space'] || justPressed['KeyZ'] || justPressed['ArrowUp'] || touchJustPressed.jump; }
function isUp() { return keys['ArrowUp'] || keys['KeyW'] || touchState.up; }

let prevTouchJump = false;

// ── Drawing Helpers ────────────────────────────────────────

function drawRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawText(text, x, y, size, color, align) {
  ctx.font = size + 'px "Press Start 2P", monospace';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = PAL.textShadow;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color || PAL.white;
  ctx.fillText(text, x, y);
}

// ── Sprite Drawing (Pixel Art) ─────────────────────────────

function drawPlayer(x, y, dir, frame, power, invuln) {
  if (invuln > 0 && Math.floor(invuln / 4) % 2 === 0) return;
  const px = Math.round(x);
  const py = Math.round(y);
  const flip = dir < 0;

  ctx.save();
  if (flip) {
    ctx.translate(px + 16, py);
    ctx.scale(-1, 1);
    px_draw(0, 0, power, frame);
  } else {
    px_draw(px, py, power, frame);
  }
  ctx.restore();
}

function px_draw(x, y, power, frame) {
  const h = power >= 1 ? 24 : 16;
  const yOff = power >= 1 ? -8 : 0;

  // Hard hat
  if (power >= 1) {
    drawRect(x + 3, y + yOff, 10, 4, PAL.hardhatYellow);
    drawRect(x + 2, y + yOff + 4, 12, 3, PAL.hardhatYellow);
    drawRect(x + 5, y + yOff + 2, 4, 2, '#fce8a0');
  }

  // Head
  drawRect(x + 4, y + yOff + (power >= 1 ? 7 : 0), 8, 7, PAL.skin);
  // Eyes
  drawRect(x + 9, y + yOff + (power >= 1 ? 9 : 2), 2, 2, PAL.black);
  // Hair
  drawRect(x + 3, y + yOff + (power >= 1 ? 7 : 0), 10, 2, PAL.brown);

  // Body (blue uniform with yellow bolt)
  const bodyY = y + yOff + (power >= 1 ? 14 : 7);
  drawRect(x + 2, bodyY, 12, 6, PAL.uniform);
  // Bolt symbol on chest
  drawRect(x + 6, bodyY + 1, 1, 4, PAL.belt);
  drawRect(x + 7, bodyY + 2, 1, 1, PAL.belt);
  drawRect(x + 8, bodyY + 1, 1, 4, PAL.belt);

  // Belt
  drawRect(x + 2, bodyY + 5, 12, 1, PAL.belt);

  // Legs (walking animation)
  const legY = bodyY + 6;
  if (frame === 0 || frame === 2) {
    drawRect(x + 3, legY, 4, 4, PAL.uniformDark);
    drawRect(x + 9, legY, 4, 4, PAL.uniformDark);
    // Boots
    drawRect(x + 2, legY + 4, 5, 2, PAL.darkBrown);
    drawRect(x + 8, legY + 4, 5, 2, PAL.darkBrown);
  } else if (frame === 1) {
    drawRect(x + 2, legY, 4, 5, PAL.uniformDark);
    drawRect(x + 10, legY, 4, 3, PAL.uniformDark);
    drawRect(x + 1, legY + 5, 5, 2, PAL.darkBrown);
    drawRect(x + 10, legY + 3, 5, 2, PAL.darkBrown);
  } else {
    drawRect(x + 10, legY, 4, 5, PAL.uniformDark);
    drawRect(x + 2, legY, 4, 3, PAL.uniformDark);
    drawRect(x + 10, legY + 5, 5, 2, PAL.darkBrown);
    drawRect(x + 1, legY + 3, 5, 2, PAL.darkBrown);
  }

  // Spray can (if powered up to level 2)
  if (power >= 2) {
    drawRect(x + 13, bodyY + 1, 3, 5, PAL.sprayCan);
    drawRect(x + 14, bodyY - 1, 1, 2, '#ffffff');
  }
}

function drawEnemy(type, x, y, frame, alive) {
  const px = Math.round(x);
  const py = Math.round(y);

  if (!alive) {
    // Squished
    drawRect(px + 2, py + 12, 12, 4, PAL.roachBrown);
    return;
  }

  switch (type) {
    case E.ROACH:
      drawRect(px + 2, py + 2, 12, 10, PAL.roachBrown);
      drawRect(px + 3, py + 4, 4, 3, '#402000');
      drawRect(px + 9, py + 4, 4, 3, '#402000');
      drawRect(px + 4, py + 5, 2, 1, PAL.white);
      drawRect(px + 10, py + 5, 2, 1, PAL.white);
      // Legs
      if (frame % 2 === 0) {
        drawRect(px, py + 10, 3, 2, PAL.roachBrown);
        drawRect(px + 13, py + 10, 3, 2, PAL.roachBrown);
        drawRect(px + 1, py + 12, 2, 2, PAL.roachBrown);
        drawRect(px + 13, py + 12, 2, 2, PAL.roachBrown);
      } else {
        drawRect(px, py + 12, 3, 2, PAL.roachBrown);
        drawRect(px + 13, py + 12, 3, 2, PAL.roachBrown);
        drawRect(px + 1, py + 10, 2, 2, PAL.roachBrown);
        drawRect(px + 13, py + 10, 2, 2, PAL.roachBrown);
      }
      // Antennae
      drawRect(px + 3, py, 1, 3, PAL.roachBrown);
      drawRect(px + 12, py, 1, 3, PAL.roachBrown);
      break;

    case E.SPIDER:
      // Body
      drawRect(px + 4, py + 3, 8, 8, PAL.spiderGray);
      drawRect(px + 5, py + 4, 2, 2, '#c03030');
      drawRect(px + 9, py + 4, 2, 2, '#c03030');
      // 8 legs
      for (let i = 0; i < 4; i++) {
        const ly = py + 4 + i * 2;
        const off = (frame + i) % 2 === 0 ? -1 : 1;
        drawRect(px + off, ly, 4, 1, PAL.spiderGray);
        drawRect(px + 12 - off, ly, 4, 1, PAL.spiderGray);
      }
      break;

    case E.ANT:
      drawRect(px + 3, py + 2, 4, 4, PAL.antRed);
      drawRect(px + 6, py + 4, 6, 6, PAL.antRed);
      drawRect(px + 4, py + 3, 1, 1, PAL.white);
      // Legs
      if (frame % 2 === 0) {
        drawRect(px + 5, py + 10, 2, 3, PAL.antRed);
        drawRect(px + 9, py + 10, 2, 3, PAL.antRed);
      } else {
        drawRect(px + 6, py + 10, 2, 3, PAL.antRed);
        drawRect(px + 10, py + 10, 2, 3, PAL.antRed);
      }
      // Antennae
      drawRect(px + 2, py, 1, 3, PAL.antRed);
      drawRect(px + 5, py, 1, 3, PAL.antRed);
      break;

    case E.BEETLE:
      drawRect(px + 2, py + 3, 12, 9, PAL.beetleGreen);
      drawRect(px + 3, py + 4, 3, 2, PAL.white);
      drawRect(px + 10, py + 4, 3, 2, PAL.white);
      drawRect(px + 7, py + 3, 2, 9, '#105010');
      // Legs
      drawRect(px, py + 10 + (frame % 2), 3, 2, PAL.beetleGreen);
      drawRect(px + 13, py + 10 + ((frame + 1) % 2), 3, 2, PAL.beetleGreen);
      // Horn
      drawRect(px + 6, py, 4, 4, PAL.beetleGreen);
      break;

    case E.FLY:
      drawRect(px + 4, py + 5, 8, 7, PAL.flyPurple);
      drawRect(px + 5, py + 6, 2, 2, '#ff4040');
      drawRect(px + 9, py + 6, 2, 2, '#ff4040');
      // Wings
      const wy = frame % 2 === 0 ? -2 : 0;
      drawRect(px + 1, py + 2 + wy, 5, 4, 'rgba(200,200,255,0.6)');
      drawRect(px + 10, py + 2 + wy, 5, 4, 'rgba(200,200,255,0.6)');
      break;
  }
}

function drawTile(id, x, y) {
  switch (id) {
    case T.GROUND:
      drawRect(x, y, TILE, TILE, PAL.ground);
      drawRect(x, y, TILE, 2, '#50b850');
      drawRect(x + 2, y + 2, 2, 2, PAL.groundDark);
      drawRect(x + 10, y + 6, 2, 2, PAL.groundDark);
      break;
    case T.BRICK:
      drawRect(x, y, TILE, TILE, PAL.brick);
      drawRect(x, y, TILE, 1, PAL.brickDark);
      drawRect(x + 7, y, 1, TILE, PAL.brickDark);
      drawRect(x, y + 7, TILE, 1, PAL.brickDark);
      break;
    case T.QUESTION:
      drawRect(x, y, TILE, TILE, PAL.question);
      drawRect(x, y, TILE, 1, PAL.questionDark);
      drawRect(x, y, 1, TILE, PAL.questionDark);
      drawRect(x + 5, y + 3, 6, 2, PAL.white);
      drawRect(x + 9, y + 5, 2, 4, PAL.white);
      drawRect(x + 5, y + 7, 6, 2, PAL.white);
      drawRect(x + 5, y + 7, 2, 2, PAL.white);
      drawRect(x + 7, y + 11, 2, 2, PAL.white);
      break;
    case T.USED:
      drawRect(x, y, TILE, TILE, PAL.used);
      drawRect(x + 2, y + 2, 12, 12, '#666');
      break;
    case T.PIPE_TL:
      drawRect(x, y, TILE, TILE, PAL.pipe);
      drawRect(x, y, TILE, 2, '#50d050');
      drawRect(x, y, 2, TILE, '#50d050');
      break;
    case T.PIPE_TR:
      drawRect(x, y, TILE, TILE, PAL.pipe);
      drawRect(x, y, TILE, 2, '#50d050');
      drawRect(x + 14, y, 2, TILE, PAL.pipeDark);
      break;
    case T.PIPE_BL:
      drawRect(x, y, TILE, TILE, PAL.pipe);
      drawRect(x, y, 2, TILE, '#50d050');
      break;
    case T.PIPE_BR:
      drawRect(x, y, TILE, TILE, PAL.pipe);
      drawRect(x + 14, y, 2, TILE, PAL.pipeDark);
      break;
    case T.PLATFORM:
      drawRect(x, y, TILE, 4, PAL.platform);
      drawRect(x, y, TILE, 1, '#a0a0e0');
      break;
    case T.SPIKE:
      drawRect(x + 2, y + 8, 12, 8, '#808080');
      ctx.fillStyle = '#a0a0a0';
      ctx.beginPath();
      ctx.moveTo(x + 3, y + 8); ctx.lineTo(x + 8, y); ctx.lineTo(x + 13, y + 8);
      ctx.fill();
      break;
    case T.FLAG_POLE:
      drawRect(x + 7, y, 2, TILE, '#808080');
      break;
    case T.FLAG_TOP:
      drawRect(x + 7, y, 2, TILE, '#808080');
      drawRect(x + 7, y, 1, 1, '#c0c0c0');
      // Flag
      drawRect(x, y + 1, 7, 5, PAL.flagRed);
      drawRect(x + 1, y + 2, 2, 1, PAL.belt);
      break;
    case T.CLOUD:
      drawRect(x + 2, y + 4, 12, 8, PAL.cloud);
      drawRect(x, y + 6, TILE, 4, PAL.cloud);
      drawRect(x + 4, y + 2, 8, 4, PAL.cloud);
      drawRect(x + 4, y + 8, 4, 2, PAL.cloudShade);
      break;
    case T.HILL:
      drawRect(x, y + 8, TILE, 8, PAL.hillGreen);
      drawRect(x + 4, y + 4, 8, 4, PAL.hillGreen);
      drawRect(x + 6, y + 2, 4, 2, PAL.hillGreen);
      drawRect(x + 7, y + 3, 2, 1, PAL.hillDark);
      break;
    case T.BUSH:
      drawRect(x + 2, y + 8, 12, 8, PAL.bushGreen);
      drawRect(x + 4, y + 6, 8, 4, PAL.bushGreen);
      drawRect(x + 6, y + 8, 4, 2, PAL.bushDark);
      break;
  }
}

function drawPowerUp(type, x, y, frame) {
  const px = Math.round(x);
  const py = Math.round(y);
  switch (type) {
    case P.HARDHAT:
      drawRect(px + 2, py + 2, 12, 6, PAL.hardhatYellow);
      drawRect(px + 1, py + 8, 14, 4, PAL.hardhatYellow);
      drawRect(px + 5, py + 4, 4, 2, '#fce8a0');
      drawRect(px + 6, py + 10, 4, 2, '#c89c00');
      break;
    case P.SPRAY:
      drawRect(px + 4, py + 1, 8, 12, PAL.sprayCan);
      drawRect(px + 5, py, 6, 2, '#80c0fc');
      drawRect(px + 6, py + 4, 4, 3, PAL.white);
      drawRect(px + 5, py + 13, 6, 3, '#2080c0');
      break;
    case P.BOOTS:
      drawRect(px + 1, py + 4, 6, 8, PAL.bootsRed);
      drawRect(px + 9, py + 4, 6, 8, PAL.bootsRed);
      drawRect(px + 0, py + 10, 7, 4, PAL.bootsRed);
      drawRect(px + 9, py + 10, 7, 4, PAL.bootsRed);
      // Lightning bolt on boots
      drawRect(px + 3, py + 5, 1, 3, PAL.belt);
      drawRect(px + 11, py + 5, 1, 3, PAL.belt);
      break;
  }
}

function drawCoin(x, y, frame) {
  const w = [6, 4, 2, 4][frame % 4];
  const ox = (6 - w) / 2;
  drawRect(x + 5 + ox, y + 2, w, 12, PAL.coinGold);
  if (w > 2) drawRect(x + 5 + ox + 1, y + 4, w - 2, 2, PAL.coinShine);
}

function drawSprayBullet(x, y) {
  drawRect(Math.round(x), Math.round(y) + 4, 8, 4, '#80d0ff');
  drawRect(Math.round(x) + 2, Math.round(y) + 5, 4, 2, PAL.white);
}

// ── Level Data ─────────────────────────────────────────────

function createLevel(num) {
  // Returns { map, enemies, powerups, coins, width, height, bgColor, skyObjects, startX, startY }
  let map, enemies, powerups, coins, w, h, bg, skyObjs, sx, sy, levelName;

  switch (num) {
    case 1:
      levelName = 'YARD 1-1';
      w = 120; h = 15; bg = PAL.sky;
      map = makeEmptyMap(w, h);

      // Ground
      fillGround(map, 0, w, h);
      // Gap
      clearGround(map, 30, 32, h);
      clearGround(map, 55, 57, h);

      // Platforms and bricks
      setTiles(map, 10, 10, [T.BRICK, T.QUESTION, T.BRICK, T.QUESTION, T.BRICK]);
      setTiles(map, 20, 6, [T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 36, 10, [T.BRICK, T.QUESTION, T.BRICK]);
      setTiles(map, 45, 8, [T.QUESTION]);
      setTiles(map, 48, 10, [T.BRICK, T.BRICK, T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 62, 10, [T.QUESTION, T.BRICK, T.QUESTION]);
      setTiles(map, 70, 7, [T.BRICK, T.BRICK, T.BRICK, T.BRICK]);

      // Pipes
      setPipe(map, 15, h - 4, 2);
      setPipe(map, 40, h - 5, 3);
      setPipe(map, 75, h - 4, 2);

      // Steps near end
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j <= i; j++) {
          map[h - 3 - j][90 + i] = T.GROUND;
        }
      }
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j <= (4 - i); j++) {
          map[h - 3 - j][96 + i] = T.GROUND;
        }
      }

      // Flagpole
      for (let fy = 3; fy < h - 2; fy++) map[fy][110] = T.FLAG_POLE;
      map[2][110] = T.FLAG_TOP;

      // Decorations
      placeDecorations(map, w, h);

      enemies = [
        { type: E.ROACH, x: 8 * TILE, y: (h - 3) * TILE, left: 5 * TILE, right: 12 * TILE },
        { type: E.ROACH, x: 16 * TILE, y: (h - 3) * TILE, left: 14 * TILE, right: 19 * TILE },
        { type: E.ANT, x: 22 * TILE, y: (h - 3) * TILE, left: 20 * TILE, right: 26 * TILE },
        { type: E.ROACH, x: 25 * TILE, y: (h - 3) * TILE, left: 23 * TILE, right: 28 * TILE },
        { type: E.ANT, x: 35 * TILE, y: (h - 3) * TILE, left: 33 * TILE, right: 39 * TILE },
        { type: E.SPIDER, x: 43 * TILE, y: (h - 3) * TILE, left: 41 * TILE, right: 47 * TILE },
        { type: E.ROACH, x: 50 * TILE, y: (h - 3) * TILE, left: 48 * TILE, right: 56 * TILE },
        { type: E.FLY, x: 54 * TILE, y: (h - 5) * TILE, left: 50 * TILE, right: 58 * TILE },
        { type: E.ROACH, x: 60 * TILE, y: (h - 3) * TILE, left: 58 * TILE, right: 64 * TILE },
        { type: E.SPIDER, x: 65 * TILE, y: (h - 3) * TILE, left: 60 * TILE, right: 70 * TILE },
        { type: E.ANT, x: 72 * TILE, y: (h - 3) * TILE, left: 70 * TILE, right: 75 * TILE },
        { type: E.ROACH, x: 80 * TILE, y: (h - 3) * TILE, left: 76 * TILE, right: 88 * TILE },
        { type: E.ANT, x: 85 * TILE, y: (h - 3) * TILE, left: 82 * TILE, right: 89 * TILE },
        { type: E.BEETLE, x: 100 * TILE, y: (h - 3) * TILE, left: 96 * TILE, right: 108 * TILE },
      ];

      powerups = [
        { type: P.HARDHAT, tileX: 11, tileY: 10 },
        { type: P.SPRAY, tileX: 45, tileY: 8 },
        { type: P.BOOTS, tileX: 63, tileY: 10 },
      ];

      coins = [
        { x: 12, y: 9 }, { x: 13, y: 9 },
        { x: 21, y: 5 },
        { x: 37, y: 9 },
        { x: 49, y: 9 }, { x: 50, y: 9 }, { x: 51, y: 9 },
        { x: 72, y: 6 },
      ];

      // Adjust start so player sits exactly on ground
      sx = 2 * TILE; sy = (h - 3) * TILE - 2;
      break;

    case 2:
      levelName = 'BASEMENT 1-2';
      w = 130; h = 15; bg = '#101820';
      map = makeEmptyMap(w, h);
      fillGround(map, 0, w, h);

      // Ceiling
      for (let cx = 0; cx < w; cx++) { map[0][cx] = T.BRICK; map[1][cx] = T.BRICK; }

      clearGround(map, 25, 28, h);
      clearGround(map, 60, 63, h);
      clearGround(map, 95, 98, h);

      // Platforms
      setTiles(map, 8, 9, [T.QUESTION, T.BRICK, T.QUESTION]);
      setTiles(map, 18, 7, [T.BRICK, T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 35, 10, [T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 35, 6, [T.QUESTION]);
      setTiles(map, 45, 8, [T.BRICK, T.QUESTION, T.BRICK, T.QUESTION, T.BRICK]);
      setTiles(map, 55, 5, [T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 70, 9, [T.BRICK, T.BRICK, T.BRICK, T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 72, 6, [T.QUESTION]);
      setTiles(map, 80, 7, [T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 90, 9, [T.QUESTION, T.BRICK, T.QUESTION]);
      setTiles(map, 105, 6, [T.BRICK, T.BRICK, T.BRICK, T.BRICK]);

      setPipe(map, 30, h - 4, 2);
      setPipe(map, 50, h - 5, 3);
      setPipe(map, 85, h - 4, 2);

      // Steps at end
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j <= i; j++) map[h - 3 - j][112 + i] = T.GROUND;
      }

      // Flagpole
      for (let fy = 3; fy < h - 2; fy++) map[fy][122] = T.FLAG_POLE;
      map[2][122] = T.FLAG_TOP;

      enemies = [
        { type: E.ROACH, x: 6 * TILE, y: (h - 3) * TILE, left: 3 * TILE, right: 10 * TILE },
        { type: E.ROACH, x: 10 * TILE, y: (h - 3) * TILE, left: 5 * TILE, right: 15 * TILE },
        { type: E.SPIDER, x: 20 * TILE, y: (h - 3) * TILE, left: 16 * TILE, right: 24 * TILE },
        { type: E.ANT, x: 22 * TILE, y: (h - 3) * TILE, left: 18 * TILE, right: 24 * TILE },
        { type: E.FLY, x: 32 * TILE, y: (h - 5) * TILE, left: 28 * TILE, right: 36 * TILE },
        { type: E.ROACH, x: 38 * TILE, y: (h - 3) * TILE, left: 34 * TILE, right: 42 * TILE },
        { type: E.BEETLE, x: 42 * TILE, y: (h - 3) * TILE, left: 38 * TILE, right: 49 * TILE },
        { type: E.ANT, x: 47 * TILE, y: (h - 3) * TILE, left: 44 * TILE, right: 50 * TILE },
        { type: E.SPIDER, x: 55 * TILE, y: (h - 3) * TILE, left: 50 * TILE, right: 59 * TILE },
        { type: E.FLY, x: 62 * TILE, y: (h - 5) * TILE, left: 58 * TILE, right: 66 * TILE },
        { type: E.ROACH, x: 66 * TILE, y: (h - 3) * TILE, left: 63 * TILE, right: 70 * TILE },
        { type: E.ROACH, x: 70 * TILE, y: (h - 3) * TILE, left: 65 * TILE, right: 78 * TILE },
        { type: E.ROACH, x: 75 * TILE, y: (h - 3) * TILE, left: 70 * TILE, right: 80 * TILE },
        { type: E.BEETLE, x: 88 * TILE, y: (h - 3) * TILE, left: 84 * TILE, right: 94 * TILE },
        { type: E.SPIDER, x: 93 * TILE, y: (h - 3) * TILE, left: 90 * TILE, right: 98 * TILE },
        { type: E.SPIDER, x: 100 * TILE, y: (h - 3) * TILE, left: 98 * TILE, right: 110 * TILE },
        { type: E.ANT, x: 108 * TILE, y: (h - 3) * TILE, left: 105 * TILE, right: 112 * TILE },
      ];

      powerups = [
        { type: P.HARDHAT, tileX: 8, tileY: 9 },
        { type: P.SPRAY, tileX: 35, tileY: 6 },
        { type: P.BOOTS, tileX: 72, tileY: 6 },
      ];

      coins = [
        { x: 9, y: 8 }, { x: 10, y: 8 },
        { x: 19, y: 6 }, { x: 20, y: 6 },
        { x: 46, y: 7 }, { x: 47, y: 7 },
        { x: 56, y: 4 },
        { x: 81, y: 6 },
        { x: 91, y: 8 },
        { x: 106, y: 5 }, { x: 107, y: 5 },
      ];

      sx = 2 * TILE; sy = (h - 3) * TILE - 2;
      break;

    case 3:
      levelName = 'ATTIC 1-3';
      w = 140; h = 15; bg = '#301840';
      map = makeEmptyMap(w, h);
      fillGround(map, 0, w, h);

      clearGround(map, 20, 23, h);
      clearGround(map, 40, 43, h);
      clearGround(map, 65, 68, h);
      clearGround(map, 90, 93, h);

      setTiles(map, 8, 9, [T.BRICK, T.QUESTION, T.BRICK]);
      setTiles(map, 15, 6, [T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 22, 10, [T.PLATFORM, T.PLATFORM, T.PLATFORM]);
      setTiles(map, 22, 7, [T.PLATFORM, T.PLATFORM]);
      setTiles(map, 30, 8, [T.QUESTION, T.BRICK, T.QUESTION]);
      setTiles(map, 37, 5, [T.BRICK, T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 42, 10, [T.PLATFORM, T.PLATFORM, T.PLATFORM]);
      setTiles(map, 48, 7, [T.BRICK, T.QUESTION, T.BRICK, T.QUESTION, T.BRICK]);
      setTiles(map, 55, 9, [T.BRICK, T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 60, 5, [T.BRICK, T.BRICK]);
      setTiles(map, 67, 10, [T.PLATFORM, T.PLATFORM]);
      setTiles(map, 67, 7, [T.PLATFORM]);
      setTiles(map, 73, 8, [T.QUESTION, T.BRICK, T.QUESTION]);
      setTiles(map, 80, 6, [T.BRICK, T.BRICK, T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 88, 9, [T.BRICK, T.BRICK, T.BRICK]);
      setTiles(map, 92, 10, [T.PLATFORM, T.PLATFORM]);
      setTiles(map, 100, 7, [T.QUESTION, T.BRICK, T.QUESTION, T.BRICK, T.QUESTION]);
      setTiles(map, 108, 5, [T.BRICK, T.BRICK, T.BRICK]);

      // Stairs to flagpole
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j <= i; j++) map[h - 3 - j][118 + i] = T.GROUND;
      }

      // Flagpole
      for (let fy = 3; fy < h - 2; fy++) map[fy][130] = T.FLAG_POLE;
      map[2][130] = T.FLAG_TOP;

      setPipe(map, 26, h - 5, 3);
      setPipe(map, 70, h - 4, 2);
      setPipe(map, 95, h - 5, 3);
      setPipe(map, 114, h - 4, 2);

      enemies = [
        { type: E.ROACH, x: 6 * TILE, y: (h - 3) * TILE, left: 3 * TILE, right: 10 * TILE },
        { type: E.SPIDER, x: 10 * TILE, y: (h - 3) * TILE, left: 6 * TILE, right: 14 * TILE },
        { type: E.ANT, x: 14 * TILE, y: (h - 3) * TILE, left: 12 * TILE, right: 18 * TILE },
        { type: E.FLY, x: 18 * TILE, y: (h - 5) * TILE, left: 15 * TILE, right: 20 * TILE },
        { type: E.BEETLE, x: 25 * TILE, y: (h - 3) * TILE, left: 24 * TILE, right: 29 * TILE },
        { type: E.ROACH, x: 33 * TILE, y: (h - 3) * TILE, left: 30 * TILE, right: 36 * TILE },
        { type: E.SPIDER, x: 38 * TILE, y: (h - 3) * TILE, left: 35 * TILE, right: 40 * TILE },
        { type: E.ROACH, x: 44 * TILE, y: (h - 3) * TILE, left: 43 * TILE, right: 48 * TILE },
        { type: E.ANT, x: 46 * TILE, y: (h - 3) * TILE, left: 45 * TILE, right: 48 * TILE },
        { type: E.FLY, x: 52 * TILE, y: (h - 5) * TILE, left: 48 * TILE, right: 55 * TILE },
        { type: E.BEETLE, x: 58 * TILE, y: (h - 3) * TILE, left: 55 * TILE, right: 64 * TILE },
        { type: E.SPIDER, x: 63 * TILE, y: (h - 3) * TILE, left: 60 * TILE, right: 65 * TILE },
        { type: E.ROACH, x: 73 * TILE, y: (h - 3) * TILE, left: 69 * TILE, right: 78 * TILE },
        { type: E.FLY, x: 78 * TILE, y: (h - 5) * TILE, left: 75 * TILE, right: 82 * TILE },
        { type: E.BEETLE, x: 86 * TILE, y: (h - 3) * TILE, left: 83 * TILE, right: 90 * TILE },
        { type: E.ANT, x: 90 * TILE, y: (h - 3) * TILE, left: 88 * TILE, right: 94 * TILE },
        { type: E.SPIDER, x: 96 * TILE, y: (h - 3) * TILE, left: 94 * TILE, right: 100 * TILE },
        { type: E.ROACH, x: 103 * TILE, y: (h - 3) * TILE, left: 100 * TILE, right: 106 * TILE },
        { type: E.ANT, x: 105 * TILE, y: (h - 3) * TILE, left: 100 * TILE, right: 110 * TILE },
        { type: E.BEETLE, x: 112 * TILE, y: (h - 3) * TILE, left: 108 * TILE, right: 117 * TILE },
      ];

      powerups = [
        { type: P.HARDHAT, tileX: 9, tileY: 9 },
        { type: P.SPRAY, tileX: 30, tileY: 8 },
        { type: P.BOOTS, tileX: 49, tileY: 7 },
        { type: P.SPRAY, tileX: 73, tileY: 8 },
        { type: P.HARDHAT, tileX: 101, tileY: 7 },
      ];

      coins = [
        { x: 16, y: 5 }, { x: 17, y: 5 },
        { x: 31, y: 7 }, { x: 32, y: 7 },
        { x: 38, y: 4 }, { x: 39, y: 4 },
        { x: 56, y: 8 }, { x: 57, y: 8 },
        { x: 61, y: 4 },
        { x: 74, y: 7 },
        { x: 81, y: 5 }, { x: 82, y: 5 }, { x: 83, y: 5 },
        { x: 102, y: 6 }, { x: 103, y: 6 },
        { x: 109, y: 4 },
      ];

      sx = 2 * TILE; sy = (h - 3) * TILE - 2;
      break;

    default:
      return createLevel(1);
  }

  return {
    map, enemies, powerups, coins, width: w, height: h,
    bgColor: bg, startX: sx, startY: sy, levelName,
    skyObjects: skyObjs || []
  };
}

function makeEmptyMap(w, h) {
  const m = [];
  for (let r = 0; r < h; r++) {
    m[r] = new Array(w).fill(T.AIR);
  }
  return m;
}

function fillGround(map, x1, x2, h) {
  for (let x = x1; x < x2; x++) {
    map[h - 1][x] = T.GROUND;
    map[h - 2][x] = T.GROUND;
  }
}

function clearGround(map, x1, x2, h) {
  for (let x = x1; x < x2; x++) {
    map[h - 1][x] = T.AIR;
    map[h - 2][x] = T.AIR;
  }
}

function setTiles(map, x, y, tiles) {
  for (let i = 0; i < tiles.length; i++) {
    if (y >= 0 && y < map.length && x + i >= 0 && x + i < map[0].length)
      map[y][x + i] = tiles[i];
  }
}

function setPipe(map, x, y, height) {
  map[y][x] = T.PIPE_TL;
  map[y][x + 1] = T.PIPE_TR;
  for (let i = 1; i < height; i++) {
    map[y + i][x] = T.PIPE_BL;
    map[y + i][x + 1] = T.PIPE_BR;
  }
}

function placeDecorations(map, w, h) {
  // Clouds
  for (let cx = 8; cx < w; cx += 18 + Math.floor(Math.random() * 10)) {
    const cy = 1 + Math.floor(Math.random() * 3);
    if (cy < h) map[cy][cx] = T.CLOUD;
  }
  // Hills
  for (let hx = 5; hx < w; hx += 24 + Math.floor(Math.random() * 8)) {
    if (h - 3 >= 0) map[h - 3][hx] = T.HILL;
  }
  // Bushes
  for (let bx = 12; bx < w; bx += 20 + Math.floor(Math.random() * 10)) {
    if (h - 3 >= 0 && map[h - 1][bx] !== T.AIR) map[h - 3][bx] = T.BUSH;
  }
}

// ── Game State ─────────────────────────────────────────────

const game = {
  state: STATE.TITLE,
  level: 1,
  lives: 3,
  score: 0,
  coins: 0,
  time: 400,
  timeCounter: 0,

  // Player
  px: 0, py: 0, pvx: 0, pvy: 0,
  pdir: 1, pframe: 0, pframeTimer: 0,
  pgrounded: false, ppower: 0,
  pinvuln: 0, pjumpHeld: false, pcoyote: 0, pjumpBuffer: 0,
  pdying: false, pdeathTimer: 0,
  pdeathVy: 0,
  pflags: null,

  // Camera
  camX: 0, camY: 0,

  // Level data
  levelData: null,

  // Active entities
  enemies: [],
  activePowerups: [],
  activeCoins: [],
  sprays: [],
  particles: [],
  floatTexts: [],

  // Animations
  animFrame: 0,
  animTimer: 0,

  // Transition
  transTimer: 0,
  titleBlink: 0,

  // Flagpole
  flagpoleGrabbed: false,
  flagSlide: 0,
};

// ── Particle System ────────────────────────────────────────
function addParticle(x, y, vx, vy, color, life) {
  game.particles.push({ x, y, vx, vy, color, life, maxLife: life });
}

function addFloatText(text, x, y, color) {
  game.floatTexts.push({ text, x, y, vy: -1, life: 40, color: color || PAL.white });
}

// ── Level Management ───────────────────────────────────────

function loadLevel(num) {
  const ld = createLevel(num);
  game.levelData = ld;
  game.px = ld.startX;
  game.py = ld.startY;
  game.pvx = 0;
  game.pvy = 0;
  game.pdir = 1;
  game.pframe = 0;
  game.pgrounded = true;
  game.pinvuln = 60; // Brief spawn invulnerability
  game.pcoyote = 0;
  game.pjumpBuffer = 0;
  game.pdying = false;
  game.camX = 0;
  game.camY = 0;
  game.time = 400;
  game.timeCounter = 0;
  game.flagpoleGrabbed = false;
  game.flagSlide = 0;

  // Initialize enemies
  game.enemies = ld.enemies.map(e => ({
    type: e.type,
    x: e.x, y: e.y,
    vx: (e.type === E.FLY) ? 0.8 : 0.5,
    vy: 0,
    left: e.left, right: e.right,
    dir: -1,
    alive: true,
    frame: 0, frameTimer: 0,
    squishTimer: 0,
    flying: e.type === E.FLY,
    flyBaseY: e.y,
    flyAngle: 0,
  }));

  // Initialize power-ups (hidden in question blocks)
  game.activePowerups = [];

  // Initialize coins
  game.activeCoins = ld.coins.map(c => ({
    x: c.x * TILE, y: c.y * TILE, collected: false
  }));

  game.sprays = [];
  game.particles = [];
  game.floatTexts = [];
}

// ── Collision ──────────────────────────────────────────────

function isSolid(tileId) {
  return tileId === T.GROUND || tileId === T.BRICK || tileId === T.QUESTION ||
         tileId === T.USED || tileId === T.PIPE_TL || tileId === T.PIPE_TR ||
         tileId === T.PIPE_BL || tileId === T.PIPE_BR;
}

function isPlatform(tileId) {
  return tileId === T.PLATFORM;
}

function getTile(tx, ty) {
  const ld = game.levelData;
  if (!ld) return T.AIR;
  if (tx < 0 || tx >= ld.width || ty < 0 || ty >= ld.height) return T.AIR;
  return ld.map[ty][tx];
}

function collidesWithMap(x, y, w, h, checkPlatforms, oldY) {
  const left = Math.floor(x / TILE);
  const right = Math.floor((x + w - 1) / TILE);
  const top = Math.floor(y / TILE);
  const bottom = Math.floor((y + h - 1) / TILE);

  for (let ty = top; ty <= bottom; ty++) {
    for (let tx = left; tx <= right; tx++) {
      const tile = getTile(tx, ty);
      if (isSolid(tile)) return { tx, ty, tile };
      if (checkPlatforms && isPlatform(tile)) {
        const platTop = ty * TILE;
        const entityBottom = y + h;
        const oldBottom = oldY + h;
        if (oldBottom <= platTop + 2 && entityBottom > platTop) {
          return { tx, ty, tile };
        }
      }
    }
  }
  return null;
}

// ── Player Update ──────────────────────────────────────────

function updatePlayer(dt) {
  if (game.pdying) {
    game.pdeathTimer--;
    if (game.pdeathTimer > 20) {
      // float up
    } else {
      game.pdeathVy += GRAVITY;
      game.py += game.pdeathVy;
    }
    if (game.pdeathTimer <= 0) {
      game.lives--;
      if (game.lives <= 0) {
        game.state = STATE.GAMEOVER;
      } else {
        game.state = STATE.LEVELTRANS;
        game.transTimer = 120;
      }
    }
    return;
  }

  if (game.flagpoleGrabbed) {
    // Slide down flagpole
    game.flagSlide += 2;
    game.py += 2;
    const ld = game.levelData;
    if (game.py >= (ld.height - 3) * TILE) {
      game.py = (ld.height - 3) * TILE;
      // Walk off screen
      game.px += 1.5;
      if (game.px > game.camX + SCREEN_W + 32) {
        if (game.level >= 3) {
          game.state = STATE.WIN;
        } else {
          game.level++;
          game.state = STATE.LEVELTRANS;
          game.transTimer = 120;
        }
      }
    }
    return;
  }

  // Invulnerability
  if (game.pinvuln > 0) game.pinvuln--;

  // Horizontal movement
  const running = isRun();
  const maxSpeed = game.ppower >= 3 ? RUN_SPEED * 1.3 : (running ? RUN_SPEED : WALK_SPEED);
  const accel = running ? RUN_ACCEL : WALK_ACCEL;

  if (isLeft()) {
    game.pvx -= accel;
    if (game.pvx < -maxSpeed) game.pvx = -maxSpeed;
    game.pdir = -1;
  } else if (isRight()) {
    game.pvx += accel;
    if (game.pvx > maxSpeed) game.pvx = maxSpeed;
    game.pdir = 1;
  } else {
    game.pvx *= FRICTION;
    if (Math.abs(game.pvx) < 0.1) game.pvx = 0;
  }

  // Coyote time: allow jumping for a few frames after leaving ground
  if (game.pgrounded) {
    game.pcoyote = 0;
  } else {
    game.pcoyote++;
  }

  // Jump buffer: remember jump press for a few frames
  const jumpJust = isJumpJustPressed();
  if (jumpJust) {
    game.pjumpBuffer = 8;
  } else if (game.pjumpBuffer > 0) {
    game.pjumpBuffer--;
  }

  // Jumping — use coyote time (6 frames) and jump buffer (8 frames)
  const canJump = game.pgrounded || game.pcoyote < 6;
  if (game.pjumpBuffer > 0 && canJump && game.pvy >= 0) {
    game.pvy = JUMP_FORCE;
    game.pgrounded = false;
    game.pjumpHeld = true;
    game.pcoyote = 99; // Prevent double jump
    game.pjumpBuffer = 0;
    sfxJump();
  }

  // Variable jump height
  if (!isJump()) {
    game.pjumpHeld = false;
  }
  if (!game.pjumpHeld && game.pvy < -2) {
    game.pvy += GRAVITY * 0.4; // Extra gravity when released early (cut jump short)
  }

  // Gravity
  game.pvy += GRAVITY;
  if (game.pvy > MAX_FALL) game.pvy = MAX_FALL;

  // Spray attack
  if (game.ppower >= 2 && (justPressed['KeyX'] || justPressed['ShiftLeft'] || justPressed['ShiftRight'] ||
      touchJustPressed.run)) {
    if (game.sprays.length < 3) {
      game.sprays.push({
        x: game.px + (game.pdir > 0 ? 12 : -8),
        y: game.py + 4,
        vx: SPRAY_SPEED * game.pdir,
        life: 50
      });
      sfxSpray();
    }
  }

  // Move horizontally
  const oldX = game.px;
  game.px += game.pvx;

  // Horizontal collision
  const pw = 12, ph = game.ppower >= 1 ? 22 : 14;
  const pOffX = 2;
  const pOffY = game.ppower >= 1 ? -6 : 0;

  let hCol = collidesWithMap(game.px + pOffX, game.py + pOffY, pw, ph, false);
  if (hCol) {
    if (game.pvx > 0) {
      game.px = hCol.tx * TILE - pw - pOffX;
    } else {
      game.px = (hCol.tx + 1) * TILE - pOffX;
    }
    game.pvx = 0;
  }

  // Move vertically
  const oldY = game.py;
  game.py += game.pvy;
  game.pgrounded = false;

  let vCol = collidesWithMap(game.px + pOffX, game.py + pOffY, pw, ph, true, oldY + pOffY);

  if (vCol) {
    if (game.pvy > 0) {
      // Landing
      game.py = vCol.ty * TILE - ph - pOffY;
      game.pvy = 0;
      game.pgrounded = true;
    } else if (game.pvy < 0) {
      // Hit block from below — use player center tile for block interaction
      const centerTX = Math.floor((game.px + 8) / TILE);
      const hitTY = vCol.ty;
      const centerTile = getTile(centerTX, hitTY);
      game.py = (hitTY + 1) * TILE - pOffY;
      game.pvy = 0;
      // Hit the block directly above player center
      if (isSolid(centerTile)) {
        hitBlock(centerTX, hitTY, centerTile);
      } else {
        hitBlock(vCol.tx, vCol.ty, vCol.tile);
      }
    }
  }

  // Fall off screen
  if (game.py > game.levelData.height * TILE) {
    killPlayer();
    return;
  }

  // Spike collision
  const spikeTX = Math.floor((game.px + 8) / TILE);
  const spikeTY = Math.floor((game.py + (game.ppower >= 1 ? 16 : 12)) / TILE);
  if (getTile(spikeTX, spikeTY) === T.SPIKE) {
    hurtPlayer();
  }

  // Flagpole check
  const flagTX = Math.floor((game.px + 8) / TILE);
  const flagTile = getTile(flagTX, Math.floor(game.py / TILE));
  if ((flagTile === T.FLAG_POLE || flagTile === T.FLAG_TOP) && !game.flagpoleGrabbed) {
    game.flagpoleGrabbed = true;
    game.pvx = 0;
    game.pvy = 0;
    game.px = flagTX * TILE - 6;
    sfxFlagpole();
    // Score time bonus
    game.score += game.time * 10;
    addFloatText(game.time * 10 + '', game.px, game.py - 16, PAL.coinGold);
  }

  // Animation
  if (game.pgrounded) {
    if (Math.abs(game.pvx) > 0.5) {
      game.pframeTimer++;
      const rate = Math.abs(game.pvx) > 2 ? 4 : 6;
      if (game.pframeTimer >= rate) {
        game.pframeTimer = 0;
        game.pframe = (game.pframe + 1) % 4;
      }
    } else {
      game.pframe = 0;
      game.pframeTimer = 0;
    }
  } else {
    game.pframe = 1;
  }

  // Timer
  game.timeCounter++;
  if (game.timeCounter >= 24) {
    game.timeCounter = 0;
    game.time--;
    if (game.time <= 0) {
      killPlayer();
    }
  }

  // Camera
  updateCamera();
}

function updateCamera() {
  const ld = game.levelData;
  const targetX = game.px - SCREEN_W / 3;
  game.camX += (targetX - game.camX) * 0.15;
  if (game.camX < 0) game.camX = 0;
  if (game.camX > ld.width * TILE - SCREEN_W) game.camX = ld.width * TILE - SCREEN_W;
  game.camY = 0;
}

function hitBlock(tx, ty, tile) {
  const ld = game.levelData;

  if (tile === T.QUESTION) {
    ld.map[ty][tx] = T.USED;
    sfxCoin();

    // Check if this block has a power-up
    const pu = ld.powerups.find(p => p.tileX === tx && p.tileY === ty);
    if (pu) {
      game.activePowerups.push({
        type: pu.type,
        x: tx * TILE,
        y: ty * TILE - TILE,
        vy: -2,
        grounded: false,
        vx: 0.5,
        active: true
      });
      sfxPowerup();
    } else {
      game.score += 100;
      game.coins++;
      addFloatText('100', tx * TILE, ty * TILE - 12, PAL.coinGold);
      // Pop coin
      addParticle(tx * TILE + 4, ty * TILE - 8, 0, -3, PAL.coinGold, 20);
    }
  } else if (tile === T.BRICK && game.ppower >= 1) {
    ld.map[ty][tx] = T.AIR;
    sfxBrick();
    // Break particles
    for (let i = 0; i < 4; i++) {
      addParticle(tx * TILE + 4 + (i % 2) * 8, ty * TILE + Math.floor(i / 2) * 8,
        (i % 2 === 0 ? -2 : 2), -3 - Math.random() * 2, PAL.brick, 30);
    }
  } else if (tile === T.BRICK) {
    sfxBrick();
  }
}

function hurtPlayer() {
  if (game.pinvuln > 0) return;
  if (game.ppower > 0) {
    game.ppower--;
    game.pinvuln = INVULN_TIME;
    sfxHurt();
  } else {
    killPlayer();
  }
}

function killPlayer() {
  game.pdying = true;
  game.pdeathTimer = 60;
  game.pdeathVy = -6;
  game.pvx = 0;
  game.pvy = 0;
  sfxDie();
}

// ── Enemy Update ───────────────────────────────────────────

function updateEnemies() {
  for (const en of game.enemies) {
    if (!en.alive) {
      en.squishTimer--;
      if (en.squishTimer <= 0) en.remove = true;
      continue;
    }

    // Animation
    en.frameTimer++;
    if (en.frameTimer >= 8) {
      en.frameTimer = 0;
      en.frame = (en.frame + 1) % 4;
    }

    // Movement
    if (en.flying) {
      en.flyAngle += 0.04;
      en.y = en.flyBaseY + Math.sin(en.flyAngle) * 16;
      en.x += en.vx * en.dir;
      if (en.x <= en.left || en.x >= en.right) en.dir *= -1;
    } else {
      en.x += en.vx * en.dir;

      // Ground check for walking enemies
      const feetY = en.y + TILE;
      const feetX = en.dir > 0 ? en.x + 14 : en.x + 2;
      const groundTile = getTile(Math.floor(feetX / TILE), Math.floor(feetY / TILE));
      const wallTile = getTile(Math.floor(feetX / TILE), Math.floor((en.y + 8) / TILE));

      if (!isSolid(groundTile) || isSolid(wallTile)) {
        en.dir *= -1;
      }

      // Patrol bounds
      if (en.x <= en.left || en.x >= en.right) en.dir *= -1;
    }

    // Player collision
    if (!game.pdying && !game.flagpoleGrabbed && game.pinvuln <= 0) {
      const pw = 12, ph = game.ppower >= 1 ? 22 : 14;
      const pox = 2, poy = game.ppower >= 1 ? -6 : 0;
      const px = game.px + pox, py = game.py + poy;
      const ex = en.x + 2, ey = en.y + 2, ew = 12, eh = 12;

      if (px < ex + ew && px + pw > ex && py < ey + eh && py + ph > ey) {
        // Stomp: player is descending and player bottom was above enemy center
        const stompZone = ey + 6; // top portion of enemy
        if (game.pvy > 0 && (py + ph) <= stompZone + 4) {
          // Stomp!
          en.alive = false;
          en.squishTimer = 30;
          game.pvy = STOMP_BOUNCE;
          game.score += 200;
          sfxStomp();
          addFloatText('200', en.x, en.y - 12);
          addParticle(en.x + 8, en.y + 8, -1, -2, '#ffff80', 15);
          addParticle(en.x + 8, en.y + 8, 1, -2, '#ffff80', 15);
        } else {
          hurtPlayer();
        }
      }
    }
  }

  // Remove dead enemies
  game.enemies = game.enemies.filter(e => !e.remove);
}

// ── Power-up Update ────────────────────────────────────────

function updatePowerups() {
  for (const pu of game.activePowerups) {
    if (!pu.active) continue;

    // Physics
    if (!pu.grounded) {
      pu.vy += GRAVITY * 0.5;
      pu.y += pu.vy;
      const col = collidesWithMap(pu.x + 2, pu.y + 2, 12, 12, true, pu.y + 2 - pu.vy);
      if (col && pu.vy > 0) {
        pu.y = col.ty * TILE - 14;
        pu.vy = 0;
        pu.grounded = true;
      }
    }

    if (pu.grounded) {
      pu.x += pu.vx;
      const wallCol = collidesWithMap(pu.x + 2, pu.y + 2, 12, 12, false);
      if (wallCol) pu.vx *= -1;

      // Ground check
      const gTile = getTile(Math.floor((pu.x + 8) / TILE), Math.floor((pu.y + 16) / TILE));
      if (!isSolid(gTile)) {
        pu.grounded = false;
      }
    }

    // Player collision
    if (!game.pdying) {
      const pw = 12, ph = game.ppower >= 1 ? 22 : 14;
      const pox = 2, poy = game.ppower >= 1 ? -6 : 0;
      if (game.px + pox < pu.x + 14 && game.px + pox + pw > pu.x + 2 &&
          game.py + poy < pu.y + 14 && game.py + poy + ph > pu.y + 2) {
        pu.active = false;
        switch (pu.type) {
          case P.HARDHAT:
            if (game.ppower < 1) game.ppower = 1;
            break;
          case P.SPRAY:
            game.ppower = 2;
            break;
          case P.BOOTS:
            game.ppower = 3; // Speed boost
            break;
        }
        sfxPowerup();
        game.score += 500;
        addFloatText('500', pu.x, pu.y - 12);
      }
    }
  }
}

// ── Coin Update ────────────────────────────────────────────

function updateCoins() {
  for (const c of game.activeCoins) {
    if (c.collected) continue;

    const pw = 12, ph = game.ppower >= 1 ? 22 : 14;
    const pox = 2, poy = game.ppower >= 1 ? -6 : 0;
    if (game.px + pox < c.x + 12 && game.px + pox + pw > c.x + 4 &&
        game.py + poy < c.y + 12 && game.py + poy + ph > c.y + 4) {
      c.collected = true;
      game.coins++;
      game.score += 50;
      sfxCoin();
      addFloatText('50', c.x, c.y - 10, PAL.coinGold);
    }
  }
}

// ── Spray Update ───────────────────────────────────────────

function updateSprays() {
  for (const s of game.sprays) {
    s.x += s.vx;
    s.life--;

    // Collision with walls
    const tx = Math.floor((s.x + 4) / TILE);
    const ty = Math.floor((s.y + 4) / TILE);
    if (isSolid(getTile(tx, ty))) {
      s.life = 0;
    }

    // Collision with enemies
    for (const en of game.enemies) {
      if (!en.alive) continue;
      if (s.x + 8 > en.x && s.x < en.x + 16 && s.y + 8 > en.y && s.y < en.y + 16) {
        en.alive = false;
        en.squishTimer = 30;
        s.life = 0;
        game.score += 200;
        sfxStomp();
        addFloatText('200', en.x, en.y - 12);
        for (let i = 0; i < 6; i++) {
          addParticle(en.x + 8, en.y + 8,
            (Math.random() - 0.5) * 4, -Math.random() * 3,
            '#80d0ff', 20);
        }
      }
    }
  }

  game.sprays = game.sprays.filter(s => s.life > 0);
}

// ── Particles ──────────────────────────────────────────────

function updateParticles() {
  for (const p of game.particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.life--;
  }
  game.particles = game.particles.filter(p => p.life > 0);

  for (const ft of game.floatTexts) {
    ft.y += ft.vy;
    ft.life--;
  }
  game.floatTexts = game.floatTexts.filter(ft => ft.life > 0);
}

// ── Main Update ────────────────────────────────────────────

let prevTouchRun = false;

function update(dt) {
  game.animTimer++;
  if (game.animTimer >= 10) {
    game.animTimer = 0;
    game.animFrame = (game.animFrame + 1) % 4;
  }

  switch (game.state) {
    case STATE.TITLE:
      game.titleBlink++;
      if (isJumpJustPressed() || justPressed['Enter']) {
        initAudio();
        game.state = STATE.LEVELTRANS;
        game.transTimer = 90;
        game.level = 1;
        game.lives = 3;
        game.score = 0;
        game.coins = 0;
        game.ppower = 0;
      }
      break;

    case STATE.LEVELTRANS:
      game.transTimer--;
      if (game.transTimer <= 0) {
        loadLevel(game.level);
        game.state = STATE.PLAYING;
      }
      break;

    case STATE.PLAYING:
      updatePlayer(dt);
      if (!game.flagpoleGrabbed) {
        updateEnemies();
        updatePowerups();
        updateCoins();
        updateSprays();
      }
      updateParticles();
      break;

    case STATE.DYING:
      updatePlayer(dt);
      break;

    case STATE.GAMEOVER:
      if (isJumpJustPressed() || justPressed['Enter']) {
        game.state = STATE.TITLE;
      }
      break;

    case STATE.WIN:
      if (isJumpJustPressed() || justPressed['Enter']) {
        game.state = STATE.TITLE;
      }
      break;
  }

  prevTouchJump = touchState.jump;
  prevTouchRun = touchState.run;
  clearJustPressed();
  touchJustPressed.jump = false;
  touchJustPressed.run = false;
}

// ── Rendering ──────────────────────────────────────────────

function render() {
  ctx.imageSmoothingEnabled = false;

  switch (game.state) {
    case STATE.TITLE: renderTitle(); break;
    case STATE.LEVELTRANS: renderLevelTrans(); break;
    case STATE.PLAYING: renderGame(); break;
    case STATE.GAMEOVER: renderGameOver(); break;
    case STATE.WIN: renderWin(); break;
  }
}

function renderTitle() {
  // Background
  ctx.fillStyle = PAL.sky;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  // Clouds
  drawRect(30, 40, 40, 12, PAL.cloud);
  drawRect(34, 34, 32, 8, PAL.cloud);
  drawRect(180, 50, 40, 12, PAL.cloud);
  drawRect(184, 44, 32, 8, PAL.cloud);

  // Ground
  for (let gx = 0; gx < SCREEN_W; gx += TILE) {
    drawTile(T.GROUND, gx, SCREEN_H - TILE * 2);
    drawTile(T.GROUND, gx, SCREEN_H - TILE);
  }

  // Title
  drawText('BOLT', SCREEN_W / 2, 50, 16, PAL.belt, 'center');
  drawText('PEST CONTROL', SCREEN_W / 2, 72, 10, PAL.white, 'center');
  drawText('MAN', SCREEN_W / 2, 90, 16, PAL.belt, 'center');

  // Character preview
  drawPlayer(SCREEN_W / 2 - 8, 130, 1, game.animFrame, 0, 0);

  // Blink press start
  if (Math.floor(game.titleBlink / 30) % 2 === 0) {
    drawText('PRESS START', SCREEN_W / 2, 170, 8, PAL.white, 'center');
  }

  if (isTouchDevice) {
    drawText('TAP A TO START', SCREEN_W / 2, 185, 6, PAL.white, 'center');
  } else {
    drawText('Z/SPACE:JUMP X:RUN', SCREEN_W / 2, 185, 5, '#a0c0ff', 'center');
    drawText('ARROWS:MOVE', SCREEN_W / 2, 196, 5, '#a0c0ff', 'center');
  }

  // Version
  drawText('v1.0', SCREEN_W / 2, 220, 5, '#808080', 'center');
}

function renderLevelTrans() {
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  const ld = createLevel(game.level);
  drawText(ld.levelName, SCREEN_W / 2, 80, 10, PAL.white, 'center');

  // Show lives
  drawPlayer(SCREEN_W / 2 - 24, 110, 1, 0, game.ppower, 0);
  drawText('x ' + game.lives, SCREEN_W / 2, 116, 8, PAL.white, 'left');
}

function renderGame() {
  const ld = game.levelData;
  if (!ld) return;

  // Background
  ctx.fillStyle = ld.bgColor;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  const cx = Math.round(game.camX);
  const startCol = Math.floor(cx / TILE);
  const endCol = Math.ceil((cx + SCREEN_W) / TILE);
  const startRow = 0;
  const endRow = ld.height;

  // Draw background tiles (decorations) first
  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const tile = getTile(col, row);
      if (tile === T.CLOUD || tile === T.HILL || tile === T.BUSH) {
        drawTile(tile, col * TILE - cx, row * TILE);
      }
    }
  }

  // Draw coins
  for (const c of game.activeCoins) {
    if (!c.collected) {
      drawCoin(c.x - cx, c.y, game.animFrame);
    }
  }

  // Draw solid tiles
  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const tile = getTile(col, row);
      if (tile !== T.AIR && tile !== T.CLOUD && tile !== T.HILL && tile !== T.BUSH) {
        drawTile(tile, col * TILE - cx, row * TILE);
      }
    }
  }

  // Draw power-ups
  for (const pu of game.activePowerups) {
    if (pu.active) {
      drawPowerUp(pu.type, pu.x - cx, pu.y, game.animFrame);
    }
  }

  // Draw enemies
  for (const en of game.enemies) {
    drawEnemy(en.type, en.x - cx, en.y, en.frame, en.alive);
  }

  // Draw sprays
  for (const s of game.sprays) {
    drawSprayBullet(s.x - cx, s.y);
  }

  // Draw player
  if (!game.pdying) {
    drawPlayer(game.px - cx, game.py, game.pdir, game.pframe, game.ppower, game.pinvuln);
  } else {
    // Death animation - player floats up then falls
    drawPlayer(game.px - cx, game.py, game.pdir, 1, game.ppower, 0);
  }

  // Draw particles
  for (const p of game.particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    drawRect(p.x - cx, p.y, 4, 4, p.color);
    ctx.globalAlpha = 1;
  }

  // Float texts
  for (const ft of game.floatTexts) {
    const alpha = ft.life / 40;
    ctx.globalAlpha = alpha;
    drawText(ft.text, ft.x - cx, ft.y, 6, ft.color);
    ctx.globalAlpha = 1;
  }

  // HUD
  renderHUD();
}

function renderHUD() {
  // Semi-transparent bar
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, SCREEN_W, 18);

  drawText('SCORE', 4, 2, 5, '#a0a0ff');
  drawText(String(game.score).padStart(6, '0'), 4, 10, 6, PAL.white);

  drawText('COINS', 80, 2, 5, '#a0a0ff');
  drawText('x' + game.coins, 80, 10, 6, PAL.coinGold);

  drawText('WORLD', 140, 2, 5, '#a0a0ff');
  drawText('1-' + game.level, 140, 10, 6, PAL.white);

  drawText('TIME', 200, 2, 5, '#a0a0ff');
  drawText(String(game.time).padStart(3, '0'), 200, 10, 6, game.time <= 50 ? PAL.red : PAL.white);

  // Lives
  drawText('♥', 235, 10, 6, PAL.red);
  drawText('x' + game.lives, 243, 10, 5, PAL.white);

  // Power indicator
  if (game.ppower >= 2) {
    drawText('SPRAY', 170, 10, 4, PAL.sprayCan);
  } else if (game.ppower >= 3) {
    drawText('SPEED', 170, 10, 4, PAL.bootsRed);
  }
}

function renderGameOver() {
  ctx.fillStyle = PAL.black;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawText('GAME OVER', SCREEN_W / 2, 80, 14, PAL.red, 'center');
  drawText('FINAL SCORE', SCREEN_W / 2, 120, 8, PAL.white, 'center');
  drawText(String(game.score).padStart(8, '0'), SCREEN_W / 2, 140, 10, PAL.coinGold, 'center');

  if (Math.floor(game.titleBlink / 30) % 2 === 0) {
    drawText('PRESS START', SCREEN_W / 2, 180, 8, PAL.white, 'center');
  }
  game.titleBlink++;
}

function renderWin() {
  ctx.fillStyle = '#102040';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

  drawText('AREA CLEARED!', SCREEN_W / 2, 50, 10, PAL.green, 'center');
  drawText('ALL PESTS', SCREEN_W / 2, 80, 10, PAL.white, 'center');
  drawText('ELIMINATED!', SCREEN_W / 2, 96, 10, PAL.white, 'center');

  drawPlayer(SCREEN_W / 2 - 8, 120, 1, game.animFrame, game.ppower, 0);

  drawText('FINAL SCORE', SCREEN_W / 2, 160, 8, PAL.white, 'center');
  drawText(String(game.score).padStart(8, '0'), SCREEN_W / 2, 178, 10, PAL.coinGold, 'center');

  if (Math.floor(game.titleBlink / 30) % 2 === 0) {
    drawText('PRESS START', SCREEN_W / 2, 210, 8, PAL.white, 'center');
  }
  game.titleBlink++;
}

// ── Game Loop ──────────────────────────────────────────────

let lastTime = 0;

function gameLoop(timestamp) {
  const delta = timestamp - lastTime;
  lastTime = timestamp;

  // Single update per frame — simple and reliable for input
  if (delta > 0 && delta < 200) {
    update(1 / 60);
  }

  render();
  requestAnimationFrame(gameLoop);
}

// ── Debug / Test Hooks ─────────────────────────────────────

window.render_game_to_text = function() {
  return JSON.stringify({
    state: ['TITLE','PLAYING','DYING','GAMEOVER','WIN','LEVELTRANS'][game.state],
    level: game.level,
    lives: game.lives,
    score: game.score,
    coins: game.coins,
    time: game.time,
    player: { x: Math.round(game.px), y: Math.round(game.py), vx: game.pvx.toFixed(2), vy: game.pvy.toFixed(2), power: game.ppower, grounded: game.pgrounded, dir: game.pdir },
    enemies: game.enemies.filter(e => e.alive).length,
    totalEnemies: game.enemies.length,
    cam: { x: Math.round(game.camX) }
  });
};

window.advanceTime = function(ms) {
  const steps = Math.max(1, Math.round(ms / TICK_RATE));
  for (let i = 0; i < steps; i++) update(TICK_RATE / 1000);
  render();
};

// ── Init ───────────────────────────────────────────────────

setupTouch();
document.addEventListener('click', () => initAudio(), { once: true });
document.addEventListener('touchstart', () => initAudio(), { once: true });
requestAnimationFrame(gameLoop);

})();
