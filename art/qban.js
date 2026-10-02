/* Q版美术资源包 —— 独立绘制层，不依赖游戏运行时状态。
 *
 * 接线：index.html 中在 js/render.js 之前加 <script src="art/qban.js"></script>，
 * 再把 render.js 里对应函数体改为转调（签名保持兼容，游戏侧数据不用动）：
 *
 *   drawPlayer  → QArt.drawCharacter(ctx, { char: CHARS[i], aim: p.aim, gun: p.weapon.id,
 *                    lvl: p.weapon.lvl, t, moving: p.moving, anim: p.anim, recoil: 1 - p.cd / effCd,
 *                    bulk: CHARS[i].bulk, shotsPerDir: p.shotsPerDir })
 *   drawTear    → QArt.drawBullet(ctx, tr, t)   // tr 上可选 tr.bulletKey 覆盖分型；
 *                    我方按武器给 key：tear→'tear' laser→'laser' light→'spark' flame→'flame'
 *                    敌方按来源给 key：pooter→'bile' mushroom→'spore' bone→'shard'
 *                                      turret→'shell' boss→'ember' 其余→'ball'
 *   drawEnemy   → QArt.drawEnemy(ctx, { cfg: e.cfg, t, flash: e.flash, spawnT: e.spawnT,
 *                    elite: e.elite, state: e.state, faceLeft: player.x < e.x - 4,
 *                    look: { x: (player.x - e.x) / d, y: (player.y - e.y) / d } }, t)
 *   drawBoss    → QArt.drawBoss(ctx, { cfg: b.cfg, act: b.act, phase2: b.phase2, flash: b.flash,
 *                    look: … }, t)
 *   drawFx      → 新增 fx 类型：'flash' 用 QArt.muzzleFlash、'casing' 用 QArt.casing、
 *                 'spark' 用 QArt.impactSpark、'tele' 用 QArt.telegraph、'puff' 用 QArt.deathPuff
 *                 这些函数只画不推进，寿命/递减由调用方维护（k 传 1→0）。
 *   激光束     → QArt.laserBeam(ctx, { x1, y1, x2, y2, lvl, k })
 *                 替换 drawFx 的 'laser' 分支；数据侧需把 entities.js:156 的 `w: 5 + 2.2 * lvl`
 *                 改为传 `lvl`（芯宽已由本函数按等级推导，Lv1 1.5px → Lv5 7.7px）。
 *   闪电链     → QArt.chainBolt(ctx, { pts, lvl, k })
 *                 替换 drawFx 的 'bolt' 分支；该分支现在 lineWidth 写死 3 且 fx 不带等级，
 *                 需改为 `game.fx.push({ type:'bolt', pts, t, lvl })` 才有等级视觉（1.3px → 5.1px）。
 *
 * 尺寸约定：所有函数原点 = 实体中心，单位与游戏一致（1 格 = 48px，玩家 r=15）。
 * 反馈类半径建议按实体 r 推导：muzzleFlash r ≈ 子弹 r × 1.3（激光等重型武器用 r ≈ 10，
 * 冲锋枪用 r ≈ 7，否则在 1:1 视角下会盖过角色头部）。
 * 预览：art/gallery.html，导出图版 node art/export-sheets.js [t]。 */
(function (global) {
'use strict';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);

function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function shade(hex, amt) {
  const [r, g, b] = hex2rgb(hex);
  const f = v => clamp(Math.round(v + amt), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function withAlpha(hex, a) { const [r, g, b] = hex2rgb(hex); return `rgba(${r},${g},${b},${a})`; }
function mixHex(h1, h2, k) {
  const a = hex2rgb(h1), b = hex2rgb(h2);
  return `rgb(${Math.round(lerp(a[0], b[0], k))},${Math.round(lerp(a[1], b[1], k))},${Math.round(lerp(a[2], b[2], k))})`;
}

// ── Q 版描边与体积感基元 ──
const OL = 'rgba(20,11,7,.92)';        // 主描边：粗、偏暖黑
function out(ctx, w) { ctx.strokeStyle = OL; ctx.lineWidth = w || 2.6; ctx.lineJoin = 'round'; ctx.stroke(); }
function blob(ctx, x, y, rx, ry, rot, fill, w) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  out(ctx, w);
}
// 高光：左上主光 + 右下反光，Q 版靠这两笔撑体积
function gloss(ctx, x, y, rx, ry, rot, a) {
  ctx.fillStyle = `rgba(255,255,255,${a === undefined ? .3 : a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill();
}
function shadow(ctx, y, rx) {
  ctx.fillStyle = 'rgba(0,0,0,.34)';
  ctx.beginPath(); ctx.ellipse(0, y, rx, rx * .32, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath(); ctx.ellipse(0, y, rx * 1.35, rx * .42, 0, 0, TAU); ctx.fill();
}
// Q 版大眼：白底 + 大瞳孔 + 双高光，pupil 偏移即视线方向
function eye(ctx, x, y, r, px, py, opts) {
  const o = opts || {};
  ctx.fillStyle = o.sclera || '#fffdf8';
  ctx.beginPath(); ctx.ellipse(x, y, r * (o.wide || 1), r * (o.tall || 1.12), 0, 0, TAU); ctx.fill();
  if (o.rim !== false) { ctx.strokeStyle = 'rgba(28,16,10,.75)'; ctx.lineWidth = o.rimW || 1.5; ctx.stroke(); }
  const pr = r * (o.pupil || .58);
  ctx.fillStyle = o.iris ? (typeof o.iris === 'string' ? o.iris : o.iris[0]) : '#251812';
  ctx.beginPath(); ctx.arc(x + px * r * .42, y + py * r * .42, pr, 0, TAU); ctx.fill();
  if (o.iris && Array.isArray(o.iris)) {
    ctx.fillStyle = o.iris[1];
    ctx.beginPath(); ctx.arc(x + px * r * .42, y + py * r * .42, pr * .5, 0, TAU); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.beginPath(); ctx.arc(x + px * r * .42 - pr * .38, y + py * r * .42 - pr * .42, pr * .34, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.beginPath(); ctx.arc(x + px * r * .42 + pr * .34, y + py * r * .42 + pr * .3, pr * .18, 0, TAU); ctx.fill();
}
function blush(ctx, x, y, r, c) {
  ctx.fillStyle = c || 'rgba(240,120,110,.32)';
  ctx.beginPath(); ctx.ellipse(x, y, r, r * .62, 0, 0, TAU); ctx.fill();
}
// 眉毛：Q 版表情一半靠它，angry 时内低外高
function brow(ctx, x, y, w, tilt, col) {
  ctx.strokeStyle = col || 'rgba(28,16,10,.9)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - w, y + tilt); ctx.lineTo(x + w, y - tilt); ctx.stroke();
}

// ─────────────────────────────────────────────
// 一、枪械：4 型 × 5 级，Q 版粗短比例
// 局部坐标：握把在原点，枪管朝 +x；朝左由调用方 scale(1,-1) 镜像
// ─────────────────────────────────────────────
const GUNS = {
  tear:  { c: '#9cc4ee', name: '制式冲锋枪' },
  laser: { c: '#ff5f5f', name: '激光枪' },
  light: { c: '#ffe066', name: '闪电枪' },
  flame: { c: '#ff9040', name: '火焰枪' },
};

function drawGun(ctx, o) {
  const id = o.id || 'tear', lvl = clamp(o.lvl || 1, 1, 5), t = o.t || 0;
  const base = o.tint || '#3a3d42', acc = (GUNS[id] || GUNS.tear).c;
  const s = o.scale || 1;
  const kick = -(o.recoil || 0) * 3.2;
  ctx.save();
  ctx.scale(s, s); ctx.translate(kick, 0);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const dark = shade(base, -34), lite = shade(base, 30);
  const part = (path, fill) => { path(); ctx.fillStyle = fill; ctx.fill(); out(ctx, 2.2); };

  if (id === 'tear') {
    // 冲锋枪：圆鼓机匣 + 粗短枪管 + 大香蕉弹匣 + 托底
    part(() => { ctx.beginPath(); ctx.roundRect(-6, -4.5, 17, 9.5, 4); }, base);      // 机匣
    part(() => { ctx.beginPath(); ctx.roundRect(11, -2.6, 10, 5.6, 2.6); }, dark);    // 枪管
    part(() => { ctx.beginPath(); ctx.arc(21.5, 0, 3.4, 0, TAU); }, lite);            // 消焰器
    part(() => { ctx.beginPath(); ctx.moveTo(1, 4); ctx.quadraticCurveTo(2, 12, 8, 13.5); ctx.lineTo(11, 13.5); ctx.quadraticCurveTo(6, 8, 5, 4); ctx.closePath(); }, acc); // 弹匣
    part(() => { ctx.beginPath(); ctx.roundRect(-9.5, -2.2, 5, 6.5, 2.4); }, dark);   // 托
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.roundRect(-4, -3.6, 12, 1.8, 1); ctx.fill();
    if (lvl >= 3) part(() => { ctx.beginPath(); ctx.arc(6.5, 8.5, 5.2, 0, TAU); }, shade(acc, -18)); // 弹鼓
    if (lvl >= 5) { part(() => { ctx.beginPath(); ctx.roundRect(1, -8.4, 9, 3.6, 1.8); }, '#2b2f36'); ctx.fillStyle = withAlpha(acc, .9); ctx.beginPath(); ctx.arc(5.5, -6.6, 1.3, 0, TAU); ctx.fill(); }
  } else if (id === 'laser') {
    // 激光枪：粗筒机身 + 顶散热鳍 + 侧能量仓 + 大透镜
    part(() => { ctx.beginPath(); ctx.roundRect(-7, -5, 20, 10.5, 5); }, base);
    ctx.strokeStyle = dark; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-2 + i * 4.5, -5.4); ctx.lineTo(-2 + i * 4.5, -8.6); ctx.stroke(); }
    part(() => { ctx.beginPath(); ctx.roundRect(2, 4.4, 9, 5.4, 2.4); }, withAlpha(acc, .92));      // 能量条
    part(() => { ctx.beginPath(); ctx.moveTo(13, -4); ctx.lineTo(19, -2.4); ctx.lineTo(19, 2.4); ctx.lineTo(13, 4); ctx.closePath(); }, dark); // 收敛锥
    ctx.beginPath(); ctx.arc(20.4, 0, 3.3 + lvl * .5, 0, TAU); ctx.fillStyle = shade(acc, -46); ctx.fill(); out(ctx, 2.2);
    const pulse = .55 + .45 * Math.sin(t * .18);
    ctx.fillStyle = withAlpha('#fff2f0', .55 + .4 * pulse);
    ctx.beginPath(); ctx.arc(20.4, 0, (1.8 + lvl * .3) * (.7 + .3 * pulse), 0, TAU); ctx.fill();
    ctx.fillStyle = withAlpha(acc, .35);
    ctx.beginPath(); ctx.arc(20.4, 0, (4.6 + lvl * 1.1) + pulse * 2, 0, TAU); ctx.fill();
    if (lvl >= 3) { part(() => { ctx.beginPath(); ctx.roundRect(-10, -3, 5, 8, 2.4); }, acc); }
    if (lvl >= 5) { ctx.strokeStyle = withAlpha('#ffd8d0', .85); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(20.4, 0, 8.4, -1.1, 1.1); ctx.stroke(); ctx.beginPath(); ctx.arc(20.4, 0, 8.4, Math.PI - 1.1, Math.PI + 1.1); ctx.stroke(); }
  } else if (id === 'light') {
    // 闪电枪：机身绕线圈 + 双叉特斯拉极 + 极间电弧球
    part(() => { ctx.beginPath(); ctx.roundRect(-7, -4.4, 17, 9.4, 4.4); }, base);
    ctx.strokeStyle = shade(acc, -22); ctx.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-3 + i * 3.6, 0, 1.7, 5.2, 0, 0, TAU); ctx.stroke(); }
    part(() => { ctx.beginPath(); ctx.moveTo(10, -4.4); ctx.lineTo(19, -7.6); ctx.lineTo(20.4, -4.4); ctx.lineTo(13, -2.2); ctx.closePath(); }, lite); // 上叉
    part(() => { ctx.beginPath(); ctx.moveTo(10, 4.4); ctx.lineTo(19, 7.6); ctx.lineTo(20.4, 4.4); ctx.lineTo(13, 2.2); ctx.closePath(); }, lite);      // 下叉
    const sp = .6 + .4 * Math.sin(t * .3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = withAlpha('#fff6c8', .9);
    ctx.beginPath(); ctx.arc(20.6, 0, (1.7 + lvl * .45) * sp + 1, 0, TAU); ctx.fill();
    ctx.strokeStyle = withAlpha(acc, .85); ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const a = t * .3 + i * 2.1;
      ctx.beginPath(); ctx.moveTo(20.6, 0);
      ctx.lineTo(20.6 + Math.cos(a) * (4.6 + lvl * 1.1), Math.sin(a) * (4.6 + lvl * 1.1));
      ctx.lineTo(20.6 + Math.cos(a + .5) * (7 + lvl * 1.4), Math.sin(a + .5) * (7 + lvl * 1.4)); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    if (lvl >= 3) part(() => { ctx.beginPath(); ctx.roundRect(-11, -2.6, 5.4, 7, 2.2); }, acc);
    if (lvl >= 5) { ctx.fillStyle = withAlpha(acc, .95); ctx.beginPath(); ctx.arc(1.5, -8.6, 2.4, 0, TAU); ctx.fill(); ctx.strokeStyle = OL; ctx.lineWidth = 1.4; ctx.stroke(); }
  } else {
    // 火焰枪：背挂油罐 + 肋纹颈管 + 大喇叭喷口 + 常明火苗
    part(() => { ctx.beginPath(); ctx.roundRect(-13, -5.4, 8.5, 11.5, 4); }, shade('#8a5a2a', o.tint ? 0 : 6));
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-13, -1); ctx.lineTo(-4.5, -1); ctx.stroke();
    part(() => { ctx.beginPath(); ctx.roundRect(-6, -4, 12, 8.4, 3.4); }, base);
    ctx.strokeStyle = dark; ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(6.4 + i * 1.9, -4); ctx.lineTo(6.4 + i * 1.9, 4.4); ctx.stroke(); }
    part(() => { ctx.beginPath(); ctx.moveTo(11, -3.4); ctx.lineTo(19, -7.4); ctx.lineTo(21, -7.4); ctx.lineTo(21, 7.4); ctx.lineTo(19, 7.4); ctx.lineTo(11, 3.4); ctx.closePath(); }, lite);
    ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.ellipse(20.6, 0, 2, 6.4, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const fl = .7 + .3 * Math.sin(t * .5);
    ctx.fillStyle = withAlpha('#ffd24a', .8);
    ctx.beginPath(); ctx.ellipse(23.4, 0, 3.4 * fl, 2.6 * fl, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = withAlpha(acc, .5);
    ctx.beginPath(); ctx.ellipse(25.6, 0, 4.4 * fl, 3.4 * fl, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    if (lvl >= 3) part(() => { ctx.beginPath(); ctx.roundRect(-2, 4.4, 8, 4.6, 2.2); }, acc);
    if (lvl >= 5) { ctx.strokeStyle = withAlpha('#ffe9b0', .8); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(20.6, 0, 9.6, -1.15, 1.15); ctx.stroke(); }
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
// 二、角色：Q 版 1.3 头身，大眼小短腿
// 原点 = 身体中心（与游戏 p.x/p.y 一致），脚底约 y=+18
// ─────────────────────────────────────────────
const PALETTES = [
  { id: 'veteran',  hair: '#5a4634', style: 'short',    suit: '#4a5a3e', skin: '#d9b08c', gun: '#3a3d42', accent: '#c9a24a' },
  { id: 'agent',    hair: '#8a4a2e', style: 'ponytail', suit: '#3e4658', skin: '#e6c0a0', gun: '#2e3238', accent: '#c94a6a' },
  { id: 'girl',     hair: '#c98a3a', style: 'twintail', suit: '#7a3e58', skin: '#ecc9ae', gun: '#4a4048', accent: '#e86aa0' },
  { id: 'operator', hair: '#2a2a2e', style: 'cap',      suit: '#2e2e34', skin: '#c9a07e', gun: '#1e2024', accent: '#7fb2e8' },
];
function paletteOf(char) {
  if (typeof char === 'number') return PALETTES[((char % PALETTES.length) + PALETTES.length) % PALETTES.length];
  if (char && char.id) return Object.assign({}, PALETTES.find(p => p.id === char.id) || PALETTES[0], char);
  return char || PALETTES[0];
}

function drawCharacter(ctx, o) {
  const ch = paletteOf(o.char);
  const t = o.t || 0, moving = !!o.moving, anim = o.anim || 0;
  const aim = o.aim || { x: 0, y: 1 };
  const ga = Math.atan2(aim.y, aim.x);
  const recoil = clamp(o.recoil || 0, 0, 1);
  const bulk = o.bulk || 1;
  const bob = moving ? Math.abs(Math.sin(anim * .28)) * 1.8 : Math.sin(t * .06) * 1.2;
  const step = moving ? Math.sin(anim * .28) : 0;
  const hr = 12.6, hy = -11.5 + bob * .3, bw = 10.4 * bulk;

  ctx.save();
  shadow(ctx, 20, 12.5 * bulk);
  if (moving) ctx.rotate(clamp(aim.x, -1, 1) * .05 + step * .012);
  ctx.translate(0, -bob * .35);

  // 后发（双马尾/长发画在身后，不框脸）
  if (ch.style === 'twintail') {
    for (const sgn of [-1, 1]) {
      const sw = Math.sin(t * .1 + (sgn > 0 ? 1 : 0)) * .14;
      ctx.save(); ctx.translate(sgn * hr * 1.02, hy + hr * .42); ctx.rotate(sgn * (.3 + sw));
      ctx.strokeStyle = ch.hair; ctx.lineWidth = 8.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sgn * 7, 11, sgn * 3, 24); ctx.stroke();
      ctx.strokeStyle = shade(ch.hair, 24); ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.moveTo(sgn * .6, 5); ctx.quadraticCurveTo(sgn * 5.4, 13, sgn * 2.6, 22); ctx.stroke();
      ctx.fillStyle = ch.accent; ctx.beginPath(); ctx.ellipse(0, 1.5, 3.4, 2.6, sgn * .4, 0, TAU); ctx.fill(); out(ctx, 1.4);
      ctx.restore();
    }
  }
  if (ch.style === 'ponytail') {
    const sw = Math.sin(t * .09) * .16 + (aim.x > .5 ? .18 : 0);
    ctx.save(); ctx.translate(-hr * .72, hy - hr * .58); ctx.rotate(-.85 + sw);
    ctx.strokeStyle = ch.hair; ctx.lineWidth = 7.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-9, 10, -6.5, 25); ctx.stroke();
    ctx.strokeStyle = shade(ch.hair, 22); ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-.5, 5); ctx.quadraticCurveTo(-6.5, 13, -4.8, 23); ctx.stroke();
    ctx.fillStyle = ch.accent; ctx.beginPath(); ctx.ellipse(0, 2, 3.6, 2.4, .45, 0, TAU); ctx.fill(); out(ctx, 1.3);
    ctx.restore();
  }

  // 小短腿（靴子占大半，显腿短）
  for (const sgn of [-1, 1]) {
    const sw = step * sgn * 3.2;
    ctx.save(); ctx.translate(sgn * 4.4 * bulk, 11);
    ctx.fillStyle = shade(ch.suit, -26);
    ctx.beginPath(); ctx.roundRect(-3.2, 0, 6.4, 4.5 + sw * .2, 2.6); ctx.fill(); out(ctx, 1.8);
    ctx.fillStyle = '#241c16';
    ctx.beginPath(); ctx.roundRect(-3.8, 3.6 + sw * .2, 8, 4.8, 2.4); ctx.fill(); out(ctx, 1.6);
    gloss(ctx, -.4, 4.9 + sw * .2, 2.4, .9, 0, .18);
    ctx.restore();
  }

  // 桶状身体：需要露出肩、腰、靴三段，不能被头吞掉
  ctx.beginPath(); ctx.ellipse(0, 4.5 + bob * .2, bw, 9.2, 0, 0, TAU);
  ctx.fillStyle = ch.suit; ctx.fill(); out(ctx, 2.6);
  gloss(ctx, -bw * .38, 1.4 + bob * .2, bw * .4, 3, -.5, .15);
  ctx.strokeStyle = shade(ch.suit, -36); ctx.lineWidth = 2.4;               // 背带（X 型，Q 版识别点）
  ctx.beginPath(); ctx.moveTo(-bw * .55, 0 + bob * .2); ctx.lineTo(bw * .5, 6 + bob * .2);
  ctx.moveTo(bw * .55, 0 + bob * .2); ctx.lineTo(-bw * .5, 6 + bob * .2); ctx.stroke();
  ctx.fillStyle = shade(ch.suit, -42);
  ctx.beginPath(); ctx.roundRect(-bw, 8.4 + bob * .2, bw * 2, 3.2, 1.6); ctx.fill();
  ctx.fillStyle = ch.accent;
  ctx.beginPath(); ctx.roundRect(-1.8, 8.2 + bob * .2, 3.6, 3.6, 1.2); ctx.fill();

  const gunFront = aim.y >= -.25;
  const drawArmsGun = withArms => {
    ctx.save();
    ctx.rotate(ga);
    // 朝上瞄准时枪口让到肩侧，避免枪管横穿脸（俯视双摇杆的常规处理）
    if (!gunFront) ctx.translate(-1, aim.x >= 0 ? 11 : -11);
    ctx.translate(1, 3 + bob * .25);
    if (Math.cos(ga) < 0) ctx.scale(1, -1);
    if (withArms) {
      ctx.strokeStyle = shade(ch.suit, -12); ctx.lineWidth = 4.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-2, 2); ctx.lineTo(3, .5); ctx.stroke();
      ctx.fillStyle = ch.skin;
      ctx.beginPath(); ctx.arc(3.4, .4, 2.9, 0, TAU); ctx.fill(); out(ctx, 1.5);
    }
    drawGun(ctx, { id: o.gun || 'tear', lvl: o.lvl || 1, t, tint: ch.gun, recoil, scale: .94 });
    if (withArms) {
      ctx.strokeStyle = shade(ch.suit, -4); ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(12, 3); ctx.lineTo(16, 1); ctx.stroke();
      ctx.fillStyle = ch.skin;
      ctx.beginPath(); ctx.arc(16.4, .6, 2.9, 0, TAU); ctx.fill(); out(ctx, 1.5);
    }
    ctx.restore();
  };
  if (gunFront) drawArmsGun(true);

  // 大脑袋
  const hg = ctx.createRadialGradient(-hr * .3, hy - hr * .4, hr * .2, 0, hy, hr * 1.15);
  hg.addColorStop(0, shade(ch.skin, 20)); hg.addColorStop(1, ch.skin);
  ctx.beginPath(); ctx.arc(0, hy, hr, 0, TAU); ctx.fillStyle = hg; ctx.fill(); out(ctx, 2.6);

  // 发型 / 头饰：四人剪影必须一眼分开
  ctx.fillStyle = ch.hair;
  if (ch.style === 'short') {
    // 老兵：寸头 + 头带（额前一条 accent，远距离也能认出）
    ctx.beginPath(); ctx.arc(0, hy + .8, hr * 1.02, Math.PI * .98, Math.PI * 2.02); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-hr * .95, hy - hr * .28); ctx.quadraticCurveTo(-hr * .1, hy - hr * 1.05, hr * .92, hy - hr * .42);
    ctx.quadraticCurveTo(hr * .2, hy - hr * .8, -hr * .95, hy - hr * .28); ctx.fill();
    out(ctx, 1.6);
    ctx.fillStyle = ch.accent;
    ctx.beginPath(); ctx.roundRect(-hr * .98, hy - hr * .52, hr * 1.96, 3.4, 1.7); ctx.fill(); out(ctx, 1.3);
    gloss(ctx, -hr * .34, hy - hr * .86, hr * .28, hr * .1, -.5, .18);
  } else if (ch.style === 'ponytail') {
    // 女探员：高马尾 + 侧分长刘海
    ctx.beginPath(); ctx.arc(0, hy + .5, hr * 1.03, Math.PI * .95, Math.PI * 2.05); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-hr * .95, hy - hr * .3);
    ctx.quadraticCurveTo(-hr * .1, hy - hr * 1.15, hr * .95, hy - hr * .28);
    ctx.quadraticCurveTo(hr * .1, hy - hr * .62, -hr * .95, hy - hr * .3); ctx.fill();
    out(ctx, 1.6);
    ctx.fillStyle = shade(ch.hair, 18);                                          // 束发带而非发髻球，避免"头顶一颗球"
    ctx.beginPath(); ctx.ellipse(-hr * .62, hy - hr * .68, hr * .34, hr * .17, -.7, 0, TAU); ctx.fill(); out(ctx, 1.2);
    gloss(ctx, -hr * .34, hy - hr * .84, hr * .26, hr * .1, -.5, .2);
  } else if (ch.style === 'twintail') {
    // 少女：圆顶 + 三撮浅刘海（刘海只压到额头上沿，描边只走外圈，否则糊成睫毛带）
    ctx.beginPath();
    ctx.arc(0, hy - .4, hr * 1.06, Math.PI, TAU);
    for (let i = 1; i >= -1; i--) ctx.arc(i * hr * .58, hy - hr * .46, hr * .3, 0, Math.PI);
    ctx.closePath(); ctx.fill();
    ctx.save(); ctx.strokeStyle = OL; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, hy - .4, hr * 1.06, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = shade(ch.hair, 26); ctx.lineWidth = 1.6;
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sgn * hr * .5, hy - hr * .95); ctx.quadraticCurveTo(sgn * hr * .72, hy - hr * .5, sgn * hr * .62, hy - hr * .18); ctx.stroke(); }
    gloss(ctx, -hr * .3, hy - hr * .84, hr * .26, hr * .1, -.4, .22);
  } else {
    // 特工：战术帽（帽檐朝瞄准方向）+ 额前护目镜
    ctx.beginPath(); ctx.arc(0, hy - .6, hr * 1.05, Math.PI * .9, Math.PI * 2.1); ctx.fill();
    out(ctx, 1.7);
    const bx = clamp(aim.x, -1, 1) * hr * .95, byy = hy - hr * .42 + clamp(aim.y, -1, 1) * hr * .3;
    ctx.save(); ctx.translate(bx, byy); ctx.rotate(Math.atan2(aim.y, aim.x) * .35);
    ctx.fillStyle = shade(ch.hair, 14);
    ctx.beginPath(); ctx.ellipse(0, 0, hr * .82, 3.6, 0, 0, TAU); ctx.fill(); out(ctx, 1.5);
    ctx.restore();
    ctx.fillStyle = ch.accent;
    ctx.beginPath(); ctx.roundRect(-hr * .72, hy - hr * .74, hr * 1.44, 3.2, 1.6); ctx.fill();
  }

  // 五官：超大眼 + 腮红 + 小嘴
  const ex = clamp(aim.x, -1, 1), ey = clamp(aim.y, -1, 1);
  const iris = ch.style === 'cap' ? ['#2a3a4a', '#4a6a8a'] : ch.style === 'twintail' ? ['#3a2418', '#7a5a3a'] : ['#2a1c14', '#4a6a8a'];
  eye(ctx, -hr * .33, hy + hr * .2, hr * .29, ex, ey, { iris });
  eye(ctx, hr * .33, hy + hr * .2, hr * .29, ex, ey, { iris });
  blush(ctx, -hr * .66, hy + hr * .55, hr * .19);
  blush(ctx, hr * .66, hy + hr * .55, hr * .19);
  ctx.strokeStyle = 'rgba(60,30,22,.8)'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  if (recoil > .05) { ctx.fillStyle = 'rgba(60,26,20,.9)'; ctx.beginPath(); ctx.ellipse(0, hy + hr * .64, 2.2, 2.6 * recoil + .8, 0, 0, TAU); ctx.fill(); }
  else { ctx.beginPath(); ctx.moveTo(-2, hy + hr * .64); ctx.quadraticCurveTo(0, hy + hr * .76, 2, hy + hr * .64); ctx.stroke(); }

  if (!gunFront) drawArmsGun(false);

  // 多弹数：额前第三瞄具眼（道具可视化）
  if (o.shotsPerDir > 1) {
    ctx.fillStyle = '#8ecbff'; ctx.strokeStyle = OL; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, hy - hr * .58, 3, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(-.9, hy - hr * .68, 1.1, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
// 三、子弹：按武器/来源分型的预渲染精灵
// ─────────────────────────────────────────────
const BULLETS = {
  tear:   { friendly: true },
  laser:  { friendly: true },
  spark:  { friendly: true },
  flame:  { friendly: true },
  spore:  {},
  ball:   {},
  bile:   {},
  shard:  {},
  shell:  {},
  ember:  {},
};

function makeSprite(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  paint(c.getContext('2d'), c.width / 2, c.height / 2);
  c._w = c.width; c._h = c.height;
  return c;
}
const bulletCache = {};
function bulletSprite(kind, r, variant) {
  const key = kind + '|' + Math.round(r) + '|' + (variant || '');
  if (bulletCache[key]) return bulletCache[key];
  const R = Math.max(2.5, Math.round(r)), pad = R * 1.1;
  const w = (R + pad) * 2.6, h = (R + pad) * 2;
  const spr = makeSprite(w, h, (g, cx, cy) => {
    g.lineJoin = 'round'; g.lineCap = 'round';
    const OLw = Math.max(1.4, R * .22);
    if (kind === 'tear') {
      // 彗星水滴：圆头朝前 + 尖尾朝后，小尺寸下也能看出飞行方向
      const tail = R * 1.75;
      g.beginPath();
      g.moveTo(cx + R * .1, cy - R);
      g.arc(cx + R * .1, cy, R, -Math.PI / 2, Math.PI / 2);
      g.quadraticCurveTo(cx - tail * .5, cy + R * .5, cx - tail, cy);
      g.quadraticCurveTo(cx - tail * .5, cy - R * .5, cx + R * .1, cy - R);
      g.closePath();
      const grad = g.createLinearGradient(cx - tail, cy, cx + R, cy);
      grad.addColorStop(0, 'rgba(120,170,240,.35)'); grad.addColorStop(.42, '#7fb0e8');
      grad.addColorStop(.8, '#cfe9ff'); grad.addColorStop(1, '#ffffff');
      g.fillStyle = grad; g.fill();
      g.strokeStyle = 'rgba(22,38,66,.85)'; g.lineWidth = OLw; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.ellipse(cx + R * .35, cy - R * .34, R * .3, R * .19, -.5, 0, TAU); g.fill();
      if (variant === 'pierce') { // 贯穿：尾后两道刃形尾迹（不再是套环，避免看成眼睛）
        g.strokeStyle = 'rgba(215,245,255,.9)'; g.lineWidth = Math.max(1.4, R * .17); g.lineCap = 'round';
        for (const sgn of [-1, 1]) {
          g.beginPath(); g.moveTo(cx - R * 1.15, cy + sgn * R * .34);
          g.lineTo(cx - tail * 1.25, cy + sgn * R * .62); g.stroke();
        }
      }
    } else if (kind === 'laser') {
      g.save(); g.translate(cx - R * .1, cy); g.scale(2, 1);
      const halo = g.createRadialGradient(0, 0, R * .2, 0, 0, R * 1.05);
      halo.addColorStop(0, 'rgba(255,90,70,.5)'); halo.addColorStop(1, 'rgba(255,60,50,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(0, 0, R * 1.05, 0, TAU); g.fill(); g.restore();
      g.fillStyle = 'rgba(255,120,90,.75)'; g.beginPath(); g.ellipse(cx, cy, R * 1.6, R * .62, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff6f2'; g.beginPath(); g.ellipse(cx + R * .18, cy, R * 1.02, R * .32, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(120,20,16,.7)'; g.lineWidth = OLw * .75;
      g.beginPath(); g.ellipse(cx, cy, R * 1.6, R * .62, 0, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(cx + R * .8, cy - R * .05, R * .2, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,200,180,.8)';
      for (const sgn of [-1, 1]) { g.beginPath(); g.moveTo(cx - R * 1.5, cy + sgn * R * .5); g.lineTo(cx - R * 2.15, cy + sgn * R * .95); g.lineTo(cx - R * 1.2, cy + sgn * R * .18); g.closePath(); g.fill(); }
    } else if (kind === 'spark') {
      // 四角电星：长主轴 + 短副轴 + 外围爆裂线
      const halo = g.createRadialGradient(cx, cy, R * .2, cx, cy, R * 1.8);
      halo.addColorStop(0, 'rgba(255,235,140,.5)'); halo.addColorStop(.6, 'rgba(255,200,80,.18)'); halo.addColorStop(1, 'rgba(255,180,40,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, R * 1.8, 0, TAU); g.fill();
      const spike = (rx, ry) => {
        g.beginPath();
        g.moveTo(cx + rx, cy); g.lineTo(cx + rx * .18, cy - ry); g.lineTo(cx, cy - ry * 1.05);
        g.lineTo(cx - rx * .18, cy - ry); g.lineTo(cx - rx, cy); g.lineTo(cx - rx * .18, cy + ry);
        g.lineTo(cx, cy + ry * 1.05); g.lineTo(cx + rx * .18, cy + ry); g.closePath();
      };
      spike(R * 1.7, R * .62);
      const grad = g.createRadialGradient(cx, cy, R * .1, cx, cy, R * 1.7);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(.4, '#ffef9e'); grad.addColorStop(1, '#e89a18');
      g.fillStyle = grad; g.fill();
      g.strokeStyle = 'rgba(84,54,8,.8)'; g.lineWidth = OLw * .62; g.stroke();
      g.strokeStyle = 'rgba(255,248,200,.9)'; g.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * R * .8, cy + Math.sin(a) * R * .8);
        g.lineTo(cx + Math.cos(a) * R * 1.5 + 1.5, cy + Math.sin(a) * R * 1.5 - 1.5); g.stroke();
      }
    } else if (kind === 'flame') {
      // 火苗：前缘圆鼓（热核）→ 后方收尖拖尾，三层舌焰；不做成两头尖否则像镜片
      const tongue = (back, wide, col) => {
        g.beginPath();
        g.moveTo(cx + back * .55, cy - wide);
        g.quadraticCurveTo(cx + back * .82, cy - wide * .3, cx + back * .78, cy);
        g.quadraticCurveTo(cx + back * .82, cy + wide * .3, cx + back * .55, cy + wide);
        g.quadraticCurveTo(cx - back * .1, cy + wide * .62, cx - back, cy);
        g.quadraticCurveTo(cx - back * .1, cy - wide * .62, cx + back * .55, cy - wide);
        g.closePath(); g.fillStyle = col; g.fill();
      };
      tongue(R * 1.5, R * 1.0, 'rgba(255,96,18,.6)');
      tongue(R * 1.15, R * .72, 'rgba(255,168,52,.92)');
      tongue(R * .8, R * .42, 'rgba(255,250,220,.95)');
      g.fillStyle = 'rgba(255,190,90,.55)';
      for (const [dx, dy, rr] of [[-1.85, -.3, .16], [-2.05, .25, .12], [-1.6, .45, .1]]) {
        g.beginPath(); g.arc(cx + dx * R, cy + dy * R, rr * R, 0, TAU); g.fill();
      }
      g.fillStyle = 'rgba(120,60,20,.5)';
      g.beginPath(); g.arc(cx - R * 1.5, cy, R * .28, 0, TAU); g.fill();
    } else if (kind === 'bile') {
      // 敌弹·胆汁：下垂液滴 + 内气泡，与孢子绒球区分开
      g.beginPath();
      g.moveTo(cx, cy - R * 1.15);
      g.bezierCurveTo(cx + R * 1.05, cy - R * .35, cx + R * .95, cy + R * 1.02, cx, cy + R * 1.02);
      g.bezierCurveTo(cx - R * .95, cy + R * 1.02, cx - R * 1.05, cy - R * .35, cx, cy - R * 1.15);
      g.closePath();
      const grad = g.createRadialGradient(cx - R * .3, cy - R * .3, R * .1, cx, cy, R * 1.25);
      grad.addColorStop(0, '#eef7c8'); grad.addColorStop(.55, '#93c04c'); grad.addColorStop(1, '#3a5c1c');
      g.fillStyle = grad; g.fill(); g.strokeStyle = 'rgba(22,30,10,.9)'; g.lineWidth = OLw; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(cx - R * .28, cy - R * .34, R * .26, R * .16, -.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(30,48,12,.45)';
      for (const [dx, dy, rr] of [[.28, .3, .17], [-.2, .45, .12], [.1, -.05, .1]]) { g.beginPath(); g.arc(cx + dx * R, cy + dy * R, rr * R, 0, TAU); g.fill(); }
    } else if (kind === 'spore') {
      // 敌弹·孢子：绒边球 + 表面斑点（和胆汁的湿亮感区分）
      const halo = g.createRadialGradient(cx, cy, R * .3, cx, cy, R * 1.55);
      halo.addColorStop(0, 'rgba(190,230,150,.4)'); halo.addColorStop(1, 'rgba(140,190,110,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, R * 1.55, 0, TAU); g.fill();
      g.beginPath();
      for (let i = 0; i < 14; i++) { const a = i / 14 * TAU, rr = R * (1 + Math.sin(i * 3.1) * .13); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      g.closePath();
      const grad = g.createRadialGradient(cx - R * .3, cy - R * .3, R * .1, cx, cy, R);
      grad.addColorStop(0, '#f4f8e0'); grad.addColorStop(.6, '#a8c878'); grad.addColorStop(1, '#4e7038');
      g.fillStyle = grad; g.fill(); g.strokeStyle = 'rgba(28,36,16,.8)'; g.lineWidth = OLw; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.62)';
      for (const [dx, dy, rr] of [[-.32, -.28, .2], [.3, .06, .15], [-.02, .4, .13], [.24, -.42, .1]]) { g.beginPath(); g.arc(cx + dx * R, cy + dy * R, rr * R, 0, TAU); g.fill(); }
    } else if (kind === 'shard') {
      // 敌弹·骨刺：带关节头的骨片，方向性强
      g.beginPath();
      g.moveTo(cx + R * 1.6, cy);
      g.lineTo(cx + R * .15, cy - R * .58); g.lineTo(cx - R * 1.15, cy - R * .3);
      g.lineTo(cx - R * .95, cy + R * .42); g.lineTo(cx + R * .2, cy + R * .56);
      g.closePath();
      const grad = g.createLinearGradient(cx - R, cy, cx + R * 1.6, cy);
      grad.addColorStop(0, '#a89c82'); grad.addColorStop(.5, '#efe7d2'); grad.addColorStop(1, '#fffdf4');
      g.fillStyle = grad; g.fill(); g.strokeStyle = 'rgba(30,22,14,.9)'; g.lineWidth = OLw; g.stroke();
      g.fillStyle = '#efe7d2';
      g.beginPath(); g.arc(cx - R * 1.2, cy - R * .28, R * .3, 0, TAU); g.arc(cx - R * 1.02, cy + R * .38, R * .27, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(30,22,14,.75)'; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = 'rgba(90,70,45,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - R * .55, cy - R * .05); g.lineTo(cx + R * .6, cy + R * .08); g.stroke();
    } else if (kind === 'shell') {
      // 敌弹·炮弹：黄铜弹体 + 三尾翼，轮廓要"重"
      g.beginPath();
      g.moveTo(cx + R * 1.5, cy);
      g.quadraticCurveTo(cx + R * .5, cy - R * 1.02, cx - R * .42, cy - R * .66);
      g.lineTo(cx - R * .42, cy + R * .66);
      g.quadraticCurveTo(cx + R * .5, cy + R * 1.02, cx + R * 1.5, cy);
      g.closePath();
      const grad = g.createLinearGradient(cx, cy - R, cx, cy + R);
      grad.addColorStop(0, '#ffe08a'); grad.addColorStop(.42, '#c99a3a'); grad.addColorStop(1, '#6d4a12');
      g.fillStyle = grad; g.fill(); g.strokeStyle = 'rgba(28,18,6,.9)'; g.lineWidth = OLw; g.stroke();
      g.fillStyle = '#4a3a1c';
      for (const sgn of [-1, 0, 1]) {
        g.beginPath(); g.moveTo(cx - R * .42, cy + sgn * R * .3);
        g.lineTo(cx - R * 1.35, cy + sgn * R * .95); g.lineTo(cx - R * 1.1, cy + sgn * R * .1);
        g.closePath(); g.fill();
      }
      g.strokeStyle = 'rgba(28,18,6,.7)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(cx - R * .1, cy - R * .82); g.lineTo(cx - R * .1, cy + R * .82); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(cx + R * .45, cy - R * .34, R * .4, R * .12, -.3, 0, TAU); g.fill();
    } else if (kind === 'ember') {
      // 敌弹·余烬：多角煤块 + 内部裂纹发光
      const halo = g.createRadialGradient(cx, cy, R * .3, cx, cy, R * 1.75);
      halo.addColorStop(0, 'rgba(255,140,60,.5)'); halo.addColorStop(1, 'rgba(200,60,20,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, R * 1.75, 0, TAU); g.fill();
      g.beginPath();
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, rr = R * (i % 2 ? .74 : 1.12); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      g.closePath();
      const grad = g.createRadialGradient(cx - R * .2, cy - R * .2, R * .1, cx, cy, R * 1.1);
      grad.addColorStop(0, '#fff3cc'); grad.addColorStop(.4, '#ff9a3c'); grad.addColorStop(1, '#8f2410');
      g.fillStyle = grad; g.fill(); g.strokeStyle = 'rgba(36,8,4,.9)'; g.lineWidth = OLw; g.stroke();
      g.strokeStyle = 'rgba(255,236,170,.85)'; g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(cx - R * .5, cy - R * .2); g.lineTo(cx - R * .05, cy + R * .05); g.lineTo(cx + R * .3, cy - R * .3); g.stroke();
      g.beginPath(); g.moveTo(cx - R * .1, cy + R * .1); g.lineTo(cx + R * .15, cy + R * .55); g.stroke();
    } else { // ball：通用敌弹，红色糖果球
      g.beginPath(); g.arc(cx, cy, R, 0, TAU);
      const grad = g.createRadialGradient(cx - R * .32, cy - R * .34, R * .1, cx, cy, R * 1.05);
      grad.addColorStop(0, '#ffe9e0'); grad.addColorStop(.5, '#e07a5a'); grad.addColorStop(1, '#8f3320');
      g.fillStyle = grad; g.fill(); g.strokeStyle = 'rgba(40,8,0,.85)'; g.lineWidth = OLw; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(cx - R * .3, cy - R * .34, R * .26, R * .17, -.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(cx + R * .28, cy + R * .3, R * .12, 0, TAU); g.fill();
    }
  });
  bulletCache[key] = spr;
  return spr;
}

// kind 解析：优先显式 bulletKey，其次 colorKey，最后按敌我默认
function bulletKindOf(tr) {
  return tr.bulletKey || tr.colorKey || (tr.isPlayer ? 'tear' : 'ball');
}
function drawBullet(ctx, tr, t) {
  const kind = bulletKindOf(tr);
  if (kind === 'flame') { drawFlameBullet(ctx, tr, t); return; }
  const variant = kind === 'tear' ? (tr.pierce ? 'pierce' : (tr.big ? 'big' : '')) : '';
  const spr = bulletSprite(kind, tr.r, variant);
  const ang = kind === 'tear' || kind === 'shell' || kind === 'shard' || kind === 'laser' || kind === 'spark'
    ? Math.atan2(tr.vy, tr.vx) : 0;
  ctx.save();
  ctx.translate(tr.x, tr.y);
  if (ang) ctx.rotate(ang);
  if (kind === 'spark') ctx.rotate((t || 0) * .25);
  if (kind === 'tear' && tr.homing) { // 追踪弹：环绕小星，一眼看出附魔
    const a = (t || 0) * .3;
    ctx.fillStyle = 'rgba(200,225,255,.85)';
    for (let i = 0; i < 3; i++) { const aa = a + i * TAU / 3; ctx.beginPath(); ctx.arc(Math.cos(aa) * tr.r * 1.6, Math.sin(aa) * tr.r * 1.6, 1.4, 0, TAU); ctx.fill(); }
  }
  ctx.drawImage(spr, -spr._w / 2, -spr._h / 2);
  ctx.restore();
}
function drawFlameBullet(ctx, tr, t) {
  const spr = bulletSprite('flame', tr.r * (0.72 + 0.28 * clamp(tr.life / 12, .25, 1)));
  ctx.save();
  ctx.translate(tr.x, tr.y);
  ctx.rotate(Math.atan2(tr.vy, tr.vx));
  const w = spr._w * (1 + Math.sin((t || 0) * .6 + tr.x * .2) * .07);
  ctx.drawImage(spr, -w / 2, -spr._h / 2, w, spr._h);
  ctx.restore();
}

// ─────────────────────────────────────────────
// 四、攻击特性反馈：枪口火光 / 抛壳 / 命中火花 / 预警 / 死亡
// 这些资源只画不推进：调用方自行维护 t 与寿命
// ─────────────────────────────────────────────
function muzzleFlash(ctx, o) {
  const id = o.id || 'tear', k = clamp(o.k === undefined ? 1 : o.k, 0, 1);
  if (k <= 0) return;
  const ang = o.ang || 0, R = (o.r || 12) * (0.75 + 1.15 * k);
  ctx.save();
  ctx.translate(o.x, o.y); ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  if (id === 'tear') {
    // 六瓣星形 + 前冲光锥，连射时读起来是"哒哒哒"而不是一团糊光
    const grad = ctx.createRadialGradient(R * .5, 0, R * .1, R * .5, 0, R * 1.5);
    grad.addColorStop(0, `rgba(255,255,235,${.95 * k})`); grad.addColorStop(.45, `rgba(255,225,140,${.6 * k})`); grad.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, rr = (i % 2 ? R * .42 : R * (i === 0 ? 1.9 : 1.05));
      ctx.lineTo(R * .5 + Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${.9 * k})`;
    ctx.beginPath(); ctx.ellipse(R * .55, 0, R * .42 * k + 1.4, R * .3 * k + 1, 0, 0, TAU); ctx.fill();
  } else if (id === 'laser') {
    // 前冲式光爆：不做对称十字+整圆，那在低等级下读起来像瞄准具
    ctx.fillStyle = `rgba(255,80,70,${.42 * k})`;
    ctx.beginPath(); ctx.ellipse(R * .9, 0, R * 2.2, R * .95, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,240,230,${.95 * k})`; ctx.lineWidth = 3.4 * k + .6;
    ctx.beginPath(); ctx.moveTo(-R * .3, 0); ctx.lineTo(R * 2.7, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(R * .8, -R * .72); ctx.lineTo(R * .8, R * .72); ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${.95 * k})`;
    ctx.beginPath(); ctx.arc(R * .8, 0, R * .46 * k + 1.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,160,130,${.55 * k})`; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(R * .8, 0, R * (1 + (1 - k) * .9), -.9, .9); ctx.stroke();
    ctx.beginPath(); ctx.arc(R * .8, 0, R * (1 + (1 - k) * .9), Math.PI - .9, Math.PI + .9); ctx.stroke();
  } else if (id === 'light') {
    ctx.strokeStyle = `rgba(255,240,150,${.95 * k})`; ctx.lineWidth = 2.6;
    for (let i = 0; i < 7; i++) {
      const a = -.95 + i * .32, L = R * (1.15 + (i % 3) * .45);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * L * .55 + rand(-1.5, 1.5), Math.sin(a) * L * .55 + rand(-1.5, 1.5));
      ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L); ctx.stroke();
    }
    ctx.fillStyle = `rgba(255,255,235,${.9 * k})`; ctx.beginPath(); ctx.arc(0, 0, R * .45 * k + 1.2, 0, TAU); ctx.fill();
  } else {
    // 火焰：三团翻滚火球 + 前向热浪锥
    const cone = ctx.createLinearGradient(0, 0, R * 2.6, 0);
    cone.addColorStop(0, `rgba(255,200,110,${.55 * k})`); cone.addColorStop(1, 'rgba(255,120,30,0)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(0, -R * .5); ctx.lineTo(R * 2.6, -R * .95); ctx.lineTo(R * 2.6, R * .95); ctx.lineTo(0, R * .5); ctx.closePath(); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const a = -.62 + i * .25, d = R * (.55 + (i % 3) * .5);
      ctx.fillStyle = `rgba(${255},${150 + (i % 3) * 40},60,${.42 * k})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, R * (.52 - i * .045) * k + 1, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,248,215,${.85 * k})`;
    ctx.beginPath(); ctx.ellipse(R * .55, 0, R * .5 * k + 1, R * .34 * k + .8, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function casing(ctx, o) {
  const k = clamp(o.k === undefined ? 1 : o.k, 0, 1);
  ctx.save();
  ctx.translate(o.x, o.y); ctx.rotate(o.ang || 0);
  ctx.globalAlpha = clamp(k * 1.4, 0, 1);
  ctx.fillStyle = '#e0bb5c'; ctx.beginPath(); ctx.roundRect(-3.6, -1.9, 7.2, 3.8, 1.4); ctx.fill();
  ctx.strokeStyle = 'rgba(40,26,6,.85)'; ctx.lineWidth = 1.1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,246,205,.9)'; ctx.fillRect(-3.6, -1.9, 7.2, 1.2);
  ctx.fillStyle = '#8a6a20'; ctx.fillRect(2.6, -1.9, 1.2, 3.8);
  ctx.restore();
}

function impactSpark(ctx, o) {
  const k = clamp(o.k === undefined ? 1 : o.k, 0, 1), id = o.id || 'tear';
  const n = o.n || 6, R = (o.r || 8) * (0.9 + (1 - k) * 1.5);
  const col = { tear: '#d8ecff', laser: '#ff9a7a', light: '#ffee9a', flame: '#ffbe55', enemy: '#ffc8b4' }[id] || '#ffd9a0';
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.globalCompositeOperation = 'lighter';
  // 中心爆点
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * .9);
  g.addColorStop(0, `rgba(255,255,255,${.85 * k})`); g.addColorStop(.5, `rgba(255,240,200,${.4 * k})`); g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * .9, 0, TAU); ctx.fill();
  // 扇形迸溅：反向于入射角
  const base = o.ang === undefined ? Math.PI : o.ang;
  ctx.strokeStyle = col; ctx.lineWidth = 2.4 * k + .5; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * .42 + rand(-.1, .1);
    const len = R * (.55 + (i % 3) * .5) * (1.2 - k * .4);
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * .2, Math.sin(a) * R * .2);
    ctx.lineTo(Math.cos(a) * (R * .2 + len), Math.sin(a) * (R * .2 + len)); ctx.stroke();
  }
  // 碎片：三枚小三角飞散，比纯线条更有"打到了"的实体感
  ctx.fillStyle = col;
  for (let i = 0; i < 3; i++) {
    const a = base + (i - 1) * .8, d = R * (.8 + i * .35) * (1.4 - k);
    star(ctx, Math.cos(a) * d, Math.sin(a) * d, R * .16 * k + .8, 3, .5); ctx.fill();
  }
  ctx.restore();
}

// 预警：敌方开火/冲锋前摇。四角括号收缩 + 方向光带，比整圈虚线更像"警告"
function telegraph(ctx, o) {
  const k = clamp(o.k === undefined ? 1 : o.k, 0, 1);
  const R = (o.r || 20) * (1.75 - k * .7);
  ctx.save(); ctx.translate(o.x, o.y);
  const pulse = .45 + .5 * Math.abs(Math.sin(k * 26));
  ctx.strokeStyle = `rgba(255,86,64,${pulse})`;
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.beginPath();
    ctx.moveTo(sx * R, sy * R * .55); ctx.lineTo(sx * R, sy * R); ctx.lineTo(sx * R * .55, sy * R);
    ctx.stroke();
  }
  ctx.fillStyle = `rgba(255,110,70,${.14 * k})`;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  if (o.ang !== undefined) {
    const len = o.len || 160, w = o.w || 10;
    ctx.rotate(o.ang);
    const grad = ctx.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, `rgba(255,90,60,${.5 * k})`); grad.addColorStop(1, 'rgba(255,90,60,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(len, -w); ctx.lineTo(len, w); ctx.lineTo(0, 3); ctx.fill();
    ctx.strokeStyle = `rgba(255,180,150,${.75 * k})`; ctx.lineWidth = 2;
    ctx.setLineDash([12, 9]); ctx.lineDashOffset = -k * 60;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255,120,90,${.85 * k})`;
    ctx.beginPath(); ctx.moveTo(len, -w * 1.15); ctx.lineTo(len + w * .9, 0); ctx.lineTo(len, w * 1.15); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// 死亡：Q 版“噗”——三层烟圈外扩 + 四角星升腾 + 残留暗印
function deathPuff(ctx, o) {
  const k = clamp(o.k === undefined ? 1 : o.k, 0, 1);
  const R = o.r || 16, e = 1 - k;
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.globalAlpha = k;
  for (let i = 0; i < 3; i++) {
    const rr = R * (.5 + i * .42) * (.5 + e * 1.25);
    ctx.fillStyle = `rgba(238,232,220,${(.46 - i * .09) * k})`;
    ctx.beginPath(); ctx.arc(Math.cos(i * 2.1 + o.seed) * R * .25, -R * .1 + Math.sin(i * 2.1 + o.seed) * R * .2 - e * R * .35, rr, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = `rgba(255,255,255,${.55 * k})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, R * (.6 + e * 1.5), 0, TAU); ctx.stroke();
  ctx.fillStyle = `rgba(255,224,130,${.95 * k})`;
  for (let i = 0; i < 4; i++) {
    const a = i * 1.57 + o.seed * .5 + e * .8, d = R * (.7 + e * 1.5);
    star(ctx, Math.cos(a) * d, Math.sin(a) * d - e * R * .9, R * .26 * k + 1, 4, .4); ctx.fill();
  }
  ctx.restore();
}
function star(ctx, x, y, r, points, inner) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = i / (points * 2) * TAU - Math.PI / 2, rr = i % 2 ? r * (inner || .45) : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// 激光束：等级即粗细。Lv1 发丝级芯线，Lv5 熔穿级光柱。
// 光晕按芯宽等比推导，不用固定倍数——现网 w*2.4 的写法会让一级激光被光晕撑粗，正是你指出的问题
function laserBeam(ctx, o) {
  const lvl = clamp(o.lvl || 1, 1, 5), k = clamp(o.k === undefined ? 1 : o.k, 0, 1);
  const core = 1.5 + (lvl - 1) * 1.55;                    // 芯宽 1.5 → 7.7px
  const snap = k > .72 ? clamp((1 - k) / .28, .2, 1) : 1; // 起手两帧抽满
  const w = core * snap * (.55 + .45 * k);
  const { x1, y1, x2, y2 } = o;
  const ang = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
  ctx.save();
  ctx.translate(x1, y1); ctx.rotate(ang); ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  const halo = w * (2.1 + lvl * .5);
  const hg = ctx.createLinearGradient(0, 0, len, 0);
  hg.addColorStop(0, `rgba(255,70,55,${.3 * k})`); hg.addColorStop(.7, `rgba(255,60,50,${.16 * k})`); hg.addColorStop(1, 'rgba(255,60,50,0)');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.moveTo(0, -halo * .5); ctx.lineTo(len, -halo * .18); ctx.lineTo(len, halo * .18); ctx.lineTo(0, halo * .5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(255,110,85,${.85 * k})`; ctx.lineWidth = w * 1.9;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.strokeStyle = `rgba(255,214,195,${k})`; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${k})`; ctx.lineWidth = Math.max(.8, w * .38);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
  if (lvl >= 4) { // 高等级：束侧热浪短刺
    ctx.strokeStyle = `rgba(255,180,150,${.5 * k})`; ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      const x = len * (i + .5) / 6, s = (i % 2 ? 1 : -1) * (w * 1.6 + rand(0, 4));
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + rand(-3, 3), s); ctx.stroke();
    }
  }
  const bl = w * (1.5 + lvl * .22);                       // 末端熔穿点
  const bg = ctx.createRadialGradient(len, 0, 0, len, 0, bl);
  bg.addColorStop(0, `rgba(255,255,245,${.95 * k})`); bg.addColorStop(.4, `rgba(255,150,90,${.6 * k})`); bg.addColorStop(1, 'rgba(255,80,40,0)');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(len, 0, bl, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(255,230,180,${.85 * k})`;
  for (let i = 0; i < 3 + lvl; i++) {
    const a = rand(0, TAU), d = bl * rand(.8, 1.7);
    star(ctx, len + Math.cos(a) * d, Math.sin(a) * d, 1.4 + lvl * .3, 4, .4); ctx.fill();
  }
  ctx.restore();
}

// 闪电链：等级同时决定线宽、抖动幅度、分支数、节点爆点。
// 现网 lineWidth 写死 3 且 fx 不带 lvl，接线时务必把 lvl 传进 fx
function chainBolt(ctx, o) {
  const pts = o.pts || [], lvl = clamp(o.lvl || 1, 1, 5), k = clamp(o.k === undefined ? 1 : o.k, 0, 1);
  if (pts.length < 2) return;
  const w = 1.3 + (lvl - 1) * .95;                        // 线宽 1.3 → 5.1px
  const jit = 3.2 + lvl * 1.5;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';
  const branch = (a, b, width, alpha, sub) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), n = Math.max(3, Math.round(L / (17 - lvl * 1.5)));
    ctx.strokeStyle = `rgba(255,238,150,${alpha})`; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(a.x, a.y);
    for (let i = 1; i < n; i++) {
      const tt = i / n, j = (i === n - 1 ? 0 : 1) * jit * (sub ? .6 : 1);
      ctx.lineTo(a.x + dx * tt + rand(-j, j), a.y + dy * tt + rand(-j, j));
    }
    ctx.lineTo(b.x, b.y); ctx.stroke();
    if (!sub && lvl >= 3) { // 高等级：主弧外侧再甩一条细支
      const mx = a.x + dx * .5, my = a.y + dy * .5, na = Math.atan2(dy, dx) + (rand(0, 1) > .5 ? 1 : -1) * rand(.5, .9);
      ctx.strokeStyle = `rgba(255,250,210,${alpha * .5})`; ctx.lineWidth = width * .45;
      ctx.beginPath(); ctx.moveTo(mx, my);
      ctx.lineTo(mx + Math.cos(na) * L * .22, my + Math.sin(na) * L * .22);
      ctx.lineTo(mx + Math.cos(na + .4) * L * .34, my + Math.sin(na + .4) * L * .34); ctx.stroke();
    }
  };
  for (let i = 0; i < pts.length - 1; i++) {
    branch(pts[i], pts[i + 1], w * 2.6, .16 * k, true);   // 外晕
    branch(pts[i], pts[i + 1], w * 1.25, .95 * k, false); // 主弧（可分叉）
    branch(pts[i], pts[i + 1], Math.max(.7, w * .45), k, true); // 白芯
  }
  for (let i = 1; i < pts.length; i++) {                  // 每跳落点的四角星爆
    const r = (3.4 + lvl * 1.5) * k;
    ctx.fillStyle = `rgba(255,250,225,${.9 * k})`;
    star(ctx, pts[i].x, pts[i].y, r, 4, .38); ctx.fill();
    ctx.fillStyle = `rgba(255,225,120,${.3 * k})`;
    ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, r * 1.7, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
// 五、怪物：Q 版重绘 15 种
// 约定：每个画法返回 body 数组（受击闪白要覆盖的主身体块）
// ─────────────────────────────────────────────
function legSpray(ctx, n, y0, spread, len, col, ph, lw) {
  ctx.strokeStyle = col; ctx.lineWidth = lw || 2.4; ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const sgn = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    const bx = -spread + k * (spread * 2 / Math.max(1, n / 2 - 1) || 0);
    const lift = Math.sin(ph + i * 1.4) * 2.4;
    ctx.beginPath(); ctx.moveTo(bx, y0);
    ctx.lineTo(bx + sgn * len * .58, y0 - len * .5 + lift);
    ctx.lineTo(bx + sgn * len, y0 + len * .46 + lift * .4);
    ctx.stroke();
  }
}
function wingBlur(ctx, x, y, len, ph, alpha) {
  ctx.save(); ctx.translate(x, y);
  for (const sgn of [-1, 1]) {
    ctx.save(); ctx.rotate(sgn * (.55 + Math.sin(ph) * .45));
    ctx.fillStyle = `rgba(226,236,248,${alpha === undefined ? .5 : alpha})`;
    ctx.beginPath(); ctx.ellipse(-sgn * len * .55, 0, len * .62, len * .2, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(150,175,205,.55)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function eliteAura(ctx, r, t) {
  const pr = r * (1.65 + .16 * Math.sin(t * .18));
  const g = ctx.createRadialGradient(0, 0, r * .4, 0, 0, pr);
  g.addColorStop(0, 'rgba(255,215,120,.3)'); g.addColorStop(1, 'rgba(255,215,120,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, pr, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,235,170,.85)'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(0, 0, pr * .92, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,190,.9)';
  for (let i = 0; i < 3; i++) { const a = t * .06 + i * TAU / 3; star(ctx, Math.cos(a) * pr, Math.sin(a) * pr, 2.4, 4, .42); ctx.fill(); }
}

const ENEMY_ART = {
  fly(ctx, o, t) {
    const r = o.r, ph = Math.sin(t * .3);
    wingBlur(ctx, 0, -r * .55, r * 1.25, t * (o.fast ? 1.5 : .95));
    blob(ctx, -r * .35, r * .12, r * .78, r * .62, .3, '#4c6634');           // 腹部
    ctx.strokeStyle = 'rgba(18,12,8,.45)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-r * .75 + i * r * .3, -r * .3); ctx.lineTo(-r * .85 + i * r * .3, r * .55); ctx.stroke(); }
    blob(ctx, r * .28, -r * .12, r * .6, r * .55, 0, '#5d7a3a');             // 胸
    eye(ctx, r * .18, -r * .62, r * .42, o.fx || 0, o.fy || 0, { iris: ['#c9b03a', '#5a4a10'] });
    eye(ctx, r * .72, -r * .55, r * .38, o.fx || 0, o.fy || 0, { iris: ['#c9b03a', '#5a4a10'] });
    ctx.strokeStyle = OL; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r * .6, r * .1); ctx.lineTo(r * .95, r * .45 + ph); ctx.stroke(); // 口器
    legSpray(ctx, 4, r * .35, r * .4, r * .75, 'rgba(24,16,10,.8)', t * .3, 1.6);
    return [[r * .1, 0, r * .95, r * .75]];
  },
  attackfly(ctx, o, t) {
    const r = o.r, ph = Math.sin(t * .35);
    wingBlur(ctx, 0, -r * .6, r * 1.2, t * 1.5, .42);
    blob(ctx, -r * .32, r * .12, r * .8, r * .6, .3, '#8a3226');
    ctx.strokeStyle = 'rgba(20,8,6,.5)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-r * .72 + i * r * .3, -r * .28); ctx.lineTo(-r * .82 + i * r * .3, r * .55); ctx.stroke(); }
    blob(ctx, r * .3, -r * .12, r * .62, r * .56, 0, '#a04436');
    eye(ctx, r * .2, -r * .58, r * .44, o.fx || 0, o.fy || 0, { iris: ['#ff5a4a', '#7a1408'] });
    eye(ctx, r * .74, -r * .5, r * .4, o.fx || 0, o.fy || 0, { iris: ['#ff5a4a', '#7a1408'] });
    brow(ctx, r * .2, -r * 1.02, r * .3, -.28, 'rgba(60,12,8,.9)');
    ctx.strokeStyle = '#6a1a12'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';   // 吸血喙
    ctx.beginPath(); ctx.moveTo(r * .6, r * .1); ctx.lineTo(r * 1.05, r * .6 + ph * .8); ctx.stroke();
    legSpray(ctx, 4, r * .35, r * .4, r * .72, 'rgba(30,10,8,.8)', t * .35, 1.6);
    return [[r * .1, 0, r, .78 * r]];
  },
  gaper(ctx, o, t) {
    const r = o.r, step = Math.sin(t * .16);
    ctx.strokeStyle = '#b7a68e'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sgn * r * .22, r * .42); ctx.lineTo(sgn * r * .3 + step * sgn * r * .22, r * .95); ctx.stroke(); }
    blob(ctx, 0, r * .12, r * .58, r * .5, 0, '#cbbda8');                      // 小身板
    ctx.fillStyle = 'rgba(90,70,55,.35)'; ctx.beginPath(); ctx.roundRect(-r * .58, r * .28, r * 1.16, r * .2, 2); ctx.fill();
    ctx.strokeStyle = '#c2b29a'; ctx.lineWidth = 4;                             // 空垂手臂
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sgn * r * .5, 0); ctx.quadraticCurveTo(sgn * r * .85, r * .35 + step * sgn * 3, sgn * r * .72, r * .62); ctx.stroke(); }
    blob(ctx, 0, -r * .5, r * .82, r * .78, 0, '#e5d9c6');                      // 大头
    // 空洞眼窝 + 里面两点幽光
    ctx.fillStyle = '#16100c';
    ctx.beginPath(); ctx.ellipse(-r * .3, -r * .6, r * .22, r * .3, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * .32, -r * .6, r * .22, r * .3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,120,90,.8)';
    ctx.beginPath(); ctx.arc(-r * .3, -r * .58, r * .07, 0, TAU); ctx.arc(r * .32, -r * .58, r * .07, 0, TAU); ctx.fill();
    const mg = r * (.2 + Math.abs(Math.sin(t * .09)) * .16);                    // 大嘴
    ctx.fillStyle = '#0d0806'; ctx.beginPath(); ctx.ellipse(r * .02, -r * .18, mg * 1.25, mg * 1.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#efe6d2';
    for (const sgn of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(r * .02 + sgn * mg * .7, -r * .18 - mg * 1.5); ctx.lineTo(r * .02 + sgn * mg * .4, -r * .18 - mg * .6); ctx.lineTo(r * .02 + sgn * mg * .05, -r * .18 - mg * 1.5); ctx.fill();
    }
    return [[0, -r * .5, r * .85, r * .8], [0, r * .12, r * .6, r * .52]];
  },
  pooter(ctx, o, t) {
    const r = o.r, fl = Math.sin(t * .09) * 2;
    wingBlur(ctx, -r * .1, -r * .7, r * 1.1, t * .6, .4);
    blob(ctx, -r * .28, r * .16, r * .85, r * .8, .18, '#6f5a91');              // 液囊腹
    ctx.save();
    ctx.beginPath(); ctx.ellipse(-r * .28, r * .16, r * .74, r * .7, .18, 0, TAU); ctx.clip();
    ctx.fillStyle = 'rgba(190,230,150,.42)'; ctx.fillRect(-r * 1.4, r * (.34 + Math.sin(t * .12) * .05), r * 2.8, r * 1.4);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.ellipse(-r * .55, -r * .18, r * .22, r * .12, -.5, 0, TAU); ctx.fill();
    blob(ctx, r * .42, -r * .2, r * .48, r * .44, -.25, '#8d76b2');              // 小胸
    eye(ctx, r * .5, -r * .42, r * .34, o.fx || 0, o.fy || 0, { iris: ['#ffe9b0', '#2a1530'] });
    brow(ctx, r * .5, -r * .78, r * .26, .22, 'rgba(40,22,58,.9)');
    ctx.strokeStyle = '#3a2a4a'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';     // 长喙
    ctx.beginPath(); ctx.moveTo(r * .72, -r * .18); ctx.lineTo(r * 1.25, r * .3 + fl * .3); ctx.stroke();
    legSpray(ctx, 4, r * .5, r * .35, r * .62, 'rgba(34,20,44,.75)', t * .28, 1.6);
    return [[-r * .28, r * .16, r * .88, r * .84], [r * .42, -r * .2, r * .5, r * .46]];
  },
  spider(ctx, o, t) {
    const r = o.r;
    legSpray(ctx, 8, 0, r * .5, r * 1.15, '#241a22', t * .3, 2.4);
    blob(ctx, -r * .25, r * .05, r * .82, r * .74, -.12, '#5c4560');             // 大腹
    ctx.fillStyle = '#c9b287';                                                   // 菱形背斑
    ctx.beginPath(); ctx.moveTo(-r * .25, -r * .4); ctx.lineTo(r * .1, r * .05); ctx.lineTo(-r * .25, r * .5); ctx.lineTo(-r * .6, r * .05); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,18,28,.6)'; ctx.lineWidth = 1.4; ctx.stroke();
    blob(ctx, r * .6, -r * .05, r * .56, r * .52, 0, '#75596e');                // 头胸（放大，Q 版靠脸辨识）
    ctx.strokeStyle = '#57404f'; ctx.lineWidth = 2.8;                            // 螯肢
    ctx.beginPath(); ctx.moveTo(r * .98, -r * .1); ctx.lineTo(r * 1.26, r * .05); ctx.stroke();
    ctx.fillStyle = '#e8dcc8';
    ctx.beginPath(); ctx.moveTo(r * 1.2, 0); ctx.lineTo(r * 1.46, r * .4); ctx.lineTo(r * 1.08, r * .22); ctx.fill();
    eye(ctx, r * .58, -r * .34, r * .32, o.fx || 0, o.fy || 0, { iris: ['#ffdede', '#5a1a22'] });
    for (const [dx, dy, rr] of [[.95, -.16, .16], [.86, .12, .13], [1.12, .02, .12], [.34, -.48, .12], [.14, -.26, .1]]) {
      ctx.fillStyle = '#ffdede'; ctx.beginPath(); ctx.arc(r * dx, r * dy, r * rr, 0, TAU); ctx.fill();
      ctx.fillStyle = '#20101a'; ctx.beginPath(); ctx.arc(r * dx + .5, r * dy, r * rr * .45, 0, TAU); ctx.fill();
    }
    return [[-r * .25, r * .05, r * .85, r * .78], [r * .6, -r * .05, r * .58, r * .56]];
  },
  hopper(ctx, o, t) {
    const r = o.r, air = o.state === 'air';
    const sq = air ? .8 : 1 + Math.sin(t * .14) * .06;
    ctx.save(); ctx.scale(1 / sq, sq);
    ctx.strokeStyle = '#7e434b'; ctx.lineWidth = 5; ctx.lineCap = 'round';       // 折叠后腿
    for (const sgn of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sgn * r * .6, r * .1);
      ctx.lineTo(sgn * r * .95, air ? r * .55 : -r * .3);
      ctx.lineTo(sgn * r * .68, r * .78); ctx.stroke();
    }
    blob(ctx, 0, r * .1, r * .95, r * .62, 0, '#a05860');
    ctx.fillStyle = '#c9888e'; ctx.beginPath(); ctx.ellipse(0, r * .42, r * .66, r * .26, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = '#4a2226'; ctx.lineWidth = 2.6;                            // 咧嘴
    ctx.beginPath(); ctx.moveTo(-r * .6, r * .04); ctx.quadraticCurveTo(0, r * .3, r * .6, r * .04); ctx.stroke();
    ctx.fillStyle = '#efe6d2';
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sgn * r * .3, r * .1); ctx.lineTo(sgn * r * .2, r * -.08); ctx.lineTo(sgn * r * .1, r * .1); ctx.fill(); }
    for (const sgn of [-1, 1]) {                                                 // 鼓出的顶眼
      blob(ctx, sgn * r * .42, -r * .5, r * .34, r * .34, 0, '#b86a70');
      eye(ctx, sgn * r * .42, -r * .52, r * .24, o.fx || 0, o.fy || 0, { iris: ['#fff2e6', '#1c1214'] });
    }
    ctx.restore();
    return [[0, r * .05, r * .98, r * .7]];
  },
  splitter(ctx, o, t) {
    const r = o.r, wob = Math.sin(t * .13);
    blob(ctx, 0, r * .08, r * .96, r * .9, 0, '#8f4a52');
    for (const [bx, by, br, k] of [[-r * .44, -r * .4, r * .3, 0], [r * .42, -r * .26, r * .26, 1], [r * .06, r * .54, r * .23, 2]]) {
      const puff = 1 + Math.sin(t * .18 + k * 2) * .08;
      blob(ctx, bx, by, br * puff, br * puff, 0, '#a85a62');
      ctx.fillStyle = '#f2d8b8'; ctx.beginPath(); ctx.arc(bx, by, br * .42, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(bx - br * .18, by - br * .2, br * .12, 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(60,15,20,.45)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-r * .44, -r * .4); ctx.quadraticCurveTo(0, 0, r * .06, r * .54); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * .42, -r * .26); ctx.quadraticCurveTo(r * .2, r * .1, r * .06, r * .54); ctx.stroke();
    eye(ctx, -r * .22, r * .1, r * .17, o.fx || 0, o.fy || 0, { iris: ['#4a1218', '#2a0d10'] });
    eye(ctx, r * .22, r * .1, r * .17, o.fx || 0, o.fy || 0, { iris: ['#4a1218', '#2a0d10'] });
    ctx.strokeStyle = '#2a0d10'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r * .16, r * .42 + wob); ctx.quadraticCurveTo(0, r * .52 + wob, r * .16, r * .42 + wob); ctx.stroke();
    return [[0, r * .08, r * .95, r * .9]];
  },
  minifly(ctx, o, t) {
    const r = o.r, fl = Math.abs(Math.sin(t * 1.4));
    for (const sgn of [-1, 1]) { // 横向振翅：小体型要一眼是苍蝇，不是兔耳
      ctx.save(); ctx.translate(sgn * r * .45, -r * .34); ctx.rotate(sgn * -.28);
      ctx.fillStyle = 'rgba(226,236,248,.55)';
      ctx.beginPath(); ctx.ellipse(sgn * r * .78, 0, r * .82, r * (.16 + fl * .3), 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(150,175,205,.5)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    }
    blob(ctx, 0, r * .1, r * .8, r * .7, .25, '#6c4a8a');
    eye(ctx, r * .18, -r * .18, r * .5, o.fx || 0, o.fy || 0, { iris: ['#ffd0d0', '#4a1030'] });
    return [[0, 0, r * .85, r * .8]];
  },
  turret(ctx, o, t) {
    const r = o.r, rot = (o.spin === undefined ? t * .05 : o.spin) % (Math.PI / 2);
    ctx.save(); ctx.translate(0, r * .1); ctx.rotate(rot);                       // 四喷嘴
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 2);
      ctx.beginPath(); ctx.roundRect(-r * .32, -r * 1.42, r * .64, r * 1.02, 4);
      ctx.fillStyle = '#4c4a45'; ctx.fill(); out(ctx, 2.2);
      ctx.fillStyle = '#141210'; ctx.beginPath(); ctx.arc(0, -r * 1.38, r * .26, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,180,90,.55)'; ctx.beginPath(); ctx.arc(0, -r * 1.38, r * .14, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    blob(ctx, 0, r * .18, r * .92, r * .78, 0, '#37352f');                        // 铁座
    ctx.fillStyle = '#8a857c';
    for (const [dx, dy] of [[-.6, .5], [.6, .5], [-.6, -.15], [.6, -.15]]) { ctx.beginPath(); ctx.arc(r * dx, r * dy, r * .1, 0, TAU); ctx.fill(); }
    eye(ctx, 0, -r * .05, r * .44, o.fx || 0, o.fy || 0, { iris: ['#e8a83a', '#241a08'], tall: 1 });
    brow(ctx, -r * .3, -r * .5, r * .3, -.4, 'rgba(20,16,10,.95)');
    brow(ctx, r * .3, -r * .5, r * .3, .4, 'rgba(20,16,10,.95)');
    return [[0, r * .18, r * .95, r * .8]];
  },
  spreader(ctx, o, t) {
    const r = o.r;
    legSpray(ctx, 6, r * .3, r * .5, r * .8, '#232c18', t * .3, 2.4);
    blob(ctx, -r * .12, 0, r * .9, r * .78, 0, '#4e6b2e');                        // 鞘翅
    ctx.strokeStyle = '#2c3f1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r * .12, -r * .76); ctx.lineTo(-r * .12, r * .76); ctx.stroke();
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.ellipse(-r * .12, sgn * r * .34, r * .6, r * .12, 0, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.ellipse(-r * .45, -r * .4, r * .3, r * .14, -.5, 0, TAU); ctx.fill();
    blob(ctx, r * .62, 0, r * .44, r * .5, 0, '#6b8a42');                         // 前胸背板
    ctx.strokeStyle = '#c96f4a'; ctx.lineWidth = 3;                               // 大颚
    ctx.beginPath(); ctx.moveTo(r * .95, -r * .22); ctx.quadraticCurveTo(r * 1.3, -r * .12, r * 1.18, r * .1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * .95, r * .22); ctx.quadraticCurveTo(r * 1.3, r * .12, r * 1.18, -r * .1); ctx.stroke();
    ctx.strokeStyle = '#2c3f1a'; ctx.lineWidth = 1.6;                             // 触角
    ctx.beginPath(); ctx.moveTo(r * .8, -r * .3); ctx.quadraticCurveTo(r * 1.1, -r * .7, r * 1.35, -r * .62); ctx.stroke();
    eye(ctx, r * .68, -r * .18, r * .24, o.fx || 0, o.fy || 0, { iris: ['#fff8e0', '#222a14'] });
    return [[-r * .12, 0, r * .92, r * .8], [r * .62, 0, r * .46, r * .52]];
  },
  ghost(ctx, o, t) {
    const r = o.r, wob = Math.sin(t * .11) * 2.2;
    ctx.save(); ctx.globalAlpha *= .9;
    ctx.beginPath();
    ctx.arc(0, -r * .15, r * .88, Math.PI, 0);
    ctx.lineTo(r * .88, r * .55);
    for (let i = 0; i < 4; i++)
      ctx.quadraticCurveTo(r * .88 - i * r * .44 - r * .22, r * .55 + (i % 2 ? 5 + wob : -3 - wob), r * .88 - (i + 1) * r * .44, r * .55);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#eef1ff'); g.addColorStop(1, '#a9b2d6');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(70,74,110,.75)'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.restore();
    eye(ctx, -r * .32, -r * .2, r * .3, o.fx || 0, o.fy || 0, { iris: ['#6a5aa8', '#241f3a'] });
    eye(ctx, r * .32, -r * .2, r * .3, o.fx || 0, o.fy || 0, { iris: ['#6a5aa8', '#241f3a'] });
    ctx.fillStyle = '#2a2540';                                                      // 小 o 嘴
    ctx.beginPath(); ctx.ellipse(0, r * .22, r * .16, r * (.1 + Math.abs(Math.sin(t * .09)) * .12), 0, 0, TAU); ctx.fill();
    blush(ctx, -r * .55, r * .02, r * .13, 'rgba(150,140,220,.35)');
    blush(ctx, r * .55, r * .02, r * .13, 'rgba(150,140,220,.35)');
    return [[0, -r * .1, r * .9, r * .85]];
  },
  bat(ctx, o, t) {
    const r = o.r, flap = Math.sin(t * .32) * .5;
    ctx.fillStyle = '#3d2b45';
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.rotate(sgn * (.18 + flap * sgn));
      ctx.beginPath();
      ctx.moveTo(sgn * r * .3, -r * .15);
      ctx.quadraticCurveTo(sgn * r * 1.35, -r * .95, sgn * r * 1.6, -r * .1);
      ctx.quadraticCurveTo(sgn * r * 1.2, r * .05, sgn * r * 1.1, r * .38);
      ctx.quadraticCurveTo(sgn * r * .8, r * .08, sgn * r * .62, r * .42);
      ctx.quadraticCurveTo(sgn * r * .42, r * .1, sgn * r * .3, -r * .15);
      ctx.fill(); out(ctx, 2);
      ctx.restore();
    }
    blob(ctx, 0, 0, r * .62, r * .68, 0, '#57405f');
    for (const sgn of [-1, 1]) {                                                     // 尖耳（占大头身比）
      ctx.beginPath(); ctx.moveTo(sgn * r * .38, -r * .5); ctx.lineTo(sgn * r * .55, -r * 1.25); ctx.lineTo(sgn * r * .1, -r * .62); ctx.closePath();
      ctx.fillStyle = '#57405f'; ctx.fill(); out(ctx, 2);
      ctx.beginPath(); ctx.moveTo(sgn * r * .34, -r * .58); ctx.lineTo(sgn * r * .46, -r * 1.02); ctx.lineTo(sgn * r * .2, -r * .62); ctx.closePath();
      ctx.fillStyle = 'rgba(220,140,160,.4)'; ctx.fill();
    }
    eye(ctx, -r * .24, -r * .1, r * .22, o.fx || 0, o.fy || 0, { iris: ['#ff4a4a', '#5a0a0a'] });
    eye(ctx, r * .24, -r * .1, r * .22, o.fx || 0, o.fy || 0, { iris: ['#ff4a4a', '#5a0a0a'] });
    ctx.fillStyle = '#f7efe6';                                                       // 大獠牙
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sgn * r * .22, r * .28); ctx.lineTo(sgn * r * .12, r * .62); ctx.lineTo(sgn * r * .02, r * .28); ctx.fill(); }
    return [[0, -r * .1, r * .68, r * .72]];
  },
  mushroom(ctx, o, t) {
    const r = o.r, pulse = 1 + Math.sin(t * .12) * .05;
    blob(ctx, 0, r * .3, r * .44, r * .5, 0, '#e2d6b4');                             // 胖菌柄
    eye(ctx, -r * .17, r * .16, r * .13, o.fx || 0, o.fy || 0, { rim: false });
    eye(ctx, r * .17, r * .16, r * .13, o.fx || 0, o.fy || 0, { rim: false });
    ctx.strokeStyle = 'rgba(60,40,24,.8)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-r * .1, r * .44); ctx.quadraticCurveTo(0, r * .52, r * .1, r * .44); ctx.stroke();
    blush(ctx, -r * .34, r * .32, r * .1, 'rgba(240,130,120,.3)');
    blush(ctx, r * .34, r * .32, r * .1, 'rgba(240,130,120,.3)');
    ctx.fillStyle = '#8a5a52';                                                      // 菌褶：让菌盖"坐"在柄上而非悬浮
    ctx.beginPath(); ctx.ellipse(0, -r * .02, r * .9, r * .22, 0, 0, Math.PI); ctx.fill(); out(ctx, 1.8);
    ctx.save(); ctx.scale(pulse, 1 / pulse);
    ctx.beginPath(); ctx.ellipse(0, -r * .02, r * 1.02, r * .78, 0, Math.PI, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, -r, 0, 0);
    g.addColorStop(0, '#d0525c'); g.addColorStop(1, '#8f2f38');
    ctx.fillStyle = g; ctx.fill(); out(ctx, 2.6);
    ctx.fillStyle = '#f7efdc';
    for (const [sx, sy, sr] of [[-.5, -.42, .17], [0, -.6, .2], [.5, -.4, .15], [.24, -.26, .11], [-.26, -.24, .1]]) {
      ctx.beginPath(); ctx.arc(r * sx, -r * .02 + r * sy * .95, r * sr, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.ellipse(-r * .45, -r * .66, r * .26, r * .1, -.5, 0, TAU); ctx.fill();
    ctx.restore();
    return [[0, -r * .34, r * 1.02, r * .78], [0, r * .3, r * .46, r * .52]];
  },
  bone(ctx, o, t) {
    const r = o.r, wig = Math.sin(t * .22) * .28;
    for (let i = 2; i >= 1; i--) {                                                    // 三节椎尾
      ctx.save(); ctx.rotate(wig * i * .5);
      blob(ctx, -i * r * .58, i * r * .1, r * (.4 - i * .05), r * (.32 - i * .06), .2 * i, '#c9c2ae');
      ctx.fillStyle = 'rgba(60,45,30,.35)'; ctx.beginPath(); ctx.arc(-i * r * .58, i * r * .1, r * .1, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.save(); ctx.translate(r * .1, 0); ctx.rotate(wig * .3);
    blob(ctx, 0, -r * .05, r * .78, r * .68, -.08, '#efe9d8');                        // 大头骨
    ctx.fillStyle = '#c9c2ae'; ctx.beginPath(); ctx.roundRect(-r * .34, r * .48, r * .68, r * .3, 3); ctx.fill(); out(ctx, 1.8);
    ctx.strokeStyle = 'rgba(60,45,30,.6)'; ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * r * .18, r * .48); ctx.lineTo(i * r * .18, r * .76); ctx.stroke(); }
    ctx.fillStyle = '#1a120c';                                                        // 眼窝
    ctx.beginPath(); ctx.ellipse(-r * .3, -r * .18, r * .22, r * .26, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * .28, -r * .18, r * .22, r * .26, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = o.wind ? '#ff8a4a' : '#ff5a4a';                                    // 眼中火
    const fp = 1 + Math.sin(t * .4) * .18;
    ctx.beginPath(); ctx.ellipse(-r * .3, -r * .18, r * .1 * fp, r * .16 * fp, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * .28, -r * .18, r * .1 * fp, r * .16 * fp, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a120c'; ctx.beginPath(); ctx.moveTo(-r * .02, r * .06); ctx.lineTo(r * .1, r * .26); ctx.lineTo(-r * .12, r * .26); ctx.fill();
    ctx.restore();
    return [[r * .1, 0, r * .82, r * .74]];
  },
  eye(ctx, o, t) {
    const r = o.r, fl = Math.sin(t * .08) * 2;
    blob(ctx, -r * .8, r * .5 - fl, r * .3, r * .18, .5, 'rgba(236,232,222,.75)');    // 小尾
    ctx.beginPath(); ctx.arc(0, 0, r * .92, 0, TAU);
    const g = ctx.createRadialGradient(-r * .3, -r * .34, r * .1, 0, 0, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.7, '#e8e2d8'); g.addColorStop(1, '#b9ae9e');
    ctx.fillStyle = g; ctx.fill(); out(ctx, 2.6);
    ctx.strokeStyle = 'rgba(180,50,50,.45)'; ctx.lineWidth = 1.4;                      // 血丝（少量，Q 版不脏）
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + .6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * .88, Math.sin(a) * r * .88);
      ctx.quadraticCurveTo(Math.cos(a + .5) * r * .5, Math.sin(a + .5) * r * .5, r * .12, -r * .06); ctx.stroke();
    }
    const px = (o.fx || 0) * r * .28, py = (o.fy || 0) * r * .28;
    ctx.fillStyle = '#2a4a8a'; ctx.beginPath(); ctx.arc(px, py, r * .46, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0a0a12'; ctx.beginPath(); ctx.arc(px, py, r * .24, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(px - r * .14, py - r * .16, r * .11, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(30,18,14,.8)'; ctx.lineWidth = 2;                           // 上睫
    ctx.beginPath(); ctx.arc(0, 0, r * .95, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    return [[0, 0, r * .95, r * .95]];
  },
};

function drawEnemy(ctx, o, t) {
  const cfg = o.cfg || o, id = cfg.id, r = cfg.r || o.r || 14;
  const art = ENEMY_ART[id];
  if (!art) return null;
  const T = t || 0;
  ctx.save();
  const spawn = o.spawnT > 0 ? 1 - o.spawnT / 42 : 1;
  if (spawn < 1) { ctx.globalAlpha *= .45 + .55 * spawn; const s = .5 + .5 * spawn; ctx.scale(s, s); }
  const flash = clamp((o.flash || 0) / 8, 0, 1);
  shadow(ctx, r * .85, r * .72);
  if (o.elite) eliteAura(ctx, r, T);
  if (o.faceLeft) ctx.scale(-1, 1);   // 调用方给：player.x < e.x - 4
  const look = o.look || { x: 0, y: 0 };
  const bodies = art(ctx, {
    r, state: o.state, wind: o.state === 'wind', fast: id === 'attackfly',
    fx: clamp(look.x, -1, 1), fy: clamp(look.y, -1, 1), spin: o.spin,
  }, T) || [];
  if (flash > 0) { // 受击：按身体块闪白 + 挤压，比整圆覆盖干净
    ctx.globalAlpha = flash * .85;
    ctx.fillStyle = '#fff';
    for (const [bx, by, brx, bry] of bodies) { ctx.beginPath(); ctx.ellipse(bx, by, brx * 1.04, bry * 1.04, 0, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return bodies;
}

// ─────────────────────────────────────────────
// 六、Boss：3  archetype，Q 版 = 巨大躯干 + 迷你四肢
// ─────────────────────────────────────────────
const BOSS_ART = {
  glutton(ctx, o, t) {
    const r = o.r, breathe = 1 + Math.sin(t * .07) * .035;
    ctx.save(); ctx.scale(breathe, 2 - breathe);
    blob(ctx, 0, r * .12, r * .96, r * .88, 0, '#9a6b52');                            // 肉山躯干
    ctx.fillStyle = 'rgba(255,235,200,.18)'; ctx.beginPath(); ctx.ellipse(-r * .38, -r * .3, r * .3, r * .18, -.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(60,26,18,.28)';                                             // 油污褶
    for (const [dx, dy, rr] of [[.3, .45, .16], [-.42, .5, .13], [.1, .68, .11]]) { ctx.beginPath(); ctx.arc(r * dx, r * dy, r * rr, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = '#6a3f2a'; ctx.lineWidth = r * .12; ctx.lineCap = 'round';       // 迷你手臂
    for (const sgn of [-1, 1]) {
      const sw = Math.sin(t * .12 + (sgn > 0 ? 1 : 0)) * .2;
      ctx.beginPath(); ctx.moveTo(sgn * r * .78, r * .05); ctx.lineTo(sgn * r * 1.05, r * (.35 + sw)); ctx.stroke();
    }
    blob(ctx, 0, -r * .42, r * .52, r * .44, 0, '#b07c5e');                            // 陷进肩膀的小头
    eye(ctx, -r * .2, -r * .52, r * .12, o.fx || 0, -.2, { iris: ['#ffd86a', '#5a3208'] });
    eye(ctx, r * .2, -r * .52, r * .12, o.fx || 0, -.2, { iris: ['#ffd86a', '#5a3208'] });
    brow(ctx, -r * .2, -r * .72, r * .14, -.3, 'rgba(40,18,10,.9)');
    brow(ctx, r * .2, -r * .72, r * .14, .3, 'rgba(40,18,10,.9)');
    const jaw = r * (o.act === 'spit' ? .34 : .22) + Math.sin(t * .2) * r * .02;       // 血盆大口
    ctx.fillStyle = '#2a0d08'; ctx.beginPath(); ctx.ellipse(0, -r * .18, r * .42, jaw, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8d9a8';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * r * .16 - r * .07, -r * .18 - jaw * .85); ctx.lineTo(i * r * .16, -r * .18 - jaw * .25); ctx.lineTo(i * r * .16 + r * .07, -r * .18 - jaw * .85); ctx.fill();
      ctx.beginPath(); ctx.moveTo(i * r * .16 - r * .07, -r * .18 + jaw * .85); ctx.lineTo(i * r * .16, -r * .18 + jaw * .25); ctx.lineTo(i * r * .16 + r * .07, -r * .18 + jaw * .85); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,210,120,.5)'; ctx.beginPath(); ctx.ellipse(0, r * .62, r * .5, r * .16, 0, 0, Math.PI); ctx.fill(); // 围裙油渍
    return [[0, r * .1, r * .98, r * .9], [0, -r * .42, r * .54, r * .46]];
  },
  brood(ctx, o, t) {
    const r = o.r, pulse = 1 + Math.sin(t * .09) * .04;
    legSpray(ctx, 8, r * .1, r * .5, r * 1.02, '#2a1e2c', t * .22, r * .115);
    ctx.save(); ctx.scale(1, pulse);
    blob(ctx, -r * .28, r * .1, r * .82, r * .74, -.1, '#5c4560');                     // 卵腹
    ctx.fillStyle = '#c9b287';
    ctx.beginPath(); ctx.moveTo(-r * .28, -r * .42); ctx.lineTo(r * .12, r * .1); ctx.lineTo(-r * .28, r * .6); ctx.lineTo(-r * .68, r * .1); ctx.closePath(); ctx.fill();
    out(ctx, 2);
    ctx.fillStyle = 'rgba(255,240,200,.5)';                                            // 腹内蠕动卵
    for (let i = 0; i < 4; i++) { const a = t * .1 + i * 1.6; ctx.beginPath(); ctx.arc(-r * .28 + Math.cos(a) * r * .3, r * .1 + Math.sin(a) * r * .24, r * .1, 0, TAU); ctx.fill(); }
    ctx.restore();
    blob(ctx, r * .5, -r * .05, r * .46, r * .5, 0, '#75596e');                        // 头胸甲
    ctx.strokeStyle = '#8a857c'; ctx.lineWidth = r * .07;                              // 铁颚冠
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(r * .5 + i * r * .12, -r * .42); ctx.lineTo(r * .5 + i * r * .14, -r * .68); ctx.stroke(); }
    ctx.strokeStyle = '#57404f'; ctx.lineWidth = r * .09;
    ctx.beginPath(); ctx.moveTo(r * .85, -r * .05); ctx.lineTo(r * 1.1, r * .08); ctx.stroke();
    ctx.fillStyle = '#e8dcc8';
    ctx.beginPath(); ctx.moveTo(r * 1.05, r * .06); ctx.lineTo(r * 1.3, r * .42); ctx.lineTo(r * .95, r * .26); ctx.fill();
    const eyes = [[.42, -.28, .19], [.72, -.2, .14], [.36, -.02, .12], [.68, .06, .11], [.2, -.32, .1], [.1, -.1, .09]];
    for (const [dx, dy, er] of eyes) {
      ctx.fillStyle = '#ffdede'; ctx.beginPath(); ctx.arc(r * dx, r * dy, r * er, 0, TAU); ctx.fill();
      ctx.fillStyle = '#20101a'; ctx.beginPath(); ctx.arc(r * dx + r * .03, r * dy, r * er * .5, 0, TAU); ctx.fill();
    }
    return [[-r * .28, r * .1, r * .85, r * .78], [r * .5, -r * .05, r * .48, r * .52]];
  },
  the_maw(ctx, o, t) {
    const r = o.r, rumble = Math.sin(t * .5) * r * .015;
    ctx.fillStyle = '#2a2723';                                                         // 履带
    ctx.beginPath(); ctx.roundRect(-r * .95, r * .42, r * 1.9, r * .42, r * .2); ctx.fill(); out(ctx, 2.6);
    ctx.fillStyle = '#4c4a45';
    for (let i = 0; i < 6; i++) { const x = -r * .88 + ((i * r * .34 + t * 1.6) % (r * 1.76)); ctx.fillRect(x, r * .46, r * .16, r * .34); }
    ctx.beginPath(); ctx.roundRect(-r * .9, -r * .3 + rumble, r * 1.7, r * .82, r * .18); // 装甲车体
    const g = ctx.createLinearGradient(0, -r * .3, 0, r * .5);
    g.addColorStop(0, '#6a6058'); g.addColorStop(1, '#3d3830');
    ctx.fillStyle = g; ctx.fill(); out(ctx, 3);
    ctx.fillStyle = '#8a857c';
    for (const [dx, dy] of [[-.7, -.1], [.7, -.1], [-.7, .34], [.7, .34], [0, .12]]) { ctx.beginPath(); ctx.arc(r * dx, r * dy + rumble, r * .055, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,180,80,.5)'; ctx.beginPath(); ctx.roundRect(-r * .3, -r * .55 + rumble, r * .6, r * .16, 4); ctx.fill(); // 排气
    ctx.save(); ctx.translate(r * .78, -r * .05);                                       // 巨颚炮塔
    ctx.beginPath(); ctx.roundRect(-r * .34, -r * .42, r * .7, r * .84, r * .16);
    ctx.fillStyle = '#575048'; ctx.fill(); out(ctx, 2.8);
    const bite = o.act === 'dash' ? .42 : .2;
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.rotate(sgn * bite);
      ctx.beginPath(); ctx.moveTo(0, sgn * r * .1); ctx.lineTo(r * .5, sgn * r * .16); ctx.lineTo(r * .42, sgn * r * .34); ctx.lineTo(r * .2, sgn * r * .2); ctx.closePath();
      ctx.fillStyle = '#c9c2ae'; ctx.fill(); out(ctx, 2);
      ctx.restore();
    }
    eye(ctx, -r * .12, -r * .2, r * .11, 1, 0, { iris: ['#ffd86a', '#5a3208'] });
    eye(ctx, -r * .12, r * .2, r * .11, 1, 0, { iris: ['#ffd86a', '#5a3208'] });
    ctx.restore();
    return [[0, 0, r * .95, r * .7], [r * .78, -r * .05, r * .4, r * .5]];
  },
};

function drawBoss(ctx, o, t) {
  const cfg = o.cfg || o, arch = cfg.arch || cfg.id, r = cfg.r || o.r || 50;
  const art = BOSS_ART[arch];
  if (!art) return null;
  ctx.save();
  const flash = clamp((o.flash || 0) / 8, 0, 1);
  shadow(ctx, r * .92, r * .82);
  const bodies = art(ctx, {
    r, act: o.act, phase2: o.phase2,
    fx: o.look ? clamp(o.look.x, -1, 1) : 0, fy: o.look ? clamp(o.look.y, -1, 1) : 0,
  }, t || 0) || [];
  if (o.phase2) { // 狂暴：红色脉冲轮廓
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,70,50,${.25 + .2 * Math.sin((t || 0) * .18)})`;
    ctx.lineWidth = 4;
    for (const [bx, by, brx, bry] of bodies) { ctx.beginPath(); ctx.ellipse(bx, by, brx * 1.06, bry * 1.06, 0, 0, TAU); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (flash > 0) {
    ctx.globalAlpha = flash * .8; ctx.fillStyle = '#fff';
    for (const [bx, by, brx, bry] of bodies) { ctx.beginPath(); ctx.ellipse(bx, by, brx * 1.03, bry * 1.03, 0, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  return bodies;
}

// MARK:EXPORT

const QArt = {
  GUNS, PALETTES, BULLETS, ENEMY_ART, BOSS_ART,
  drawGun, drawCharacter, bulletSprite, drawBullet, bulletKindOf,
  drawEnemy, drawBoss,
  muzzleFlash, casing, impactSpark, telegraph, deathPuff, laserBeam, chainBolt,
  eye, blob, gloss, shadow, blush, brow, star, out, shade, withAlpha, mixHex,
  clamp, rand, TAU,
};
global.QArt = QArt;
})(typeof window !== 'undefined' ? window : globalThis);
