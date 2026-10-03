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
 * 锚点三枪（已出图，待接）：GUNS 新增 sickle / mortar / whip 三个 id，drawGun 直接含 Lv1~5 递进。
 *   drawBullet 新增 bulletKey：'sickle'（tr.spin 自转）、'grenade'（tr.spin / tr.squash / tr.fuse）。
 *   新 fx：boomerangSwoosh({x,y,ang,r,back,k}) 去程冷白·回程暖橙的破空弧带；
 *          blastRing({x,y,r,k,seed}) 爆炸三层（白芯→冲击波→火球+八向铁片）；
 *          scorchDecal({x,y,r,a,al}) 焦土贴花，需存进地面层（同 room.blood 用法）不走 fx 寿命；
 *          whipArc({x,y,ang,spread,r,k,hit}) 无弹道枪的挥击体，k 1→0 扫过整段弧。
 *   muzzleFlash 三把各有分支：投掷类只扬骨粉、迫击类是闷响后喷、鞭是起手弧光。
 *   impactSpark 的 id 新增 'sickle' / 'mortar' / 'whip' 三种配色。
 *
 * 第二批七枪（已出图，待接）：GUNS 新增 chrys / pin / rail / duck / hive / vortex / twin。
 *   drawBullet 新增 bulletKey：chrys petal pin duck hive bee core shadow（DIR/SPIN 分派已处理）。
 *   行为 fx：petalBurst 花瓣绽开 / pinTrap 落地钉（危险圈 + 小旗）/ pinGrid 钉间电网(Lv5) /
 *            chargeRing 蓄力环 + railShot 贯穿线 / bouncePop 鸭子弹跳挤压 / hiveBurst 破巢涌蜂 /
 *            vortexField 吸附场 + vortexImplode 塌缩 / shadowClone 影分身（晚几帧开火）。
 *   muzzleFlash 七把各有分支：开花、撒钉无光、光矛、气环、蜂群、向内塌缩、双管异色。
 *   需 dev 侧新增系统：pin 的落地钉与 vortex 的漩涡体不是 Tear（要新实体）；
 *                     rail 无飞行弹体（蓄力→瞬发线段）；twin 需要第二开火源。
 *
 * 配件层（本轮新增，角色 = 数据而非分支）：
 *   角色字段：style 发型 / acc 配件数组 / eyes('normal'|'glow'|'dot'|'none') / headC 头色覆盖
 *            / suitAlt 次色 / aura('feather'|'spark'|'ember') / bulk 体型 / rar 稀有度
 *   ACC 四层（按此顺序绘制）：
 *     背层   speedline cape wings scroll weaponBack jetpack tail collar scarf
 *     躯干层 chestplate pauldron reactor bolt screen strip
 *     头层   hood ears horns halo goggles headphones headlamp antenna winghelm masklower eyepatch visor fins
 *     前层   lantern orbit pet aura
 *   头形：headShape:'square' 方头 / headC 覆盖头色（面罩类）/ headRivet 面甲铆钉
 *   下身：lowerGhost:true 用渐隐雾尾替换双腿
 *   新增角色只需往 PALETTES 加一条数据；只有出现全新配件时才需要动 drawCharacter。
 *   卡面：QArt.drawCard(ctx, { x, y, w, h, char, t, gun, lvl })，稀有度取 char.rar。
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
  // ↓ 锚点三枪：投掷类 / 抛射类 / 无弹道近战类，三种最难看的形态先锁风格
  sickle: { c: '#cbb98a', name: '骨镰回旋镖' },
  mortar: { c: '#a8c05a', name: '罐罐雷' },
  whip:   { c: '#b04a6a', name: '荆棘鞭' },
  // ↓ 第二批七把
  chrys:  { c: '#f2c4d4', name: '千瓣菊' },
  pin:    { c: '#9b8fd0', name: '刺猬钉' },
  rail:   { c: '#7fe0d8', name: '穿云枪' },
  duck:   { c: '#f2cf3a', name: '橡皮鸭' },
  hive:   { c: '#e0a83c', name: '工蜂箱' },
  vortex: { c: '#8f6fd8', name: '漩涡核' },
  twin:   { c: '#c8c0e8', name: '双影铳' },
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
  } else if (id === 'flame') {
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
  } else if (id === 'sickle') {
    // 骨镰回旋镖：皮革腕座 + 自转骨环 + 三片镰刃。投掷类，没有枪管
    part(() => { ctx.beginPath(); ctx.roundRect(-10, -5.2, 12, 10.4, 4.4); }, '#6a4a30');
    ctx.strokeStyle = 'rgba(38,22,10,.75)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-8 + i * 3.4, -5.2); ctx.lineTo(-7.2 + i * 3.4, 5.2); ctx.stroke(); }
    ctx.fillStyle = acc; ctx.beginPath(); ctx.roundRect(-9, -1.6, 10, 3.2, 1.4); ctx.fill();   // 缝线带
    const spin = t * (lvl >= 5 ? .18 : .11);
    const ring = (cx, cy, rr, blades) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(spin);
      for (let i = 0; i < blades; i++) {
        ctx.save(); ctx.rotate(i * TAU / blades);
        ctx.beginPath();
        ctx.moveTo(0, -2.8);
        ctx.bezierCurveTo(rr * .95, -rr * .98, rr * 1.34, -rr * .06, rr * 1.0, rr * .5);   // 外刃甩到钩尖
        ctx.quadraticCurveTo(rr * .8, rr * .04, rr * .34, -rr * .04);                        // 内刃回勾
        ctx.quadraticCurveTo(rr * .14, rr * .34, 1.4, 2.7);                                  // 收回柄部
        ctx.closePath();
        ctx.fillStyle = '#ded3b6'; ctx.fill(); out(ctx, 1.8);
        ctx.strokeStyle = 'rgba(120,100,64,.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(1, -1.4); ctx.bezierCurveTo(rr * .7, -rr * .66, rr * .96, -rr * .1, rr * .78, rr * .22); ctx.stroke();
        ctx.restore();
      }
      ctx.fillStyle = lite; ctx.beginPath(); ctx.arc(0, 0, 3.1, 0, TAU); ctx.fill(); out(ctx, 1.8);
      ctx.fillStyle = '#3a2a1c'; ctx.beginPath(); ctx.arc(0, 0, 1.2, 0, TAU); ctx.fill();
      ctx.restore();
    };
    ring(9, 0, 9.5, lvl >= 5 ? 4 : 3);
    if (lvl >= 3) ring(2, -9.5, 6, 3);   // 副环盘在小臂上
  } else if (id === 'mortar') {
    // 罐罐雷：粗短迫击筒 + 底座 + 仰角刻度 + 膛口半露的罐头
    part(() => { ctx.beginPath(); ctx.roundRect(-11, -4, 9, 9, 3.4); }, dark);
    part(() => { ctx.beginPath(); ctx.moveTo(-4, -7); ctx.lineTo(12, -5.6); ctx.lineTo(12, 5.6); ctx.lineTo(-4, 7); ctx.closePath(); }, base);
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1.4;                              // 筒身焊环
    for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.moveTo(-1 + i * 5, -6.6 + i * .4); ctx.lineTo(-1 + i * 5, 6.6 - i * .4); ctx.stroke(); }
    part(() => { ctx.beginPath(); ctx.roundRect(-7, 6.2, 14, 4.6, 2.2); }, lite);          // 座板
    ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 1.3;                        // 仰角刻度
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-2 + i * 4, -7.2); ctx.lineTo(-2 + i * 4, -9.6 - (i === 1 ? 1.4 : 0)); ctx.stroke(); }
    ctx.beginPath(); ctx.ellipse(12.6, 0, 3, 5.8, 0, 0, TAU); ctx.fillStyle = shade(base, -52); ctx.fill(); out(ctx, 2.2);
    part(() => { ctx.beginPath(); ctx.roundRect(11, -3.2, 6.4, 6.4, 1.6); }, '#cfc6ae');   // 半露罐头
    ctx.fillStyle = acc; ctx.beginPath(); ctx.roundRect(11.6, -1.3, 5.4, 2.6, 1); ctx.fill();
    if (lvl >= 3) { // 并联副筒，仰角更高
      part(() => { ctx.beginPath(); ctx.moveTo(-2, -12.4); ctx.lineTo(10, -11.2); ctx.lineTo(10, -6.4); ctx.lineTo(-2, -7.2); ctx.closePath(); }, shade(base, -12));
      ctx.beginPath(); ctx.ellipse(10.6, -9, 2.2, 3, 0, 0, TAU); ctx.fillStyle = shade(base, -52); ctx.fill(); out(ctx, 1.8);
    }
    if (lvl >= 5) { // 尾翼稳定环 + 筒口余热
      ctx.strokeStyle = withAlpha(acc, .85); ctx.lineWidth = 1.8;
      for (const dx of [2, 7]) { ctx.beginPath(); ctx.ellipse(dx, 0, 1.6, 8.2, 0, 0, TAU); ctx.stroke(); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,180,90,${.22 + .12 * Math.sin(t * .3)})`;
      ctx.beginPath(); ctx.ellipse(13.4, 0, 3.6, 6.6, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  } else if (id === 'whip') {
    // 荆棘鞭：握把 → 十字护手 → 外置盘绕三圈 → 甩出的鞭梢。四段彼此要分得开
    part(() => { ctx.beginPath(); ctx.roundRect(-13, -3.2, 11, 6.4, 3); }, '#4a3038');
    ctx.fillStyle = acc;                                                                       // 握把缠绳
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.roundRect(-11.5 + i * 3.4, -3.2, 1.8, 6.4, .8); ctx.fill(); }
    part(() => { ctx.beginPath(); ctx.roundRect(-2.6, -7, 4.2, 14, 2); }, lite);               // 十字护手
    ctx.strokeStyle = '#3a2a30'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';                   // 盘绕：向右开口，不压握把
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(7.5, 0, 3 + i * 3.2, -1.45, 1.45); ctx.stroke(); }
    ctx.strokeStyle = shade(acc, -14); ctx.lineWidth = 1.5;                                    // 圈上倒刺
    for (const a of [-.9, 0, .9]) {
      ctx.beginPath(); ctx.moveTo(7.5 + Math.cos(a) * 7.4, Math.sin(a) * 7.4);
      ctx.lineTo(7.5 + Math.cos(a) * 11.8, Math.sin(a) * 11.8); ctx.stroke();
    }
    const flick = Math.sin(t * .12) * 1.6;
    ctx.strokeStyle = '#3a2a30'; ctx.lineWidth = 2.8;                                          // 鞭梢
    ctx.beginPath(); ctx.moveTo(10.4, -8.6); ctx.quadraticCurveTo(16.5, -9.4 + flick, 21, -4.6 + flick); ctx.stroke();
    ctx.fillStyle = '#d8cfc0';
    ctx.beginPath(); ctx.moveTo(20.4, -6.2 + flick); ctx.lineTo(25.4, -3.4 + flick); ctx.lineTo(20.6, -2.2 + flick); ctx.closePath(); ctx.fill(); out(ctx, 1.5);
    if (lvl >= 3) {                                                                            // 双股
      ctx.strokeStyle = '#4a343c'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(10.4, 8.6); ctx.quadraticCurveTo(16, 9.6 - flick, 20, 5.4 - flick); ctx.stroke();
      ctx.fillStyle = '#d8cfc0'; ctx.beginPath(); ctx.moveTo(19.4, 6.8 - flick); ctx.lineTo(24.2, 4 - flick); ctx.lineTo(19.6, 2.8 - flick); ctx.closePath(); ctx.fill(); out(ctx, 1.4);
    }
    if (lvl >= 5) {                                                                            // 梢头血光
      ctx.strokeStyle = withAlpha('#ff8fa8', .55 + .25 * Math.sin(t * .22)); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(22.6, -4 + flick, 4, -1.2, 1.2); ctx.stroke();
      ctx.fillStyle = 'rgba(196,48,58,.75)';
      for (const [dx, dy] of [[-8, -5.6], [-4, 5.6], [0, -6.6]]) { ctx.beginPath(); ctx.arc(dx, dy, 1.3, 0, TAU); ctx.fill(); }
    }
  }

  // ── 第二批七把：各自独立轮廓，等级递进走"加件"而不是"放大" ──
  if (id === 'chrys') {
    // 千瓣菊：竹茎枪身 + 沿程侧叶 + 枪口花苞（等级加花瓣层数）
    part(() => { ctx.beginPath(); ctx.roundRect(-10, -3.2, 12, 6.4, 3); }, '#6a7a4a');
    ctx.strokeStyle = 'rgba(38,50,22,.7)'; ctx.lineWidth = 1.3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-8 + i * 3.6, -3.2); ctx.lineTo(-8 + i * 3.6, 3.2); ctx.stroke(); }
    part(() => { ctx.beginPath(); ctx.roundRect(1, -2.2, 11, 4.4, 2); }, '#8aa05c');
    for (const sgn of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(5 + (sgn > 0 ? 3.4 : 0), sgn * 5.2, 4.2, 1.9, sgn * .5, 0, TAU);
      ctx.fillStyle = '#7fa050'; ctx.fill(); out(ctx, 1.4);
    }
    ctx.save(); ctx.translate(14.5, 0); ctx.rotate(t * .04);
    for (let ring = 0; ring < (lvl >= 5 ? 3 : lvl >= 3 ? 2 : 1); ring++) {
      const pr = 4.4 + ring * 2.6, n = 7 + ring * 3;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU + ring * .42;
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * pr * .66, Math.sin(a) * pr * .66, pr * .52, pr * .2, a, 0, TAU);
        ctx.fillStyle = ring % 2 ? '#f9e4ec' : '#f2c4d4'; ctx.fill();
        ctx.strokeStyle = 'rgba(126,62,84,.45)'; ctx.lineWidth = .9; ctx.stroke();
      }
    }
    ctx.fillStyle = '#ffd86a'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,80,20,.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    if (lvl >= 3) { ctx.fillStyle = 'rgba(255,240,120,.5)'; ctx.beginPath(); ctx.arc(14.5, 0, 8.6, 0, TAU); ctx.fill(); }
  }
  if (id === 'pin') {
    // 刺猬钉：斜置钉盒（盒内露彩色钉头）+ 出钉滑槽 + 拇指压杆
    part(() => { ctx.beginPath(); ctx.moveTo(-11, -6.4); ctx.lineTo(7, -4.6); ctx.lineTo(7, 6.2); ctx.lineTo(-11, 4.6); ctx.closePath(); }, '#3a3050');
    ctx.save();
    ctx.beginPath(); ctx.moveTo(-9.6, -5.2); ctx.lineTo(5.8, -3.5); ctx.lineTo(5.8, 5); ctx.lineTo(-9.6, 3.5); ctx.closePath(); ctx.clip();
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ['#d05a6a', '#5a8ad0', '#e0b84a', '#6ac07a', '#c06ac0', '#e8e2d0'][i];
      ctx.beginPath(); ctx.arc(-7 + (i % 3) * 4.4, -1.6 + Math.floor(i / 3) * 3.6, 2.1, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(20,12,34,.6)'; ctx.lineWidth = .9; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.arc(-7.6 + (i % 3) * 4.4, -2.3 + Math.floor(i / 3) * 3.6, .7, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = OL; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-11, -6.4); ctx.lineTo(7, -4.6); ctx.lineTo(7, 6.2); ctx.lineTo(-11, 4.6); ctx.closePath(); ctx.stroke();
    part(() => { ctx.beginPath(); ctx.roundRect(6, -3.4, 9, 6.8, 2); }, '#6a5c92');
    ctx.fillStyle = '#140f20'; ctx.beginPath(); ctx.roundRect(13.2, -1.7, 2.6, 3.4, 1); ctx.fill();
    part(() => { ctx.beginPath(); ctx.roundRect(-5, -10.4, 7.6, 4.6, 2); }, lite);
    ctx.strokeStyle = 'rgba(20,12,34,.55)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-1.4, -5.8); ctx.lineTo(-1.4, -10.2); ctx.stroke();
    if (lvl >= 3) part(() => { ctx.beginPath(); ctx.roundRect(-12, 4.4, 10.5, 4.2, 2); }, '#6a5c92');
    if (lvl >= 5) { ctx.strokeStyle = withAlpha(acc, .85); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(14.6, 0, 5.6, -1.1, 1.1); ctx.stroke(); }
  }
  if (id === 'rail') {
    // 穿云枪：超长枪管 + 散热孔 + 多孔制退器 + 顶置瞄具 + 折叠两脚架
    part(() => { ctx.beginPath(); ctx.roundRect(-12, -3.8, 15, 7.6, 3); }, base);
    part(() => { ctx.beginPath(); ctx.roundRect(2, -2.1, 24, 4.2, 1.8); }, dark);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = '#12101a'; ctx.beginPath(); ctx.arc(7.5 + i * 4.8, 0, 1.1, 0, TAU); ctx.fill(); }
    part(() => { ctx.beginPath(); ctx.roundRect(25, -3.4, 5.4, 6.8, 1.8); }, lite);
    ctx.fillStyle = '#0c0a12'; ctx.beginPath(); ctx.arc(29.2, 0, 1.7, 0, TAU); ctx.fill();
    part(() => { ctx.beginPath(); ctx.roundRect(-5, -9, 12, 3.8, 1.8); }, '#2b3a42');
    ctx.fillStyle = withAlpha(acc, .95); ctx.beginPath(); ctx.arc(6.2, -7.1, 1.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = shade(base, -22); ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(12, 2.2); ctx.lineTo(8.6, 9.2); ctx.moveTo(12, 2.2); ctx.lineTo(15.4, 9.2); ctx.stroke();
    if (lvl >= 3) part(() => { ctx.beginPath(); ctx.roundRect(-15.5, -2.6, 5.4, 7.4, 2); }, acc);
    if (lvl >= 5) { ctx.strokeStyle = withAlpha(acc, .75); ctx.lineWidth = 1.4;
      for (const dx of [16, 21]) { ctx.beginPath(); ctx.ellipse(dx, 0, 1.5, 5.4, 0, 0, TAU); ctx.stroke(); } }
  }
  if (id === 'duck') {
    // 橡皮鸭：打气筒 + 透明膛窗里一只鸭 + 指针随等级升的压力表
    part(() => { ctx.beginPath(); ctx.roundRect(-12, -3, 8.6, 6, 2.6); }, '#c05a6a');
    part(() => { ctx.beginPath(); ctx.roundRect(-4.4, -4.8, 13.4, 9.6, 4); }, '#d8d2c4');
    ctx.fillStyle = 'rgba(150,190,225,.5)'; ctx.beginPath(); ctx.roundRect(-.5, -3.4, 8.4, 6.8, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(90,110,130,.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.save(); ctx.translate(3.6, .2); ctx.scale(.58, .58);
    ctx.fillStyle = '#f7d94a';
    ctx.beginPath(); ctx.arc(0, 1.4, 4.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(2.4, -3.6, 3.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f09a3a'; ctx.beginPath(); ctx.moveTo(5, -4); ctx.lineTo(8.8, -3.1); ctx.lineTo(5, -2.2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a1c08'; ctx.beginPath(); ctx.arc(3.2, -4.4, .8, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#8a8578'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(9.2, -4.8); ctx.lineTo(9.2, -8); ctx.stroke();
    part(() => { ctx.beginPath(); ctx.arc(9.6, -10, 3.5, 0, TAU); }, '#efe8d6');
    ctx.strokeStyle = '#c04040'; ctx.lineWidth = 1.3;
    const nd = -2.2 + (lvl / 5) * 1.5 + Math.sin(t * .2) * .12;
    ctx.beginPath(); ctx.moveTo(9.6, -10); ctx.lineTo(9.6 + Math.cos(nd) * 2.5, -10 + Math.sin(nd) * 2.5); ctx.stroke();
    part(() => { ctx.beginPath(); ctx.roundRect(8.8, -2.8, 5.8, 5.6, 2); }, '#c05a6a');
    if (lvl >= 3) { ctx.fillStyle = 'rgba(255,255,255,.34)'; ctx.beginPath(); ctx.roundRect(-3.4, -4.4, 3, 8.8, 1.4); ctx.fill(); }
    if (lvl >= 5) { ctx.strokeStyle = withAlpha('#f2cf3a', .85); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(12, 0, 6.4, -1.1, 1.1); ctx.stroke(); }
  }
  if (id === 'hive') {
    // 工蜂箱：六边形箱体 + 出入洞 + 挂蜜 + 提框 + 洞口待命的蜂
    const hex = (cx, cy, r, w) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + .5; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * .92); }
      ctx.closePath(); ctx.fillStyle = w || '#a8762e'; ctx.fill(); out(ctx, 2.3);
    };
    hex(-1.5, 0, 10.6);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + .5; ctx.lineTo(-1.5 + Math.cos(a) * 7, Math.sin(a) * 7 * .92); }
    ctx.closePath(); ctx.strokeStyle = 'rgba(78,48,14,.55)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#33200a'; ctx.beginPath(); ctx.ellipse(8.6, 2, 2.7, 2.1, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,110,.9)'; ctx.beginPath(); ctx.roundRect(7.6, 3.8, 2.1, 4.6, 1); ctx.fill();
    part(() => { ctx.beginPath(); ctx.roundRect(-7, -13, 11, 3.6, 1.7); }, '#7a5a2a');
    ctx.strokeStyle = '#5a4222'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-5 + i * 3.6, -9.4); ctx.lineTo(-5 + i * 3.6, -6.6); ctx.stroke(); }
    const bg = Math.sin(t * .5) * .6;
    for (const [bx, by] of [[11, -1.6], [12.6, 1.2]]) {
      ctx.fillStyle = '#e8c84a'; ctx.beginPath(); ctx.ellipse(bx, by + bg, 1.8, 1.35, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(40,26,8,.8)'; ctx.beginPath(); ctx.ellipse(bx + .5, by + bg, .8, 1.35, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.beginPath(); ctx.ellipse(bx - .5, by - 1.5 + bg * 1.6, 1.6, .7, -.5, 0, TAU); ctx.fill();
    }
    if (lvl >= 3) hex(-10, -6.6, 4.8);
    if (lvl >= 5) { ctx.strokeStyle = withAlpha('#e0a83c', .8); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(8.6, 2, 5.8, -1.2, 1.2); ctx.stroke(); }
  }
  if (id === 'vortex') {
    // 漩涡核：漏斗炮口 + 三爪夹持的悬浮黑核 + 环绕尘埃
    part(() => { ctx.beginPath(); ctx.roundRect(-11, -4.2, 13, 8.4, 3.4); }, '#3a3450');
    part(() => { ctx.beginPath(); ctx.moveTo(1.5, -3.6); ctx.lineTo(10.5, -8); ctx.lineTo(13.4, -8); ctx.lineTo(13.4, 8); ctx.lineTo(10.5, 8); ctx.lineTo(1.5, 3.6); ctx.closePath(); }, '#5a5080');
    ctx.fillStyle = '#100c1a'; ctx.beginPath(); ctx.ellipse(13.2, 0, 1.9, 7.8, 0, 0, TAU); ctx.fill();
    for (const a of [-2.2, 0, 2.2]) {
      ctx.strokeStyle = '#8a80b8'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(15 + Math.cos(a) * 3, Math.sin(a) * 3);
      ctx.lineTo(17.4 + Math.cos(a) * 5.4, Math.sin(a) * 5.4); ctx.stroke();
    }
    const orb = 16.6, spin = t * .16;
    ctx.fillStyle = '#0a0714'; ctx.beginPath(); ctx.arc(orb, 0, 3.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = withAlpha(acc, .95); ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = 'rgba(226,216,255,.8)';
    for (let i = 0; i < 3; i++) {
      const a = spin + i * TAU / 3;
      ctx.beginPath(); ctx.arc(orb + Math.cos(a) * 5.8, Math.sin(a) * 4, .95, 0, TAU); ctx.fill();
    }
    if (lvl >= 3) { ctx.strokeStyle = withAlpha(acc, .55); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(orb, 0, 6.8, 2.7, .42, 0, TAU); ctx.stroke(); }
    if (lvl >= 5) { ctx.fillStyle = withAlpha(acc, .3); ctx.beginPath(); ctx.arc(orb, 0, 6.4 + Math.sin(t * .2) * .9, 0, TAU); ctx.fill(); }
  }
  if (id === 'twin') {
    // 双影铳：上下双管（下管偏暗=影管）+ 缠臂影子布 + 握把鬼眼
    part(() => { ctx.beginPath(); ctx.roundRect(-10, -4.6, 12, 9.2, 3.4); }, '#4a4460');
    part(() => { ctx.beginPath(); ctx.roundRect(1, -6.4, 17, 4.6, 2); }, lite);
    part(() => { ctx.beginPath(); ctx.roundRect(1, 1.8, 17, 4.6, 2), ctx.closePath(); }, '#3a3448');
    ctx.fillStyle = '#12101c';
    ctx.beginPath(); ctx.arc(18.2, -4.1, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(18.2, 4.1, 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(18.2, -4.1, .75, 0, TAU); ctx.fill();
    ctx.fillStyle = withAlpha(acc, .9); ctx.beginPath(); ctx.arc(18.2, 4.1, .75, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(58,50,84,.95)'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const wx of [-8.6, -5.8]) { // 两道缠布，留出鬼眼位置
      ctx.beginPath(); ctx.moveTo(wx, -4.8); ctx.quadraticCurveTo(wx + 1.6, 0, wx - .6, 4.8); ctx.stroke();
    }
    ctx.fillStyle = '#eee8fa'; ctx.beginPath(); ctx.arc(-1.4, 0, 2.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(30,24,48,.8)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#2a2440'; ctx.beginPath(); ctx.arc(-1, 0, 1.15, 0, TAU); ctx.fill();
    if (lvl >= 3) { ctx.strokeStyle = withAlpha(acc, .75); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(3, -8.8, 12, 2.2, 1); ctx.stroke(); }
    if (lvl >= 5) {
      ctx.fillStyle = `rgba(150,130,220,${.22 + .1 * Math.sin(t * .2)})`;
      ctx.beginPath(); ctx.ellipse(10, 6, 9.4, 2.8, 0, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

// ─────────────────────────────────────────────
// 二、角色：Q 版 1.3 头身，大眼小短腿
// 原点 = 身体中心（与游戏 p.x/p.y 一致），脚底约 y=+18
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// 二·五、配件层：角色 = 发型(style) + 配件(acc) + 眼部(eyes) + 头形(head) + 光环(aura)
// 目的：新增角色只加数据，不再往 drawCharacter 里塞分支
// geom 由 drawCharacter 传入：{ hr 头半径, hy 头心y, bw 身半宽, bob, aim }
// ─────────────────────────────────────────────
const RARITY = {
  SSR: { c: '#f0b94a', dim: 'rgba(240,185,74,', stars: 3 },
  SR:  { c: '#b07fe0', dim: 'rgba(176,127,224,', stars: 2 },
  R:   { c: '#7fb2e8', dim: 'rgba(127,178,232,', stars: 1 },
};

const ACC = {
  // ── 背层 ──
  cape(ctx, ch, g, t) {
    const sw = Math.sin(t * .07) * 3, sp = ch.capeSpread || 1.7, ln = ch.capeLen || 26;
    ctx.beginPath();
    ctx.moveTo(-g.bw * .75, g.hy + g.hr * .95);
    ctx.quadraticCurveTo(-g.bw * sp * 1.25, 4, -g.bw * sp * .95 + sw, ln);
    for (let i = 0; i < 4; i++) { // 下摆锯齿波
      const x0 = -g.bw * sp * .95 + sw + (i + .5) * (g.bw * sp * 1.9 / 4);
      ctx.quadraticCurveTo(x0, ln + (i % 2 ? 4 : -3), x0 + g.bw * sp * 1.9 / 8, ln);
    }
    ctx.quadraticCurveTo(g.bw * sp * 1.25, 4, g.bw * .75, g.hy + g.hr * .95);
    ctx.closePath();
    ctx.fillStyle = ch.capeC || ch.suit; ctx.fill(); out(ctx, 2.6);
    ctx.save(); ctx.clip();                                    // 内衬亮色：只在边缘一条
    ctx.strokeStyle = ch.suitAlt || ch.accent; ctx.lineWidth = 5.4;
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,.18)';
    ctx.beginPath(); ctx.ellipse(0, ln * .55, g.bw * sp * .5, ln * .3, 0, 0, TAU); ctx.fill();
  },
  wings(ctx, ch, g, t) {
    const fl = Math.sin(t * .1) * .16;
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.translate(sgn * g.bw * .5, g.hy + g.hr * .5); ctx.rotate(sgn * (.5 + fl * sgn));
      ctx.globalAlpha = .5;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(sgn * 20, -16, sgn * 26, 2);
      ctx.quadraticCurveTo(sgn * 16, 0, sgn * 12, 12);
      ctx.quadraticCurveTo(sgn * 6, 2, 0, 0); ctx.closePath();
      ctx.fillStyle = ch.wingC || '#eaf2ff'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.globalAlpha = 1; ctx.restore();
    }
  },
  tail(ctx, ch, g, t) {
    const sw = Math.sin(t * .12) * .5;
    ctx.save(); ctx.translate(-g.bw * .7, 8); ctx.rotate(-.7 + sw);
    ctx.strokeStyle = ch.tailC || ch.suitAlt || ch.hair; ctx.lineWidth = 4.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-10, 4, -16, -6, -20, 4 + Math.sin(t * .16) * 3); ctx.stroke();
    ctx.fillStyle = ch.tailC || ch.suitAlt || ch.hair;
    ctx.beginPath(); ctx.moveTo(-20, 2); ctx.lineTo(-26, 8); ctx.lineTo(-18, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  },
  scroll(ctx, ch, g, t) {
    ctx.save(); ctx.translate(0, g.hy + g.hr * 1.1); ctx.rotate(-.42);
    ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.roundRect(-16, -4, 32, 8, 4); ctx.fill(); out(ctx, 2);
    ctx.fillStyle = '#8a5a3a';
    ctx.beginPath(); ctx.roundRect(-18, -5, 4, 10, 2); ctx.fill();
    ctx.beginPath(); ctx.roundRect(14, -5, 4, 10, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,30,.5)'; ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-10, i * 2.4); ctx.lineTo(10, i * 2.4); ctx.stroke(); }
    ctx.restore();
  },
  // ── 头层 ──
  ears(ctx, ch, g, t) {
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.translate(sgn * g.hr * .62, g.hy - g.hr * .78); ctx.rotate(sgn * .22);
      ctx.beginPath();
      if (ch.earShape === 'antenna') { ctx.moveTo(0, 0); ctx.lineTo(sgn * 1.6, -g.hr * 1.15); ctx.lineTo(sgn * 3.6, -g.hr * .1); }
      else { ctx.moveTo(-3.4, 2); ctx.lineTo(0, -g.hr * .78); ctx.lineTo(3.6, 1.6); }
      ctx.closePath();
      ctx.fillStyle = ch.hair; ctx.fill(); out(ctx, 2);
      ctx.beginPath(); ctx.moveTo(-1.6, 1); ctx.lineTo(0, -g.hr * .5); ctx.lineTo(1.8, .8); ctx.closePath();
      ctx.fillStyle = ch.suitAlt || 'rgba(240,150,170,.6)'; ctx.fill();
      ctx.restore();
    }
  },
  horns(ctx, ch, g, t) {
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.translate(sgn * g.hr * .66, g.hy - g.hr * .66); ctx.rotate(sgn * .5);
      ctx.beginPath(); ctx.moveTo(0, 3);
      ctx.quadraticCurveTo(sgn * 7, -2, sgn * 8.6, -g.hr * .95);
      ctx.quadraticCurveTo(sgn * 3.4, -3, 0, -2.4); ctx.closePath();
      const hg = ctx.createLinearGradient(0, 0, sgn * 8, -g.hr);
      hg.addColorStop(0, '#5a4450'); hg.addColorStop(1, ch.accent);
      ctx.fillStyle = hg; ctx.fill(); out(ctx, 1.8); ctx.restore();
    }
  },
  halo(ctx, ch, g, t) {
    const y = g.hy - g.hr * 1.42, wob = Math.sin(t * .08) * .09;
    ctx.save(); ctx.translate(0, y); ctx.rotate(wob); ctx.scale(1, .34);
    ctx.strokeStyle = ch.brokenHalo ? 'rgba(255,228,150,.45)' : '#ffe496';
    ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    if (ch.brokenHalo) {
      ctx.beginPath(); ctx.arc(0, 0, g.hr * .92, .5, Math.PI * 1.72); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, g.hr * .92, Math.PI * 1.9, 2.7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,190,.8)';
      for (const a of [.42, 2.85]) { star(ctx, Math.cos(a) * g.hr * .92, Math.sin(a) * g.hr * .92, 2.2, 4, .4); ctx.fill(); }
    } else { ctx.beginPath(); ctx.arc(0, 0, g.hr * .92, 0, TAU); ctx.stroke(); }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,236,170,.3)'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(0, 0, g.hr * .92, 0, TAU); ctx.stroke();
    ctx.restore();
  },
  hood(ctx, ch, g, t) {
    ctx.beginPath(); ctx.arc(0, g.hy - g.hr * .06, g.hr * 1.28, Math.PI * .82, Math.PI * 2.18);
    ctx.quadraticCurveTo(g.hr * .9, g.hy + g.hr * .5, 0, g.hy + g.hr * .34);
    ctx.quadraticCurveTo(-g.hr * .9, g.hy + g.hr * .5, -g.hr * 1.22, g.hy - g.hr * .3);
    ctx.closePath();
    ctx.fillStyle = ch.hoodC || ch.suit; ctx.fill(); out(ctx, 2.4);
    ctx.fillStyle = 'rgba(0,0,0,.34)';                       // 兜帽压下的面部阴影
    ctx.beginPath(); ctx.ellipse(0, g.hy - g.hr * .34, g.hr * .86, g.hr * .5, 0, Math.PI, TAU); ctx.fill();
  },
  visor(ctx, ch, g, t) {
    if (ch.visorShape === 'tee') {                            // T 形目镜
      ctx.fillStyle = ch.visorC || '#8ff0ea';
      ctx.beginPath(); ctx.roundRect(-g.hr * .78, g.hy - g.hr * .3, g.hr * 1.56, g.hr * .3, 2); ctx.fill();
      ctx.beginPath(); ctx.roundRect(-g.hr * .2, g.hy - g.hr * .3, g.hr * .4, g.hr * .95, 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = withAlpha(ch.visorC || '#8ff0ea', .4);
      ctx.beginPath(); ctx.roundRect(-g.hr * .9, g.hy - g.hr * .4, g.hr * 1.8, g.hr * .5, 3); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {                                                  // 菱形大目镜（蛛影）
      for (const sgn of [-1, 1]) {
        ctx.save(); ctx.translate(sgn * g.hr * .42, g.hy + g.hr * .04); ctx.rotate(sgn * .3);
        ctx.beginPath(); ctx.moveTo(-g.hr * .4, 0); ctx.lineTo(0, -g.hr * .26); ctx.lineTo(g.hr * .4, 0); ctx.lineTo(0, g.hr * .26); ctx.closePath();
        ctx.fillStyle = '#f6f4ef'; ctx.fill();
        ctx.strokeStyle = 'rgba(20,14,24,.85)'; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.restore();
      }
    }
  },
  masklower(ctx, ch, g, t) {
    ctx.beginPath(); ctx.ellipse(0, g.hy + g.hr * .42, g.hr * .82, g.hr * .5, 0, 0, Math.PI);
    ctx.closePath(); ctx.fillStyle = ch.maskC || ch.suit; ctx.fill(); out(ctx, 1.8);
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-g.hr * .5, g.hy + g.hr * .5); ctx.lineTo(g.hr * .5, g.hy + g.hr * .5); ctx.stroke();
  },
  goggles(ctx, ch, g, t) {
    ctx.save(); ctx.translate(0, g.hy - g.hr * .58);
    ctx.fillStyle = '#2a2620'; ctx.beginPath(); ctx.roundRect(-g.hr * .95, -3.2, g.hr * 1.9, 6.4, 3); ctx.fill(); out(ctx, 1.6);
    for (const sgn of [-1, 1]) {
      ctx.beginPath(); ctx.arc(sgn * g.hr * .44, 0, 3.4, 0, TAU);
      ctx.fillStyle = ch.lampC || '#ffd86a'; ctx.fill();
      ctx.strokeStyle = 'rgba(20,14,6,.8)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(sgn * g.hr * .44 - 1, -1, 1.1, 0, TAU); ctx.fill();
    }
    ctx.restore();
  },
  headlamp(ctx, ch, g, t) {
    const lx = 0, ly = g.hy - g.hr * 1.02;
    ctx.fillStyle = '#3a3630'; ctx.beginPath(); ctx.roundRect(-4, ly - 2, 8, 5, 2); ctx.fill(); out(ctx, 1.4);
    ctx.fillStyle = ch.lampC || '#ffe08a'; ctx.beginPath(); ctx.arc(0, ly + .6, 2.6, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(0, ly, 0, 0, ly, 16);
    lg.addColorStop(0, 'rgba(255,224,140,.5)'); lg.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(0, ly, 16, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  },
  antenna(ctx, ch, g, t) {
    const ax = g.hr * .5, ay = g.hy - g.hr * 1.02, sw = Math.sin(t * .12) * 2;
    ctx.strokeStyle = '#9aa0ac'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + sw * .4, ay - 9); ctx.stroke();
    ctx.fillStyle = ch.accent; ctx.beginPath(); ctx.arc(ax + sw * .4, ay - 10.4, 2.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = withAlpha(ch.accent, .5); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ax + sw * .4, ay - 10.4, 4.6 + Math.sin(t * .2) * 1.2, 0, TAU); ctx.stroke();
  },
  collar(ctx, ch, g, t) {                                    // 高立领（夹住头两侧）
    for (const sgn of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sgn * g.bw * .5, g.hy + g.hr * .95);
      ctx.quadraticCurveTo(sgn * (g.bw * 1.5), g.hy + g.hr * .3, sgn * (g.bw * 1.25), g.hy - g.hr * .72);
      ctx.quadraticCurveTo(sgn * g.bw * .85, g.hy + g.hr * .1, sgn * g.bw * .2, g.hy + g.hr * 1.05);
      ctx.closePath();
      ctx.fillStyle = ch.collarC || ch.suitAlt || shade(ch.suit, 18); ctx.fill(); out(ctx, 2.2);
    }
  },
  // ── 手持 / 环绕 / 粒子 ──
  lantern(ctx, ch, g, t) {
    const sw = Math.sin(t * .1) * .22, hx = g.bw * 1.5, hy = 4;
    ctx.strokeStyle = 'rgba(40,30,20,.85)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(g.bw * .6, 1); ctx.lineTo(hx, hy - 6); ctx.stroke();
    ctx.save(); ctx.translate(hx, hy - 6); ctx.rotate(sw);
    ctx.fillStyle = '#4a4438'; ctx.beginPath(); ctx.roundRect(-5, -8.6, 10, 3, 1.4); ctx.fill();
    ctx.fillStyle = withAlpha(ch.lampC || '#ffb84a', .85);
    ctx.beginPath(); ctx.roundRect(-4.4, -6, 8.8, 11, 2.4); ctx.fill();
    ctx.strokeStyle = '#4a4438'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, 22);
    lg.addColorStop(0, 'rgba(255,190,90,.55)'); lg.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  },
  orbit(ctx, ch, g, t) {                                     // 环绕物：符卡 / 碎岩 / 火冠
    const n = ch.orbitN || 3, R = ch.orbitR || 22, kind = ch.orbitC || 'rune';
    for (let i = 0; i < n; i++) {
      const a = t * .05 + i * TAU / n, x = Math.cos(a) * R, y = g.hy - g.hr * .2 + Math.sin(a) * R * .42;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a * 1.6);
      if (kind === 'rock') {
        ctx.beginPath();
        for (let k = 0; k < 5; k++) { const b = k / 5 * TAU, rr = 3 + (k % 2) * 1.6; ctx.lineTo(Math.cos(b) * rr, Math.sin(b) * rr); }
        ctx.closePath(); ctx.fillStyle = '#7a6a52'; ctx.fill(); out(ctx, 1.4);
      } else if (kind === 'flame') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,170,60,.85)'; ctx.beginPath(); ctx.ellipse(0, 0, 3, 4.6, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,240,190,.9)'; ctx.beginPath(); ctx.ellipse(0, 1, 1.3, 2, 0, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.fillStyle = '#f0e2b8'; ctx.beginPath(); ctx.roundRect(-3.4, -6, 6.8, 12, 1.4); ctx.fill(); out(ctx, 1.3);
        ctx.strokeStyle = '#c0404a'; ctx.lineWidth = 1.2;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-2, -3 + k * 3); ctx.lineTo(2, -3 + k * 3); ctx.stroke(); }
      }
      ctx.restore();
    }
  },
  screen(ctx, ch, g, t) {                                    // 胸口点阵表情屏
    const x = 0, y = 4.5 + (g.bob || 0) * .2, w = g.bw * 1.25, h = 7.4;
    ctx.fillStyle = '#101418'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(150,200,220,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(x - w / 2, y - h / 2, w, h); ctx.clip();
    ctx.strokeStyle = ch.face === 'angry' ? '#ff7a6a' : '#7fe0d8'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const ex = x - 3.4;
    ctx.beginPath(); ctx.moveTo(ex - 1.4, y - 1.6); ctx.lineTo(ex + .2, y - .4); ctx.moveTo(ex + 3.2, y - .4); ctx.lineTo(ex + 4.8, y - 1.6); ctx.stroke();
    ctx.beginPath();
    if (ch.face === 'angry') { ctx.moveTo(x + 1.6, y + 2.2); ctx.lineTo(x + 5.4, y + 1); }
    else { ctx.moveTo(x + 1.4, y + 1.2); ctx.quadraticCurveTo(x + 3.4, y + 2.8, x + 5.4, y + 1.2); }
    ctx.stroke();
    ctx.restore();
  },
  pauldron(ctx, ch, g, t) {                                  // 不对称肩甲
    ctx.save(); ctx.translate(-g.bw * .95, -1.5);
    ctx.beginPath(); ctx.roundRect(-5, -5, 11, 10, 4); ctx.fillStyle = ch.armorC || '#8a8f9a'; ctx.fill(); out(ctx, 2.2);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.roundRect(-3.6, -3.8, 8, 2.4, 1.2); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.translate(g.bw * .95, -1.5); ctx.scale(.72, .72);
    ctx.beginPath(); ctx.roundRect(-5, -5, 11, 10, 4); ctx.fillStyle = ch.armorC || '#8a8f9a'; ctx.fill(); out(ctx, 2.6);
    ctx.restore();
  },
  jetpack(ctx, ch, g, t) {
    ctx.fillStyle = ch.armorC || '#6a6f7a';
    ctx.beginPath(); ctx.roundRect(-g.bw * .8, -2, g.bw * 1.6, 11, 3); ctx.fill(); out(ctx, 2.2);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.roundRect(-g.bw * .6, -.6, g.bw * 1.2, 2.4, 1.2); ctx.fill();
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = '#3a3f48'; ctx.beginPath(); ctx.roundRect(sgn * 3 - 2, 8.4, 4, 4, 1.4); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,180,90,${.5 + .3 * Math.sin(t * .5 + sgn)})`;
      ctx.beginPath(); ctx.ellipse(sgn * 3, 14.6, 2.2, 3.6 + Math.sin(t * .4) * 1.2, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  },
  pet(ctx, ch, g, t) {                                       // 肩宠：会眨眼的小外星生物
    const px = g.bw * 1.15, py = -4 + Math.sin(t * .12) * 1.2;
    ctx.save(); ctx.translate(px, py);
    ctx.fillStyle = ch.petC || '#7fd88a'; ctx.beginPath(); ctx.ellipse(0, 0, 5.4, 4.8, 0, 0, TAU); ctx.fill(); out(ctx, 1.8);
    ctx.strokeStyle = ch.petC || '#7fd88a'; ctx.lineWidth = 1.6;
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sgn * 2, -4); ctx.lineTo(sgn * 3.2, -8); ctx.stroke(); }
    ctx.fillStyle = '#0a0a0a';
    const blink = Math.sin(t * .06) > .96 ? .3 : 1;
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sgn * 1.9, -.6, 1.1, 1.3 * blink, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(sgn0(-1) * 2.3, -1.2, .4, 0, TAU); ctx.fill();
    ctx.restore();
  },
  scarf(ctx, ch, g, t) {
    const sw = Math.sin(t * .09) * 4;
    const dir = (g.aim && g.aim.x < 0) ? 1 : -1;               // 逆着瞄准方向甩，否则朝左时飘带挡脸
    ctx.strokeStyle = ch.scarfC || ch.accent; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(dir * g.bw * .5, g.hy + g.hr * .9);
    ctx.bezierCurveTo(dir * g.bw * 2.2, g.hy + 6 + sw, dir * g.bw * 3.4, 8 - sw, dir * g.bw * 4.2, 18 + sw * .6); ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(dir * g.bw * .5, g.hy + g.hr * 1.1);
    ctx.bezierCurveTo(dir * g.bw * 2, g.hy + 12 + sw * .7, dir * g.bw * 3, 14 - sw, dir * g.bw * 3.6, 24 + sw * .4); ctx.stroke();
  },
  aura(ctx, ch, g, t) {                                      // 自带粒子层：光羽 / 电弧 / 火星
    const kind = ch.aura, n = kind === 'feather' ? 4 : kind === 'spark' ? 5 : 6;
    for (let i = 0; i < n; i++) {
      const ph = ((t * .012 + i / n) % 1);
      const x = Math.sin(i * 2.3 + t * .03) * g.bw * 2.1, y = 22 - ph * 46;
      ctx.globalAlpha = (1 - ph) * .85;
      if (kind === 'feather') {
        ctx.save(); ctx.translate(x, y); ctx.rotate(ph * 3 + i);
        ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.ellipse(0, 0, 2.6, .9, 0, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (kind === 'spark') {
        ctx.strokeStyle = '#ffe98a'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(x - 2, y); ctx.lineTo(x + 1, y - 2); ctx.lineTo(x + 2, y + 1); ctx.stroke();
      } else {
        ctx.fillStyle = kind === 'ember' ? '#ff9a3c' : ch.accent;
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  },
  weaponBack(ctx, ch, g, t) {                                // 背挂长兵：按 ch.back 分型
    const ang = ch.backAng === undefined ? -.62 : ch.backAng;
    ctx.save(); ctx.translate(-g.bw * .3, g.hy + g.hr * 1.2); ctx.rotate(ang);
    const shaft = (x0, x1, col, w) => {
      ctx.strokeStyle = col; ctx.lineWidth = w || 2.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x1, 0); ctx.stroke();
    };
    const blade = (pts, fill) => {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fillStyle = fill || '#dfe4ea'; ctx.fill(); out(ctx, 1.7);
    };
    const kind = ch.back || 'hammer';
    if (kind === 'spear') {
      shaft(-14, 22, '#8a7f6a', 2.6);
      blade([[22, -3.4], [31, 0], [22, 3.4]]);
      ctx.fillStyle = ch.accent; ctx.beginPath(); ctx.roundRect(-2, -2.2, 3.4, 4.4, 1); ctx.fill();
    } else if (kind === 'spearfire') {                         // 火尖枪
      shaft(-12, 16, '#8a2f2a');
      blade([[16, -3.4], [27, 0], [16, 3.4]]);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,150,60,${.4 + .2 * Math.sin(t * .3)})`;
      ctx.beginPath(); ctx.arc(24, 0, 5.4, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else if (kind === 'staff') {                             // 如意金箍棒
      shaft(-16, 28, '#8a2f2a', 4);
      for (const gx of [-16, 24]) {
        ctx.fillStyle = '#e8c85e'; ctx.beginPath(); ctx.roundRect(gx, -3.2, 5, 6.4, 1.6); ctx.fill(); out(ctx, 1.6);
      }
    } else if (kind === 'glaive') {                            // 青龙偃月刀
      shaft(-14, 12, '#6a4a2a', 3.2);
      ctx.beginPath(); ctx.moveTo(12, -3);
      ctx.quadraticCurveTo(26, -8.5, 30, 4); ctx.quadraticCurveTo(20, 3, 12, 3.4); ctx.closePath();
      const gg = ctx.createLinearGradient(12, -6, 30, 4);
      gg.addColorStop(0, '#eef4f8'); gg.addColorStop(1, '#8f9aa6');
      ctx.fillStyle = gg; ctx.fill(); out(ctx, 2);
      ctx.fillStyle = '#c9405e'; ctx.beginPath(); ctx.arc(11, 0, 2.2, 0, TAU); ctx.fill();
    } else if (kind === 'trident') {                           // 三尖两刃刀
      shaft(-12, 14, '#8a8f9a', 3);
      blade([[14, -1.6], [26, 0], [14, 1.6]]);
      for (const sgn of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(14, sgn * 1.4); ctx.quadraticCurveTo(22, sgn * 7.4, 25, sgn * 5.4);
        ctx.lineTo(16, sgn * 2.6); ctx.closePath(); ctx.fillStyle = '#dfe4ea'; ctx.fill(); out(ctx, 1.4);
      }
    } else if (kind === 'bow') {                               // 长弓
      ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.arc(4, 0, 15, -1.25, 1.25); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,236,222,.9)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(4 + Math.cos(-1.25) * 15, Math.sin(-1.25) * 15);
      ctx.lineTo(4 + Math.cos(1.25) * 15, Math.sin(1.25) * 15); ctx.stroke();
    } else if (kind === 'fan') {                               // 羽扇
      shaft(2, 10, '#6a4a2a', 2.4);
      for (let i = -2; i <= 2; i++) {
        ctx.lineWidth = 3.6; ctx.strokeStyle = i % 2 ? '#eee8d6' : '#c9c2ae';
        ctx.beginPath(); ctx.moveTo(10, 0);
        ctx.quadraticCurveTo(17, Math.sin(i * .34) * 9, 10 + Math.cos(i * .34) * 16, Math.sin(i * .34) * 16); ctx.stroke();
      }
    } else {                                                   // 雷公锤凿
      shaft(-10, 14, '#6a5a44', 3);
      ctx.fillStyle = '#9aa0ac'; ctx.beginPath(); ctx.roundRect(13, -7.4, 12, 14.8, 2.4); ctx.fill(); out(ctx, 2.2);
      ctx.strokeStyle = 'rgba(40,34,24,.55)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(15.4 + i * 3.4, -5); ctx.lineTo(15.4 + i * 3.4, 5); ctx.stroke(); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(180,230,255,${.4 + .3 * Math.sin(t * .3)})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(14, -8); ctx.lineTo(20, -12); ctx.lineTo(24, -7); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  },
};
// 第二轮新增：装甲 / 极速 / 雷锤 / 星盗 / 女武神 专用配件
ACC.chestplate = function (ctx, ch, g, t) {
  ctx.beginPath(); ctx.roundRect(-g.bw * .92, -3.4, g.bw * 1.84, 12.5, 4);
  const ag = ctx.createLinearGradient(0, -3, 0, 9);
  ag.addColorStop(0, ch.armorC || '#8a8f9a'); ag.addColorStop(1, shade(ch.armorC || '#8a8f9a', -40));
  ctx.fillStyle = ag; ctx.fill(); out(ctx, 2.4);
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(-g.bw * .7, 1.6); ctx.lineTo(g.bw * .7, 1.6); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.roundRect(-g.bw * .74, -2.6, g.bw * 1.48, 2.2, 1.2); ctx.fill();
};
ACC.reactor = function (ctx, ch, g, t) {
  const r = 4.2 + Math.sin(t * .12) * .35;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; ctx.lineTo(Math.cos(a) * r, 3.2 + Math.sin(a) * r); }
  ctx.closePath();
  ctx.fillStyle = ch.reactorC || '#7fe0d8'; ctx.fill();
  ctx.strokeStyle = 'rgba(20,16,24,.85)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  const rg = ctx.createRadialGradient(0, 3.2, 0, 0, 3.2, r * 3.2);
  rg.addColorStop(0, withAlpha(ch.reactorC || '#7fe0d8', .55)); rg.addColorStop(1, withAlpha(ch.reactorC || '#7fe0d8', 0));
  ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(0, 3.2, r * 3.2, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
};
ACC.bolt = function (ctx, ch, g, t) {                        // 胸前向后拖的闪电折线（不做圆形徽记）
  ctx.strokeStyle = ch.accent; ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-g.bw * .8, 1.2); ctx.lineTo(-g.bw * .18, 3.4); ctx.lineTo(-g.bw * .34, 5.2); ctx.lineTo(g.bw * .78, 7.4);
  ctx.stroke();
  ctx.globalAlpha = .45; ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-g.bw * .7, -1.4); ctx.lineTo(-g.bw * .1, .6); ctx.lineTo(-g.bw * .26, 2.2); ctx.lineTo(g.bw * .7, 4.2);
  ctx.stroke(); ctx.globalAlpha = 1;
};
ACC.fins = function (ctx, ch, g, t) {
  for (const sgn of [-1, 1]) {
    ctx.save(); ctx.translate(sgn * g.hr * .96, g.hy + g.hr * .04); ctx.rotate(sgn * .5);
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.quadraticCurveTo(sgn * 9, 1, sgn * 11, -7); ctx.quadraticCurveTo(sgn * 3, -2, 0, -4); ctx.closePath();
    ctx.fillStyle = ch.accent; ctx.fill(); out(ctx, 1.7);
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sgn * 1.5, 0); ctx.lineTo(sgn * 8, -4); ctx.stroke();
    ctx.restore();
  }
};
ACC.speedline = function (ctx, ch, g, t) {                   // 身后残影：逆着瞄准方向拖三格
  const a = Math.atan2(g.aim.y, g.aim.x) + Math.PI;
  for (let i = 1; i <= 3; i++) {
    ctx.save(); ctx.translate(Math.cos(a) * i * 9, Math.sin(a) * i * 6 + 2);
    ctx.globalAlpha = .3 - i * .075;
    ctx.fillStyle = ch.suit;
    ctx.beginPath(); ctx.ellipse(0, -6, g.bw * .95, 13, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -20, g.hr * .96, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
};
ACC.eyepatch = function (ctx, ch, g, t) {
  ctx.strokeStyle = '#2a2430'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-g.hr * .98, g.hy - g.hr * .5); ctx.lineTo(g.hr * .92, g.hy + g.hr * .16); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(g.hr * .34, g.hy + g.hr * .18, g.hr * .3, g.hr * .26, .18, 0, TAU);
  ctx.fillStyle = '#2a2430'; ctx.fill(); out(ctx, 1.4);
};
ACC.headphones = function (ctx, ch, g, t) {
  ctx.strokeStyle = '#33303a'; ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.arc(0, g.hy - g.hr * .12, g.hr * 1.06, Math.PI * .12, Math.PI * .88, true); ctx.stroke();
  for (const sgn of [-1, 1]) {
    ctx.beginPath(); ctx.roundRect(sgn * g.hr * .98 - 3.2, g.hy - 4.4, 6.4, 9.6, 3);
    ctx.fillStyle = '#33303a'; ctx.fill(); out(ctx, 1.5);
    ctx.fillStyle = ch.accent; ctx.beginPath(); ctx.arc(sgn * g.hr * .98, g.hy, 1.6, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = withAlpha(ch.accent, .4 + .2 * Math.sin(t * .2 + sgn));
    ctx.beginPath(); ctx.arc(sgn * g.hr * .98, g.hy, 3.4, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
};
ACC.winghelm = function (ctx, ch, g, t) {
  for (const sgn of [-1, 1]) {
    ctx.save(); ctx.translate(sgn * g.hr * .84, g.hy - g.hr * .5); ctx.rotate(sgn * .35);
    ctx.beginPath(); ctx.moveTo(0, 3);
    ctx.quadraticCurveTo(sgn * 8, -1, sgn * 10.5, -9);
    ctx.quadraticCurveTo(sgn * 4, -3.5, sgn * 3.2, 2.5); ctx.closePath();
    ctx.fillStyle = ch.wingC || '#eaf2ff'; ctx.fill(); out(ctx, 1.7);
    ctx.restore();
  }
};
// 电影原型签名件：只补"认得出"所必需的几笔
ACC.cowl = function (ctx, ch, g, t) {                         // 上半脸罩，露眼睛与下半脸（闪电侠/忍者系）
  ctx.beginPath(); ctx.arc(0, g.hy, g.hr * 1.03, Math.PI * 1.02, Math.PI * 1.98);
  ctx.lineTo(g.hr * .9, g.hy + g.hr * .04);
  ctx.quadraticCurveTo(0, g.hy + g.hr * .2, -g.hr * .9, g.hy + g.hr * .04);
  ctx.closePath();
  ctx.fillStyle = ch.cowlC || ch.suit; ctx.fill(); out(ctx, 2.4);
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0, g.hy - g.hr * .1, g.hr * .78, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
};
ACC.sideburns = function (ctx, ch, g, t) {                    // 络腮鬓角（奇异博士）
  for (const sgn of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sgn * g.hr * .92, g.hy - g.hr * .3);
    ctx.quadraticCurveTo(sgn * g.hr * 1.06, g.hy + g.hr * .5, sgn * g.hr * .62, g.hy + g.hr * .82);
    ctx.quadraticCurveTo(sgn * g.hr * .74, g.hy + g.hr * .18, sgn * g.hr * .66, g.hy - g.hr * .26);
    ctx.closePath();
    ctx.fillStyle = ch.sideC || '#8a8a92'; ctx.fill(); out(ctx, 1.5);
  }
};
ACC.amulet = function (ctx, ch, g, t) {                       // 胸前坠饰（阿戈摩托之眼）
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-g.bw * .5, -1.5); ctx.lineTo(0, 3); ctx.lineTo(g.bw * .5, -1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 4.6, 3.6, 0, TAU);
  ctx.fillStyle = ch.amuletC || '#e8c85e'; ctx.fill(); out(ctx, 1.8);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = withAlpha(ch.amuletC || '#e8c85e', .5 + .25 * Math.sin(t * .14));
  ctx.beginPath(); ctx.arc(0, 4.6, 6.4, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#2a1c08'; ctx.beginPath(); ctx.ellipse(0, 4.6, 1.5, 2.1, 0, 0, TAU); ctx.fill();
};
ACC.holster = function (ctx, ch, g, t) {                      // 斜挎皮带 + 腰间枪套（星爵）
  ctx.strokeStyle = '#4a3220'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-g.bw * .7, -1); ctx.lineTo(g.bw * .62, 7.5); ctx.stroke();
  ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.roundRect(-g.bw * .95, 6.5, 5.4, 6.4, 1.6); ctx.fill(); out(ctx, 1.4);
  ctx.fillStyle = '#8a8f9a'; ctx.beginPath(); ctx.roundRect(-g.bw * .85, 5.4, 3.4, 2.4, 1); ctx.fill();
};
ACC.tornshorts = function (ctx, ch, g, t) {                   // 破布短裤（巨力系）
  ctx.fillStyle = ch.shortC || '#5a4a7a';
  ctx.beginPath(); ctx.moveTo(-g.bw, 6.5); ctx.lineTo(g.bw, 6.5);
  ctx.lineTo(g.bw * .9, 13); ctx.lineTo(g.bw * .5, 11.4); ctx.lineTo(g.bw * .18, 13.6);
  ctx.lineTo(-g.bw * .2, 11.2); ctx.lineTo(-g.bw * .55, 13.8); ctx.lineTo(-g.bw * .92, 12);
  ctx.closePath(); ctx.fill(); out(ctx, 2.2);
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-g.bw * .4, 7.4); ctx.lineTo(-g.bw * .3, 11); ctx.stroke();
};
ACC.helmetdome = function (ctx, ch, g, t) {                   // 圆顶盔 + 横向面罩条（星爵）
  ctx.beginPath(); ctx.arc(0, g.hy, g.hr * 1.06, Math.PI * .96, Math.PI * 2.04); ctx.closePath();
  ctx.fillStyle = ch.helmetC || '#a8322e'; ctx.fill(); out(ctx, 2.6);
  ctx.fillStyle = 'rgba(180,220,240,.55)';                     // 透明面罩
  ctx.beginPath(); ctx.roundRect(-g.hr * .86, g.hy - g.hr * .12, g.hr * 1.72, g.hr * .5, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, g.hy - g.hr * .2, g.hr * .8, Math.PI * 1.12, Math.PI * 1.62); ctx.stroke();
};
// ── 中式神话配件套件 ──
ACC.plume = function (ctx, ch, g, t) {                        // 凤翅翎子：两根长雉尾，随动作摆
  const sw = Math.sin(t * .09) * .16;
  for (const sgn of [-1, 1]) {
    ctx.save(); ctx.translate(sgn * g.hr * .72, g.hy - g.hr * .86); ctx.rotate(sgn * (.5 + sw * sgn));
    ctx.strokeStyle = ch.plumeC || '#c9405e'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(sgn * 6, -14, sgn * 20, -18, sgn * 26, -6 + Math.sin(t * .12) * 2.5); ctx.stroke();
    ctx.strokeStyle = withAlpha(ch.plumeC || '#c9405e', .5); ctx.lineWidth = 1.1;
    for (let i = 1; i <= 6; i++) {                            // 羽枝
      const tt = i / 7, bx = sgn * (6 * tt + 20 * tt * tt * .6), by = -14 * tt - 4 * tt * tt;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + sgn * 3.2, by - 2.6); ctx.stroke();
    }
    ctx.restore();
  }
};
ACC.buns = function (ctx, ch, g, t) {                         // 双丸子头（哪吒）
  for (const sgn of [-1, 1]) {
    ctx.beginPath(); ctx.arc(sgn * g.hr * .62, g.hy - g.hr * .96, g.hr * .34, 0, TAU);
    ctx.fillStyle = ch.hair; ctx.fill(); out(ctx, 2);
    ctx.strokeStyle = ch.ribbonC || '#c9405e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sgn * g.hr * .62, g.hy - g.hr * .92, g.hr * .36, .3, 2.8); ctx.stroke();
  }
};
ACC.thirdeye = function (ctx, ch, g, t) {                     // 额上天眼（杨戬）
  const open = ch.eyeOpen === false ? .2 : 1;
  ctx.fillStyle = ch.skin; ctx.beginPath(); ctx.ellipse(0, g.hy - g.hr * .42, g.hr * .2, g.hr * .26 * open, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(40,24,14,.9)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = '#2a4a7a'; ctx.beginPath(); ctx.arc(0, g.hy - g.hr * .42, g.hr * .11 * open, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(-g.hr * .04, g.hy - g.hr * .47, g.hr * .04, 0, TAU); ctx.fill();
  ctx.strokeStyle = withAlpha('#7fe0d8', .55); ctx.lineWidth = 1.2;   // 神光
  ctx.beginPath(); ctx.arc(0, g.hy - g.hr * .42, g.hr * .34, 0, TAU); ctx.stroke();
};
ACC.simian = function (ctx, ch, g, t) {                        // 猴相：心形嘴脸 + 颈后毛领
  ctx.beginPath(); ctx.arc(0, g.hy, g.hr * 1.12, Math.PI * .28, Math.PI * .72, true); ctx.closePath();
  ctx.fillStyle = ch.furC || '#c9a26a'; ctx.fill(); out(ctx, 1.8);
  ctx.beginPath(); ctx.ellipse(0, g.hy + g.hr * .42, g.hr * .5, g.hr * .38, 0, 0, TAU);
  ctx.fillStyle = '#f0dcb8'; ctx.fill();
  ctx.strokeStyle = 'rgba(60,36,18,.8)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-g.hr * .16, g.hy + g.hr * .4); ctx.lineTo(0, g.hy + g.hr * .5); ctx.lineTo(g.hr * .16, g.hy + g.hr * .4); ctx.stroke();
  ctx.fillStyle = 'rgba(60,36,18,.55)';
  ctx.beginPath(); ctx.ellipse(-g.hr * .28, g.hy + g.hr * .16, 1.4, 1, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(g.hr * .28, g.hy + g.hr * .16, 1.4, 1, 0, 0, TAU); ctx.fill();
};
ACC.bullhorns = function (ctx, ch, g, t) {                     // 牛角（牛魔王）：粗、外翻、带节
  for (const sgn of [-1, 1]) {
    ctx.save(); ctx.translate(sgn * g.hr * .8, g.hy - g.hr * .62); ctx.rotate(sgn * .9);
    ctx.beginPath(); ctx.moveTo(-3, 3);
    ctx.quadraticCurveTo(sgn * 3, -8, sgn * 15, -12);
    ctx.quadraticCurveTo(sgn * 6, -4, 3, 3.4); ctx.closePath();
    const hg = ctx.createLinearGradient(0, 0, sgn * 15, -12);
    hg.addColorStop(0, '#6a5a44'); hg.addColorStop(1, '#e0d2b0');
    ctx.fillStyle = hg; ctx.fill(); out(ctx, 2.2);
    ctx.strokeStyle = 'rgba(60,44,24,.5)'; ctx.lineWidth = 1.2;
    for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(sgn * i * 3, -i * 2); ctx.lineTo(sgn * (i * 3 + 1.6), -i * 2 - 3); ctx.stroke(); }
    ctx.restore();
  }
};
ACC.firewheels = function (ctx, ch, g, t) {                    // 风火轮：脚下双火环
  for (const sgn of [-1, 1]) {
    const x = sgn * g.bw * .95, y = 19;
    ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(x, y, 0, x, y, 9);
    rg.addColorStop(0, 'rgba(255,238,170,.85)'); rg.addColorStop(.5, 'rgba(255,140,40,.5)'); rg.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#ffb84a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5.2, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,140,.8)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) { const a = t * .3 + i * TAU / 4; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 5.2, y + Math.sin(a) * 5.2); ctx.lineTo(x + Math.cos(a) * 8.4, y + Math.sin(a) * 8.4); ctx.stroke(); }
  }
};
ACC.tallhat = function (ctx, ch, g, t) {                       // 高帽（白无常）
  const hh = g.hr * 1.9;
  ctx.fillStyle = '#f2eee2'; ctx.beginPath(); ctx.roundRect(-g.hr * .78, g.hy - g.hr * .5 - hh, g.hr * 1.56, hh, 3); ctx.fill(); out(ctx, 2.4);
  ctx.fillStyle = '#2a2a2e'; ctx.font = 'bold 7px monospace'; ctx.textAlign = 'center';
  for (let i = 0; i < (ch.hatText || '一见生财').length; i++) ctx.fillText(ch.hatText[i], 0, g.hy - g.hr * .6 - hh + 12 + i * 9);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.roundRect(-g.hr * .78, g.hy - g.hr * .58, g.hr * 1.56, 3.4, 1.6); ctx.fill();
};
ACC.tongue = function (ctx, ch, g, t) {                        // 长舌（无常）
  const sw = Math.sin(t * .1) * 1.6;
  ctx.strokeStyle = '#c9405e'; ctx.lineWidth = 4.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, g.hy + g.hr * .62);
  ctx.quadraticCurveTo(sw, g.hy + g.hr * 1.3, sw * 1.4, g.hy + g.hr * 1.85); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,180,190,.6)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(sw * .7, g.hy + g.hr * 1.1); ctx.lineTo(sw * 1.2, g.hy + g.hr * 1.7); ctx.stroke();
};
ACC.beak = function (ctx, ch, g, t) {                          // 鸟喙（雷公）
  ctx.beginPath(); ctx.moveTo(-g.hr * .34, g.hy + g.hr * .3);
  ctx.quadraticCurveTo(0, g.hy + g.hr * .42, g.hr * .34, g.hy + g.hr * .3);
  ctx.quadraticCurveTo(g.hr * .18, g.hy + g.hr * .92, 0, g.hy + g.hr * .98);
  ctx.quadraticCurveTo(-g.hr * .18, g.hy + g.hr * .92, -g.hr * .34, g.hy + g.hr * .3); ctx.closePath();
  const bg = ctx.createLinearGradient(0, g.hy + g.hr * .3, 0, g.hy + g.hr);
  bg.addColorStop(0, '#ffd86a'); bg.addColorStop(1, '#c9862a');
  ctx.fillStyle = bg; ctx.fill(); out(ctx, 1.8);
};
ACC.sidelock = function (ctx, ch, g, t) {                      // 纶巾/长髯：书生与武将通用垂件
  if (ch.beard) {
    ctx.fillStyle = ch.beardC || '#2a2420';
    ctx.beginPath(); ctx.moveTo(-g.hr * .5, g.hy + g.hr * .5);
    ctx.quadraticCurveTo(-g.hr * .3, g.hy + g.hr * 2.1, 0, g.hy + g.hr * 2.4);
    ctx.quadraticCurveTo(g.hr * .3, g.hy + g.hr * 2.1, g.hr * .5, g.hy + g.hr * .5);
    ctx.closePath(); ctx.fill(); out(ctx, 1.8);
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * g.hr * .2, g.hy + g.hr * .7); ctx.lineTo(i * g.hr * .16, g.hy + g.hr * 2.1); ctx.stroke(); }
  }
  if (ch.wrap) {                                              // 纶巾：额带 + 后垂布
    ctx.fillStyle = ch.wrapC || '#3a4a6a';
    ctx.beginPath(); ctx.arc(0, g.hy - g.hr * .12, g.hr * 1.04, Math.PI * .98, Math.PI * 2.02); ctx.closePath(); ctx.fill(); out(ctx, 2);
    ctx.beginPath(); ctx.roundRect(-g.hr * .3, g.hy - g.hr * 1.5, g.hr * .6, g.hr * .5, 2); ctx.fill();
    ctx.strokeStyle = ch.wrapC || '#3a4a6a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-g.hr * .9, g.hy + g.hr * .1); ctx.quadraticCurveTo(-g.hr * 1.5, g.hy + g.hr * 1.2, -g.hr * 1.2, g.hy + g.hr * 2); ctx.stroke();
  }
};
ACC.quiver = function (ctx, ch, g, t) {                        // 箭壶
  ctx.save(); ctx.translate(-g.bw * 1.05, 1); ctx.rotate(-.24);
  ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.roundRect(-4, -6, 8, 16, 3); ctx.fill(); out(ctx, 2);
  ctx.strokeStyle = '#c9c2ae'; ctx.lineWidth = 1.6;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 2.2, -6); ctx.lineTo(i * 2.6, -13); ctx.stroke(); }
  ctx.fillStyle = '#c9405e';
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.ellipse(i * 2.6, -14.4, 1.5, 2.4, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
};
function sgn0(v) { return v; }
function accList(ch) { return ch.acc || []; }
function drawAccLayer(ctx, ch, g, t, layer) {
  const set = { back: ['speedline', 'cape', 'wings', 'scroll', 'weaponBack', 'jetpack', 'tail', 'collar', 'scarf'],
                torso: ['chestplate', 'pauldron', 'reactor', 'bolt', 'screen', 'strip', 'amulet', 'holster', 'tornshorts'],
                head: ['hood', 'cowl', 'helmetdome', 'tallhat', 'ears', 'horns', 'bullhorns', 'buns', 'halo', 'plume', 'goggles', 'headphones', 'headlamp', 'antenna', 'winghelm', 'sideburns', 'sidelock', 'thirdeye', 'simian', 'beak', 'masklower', 'eyepatch', 'visor', 'fins', 'tongue'],
                front: ['lantern', 'orbit', 'pet', 'quiver', 'firewheels', 'aura'] }[layer] || [];
  const list = accList(ch);
  for (const name of set) if (list.indexOf(name) >= 0 && ACC[name]) { ctx.save(); ACC[name](ctx, ch, g, t); ctx.restore(); }
}


const PALETTES = [
  { id: 'veteran',  name: '老兵',   rar: 'R', hair: '#5a4634', style: 'short', headband: true, suit: '#4a5a3e', skin: '#d9b08c', gun: '#3a3d42', accent: '#c9a24a' },
  { id: 'agent',    name: '女探员', rar: 'R', hair: '#8a4a2e', style: 'ponytail', suit: '#3e4658', skin: '#e6c0a0', gun: '#2e3238', accent: '#c94a6a' },
  { id: 'girl',     name: '少女',   rar: 'R', hair: '#c98a3a', style: 'twintail', suit: '#7a3e58', skin: '#ecc9ae', gun: '#4a4048', accent: '#e86aa0' },
  { id: 'operator', name: '特工',   rar: 'R', hair: '#2a2a2e', style: 'cap',      suit: '#2e2e34', skin: '#c9a07e', gun: '#1e2024', accent: '#7fb2e8' },
  // ── 卡池锚点三人（最难形态：整脸面罩 / 大披风+头罩 / 极端比例）──
  // ── 卡池：中国神话与公版文学原型（公有领域，回源头设计，不取任何作品的二创形象）──
  { id: 'wukong', name: '齐天大圣', rar: 'SSR', title: '如意金箍棒 · 七十二变',
    hair: '#8a5a2a', style: 'none', suit: '#c9862a', suitAlt: '#8a2f3a', skin: '#c9a26a', headC: '#c9a26a',
    gun: '#8a5a2a', accent: '#e8c85e', bulk: .98, eyes: 'normal',
    acc: ['plume', 'simian', 'weaponBack'], back: 'staff', plumeC: '#c9405e', furC: '#d8b078',
    headband: true },
  { id: 'yangjian', name: '二郎真君', rar: 'SSR', title: '三尖两刃刀 · 哮天',
    hair: '#2a2a34', style: 'none', suit: '#8a94a0', suitAlt: '#3a4a6a', skin: '#e6c0a0',
    gun: '#6a6f7a', accent: '#7fe0d8', bulk: 1.04, eyes: 'normal',
    acc: ['helmetdome', 'thirdeye', 'pet', 'weaponBack', 'chestplate'], back: 'trident',
    helmetC: '#8a94a0', armorC: '#b8bec8', petC: '#e8e2d0' },
  { id: 'nezha', name: '三太子', rar: 'SSR', title: '火尖枪 · 风火轮',
    hair: '#2a2028', style: 'none', suit: '#b0323a', suitAlt: '#e8a83a', skin: '#f0d0b4',
    gun: '#8a2f2a', accent: '#ffb84a', bulk: .9, eyes: 'normal',
    acc: ['buns', 'scarf', 'firewheels', 'weaponBack'], back: 'spearfire',
    scarfC: '#e04a4a', ribbonC: '#e8c85e' },
  { id: 'niuma', name: '平天大圣', rar: 'SR', title: '混铁棍 · 大力牛魔',
    hair: '#2a2018', style: 'short', suit: '#6a4a3a', suitAlt: '#c9862a', skin: '#8a6a4a', headC: '#8a6a4a',
    gun: '#4a3a2a', accent: '#e8c85e', bulk: 1.5, eyes: 'normal', browHeavy: true,
    acc: ['bullhorns', 'chestplate', 'weaponBack'], back: 'staff', armorC: '#5a4a3a' },
  { id: 'leigong', name: '雷公', rar: 'SR', title: '连天锤凿 · 八鼓相应',
    hair: '#3a3448', style: 'none', suit: '#4a5a7a', suitAlt: '#8a2f3a', skin: '#b8c8d8', headC: '#b8c8d8',
    gun: '#4a4a52', accent: '#8fd8ff', bulk: .96, eyes: 'glow',
    acc: ['beak', 'wings', 'weaponBack'], wingC: 'rgba(180,200,230,.75)' },
  { id: 'wolong', name: '卧龙先生', rar: 'SR', title: '羽扇纶巾 · 借东风',
    hair: '#3a3a44', style: 'none', suit: '#e8e2d0', suitAlt: '#3a4a6a', skin: '#e6c0a0',
    gun: '#4a3a2a', accent: '#c9a24a', bulk: .98, eyes: 'normal',
    acc: ['sidelock', 'collar', 'weaponBack'], back: 'fan', wrap: true, wrapC: '#3a4a6a',
    beard: true, beardC: '#c9c2ae', collarC: '#d8d2c0' },
  { id: 'guanyu', name: '武圣', rar: 'SR', title: '青龙偃月 · 千里独行',
    hair: '#2a2018', style: 'none', suit: '#2f5a3a', suitAlt: '#c9862a', skin: '#b04a3a',
    gun: '#3a4a3a', accent: '#e8c85e', bulk: 1.14, eyes: 'normal',
    acc: ['helmetdome', 'sidelock', 'weaponBack'], back: 'glaive', helmetC: '#2f5a3a',
    beard: true, beardC: '#2a2420' },
  { id: 'wuchang', name: '白无常', rar: 'R', title: '一见生财 · 夜行索命',
    hair: '#2a2a30', style: 'none', suit: '#eae6dc', suitAlt: '#8a2f3a', skin: '#eae6dc', headC: '#eae6dc',
    gun: '#3a3a42', accent: '#c9405e', bulk: .94, eyes: 'normal', lowerGhost: true,
    acc: ['tallhat', 'tongue', 'scarf'], scarfC: '#8a2f3a', hatText: '一见生财' },
  { id: 'muguiping', name: '穆帅', rar: 'R', title: '凤凰翎 · 破阵枪',
    hair: '#3a2a24', style: 'ponytail', suit: '#8a2f3a', suitAlt: '#c9862a', skin: '#ecc9ae',
    gun: '#6a6f7a', accent: '#e8c85e', bulk: .98, eyes: 'normal',
    acc: ['helmetdome', 'plume', 'weaponBack', 'chestplate'], back: 'spear',
    helmetC: '#c9405e', plumeC: '#e8c85e', armorC: '#b8a04a' },
  { id: 'huarong', name: '神箭', rar: 'R', title: '小李广 · 百步穿杨',
    hair: '#3a3028', style: 'short', suit: '#5a4a6a', suitAlt: '#c9862a', skin: '#e0b894', headband: true,
    gun: '#4a3a2a', accent: '#e8c85e', bulk: 1, eyes: 'normal',
    acc: ['weaponBack', 'quiver'], back: 'bow' },
  { id: 'mujia', name: '木甲傀儡', rar: 'R', title: '木牛流马 · 甲字壹',
    hair: '#8a6a3a', style: 'none', suit: '#a8813e', suitAlt: '#5a4a2a', skin: '#c9a86a', headC: '#c9a86a',
    gun: '#6a5a3a', accent: '#7fe0d8', bulk: 1.04, eyes: 'dot', headShape: 'square', headRivet: true,
    acc: ['chestplate', 'screen', 'orbit'], orbitC: 'rock', orbitN: 2, orbitR: 20,
    armorC: '#a8813e', face: 'happy' },
  { id: 'hedeng', name: '荷灯小幽', rar: 'R', title: '中元夜行 · 引魂灯',
    hair: '#2a2440', style: 'none', suit: '#3a4a6a', suitAlt: '#8a6ad0', skin: '#dfe4ea', headC: '#dfe4ea',
    gun: '#3a3d42', accent: '#ffb84a', bulk: .94, eyes: 'glow', lowerGhost: true,
    acc: ['hood', 'lantern', 'orbit'], orbitC: 'flame', orbitN: 1, orbitR: 15, hoodC: '#3a4a6a' },
];
// 胸前反光横条（夜巡者用）：不做蝙蝠标，避免撞设计
ACC.strip = function (ctx, ch, g, t) {
  ctx.fillStyle = ch.accent; ctx.beginPath(); ctx.roundRect(-g.bw * .62, 2.2, g.bw * 1.24, 2.6, 1.3); ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = withAlpha(ch.accent, .35); ctx.beginPath(); ctx.roundRect(-g.bw * .62, 2.2, g.bw * 1.24, 2.6, 1.3); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
};

// 抽卡卡面：胸像特写 + 稀有度框 + 星标 + 名字条。与局内精灵共用同一份角色数据
function drawCard(ctx, o) {
  const ch = paletteOf(o.char), R = RARITY[o.rar || ch.rar] || RARITY.R;
  const w = o.w || 150, h = o.h || 210, t = o.t || 0;
  ctx.save(); ctx.translate(o.x || 0, o.y || 0);
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, 10);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#241d16'); bg.addColorStop(.55, '#171310'); bg.addColorStop(1, '#0f0c0a');
  ctx.fillStyle = bg; ctx.fill();
  ctx.save(); ctx.clip();
  // 背景放射光：SSR 满光芒，SR 半强度，R 只留底色
  const strength = R.stars === 3 ? 1 : R.stars === 2 ? .55 : .3;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12 + t * .004;
    ctx.fillStyle = R.dim + (.06 * strength) + ')';
    ctx.beginPath(); ctx.moveTo(w / 2, h * .42);
    ctx.lineTo(w / 2 + Math.cos(a) * w * 1.6, h * .42 + Math.sin(a) * w * 1.6);
    ctx.lineTo(w / 2 + Math.cos(a + .16) * w * 1.6, h * .42 + Math.sin(a + .16) * w * 1.6);
    ctx.closePath(); ctx.fill();
  }
  const halo = ctx.createRadialGradient(w / 2, h * .46, 4, w / 2, h * .46, w * .72);
  halo.addColorStop(0, R.dim + (.34 * strength) + ')'); halo.addColorStop(1, R.dim + '0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 12) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(w / 2, h * .78, w * .42, 12, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(w / 2, h * .78);
  const sc = h / 84;
  ctx.scale(sc, sc);
  drawCharacter(ctx, {
    char: ch, aim: o.aim || { x: .28, y: -.16 }, gun: o.gun || 'tear', lvl: o.lvl === undefined ? 3 : o.lvl,
    t, moving: false, shotsPerDir: o.shotsPerDir,
  });
  ctx.restore();
  ctx.restore();
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, 10);
  ctx.strokeStyle = R.c; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.fillStyle = R.c;
  for (const [cx, cy, sx, sy] of [[6, 6, 1, 1], [w - 6, 6, -1, 1], [6, h - 6, 1, -1], [w - 6, h - 6, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + sx * 13, cy); ctx.lineTo(cx, cy + sy * 13); ctx.closePath(); ctx.fill();
  }
  for (let i = 0; i < R.stars; i++) {
    ctx.fillStyle = R.c;
    star(ctx, 16 + i * 15, h - 15, 5.4, 5, .45); ctx.fill();
    ctx.strokeStyle = 'rgba(40,24,8,.7)'; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.fillStyle = 'rgba(12,9,7,.82)'; ctx.beginPath(); ctx.roundRect(8, 8, w - 16, 26, 6); ctx.fill();
  ctx.strokeStyle = withAlpha(R.c, .55); ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#f3e8d2'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'left';
  ctx.fillText(ch.name || ch.id || '?', 16, 26);
  ctx.fillStyle = R.c; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right';
  ctx.fillText(R.stars === 3 ? 'SSR' : R.stars === 2 ? 'SR' : 'R', w - 14, 25);
  if (ch.title) {
    ctx.fillStyle = 'rgba(12,9,7,.72)'; ctx.beginPath(); ctx.roundRect(14, h - 44, w - 28, 17, 5); ctx.fill();
    ctx.fillStyle = 'rgba(232,220,196,.82)'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText(ch.title, w / 2, h - 32);
  }
  ctx.textAlign = 'left';
  ctx.restore();
}
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
  const geom = { hr, hy, bw, bob, aim };
  drawAccLayer(ctx, ch, geom, t, 'back');

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

  if (ch.lowerGhost) {                                       // 半透雾尾：无足鬼类角色
    const sw = Math.sin(t * .12) * 2.4;
    ctx.globalAlpha = .78;
    ctx.beginPath(); ctx.moveTo(-bw * .95, 4);
    ctx.quadraticCurveTo(-bw * 1.1, 16, -bw * .3 + sw, 21);
    ctx.quadraticCurveTo(0, 17, bw * .3 - sw, 21.5);
    ctx.quadraticCurveTo(bw * 1.1, 15, bw * .95, 4);
    ctx.closePath();
    const gg = ctx.createLinearGradient(0, 2, 0, 22);
    gg.addColorStop(0, ch.suit); gg.addColorStop(1, withAlpha(ch.suit, .12));
    ctx.fillStyle = gg; ctx.fill(); out(ctx, 2.2);
    ctx.globalAlpha = 1;
  } else
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
  drawAccLayer(ctx, ch, geom, t, 'torso');

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
  ctx.beginPath();
  if (ch.headShape === 'square') ctx.roundRect(-hr * 1.02, hy - hr, hr * 2.04, hr * 2, hr * .42);
  else ctx.arc(0, hy, hr, 0, TAU);
  ctx.fillStyle = ch.headC || hg; ctx.fill(); out(ctx, 2.6);
  if (ch.headRivet) {                                        // 机甲面甲铆钉
    ctx.fillStyle = 'rgba(30,26,34,.55)';
    for (const [rx, ry] of [[-.78, -.62], [.78, -.62], [-.78, .62], [.78, .62]]) {
      ctx.beginPath(); ctx.arc(rx * hr, hy + ry * hr, 1.2, 0, TAU); ctx.fill();
    }
  }
  if (ch.headSeam) { // 面罩分缝：让整块面罩不显得是一个纯色球
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, hy, hr * .72, -.5, 1.2); ctx.stroke();
  }

  // 发型 / 头饰：四人剪影必须一眼分开
  ctx.fillStyle = ch.hair;
  if (ch.style === 'short') {
    // 老兵：寸头 + 头带（额前一条 accent，远距离也能认出）
    ctx.beginPath(); ctx.arc(0, hy + .8, hr * 1.02, Math.PI * .98, Math.PI * 2.02); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-hr * .95, hy - hr * .28); ctx.quadraticCurveTo(-hr * .1, hy - hr * 1.05, hr * .92, hy - hr * .42);
    ctx.quadraticCurveTo(hr * .2, hy - hr * .8, -hr * .95, hy - hr * .28); ctx.fill();
    out(ctx, 1.6);
    if (ch.headband) {                                       // 头带是老兵的签名，不能跟着发型传染
      ctx.fillStyle = ch.accent;
      ctx.beginPath(); ctx.roundRect(-hr * .98, hy - hr * .52, hr * 1.96, 3.4, 1.7); ctx.fill(); out(ctx, 1.3);
    }
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
  } else if (ch.style === 'cap') {
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

  // 五官按 eyes 分派：normal 大眼 / glow 亮点 / dot 机械眼 / none 交给配件目镜
  const ex = clamp(aim.x, -1, 1), ey = clamp(aim.y, -1, 1);
  if (ch.eyes === 'glow') {
    ctx.globalCompositeOperation = 'lighter';
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = withAlpha(ch.accent, .9);
      ctx.beginPath(); ctx.ellipse(sgn * hr * .34, hy + hr * .16, hr * .17, hr * .12, 0, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  } else if (ch.eyes === 'dot') {
    ctx.fillStyle = '#1a1a20';
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.arc(sgn * hr * .34, hy + hr * .18, hr * .1, 0, TAU); ctx.fill(); }
  } else if (ch.eyes !== 'none') {
    const iris = ch.style === 'cap' ? ['#2a3a4a', '#4a6a8a'] : ch.style === 'twintail' ? ['#3a2418', '#7a5a3a'] : ['#2a1c14', '#4a6a8a'];
    eye(ctx, -hr * .33, hy + hr * .2, hr * .29, ex, ey, { iris });
    eye(ctx, hr * .33, hy + hr * .2, hr * .29, ex, ey, { iris });
    if (ch.browHeavy) {                                      // 压眉：巨力系的凶相，Q 版靠这一步就够
      ctx.strokeStyle = shade(ch.hair, -10); ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-hr * .58, hy - hr * .12); ctx.lineTo(-hr * .1, hy + hr * .04);
      ctx.moveTo(hr * .58, hy - hr * .12); ctx.lineTo(hr * .1, hy + hr * .04); ctx.stroke();
    }
    blush(ctx, -hr * .66, hy + hr * .55, hr * .19);
    blush(ctx, hr * .66, hy + hr * .55, hr * .19);
    ctx.strokeStyle = 'rgba(60,30,22,.8)'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    if (recoil > .05) { ctx.fillStyle = 'rgba(60,26,20,.9)'; ctx.beginPath(); ctx.ellipse(0, hy + hr * .64, 2.2, 2.6 * recoil + .8, 0, 0, TAU); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(-2, hy + hr * .64); ctx.quadraticCurveTo(0, hy + hr * .76, 2, hy + hr * .64); ctx.stroke(); }
  }
  drawAccLayer(ctx, ch, geom, t, 'head');

  if (!gunFront) drawArmsGun(false);

  // 多弹数：额前第三瞄具眼（道具可视化）
  if (o.shotsPerDir > 1) {
    ctx.fillStyle = '#8ecbff'; ctx.strokeStyle = OL; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, hy - hr * .58, 3, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(-.9, hy - hr * .68, 1.1, 0, TAU); ctx.fill();
  }
  drawAccLayer(ctx, ch, geom, t, 'front');
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
  sickle: { friendly: true },   // 回旋镖：spin 驱动自转
  grenade: { friendly: true },  // 罐罐雷：spin/squash/fuse 由调用方给
  chrys:  { friendly: true },   // 菊花弹体（tr.spin）
  petal:  { friendly: true },   // 剥离花瓣（tr.spin）
  pin:    { friendly: true },   // 图钉（沿速度方向）
  duck:   { friendly: true },   // 橡皮鸭（tr.spin / tr.squash）
  hive:   { friendly: true },   // 蜂巢（tr.spin 轻微摆动）
  bee:    { friendly: true },   // 工蜂（沿速度方向，翅膀按 t 抖）
  core:   { friendly: true },   // 漩涡核（tr.spin）
  shadow: { friendly: true },   // 影分身弹：暗紫带白边
  spike:  {},                   // 敌弹·骨钉（turret 高等级等）
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
    } else if (kind === 'sickle') {
      // 回旋镖弹体：三片骨刃 + 中心皮缠，整体自转由调用方给 spin
      for (let i = 0; i < 3; i++) {
        g.save(); g.translate(cx, cy); g.rotate(i * TAU / 3);
        g.beginPath();
        g.moveTo(0, -R * .3);
        g.bezierCurveTo(R * .95, -R * .98, R * 1.32, -R * .06, R * .98, R * .5);
        g.quadraticCurveTo(R * .78, R * .04, R * .32, -R * .04);
        g.quadraticCurveTo(R * .14, R * .34, 0, R * .3);
        g.closePath();
        const bg = g.createLinearGradient(0, -R, R, 0);
        bg.addColorStop(0, '#f2ead6'); bg.addColorStop(.55, '#ded3b6'); bg.addColorStop(1, '#a89878');
        g.fillStyle = bg; g.fill();
        g.strokeStyle = 'rgba(30,22,12,.9)'; g.lineWidth = OLw; g.stroke();
        g.strokeStyle = 'rgba(120,100,64,.55)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(R * .1, -R * .12); g.quadraticCurveTo(R * .6, -R * .5, R * .96, -R * .2); g.stroke();
        g.restore();
      }
      g.beginPath(); g.arc(cx, cy, R * .34, 0, TAU);
      g.fillStyle = '#6a4a30'; g.fill(); g.strokeStyle = 'rgba(30,18,8,.9)'; g.lineWidth = OLw * .8; g.stroke();
      g.strokeStyle = 'rgba(220,205,170,.7)'; g.lineWidth = 1.1;
      g.beginPath(); g.arc(cx, cy, R * .2, .4, 3.2); g.stroke();
    } else if (kind === 'chrys') {
      // 千瓣菊：三层花瓣绕黄芯，整体自转
      for (let ring = 2; ring >= 0; ring--) {
        const pr = R * (.5 + ring * .32), n = 5 + ring * 3;
        for (let i = 0; i < n; i++) {
          const a = i / n * TAU + ring * .52;
          g.beginPath(); g.ellipse(cx + Math.cos(a) * pr * .62, cy + Math.sin(a) * pr * .62, pr * .58, pr * .21, a, 0, TAU);
          g.fillStyle = ['#f9e4ec', '#f4cfdd', '#eaa9bc'][ring]; g.fill();
          g.strokeStyle = 'rgba(122,58,80,.42)'; g.lineWidth = .9; g.stroke();
        }
      }
      g.beginPath(); g.arc(cx, cy, R * .34, 0, TAU);
      g.fillStyle = '#ffd86a'; g.fill(); g.strokeStyle = 'rgba(120,80,20,.7)'; g.lineWidth = OLw * .7; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(cx - R * .1, cy - R * .12, R * .11, 0, TAU); g.fill();
    } else if (kind === 'petal') {
      // 剥离花瓣：单片半透粉 + 一条脉纹，飞行中自旋
      g.beginPath(); g.ellipse(cx, cy, R * 1.15, R * .52, 0, 0, TAU);
      const pg = g.createLinearGradient(cx - R, cy, cx + R, cy);
      pg.addColorStop(0, 'rgba(237,168,190,.75)'); pg.addColorStop(1, 'rgba(250,228,236,.95)');
      g.fillStyle = pg; g.fill();
      g.strokeStyle = 'rgba(122,58,80,.55)'; g.lineWidth = Math.max(1, OLw * .55); g.stroke();
      g.strokeStyle = 'rgba(180,110,130,.6)'; g.lineWidth = .9;
      g.beginPath(); g.moveTo(cx - R * .9, cy); g.lineTo(cx + R * .9, cy); g.stroke();
    } else if (kind === 'pin') {
      // 图钉：塑料帽（高光球）+ 钢针朝前
      g.beginPath(); g.moveTo(cx + R * .1, cy - R * .16); g.lineTo(cx + R * 1.9, cy); g.lineTo(cx + R * .1, cy + R * .16); g.closePath();
      const sg = g.createLinearGradient(cx, cy, cx + R * 1.9, cy);
      sg.addColorStop(0, '#8f96a0'); sg.addColorStop(.5, '#e2e8ee'); sg.addColorStop(1, '#6a7078');
      g.fillStyle = sg; g.fill(); g.strokeStyle = 'rgba(24,26,30,.85)'; g.lineWidth = Math.max(1, OLw * .6); g.stroke();
      g.beginPath(); g.arc(cx - R * .35, cy, R * .78, 0, TAU);
      const cg = g.createRadialGradient(cx - R * .55, cy - R * .5, R * .1, cx - R * .35, cy, R * .85);
      cg.addColorStop(0, '#ff9fb0'); cg.addColorStop(.55, '#d0405a'); cg.addColorStop(1, '#7a1a2c');
      g.fillStyle = cg; g.fill(); g.strokeStyle = 'rgba(30,8,14,.9)'; g.lineWidth = OLw; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(cx - R * .55, cy - R * .38, R * .26, R * .16, -.6, 0, TAU); g.fill();
    } else if (kind === 'duck') {
      // 橡皮鸭：身子 + 头 + 橙喙 + 翅，弹跳时由调用方给 squash
      g.beginPath(); g.ellipse(cx - R * .18, cy + R * .3, R * .95, R * .72, -.12, 0, TAU);
      g.moveTo(cx + R * .55, cy - R * .5); g.arc(cx + R * .5, cy - R * .55, R * .58, 0, TAU);
      const dg = g.createLinearGradient(cx, cy - R, cx, cy + R);
      dg.addColorStop(0, '#ffe873'); dg.addColorStop(.55, '#f7d94a'); dg.addColorStop(1, '#d8ae1f');
      g.fillStyle = dg; g.fill(); g.strokeStyle = 'rgba(70,48,6,.9)'; g.lineWidth = OLw; g.stroke();
      g.beginPath(); g.moveTo(cx + R * 1.02, cy - R * .62); g.lineTo(cx + R * 1.72, cy - R * .42); g.lineTo(cx + R * 1.02, cy - R * .18); g.closePath();
      g.fillStyle = '#f09a3a'; g.fill(); g.strokeStyle = 'rgba(90,44,8,.85)'; g.lineWidth = Math.max(1, OLw * .6); g.stroke();
      g.fillStyle = '#2a1c08'; g.beginPath(); g.arc(cx + R * .6, cy - R * .68, R * .13, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(cx + R * .57, cy - R * .72, R * .05, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(cx - R * .28, cy + R * .26, R * .42, R * .26, .3, 0, TAU);
      g.fillStyle = 'rgba(216,168,26,.85)'; g.fill(); g.strokeStyle = 'rgba(90,60,8,.6)'; g.lineWidth = 1; g.stroke();
    } else if (kind === 'hive') {
      // 蜂巢：六边形木箱 + 黑洞口 + 挂蜜丝
      g.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + .5; g.lineTo(cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.06); }
      g.closePath();
      const hg = g.createLinearGradient(cx, cy - R, cx, cy + R);
      hg.addColorStop(0, '#e8b95a'); hg.addColorStop(.5, '#c08a30'); hg.addColorStop(1, '#7a5218');
      g.fillStyle = hg; g.fill(); g.strokeStyle = 'rgba(46,28,6,.9)'; g.lineWidth = OLw; g.stroke();
      g.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + .5; g.lineTo(cx + Math.cos(a) * R * .72, cy + Math.sin(a) * R * .68); }
      g.closePath(); g.strokeStyle = 'rgba(80,48,10,.55)'; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = '#2a1806'; g.beginPath(); g.ellipse(cx + R * .18, cy + R * .18, R * .3, R * .24, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,224,130,.85)'; g.beginPath(); g.roundRect(cx + R * .06, cy + R * .34, R * .24, R * .5, R * .1); g.fill();
      g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(cx - R * .4, cy - R * .45, R * .3, R * .13, -.5, 0, TAU); g.fill();
    } else if (kind === 'bee') {
      // 工蜂：条纹小身子 + 双翅 + 尾针
      g.fillStyle = 'rgba(255,255,255,.55)';
      for (const sgn of [-1, 1]) { g.beginPath(); g.ellipse(cx - R * .1, cy + sgn * R * .5, R * .62, R * .26, sgn * .5, 0, TAU); g.fill(); }
      g.beginPath(); g.ellipse(cx, cy, R * .92, R * .62, 0, 0, TAU);
      g.fillStyle = '#e8c243'; g.fill(); g.strokeStyle = 'rgba(40,28,6,.9)'; g.lineWidth = Math.max(1.2, OLw * .7); g.stroke();
      g.save();
      g.beginPath(); g.ellipse(cx, cy, R * .92, R * .62, 0, 0, TAU); g.clip();
      g.fillStyle = '#3a2a10';
      for (let i = 0; i < 3; i++) g.fillRect(cx - R * .2 + i * R * .42, cy - R, R * .18, R * 2);
      g.restore();
      g.fillStyle = '#2a1c08'; g.beginPath(); g.arc(cx + R * .82, cy - R * .1, R * .16, 0, TAU); g.fill();
      g.strokeStyle = '#5a4a20'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(cx - R * .9, cy); g.lineTo(cx - R * 1.35, cy); g.stroke();
    } else if (kind === 'core') {
      // 漩涡核：多面黑核 + 亮紫边缘 + 内里空腔高光
      const halo = g.createRadialGradient(cx, cy, R * .3, cx, cy, R * 1.8);
      halo.addColorStop(0, 'rgba(150,120,240,.45)'); halo.addColorStop(1, 'rgba(120,90,220,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, R * 1.8, 0, TAU); g.fill();
      g.beginPath();
      for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, rr = R * (i % 2 ? .82 : 1.06); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      g.closePath();
      const kg = g.createRadialGradient(cx - R * .25, cy - R * .25, R * .05, cx, cy, R);
      kg.addColorStop(0, '#3a2f58'); kg.addColorStop(.6, '#120d20'); kg.addColorStop(1, '#050308');
      g.fillStyle = kg; g.fill();
      g.strokeStyle = 'rgba(196,176,255,.95)'; g.lineWidth = Math.max(1.4, OLw * .8); g.stroke();
      g.strokeStyle = 'rgba(220,210,255,.5)'; g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, R * .5, .6, 2.6); g.stroke();
    } else if (kind === 'shadow') {
      // 影分身弹：与水滴同形但暗紫，白边让它和实体弹区分
      const tail = R * 1.75;
      g.beginPath();
      g.moveTo(cx + R * .1, cy - R);
      g.arc(cx + R * .1, cy, R, -Math.PI / 2, Math.PI / 2);
      g.quadraticCurveTo(cx - tail * .5, cy + R * .5, cx - tail, cy);
      g.quadraticCurveTo(cx - tail * .5, cy - R * .5, cx + R * .1, cy - R);
      g.closePath();
      const sg = g.createLinearGradient(cx - tail, cy, cx + R, cy);
      sg.addColorStop(0, 'rgba(90,70,150,.35)'); sg.addColorStop(.45, '#5a4a8a'); sg.addColorStop(1, '#c8c0e8');
      g.fillStyle = sg; g.fill();
      g.strokeStyle = 'rgba(240,236,255,.8)'; g.lineWidth = OLw; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(cx + R * .3, cy - R * .32, R * .24, R * .14, -.5, 0, TAU); g.fill();
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
  if (kind === 'grenade') { drawGrenadeBullet(ctx, tr, t); return; }
  const variant = kind === 'tear' ? (tr.pierce ? 'pierce' : (tr.big ? 'big' : '')) : '';
  const spr = bulletSprite(kind, tr.r, variant);
  const DIR_KINDS = ['tear', 'shell', 'shard', 'laser', 'spark', 'pin', 'bee', 'shadow'];
  const SPIN_KINDS = ['sickle', 'chrys', 'petal', 'hive', 'core', 'duck'];
  const ang = DIR_KINDS.indexOf(kind) >= 0 ? Math.atan2(tr.vy, tr.vx)
    : SPIN_KINDS.indexOf(kind) >= 0 ? (tr.spin !== undefined ? tr.spin : (t || 0) * (kind === 'chrys' ? .12 : .3)) : 0;
  ctx.save();
  ctx.translate(tr.x, tr.y);
  if (ang) ctx.rotate(ang);
  if (kind === 'duck' && tr.squash) { const q = clamp(tr.squash, 0, 1); ctx.scale(1 + q * .3, 1 - q * .34); }
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

// 罐罐雷弹体：铁皮罐头翻滚飞行 + 引信逐帧烧短。squash 由调用方在落地帧给 0~1
function drawGrenadeBullet(ctx, tr, t) {
  const R = tr.r, spin = tr.spin !== undefined ? tr.spin : (t || 0) * .22;
  const fuse = clamp(tr.fuse === undefined ? 1 : tr.fuse, 0, 1);
  const sq = clamp(tr.squash || 0, 0, 1);
  ctx.save();
  ctx.translate(tr.x, tr.y);
  ctx.rotate(spin);
  ctx.scale(1 + sq * .3, 1 - sq * .32);
  ctx.fillStyle = '#cfc6ae'; ctx.beginPath(); ctx.roundRect(-R * .78, -R * .92, R * 1.56, R * 1.84, R * .3); ctx.fill();
  ctx.strokeStyle = OL; ctx.lineWidth = Math.max(1.6, R * .18); ctx.stroke();
  ctx.fillStyle = '#a8c05a'; ctx.beginPath(); ctx.roundRect(-R * .78, -R * .26, R * 1.56, R * .58, R * .1); ctx.fill();
  ctx.strokeStyle = 'rgba(40,30,16,.6)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(60,44,20,.55)';
  ctx.beginPath(); ctx.ellipse(0, -R * .92, R * .62, R * .18, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.roundRect(-R * .56, -R * .78, R * .22, R * 1.5, 2); ctx.fill();
  ctx.strokeStyle = 'rgba(70,44,20,.8)'; ctx.lineWidth = Math.max(1.4, R * .14);
  ctx.beginPath(); ctx.moveTo(R * .1, -R * .95); ctx.quadraticCurveTo(R * .5, -R * 1.5, R * .3, -R * 1.9); ctx.stroke();
  if (fuse > 0) { // 引信火星：随剩余时间变短变暗，最后 25% 红闪做预警
    const blink = fuse < .25 && Math.floor((t || 0) / 2) % 2 === 0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = blink ? 'rgba(255,90,60,.95)' : 'rgba(255,214,120,.95)';
    ctx.beginPath(); ctx.arc(R * .3, -R * 1.9, R * (.16 + .1 * fuse) * (blink ? 1.5 : 1), 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,150,60,.5)';
    for (let i = 0; i < 3; i++) {
      const a = rand(-2.6, -0.5), d = R * rand(.3, .9);
      ctx.beginPath(); ctx.arc(R * .3 + Math.cos(a) * d, -R * 1.9 + Math.sin(a) * d, R * .07, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

// 回旋镖破空弧带：去程冷白、回程暖橙，让玩家一眼知道"这是回来的一段，还能再打一次"
function boomerangSwoosh(ctx, o) {
  const R = o.r || 12, back = !!o.back, k = clamp(o.k === undefined ? 1 : o.k, 0, 1);
  const ang = o.ang || 0;
  ctx.save();
  ctx.translate(o.x, o.y); ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  const col = back ? '255,178,92' : '206,232,255';
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * R * .5;
    const grad = ctx.createLinearGradient(0, 0, -R * (2.6 - i * .5), 0);
    grad.addColorStop(0, `rgba(${col},${.5 * k * (1 - i * .22)})`); grad.addColorStop(1, `rgba(${col},0)`);
    ctx.strokeStyle = grad; ctx.lineWidth = R * (.42 - i * .1);
    ctx.beginPath(); ctx.moveTo(0, off); ctx.quadraticCurveTo(-R * 1.3, off * 1.5 - R * .3, -R * (2.6 - i * .5), off * 1.2); ctx.stroke();
  }
  ctx.fillStyle = `rgba(255,255,255,${.5 * k})`;
  ctx.beginPath(); ctx.ellipse(R * .2, 0, R * .5, R * .3, 0, 0, TAU); ctx.fill();
  ctx.restore();
}

// 爆炸：白芯闪 → 冲击波环 → 六团火球 → 八向铁片。焦土贴花另交 scorchDecal 落地面层
function blastRing(ctx, o) {
  const R = o.r || 40, k = clamp(o.k === undefined ? 1 : o.k, 0, 1), e = 1 - k;
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.globalCompositeOperation = 'lighter';
  const core = R * (.42 + e * .5) * k;
  const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, core + 1);
  cg.addColorStop(0, `rgba(255,255,250,${.95 * k})`); cg.addColorStop(.4, `rgba(255,220,140,${.6 * k})`); cg.addColorStop(1, 'rgba(255,140,50,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, core + 1, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(255,190,110,${.85 * k})`; ctx.lineWidth = Math.max(1, 7 * k);
  ctx.beginPath(); ctx.arc(0, 0, R * (.28 + e * 1.05), 0, TAU); ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,240,${.5 * k})`; ctx.lineWidth = Math.max(1, 3 * k);
  ctx.beginPath(); ctx.arc(0, 0, R * (.2 + e * .82), 0, TAU); ctx.stroke();
  for (let i = 0; i < 6; i++) { // 翻滚火球
    const a = i * TAU / 6 + o.seed * .3, d = R * (.3 + e * .82);
    ctx.fillStyle = `rgba(255,${150 + (i % 3) * 30},60,${.5 * k})`;
    ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d * .8, R * (.2 - e * .1) + 1, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(214,206,190,${.9 * k})`;                    // 八向铁片
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + .3, d = R * (.35 + e * 1.35);
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(a + e * 6);
    ctx.beginPath(); ctx.moveTo(-2.6, -1.6); ctx.lineTo(2.6, -1.2); ctx.lineTo(1.4, 1.8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,16,.7)'; ctx.lineWidth = .9; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// 焦土：由调用方存进地面层（同 room.blood 的用法），不随 fx 生命周期消失
function scorchDecal(ctx, o) {
  const R = o.r || 40;
  ctx.save();
  ctx.translate(o.x, o.y); ctx.rotate(o.a || 0);
  ctx.fillStyle = `rgba(24,14,10,${o.al === undefined ? .38 : o.al})`;
  ctx.beginPath(); ctx.ellipse(0, 0, R, R * .62, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(255,150,70,${(o.al === undefined ? .38 : o.al) * .5})`; ctx.lineWidth = 1.6;
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6 + .4;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * .25, Math.sin(a) * R * .16);
    ctx.lineTo(Math.cos(a) * R * .82, Math.sin(a) * R * .5); ctx.stroke();
  }
  ctx.restore();
}

// 荆棘鞭：无弹道枪的"弹"就是一条三段鞭影，k 1→0 扫过整个弧
function whipArc(ctx, o) {
  const R = o.r || 78, k = clamp(o.k === undefined ? 1 : o.k, 0, 1);
  const spread = o.spread === undefined ? 1.5 : o.spread;
  const base = o.ang || 0;
  const cur = base - spread / 2 + spread * (1 - k);
  ctx.save();
  ctx.translate(o.x, o.y);
  const band = ctx.createRadialGradient(0, 0, R * .2, 0, 0, R);      // 已扫过的血弧残影
  band.addColorStop(0, `rgba(176,74,106,${.05 * k})`); band.addColorStop(1, `rgba(176,74,106,${.3 * k})`);
  ctx.fillStyle = band;
  ctx.beginPath(); ctx.moveTo(0, 0);
  ctx.arc(0, 0, R, base - spread / 2, cur); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = `rgba(255,225,235,${.55 * k})`;                  // 梢后白线
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, R * .96, cur - .5, cur); ctx.stroke();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';                     // 三段鞭身（根粗梢细）
  const pts = [];
  for (let i = 0; i <= 3; i++) {
    const rr = R * (0.28 + i * .24), wob = Math.sin(k * 9 + i) * (3 + i * 2.5) * k;
    const a = cur + wob / rr;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  for (let i = 0; i < 3; i++) {
    ctx.strokeStyle = '#3a2a30'; ctx.lineWidth = 5.4 - i * 1.4;
    ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
    ctx.strokeStyle = 'rgba(150,110,120,.6)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke();
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    const na = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]) + Math.PI / 2;
    ctx.strokeStyle = '#c9405e'; ctx.lineWidth = 1.8;                // 倒刺
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(na) * 5, my + Math.sin(na) * 5); ctx.stroke();
  }
  ctx.fillStyle = '#d8cfc0';                                          // 梢头骨尖
  ctx.save(); ctx.translate(pts[3][0], pts[3][1]); ctx.rotate(cur);
  ctx.beginPath(); ctx.moveTo(-2, -2.4); ctx.lineTo(7, 0); ctx.lineTo(-2, 2.4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OL; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
  if (o.hit && k < .62) {                                             // 命中瞬间：白闪 + 血珠扇形
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,255,255,${.8 * k})`;
    ctx.beginPath(); ctx.arc(pts[3][0], pts[3][1], 7 * k + 2, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(196,48,58,${.9 * k})`;
    for (let i = 0; i < 7; i++) {
      const a = cur + rand(-.7, .7), d = rand(6, 26) * (1.3 - k);
      ctx.beginPath(); ctx.arc(pts[3][0] + Math.cos(a) * d, pts[3][1] + Math.sin(a) * d, rand(1.2, 2.6), 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

// ── 第二批七把的行为特效 ──
function petalBurst(ctx, o) {
  const k = clamp(o.k === undefined ? 1 : o.k, 0, 1), R = o.r || 14, n = o.n || 10;
  ctx.save(); ctx.translate(o.x, o.y);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + (o.seed || 0), d = R * (.3 + (1 - k) * 1.9);
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(a + (1 - k) * 3);
    ctx.globalAlpha = k;
    ctx.beginPath(); ctx.ellipse(0, 0, R * .42, R * .17, 0, 0, TAU);
    ctx.fillStyle = i % 2 ? '#f9e4ec' : '#eaa9bc'; ctx.fill();
    ctx.strokeStyle = 'rgba(122,58,80,.45)'; ctx.lineWidth = .9; ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,232,150,${.5 * k})`;
  ctx.beginPath(); ctx.arc(0, 0, R * (.4 + (1 - k) * .7), 0, TAU); ctx.fill();
  ctx.restore();
}

// 落地钉：插入余震 + 危险圈 + 钉头小旗。k 为剩余驻留（1→0），末尾 20% 抖动变暗提示将消失
function pinTrap(ctx, o) {
  const k = clamp(o.k === undefined ? 1 : o.k, 0, 1), R = o.r || 9;
  const cap = o.cap || '#d0405a';
  const sink = k > .9 ? (1 - k) * 10 : 0;
  ctx.save(); ctx.translate(o.x, o.y);
  const dying = k < .22 ? .4 + .6 * Math.abs(Math.sin(o.t * .5)) : 1;
  ctx.globalAlpha = dying;
  ctx.strokeStyle = `rgba(220,90,110,${.3 * k})`; ctx.lineWidth = 1.6;
  ctx.setLineDash([4, 5]); ctx.lineDashOffset = -(o.t || 0) * .6;
  ctx.beginPath(); ctx.ellipse(0, 2, R * 2.4, R * 1.5, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, 3, R * .8, R * .3, 0, 0, TAU); ctx.fill();
  ctx.rotate((o.angle || -1.1) + sink * .1);
  ctx.strokeStyle = '#c8ccd4'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -R * (1.5 - sink * .4)); ctx.stroke();
  ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(0, -R * (1.55 - sink * .4), R * .52, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(30,8,14,.85)'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.65)'; ctx.beginPath(); ctx.arc(-R * .16, -R * (1.7 - sink * .4), R * .16, 0, TAU); ctx.fill();
  if (o.flag) { // 危险小旗
    ctx.strokeStyle = 'rgba(40,26,10,.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -R * 2.1); ctx.lineTo(R * .1, -R * 3.1); ctx.stroke();
    ctx.fillStyle = `rgba(255,224,120,${.9 * k})`;
    ctx.beginPath(); ctx.moveTo(R * .1, -R * 3.1); ctx.lineTo(R * 1.5, -R * 2.7); ctx.lineTo(R * .12, -R * 2.3); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// Lv5 钉间电网：把落地的钉连成折线电弧
function pinGrid(ctx, o) {
  const pins = o.pins || [], k = clamp(o.k === undefined ? 1 : o.k, 0, 1);
  if (pins.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(190,210,255,${.55 * k})`; ctx.lineWidth = 1.6;
  for (let i = 0; i < pins.length - 1; i++) {
    const a = pins[i], b = pins[i + 1], n = 4;
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 6);
    for (let j = 1; j < n; j++) {
      const tt = j / n;
      ctx.lineTo(a.x + (b.x - a.x) * tt + rand(-4, 4), a.y - 6 + (b.y - a.y) * tt + rand(-4, 4));
    }
    ctx.lineTo(b.x, b.y - 6); ctx.stroke();
  }
  ctx.restore();
}

// 穿云枪：蓄力环（枪口聚光 + 收紧的四道箍 + 极细瞄准线）
function chargeRing(ctx, o) {
  const k = clamp(o.k === undefined ? 0 : o.k, 0, 1), R = o.r || 12;
  ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.ang || 0);
  ctx.strokeStyle = `rgba(255,90,80,${.22 + .2 * k})`; ctx.lineWidth = 1;
  ctx.setLineDash([9, 8]); ctx.lineDashOffset = -(o.t || 0) * 1.4;
  ctx.beginPath(); ctx.moveTo(R, 0); ctx.lineTo(o.len || 300, 0); ctx.stroke(); ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const rr = R * (2.2 - i * .35) * (1.5 - k * 1.1);
    ctx.strokeStyle = `rgba(160,255,246,${(.2 + .2 * i) * k})`; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(R * .8, 0, Math.max(2, rr), -1.1, 1.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(R * .8, 0, Math.max(2, rr), Math.PI - 1.1, Math.PI + 1.1); ctx.stroke();
  }
  const cg = ctx.createRadialGradient(R * .9, 0, 0, R * .9, 0, R * (.3 + k * .9) + 1);
  cg.addColorStop(0, `rgba(255,255,255,${.95 * k})`); cg.addColorStop(.5, `rgba(140,240,230,${.7 * k})`); cg.addColorStop(1, 'rgba(90,220,210,0)');
  ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(R * .9, 0, R * (.3 + k * .9) + 1, 0, TAU); ctx.fill();
  ctx.restore();
}

// 穿云枪：瞬发贯穿线（极细高亮 + 空气撕裂残影 + 穿孔端点）
function railShot(ctx, o) {
  const k = clamp(o.k === undefined ? 1 : o.k, 0, 1), lvl = clamp(o.lvl || 1, 1, 5);
  const { x1, y1, x2, y2 } = o;
  const ang = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
  ctx.save(); ctx.translate(x1, y1); ctx.rotate(ang); ctx.lineCap = 'round';
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(120,235,225,${.22 * k})`; ctx.lineWidth = (6 + lvl * 2) * k;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.strokeStyle = `rgba(240,255,254,${k})`; ctx.lineWidth = Math.max(.8, (1.2 + lvl * .5) * k);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
  ctx.strokeStyle = `rgba(255,255,255,${.5 * k})`; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) { // 撕裂残影：主线两侧的短折线
    const y0 = (i % 2 ? 1 : -1) * (3 + i * 2.2) * k;
    ctx.beginPath(); ctx.moveTo(len * (.1 + i * .16), y0);
    ctx.lineTo(len * (.16 + i * .16), y0 * .4 + rand(-3, 3)); ctx.stroke();
  }
  const bg = ctx.createRadialGradient(len, 0, 0, len, 0, 12 * k + 2);
  bg.addColorStop(0, `rgba(255,255,255,${.9 * k})`); bg.addColorStop(.5, `rgba(140,240,230,${.5 * k})`); bg.addColorStop(1, 'rgba(90,220,210,0)');
  ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(len, 0, 12 * k + 2, 0, TAU); ctx.fill();
  ctx.restore();
}

// 橡皮鸭弹跳：压扁回弹的挤压环 + 小星星 + 飘羽
function bouncePop(ctx, o) {
  const k = clamp(o.k === undefined ? 1 : o.k, 0, 1), R = o.r || 12;
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,240,150,${.6 * k})`; ctx.lineWidth = 2.4 * k + .5;
  ctx.beginPath(); ctx.ellipse(0, 0, R * (.5 + (1 - k) * 1.5), R * (.3 + (1 - k) * .9), 0, 0, TAU); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(255,232,120,${.9 * k})`;
  for (let i = 0; i < 3; i++) {
    const a = (o.dir || 0) + Math.PI + (i - 1) * .8, d = R * (.8 + (1 - k) * 1.4);
    star(ctx, Math.cos(a) * d, Math.sin(a) * d, R * .22 * k + 1, 4, .4); ctx.fill();
  }
  for (let i = 0; i < 2; i++) { // 飘羽
    const a = (o.dir || 0) + Math.PI + (i ? .9 : -.9), d = R * (.6 + (1 - k) * 1.8);
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d - (1 - k) * R); ctx.rotate(a);
    ctx.globalAlpha = k;
    ctx.beginPath(); ctx.ellipse(0, 0, R * .3, R * .12, 0, 0, TAU);
    ctx.fillStyle = '#fff3c4'; ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

// 蜂巢炸开：木屑外迸 + 数只工蜂从破口涌出
function hiveBurst(ctx, o) {
  const k = clamp(o.k === undefined ? 1 : o.k, 0, 1), R = o.r || 14, n = o.n || 3;
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.fillStyle = `rgba(192,138,48,${.9 * k})`;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU + .3, d = R * (.3 + (1 - k) * 1.7);
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(a + (1 - k) * 5);
    ctx.beginPath(); ctx.roundRect(-R * .16, -R * .07, R * .32, R * .14, 1); ctx.fill(); ctx.restore();
  }
  ctx.globalAlpha = k;
  for (let i = 0; i < n; i++) { // 涌出的蜂：小身子 + 抖翅
    const a = -.6 + i * .6, d = R * (.5 + (1 - k) * 1.5);
    const bx = Math.cos(a) * d, by = Math.sin(a) * d - (1 - k) * R * .4;
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath(); ctx.ellipse(bx, by - 1.6 + Math.sin((o.t || 0) * 1.5 + i) * .8, 2.2, 1, -.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8c243'; ctx.beginPath(); ctx.ellipse(bx, by, 2.8, 2, a, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2a10'; ctx.beginPath(); ctx.arc(bx + 1.6, by - .4, .8, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(255,224,130,${.4 * k})`;
  ctx.beginPath(); ctx.arc(0, 0, R * (.5 + (1 - k) * .6), 0, TAU); ctx.fill();
  ctx.restore();
}

// 漩涡场：向内收的螺旋虚线 + 被拉伸的尘埃 + 中心空腔。dir 控制旋向
function vortexField(ctx, o) {
  const R = o.r || 46, k = clamp(o.k === undefined ? 1 : o.k, 0, 1);
  const dir = o.dir || 1, T = o.t || 0;
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.globalCompositeOperation = 'lighter';
  const vg = ctx.createRadialGradient(0, 0, R * .08, 0, 0, R);
  vg.addColorStop(0, `rgba(150,120,240,${.42 * k})`); vg.addColorStop(.55, `rgba(90,60,170,${.18 * k})`); vg.addColorStop(1, 'rgba(60,40,120,0)');
  ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = `rgba(210,198,255,${.5 * k})`; ctx.lineWidth = 1.6;
  for (let s = 0; s < 4; s++) {
    ctx.beginPath();
    for (let i = 0; i <= 26; i++) {
      const tt = i / 26, rr = R * (1.05 - tt * .82), a = dir * (tt * 4.2 + s * TAU / 4) + T * .09;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr * .92;
      if (i % 2 === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);   // 虚线感：分段跳点
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#08060f'; ctx.beginPath(); ctx.arc(0, 0, R * .2 * (1 + (1 - k) * .2), 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(226,216,255,${.8 * k})`; ctx.lineWidth = 1.4; ctx.stroke();
  for (let i = 0; i < 6; i++) { // 被吸入的尘埃：越靠近中心越拉伸
    const ph = ((T * .02 + i / 6) % 1), rr = R * (1.1 - ph * .95), a = dir * ph * 6 + i;
    ctx.save(); ctx.translate(Math.cos(a) * rr, Math.sin(a) * rr * .92); ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = `rgba(220,210,250,${.6 * (1 - ph) * k})`;
    ctx.beginPath(); ctx.ellipse(0, 0, 1.3, 1.3 + ph * 6, 0, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

// 塌缩：先外扩一圈白（反向膨胀），再内爆成黑点 + 冲击环
function vortexImplode(ctx, o) {
  const R = o.r || 46, k = clamp(o.k === undefined ? 1 : o.k, 0, 1), e = 1 - k;
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(236,230,255,${.7 * k})`; ctx.lineWidth = 3 * k + .6;
  ctx.beginPath(); ctx.arc(0, 0, R * (.25 + e * 1.25), 0, TAU); ctx.stroke();
  if (e < .5) {
    const p = e / .5;
    ctx.fillStyle = `rgba(255,255,255,${.85 * (1 - p)})`;
    ctx.beginPath(); ctx.arc(0, 0, R * (.2 + p * 1.1), 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = `rgba(8,6,14,${.9 * k})`;
  ctx.beginPath(); ctx.arc(0, 0, R * .22 * (1 - e * .5), 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(150,120,240,${.6 * k})`; ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + e * .6, d0 = R * (.3 + e * .8), d1 = R * (.5 + e * 1.5);
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * d0, Math.sin(a) * d0); ctx.lineTo(Math.cos(a) * d1, Math.sin(a) * d1); ctx.stroke();
  }
  ctx.restore();
}

// 影分身：身后半透剪影，晚几帧开火。char 传角色色板
function shadowClone(ctx, o) {
  const k = clamp(o.k === undefined ? 1 : o.k, 0, 1), ch = o.char || PALETTES[0];
  const ang = o.ang || 0;
  ctx.save();
  ctx.translate(o.x, o.y); ctx.rotate(ang);
  ctx.globalAlpha = .34 * k;
  ctx.fillStyle = '#2a2440';
  ctx.beginPath(); ctx.roundRect(-9, -6, 19, 13, 6); ctx.fill();          // 身
  ctx.beginPath(); ctx.arc(0, -13, 12.4, 0, TAU); ctx.fill();             // 头
  ctx.fillStyle = ch.suit; ctx.globalAlpha = .3 * k;
  ctx.beginPath(); ctx.roundRect(-8, -5, 17, 11, 5); ctx.fill();
  ctx.fillStyle = ch.hair; ctx.beginPath(); ctx.arc(0, -14, 12, Math.PI, TAU); ctx.fill();
  ctx.globalAlpha = .5 * k;
  drawGun(ctx, { id: o.gun || 'twin', lvl: o.lvl || 1, t: o.t || 0, tint: '#2a2440', scale: .94 });
  ctx.fillStyle = '#e8e2f8'; ctx.globalAlpha = .8 * k;                     // 鬼眼
  ctx.beginPath(); ctx.arc(-3.6, -13, 1.6, 0, TAU); ctx.arc(3.6, -13, 1.6, 0, TAU); ctx.fill();
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
  } else if (id === 'flame') {
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
  } else if (id === 'sickle') {
    // 投掷类不该有枪口火光：只有一圈出手骨粉与气流环
    ctx.strokeStyle = `rgba(238,228,200,${.55 * k})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(R * .3, 0, R * (.5 + (1 - k) * 1.4), -1.2, 1.2); ctx.stroke();
    ctx.fillStyle = `rgba(226,214,182,${.5 * k})`;
    for (let i = 0; i < 5; i++) {
      const a = -.7 + i * .35, d = R * (.5 + (1 - k) * 1.6);
      ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, R * .16 * k + .7, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,252,240,${.7 * k})`;
    ctx.beginPath(); ctx.ellipse(R * .4, 0, R * .3 * k + .8, R * .18 * k + .6, 0, 0, TAU); ctx.fill();
  } else if (id === 'mortar') {
    // 迫击闷响：膛口矮焰球 + 向后扩散的尘环，不前冲
    ctx.fillStyle = `rgba(255,190,110,${.5 * k})`;
    ctx.beginPath(); ctx.ellipse(R * .5, 0, R * .7 * k + 1.5, R * .95 * k + 1.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,248,225,${.8 * k})`;
    ctx.beginPath(); ctx.arc(R * .45, 0, R * .3 * k + 1, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(196,182,158,${.45 * k})`; ctx.lineWidth = 3 * k + .8;
    ctx.beginPath(); ctx.arc(0, 0, R * (.9 + (1 - k) * 2.2), -1.5, 1.5); ctx.stroke();
    for (let i = 0; i < 4; i++) { // 侧向逸出烟团
      const a = (i % 2 ? 1 : -1) * (.9 + i * .25);
      ctx.fillStyle = `rgba(180,170,150,${.3 * k})`;
      ctx.beginPath(); ctx.arc(Math.cos(a) * R * 1.3, Math.sin(a) * R * 1.3, R * .34 * (1.2 - k), 0, TAU); ctx.fill();
    }
  } else if (id === 'whip') {
    // 起手荆棘闪光：一道弧光，无火
    ctx.strokeStyle = `rgba(255,180,205,${.8 * k})`; ctx.lineWidth = 2.6 * k + .6;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.1, -.7, .7); ctx.stroke();
    ctx.fillStyle = `rgba(255,235,242,${.7 * k})`;
    for (let i = 0; i < 3; i++) { const a = -.5 + i * .5; star(ctx, Math.cos(a) * R * 1.25, Math.sin(a) * R * 1.25, R * .2 * k + 1, 4, .4); ctx.fill(); }
  } else if (id === 'chrys') {
    // 开花式：花瓣外抛 + 花粉团，不是火
    for (let i = 0; i < 6; i++) {
      const a = -.7 + i * .28, d = R * (.5 + (1 - k) * 1.5);
      ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d); ctx.rotate(a);
      ctx.globalAlpha = k;
      ctx.beginPath(); ctx.ellipse(0, 0, R * .34, R * .13, 0, 0, TAU);
      ctx.fillStyle = i % 2 ? '#f9e4ec' : '#eaa9bc'; ctx.fill(); ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,236,160,${.5 * k})`;
    ctx.beginPath(); ctx.arc(R * .5, 0, R * .5 * k + 1, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  } else if (id === 'pin') {
    // 撒钉：无火光，只有金属闪点与木屑尘
    ctx.fillStyle = `rgba(232,238,246,${.9 * k})`;
    for (let i = 0; i < 4; i++) {
      const a = -.5 + i * .34, d = R * (.6 + i * .3);
      star(ctx, Math.cos(a) * d, Math.sin(a) * d, R * .16 * k + .8, 4, .4); ctx.fill();
    }
    ctx.strokeStyle = `rgba(190,180,210,${.4 * k})`; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(R * .3, 0, R * (.5 + (1 - k) * 1.2), -1, 1); ctx.stroke();
  } else if (id === 'rail') {
    // 蓄力释放：极长的前冲光矛 + 两侧后掠电弧
    ctx.fillStyle = `rgba(180,255,248,${.8 * k})`;
    ctx.beginPath(); ctx.moveTo(R * 4.2, 0); ctx.lineTo(R * .4, -R * .34); ctx.lineTo(R * .4, R * .34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${.95 * k})`;
    ctx.beginPath(); ctx.moveTo(R * 2.6, 0); ctx.lineTo(R * .3, -R * .16); ctx.lineTo(R * .3, R * .16); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(140,240,230,${.6 * k})`; ctx.lineWidth = 1.4;
    for (const sgn of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(-R * .7, sgn * R * .8); ctx.lineTo(-R * 1.5, sgn * R * 1.5); ctx.stroke();
    }
  } else if (id === 'duck') {
    // 压缩空气：同心环外扩 + 两根飘羽
    ctx.strokeStyle = `rgba(240,246,255,${.55 * k})`; ctx.lineWidth = 2.2 * k + .5;
    ctx.beginPath(); ctx.ellipse(R * .3, 0, R * (.4 + (1 - k) * 1.6), R * (.5 + (1 - k) * 1.1), 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${.35 * k})`; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(R * .3, 0, R * (.15 + (1 - k) * 1.1), R * (.22 + (1 - k) * .8), 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(255,243,196,${.9 * k})`;
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.translate(R * .8, sgn * R * .5); ctx.rotate(sgn * .6);
      ctx.beginPath(); ctx.ellipse(0, 0, R * .26, R * .1, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
  } else if (id === 'hive') {
    // 蜂群涌出：五只小蜂从洞口散开 + 一点蜜光
    for (let i = 0; i < 5; i++) {
      const a = -.7 + i * .35, d = R * (.5 + i * .32) * (1.6 - k);
      const bx = Math.cos(a) * d + R * .3, by = Math.sin(a) * d;
      ctx.fillStyle = `rgba(255,255,255,${.5 * k})`;
      ctx.beginPath(); ctx.ellipse(bx, by - 1.4, 1.9, .8, -.4, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(232,194,67,${.95 * k})`;
      ctx.beginPath(); ctx.ellipse(bx, by, 2.4, 1.7, a, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(58,42,16,${.9 * k})`;
      ctx.beginPath(); ctx.arc(bx + 1.5, by - .3, .75, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,224,130,${.35 * k})`;
    ctx.beginPath(); ctx.arc(R * .3, 0, R * .4 * k + 1, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  } else if (id === 'vortex') {
    // 反向：光从外圈向内塌缩，而不是向外炸
    ctx.strokeStyle = `rgba(200,180,255,${.7 * k})`; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, R * (1.7 - k * 1.2), 0, TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + k * 2, r0 = R * (1.7 - k * 1.2), r1 = r0 - R * .5;
      ctx.strokeStyle = `rgba(226,216,255,${.6 * k})`; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.stroke();
    }
    ctx.fillStyle = `rgba(10,8,18,${.85 * k})`;
    ctx.beginPath(); ctx.arc(0, 0, R * .3 * k + .8, 0, TAU); ctx.fill();
  } else if (id === 'twin') {
    // 双管：上管白光、下管紫黑光，错开半帧的视觉节奏
    const pair = [[-R * .18, `rgba(255,255,255,${.9 * k})`], [R * .2, `rgba(154,134,232,${.85 * k})`]];
    for (const [dy, fill] of pair) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, rr = (i % 2 ? R * .3 : R * (i === 0 ? 1.5 : .8));
        ctx.lineTo(R * .5 + Math.cos(a) * rr, dy + Math.sin(a) * rr * .7);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = `rgba(226,220,250,${.5 * k})`;
    ctx.beginPath(); ctx.arc(R * .5, 0, R * .26 * k + .8, 0, TAU); ctx.fill();
    // 未登记的新武器：退回冲锋枪星形闪光，保证不会画成火焰
    const grad = ctx.createRadialGradient(R * .5, 0, R * .1, R * .5, 0, R * 1.5);
    grad.addColorStop(0, `rgba(255,255,235,${.95 * k})`); grad.addColorStop(.45, `rgba(255,225,140,${.6 * k})`); grad.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, rr = (i % 2 ? R * .42 : R * (i === 0 ? 1.9 : 1.05));
      ctx.lineTo(R * .5 + Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
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
  const col = { tear: '#d8ecff', laser: '#ff9a7a', light: '#ffee9a', flame: '#ffbe55', enemy: '#ffc8b4',
                sickle: '#efe6cc', mortar: '#ffd08a', whip: '#e0688a' }[id] || '#ffd9a0';
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
  GUNS, PALETTES, BULLETS, ENEMY_ART, BOSS_ART, RARITY, ACC,
  drawGun, drawCharacter, drawCard, bulletSprite, drawBullet, bulletKindOf,
  drawEnemy, drawBoss,
  muzzleFlash, casing, impactSpark, telegraph, deathPuff, laserBeam, chainBolt,
  boomerangSwoosh, blastRing, scorchDecal, whipArc, drawGrenadeBullet,
  petalBurst, pinTrap, pinGrid, chargeRing, railShot, bouncePop, hiveBurst,
  vortexField, vortexImplode, shadowClone,
  eye, blob, gloss, shadow, blush, brow, star, out, shade, withAlpha, mixHex,
  clamp, rand, TAU,
};
global.QArt = QArt;
})(typeof window !== 'undefined' ? window : globalThis);
