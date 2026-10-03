'use strict';
// ─────────────────────────────────────────────
// 程序化绘制：房间 / 角色 / 敌人 / Boss / 掉落物 / HUD
// 全部用代码绘制，暗黑卡通手绘风
// ─────────────────────────────────────────────


function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

// ── 房间地面/墙体/门 ──（世界层：调用方已应用相机 translate，本函数用世界坐标直接绘制）
function drawRoom(ctx, room, pal, t) {
  ctx.save();

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

  // 墙外虚空由画布底色承担；墙砖
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
    // 先铺墙砖打底，再内缩挖门洞：门是"墙上的开口"而不是"地上的洞"
    ctx.fillStyle = pal.wall; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = pal.wallHi; ctx.fillRect(x, y, TILE, 5);
    ctx.fillStyle = pal.wallSh; ctx.fillRect(x, y + TILE - 6, TILE, 6);
    ctx.fillStyle = '#0d0a08'; ctx.fillRect(x + 5, y + 5, TILE - 10, TILE - 10);
    if (open) {
      const horiz = d === 'w' || d === 'e';
      // 向内递进的门廊渐变
      const g = ctx.createLinearGradient(x, y, horiz ? x + TILE * (d === 'e' ? 1 : -1) : x, horiz ? y : y + TILE * (d === 's' ? 1 : -1));
      g.addColorStop(0, '#020101'); g.addColorStop(.6, '#130d09'); g.addColorStop(1, '#28190f');
      ctx.fillStyle = g; ctx.fillRect(x + 7, y + 7, TILE - 14, TILE - 14);
      // 门框砖缝与门楣
      ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 7, y + 7, TILE - 14, TILE - 14);
      ctx.fillStyle = pal.wallHi;
      if (!horiz) ctx.fillRect(x + 7, y + (d === 'n' ? 7 : TILE - 12), TILE - 14, 5);
      else ctx.fillRect(x + (d === 'w' ? 7 : TILE - 12), y + 7, 5, TILE - 14);
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

  // 商店：货架台座与木牌招牌（世界中心）
  if (room.type === 'shop') {
    ctx.fillStyle = '#5a4028';
    ctx.beginPath(); ctx.roundRect(WORLD_W / 2 - 38, TILE * 1.72, 76, 22, 3); ctx.fill();
    ctx.strokeStyle = '#31220f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(WORLD_W / 2 - 38, TILE * 1.72, 76, 22, 3); ctx.stroke();
    ctx.fillStyle = '#241708';
    ctx.fillRect(WORLD_W / 2 - 30, TILE * 1.72 + 4, 3, 14); ctx.fillRect(WORLD_W / 2 + 27, TILE * 1.72 + 4, 3, 14);
    ctx.fillStyle = '#e0cfa4'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    ctx.fillText('商 店', WORLD_W / 2, TILE * 1.72 + 16);
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
  modRoomTint(ctx, room, pal); // 冰面/熔岩氛围
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

// ── 玩家：Q 版美术层 QArt.drawCharacter（4 干员 × 8 向瞄准 × 武器等级外观）──
function drawPlayer(ctx, p, t) {
  ctx.save();
  if (p.inv > 0 && game.state === 'play') ctx.globalAlpha = Math.floor(t / 4) % 2 === 0 ? .35 : 1; // 受击半透明闪烁
  ctx.translate(p.x, p.y);
  if (p.zing > 0) { ctx.translate(0, -p.zing * 7); ctx.scale(1 + p.zing * .16, 1 + p.zing * .16); } // 弹跳飞天腾空
  const ch = CHARS[(p.char == null ? (Meta.load().char || 0) : p.char) % CHARS.length];
  const wid = p.weapon ? p.weapon.id : 'tear';
  const effCd = Math.max(4, Math.round(WEAPONS[wid].cd * ((p.fireDelay || 13) / 13)));
  QArt.drawCharacter(ctx, {
    char: ch, aim: p.aim, gun: wid, lvl: p.weapon ? p.weapon.lvl : 1, t,
    moving: p.moving, anim: p.anim || 0, recoil: p.cd === undefined ? 0 : clamp(p.cd / effCd, 0, 1),
    bulk: ch.bulk || 1, shotsPerDir: p.shotsPerDir,
  });
  ctx.restore();
}

// ── 子弹：Q 版弹种 QArt.drawBullet（内部精灵缓存；tr.bulletKey 分型）──
function drawTear(ctx, tr, t) { QArt.drawBullet(ctx, tr, t); }

// ── 武器特效与反馈：激光束 / 闪电链 / 冲刺残影 / 枪口火光 / 抛壳 / 命中火花 / 死亡烟圈 ──
function drawFx(ctx, g) {
  for (const f of g.fx) {
    ctx.save();
    const k = f.t0 ? clamp(f.t / f.t0, 0, 1) : clamp(f.t / 9, 0, 1);
    if (f.type === 'laser') QArt.laserBeam(ctx, { x1: f.x1, y1: f.y1, x2: f.x2, y2: f.y2, lvl: f.lvl || 1, k, t: g.time });
    else if (f.type === 'bolt') QArt.chainBolt(ctx, { pts: f.pts, lvl: f.lvl || 1, k: clamp(f.t / 10, 0, 1), t: g.time });
    else if (f.type === 'ghost') {
      const ch = CHARS[(f.char == null ? 0 : f.char) % CHARS.length];
      ctx.translate(f.x, f.y);
      ctx.globalAlpha = (f.t / 8) * .4;
      QArt.drawCharacter(ctx, { char: ch, aim: f.aim || { x: 1, y: 0 }, gun: 'tear', lvl: 1, t: g.time });
    }
    else if (f.type === 'flash') QArt.muzzleFlash(ctx, { id: f.id, x: f.x, y: f.y, ang: f.ang, k, r: f.r, t: g.time });
    else if (f.type === 'casing') QArt.casing(ctx, { x: f.x, y: f.y, ang: (1 - k) * 9 + (f.ang || 0), k });
    else if (f.type === 'spark') QArt.impactSpark(ctx, { id: f.id, x: f.x, y: f.y, k, ang: f.ang, r: f.r, n: f.n || 7 });
    else if (f.type === 'puff') QArt.deathPuff(ctx, { x: f.x, y: f.y, r: f.r, k, seed: f.seed || 3 });
    ctx.restore();
  }
}

// ── 敌人：Q 版怪物 QArt.drawEnemy（15 种 + 精英光环 + 受击闪白 + 出生冒泡）──
function drawEnemy(ctx, e, t) {
  const p = game.player;
  ctx.save(); ctx.translate(e.x, e.y);
  const d = p ? Math.max(1, dist2(p.x, p.y, e.x, e.y)) : 1;
  QArt.drawEnemy(ctx, {
    cfg: { id: e.cfg.id, r: e.r }, t, flash: e.flash, spawnT: e.spawnT, elite: e.elite,
    state: e.state, faceLeft: !!p && p.x < e.x - 4,
    look: p ? { x: (p.x - e.x) / d, y: (p.y - e.y) / d } : { x: 0, y: 0 },
  }, t);
  ctx.restore();
}

// ── Boss：Q 版巨型躯干 QArt.drawBoss + 蓄力预警 QArt.telegraph ──
function drawBoss(ctx, b, t) {
  if (b.act === 'tele') {
    const k = clamp(b.actT / 30, 0, 1);
    if (b.teleKind === 'hop') {
      QArt.telegraph(ctx, { x: b.hopTo.x, y: b.hopTo.y, r: b.r * .9, k });
    } else {
      const dirX = b.vx ? Math.sign(b.vx) : 0, dirY = b.vy ? Math.sign(b.vy) : 0;
      const horiz = dirX !== 0;
      const len = horiz ? (dirX > 0 ? WORLD_W - b.x : b.x) : (dirY > 0 ? WORLD_H - b.y : b.y);
      const ang = horiz ? (dirX > 0 ? 0 : Math.PI) : (dirY > 0 ? Math.PI / 2 : -Math.PI / 2);
      QArt.telegraph(ctx, { x: b.x, y: b.y, r: b.r, k, ang, len, w: b.r * 1.7 });
    }
  }
  const p = game.player;
  ctx.save(); ctx.translate(b.x, b.y);
  const d = p ? Math.max(1, dist2(p.x, p.y, b.x, b.y)) : 1;
  QArt.drawBoss(ctx, {
    cfg: { arch: QArt.BOSS_ART[b.cfg.id] ? b.cfg.id : b.cfg.arch, r: b.cfg.r }, // the_maw 等按 id 取专属图，防 arch 兜底成分身
    act: b.act, phase2: b.phase2, flash: b.flash,
    look: p ? { x: (p.x - b.x) / d, y: (p.y - b.y) / d } : { x: 0, y: 0 },
  }, t);
  ctx.restore();
}

// 屏外残敌边缘指示：3 屏大房间里不再瞎追，红色箭头指向每个屏外存活怪方位
function drawStragglers(ctx, g) {
  const alive = g.cur.enemies.filter(e => !e.dead && e.spawnT <= 0);
  if (!alive.length) return;
  const cxp = VIEW_W / 2, cyp = HUD_H + ROOM_H / 2;
  ctx.save();
  let n = 0;
  for (const e of alive) {
    const sx = e.x - g.cam.x, sy = HUD_H + e.y - g.cam.y;
    if (sx > 24 && sx < VIEW_W - 24 && sy > HUD_H + 24 && sy < CANVAS_H - 24) continue; // 屏内不标
    if (n++ >= 4) break;
    const a = Math.atan2(sy - cyp, sx - cxp);
    const t = Math.min((VIEW_W / 2 - 30) / Math.max(1e-4, Math.abs(Math.cos(a))),
      (ROOM_H / 2 - 30) / Math.max(1e-4, Math.abs(Math.sin(a))));
    let ax = cxp + Math.cos(a) * t, ay = cyp + Math.sin(a) * t;
    if (IS_MOBILE) { // 避让右上叠层小地图
      const mz = minimapZone();
      if (ax > mz.x - 18 && ay < mz.y + mz.h + 18) ay = Math.max(ay, mz.y + mz.h + 22);
    }
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(230,80,60,.92)';
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-2.5, 0); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

// Boss 血条（UI 层，不随相机滚动）
function drawBossBar(ctx, b) {
  const pct = clamp(b.hp / b.maxHp, 0, 1);
  const bw = 360, bx = (VIEW_W - bw) / 2, by = HUD_H + 12;
  ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(bx - 3, by - 16, bw + 6, 29); // 底衬罩住名牌，避免与北门贴图叠字
  ctx.fillStyle = '#3d1515'; ctx.fillRect(bx, by, bw, 10);
  ctx.fillStyle = pct > .5 ? '#a63a2e' : '#7c2318';
  ctx.fillRect(bx, by, bw * pct, 10);
  ctx.fillStyle = '#e8c85e';
  ctx.font = '11px monospace'; ctx.textAlign = 'center';
  const af = b.affix ? ({ rage: '·狂暴', barrage: '·弹幕', summon: '·增援' })[b.affix] : '';
  ctx.fillText(b.cfg.name + af, VIEW_W / 2, by - 5);
  ctx.textAlign = 'left';
}

// ── 拾取物 ──
function drawPickup(ctx, pk, t) {
  if (pk.kind === 'extract') { // 撤离坪：落地脉冲圆台 + 上升箭头（不浮动，区别于拾取物）
    const pulse = .5 + .5 * Math.sin(t * .1);
    ctx.save(); ctx.translate(pk.x, pk.y);
    ctx.strokeStyle = `rgba(127,174,90,${.5 + pulse * .4})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 6, 30, 14, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = `rgba(127,174,90,${.14 + pulse * .1})`; ctx.fill();
    ctx.fillStyle = '#b8e08a';
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(9, -2); ctx.lineTo(3.5, -2); ctx.lineTo(3.5, 8); ctx.lineTo(-3.5, 8); ctx.lineTo(-3.5, -2); ctx.lineTo(-9, -2); ctx.closePath(); ctx.fill();
    ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
    ctx.fillText('撤离点', 0, 30);
    ctx.restore(); return;
  }
  const bob = Math.sin(t * .08 + pk.x) * 2.5;
  ctx.save(); ctx.translate(pk.x, pk.y + bob);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(0, 12 - bob, 9, 3, 0, 0, TAU); ctx.fill();
  switch (pk.kind) {
    case 'heart': case 'halfheart': drawHeartShape(ctx, 0, 0, 11, pk.kind === 'halfheart'); break;
    case 'coin':
      ctx.fillStyle = '#d9a92e'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#9a7517'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#f5d873'; ctx.beginPath(); ctx.arc(-2.5, -2.5, 4, 0, TAU); ctx.fill();
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

  // 金币 / 冲刺CD（贴 HUD 底缘，与两行心形错开）
  const res = [['coin', p.coins]];
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
  const bg = ctx.createLinearGradient(VIEW_W / 2 - 90, 0, VIEW_W / 2 + 90, 0);
  bg.addColorStop(0, 'rgba(90,60,35,0)'); bg.addColorStop(.5, 'rgba(90,60,35,.35)'); bg.addColorStop(1, 'rgba(90,60,35,0)');
  ctx.fillStyle = bg; ctx.fillRect(VIEW_W / 2 - 90, 8, 180, 20);
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
  const fname = themePal(g.theme || THEMES[0], g.floorNum).name;
  ctx.fillText(fname, VIEW_W / 2 + 1.5, 23.5);
  ctx.fillStyle = '#d8b878';
  ctx.fillText(fname, VIEW_W / 2, 22);
  // M 键音乐状态即时反馈
  ctx.fillStyle = BGM.on ? '#7fae5a' : '#5a4c42'; ctx.font = '11px monospace';
  ctx.fillText(BGM.on ? '♪' : '♪×', VIEW_W / 2 + 62, 22);

  // 击杀/房间数
  ctx.fillStyle = '#5a4c42'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`击杀 ${g.kills}`, VIEW_W / 2 - 70, 44);
  ctx.fillText(`房间 ${g.roomsSeen}`, VIEW_W / 2 + 5, 44);

  // 引导/拒绝提示浮字（画面底部，避开 Boss 头顶与顶部弹幕视线）
  if (g.hint && g.hint.t > 0) {
    ctx.globalAlpha = clamp(g.hint.t / 40, 0, 1);
    ctx.fillStyle = 'rgba(10,6,4,.7)';
    ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center';
    const w2 = ctx.measureText(g.hint.text).width + 26;
    ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - w2 / 2, CANVAS_H - 118, w2, 24, 5); ctx.fill();
    ctx.fillStyle = '#f0d8a8';
    ctx.fillText(g.hint.text, VIEW_W / 2, CANVAS_H - 102);
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
    ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - 158, ty, 316, 40, 6); ctx.fill();
    ctx.strokeStyle = g.toast.item.color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - 158, ty, 316, 40, 6); ctx.stroke();
    drawItemIcon(ctx, g.toast.item, VIEW_W / 2 - 136, ty + 20, g.time);
    ctx.fillStyle = '#f0e6d8'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left';
    ctx.fillText(g.toast.item.name, VIEW_W / 2 - 112, ty + 16);
    ctx.fillStyle = '#b09a80'; ctx.font = '11px monospace';
    ctx.fillText(g.toast.item.desc, VIEW_W / 2 - 112, ty + 32);
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

// ── 手机叠层：右上半透明小地图（点按开全图）+ 金币计数（侧栏隐藏后的替代信息源）──
function drawMobileOverlay(ctx, g) {
  const z = minimapZone();
  if (g.mod === 'dark') { // 火把视野：小地图失灵
    ctx.save(); ctx.globalAlpha = .5;
    ctx.fillStyle = 'rgba(10,7,5,.82)'; ctx.beginPath(); ctx.roundRect(z.x - 5, z.y - 5, z.w + 10, z.h + 10, 7); ctx.fill();
    ctx.fillStyle = '#8a7360'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText('地图失灵', z.x + z.w / 2, z.y + z.h / 2); ctx.restore(); return;
  }
  ctx.save();
  ctx.globalAlpha = .8;
  ctx.fillStyle = 'rgba(10,7,5,.82)';
  ctx.beginPath(); ctx.roundRect(z.x - 5, z.y - 5, z.w + 10, z.h + 10, 7); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.translate(z.x, z.y);
  ctx.scale(.58, .58);
  drawMinimapAt(ctx, g, 0, 0);
  ctx.restore();
  const m = Meta.load();
  ctx.fillStyle = '#b093e8'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'right';
  ctx.fillText(`金币 ${m.coins}`, z.x + z.w, z.y + z.h + 14);
  ctx.textAlign = 'left';
}

// 暂停页补看属性/物件（手机无侧栏）
function drawMobileStats(ctx, g) {
  const p = g.player;
  if (!p) return;
  ctx.save();
  ctx.fillStyle = 'rgba(14,10,7,.93)';
  ctx.strokeStyle = '#5a4426'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(VIEW_W / 2 - 178, CANVAS_H / 2 - 128, 356, 168, 10); ctx.fill(); ctx.stroke();
  const wd = WEAPONS[p.weapon ? p.weapon.id : 'tear'];
  ctx.fillStyle = wd.c; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'left';
  ctx.fillText(`Lv ${p.level} · ${wd.name} Lv${p.weapon ? p.weapon.lvl : 1}`, VIEW_W / 2 - 158, CANVAS_H / 2 - 102);
  ctx.font = '12px monospace'; ctx.fillStyle = '#cbb59a';
  const lines = [
    `生命 ${Math.ceil(p.hearts / 2)}/${Math.ceil(p.maxHearts / 2)}    攻击 ${(p.dmg * wd.mult).toFixed(1)}    移速 ${p.speed.toFixed(2)}`,
    `金币 ${p.coins}    击杀 ${g.kills}    房间 ${g.roomsSeen}`,
  ];
  const items = p.items.map(i => i.name);
  lines.push('物件：' + (items.length ? items.join('、') : '空手而来'));
  lines.forEach((s, i) => ctx.fillText(s, VIEW_W / 2 - 158, CANVAS_H / 2 - 72 + i * 24));
  ctx.textAlign = 'left';
  ctx.restore();
}

// 暗角（罩视口，圆心跟随玩家屏幕位，随相机滚动）
function drawVignette(ctx, g) {
  const p = g.player;
  const px = p ? p.x - g.cam.x : VIEW_W / 2, py = p ? HUD_H + p.y - g.cam.y : HUD_H + ROOM_H / 2;
  const vr = modVignetteRange();
  const grd = ctx.createRadialGradient(px, py, ROOM_H * vr[0], px, py, ROOM_W * vr[1]);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.save();
  ctx.beginPath(); ctx.rect(0, HUD_H, VIEW_W, ROOM_H); ctx.clip();
  ctx.fillStyle = grd; ctx.fillRect(0, HUD_H, VIEW_W, ROOM_H);
  ctx.fillStyle = themePal(g.theme || THEMES[0], g.floorNum).tint;
  ctx.fillRect(0, HUD_H, VIEW_W, ROOM_H);
  ctx.restore();
}

// ── 菜单区域（触摸点选判定）──
function inZone(p, z) { return z && p.x >= z.x && p.x <= z.x + z.w && p.y >= z.y && p.y <= z.y + z.h; }
function minimapZone() { return IS_MOBILE ? { x: VIEW_W - 148, y: HUD_H + 8, w: 136, h: 96 } : { x: ROOM_W + 12, y: 88, w: PANEL_W - 24, h: 148 }; } // 点小地图 → 放大地图
function mapCloseZone() { return { x: CANVAS_W - 46, y: HUD_H + 6, w: 38, h: 38 }; }
// 标题/结算页绘制时 translate(PANEL_W/2)，命中区需同步平移到屏幕真实坐标
function workshopBtnZone() { return { x: CANVAS_W / 2 - 96 + PANEL_W / 2, y: 444, w: 192, h: 32 }; }
function charZones() {
  const n = CHARS.length, cw = 118, gap = 12, total = n * cw + (n - 1) * gap, x0 = ROOM_W / 2 - total / 2;
  return CHARS.map((_, i) => ({ x: x0 + i * (cw + gap), y: 230, w: cw, h: 118 }));
}
// 标题绘制在 translate(PANEL_W/2) 内，点选命中需把画布坐标反向平移回卡片坐标系
function charZoneHit(mt) { return mt && { x: mt.x - PANEL_W / 2, y: mt.y }; }
function backBtnZone() { return { x: CANVAS_W / 2 - 60, y: CANVAS_H - 44, w: 120, h: 30 }; }
function accountZone() { return { x: CANVAS_W - 250, y: 2, w: 246, h: 20 }; } // 标题屏右上账号状态条
// 标题屏选关 ◀ ▶ 按钮（绘制在 translate(PANEL_W/2) 内，命中区换算到画布坐标，同 workshopBtnZone 规则）
function stageBtnZones() {
  return { l: { x: ROOM_W / 2 - 150 + PANEL_W / 2, y: 356, w: 44, h: 36 }, r: { x: ROOM_W / 2 + 106 + PANEL_W / 2, y: 356, w: 44, h: 36 } };
}
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
  ctx.fillText(`金币 : ${m.coins}${g.runCoins ? ' (本局 +' + g.runCoins + ')' : ''}`, CANVAS_W / 2, 84);
  ctx.fillStyle = '#6b5340'; ctx.font = '11px monospace';
  ctx.fillText('金币实时入账 · 升级永久生效 · 按 1-6 或点击购买', CANVAS_W / 2, 106);
  META_UPS.forEach((u, i) => {
    const z = metaRowZone(i), lv = m.up[u.id];
    const maxed = lv >= u.max, cost = maxed ? 0 : u.cost[lv];
    const afford = !maxed && m.coins >= cost;
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
    ctx.fillText(maxed ? '已满级' : cost + ' 金币', z.x + z.w - 14, z.y + 28);
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
  ctx.fillText(`金币 ${m.coins}`, zx + 8, z.y + 21);
}

function drawSidePanel(ctx, g) {
  const x0 = ROOM_W, p = g.player;
  ctx.save();
  ctx.fillStyle = '#120e0b'; ctx.fillRect(x0, 0, PANEL_W, CANVAS_H);
  ctx.fillStyle = '#2a201a'; ctx.fillRect(x0, 0, 2, CANVAS_H);

  ctx.fillStyle = '#6b5340'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'left';
  ctx.fillText('地 图', x0 + 12, 82);
  if (g.mod === 'dark') { ctx.fillStyle = '#8a7360'; ctx.font = '11px monospace'; ctx.fillText('火把视野：地图失灵', x0 + 12, 118); }
  else drawMinimapAt(ctx, g, x0 + 12, 92);

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
  // 金币存量
  ctx.fillStyle = '#b093e8'; ctx.font = '10px monospace'; ctx.textAlign = 'right';
  ctx.fillText(`金币 ${Meta.load().coins}`, x0 + PANEL_W - 12, 82);
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
    const px = cur.gx * step + (g.player.x / WORLD_W) * cell;
    const py = cur.gy * step + (g.player.y / WORLD_H) * cell;
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
    const legend = '拖动平移 · 轻点回中 · Tab/Esc 关闭 · 骷髅=Boss ★宝物 $商店 ✓已清 ?未探索 · 越红越危险';
    ctx.font = '12px monospace'; ctx.textAlign = 'center';
    const lw = ctx.measureText(legend).width + 20;
    ctx.fillStyle = 'rgba(8,6,5,.9)'; ctx.beginPath(); ctx.roundRect(CANVAS_W / 2 - lw / 2, CANVAS_H - 26, lw, 22, 6); ctx.fill();
    ctx.fillStyle = '#8a7360';
    ctx.fillText(legend, CANVAS_W / 2, CANVAS_H - 10);
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
  base(Touch.sticks.aim, VIEW_W - 160, CANVAS_H - 100);
  const b = Touch.btn || { x: VIEW_W - 70, y: CANVAS_H - 96, r: 38 };
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
  const pb = Touch.pauseBtn || { x: VIEW_W - 36, y: HUD_H + 204, r: 20 };
  ctx.beginPath(); ctx.arc(pb.x, pb.y, pb.r, 0, TAU); ctx.stroke();
  ctx.fillRect(pb.x - 7, pb.y - 9, 5, 18); ctx.fillRect(pb.x + 2, pb.y - 9, 5, 18);
  // 地图小按钮（点开全层大地图）
  const gb = Touch.mapBtn || { x: VIEW_W - 36, y: HUD_H + 124, r: 18 };
  ctx.beginPath(); ctx.arc(gb.x, gb.y, gb.r, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2.4;
  for (const [ox, oy] of [[-6, -6], [2, -6], [-6, 2], [2, 2]]) ctx.strokeRect(gb.x + ox, gb.y + oy, 6.4, 6.4);
  // 静音小按钮（移动端没有 M 键）——手绘八分音符，防 ♪ 字形豆腐块
  const mb = Touch.muteBtn || { x: VIEW_W - 36, y: HUD_H + 164, r: 18 };
  ctx.beginPath(); ctx.arc(mb.x, mb.y, mb.r, 0, TAU); ctx.stroke();
  ctx.strokeStyle = '#e0d0b8'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(mb.x + 4, mb.y + 4); ctx.lineTo(mb.x + 4, mb.y - 7);
  ctx.quadraticCurveTo(mb.x + 9, mb.y - 6, mb.x + 8, mb.y - 2); ctx.stroke();
  ctx.fillStyle = '#e0d0b8';
  ctx.beginPath(); ctx.ellipse(mb.x + 1, mb.y + 5, 3.4, 2.6, -.3, 0, TAU); ctx.fill();
  if (!BGM.on) { ctx.strokeStyle = '#c95050'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(mb.x - 7, mb.y - 7); ctx.lineTo(mb.x + 7, mb.y + 7); ctx.stroke(); }
  ctx.restore();
}
