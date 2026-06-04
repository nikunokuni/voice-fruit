/**
 * voice-fruit-game / game.js
 *
 * モジュール構成
 *  1. 定数 (CONSTANTS)
 *  2. ゲーム状態 (GameState)
 *  3. プレイヤー (Player)
 *  4. フルーツ (Fruits)
 *  5. パーティクル (Particles)
 *  6. ローリングアップル (RollingApples)
 *  7. 描画 (Draw)
 *  8. 更新 (Update)
 *  9. ゲーム制御 (GameControl)
 * 10. 音声コマンド (VoiceCommands)
 * 11. 音声認識 (SpeechRecognition)
 * 12. 初期化 (Init)
 */

'use strict';

// ─────────────────────────────────────────────────
// 1. 定数 (CONSTANTS)
// ─────────────────────────────────────────────────

const CANVAS_W = 600;
const CANVAS_H = 480;
const GROUND_Y = CANVAS_H - 60;   // 地面のY座標
const BASKET_CATCH_W = 80;         // かごのキャッチ判定幅

const FRUIT_EMOJIS = ['🍎','🍊','🍋','🍇','🍓','🍑','🍒','🥝','🍍','🥭'];
const FRUIT_MAX_SPEED  = 4.0;
const FRUIT_BASE_SPAWN = 140;      // フルーツ生成間隔（フレーム）

/** 音声コマンドのクールダウン（ms） */
const CMD_COOLDOWN_MS = {
  jump:   500,
  praise: 3000,
  kago:   700,
  stop:   200,
  migi:   300,
  hidari: 300,
};

/** deg → rad 変換 */
const deg = d => d * Math.PI / 180;


// ─────────────────────────────────────────────────
// 2. ゲーム状態 (GameState)
// ─────────────────────────────────────────────────

const state = {
  phase: 'start',  // 'start' | 'playing' | 'gameover'
  score: 0,
  lives: 3,
  elapsed: 0,      // 経過秒数
  lastTime: 0,
  frameId: null,
  fruitSpawnTimer: 0,
};

/** ゲーム状態をリセット */
function resetState() {
  state.score = 0;
  state.lives = 3;
  state.elapsed = 0;
  state.lastTime = 0;
  state.fruitSpawnTimer = 0;
  fruits.length = 0;
  particles.length = 0;
  rollingApples.length = 0;
  droppedBasket = null;
}


// ─────────────────────────────────────────────────
// 3. プレイヤー (Player)
// ─────────────────────────────────────────────────

const player = {
  x: CANVAS_W / 2,
  y: GROUND_Y,
  vx: 0,
  vy: 0,
  onGround: true,
  facing: 1,        // 1=右向き  -1=左向き

  anim: 'idle',     // 'idle'|'walk'|'jump'|'blush'|'scratch'|'drop'|'pickup'
  animTimer: 0,
  dropTimer: 0,     // drop/blush/pickup アニメの残りフレーム数

  hasBasket: true,
  goingForBasket: false,
  moveDir: 0,       // -1=左連続移動  0=停止  1=右連続移動

  praisePhase: 0,   // 褒め演出フェーズ  0=なし 1=blush 2=scratch 3=drop
  praiseTimer: 0,   // 褒め演出内部タイマー
};

function resetPlayer() {
  player.x  = CANVAS_W / 2;
  player.y  = GROUND_Y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.facing = 1;
  player.hasBasket = true;
  player.goingForBasket = false;
  player.moveDir = 0;
  player.praisePhase = 0;
  player.praiseTimer = 0;
  setAnim('idle');
}

/** アニメーションを切り替える */
function setAnim(name) {
  player.anim = name;
  player.animTimer = 0;
}


// ─────────────────────────────────────────────────
// 4. フルーツ (Fruits)
// ─────────────────────────────────────────────────

/** @type {{ x:number, y:number, vy:number, emoji:string, size:number }[]} */
const fruits = [];

/** フルーツを1個スポーン */
function spawnFruit() {
  const speed = Math.min(0.9 + state.elapsed * 0.015, FRUIT_MAX_SPEED);
  fruits.push({
    x: 40 + Math.random() * (CANVAS_W - 80),
    y: -20,
    vy: speed,
    emoji: FRUIT_EMOJIS[Math.floor(Math.random() * FRUIT_EMOJIS.length)],
    size: 28,
  });
}


// ─────────────────────────────────────────────────
// 5. パーティクル (Particles)
// ─────────────────────────────────────────────────

/** @type {{ x:number, y:number, vx:number, vy:number, life:number, color:string, size:number }[]} */
const particles = [];

/**
 * パーティクルをn個スポーン
 * @param {number} x - 発生X座標
 * @param {number} y - 発生Y座標
 * @param {string} color - 色
 * @param {number} [n=8] - 個数
 */
function spawnParticles(x, y, color, n = 8) {
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    particles.push({
      x, y,
      vx: Math.cos(angle) * (2 + Math.random() * 4),
      vy: Math.sin(angle) * (2 + Math.random() * 4) - 3,
      life: 1.0,
      color,
      size: 5 + Math.random() * 5,
    });
  }
}


// ─────────────────────────────────────────────────
// 6. ローリングアップル (RollingApples)
// ─────────────────────────────────────────────────

/** @type {{ x:number, y:number, vx:number, vy:number, rot:number, rotV:number, life:number, bounces:number }[]} */
const rollingApples = [];

/**
 * かごから転がり出るりんごをスポーン
 * @param {number} px - 発生X座標
 * @param {number} py - 発生Y座標
 */
function spawnRollingApple(px, py) {
  const dir = Math.random() < 0.5 ? 1 : -1;
  rollingApples.push({
    x: px, y: py,
    vx: dir * (1.2 + Math.random() * 1.5),
    vy: -1.5,
    rot: 0,
    rotV: dir * (0.08 + Math.random() * 0.06),
    life: 1.0,
    bounces: 0,
  });
}

/** 落下中のかご（null = 持っている or 既に拾われた） */
let droppedBasket = null;


// ─────────────────────────────────────────────────
// 7. 描画 (Draw)
// ─────────────────────────────────────────────────

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// ── 背景 ──────────────────────────────────────────

function drawBackground() {
  // 空グラデーション
  const skyGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  skyGrad.addColorStop(0,   '#0d0620');
  skyGrad.addColorStop(0.7, '#1a0a3a');
  skyGrad.addColorStop(1,   '#2a1555');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // 地面
  const groundGrad = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
  groundGrad.addColorStop(0, '#3a2060');
  groundGrad.addColorStop(1, '#1a0a3a');
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);

  // 地面ライン
  ctx.strokeStyle = 'rgba(200,150,255,0.5)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#a050ff';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(CANVAS_W, GROUND_Y);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// ── かご形状 ──────────────────────────────────────

/**
 * かごを描画する（translate済みの座標 (cx, cy) を中心に描く）
 * @param {number} cx - 中心X
 * @param {number} cy - 中心Y
 * @param {number} [scl=1] - スケール
 */
function drawBasketShape(cx, cy, scl = 1) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scl, scl);

  ctx.strokeStyle = '#c8a87a';
  ctx.lineWidth = 2.5 / scl;
  ctx.lineCap = 'round';

  // U字ボディ
  ctx.beginPath();
  ctx.arc(0, 8, 14, 0, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-14, 8); ctx.lineTo(-14, 0);
  ctx.lineTo(14, 0);  ctx.lineTo(14, 8);
  ctx.stroke();

  // 編み目ライン
  ctx.lineWidth = 1.5 / scl;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 6, 0);
    ctx.lineTo(i * 6, 16);
    ctx.stroke();
  }

  ctx.restore();
}

/** 落下中のかごを描画 */
function drawDroppedBasket() {
  if (!droppedBasket) return;
  ctx.save();
  ctx.translate(droppedBasket.x, droppedBasket.y);
  ctx.rotate(droppedBasket.rot || 0);
  ctx.shadowColor = '#88ffaa';
  ctx.shadowBlur = 12;
  drawBasketShape(0, 0, 1.3);
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ── フルーツ ───────────────────────────────────────

function drawFruits() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fruits.forEach(f => {
    ctx.font = `${f.size}px serif`;
    ctx.fillText(f.emoji, f.x, f.y);
  });
}

// ── ローリングアップル ────────────────────────────

function drawRollingApples() {
  rollingApples.forEach(a => {
    ctx.save();
    ctx.globalAlpha = Math.min(a.life * 2, 1);
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🍎', 0, 0);
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

// ── パーティクル ──────────────────────────────────

function drawParticles() {
  particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

// ── プレイヤー ────────────────────────────────────

/**
 * 2関節の手足を描画し、先端座標を返す
 * @returns {{ x:number, y:number }} 先端座標
 */
function drawLimb(ox, oy, ang1, ang2, len1, len2) {
  const kx = ox + Math.sin(ang1) * len1;
  const ky = oy + Math.cos(ang1) * len1;
  const tx = kx + Math.sin(ang1 + ang2) * len2;
  const ty = ky + Math.cos(ang1 + ang2) * len2;

  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(tx, ty); ctx.stroke();

  // 関節ドット
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(kx, ky, 3.5, 0, Math.PI * 2); ctx.fill();

  return { x: tx, y: ty };
}

/**
 * アニメーション状態に合わせた関節角度を計算して返す
 * @returns {{ bodyLean, jumpSX, jumpSY, armAngL, elbowL, armAngR, elbowR, thighAngL, kneeL, thighAngR, kneeR }}
 */
function calcAnimPose() {
  const p = player;
  const t = p.animTimer;

  let bodyLean = 0, jumpSX = 1, jumpSY = 1;
  let armAngL = deg(-30), elbowL = deg(20);
  let armAngR = deg(30),  elbowR = deg(-20);
  let thighAngL = deg(0), kneeL = deg(5);
  let thighAngR = deg(0), kneeR = deg(5);

  switch (p.anim) {
    case 'walk': {
      const s  = Math.sin(t * 0.38);
      const s2 = Math.sin(t * 0.38 + Math.PI);
      const s3 = Math.sin(t * 0.55 + 1.2);
      const s4 = Math.sin(t * 0.25 + 2.5);
      bodyLean  = s * 35 + s4 * 15;
      armAngL   = deg(-10 + s  * 130 + s3 * 20);
      elbowL    = deg(20  + Math.abs(s)  * 130 + s3 * 30);
      armAngR   = deg(-10 + s2 * 130 - s3 * 20);
      elbowR    = deg(20  + Math.abs(s2) * 130 - s3 * 30);
      thighAngL = deg(s  * 95);
      kneeL     = deg(-Math.abs(s)  * 120 - 10);
      thighAngR = deg(s2 * 95);
      kneeR     = deg(-Math.abs(s2) * 120 - 10);
      break;
    }
    case 'jump': {
      const ps = Math.sin(Math.min(t / 14, 1) * Math.PI);
      jumpSY = 1 + ps * 0.55; jumpSX = 1 - ps * 0.32;
      armAngL = deg(-160 * ps); elbowL = deg(-70 * ps);
      armAngR = deg(-160 * ps); elbowR = deg(-70 * ps);
      thighAngL = deg(-35 * ps); kneeL = deg(-85 * ps);
      thighAngR = deg( 35 * ps); kneeR = deg(-85 * ps);
      break;
    }
    case 'blush': {
      const w  = Math.sin(t * 0.10);
      const w2 = Math.sin(t * 0.16 + 1.0);
      bodyLean  = w * 8 + w2 * 5;
      armAngL  = deg(-60 + w  * 20);  elbowL = deg(50 + Math.abs(w)  * 30);
      armAngR  = deg(-60 - w2 * 20);  elbowR = deg(50 + Math.abs(w2) * 30);
      thighAngL = deg(w  * 15);  kneeL = deg(-Math.abs(w)  * 20);
      thighAngR = deg(w2 * 15);  kneeR = deg(-Math.abs(w2) * 20);
      break;
    }
    case 'scratch': {
      const ps   = Math.min(p.praiseTimer / 120, 1);
      const ease = ps < 0.5 ? 2*ps*ps : -1+(4-2*ps)*ps;
      // 振り子は遷移完了後に開始
      const swing = ps >= 1 ? Math.sin(p.praiseTimer * 0.15) * 10 : 0;

      armAngL  = deg(ease * -115);          // 0 → 右腕を上に130°
      elbowL   = deg(ease * -95 + swing);   // 0 → 150°、完了後±10°振り子
      armAngR  = deg(ease * 60);           // 0 → 左腕を下に40°
      elbowR   = deg(ease * -130);           // 0 → 30°
      break;
    }
    case 'drop': {
      // scratchポーズをキープ＋右ひじ振り子継続
      const swing = Math.sin(p.praiseTimer * 0.15) * 5;
      armAngL  = deg(-115);
      elbowL   = deg(-95 + swing);
      armAngR  = deg(60);
      elbowR   = deg(-130);
      break;
    }
    case 'pickup': {
      const ps = Math.sin(Math.min(t / 22, 1) * Math.PI);
      armAngR  = deg(65 + ps * 65); elbowR = deg(-45 - ps * 45);
      armAngL  = deg(-25); elbowL = deg(35);
      thighAngL = deg(45 * ps); kneeL = deg(-75 * ps);
      thighAngR = deg(-25 * ps); kneeR = deg(-35 * ps);
      bodyLean  = 22 * ps;
      break;
    }
  }

  return { bodyLean, jumpSX, jumpSY, armAngL, elbowL, armAngR, elbowR, thighAngL, kneeL, thighAngR, kneeR };
}

/** プレイヤーキャラクターを描画 */
function drawPlayer() {
  const p = player;
  const {
    bodyLean, jumpSX, jumpSY,
    armAngL, elbowL, armAngR, elbowR,
    thighAngL, kneeL, thighAngR, kneeR,
  } = calcAnimPose();
  const t = p.animTimer;

  ctx.save();
  ctx.translate(p.x, p.y);

  // ── ボディ（facing方向に反転） ──
  ctx.save();
  ctx.scale(p.facing, 1);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';

  ctx.save();
  ctx.rotate(deg(bodyLean));
  ctx.scale(jumpSX, jumpSY);

  // 胴体
  ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(0, -18); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, -42, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -18, 3, 0, Math.PI * 2); ctx.fill();

  // 頭（輪郭）
  ctx.beginPath(); ctx.arc(0, -62, 13, 0, Math.PI * 2); ctx.stroke();

  ctx.restore();

  // 腕（肘関節付き）
  ctx.save();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.rotate(deg(bodyLean));
  const leftTip  = drawLimb(-4, -42, armAngL, elbowL, 18, 18);
  const rightTip = drawLimb( 4, -42, armAngR, elbowR, 18, 18);

  // かごを両手で持つ
  if (p.hasBasket && p.anim !== 'drop' && p.anim !== 'scratch') {
    const midX = (leftTip.x + rightTip.x) / 2;
    const midY = (leftTip.y + rightTip.y) / 2 - 28;
    ctx.save();
    ctx.strokeStyle = '#c8a87a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(leftTip.x,  leftTip.y);  ctx.lineTo(midX - 10, midY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rightTip.x, rightTip.y); ctx.lineTo(midX + 10, midY); ctx.stroke();
    ctx.restore();
    drawBasketShape(midX, midY, 1);
  }
  ctx.restore();

  // 脚（膝関節付き）
  ctx.save();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.rotate(deg(bodyLean));
  drawLimb(-5, -18, thighAngL, kneeL, 22, 22);
  drawLimb( 5, -18, thighAngR, kneeR, 22, 22);
  ctx.restore();

  ctx.restore(); // end scale(facing)

  // ── 顔（facing反転なし・常に正面） ──
  ctx.save();
  ctx.rotate(deg(bodyLean));
  ctx.scale(jumpSX, jumpSY);

  const isEmbarrassed = p.anim === 'scratch' || p.anim === 'drop';

  if (isEmbarrassed) {
    drawEmbarrassedFace();
  } else {
    drawHappyFace(t);
  }

  ctx.restore();
  ctx.restore(); // end translate
}

/** 照れ顔を描画 */
function drawEmbarrassedFace() {
  const p = player;
  const fy = -62
  const blushStrength = p.anim === 'scratch'
    ? 0.85 + Math.sin(p.praiseTimer * 0.2) * 0.1
    : 0.5 + Math.sin(p.praiseTimer * 0.15) * 0.2;

  // 頬赤み
  ctx.fillStyle = `rgba(255,80,80,${blushStrength})`;
  ctx.beginPath(); ctx.arc(-9, -58, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc( 9, -58, 5, 0, Math.PI * 2); ctx.fill();
//パーティクル
  ctx.font = '22px serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(100,200,255,0.9)';
  ctx.fillText('💕', 18, -72);
//眉
  ctx.strokeStyle = '#fff'; 
  ctx.lineWidth = 2.5;   
  ctx.beginPath(); 
  ctx.moveTo(-7,-65); 
  ctx.quadraticCurveTo(-4,-68,-1,-65); 
  ctx.stroke();   
  ctx.beginPath(); 
  ctx.moveTo( 7,-65); 
  ctx.quadraticCurveTo( 4,-68, 1,-65); 
  ctx.stroke(); 

// 照れた口（豆のような形）
ctx.save();
ctx.strokeStyle = '#fff';
ctx.lineCap = 'round';
ctx.lineWidth = 2.5;

ctx.beginPath(); // ★ここからパスを開始
ctx.moveTo(-5.5, -63); 

// ベジェ曲線で「豆の形」を一度に描く
// 制御点を使って上側と下側のカーブを表現
ctx.bezierCurveTo(-3,-62 , 3, -62, 5.5, -63); // 上側
ctx.bezierCurveTo(3, -60, -3, -60, -5.5, -63); // 下側
ctx.closePath(); // 始点と終点を閉じる
ctx.stroke(); // ★最後に一度だけ描画する
ctx.restore();
}
  
/**
 * 笑顔を描画
 * @param {number} animTimer - アニメーションタイマー
 */
function drawHappyFace(animTimer) {
  const p = player;
  const bounce =
    p.anim === 'walk'  ? Math.abs(Math.sin(animTimer * 0.38)) * 1.5 :
    p.anim === 'jump'  ? Math.sin(Math.min(animTimer / 14, 1) * Math.PI) * 2 :
    0;
  const fy = -62 + bounce * 0.3;

  // ほっぺ
  ctx.fillStyle = 'rgba(255,150,150,0.35)';
  ctx.beginPath(); ctx.ellipse(-9, fy + 5, 6, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse( 9, fy + 5, 6, 4, 0, 0, Math.PI * 2); ctx.fill();

  // 目（笑い弧）
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(-6, fy - 3, 5, Math.PI + 0.4, Math.PI * 2 - 0.4); ctx.stroke();
  ctx.beginPath(); ctx.arc( 6, fy - 3, 5, Math.PI + 0.4, Math.PI * 2 - 0.4); ctx.stroke();

  // 口（U字笑顔）
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, fy + 1, 7, 0.1, Math.PI - 0.1); ctx.stroke();

  // キラキラ星（idle/walk）
  if (p.anim === 'idle' || p.anim === 'walk') {
    const sparkle = 0.6 + Math.sin(animTimer * 0.15) * 0.4;
    ctx.fillStyle = `rgba(255,230,80,${sparkle})`;
    ctx.font = '8px serif';
    ctx.textAlign = 'center';
    ctx.fillText('✨', -14, fy - 10);
    ctx.fillText('✨',  14, fy - 10);
  }
}


// ─────────────────────────────────────────────────
// 8. 更新 (Update)
// ─────────────────────────────────────────────────

/** プレイヤーの物理更新 */
function updatePlayer() {
  const p = player;

  // 垂直移動（重力）
  if (!p.onGround) {
    p.vy += 0.55;
    p.y  += p.vy;
    if (p.y >= GROUND_Y) {
      p.y = GROUND_Y; p.vy = 0; p.onGround = true;
      if (p.anim === 'jump') setAnim('idle');
    }
  }

  // かごを拾いに自動スライド
  if (p.goingForBasket && !p.hasBasket && droppedBasket) {
    const dx = droppedBasket.x - p.x;
    if (Math.abs(dx) > 10) {
      p.vx = dx * 0.2;
      p.facing = dx > 0 ? 1 : -1;
      if (p.onGround) setAnim('walk');
    } else {
      p.hasBasket = true;
      p.goingForBasket = false;
      droppedBasket = null;
      setAnim('pickup');
      p.dropTimer = 28;
      showEffect('かごを拾った！🧺', '#aaffaa');
    }
  }

  // 水平移動
  p.x += p.vx;

  // 画面外 → ゲームオーバー
  if (p.x < -20 || p.x > CANVAS_W + 20) {
    endGame();
    return;
  }

  // 連続移動モード
  if (p.moveDir !== 0 && p.onGround && !p.goingForBasket) {
    p.vx = p.moveDir * 1.5;
    if (p.anim !== 'walk') setAnim('walk');
  } else if (p.moveDir === 0) {
    p.vx *= 0.75;
    if (Math.abs(p.vx) < 0.5 && p.onGround && p.anim === 'walk') setAnim('idle');
  } else {
    p.vx *= 0.80;
  }

  p.animTimer++;

  // 褒めタイマー
  if (['blush','scratch','drop'].includes(p.anim)) {
    p.praiseTimer++;
  } else {
    p.praiseTimer = 0;
  }

  // scratch 一定時間後 → drop アニメへ移行
  if (p.anim === 'scratch' && p.praisePhase === 2 && p.praiseTimer === 100) {
    p.praisePhase = 3;
    setAnim('drop');
    p.dropTimer = 999;
    document.getElementById('voice-log').innerHTML =
      `<span style="color:#ff8888">あっ！かごが…！🧺</span>`;
  }

  // drop/blush/pickup カウントダウン
  if (['drop','blush','pickup'].includes(p.anim)) {
    if (p.dropTimer > 0) p.dropTimer--;
    else setAnim('idle');
  }
}

/** 落下中かごの物理更新 */
function updateDroppedBasket() {
  if (!droppedBasket) return;
  const b = droppedBasket;

  b.vy  += 0.18;
  b.x   += b.vx;
  b.y   += b.vy;
  b.rot  = (b.rot || 0) + (b.rotV || 0);

  if (b.y >= GROUND_Y - 14) {
    b.y    = GROUND_Y - 14;
    b.vy  *= -0.28;
    b.vx  *= 0.72;
    if (b.rotV) b.rotV *= 0.6;

    // 初回着地でりんごが転がり出る
    if (!b._appleSpawned) {
      b._appleSpawned = true;
      spawnRollingApple(b.x, GROUND_Y);
    }
  }
}

/** フルーツのスポーン・移動・キャッチ判定を更新 */
function updateFruits() {
  // スポーン
  state.fruitSpawnTimer++;
  const spawnInterval = Math.max(60, FRUIT_BASE_SPAWN - state.elapsed * 1.1);
  if (state.fruitSpawnTimer >= spawnInterval) {
    state.fruitSpawnTimer = 0;
    spawnFruit();
  }

  // 移動・キャッチ・落下
  for (let i = fruits.length - 1; i >= 0; i--) {
    const f = fruits[i];
    f.y += f.vy;

    // キャッチ判定
    const caught =
      player.hasBasket &&
      player.anim !== 'drop' &&
      Math.abs(f.x - player.x)          < BASKET_CATCH_W &&
      Math.abs(f.y - (player.y - 48))   < 38;

    if (caught) {
      state.score++;
      updateScoreDisplay();
      spawnParticles(f.x, f.y, '#ffd700');
      fruits.splice(i, 1);
      continue;
    }

    // 地面まで落下
    if (f.y > CANVAS_H) {
      state.lives--;
      updateLivesDisplay();
      spawnParticles(f.x, CANVAS_H - 10, '#ff4444', 6);
      if (state.lives <= 0) endGame();
      fruits.splice(i, 1);
    }
  }
}

/** パーティクルの物理更新 */
function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.03;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

/** ローリングアップルの物理更新 */
function updateRollingApples() {
  for (let i = rollingApples.length - 1; i >= 0; i--) {
    const a = rollingApples[i];
    a.x += a.vx; a.y += a.vy; a.vy += 0.38; a.rot += a.rotV;

    if (a.y > GROUND_Y) {
      a.y = GROUND_Y; a.vy *= -0.32; a.vx *= 0.80; a.rotV *= 0.65;
      a.bounces++;
    }
    a.life -= a.bounces > 2 ? 0.011 : 0.004;
    if (a.life <= 0) rollingApples.splice(i, 1);
  }
}

/** メインアップデート（毎フレーム呼ばれる） */
function update(dt) {
  if (state.phase !== 'playing') return;

  state.elapsed += dt / 1000;

  updatePlayer();
  if (state.phase !== 'playing') return; // endGame が呼ばれた可能性

  updateDroppedBasket();
  updateFruits();
  updateParticles();
  updateRollingApples();

  document.getElementById('timer-display').textContent =
    `⏱ ${Math.floor(state.elapsed)}秒`;
}


// ─────────────────────────────────────────────────
// 9. ゲーム制御 (GameControl)
// ─────────────────────────────────────────────────

/** ゲーム開始 / リトライ */
function startGame() {
  state.phase = 'playing';
  resetState();
  resetPlayer();

  updateScoreDisplay();
  updateLivesDisplay();

  document.getElementById('start-screen').style.display    = 'none';
  document.getElementById('gameover-screen').style.display = 'none';

  if (state.frameId) cancelAnimationFrame(state.frameId);
  state.frameId = requestAnimationFrame(gameLoop);
}

/** ゲームオーバー */
function endGame() {
  state.phase = 'gameover';
  cancelAnimationFrame(state.frameId);

  document.getElementById('gameover-score').innerHTML =
    `スコア: <strong style="color:#ffd700;font-size:28px">${state.score}</strong> 個<br>` +
    `タイム: ${Math.floor(state.elapsed)} 秒`;
  document.getElementById('gameover-screen').style.display = 'flex';
}

function updateScoreDisplay() {
  document.getElementById('score-display').textContent = `🍎 ${state.score}`;
}

function updateLivesDisplay() {
  document.getElementById('lives-display').textContent =
    '❤️'.repeat(Math.max(0, state.lives));
}

/**
 * 画面中央に一時的なエフェクトメッセージを表示する
 * @param {string} text - 表示テキスト
 * @param {string} [color='#fff'] - テキスト色
 */
function showEffect(text, color = '#fff') {
  const el = document.getElementById('effect-msg');
  el.style.transition = 'none';
  el.style.opacity = 0;
  el.textContent = text;
  el.style.color = color;
  requestAnimationFrame(() => {
    el.style.opacity = 1;
    el.style.transform = 'translate(-50%, -60%) scale(1.2)';
    el.style.transition = 'opacity 1s ease, transform 1s ease';
    setTimeout(() => {
      el.style.opacity = 0;
      el.style.transform = 'translate(-50%, -80%) scale(0.85)';
    }, 1300);
  });
}

// ── メインループ ──────────────────────────────────

function gameLoop(ts) {
  const dt = ts - state.lastTime || 16;
  state.lastTime = ts;

  update(dt);

  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground();
  drawFruits();
  drawParticles();
  drawDroppedBasket();
  drawRollingApples();
  drawPlayer();

  state.frameId = requestAnimationFrame(gameLoop);
}


// ─────────────────────────────────────────────────
// 10. 音声コマンド (VoiceCommands)
// ─────────────────────────────────────────────────

/** クールダウン管理（各コマンドの最終発火時刻を保持） */
const cmdLastFired = Object.fromEntries(Object.keys(CMD_COOLDOWN_MS).map(k => [k, 0]));

/**
 * クールダウンを確認してコマンドを発火する
 * @param {string} key - コマンドキー
 * @param {Function} fn - 実行する関数
 * @returns {boolean} 発火したか
 */
function tryCmd(key, fn) {
  const now = Date.now();
  if (now - cmdLastFired[key] < CMD_COOLDOWN_MS[key]) return false;
  cmdLastFired[key] = now;
  fn();
  return true;
}

/**
 * 音声テキストを解析してコマンドを実行する
 * @param {string} text     - 認識テキスト
 * @param {boolean} isFinal - 確定結果か
 */
function handleCommand(text, isFinal) {
  if (state.phase !== 'playing') return;

  const log = document.getElementById('voice-log');

  if (/みぎ|ミギ|右/i.test(text)) {
    tryCmd('migi', () => {
      player.moveDir = 1; player.facing = 1;
      if (player.onGround) setAnim('walk');
      log.innerHTML = `「みぎ！」→ <span>右へ移動中…</span>`;
    });

  } else if (/ひだり|ヒダリ|左/i.test(text)) {
    tryCmd('hidari', () => {
      player.moveDir = -1; player.facing = -1;
      if (player.onGround) setAnim('walk');
      log.innerHTML = `「ひだり！」→ <span>左へ移動中…</span>`;
    });

  } else if (/とまる|止まる|とまれ|ストップ|stop/i.test(text)) {
    tryCmd('stop', () => {
      player.moveDir = 0; player.vx = 0;
      if (player.onGround) setAnim('idle');
      log.innerHTML = `「とまる！」→ <span>ストップ！</span>`;
    });

  } else if (/じゃ|じゃん|じゃんぷ|ジャンプ|jump/i.test(text)) {
    // 「じゃ」で即発火（高速反応）
    tryCmd('jump', () => {
      if (player.onGround) {
        player.vy = -17; player.onGround = false; setAnim('jump');
      }
      log.innerHTML = `「じゃんぷ！」→ <span>大ジャンプ！</span>`;
    });

  } else if (/かご|カゴ/i.test(text) || /^か/i.test(text)) {
    tryCmd('kago', () => {
      if (!player.hasBasket && droppedBasket) {
        player.goingForBasket = true;
        log.innerHTML = `「かご！」→ <span>かごを拾いに！🧺</span>`;
      } else if (player.hasBasket) {
        log.innerHTML = `「かご」→ <span style="color:#888">もう持ってるよ！</span>`;
      } else {
        log.innerHTML = `「かご」→ <span style="color:#888">かごがないよ…</span>`;
      }
    });

  } else if (isFinal && /ナイス|よくやった|nice|great/i.test(text)) {
    // 褒めると照れてかごを落とす
    tryCmd('praise', () => {
      player.moveDir = 0; player.vx = 0;
      setAnim('scratch');
      player.praisePhase = 2;
      player.praiseTimer = 0;
      log.innerHTML = `「${text}」→ <span style="color:#ff8888">えへへ… 💦</span>`;

      // かごをゆっくり落下させる
      if (player.hasBasket) {
        player.hasBasket = false;
        player.goingForBasket = false;
        droppedBasket = {
          x: player.x,
          y: player.y - 38,
          vx: (Math.random() - 0.5) * 0.6,
          vy: 0.3,
          rot: 0,
          rotV: (Math.random() - 0.5) * 0.04,
          _appleSpawned: false,
        };
      }

      // 一定時間後にスコア半減
      setTimeout(() => {
        if (player.praisePhase !== 3) return;
        const lost = Math.floor(state.score / 2);
        state.score = Math.max(0, state.score - lost);
        updateScoreDisplay();
        showEffect(`💔 -${lost}点！`, '#ff6666');
        log.innerHTML =
          `かごを落とした！<span style="color:#ff8888"> -${lost}点…「かご」と言って拾って！</span>`;
        player.praisePhase = 0;
        player.dropTimer = 60;
      }, 4800);
    });

  } else if (isFinal && text.trim()) {
    log.innerHTML = `「${text}」<span style="color:#555"> ← ?</span>`;
  }
}


// ─────────────────────────────────────────────────
// 11. 音声認識 (SpeechRecognition)
// ─────────────────────────────────────────────────

let recognition = null;
let isListening = false;
let lastInterimText = '';

/** SpeechRecognition を初期化する */
function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    document.getElementById('voice-log').textContent =
      '⚠️ Chrome推奨（音声認識非対応）';
    return false;
  }

  recognition = new SR();
  recognition.lang = 'ja-JP';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result  = e.results[i];
      const isFinal = result.isFinal;

      for (let j = 0; j < result.length; j++) {
        const text = result[j].transcript.trim();
        if (!text) continue;

        if (isFinal) {
          lastInterimText = '';
          handleCommand(text, true);
        } else if (text !== lastInterimText) {
          // 中間テキストが変わった瞬間だけ発火（高速反応）
          lastInterimText = text;
          handleCommand(text, false);
        }
      }
    }
  };

  recognition.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    document.getElementById('voice-log').textContent = `エラー: ${e.error}`;
  };

  recognition.onend = () => {
    // 連続認識を維持する
    if (isListening) {
      try { recognition.start(); } catch (ex) { /* ignore */ }
    }
  };

  return true;
}

/** マイクボタンのクリックハンドラ */
function onMicButtonClick() {
  const micBtn  = document.getElementById('mic-btn');
  const voiceLog = document.getElementById('voice-log');

  // 未初期化なら初期化
  if (!recognition) {
    if (!initSpeechRecognition()) return;
  }

  if (!isListening) {
    isListening = true;
    try { recognition.start(); } catch (e) { /* ignore */ }
    micBtn.classList.add('listening');
    micBtn.textContent = '🔴';
    voiceLog.innerHTML = '<span>認識中…はっきり話しかけて！</span>';
  } else {
    isListening = false;
    try { recognition.stop(); } catch (e) { /* ignore */ }
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎤';
    voiceLog.textContent = 'マイクボタンを押して音声認識を開始';
  }
}


// ─────────────────────────────────────────────────
// 12. 初期化 (Init)
// ─────────────────────────────────────────────────

document.getElementById('mic-btn').addEventListener('click', onMicButtonClick);
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('retry-btn').addEventListener('click', startGame);

// 初期状態（スタート画面）の描画
drawBackground();
drawPlayer();
