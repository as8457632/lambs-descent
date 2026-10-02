'use strict';
// ─────────────────────────────────────────────
// 程序化绘制：房间 / 角色 / 敌人 / Boss / 掉落物 / HUD
// 全部用代码绘制，暗黑卡通手绘风
// ─────────────────────────────────────────────


function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

// ── 房间地面/墙体/门 ──
function drawRoom(ctx, room, pal, t) {
  const ox = 0, oy = HUD_H;
  ctx.save();
  ctx.translate(ox, oy);

  // 地面
  for (let gy = 1; gy < GRID_H - 1; gy++) for (let gx = 1; gx < GRID_W - 1; gx++) {
    ctx.fillStyle = (gx + gy) % 2 ? pal.fb : pal.fa;
    ctx.fillRect(gx * TILE, gy * TILE, TILE, TILE);
  }
  // 大尺度色斑块 + 颗粒噪点，打散棋盘网格
  for (const s of room.stains) {
    ctx.fillStyle = s.c;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, s.r, s.r * .6, s.a, 0, TAU); ctx.fill();
  }
  for (const gr of room.grains || []) {
    ctx.fillStyle = gr.c;
    ctx.fillRect(gr.x, gr.y, gr.r, gr.r);
  }
  // 地面血渍
  for (const b of room.blood) {
    ctx.fillStyle = `rgba(${b.c},${b.al})`;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * .55, b.a, 0, TAU); ctx.fill();
  }

  // 外围地洞（墙外纯黑）
  ctx.fillStyle = '#000';
  ctx.fillRect(-ox, -oy, ROOM_W, oy); ctx.fillRect(0, ROOM_H, ROOM_W, oy);

  // 墙砖
  for (let i = 0; i < GRID_W; i++) for (let j = 0; j < GRID_H; j++) {
    const border = i === 0 || j === 0 || i === GRID_W - 1 || j === GRID_H - 1;
    if (!border) continue;
    const x = i * TILE, y = j * TILE;
    ctx.fillStyle = pal.wall; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = pal.wallHi; ctx.fillRect(x, y, TILE, 5);
    ctx.fillStyle = pal.wallSh; ctx.fillRect(x, y + TILE - 6, TILE, 6);
    ctx.strokeStyle = withAlpha('#000000', .25);
    ctx.strokeRect(x + .5, y + .5, TILE - 1, TILE - 1);
  }

  // 门
  for (const d of DIRS) {
    const link = room.links[d];
    if (!link) continue;
    const [di, dj] = DOOR_CELL[d];
    const x = di * TILE, y = dj * TILE;
    const open = room.cleared;
    // 门框挖空
    ctx.fillStyle = '#0d0a08'; ctx.fillRect(x, y, TILE, TILE);
    if (open) {
      const horiz = d === 'w' || d === 'e';
      // 向内递进的门廊渐变
      const g = ctx.createLinearGradient(x, y, horiz ? x + TILE * (d === 'e' ? 1 : -1) : x, horiz ? y : y + TILE * (d === 's' ? 1 : -1));
      g.addColorStop(0, '#020101'); g.addColorStop(.6, '#130d09'); g.addColorStop(1, '#28190f');
      ctx.fillStyle = g; ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
      // 门框砖缝与门楣
      ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
      ctx.fillStyle = pal.wallHi;
      if (!horiz) ctx.fillRect(x + 3, y + (d === 'n' ? 3 : TILE - 8), TILE - 6, 5);
      else ctx.fillRect(x + (d === 'w' ? 3 : TILE - 8), y + 3, 5, TILE - 6);
      // 暖光溢到房内地面 + 门槛石
      const [vx, vy] = DVEC[d];
      const sx = x + TILE / 2 - vx * TILE * 1.05, sy = y + TILE / 2 - vy * TILE * 1.05;
      const sp = ctx.createRadialGradient(sx, sy, 4, sx, sy, 52);
      sp.addColorStop(0, 'rgba(255,190,110,.28)'); sp.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(sx, sy, 52, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(130,108,84,.4)';
      ctx.fillRect(horiz ? x + TILE / 2 - 4 : x + 7, horiz ? y + 7 : y + TILE / 2 - 4, horiz ? 8 : TILE - 14, horiz ? TILE - 14 : 8);
    } else {
      // 铁门：铆钉 + 顶部咬合齿
      ctx.fillStyle = '#3d3a38'; ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      ctx.fillStyle = '#57534f'; ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
      ctx.fillStyle = '#2a2725';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(x + 12 + k * 12, y + TILE / 2, 3, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#6b6660';
      ctx.fillRect(x + 8, y + (d === 's' ? 0 : TILE - 6), 8, 6);
      ctx.fillRect(x + TILE - 16, y + (d === 's' ? 0 : TILE - 6), 8, 6);
    }
  }

  // 障碍物：主题家具（实心）+ 主题杂物（可破坏），渲染与碰撞同源 rocks/props
  for (const o of room.props) if (!o.dead) drawProp(ctx, o.x, o.y, o.sp, o.hp / o.maxHp, false);
  for (const r of room.rocks.values()) drawProp(ctx, r.x, r.y, r.sp, 1, true);

  // 商店：货架台座与木牌招牌
  if (room.type === 'shop') {
    ctx.fillStyle = '#5a4028';
    ctx.beginPath(); ctx.roundRect(ROOM_W / 2 - 38, TILE * 1.72, 76, 22, 3); ctx.fill();
    ctx.strokeStyle = '#31220f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(ROOM_W / 2 - 38, TILE * 1.72, 76, 22, 3); ctx.stroke();
    ctx.fillStyle = '#241708';
    ctx.fillRect(ROOM_W / 2 - 30, TILE * 1.72 + 4, 3, 14); ctx.fillRect(ROOM_W / 2 + 27, TILE * 1.72 + 4, 3, 14);
    ctx.fillStyle = '#e0cfa4'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('商 店', ROOM_W / 2, TILE * 1.72 + 16);
    for (const g of room.shelf || []) {
      if (g.dead) continue;
      ctx.fillStyle = '#5a4c40';
      ctx.beginPath(); ctx.roundRect(g.x - 16, g.y + 12, 32, 10, 3); ctx.fill();
      ctx.fillStyle = '#6d5c4c';
      ctx.beginPath(); ctx.roundRect(g.x - 12, g.y + 8, 24, 6, 2); ctx.fill();
    }
  }

  // 地洞（下一层入口）
  if (room.trapdoor) {
    const td = room.trapdoor;
    ctx.save(); ctx.translate(td.x, td.y);
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
    g.addColorStop(0, '#000'); g.addColorStop(.75, '#050303'); g.addColorStop(1, '#241a12');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 30, 24, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#4d3a26'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 24, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#5f4930'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-20, -6); ctx.lineTo(20, -6); ctx.moveTo(-20, 6); ctx.lineTo(20, 6); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// ── 主题障碍：同一套家具原语，按本局主题的 art+配色 组装 ──
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => clamp(Math.round(v + amt), 0, 255);
  return `rgb(${f(n >> 16 & 255)},${f(n >> 8 & 255)},${f(n & 255)})`;
}
function drawProp(ctx, x, y, sp, frac, solid) {
  const c = sp ? sp.c : '#6a5c50', art = sp ? sp.art : 'box';
  ctx.save(); ctx.translate(x, y);
  if (!solid) {
    const k = clamp(frac, .3, 1); ctx.scale(k, k); ctx.rotate((1 - k) * .2);
    ctx.globalAlpha = .92; // 杂物微微透底，与实心家具区分
  }
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(1, solid ? 15 : 12, 19, 6, 0, 0, TAU); ctx.fill();
  if (solid) { // 占格暗影垫：一眼看出这一格是撞不动的
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.roundRect(-21, -14, 42, 34, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.30)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(-21, -14, 42, 34, 6); ctx.stroke();
  }
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(15,10,6,.7)';
  const rect = (w, h, fill, y0 = -h / 2) => { ctx.fillStyle = fill || c; ctx.beginPath(); ctx.roundRect(-w / 2, y0, w, h, 3); ctx.fill(); ctx.stroke(); };
  switch (art) {
    case 'table': // 课桌/会议桌：桌面 + 木纹 + 四腿
      rect(36, 24, shade(c, 12), -14);
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(14, -6); ctx.moveTo(-14, 2); ctx.lineTo(14, 2); ctx.stroke();
      ctx.fillStyle = shade(c, -30); ctx.fillRect(-16, 8, 4, 8); ctx.fillRect(12, 8, 4, 8);
      break;
    case 'box': // 木箱/机柜：盖缝 + 胶带十字
      rect(32, 28, c, -16);
      ctx.strokeStyle = shade(c, -40); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-16, -8); ctx.lineTo(16, -8); ctx.moveTo(0, -16); ctx.lineTo(0, 12); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(-16, -16, 32, 5);
      break;
    case 'slab': // 床/沙发/托盘：低而宽的软垫 + 枕块
      rect(40, 18, shade(c, 8), -8);
      ctx.fillStyle = shade(c, 26); ctx.beginPath(); ctx.roundRect(-16, -6, 12, 12, 3); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 10); ctx.stroke();
      break;
    case 'cyl': case 'barrel': // 圆桶/油桶：顶盖椭圆 + 桶箍
      ctx.fillStyle = shade(c, -18); ctx.beginPath(); ctx.ellipse(0, 6, 14, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, -4, 14, 8, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = shade(c, art === 'barrel' ? -46 : -30); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -4, 10, 5.4, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.beginPath(); ctx.ellipse(-4, -7, 5, 2.4, -.5, 0, TAU); ctx.fill();
      break;
    case 'dome': // 培养舱/仪器：底座 + 半球罩高光
      ctx.fillStyle = shade(c, -26); ctx.beginPath(); ctx.roundRect(-13, 2, 26, 10, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 13, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(220,240,255,.35)'; ctx.beginPath(); ctx.ellipse(-4, -6, 4.5, 2.6, -.6, 0, TAU); ctx.fill();
      break;
    case 'panel': // 黑板/屏风/白板：立板 + 支脚 + 笔槽
      rect(38, 26, shade(c, 10), -18);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-15, -14, 30, 18);
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(6, -8); ctx.moveTo(-10, -3); ctx.lineTo(10, -3); ctx.stroke();
      ctx.fillStyle = shade(c, -40); ctx.fillRect(-14, 8, 3, 8); ctx.fillRect(11, 8, 3, 8);
      break;
    case 'rack': // 书架/衣架：立柱 + 层板/挂衣
      rect(38, 30, shade(c, -8), -16);
      ctx.strokeStyle = shade(c, 30); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-19, -6); ctx.lineTo(19, -6); ctx.moveTo(-19, 4); ctx.lineTo(19, 4); ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#b06a5a', '#5a7ab0', '#7ab05a', '#b0a05a'][i]; ctx.fillRect(-14 + i * 8, -14, 5, 7); }
      break;
    case 'column': // 立柱/保险库：方柱 + 顶底檐
      rect(22, 34, c, -17);
      ctx.fillStyle = shade(c, 24); ctx.fillRect(-13, -17, 26, 5); ctx.fillRect(-13, 11, 26, 5);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(6, -12, 5, 23);
      break;
    case 'pot': default: // 盆栽/垃圾桶：盆体 + 叶簇/筒身
      ctx.fillStyle = shade(c, -20); ctx.beginPath(); ctx.moveTo(-9, 12); ctx.lineTo(9, 12); ctx.lineTo(7, 0); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4e8a44';
      for (const [lx, ly, lr] of [[-5, -6, 6], [5, -5, 5.4], [0, -11, 5.6]]) { ctx.beginPath(); ctx.arc(lx, ly, lr, 0, TAU); ctx.fill(); }
      ctx.fillStyle = 'rgba(180,255,160,.25)'; ctx.beginPath(); ctx.arc(-2, -9, 2.6, 0, TAU); ctx.fill();
      break;
    case 'pile': // 杂物堆：三五个小团块 + 裂纹
      for (const [bx, by, br, bc] of [[-7, 4, 7, shade(c, 10)], [6, 5, 6, shade(c, -14)], [0, -3, 7.5, c], [9, -3, 4, shade(c, 22)]]) {
        ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill(); ctx.stroke();
      }
  }
  if (!solid) { // 可破坏裂纹角标：亮黄醒目
    ctx.strokeStyle = 'rgba(255,224,120,.9)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-7, -11); ctx.lineTo(-2, -6); ctx.lineTo(-6, -1); ctx.lineTo(-1, 4); ctx.stroke();
    ctx.fillStyle = 'rgba(255,224,120,.9)';
    ctx.beginPath(); ctx.arc(8, -10, 1.8, 0, TAU); ctx.fill(); // 右上角"可破坏"点标
  }
  ctx.restore();
}

// ── 玩家：俯视 3/4 持枪干员，皮肤随所选角色（发型/制服/枪械配色）──
function drawPlayer(ctx, p, t) {
  ctx.save();
  if (p.inv > 0 && game.state === 'play') ctx.globalAlpha = Math.floor(t / 4) % 2 === 0 ? .35 : 1; // 受击半透明闪烁
  ctx.translate(p.x, p.y + HUD_H);
  const ch = CHARS[(p.char == null ? (Meta.load().char || 0) : p.char) % CHARS.length];
  const bob = p.moving ? Math.sin(p.anim * .5) * 2 : Math.sin(t * .05) * 1;
  const ga = Math.atan2(p.aim.y, p.aim.x); // 枪口角

  // 影子
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(0, 16, 12, 4, 0, 0, TAU); ctx.fill();
  // 腿（战术裤 + 靴）
  ctx.fillStyle = shade(ch.suit, -28);
  const ls = p.moving ? Math.sin(p.anim * .5) * 4 : 0;
  ctx.fillRect(-6 + ls, 8, 4.5, 8); ctx.fillRect(1.5 - ls, 8, 4.5, 8);
  ctx.fillStyle = '#221d18';
  ctx.fillRect(-6.5 + ls, 14.5, 5.5, 3); ctx.fillRect(1 - ls, 14.5, 5.5, 3);
  // 躯干（战术背心制服）
  ctx.fillStyle = ch.suit;
  ctx.beginPath(); ctx.roundRect(-9, 0 + bob, 18, 12, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(15,10,6,.6)'; ctx.lineWidth = 1.6; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(-9, 6 + bob, 18, 3); // 弹匣袋带
  ctx.fillStyle = shade(ch.suit, 22); ctx.fillRect(-6, 2 + bob, 4, 4); ctx.fillRect(2, 2 + bob, 4, 4); // 胸袋
  // 枪械+双臂：朝下半球枪+手画在头前，朝上半球只补枪杆（手臂收头后，杜绝横穿脸）
  const gunFront = p.aim.y >= -.2;
  const drawGun = withArms => {
    ctx.save(); ctx.rotate(ga); ctx.translate(0, bob * .3);
    if (Math.cos(ga) < 0) ctx.scale(1, -1); // 朝左上下镜像：弹匣/准星不翻转
    ctx.fillStyle = ch.gun; ctx.fillRect(4, -2.2, 21, 4.4);
    ctx.fillStyle = shade(ch.gun, 26); ctx.fillRect(6, -2.6, 8, 5.2);
    ctx.fillStyle = shade(ch.gun, -18); ctx.fillRect(11, 2.4, 3.4, 5);
    ctx.fillRect(22, -1.4, 4, 1.6);
    ctx.fillStyle = 'rgba(255,255,255,.16)'; ctx.fillRect(6, -2.6, 19, 1.2);
    ctx.restore();
    if (!withArms) return;
    const h1x = Math.cos(ga) * 9, h1y = Math.sin(ga) * 9 + bob * .3;
    const h2x = Math.cos(ga) * 16, h2y = Math.sin(ga) * 16 + bob * .3;
    ctx.strokeStyle = shade(ch.suit, -10); ctx.lineWidth = 3.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, 3 + bob); ctx.lineTo(h1x, h1y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, 3 + bob); ctx.lineTo(h2x, h2y); ctx.stroke();
    ctx.fillStyle = ch.skin;
    ctx.beginPath(); ctx.arc(h1x, h1y, 2.4, 0, TAU); ctx.arc(h2x, h2y, 2.4, 0, TAU); ctx.fill();
  };
  if (gunFront) drawGun(true);
  // 头
  const hg = ctx.createRadialGradient(-3, -13 + bob, 2, 0, -8 + bob, 14);
  hg.addColorStop(0, shade(ch.skin, 18)); hg.addColorStop(1, ch.skin);
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(0, -8 + bob, 11.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(20,12,8,.55)'; ctx.lineWidth = 1.5; ctx.stroke();
  // 发型（角色辨识核心）
  ctx.fillStyle = ch.hair;
  if (ch.style === 'short') {
    ctx.beginPath(); ctx.arc(0, -9 + bob, 11.6, Math.PI * .95, Math.PI * 2.05); ctx.fill();
  } else if (ch.style === 'ponytail') {
    ctx.beginPath(); ctx.arc(0, -9 + bob, 11.6, Math.PI * .9, Math.PI * 2.1); ctx.fill();
    ctx.strokeStyle = ch.hair; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(-8, -12 + bob); ctx.quadraticCurveTo(-14, -8 + bob, -11, 0 + bob); ctx.stroke(); // 马尾收在脑后偏左，不甩向瞄准侧
    ctx.fillStyle = '#c94a6a'; ctx.beginPath(); ctx.arc(-9, -10 + bob, 1.8, 0, TAU); ctx.fill(); // 发绳
  } else if (ch.style === 'twintail') {
    ctx.beginPath(); ctx.arc(0, -9 + bob, 11.6, Math.PI * .92, Math.PI * 2.08); ctx.fill();
    for (const sgn of [-1, 1]) { // 双侧马尾
      ctx.strokeStyle = ch.hair; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(sgn * 9, -12 + bob); ctx.quadraticCurveTo(sgn * 16, -8 + bob, sgn * 14, 2 + bob); ctx.stroke();
      ctx.fillStyle = '#e86aa0'; ctx.beginPath(); ctx.arc(sgn * 10.5, -11 + bob, 1.9, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = ch.hair; ctx.beginPath(); ctx.arc(0, -14 + bob, 6, Math.PI, 0); ctx.fill(); // 刘海
  } else if (ch.style === 'cap') { // 战术帽：帽筒 + 前帽檐随枪角微转
    const brim = Math.cos(ga) * 3;
    ctx.beginPath(); ctx.arc(0, -10 + bob, 11.8, Math.PI * .85, Math.PI * 2.15); ctx.fill();
    ctx.beginPath(); ctx.ellipse(brim, -14.5 + bob, 10, 4.2, 0, Math.PI * .05, Math.PI * .95, true); ctx.fill();
    ctx.fillStyle = shade(ch.hair, 24); ctx.fillRect(-10, -15.5 + bob, 20, 2.4); // 帽带
  }
  if (!gunFront) drawGun(false); // 朝上时只叠枪杆于头发之上，手臂藏头后不穿脸
  // 眼睛：朝瞄准方向
  const ex = p.aim.x * 2.6, ey = p.aim.y * 1.8;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(-4, -8 + bob, 3, 3.4, 0, 0, TAU); ctx.ellipse(4, -8 + bob, 3, 3.4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#241a14';
  ctx.beginPath(); ctx.arc(-4 + ex, -8 + bob + ey, 1.5, 0, TAU); ctx.arc(4 + ex, -8 + bob + ey, 1.5, 0, TAU); ctx.fill();
  // 多弹数徽记（第三只眼类道具可视化：额前瞄准镜）
  if (p.shotsPerDir > 1) {
    ctx.fillStyle = '#8ecbff'; ctx.strokeStyle = '#1a1a22'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, -15 + bob, 2.6, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

// ── 泪弹（预渲染精灵，避免每颗每帧建渐变；敌弹带深色描边防与血渍混淆）──
const tearSprites = {};
function getTearSprite(isPlayer, r, colorKey) {
  const key = (colorKey || (isPlayer ? 'p' : 'e')) + Math.round(r);
  let spr = tearSprites[key];
  if (!spr) {
    const rr = Math.round(r), size = rr * 2 + 6;
    spr = document.createElement('canvas'); spr.width = spr.height = size;
    const c2 = spr.getContext('2d'), m = size / 2;
    if (!isPlayer && !colorKey) { c2.strokeStyle = 'rgba(40,8,0,.85)'; c2.lineWidth = 2; c2.beginPath(); c2.arc(m, m, rr + .8, 0, TAU); c2.stroke(); }
    if (isPlayer && colorKey !== 'flame') { c2.strokeStyle = colorKey === 'spark' ? 'rgba(255,225,120,.7)' : 'rgba(120,170,255,.55)'; c2.lineWidth = 1.5; c2.beginPath(); c2.arc(m, m, rr + .6, 0, TAU); c2.stroke(); } // 友方弹蓝色描边（火焰除外）
    const g = c2.createRadialGradient(m - rr * .3, m - rr * .3, 1, m, m, rr);
    if (colorKey === 'flame') {
      g.addColorStop(0, '#fffbe0'); g.addColorStop(.45, '#ffd24a'); g.addColorStop(1, '#ff8a1e');
    } else if (colorKey === 'spark') {
      g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#ffe98a'); g.addColorStop(1, '#e8a020');
    } else if (colorKey === 'spore') {
      if (isPlayer) { g.addColorStop(0, '#eaf6ff'); g.addColorStop(.55, '#9cc4ee'); g.addColorStop(1, '#4a79b8'); }
      else { g.addColorStop(0, '#e8f0d8'); g.addColorStop(.55, '#8ab060'); g.addColorStop(1, '#3f6428'); }
    } else if (isPlayer) { g.addColorStop(0, '#eaf6ff'); g.addColorStop(.55, '#9cc4ee'); g.addColorStop(1, '#4a79b8'); }
    else { g.addColorStop(0, '#ffe9e0'); g.addColorStop(.55, '#e07a5a'); g.addColorStop(1, '#9a3d24'); }
    c2.fillStyle = g; c2.beginPath(); c2.arc(m, m, rr, 0, TAU); c2.fill();
    if (colorKey === 'flame') { // 火苗尾巴
      c2.globalAlpha = .5; c2.fillStyle = '#ffb830';
      c2.beginPath(); c2.ellipse(m, m + rr * .9, rr * .55, rr * .9, 0, 0, TAU); c2.fill(); c2.globalAlpha = 1;
    }
    c2.fillStyle = 'rgba(255,255,255,.7)';
    c2.beginPath(); c2.arc(m - rr * .35, m - rr * .4, rr * .28, 0, TAU); c2.fill();
    spr._size = size;
    tearSprites[key] = spr;
  }
  return spr;
}
function drawTear(ctx, tr) {
  if (tr.colorKey === 'flame') { drawFlameTear(ctx, tr); return; }
  const spr = getTearSprite(tr.isPlayer, tr.r, tr.colorKey), s = spr._size;
  ctx.save();
  ctx.drawImage(spr, tr.x - s / 2, tr.y + HUD_H - s / 2);
  ctx.restore();
}
// 火焰弹：沿运动方向拉长的水滴火苗 + 抖动舌尖 + 内部亮核，寿命末收缩
function drawFlameTear(ctx, tr) {
  const ang = Math.atan2(tr.vy, tr.vx);
  const fade = clamp(tr.life / 12, .25, 1);
  const r = tr.r * (0.7 + 0.3 * fade);
  const flick = Math.sin(tr.x * .3 + tr.y * .3 + tr.life) * .18 + 1;
  ctx.save();
  ctx.translate(tr.x, tr.y + HUD_H);
  ctx.rotate(ang);
  ctx.globalCompositeOperation = 'lighter';
  // 外焰（橙红，向后拖尾）
  ctx.fillStyle = `rgba(255,110,25,${.5 + .3 * fade})`;
  ctx.beginPath();
  ctx.moveTo(r * 1.9 * flick, 0);
  ctx.quadraticCurveTo(-r * .2, r * 1.15, -r * 1.7, 0);
  ctx.quadraticCurveTo(-r * .2, -r * 1.15, r * 1.9 * flick, 0);
  ctx.fill();
  // 中焰（橙黄）
  ctx.fillStyle = 'rgba(255,180,60,.85)';
  ctx.beginPath();
  ctx.moveTo(r * 1.35 * flick, 0);
  ctx.quadraticCurveTo(-r * .1, r * .78, -r * 1.1, 0);
  ctx.quadraticCurveTo(-r * .1, -r * .78, r * 1.35 * flick, 0);
  ctx.fill();
  // 内焰（近白热）
  ctx.fillStyle = `rgba(255,236,170,${.55 + .3 * fade})`;
  ctx.beginPath();
  ctx.ellipse(r * .25, 0, r * .6, r * .42, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ── 武器特效（激光束 / 闪电链）──
function drawFx(ctx, g) {
  for (const f of g.fx) {
    const a = f.t / 9;
    ctx.save(); ctx.translate(0, HUD_H);
    if (f.type === 'laser') {
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(255,60,60,${a * .35})`; ctx.lineWidth = f.w * 2.4;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,120,100,${a})`; ctx.lineWidth = f.w;
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,240,230,${a})`; ctx.lineWidth = Math.max(1.5, f.w * .35);
      ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
    } else if (f.type === 'ghost') {
      const gc = CHARS[(f.char == null ? 0 : f.char) % CHARS.length];
      ctx.globalAlpha = (f.t / 8) * .5;
      ctx.fillStyle = gc.suit;
      ctx.beginPath(); ctx.roundRect(f.x - 8, f.y - 8 + 4, 16, 18, 6); ctx.fill();
      ctx.fillStyle = gc.skin;
      ctx.beginPath(); ctx.arc(f.x, f.y - 13 + 4, 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = gc.gun; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(f.x - 2, f.y + 2); ctx.lineTo(f.x + 14, f.y - 2); ctx.stroke(); // 持枪轮廓
      ctx.globalAlpha = 1;
    } else if (f.type === 'bolt') {
      ctx.strokeStyle = `rgba(255,235,120,${a})`; ctx.lineWidth = 3;
      ctx.shadowColor = '#ffe066'; ctx.shadowBlur = 8;
      ctx.beginPath();
      for (let i = 0; i < f.pts.length - 1; i++) {
        const [p0, p1] = [f.pts[i], f.pts[i + 1]];
        ctx.moveTo(p0.x, p0.y);
        const seg = 4;
        for (let k = 1; k <= seg; k++) {
          const tt = k / seg;
          const jx = k === seg ? 0 : rand(-7, 7), jy = k === seg ? 0 : rand(-7, 7);
          ctx.lineTo(lerp(p0.x, p1.x, tt) + jx, lerp(p0.y, p1.y, tt) + jy);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

// ── 敌人 ──
function drawEnemy(ctx, e, t) {
  ctx.save(); ctx.translate(e.x, e.y + HUD_H);
  const spawn = e.spawnT > 0 ? 1 - e.spawnT / 42 : 1;
  if (spawn < 1) { ctx.globalAlpha = .3 + .7 * spawn; ctx.scale(spawn, spawn); }
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(0, e.cfg.r * .8, e.cfg.r * .7, 3.5, 0, 0, TAU); ctx.fill();
  if (e.elite) { // 精英金色脉冲环（紫色会与 pooter 等紫系怪融色）
    const pr = e.cfg.r * (1.7 + .18 * Math.sin(t * .18));
    const g = ctx.createRadialGradient(0, 0, e.cfg.r * .5, 0, 0, pr);
    g.addColorStop(0, 'rgba(255,215,120,.28)'); g.addColorStop(1, 'rgba(255,215,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, pr, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,235,170,.8)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, pr * .92, 0, TAU); ctx.stroke();
  }
  const OL = 'rgba(22,13,9,.85)';
  const stroke = (w) => { ctx.strokeStyle = OL; ctx.lineWidth = w || 1.6; ctx.stroke(); };
  const pl = game.player;
  if (pl && pl.x < e.x - 4) ctx.scale(-1, 1); // 默认朝右，玩家在左则镜像
  const ph = Math.sin(t * .25);
  switch (e.cfg.id) {
    case 'fly': case 'attackfly': {
      const red = e.cfg.id === 'attackfly';
      const body = red ? '#8a3226' : '#4c6634';
      const fl = Math.sin(t * (red ? 1.4 : .9));
      ctx.save(); ctx.rotate(red ? -.15 : -.05);
      // 条纹腹部（裁剪内画带）
      ctx.beginPath(); ctx.ellipse(-3, 1, e.cfg.r * .95, e.cfg.r * .72, .3, 0, TAU);
      ctx.fillStyle = body; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(15,10,8,.5)';
      ctx.translate(-3, 1); ctx.rotate(.3);
      for (let i = 0; i < 3; i++) ctx.fillRect(-e.cfg.r + i * 5.5, -e.cfg.r, 2.2, e.cfg.r * 2);
      ctx.restore();
      stroke();
      // 胸 + 头
      ctx.fillStyle = red ? '#a04436' : '#5d7a3a';
      ctx.beginPath(); ctx.ellipse(6, -2, 6.5, 5.5, 0, 0, TAU); ctx.fill();
      // 大复眼
      ctx.fillStyle = red ? '#ff5a4a' : '#c9b03a';
      ctx.beginPath(); ctx.ellipse(8.5, -5, 4, 3.4, -.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(9.6, -6, 1.1, 0, TAU); ctx.fill();
      // 口器
      ctx.strokeStyle = OL; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(9, 1); ctx.lineTo(13, 4 + fl); ctx.stroke();
      // 双翅（膜质带脉）
      ctx.fillStyle = 'rgba(215,228,240,.42)'; ctx.strokeStyle = 'rgba(180,200,220,.5)'; ctx.lineWidth = 1;
      for (const [ang, len] of [[-.75 - fl * .35, 13], [-.35 + fl * .3, 10.5]]) {
        ctx.save(); ctx.translate(2, -6); ctx.rotate(ang);
        ctx.beginPath(); ctx.ellipse(-len * .6, 0, len, 3.2, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      // 悬垂足
      ctx.strokeStyle = 'rgba(20,12,8,.75)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(1 + i * 3, 4); ctx.lineTo(-2 + i * 3, 10 + ph + i); ctx.stroke(); }
      ctx.restore();
      break;
    }
    case 'pooter': {
      const fl = Math.sin(t * .08) * 2;
      ctx.translate(0, fl);
      // 鼓胀腹部（体液面 + 血管）
      ctx.fillStyle = '#6f5a91';
      ctx.beginPath(); ctx.ellipse(-4, 3, e.cfg.r * 1.05, e.cfg.r * .95, .2, 0, TAU); ctx.fill(); stroke(1.8);
      ctx.fillStyle = 'rgba(190,230,150,.35)';
      ctx.save();
      ctx.beginPath(); ctx.ellipse(-4, 3, e.cfg.r * .95, e.cfg.r * .85, .2, 0, TAU); ctx.clip();
      ctx.fillRect(-e.cfg.r * 2, 5, e.cfg.r * 4, e.cfg.r * 2);
      ctx.restore();
      ctx.strokeStyle = 'rgba(40,25,55,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-10, -2); ctx.quadraticCurveTo(-4, 2, -9, 8); ctx.stroke();
      // 胸
      ctx.fillStyle = '#8d76b2';
      ctx.beginPath(); ctx.ellipse(6, -3, 6.5, 5.5, -.3, 0, TAU); ctx.fill(); stroke(1.4);
      // 长喙针
      ctx.strokeStyle = '#3a2a4a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(10, -2); ctx.lineTo(18, 5); ctx.stroke();
      // 单眼
      ctx.fillStyle = '#ffe9b0'; ctx.beginPath(); ctx.arc(8, -5, 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a1530'; ctx.beginPath(); ctx.arc(8.6, -5, 1.3, 0, TAU); ctx.fill();
      // 膜翅
      ctx.fillStyle = 'rgba(225,215,240,.4)';
      ctx.save(); ctx.translate(3, -8); ctx.rotate(-.7 - Math.sin(t * .5) * .3);
      ctx.beginPath(); ctx.ellipse(-7, 0, 9, 2.6, 0, 0, TAU); ctx.fill(); ctx.restore();
      // 垂足
      ctx.strokeStyle = 'rgba(30,20,40,.7)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(2 + i * 3, 6); ctx.lineTo(0 + i * 4, 13 + ph); ctx.stroke(); }
      break;
    }
    case 'gaper': {
      const step = Math.sin(e.t * .28);
      // 双腿行走
      ctx.strokeStyle = '#b7a68e'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-3, 6); ctx.lineTo(-4 + step * 3, 16); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(4 - step * 3, 16); ctx.stroke();
      // 躯干（下摆破损）
      ctx.fillStyle = '#cbbda8';
      ctx.beginPath(); ctx.roundRect(-7, -4, 14, 12, 4); ctx.fill(); stroke();
      ctx.fillStyle = 'rgba(90,70,55,.35)'; ctx.fillRect(-7, 4, 14, 4);
      ctx.fillStyle = '#cbbda8';
      ctx.beginPath(); ctx.moveTo(-7, 8); ctx.lineTo(-4.5, 11); ctx.lineTo(-2, 8); ctx.lineTo(.5, 11); ctx.lineTo(3, 8); ctx.lineTo(5.5, 11); ctx.lineTo(7, 8); ctx.closePath(); ctx.fill();
      // 双臂空垂晃动
      ctx.strokeStyle = '#c2b29a'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(-7, -1); ctx.quadraticCurveTo(-12, 4 + step * 2, -10, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7, -1); ctx.quadraticCurveTo(12, 4 - step * 2, 10, 9); ctx.stroke();
      // 头
      ctx.fillStyle = '#e5d9c6';
      ctx.beginPath(); ctx.arc(1, -12, 9.5, 0, TAU); ctx.fill(); stroke();
      // 空洞眼窝
      ctx.fillStyle = '#16100c';
      ctx.beginPath(); ctx.ellipse(-2.5, -14, 2.6, 3.6, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(4.5, -14, 2.6, 3.6, 0, 0, TAU); ctx.fill();
      // 张开的大嘴（上下獠牙）
      const mg = 2.5 + Math.abs(Math.sin(e.t * .1)) * 2.5;
      ctx.fillStyle = '#0d0806';
      ctx.beginPath(); ctx.ellipse(1.5, -7, mg * .8, 4.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#efe6d2';
      ctx.beginPath(); ctx.moveTo(.2, -10.8); ctx.lineTo(1.5, -8.4); ctx.lineTo(2.8, -10.8); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(.6, -3.4); ctx.lineTo(1.8, -5.6); ctx.lineTo(3, -3.4); ctx.closePath(); ctx.fill();
      break;
    }
    case 'spider': {
      // 八条两段拱腿
      ctx.strokeStyle = '#241a22'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const bx = -4 + i * 3.2, lift = Math.sin(t * .3 + i * 1.6) * 2.5;
        for (const sgn of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(bx, 0);
          ctx.lineTo(bx + sgn * 7, -8 + lift * (i % 2 ? 1 : -1));
          ctx.lineTo(bx + sgn * 12, 6 + lift);
          ctx.stroke();
        }
      }
      // 大腹部（后）+ 菱形斑（提亮防与地板融为一体）
      ctx.fillStyle = '#5c4560';
      ctx.beginPath(); ctx.ellipse(-5, 1, 9.5, 8, -.15, 0, TAU); ctx.fill(); stroke();
      ctx.fillStyle = '#c9b287';
      ctx.beginPath(); ctx.moveTo(-5, -4.5); ctx.lineTo(-1, 1); ctx.lineTo(-5, 6.5); ctx.lineTo(-9, 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath(); ctx.ellipse(-7, -2, 3.5, 2, -.5, 0, TAU); ctx.fill();
      // 前体（小）
      ctx.fillStyle = '#75596e';
      ctx.beginPath(); ctx.ellipse(6, 0, 5.5, 4.5, 0, 0, TAU); ctx.fill(); stroke(1.4);
      // 螯肢 + 毒牙
      ctx.strokeStyle = '#57404f'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(10, -1); ctx.lineTo(13, 1); ctx.stroke();
      ctx.fillStyle = '#e8dcc8';
      ctx.beginPath(); ctx.moveTo(12.5, 1); ctx.lineTo(14.5, 4.5); ctx.lineTo(11.5, 3); ctx.fill();
      // 眼簇 4+2
      ctx.fillStyle = '#ffdede';
      for (const [ex, ey, r] of [[7, -2.6, 1.5], [9.5, -1.6, 1.2], [6.4, -.6, 1.1], [9, .4, 1], [4.5, -3.2, 1], [2.5, -3.4, .9]]) {
        ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#20101a';
      ctx.beginPath(); ctx.arc(7.2, -2.6, .7, 0, TAU); ctx.fill();
      break;
    }
    case 'hopper': {
      const air = e.state === 'air';
      const sq = air ? .78 : 1 + Math.sin(t * .12) * .05;
      ctx.scale(1 / sq, sq);
      // 折叠后腿（Z 字）
      ctx.strokeStyle = '#7e434b'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sgn * 9, 2);
        ctx.lineTo(sgn * 14, air ? 8 : -4);
        ctx.lineTo(sgn * 10, 11);
        ctx.stroke();
      }
      // 宽扁躯干 + 浅腹
      ctx.fillStyle = '#a05860';
      ctx.beginPath(); ctx.ellipse(0, 2, e.cfg.r * 1.15, e.cfg.r * .8, 0, 0, TAU); ctx.fill(); stroke();
      ctx.fillStyle = '#c9888e';
      ctx.beginPath(); ctx.ellipse(0, 6, e.cfg.r * .8, e.cfg.r * .4, 0, 0, Math.PI); ctx.fill();
      // 前撑腿
      ctx.strokeStyle = '#7e434b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-5, 8); ctx.lineTo(-6, 12); ctx.moveTo(5, 8); ctx.lineTo(6, 12); ctx.stroke();
      // 宽嘴线
      ctx.strokeStyle = '#4a2226'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(0, 3.5, 9, 0); ctx.stroke();
      // 头顶鼓眼
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = '#b86a70';
        ctx.beginPath(); ctx.arc(sgn * 6, -e.cfg.r * .72, 4.6, 0, TAU); ctx.fill(); stroke(1.2);
        ctx.fillStyle = '#fff2e6'; ctx.beginPath(); ctx.arc(sgn * 6, -e.cfg.r * .72, 2.8, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1c1214'; ctx.beginPath(); ctx.arc(sgn * 6 + .8, -e.cfg.r * .72, 1.4, 0, TAU); ctx.fill();
      }
      break;
    }
    case 'splitter': {
      // 主体 + 三个鼓胀脓包（淡核）
      ctx.fillStyle = '#8f4a52';
      ctx.beginPath(); ctx.arc(0, 2, e.cfg.r, 0, TAU); ctx.fill(); stroke(1.8);
      for (const [bx, by, br] of [[-8, -6, 6.5], [7, -4, 5.5], [2, 9, 5]]) {
        ctx.fillStyle = '#a85a62';
        ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill(); stroke(1.2);
        ctx.fillStyle = '#f2d8b8';
        ctx.beginPath(); ctx.arc(bx, by, br * .45, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(60,15,20,.5)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(-8, -6); ctx.quadraticCurveTo(-2, -2, 2, 9); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(7, -4); ctx.quadraticCurveTo(3, 2, 2, 9); ctx.stroke();
      // 小脸
      ctx.fillStyle = '#2a0d10';
      ctx.beginPath(); ctx.arc(-3, 2, 1.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3, 2, 1.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0, 6.5, 2.6, 1.6, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'minifly': {
      const fl = Math.sin(t * 1.3);
      ctx.fillStyle = 'rgba(210,220,235,.5)';
      for (const sgn of [-1, 1]) {
        ctx.save(); ctx.translate(0, -4); ctx.rotate(sgn * (.5 + fl * .3));
        ctx.beginPath(); ctx.ellipse(sgn * 5, 0, 6.5, 2.4, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
      ctx.fillStyle = '#6c4a8a';
      ctx.beginPath(); ctx.ellipse(-1, 1, e.cfg.r, e.cfg.r * .8, .3, 0, TAU); ctx.fill(); stroke(1.2);
      ctx.fillStyle = '#ffd0d0';
      ctx.beginPath(); ctx.arc(3, -2, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(3.5, -2, .9, 0, TAU); ctx.fill();
      break;
    }
    case 'turret': {
      const rot = (e.t * .05) % (Math.PI / 2);
      // 铁座 + 铆钉
      ctx.fillStyle = '#37352f';
      ctx.beginPath(); ctx.roundRect(-15, -2, 30, 18, 4); ctx.fill(); stroke(1.8);
      ctx.fillStyle = '#8a857c';
      for (const [rx, ry] of [[-11, 12], [11, 12], [-11, 1], [11, 1]]) { ctx.beginPath(); ctx.arc(rx, ry, 1.6, 0, TAU); ctx.fill(); }
      // 四喷嘴（深色炮口环）
      ctx.save(); ctx.translate(0, 2); ctx.rotate(rot);
      for (let i = 0; i < 4; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 2);
        ctx.fillStyle = '#4c4a45'; ctx.fillRect(-3.4, -e.cfg.r - 6, 6.8, 12);
        ctx.strokeStyle = OL; ctx.lineWidth = 1.4; ctx.strokeRect(-3.4, -e.cfg.r - 6, 6.8, 12);
        ctx.fillStyle = '#141210'; ctx.beginPath(); ctx.arc(0, -e.cfg.r - 6, 3, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
      // 琥珀镜头眼
      ctx.fillStyle = '#1e1c18'; ctx.beginPath(); ctx.arc(0, 2, 6.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8a83a'; ctx.beginPath(); ctx.arc(0, 2, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#241a08'; ctx.beginPath(); ctx.arc(0, 2, 2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(-1.6, .6, 1.2, 0, TAU); ctx.fill();
      break;
    }
    case 'spreader': {
      // 六足
      ctx.strokeStyle = '#232c18'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const lx = -6 + i * 6, lift = Math.sin(t * .3 + i) * 2;
        for (const sgn of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(lx, sgn * 6);
          ctx.lineTo(lx + sgn * 3, sgn * (12 + lift)); ctx.stroke();
        }
      }
      // 鞘翅（中缝 + 垄纹）
      ctx.fillStyle = '#4e6b2e';
      ctx.beginPath(); ctx.ellipse(-2, 0, e.cfg.r * 1.1, e.cfg.r * .92, 0, 0, TAU); ctx.fill(); stroke(1.8);
      ctx.strokeStyle = '#2c3f1a'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-2, -e.cfg.r * .9); ctx.lineTo(-2, e.cfg.r * .9); ctx.stroke();
      for (const sgn of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(-2, sgn * 4, e.cfg.r * .8, 1.6, 0, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(-2, sgn * 8, e.cfg.r * .55, 1.4, 0, 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.ellipse(-6, -5, 4.5, 2.6, -.5, 0, TAU); ctx.fill();
      // 前胸背板 + 头
      ctx.fillStyle = '#6b8a42';
      ctx.beginPath(); ctx.ellipse(9, 0, 5.5, 6, 0, 0, TAU); ctx.fill(); stroke(1.3);
      // 大颚
      ctx.strokeStyle = '#c96f4a'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(13, -2.5); ctx.quadraticCurveTo(17, -1.5, 15.5, 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(13, 2.5); ctx.quadraticCurveTo(17, 1.5, 15.5, -1); ctx.stroke();
      // 触角 + 眼
      ctx.strokeStyle = '#2c3f1a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(12, -4); ctx.quadraticCurveTo(17, -8, 20, -7); ctx.stroke();
      ctx.fillStyle = '#fff8e0'; ctx.beginPath(); ctx.arc(10.5, -3, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#222a14'; ctx.beginPath(); ctx.arc(11, -3, .9, 0, TAU); ctx.fill();
      break;
    }
    case 'bat': {
      const flap = Math.sin(t * .5) * .5;
      // 双翼（膜状扇贝边）
      ctx.fillStyle = '#3d2b45';
      for (const sgn of [-1, 1]) {
        ctx.save(); ctx.rotate(sgn * (.2 + flap * sgn));
        ctx.beginPath();
        ctx.moveTo(sgn * 4, -2);
        ctx.quadraticCurveTo(sgn * 16, -12, sgn * 20, -2);
        ctx.quadraticCurveTo(sgn * 16, -1, sgn * 15, 4);
        ctx.quadraticCurveTo(sgn * 11, 0, sgn * 9, 5);
        ctx.quadraticCurveTo(sgn * 6, 1, sgn * 4, -2);
        ctx.fill(); ctx.restore();
      }
      // 身体 + 尖耳 + 红眼 + 獠牙
      ctx.fillStyle = '#57405f';
      ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 8.5, 0, 0, TAU); ctx.fill(); stroke(1.4);
      ctx.beginPath(); ctx.moveTo(-5, -7); ctx.lineTo(-7, -14); ctx.lineTo(-1.5, -8.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(5, -7); ctx.lineTo(7, -14); ctx.lineTo(1.5, -8.5); ctx.fill();
      ctx.fillStyle = '#ff4a4a';
      ctx.beginPath(); ctx.arc(-2.8, -2, 1.7, 0, TAU); ctx.arc(2.8, -2, 1.7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f0e6e6';
      ctx.beginPath(); ctx.moveTo(-2, 3); ctx.lineTo(-1, 6); ctx.lineTo(-.2, 3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, 3); ctx.lineTo(1, 6); ctx.lineTo(.2, 3); ctx.fill();
      break;
    }
    case 'mushroom': {
      const pulse = 1 + Math.sin(t * .1) * .04;
      // 菌柄
      ctx.fillStyle = '#d8cba8';
      ctx.beginPath(); ctx.roundRect(-6, -2, 12, 14, 4); ctx.fill(); stroke(1.2);
      ctx.fillStyle = '#2a1d14'; // 小脸
      ctx.beginPath(); ctx.arc(-2.5, 4, 1.2, 0, TAU); ctx.arc(2.5, 4, 1.2, 0, TAU); ctx.fill();
      // 菌盖（白点斑）
      ctx.save(); ctx.scale(pulse, 1 / pulse);
      ctx.fillStyle = '#b04048';
      ctx.beginPath(); ctx.ellipse(0, -4, 14, 9.5, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); stroke(1.6);
      ctx.fillStyle = '#f0e6d0';
      for (const [sx, sy, sr] of [[-7, -8, 2.4], [0, -11, 2.8], [7, -7, 2.2], [3, -6, 1.6]]) {
        ctx.beginPath(); ctx.arc(sx, sy, sr, 0, TAU); ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'bone': {
      const wig = Math.sin(t * .2) * .3;
      // 三节尾段
      ctx.fillStyle = '#c9c2ae';
      for (let i = 2; i >= 1; i--) {
        ctx.save(); ctx.rotate(wig * i * .5);
        ctx.beginPath(); ctx.ellipse(-i * 9, i * 1.5, 6.5 - i, 5 - i * .8, .2 * i, 0, TAU); ctx.fill(); stroke(1.1);
        ctx.restore();
      }
      // 骷髅头
      ctx.fillStyle = '#e8e2d0';
      ctx.beginPath(); ctx.ellipse(3, 0, 9.5, 8, -.1, 0, TAU); ctx.fill(); stroke(1.5);
      ctx.fillStyle = '#241a12'; // 眼窝
      ctx.beginPath(); ctx.ellipse(1, -2.5, 2.4, 3, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(6.5, -2.5, 2.4, 3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff5a4a'; // 眼中火
      ctx.beginPath(); ctx.arc(1.4, -2.5, 1, 0, TAU); ctx.arc(6.9, -2.5, 1, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#241a12'; ctx.lineWidth = 1.4; // 齿缝
      ctx.beginPath(); ctx.moveTo(-1, 5); ctx.lineTo(8, 5.5); ctx.moveTo(1.5, 3.6); ctx.lineTo(1.8, 6.6); ctx.moveTo(4.5, 3.8); ctx.lineTo(4.8, 6.8); ctx.moveTo(7, 4); ctx.lineTo(7.3, 6.9); ctx.stroke();
      if (e.state === 'wind' && e.spawnT <= 0) { // 蓄力警示
        ctx.strokeStyle = `rgba(255,80,60,${.4 + Math.sin(t * .8) * .3})`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, e.r + 6, 0, TAU); ctx.stroke();
      }
      break;
    }
    case 'eye': {
      const fl = Math.sin(t * .07) * 2;
      ctx.translate(0, fl);
      // 血丝球体
      ctx.fillStyle = '#e8e2d8';
      ctx.beginPath(); ctx.arc(0, 0, e.cfg.r, 0, TAU); ctx.fill(); stroke(1.6);
      ctx.strokeStyle = 'rgba(180,50,50,.5)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3 + .4;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * e.cfg.r * .95, Math.sin(a) * e.cfg.r * .95);
        ctx.quadraticCurveTo(Math.cos(a + .4) * 7, Math.sin(a + .4) * 7, 2, -1); ctx.stroke();
      }
      // 瞳孔朝向玩家
      const pa = Math.atan2(game.player ? game.player.y - e.y : 0, game.player ? game.player.x - e.x : 1);
      ctx.fillStyle = '#2a4a8a';
      ctx.beginPath(); ctx.arc(Math.cos(pa) * 4, Math.sin(pa) * 4, 6.5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0a0a12';
      ctx.beginPath(); ctx.arc(Math.cos(pa) * 4, Math.sin(pa) * 4, 3.2, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.beginPath(); ctx.arc(Math.cos(pa) * 4 - 2, Math.sin(pa) * 4 - 2.4, 1.5, 0, TAU); ctx.fill();
      // 浮动小尾
      ctx.fillStyle = 'rgba(232,226,216,.6)';
      ctx.beginPath(); ctx.ellipse(-e.cfg.r * .9, 6 - fl, 4, 2.5, .5, 0, TAU); ctx.fill();
      break;
    }
    case 'ghost': {
      ctx.globalAlpha *= .85;
      const wob = Math.sin(t * .1) * 2;
      ctx.fillStyle = '#cfd4e8';
      ctx.beginPath();
      ctx.arc(0, -2, e.cfg.r, Math.PI, 0);
      ctx.lineTo(e.cfg.r, e.cfg.r * .7);
      for (let i = 0; i < 4; i++)
        ctx.quadraticCurveTo(e.cfg.r - i * 7.5 - 3.7, e.cfg.r * .7 + (i % 2 ? 6 + wob : -2 - wob), e.cfg.r - (i + 1) * 7.5, e.cfg.r * .7);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(120,130,170,.6)'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.fillStyle = '#2a2540';
      ctx.beginPath(); ctx.ellipse(-5, -4, 3, 4.4, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5, -4, 3, 4.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(160,140,255,.5)';
      ctx.beginPath(); ctx.arc(-5, -4, 1.2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(5, -4, 1.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a2540';
      ctx.beginPath(); ctx.ellipse(0, 5, 3.4, 2.4 + Math.abs(Math.sin(t * .08)) * 2.4, 0, 0, TAU); ctx.fill();
      break;
    }
  }
  // 受击闪白
  if (e.flash > 0) {
    ctx.globalAlpha = e.flash / 8;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, e.cfg.r + 2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function eyePair(ctx, cx, cy, r, w, b) {
  ctx.fillStyle = w;
  ctx.beginPath(); ctx.arc(cx - r - 1.5, cy, r, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r + 1.5, cy, r, 0, TAU); ctx.fill();
  ctx.fillStyle = b;
  ctx.beginPath(); ctx.arc(cx - r - 1.5, cy, r * .5, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + r + 1.5, cy, r * .5, 0, TAU); ctx.fill();
}

// ── Boss ──
function drawBoss(ctx, b, t) {
  // 蓄力预警：dash 画冲锋危险带；hop 画落点红圈
  if (b.act === 'tele' && b.teleKind === 'hop') {
    const pulse = .2 + Math.abs(Math.sin(t * .25)) * .4;
    ctx.save(); ctx.translate(0, HUD_H);
    ctx.strokeStyle = `rgba(255,90,60,${pulse + .3})`; ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.arc(b.hopTo.x, b.hopTo.y, b.r * .9, t * .05, t * .05 + TAU); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(220,60,40,${pulse * .45})`;
    ctx.beginPath(); ctx.arc(b.hopTo.x, b.hopTo.y, b.r * .9, 0, TAU); ctx.fill();
    ctx.restore();
  }
  if (b.act === 'tele' && b.teleKind === 'dash') {
    const dirX = b.vx ? Math.sign(b.vx) : 0, dirY = b.vy ? Math.sign(b.vy) : 0;
    const horiz = dirX !== 0;
    const len = horiz ? (dirX > 0 ? ROOM_W - b.x : b.x) : (dirY > 0 ? ROOM_H - b.y : b.y);
    const pulse = .18 + Math.abs(Math.sin(t * .3)) * .34;
    ctx.save(); ctx.translate(0, HUD_H);
    const w2 = b.r * 1.7;
    if (horiz) { ctx.fillStyle = `rgba(220,60,40,${pulse})`; ctx.fillRect(dirX > 0 ? b.x : b.x - len, b.y - w2 / 2, len, w2); }
    else { ctx.fillStyle = `rgba(220,60,40,${pulse})`; ctx.fillRect(b.x - w2 / 2, dirY > 0 ? b.y : b.y - len, w2, len); }
    ctx.strokeStyle = `rgba(255,220,120,${pulse + .2})`; ctx.lineWidth = 2; ctx.setLineDash([9, 7]);
    if (horiz) ctx.strokeRect(dirX > 0 ? b.x : b.x - len, b.y - w2 / 2, len, w2);
    else ctx.strokeRect(b.x - w2 / 2, dirY > 0 ? b.y : b.y - len, w2, len);
    ctx.setLineDash([]); ctx.restore();
  }
  ctx.save(); ctx.translate(b.x, b.y + HUD_H);
  const breathe = 1 + Math.sin(t * .06) * .03;
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(0, b.cfg.r * .75, b.cfg.r * .85, 8, 0, 0, TAU); ctx.fill();

  if (b.cfg.arch === 'glutton') {
    ctx.scale(breathe, 2 - breathe);
    const bodyC = b.cfg.id === 'the_maw' ? '#241426' : '#c07a5e';
    // 落地投影把 Boss 从地板里"抬"出来
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.ellipse(3, b.cfg.r * .82, b.cfg.r * .95, 12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = bodyC;
    ctx.strokeStyle = 'rgba(30,10,8,.8)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, b.cfg.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = b.cfg.id === 'the_maw' ? '#3d2444' : '#a55f45';
    ctx.beginPath(); ctx.arc(b.cfg.r * .3, -b.cfg.r * .25, b.cfg.r * .75, 0, TAU); ctx.fill();
    // 病态疣斑
    ctx.fillStyle = 'rgba(255,225,200,.25)';
    for (const [bx, by, br] of [[-.5, .35, .1], [.45, -.45, .08], [-.25, -.6, .07]]) {
      ctx.beginPath(); ctx.arc(b.cfg.r * bx, b.cfg.r * by, b.cfg.r * br, 0, TAU); ctx.fill();
    }
    if (b.cfg.id === 'the_maw') { // 深渊之颚：紫黑漩涡
      ctx.strokeStyle = '#6e4a86'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, b.cfg.r * .7, t * .02, t * .02 + 4); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, b.cfg.r * .45, -t * .03, -t * .03 + 3); ctx.stroke();
    }
    // 嘴
    const open = b.act === 'spit' || b.act === 'radial' ? 1 : .35;
    const mh = b.cfg.r * .5 * open;
    ctx.fillStyle = '#2a0d0d';
    ctx.beginPath(); ctx.ellipse(0, b.cfg.r * .25, b.cfg.r * .62, mh, 0, 0, TAU); ctx.fill();
    // 牙
    ctx.fillStyle = '#e8dcc8';
    const teeth = 7;
    for (let i = 0; i < teeth; i++) {
      const a = -Math.PI + (i + .5) * Math.PI / teeth;
      const tx = Math.cos(a) * b.cfg.r * .58, ty = b.cfg.r * .25 + Math.sin(a) * mh * .92;
      ctx.beginPath(); ctx.moveTo(tx - 4, ty - 3); ctx.lineTo(tx + 4, ty - 3); ctx.lineTo(tx, ty + 5); ctx.fill();
    }
    // 舌
    if (open > .5) { ctx.fillStyle = '#8a3b47'; ctx.beginPath(); ctx.ellipse(Math.sin(t * .2) * 6, b.cfg.r * .42, 12, 7, 0, 0, TAU); ctx.fill(); }
    // 眼
    eyePair(ctx, 0, -b.cfg.r * .55, b.cfg.r * .13, '#f5efe2', '#2a1010');
  } else if (b.cfg.arch === 'brood') {
    // 蛛后：八条带关节的长腿 + 两段躯体 + 须肢毒牙
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) for (const sgn of [-1, 1]) {
      const ph = Math.sin(t * .18 + i * 1.4) * 8;
      ctx.strokeStyle = '#241a22'; ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(sgn * 20, i * 8 - 18);
      ctx.lineTo(sgn * (46 + i * 6), i * 16 - 34 + ph);
      ctx.stroke();
      ctx.strokeStyle = '#3d2c3a'; ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(sgn * (46 + i * 6), i * 16 - 34 + ph);
      ctx.lineTo(sgn * (58 + i * 6), i * 14 - 6 + ph * .5);
      ctx.stroke();
      ctx.fillStyle = '#120c10'; // 腿尖
      ctx.beginPath(); ctx.arc(sgn * (58 + i * 6), i * 14 - 5 + ph * .5, 2.6, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#4a3550';
    ctx.beginPath(); ctx.ellipse(0, 8, b.cfg.r * .8, b.cfg.r * .62, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(12,6,12,.85)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#a89468'; // 腹部斑纹
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(10, 8); ctx.lineTo(0, 26); ctx.lineTo(-10, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(60,45,25,.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#6b4d6f';
    ctx.beginPath(); ctx.arc(0, -b.cfg.r * .5, b.cfg.r * .42, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(12,6,12,.7)'; ctx.lineWidth = 3.5; ctx.stroke();
    // 须肢 + 大毒牙
    ctx.strokeStyle = '#6b4d6f'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-10, -b.cfg.r * .32); ctx.lineTo(-14, -b.cfg.r * .1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -b.cfg.r * .32); ctx.lineTo(14, -b.cfg.r * .1); ctx.stroke();
    ctx.fillStyle = '#e8dcc8';
    ctx.beginPath(); ctx.moveTo(-9, -b.cfg.r * .28); ctx.quadraticCurveTo(-6, -b.cfg.r * .1, -3, -b.cfg.r * .24); ctx.lineTo(-4.5, -b.cfg.r * .3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(9, -b.cfg.r * .28); ctx.quadraticCurveTo(6, -b.cfg.r * .1, 3, -b.cfg.r * .24); ctx.lineTo(4.5, -b.cfg.r * .3); ctx.fill();
    ctx.fillStyle = '#c94a4a';
    for (const [dx, dy] of [[-8, -6], [8, -6], [-13, 0], [13, 0]])
      { ctx.beginPath(); ctx.arc(dx, -b.cfg.r * .52 + dy, 3, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#2a1520';
    ctx.beginPath(); ctx.ellipse(0, -b.cfg.r * .32, 7, 3 + (b.act === 'dash' ? 4 : 1), 0, 0, TAU); ctx.fill();
  }
  if (b.flash > 0) {
    ctx.globalAlpha = b.flash / 8; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, b.cfg.r + 3, 0, TAU); ctx.fill();
  }
  ctx.restore();

  // Boss 血条（整体下移，名牌不再被 HUD 底边裁切）
  const pct = clamp(b.hp / b.maxHp, 0, 1);
  const bw = 360, bx = (ROOM_W - bw) / 2, by = HUD_H + 12;
  ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(bx - 3, by - 16, bw + 6, 29); // 底衬罩住名牌，避免与北门贴图叠字
  ctx.fillStyle = '#3d1515'; ctx.fillRect(bx, by, bw, 10);
  ctx.fillStyle = pct > .5 ? '#a63a2e' : '#7c2318';
  ctx.fillRect(bx, by, bw * pct, 10);
  ctx.fillStyle = '#e8c85e';
  ctx.font = '11px monospace'; ctx.textAlign = 'center';
  ctx.fillText(b.cfg.name, ROOM_W / 2, by - 5);
}

// ── 拾取物 ──
function drawPickup(ctx, pk, t) {
  const bob = Math.sin(t * .08 + pk.x) * 2.5;
  ctx.save(); ctx.translate(pk.x, pk.y + HUD_H + bob);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, 12 - bob, 9, 3, 0, 0, TAU); ctx.fill();
  switch (pk.kind) {
    case 'heart': case 'halfheart': drawHeartShape(ctx, 0, 0, 11, pk.kind === 'halfheart'); break;
    case 'coin':
      ctx.fillStyle = '#d9a92e'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#9a7517'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#f5d873'; ctx.beginPath(); ctx.arc(-2.5, -2.5, 4, 0, TAU); ctx.fill();
      break;
    case 'key':
      ctx.strokeStyle = '#c9c2b0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(-3, -5, 4.5, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(6, 7); ctx.moveTo(4, 5); ctx.lineTo(7, 2.5); ctx.stroke();
      break;
    case 'chest':
      ctx.fillStyle = '#7a4c26'; ctx.beginPath(); ctx.roundRect(-13, -6, 26, 18, 3); ctx.fill();
      ctx.fillStyle = '#9a6432'; ctx.beginPath(); ctx.roundRect(-13, -12, 26, 8, 3); ctx.fill();
      ctx.strokeStyle = '#d9a92e'; ctx.lineWidth = 2.5;
      ctx.strokeRect(-13, -12, 26, 24);
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(0, 12); ctx.stroke();
      ctx.fillStyle = '#e8c85e'; ctx.beginPath(); ctx.arc(0, -1, 3.5, 0, TAU); ctx.fill();
      break;
    case 'item': case 'weapon':
      // 光晕 + 悬浮道具/武器
      const wcol = pk.kind === 'weapon' ? WEAPONS[pk.wid].c : itemColor(pk.item);
      const glow = .35 + Math.sin(t * .09) * .12;
      const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 34);
      g.addColorStop(0, withAlpha(wcol.length === 7 ? wcol : '#ffffff', glow)); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 34, 0, TAU); ctx.fill();
      if (pk.kind === 'weapon') {
        const wd = WEAPONS[pk.wid];
        ctx.fillStyle = '#1c1410';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
        ctx.strokeStyle = wd.c; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.stroke();
        ctx.fillStyle = wd.c; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
        ctx.fillText(wd.glyph, 0, 5);
      } else drawItemIcon(ctx, pk.item, 0, 0, t);
      break;
  }
  // 商店价签
  if (pk.price > 0) {
    const afford = game.player && game.player.coins >= pk.price;
    const flashing = pk.denyCd > 30 && Math.floor(t / 3) % 2 === 0;
    ctx.fillStyle = flashing || !afford ? 'rgba(80,16,16,.9)' : 'rgba(20,14,8,.88)';
    ctx.beginPath(); ctx.roundRect(-15, -36, 30, 15, 4); ctx.fill();
    ctx.strokeStyle = afford && !flashing ? '#d9a92e' : '#8a3030';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#d9a92e';
    ctx.beginPath(); ctx.arc(-7, -28.5, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = flashing || !afford ? '#e08080' : '#f0e6c8';
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left';
    ctx.fillText(String(pk.price), 0, -25);
  }
  ctx.restore();
}

function drawHeartShape(ctx, x, y, s, half) {
  ctx.save(); ctx.translate(x, y);
  if (half) { ctx.beginPath(); ctx.rect(-s, -s, s, s * 2); ctx.clip(); }
  ctx.fillStyle = '#c4303a';
  ctx.beginPath();
  ctx.moveTo(0, s * .75);
  ctx.bezierCurveTo(-s * 1.1, s * .05, -s * .8, -s * .85, 0, -s * .3);
  ctx.bezierCurveTo(s * .8, -s * .85, s * 1.1, s * .05, 0, s * .75);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.ellipse(-s * .35, -s * .25, s * .18, s * .12, -.6, 0, TAU); ctx.fill();
  ctx.restore();
}

function itemColor(item) { return item ? item.color : '#c9c9c9'; }

function drawResIcon(ctx, kind, x, y, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(.9, .9);
  if (kind === 'coin') {
    ctx.fillStyle = '#d9a92e'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#9a7517'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#f5d873'; ctx.beginPath(); ctx.arc(-2.5, -2.5, 4, 0, TAU); ctx.fill();
  } else if (kind === 'key') {
    ctx.strokeStyle = '#c9c2b0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-3, -5, 4.5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(6, 7); ctx.moveTo(4, 5); ctx.lineTo(7, 2.5); ctx.stroke();
  } else if (kind === 'dash') {
    ctx.strokeStyle = '#7fb2e8'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      ctx.beginPath(); ctx.moveTo(-7 + i * 7, -7); ctx.lineTo(-2 + i * 7, 0); ctx.lineTo(-7 + i * 7, 7); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawItemIcon(ctx, item, x, y, t) {
  ctx.save(); ctx.translate(x, y);
  const c = item.color;
  switch (item.id) {
    case 'eye3':
      ctx.fillStyle = '#f2ece0'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
      break;
    case 'big':
      ctx.fillStyle = c; ctx.beginPath();
      ctx.moveTo(0, -12); ctx.quadraticCurveTo(10, 2, 0, 10); ctx.quadraticCurveTo(-10, 2, 0, -12); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(-3, 2, 2.5, 0, TAU); ctx.fill();
      break;
    case 'speed':
      ctx.fillStyle = c; ctx.beginPath();
      ctx.roundRect(-9, -4, 14, 8, 3); ctx.roundRect(2, 0, 8, 6, 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-7, -2, 5, 2);
      break;
    case 'yarn':
      ctx.strokeStyle = c; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(-2, 1, 5.5, .5, 4.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(2, -1, 5.5, 3.6, 7.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, 4); ctx.quadraticCurveTo(14, 8, 12, 12); ctx.stroke();
      break;
    case 'blood':
      ctx.fillStyle = c; ctx.beginPath();
      ctx.arc(0, 3, 8, 0, Math.PI); ctx.quadraticCurveTo(6, -4, 0, -11); ctx.quadraticCurveTo(-6, -4, -8, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,180,180,.6)'; ctx.beginPath(); ctx.arc(-3, 1, 2.4, 0, TAU); ctx.fill();
      break;
    case 'homing':
      ctx.fillStyle = '#1d2438'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 5, -.5, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(10, -5, 2.4, 0, TAU); ctx.fill();
      break;
    case 'wings':
      ctx.fillStyle = c;
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(sgn * 2, 8);
        ctx.quadraticCurveTo(sgn * 14, 2, sgn * 9, -9);
        ctx.quadraticCurveTo(sgn * 4, -3, sgn * 2, 8); ctx.fill();
      }
      break;
    case 'lucky':
      ctx.fillStyle = c;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * 6, Math.sin(a) * 6, 5, 5, 0, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = '#3a5a20'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(2, 12); ctx.stroke();
      break;
    case 'polaris': {
      ctx.fillStyle = c;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, r = i % 2 ? 4 : 11;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.fill(); break;
    }
  }
  ctx.restore();
}


// ── HUD ──
function drawHUD(ctx, g) {
  const p = g.player;
  ctx.save();
  ctx.fillStyle = '#0d0a08'; ctx.fillRect(0, 0, CANVAS_W, HUD_H - 4);

  // 心（2格=1颗整心，最多两行；行距收紧避免与资源行重叠）
  const hearts = p.hearts, maxH = Math.min(p.maxHearts, 20);
  if (p.maxHearts > 20) { ctx.fillStyle = '#c4303a'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'; ctx.fillText(`+${Math.ceil((p.maxHearts - 20) / 2)}♥`, 14 + 10 * 21 + 2, 20); }
  for (let i = 0; i < maxH; i++) {
    const hx = 14 + (i % 10) * 21, hy = 14 + Math.floor(i / 10) * 17;
    if (i * 2 + 2 <= hearts) drawHeartShape(ctx, hx, hy, 9, false);
    else if (i * 2 + 1 === hearts) drawHeartShape(ctx, hx, hy, 9, true);
    else { ctx.globalAlpha = .22; drawHeartShape(ctx, hx, hy, 9, false); ctx.globalAlpha = 1; }
  }

  // 金币 / 钥匙 / 冲刺CD（贴 HUD 底缘，与两行心形错开）
  const res = [['coin', p.coins], ['key', p.keys]];
  res.forEach(([kind, n], slot) => {
    const rx = 14 + slot * 40, ry = HUD_H - 8;
    drawResIcon(ctx, kind, rx, ry, g.time);
    ctx.fillStyle = '#cbb59a'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
    ctx.fillText('×' + n, rx + 10, ry + 4);
  });
  { // 冲刺槽：就绪呼吸亮，冷却画进度弧；附键位标注（半径收紧，环底不越 HUD 下缘）
    const rx = 14 + 2 * 40, ry = HUD_H - 15, ready = p.dashCd <= 0;
    ctx.save();
    if (!ready) ctx.globalAlpha = .45;
    drawResIcon(ctx, 'dash', rx, ry, g.time);
    ctx.restore();
    if (!ready) {
      ctx.strokeStyle = '#7fb2e8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(rx, ry, 9.5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / p.dashCdMax)); ctx.stroke();
    } else if (Math.floor(g.time / 24) % 2 === 0) {
      ctx.strokeStyle = 'rgba(127,178,232,.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(rx, ry, 10, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = '#6b5a48'; ctx.font = '9px monospace'; ctx.textAlign = 'left';
    ctx.fillText(Touch.supported() ? '冲刺' : 'Space', rx + 13, ry + 4);
  }

  // 层名横幅（渐变带 + 文字投影）
  const bg = ctx.createLinearGradient(ROOM_W / 2 - 90, 0, ROOM_W / 2 + 90, 0);
  bg.addColorStop(0, 'rgba(90,60,35,0)'); bg.addColorStop(.5, 'rgba(90,60,35,.35)'); bg.addColorStop(1, 'rgba(90,60,35,0)');
  ctx.fillStyle = bg; ctx.fillRect(ROOM_W / 2 - 90, 8, 180, 20);
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
  const fname = themePal(g.theme || THEMES[0], g.floorNum).name;
  ctx.fillText(fname, ROOM_W / 2 + 1.5, 23.5);
  ctx.fillStyle = '#d8b878';
  ctx.fillText(fname, ROOM_W / 2, 22);
  // M 键音乐状态即时反馈
  ctx.fillStyle = BGM.on ? '#7fae5a' : '#5a4c42'; ctx.font = '11px monospace';
  ctx.fillText(BGM.on ? '♪' : '♪×', ROOM_W / 2 + 62, 22);

  // 击杀/房间数
  ctx.fillStyle = '#5a4c42'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`击杀 ${g.kills}`, ROOM_W / 2 - 70, 44);
  ctx.fillText(`房间 ${g.roomsSeen}`, ROOM_W / 2 + 5, 44);

  // 引导/拒绝提示浮字（房间顶部，自动淡出）
  if (g.hint && g.hint.t > 0) {
    ctx.globalAlpha = clamp(g.hint.t / 40, 0, 1);
    ctx.fillStyle = 'rgba(10,6,4,.7)';
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    const w2 = ctx.measureText(g.hint.text).width + 26;
    ctx.beginPath(); ctx.roundRect(ROOM_W / 2 - w2 / 2, HUD_H + 52, w2, 24, 5); ctx.fill();
    ctx.fillStyle = '#f0d8a8';
    ctx.fillText(g.hint.text, ROOM_W / 2, HUD_H + 68);
    ctx.globalAlpha = 1;
  }

  // 道具获得提示（HUD 下方顶部条，不挡战斗区）
  if (g.toast && g.toast.t > 0) {
    const a = clamp(g.toast.t / 30, 0, 1);
    const ty = HUD_H + 30; // 下移避开 Boss 血条带
    ctx.globalAlpha = a;
    const tg = ctx.createLinearGradient(0, ty, 0, ty + 40);
    tg.addColorStop(0, 'rgba(24,15,10,.94)'); tg.addColorStop(1, 'rgba(14,9,6,.88)');
    ctx.fillStyle = tg;
    ctx.beginPath(); ctx.roundRect(ROOM_W / 2 - 158, ty, 316, 40, 6); ctx.fill();
    ctx.strokeStyle = g.toast.item.color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(ROOM_W / 2 - 158, ty, 316, 40, 6); ctx.stroke();
    drawItemIcon(ctx, g.toast.item, ROOM_W / 2 - 136, ty + 20, g.time);
    ctx.fillStyle = '#f0e6d8'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
    ctx.fillText(g.toast.item.name, ROOM_W / 2 - 112, ty + 16);
    ctx.fillStyle = '#b09a80'; ctx.font = '11px monospace';
    ctx.fillText(g.toast.item.desc, ROOM_W / 2 - 112, ty + 32);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawMinimapAt(ctx, g, mx, my) {
  const cell = 18, pad = 4, sz = cell + pad;
  const rooms = [...g.floor.rooms.values()];
  // 按房间包围盒在面板宽度内水平居中，垂直从 my 起
  let minGx = 9, maxGx = 0, minGy = 9, maxGy = 0;
  for (const r of rooms) {
    if (r.gx < minGx) minGx = r.gx; if (r.gx > maxGx) maxGx = r.gx;
    if (r.gy < minGy) minGy = r.gy; if (r.gy > maxGy) maxGy = r.gy;
  }
  const totalW = (maxGx - minGx + 1) * sz - pad;
  const ox = mx + (PANEL_W - 24 - totalW) / 2 - minGx * sz;
  const oy = my + 8 - minGy * sz;
  for (const room of rooms) {
    const adj = room.visited || DIRS.some(d => room.links[d] && g.floor.rooms.get(room.links[d]).visited);
    if (!adj) continue;
    const x = ox + room.gx * sz, y = oy + room.gy * sz;
    let c = '#4a3f36';
    if (room.visited) c = '#6b5b4a';
    if (room.type === 'boss') c = room.visited ? '#8a3a30' : '#5a2620';
    if (room.type === 'treasure') c = '#6b5a26';
    if (room.type === 'shop') c = '#3a5a6a';
    if (room.type === 'start') c = '#4a5a3a';
    if (room.type === 'normal' && !room.cleared) { // 越深的普通房越红：一眼看出哪里现在别进
      const d = clamp((room.dist || 0) / 4, 0, 1);
      c = `rgb(${Math.round(64 + d * 106)},${Math.round(96 - d * 56)},${Math.round(56 - d * 24)})`;
    }
    ctx.fillStyle = c; ctx.fillRect(x, y, cell, cell);
    if (room === g.cur) {
      ctx.fillStyle = '#d8cba8'; ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = '#8a3a30'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    }
    if (room.type === 'boss' && room.visited) {
      drawSkull(ctx, x + cell / 2, y + cell / 2, cell * .32);
    }
  }
}

// 暗角
// 暗角（只罩房间区，不吞侧栏）
function drawVignette(ctx, g) {
  const grd = ctx.createRadialGradient(ROOM_W / 2, HUD_H + ROOM_H / 2, ROOM_H * .35, ROOM_W / 2, HUD_H + ROOM_H / 2, ROOM_W * .62);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.save();
  ctx.beginPath(); ctx.rect(0, HUD_H, ROOM_W, ROOM_H); ctx.clip();
  ctx.fillStyle = grd; ctx.fillRect(0, HUD_H, ROOM_W, ROOM_H);
  ctx.fillStyle = themePal(g.theme || THEMES[0], g.floorNum).tint;
  ctx.fillRect(0, HUD_H, ROOM_W, ROOM_H);
  ctx.restore();
}

// ── 菜单区域（触摸点选判定）──
function inZone(p, z) { return z && p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h; }
function minimapZone() { return { x: ROOM_W + 12, y: 88, w: PANEL_W - 24, h: 148 }; } // 点侧栏小地图 → 放大地图
function mapCloseZone() { return { x: CANVAS_W - 46, y: HUD_H + 6, w: 38, h: 38 }; }
// 标题/结算页绘制时 translate(PANEL_W/2)，命中区需同步平移到屏幕真实坐标
function workshopBtnZone() { return { x: CANVAS_W / 2 - 96 + PANEL_W / 2, y: 444, w: 192, h: 32 }; }
function charZones() {
  const n = CHARS.length, cw = 84, gap = 14, total = n * cw + (n - 1) * gap, x0 = ROOM_W / 2 - total / 2;
  return CHARS.map((_, i) => ({ x: x0 + i * (cw + gap), y: 244, w: cw, h: 92 }));
}
function backBtnZone() { return { x: CANVAS_W / 2 - 60, y: CANVAS_H - 44, w: 120, h: 30 }; }
function metaRowZone(i) { return { x: 90, y: 128 + i * 52, w: CANVAS_W - 180, h: 46 }; }
function levelCardZones() {
  const n = (game.levelChoices || []).length, cw = 190, gap = 26;
  const total = n * cw + (n - 1) * gap, x0 = CANVAS_W / 2 - total / 2; // 与全屏遮罩标题同轴居中
  return game.levelChoices.map((_, i) => ({ x: x0 + i * (cw + gap), y: 130, w: cw, h: 260 }));
}

// ── 升级三选一界面 ──
function drawLevelUp(ctx, g) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,4,3,.82)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#e8c85e'; ctx.font = 'bold 26px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`升 级 ！ Lv ${g.player.level}`, CANVAS_W / 2, 106);
  ctx.fillStyle = '#8a7360'; ctx.font = '12px monospace';
  ctx.fillText('选择一项强化（按 1 / 2 / 3 或点击卡片）', CANVAS_W / 2, 124);
  const zones = levelCardZones();
  g.levelChoices.forEach((u, i) => {
    const z = zones[i], lv = g.player.upLv[u.id] || 0;
    const hov = Touch.menuHover && inZone(Touch.menuHover, z);
    ctx.fillStyle = hov ? '#241a12' : '#1a130d';
    ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 8); ctx.fill();
    ctx.strokeStyle = u.c; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 8); ctx.stroke();
    // 字形徽记
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.arc(z.x + z.w / 2, z.y + 62, 34, 0, TAU); ctx.fill();
    ctx.strokeStyle = u.c; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(z.x + z.w / 2, z.y + 62, 34, 0, TAU); ctx.stroke();
    ctx.fillStyle = u.c; ctx.font = 'bold 38px monospace'; ctx.textAlign = 'center';
    ctx.fillText(u.glyph, z.x + z.w / 2, z.y + 76);
    ctx.fillStyle = '#f0e6d8'; ctx.font = 'bold 16px monospace';
    ctx.fillText(u.name, z.x + z.w / 2, z.y + 140);
    ctx.fillStyle = '#a08a70'; ctx.font = '12px monospace';
    const words = u.desc.split('');
    let line = '', ly = z.y + 168;
    for (const ch of words) {
      if (ctx.measureText(line + ch).width > z.w - 28) { ctx.fillText(line, z.x + z.w / 2, ly); line = ch; ly += 18; }
      else line += ch;
    }
    ctx.fillText(line, z.x + z.w / 2, ly);
    ctx.fillStyle = '#6b5340'; ctx.font = '11px monospace';
    ctx.fillText(`Lv ${lv} → ${lv + 1} / 上限 ${u.max}`, z.x + z.w / 2, z.y + z.h - 34);
    ctx.fillStyle = u.c; ctx.font = 'bold 14px monospace';
    ctx.fillText('[' + (i + 1) + ']', z.x + z.w / 2, z.y + z.h - 14);
  });
  ctx.restore();
}

// ── 锻造工坊（永久强化）──
function drawWorkshop(ctx, g) {
  const m = Meta.load();
  ctx.save();
  ctx.fillStyle = '#0d0a08'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const wg = ctx.createRadialGradient(CANVAS_W / 2, 60, 20, CANVAS_W / 2, 60, 400);
  wg.addColorStop(0, 'rgba(200,90,30,.12)'); wg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wg; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#d8b878'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
  ctx.fillText('锻 造 工 坊', CANVAS_W / 2, 56);
  ctx.fillStyle = '#b093e8'; ctx.font = 'bold 14px monospace';
  ctx.fillText(`魂 : ${m.souls}${g.soulsRun ? ' (本局 +' + g.soulsRun + ')' : ''}`, CANVAS_W / 2, 84);
  ctx.fillStyle = '#6b5340'; ctx.font = '11px monospace';
  ctx.fillText('魂在死亡时自动入库 · 永久生效 · 按 1-6 或点击购买', CANVAS_W / 2, 106);
  META_UPS.forEach((u, i) => {
    const z = metaRowZone(i), lv = m.up[u.id];
    const maxed = lv >= u.max, cost = maxed ? 0 : u.cost[lv];
    const afford = !maxed && m.souls >= cost;
    ctx.fillStyle = maxed ? 'rgba(40,32,22,.6)' : afford ? 'rgba(30,22,14,.9)' : 'rgba(18,13,9,.8)';
    ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 6); ctx.fill();
    ctx.strokeStyle = afford ? u.c : '#3a2e24'; ctx.lineWidth = afford ? 1.8 : 1;
    ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 6); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.fillStyle = afford ? '#f0e6d8' : '#6b5a4a'; ctx.font = 'bold 15px monospace';
    ctx.fillText(`[${i + 1}] ${u.name}`, z.x + 14, z.y + 21);
    ctx.fillStyle = '#a08a70'; ctx.font = '11px monospace';
    ctx.fillText(u.desc, z.x + 14, z.y + 38);
    // 等级点
    for (let k = 0; k < u.max; k++) {
      ctx.fillStyle = k < lv ? u.c : 'rgba(255,255,255,.1)';
      ctx.beginPath(); ctx.arc(z.x + z.w - 150 + k * 16, z.y + 23, 5, 0, TAU); ctx.fill();
    }
    ctx.textAlign = 'right'; ctx.font = 'bold 13px monospace';
    ctx.fillStyle = maxed ? '#7fae5a' : afford ? '#e8c85e' : '#8a5a4a';
    ctx.fillText(maxed ? '已满级' : cost + ' 魂', z.x + z.w - 14, z.y + 28);
  });
  const bz = backBtnZone();
  ctx.fillStyle = 'rgba(40,30,20,.9)';
  ctx.beginPath(); ctx.roundRect(bz.x, bz.y, bz.w, bz.h, 6); ctx.fill();
  ctx.strokeStyle = '#6b5340'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(bz.x, bz.y, bz.w, bz.h, 6); ctx.stroke();
  ctx.fillStyle = '#d8cba8'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
  ctx.fillText('返 回 (Esc)', CANVAS_W / 2, bz.y + 20);
  ctx.restore();
}

// 通用"锻造工坊"按钮（标题与结算页共用；调用方处于 translate(PANEL_W/2) 上下文，需还原屏幕坐标）
function drawWorkshopBtn(ctx, g) {
  const m = Meta.load(), z = workshopBtnZone(), zx = z.x - PANEL_W / 2;
  ctx.fillStyle = 'rgba(38,26,16,.95)';
  ctx.beginPath(); ctx.roundRect(zx, z.y, z.w, z.h, 6); ctx.fill();
  ctx.strokeStyle = '#b08a3a'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.roundRect(zx, z.y, z.w, z.h, 6); ctx.stroke();
  ctx.fillStyle = '#e8c85e'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center';
  ctx.fillText('⚒ 锻造工坊', zx + z.w / 2 + 8, z.y + 21);
  ctx.fillStyle = '#b093e8'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`魂 ${m.souls}`, zx + 8, z.y + 21);
}

function drawSidePanel(ctx, g) {
  const x0 = ROOM_W, p = g.player;
  ctx.save();
  ctx.fillStyle = '#120e0b'; ctx.fillRect(x0, 0, PANEL_W, CANVAS_H);
  ctx.fillStyle = '#2a201a'; ctx.fillRect(x0, 0, 2, CANVAS_H);

  ctx.fillStyle = '#6b5340'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
  ctx.fillText('地 图', x0 + 12, 82);
  drawMinimapAt(ctx, g, x0 + 12, 92);

  ctx.fillStyle = '#6b5340';
  ctx.fillText('属 性', x0 + 12, 238);
  if (p) {
    ctx.fillStyle = '#e8c85e'; ctx.textAlign = 'right';
    ctx.fillText(`Lv ${p.level}`, x0 + PANEL_W - 12, 238);
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = 'rgba(107,83,64,.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0 + 12, 244); ctx.lineTo(x0 + PANEL_W - 12, 244); ctx.stroke();
  if (!p) { ctx.restore(); return; }
  // 经验条
  ctx.fillStyle = 'rgba(107,83,64,.25)';
  ctx.beginPath(); ctx.roundRect(x0 + 12, 247, PANEL_W - 24, 3, 1.5); ctx.fill();
  ctx.fillStyle = '#5a8ab0';
  ctx.beginPath(); ctx.roundRect(x0 + 12, 247, Math.max(3, (PANEL_W - 24) * clamp(p.xp / p.xpNext, 0, 1)), 3, 1.5); ctx.fill();
  // 魂存量
  ctx.fillStyle = '#b093e8'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
  ctx.fillText(`魂 ${Meta.load().souls}`, x0 + PANEL_W - 12, 82);
  ctx.fillStyle = 'rgba(138,115,96,.5)'; ctx.font = '9px monospace';
  ctx.fillText(BUILD, x0 + PANEL_W - 6, CANVAS_H - 5); // 版本水印：截图即可判断新旧缓存
  ctx.textAlign = 'left';
  // 当前武器行
  const wd = WEAPONS[p.weapon ? p.weapon.id : 'tear'];
  ctx.fillStyle = '#8a7360'; ctx.font = '11px monospace';
  ctx.fillText('武器', x0 + 12, 392);
  ctx.fillStyle = wd.c; ctx.textAlign = 'right';
  ctx.fillText(`${wd.name} Lv${p.weapon ? p.weapon.lvl : 1}`, x0 + PANEL_W - 12, 392);
  ctx.textAlign = 'left';
  const wlvl = p.weapon ? p.weapon.lvl : 1;
  const wEffCd = Math.max(4, Math.round(wd.cd * (p.fireDelay / 13)));
  const wRange = wd.id === 'laser' ? (340 + 30 * wlvl) * (p.tearLife / 80)
    : wd.id === 'light' ? 280 * (p.tearLife / 80)
    : wd.id === 'flame' ? (24 + wlvl * 3) * p.tearSpeed * .89
    : p.tearSpeed * p.tearLife;
  const rows = [
    ['生命', `${Math.ceil(p.hearts / 2)}/${Math.ceil(p.maxHearts / 2)}`, p.hearts / Math.max(1, p.maxHearts), '#a8434a'],
    ['攻击', (p.dmg * wd.mult * (1 + .35 * (wlvl - 1))).toFixed(1), p.dmg / 14, '#b08a3a'],
    ['射速', (60 / wEffCd).toFixed(1) + '/秒', (60 / wEffCd) / 9.5, '#7d9cb8'],
    ['移速', p.speed.toFixed(2), p.speed / 5.5, '#6f8a4f'],
    ['射程', String(Math.round(wRange / 10) * 10), wRange / 900, '#8a6f9e'],
  ];
  rows.forEach(([k, v, frac, c], i) => {
    const y = 258 + i * 26;
    ctx.fillStyle = '#8a7360'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillText(k, x0 + 12, y + 4);
    ctx.fillStyle = '#e0d0b8'; ctx.textAlign = 'right';
    ctx.fillText(v, x0 + PANEL_W - 12, y + 4);
    ctx.fillStyle = 'rgba(107,83,64,.25)';
    ctx.beginPath(); ctx.roundRect(x0 + 12, y + 8, PANEL_W - 24, 5, 2.5); ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.roundRect(x0 + 12, y + 8, Math.max(4, (PANEL_W - 24) * clamp(frac, 0, 1)), 5, 2.5); ctx.fill();
  });

  // 道具栏
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6b5340'; ctx.font = 'bold 11px monospace';
  ctx.fillText(`物 件 (${p.items.length})`, x0 + 12, 418);
  if (!p.items.length) {
    ctx.fillStyle = '#6b5340'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('— 空手而来，空手而归 —', x0 + PANEL_W / 2, 456);
    ctx.restore(); return;
  }
  const shown = p.items.slice(0, 8);
  shown.forEach((it, i) => {
    const ix = x0 + 34 + (i % 4) * 56, iy = 440 + Math.floor(i / 4) * 28;
    ctx.fillStyle = 'rgba(107,83,64,.22)';
    ctx.beginPath(); ctx.roundRect(ix - 13, iy - 13, 26, 26, 4); ctx.fill();
    ctx.strokeStyle = '#2a201a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(ix - 13, iy - 13, 26, 26, 4); ctx.stroke();
    drawItemIcon(ctx, it, ix, iy, g.time);
  });
  if (p.items.length > 8) {
    ctx.fillStyle = '#8a7360'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    ctx.fillText(`+${p.items.length - 8}`, x0 + 34 + 3 * 56 + 16, 462);
  }
  ctx.restore();
}

// ── 全层大地图：远超一屏，拖动平移，迷雾随探索揭开，玩家光点实时定位 ──
function drawSkull(ctx, x, y, s) { // 手绘骷髅（避免 ☠ 字形在部分环境成豆腐块）
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#efe6d2';
  ctx.beginPath(); ctx.arc(0, -s * .15, s * .7, Math.PI, 0); ctx.rect(-s * .7, -s * .15, s * 1.4, s * .55); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-s * .45, s * .4, s * .9, s * .35, 2); ctx.fill();
  ctx.fillStyle = '#241a12';
  ctx.beginPath(); ctx.arc(-s * .28, -s * .1, s * .18, 0, TAU); ctx.arc(s * .28, -s * .1, s * .18, 0, TAU); ctx.fill();
  ctx.fillRect(-s * .06, s * .12, s * .12, s * .18);
  ctx.strokeStyle = '#241a12'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-s * .2, s * .42); ctx.lineTo(-s * .2, s * .72); ctx.moveTo(s * .05, s * .42); ctx.lineTo(s * .05, s * .72); ctx.moveTo(s * .28, s * .42); ctx.lineTo(s * .28, s * .72); ctx.stroke();
  ctx.restore();
}
function drawFloorMap(ctx, g) {
  const cell = 150, gap = 18, step = cell + gap, GW = 7, GH = 7;
  const mapW = GW * step - gap, mapH = GH * step - gap;
  const viewW = CANVAS_W, viewH = CANVAS_H - HUD_H;
  if (!g.mapCam) g.mapCam = { x: mapW / 2, y: mapH / 2 };
  const cur = g.cur;
  if (g.mapAuto) {
    const tx = cur.gx * step + cell / 2, ty = cur.gy * step + cell / 2;
    g.mapCam.x += (tx - g.mapCam.x) * .16; g.mapCam.y += (ty - g.mapCam.y) * .16;
  }
  g.mapCam.x = clamp(g.mapCam.x, viewW / 2, mapW - viewW / 2);
  g.mapCam.y = clamp(g.mapCam.y, viewH / 2, mapH - viewH / 2);
  const t = g.time;

  ctx.fillStyle = '#080605'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); // 完全不透明，杜绝战场/侧栏透出
  ctx.save();
  ctx.beginPath(); ctx.rect(0, HUD_H, viewW, viewH); ctx.clip();
  ctx.translate(Math.round(viewW / 2 - g.mapCam.x), Math.round(HUD_H + viewH / 2 - g.mapCam.y));

  const known = room => room.visited || DIRS.some(d => room.links[d] && g.floor.rooms.get(room.links[d]).visited);
  // 走廊（两端至少一端探明才画）
  for (const room of g.floor.rooms.values()) {
    if (!known(room)) continue;
    const x = room.gx * step, y = room.gy * step;
    for (const d of DIRS) {
      const nb = room.links[d]; if (!nb) continue;
      const r2 = g.floor.rooms.get(nb); if (!known(r2)) continue;
      const [vx, vy] = DVEC[d];
      ctx.fillStyle = 'rgba(120,96,66,.28)';
      if (vx) ctx.fillRect(x + (vx > 0 ? cell : -gap), y + cell / 2 - 9, gap, 18);
      else ctx.fillRect(x + cell / 2 - 9, y + (vy > 0 ? cell : -gap), 18, gap);
    }
  }
  // 房间
  for (const room of g.floor.rooms.values()) {
    if (!known(room)) continue;
    const x = room.gx * step, y = room.gy * step, seen = room.visited;
    const d = clamp((room.dist || 0) / 4, 0, 1);
    let fill = `rgb(${Math.round(52 + d * 74)},${Math.round(64 - d * 26)},${Math.round(44 - d * 8)})`;
    if (room.type === 'boss') fill = '#6e2a22';
    if (room.type === 'treasure') fill = '#6b5a26';
    if (room.type === 'shop') fill = '#2e4a5a';
    if (room.type === 'start') fill = '#3d5237';
    ctx.globalAlpha = seen ? 1 : .32; // 战争迷雾：只闻其声未见其形 → 半透明剪影
    ctx.fillStyle = seen ? fill : '#171310';
    ctx.beginPath(); ctx.roundRect(x, y, cell, cell, 10); ctx.fill();
    ctx.strokeStyle = room === cur ? '#ffe08a' : 'rgba(220,190,140,.35)';
    ctx.lineWidth = room === cur ? 4 : 2;
    ctx.beginPath(); ctx.roundRect(x, y, cell, cell, 10); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8dcc0'; ctx.font = `bold ${seen ? 15 : 13}px monospace`;
    if (room.type === 'boss') { drawSkull(ctx, x + cell / 2, y + 26, 15); ctx.fillText('Boss', x + cell / 2, y + 52); }
    else {
      const label = room.type === 'treasure' ? '★ 宝物' : room.type === 'shop' ? '$ 商店' : room.type === 'start' ? '入口' : '房 间';
      ctx.fillText(label, x + cell / 2, y + 30);
    }
    if (seen && room.type === 'normal' && !room.cleared && room.quota) { // 未清房：配额进度实时呈现
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.roundRect(x + 22, y + cell / 2 - 4, cell - 44, 12, 6); ctx.fill();
      ctx.fillStyle = '#d9a92e'; ctx.beginPath(); ctx.roundRect(x + 22, y + cell / 2 - 4, (cell - 44) * clamp(room.killed / room.quota, 0, 1), 12, 6); ctx.fill();
      ctx.fillStyle = '#f0e2c0'; ctx.font = 'bold 13px monospace';
      ctx.fillText(`${Math.min(room.killed, room.quota)}/${room.quota}`, x + cell / 2, y + cell / 2 + 30);
    } else if (seen && room.cleared) { ctx.fillStyle = 'rgba(160,220,140,.75)'; ctx.font = '26px monospace'; ctx.fillText('✓', x + cell / 2, y + cell / 2 + 10); }
    if (!seen) { ctx.fillStyle = 'rgba(220,200,170,.8)'; ctx.font = '28px monospace'; ctx.fillText('?', x + cell / 2, y + cell / 2 + 10); }
    ctx.globalAlpha = 1;
  }
  // 玩家光点：实时映射你在房间内的物理位置
  {
    const px = cur.gx * step + (g.player.x / ROOM_W) * cell;
    const py = cur.gy * step + (g.player.y / ROOM_H) * cell;
    const pr = 9 + Math.sin(t * .2) * 2.2;
    ctx.fillStyle = 'rgba(140,220,255,.25)'; ctx.beginPath(); ctx.arc(px, py, pr + 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8ecbff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, pr, 0, TAU); ctx.fill(); ctx.stroke();
  }
  ctx.restore();

  // 边框 HUD：标题 / 关闭 / 图例
  ctx.fillStyle = '#0e0a07'; ctx.fillRect(0, 0, CANVAS_W, HUD_H);
  ctx.fillStyle = '#d8b878'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`${g.theme ? g.theme.name : ''} · ${themePal(g.theme || THEMES[0], g.floorNum).name} · 全图`, 16, 38);
  const z = mapCloseZone();
  ctx.fillStyle = 'rgba(60,40,26,.95)'; ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 7); ctx.fill();
  ctx.strokeStyle = '#b08a3a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 7); ctx.stroke();
  ctx.fillStyle = '#e8c85e'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
  ctx.fillText('×', z.x + z.w / 2, z.y + 26);
  {
    const legend = '拖动平移 · 轻点回中 · Tab/Esc 关闭 · Boss ★宝物 $商店 ✓已清 ?未探索 · 越红越危险';
    ctx.font = '12px monospace'; ctx.textAlign = 'center';
    const lw = ctx.measureText(legend).width + 60;
    ctx.fillStyle = 'rgba(8,6,5,.9)'; ctx.beginPath(); ctx.roundRect(CANVAS_W / 2 - lw / 2, CANVAS_H - 26, lw, 22, 6); ctx.fill();
    ctx.fillStyle = '#8a7360';
    ctx.fillText(legend.replace('Boss', '  Boss'), CANVAS_W / 2, CANVAS_H - 10); // 预留骷髅位
    drawSkull(ctx, CANVAS_W / 2 - ctx.measureText(legend).width / 2 + 118, CANVAS_H - 16, 8);
  }
}

// ── 触屏摇杆 UI ──
function drawTouchUI(ctx, t) {
  ctx.save();
  ctx.globalAlpha = .34;
  const base = (st, dx, dy) => {
    const ox = st ? st.ox : dx, oy = st ? st.oy : dy;
    ctx.strokeStyle = '#e0d0b8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ox, oy, 52, 0, TAU); ctx.stroke();
    const kx = st ? ox + clamp(st.x - ox, -34, 34) : ox;
    const ky = st ? oy + clamp(st.y - oy, -34, 34) : oy;
    ctx.fillStyle = '#e0d0b8';
    ctx.beginPath(); ctx.arc(kx, ky, 22, 0, TAU); ctx.fill();
  };
  base(Touch.sticks.move, 110, CANVAS_H - 100);
  base(Touch.sticks.aim, ROOM_W - 150, CANVAS_H - 100);
  const b = Touch.btn || { x: ROOM_W - 56, y: CANVAS_H - 150, r: 30 };
  const p = game.player, dashReady = p && p.dashCd <= 0;
  ctx.globalAlpha = dashReady ? .5 : .25;
  ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    ctx.beginPath();
    ctx.moveTo(b.x - 12 + i * 10, b.y - 10); ctx.lineTo(b.x - 2 + i * 10, b.y); ctx.lineTo(b.x - 12 + i * 10, b.y + 10);
    ctx.stroke();
  }
  if (p && !dashReady) { // 冷却进度弧
    ctx.globalAlpha = .8; ctx.strokeStyle = '#7fb2e8';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / p.dashCdMax)); ctx.stroke();
  }
  ctx.globalAlpha = .34; ctx.strokeStyle = '#e0d0b8'; // 复位描边色，避免蓝色冷却弧污染暂停/地图/静音按钮
  // 暂停小按钮
  const pb = Touch.pauseBtn || { x: ROOM_W - 56, y: CANVAS_H - 240, r: 22 };
  ctx.beginPath(); ctx.arc(pb.x, pb.y, pb.r, 0, TAU); ctx.stroke();
  ctx.fillRect(pb.x - 7, pb.y - 9, 5, 18); ctx.fillRect(pb.x + 2, pb.y - 9, 5, 18);
  // 地图小按钮（点开全层大地图）
  const gb = Touch.mapBtn || { x: ROOM_W - 56, y: CANVAS_H - 360, r: 20 };
  ctx.beginPath(); ctx.arc(gb.x, gb.y, gb.r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2.4;
  for (const [ox, oy] of [[-6, -6], [2, -6], [-6, 2], [2, 2]]) ctx.strokeRect(gb.x + ox, gb.y + oy, 6.4, 6.4);
  // 静音小按钮（移动端没有 M 键）
  const mb = Touch.muteBtn || { x: ROOM_W - 56, y: CANVAS_H - 302, r: 20 };
  ctx.beginPath(); ctx.arc(mb.x, mb.y, mb.r, 0, TAU); ctx.stroke();
  ctx.fillStyle = '#e0d0b8'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
  ctx.fillText(BGM.on ? '♪' : '♪×', mb.x, mb.y + 6);
  ctx.restore();
}
