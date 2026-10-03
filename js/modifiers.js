'use strict';
// ─────────────────────────────────────────────
// v4.0 层段规则特区：每 5 关一个战区，game.mod 决定生效规则
// bounce 弹跳飞天 / ice 太空滑冰 / lava 熔岩脉冲 / dark 火把视野 / wind 随机侧风
// 所有钩子都是"可选增强"：game.mod 为 null 时零开销
// ─────────────────────────────────────────────

// 进入房间时按房间重掷环境参数（风暴每房变向、熔岩相位连续）
function modOnEnter(room) {
  if (game.mod === 'wind') {
    const a = rand(0, TAU);
    game.wind = { x: Math.cos(a), y: Math.sin(a), str: rand(.55, 1) };
  }
}

// 玩家移动/冲刺钩子：返回修正后的 (mx,my) 输入，并处理特区专属动作
function modPlayerPre(p, mx, my) {
  if (game.mod === 'ice') {
    // 滑冰：低摩擦动量。输入只缓慢改写速度，松键后保持滑行
    p.vx = (p.vx || 0) + (mx * p.speed - (p.vx || 0)) * .08;
    p.vy = (p.vy || 0) + (my * p.speed - (p.vy || 0)) * .08;
    return null; // 已自行处理位移
  }
  if (game.mod === 'wind' && game.wind) { // 走位被风吹偏
    mx += game.wind.x * .30 * game.wind.str;
    my += game.wind.y * .30 * game.wind.str;
  }
  return [mx, my];
}

// ice 模式的实际位移（moveCircle 内部会撞墙，安全）
function modPlayerMove(p, room) {
  if (game.mod !== 'ice') return false;
  if (Math.abs(p.vx) > .05 || Math.abs(p.vy) > .05) {
    moveCircle(p, p.vx, p.vy, room);
    p.moving = true; p.anim++;
  }
  return game.mod === 'ice';
}

// 冲刺触发修正：bounce 战区允许"弹跳链"——冲刺结束后 30 帧内再按冲刺 = 空中二段跳（不占 CD、附带短无敌）
function modTryDash(p) {
  if (game.mod === 'bounce' && p.chainT > 0 && p.dashing <= 0 && (p.chainN || 0) < 2) { // 两轮链跳封顶，防无限无敌飞行
    p.chainN = (p.chainN || 0) + 1;
    p.chainT = 0; p.dashing = 13; p.dashCd = Math.min(p.dashCd, 12); // 链跳只补一点点 CD
    let [mx, my] = Input.dir('v');
    if (Touch.active) { const [tx, ty] = Touch.vector('move'); mx += tx; my += ty; }
    let dx = mx, dy = my;
    if (!dx && !dy) { dx = p.aim.x; dy = p.aim.y; }
    const l = Math.hypot(dx, dy) || 1;
    p.dashVx = dx / l * 9.8; p.dashVy = dy / l * 9.8;
    p.inv = Math.max(p.inv, 4); p.zing = 1; // 腾空视觉；无敌仅 4 帧，链跳不吃满
    SFX.play('dash');
    return true; // 已消费本次按键
  }
  return false;
}

// 冲刺帧更新：链跳窗口与腾空衰减
function modDashTick(p) {
  if (game.mod === 'bounce' && p.dashing > 0) p.chainT = 30;
  if (p.chainT > 0) p.chainT--;
  if (p.zing > 0) p.zing = Math.max(0, p.zing - .08);
}

// 子弹风偏：所有弹（敌我）受侧风缓慢加速
function modTear(tr) {
  if (game.mod === 'wind' && game.wind) {
    const k = tr.isPlayer ? .3 : 1; // 玩家弹只吃三成风偏：保手感，压力给走位
    tr.vx += game.wind.x * .016 * game.wind.str * k;
    tr.vy += game.wind.y * .016 * game.wind.str * k;
  }
}

// 熔岩脉冲：每 240 帧亮 90 帧，脉冲期间站桩超过 24 帧扣 1 心（逼走位）
function modWorldTick(p) {
  game.lavaT = ((game.time || 0) % 240);
  if (game.mod === 'lava' && game.lavaT < 90) {
    if (p.moving) p.stillT = 0; else p.stillT = (p.stillT || 0) + 1;
    if (p.stillT === 25) { p.stillT = 0; p.hurt(1, game, undefined, undefined, '熔岩脉冲'); }
  } else if (p.stillT) p.stillT = 0;
}

// ── 渲染钩子 ──
function modRoomTint(ctx, room, pal) { // 地面氛围：冰面反光 / 熔岩红光（drawRoom 尾部调用）
  if (game.mod === 'ice') {
    ctx.fillStyle = 'rgba(160,220,255,.05)';
    ctx.fillRect(TILE, TILE, WORLD_W - 2 * TILE, WORLD_H - 2 * TILE);
  } else if (game.mod === 'lava') {
    const pulse = game.lavaT < 90 ? .10 + .08 * Math.sin(game.time * .3) : .03;
    ctx.fillStyle = `rgba(255,70,20,${pulse})`;
    ctx.fillRect(TILE, TILE, WORLD_W - 2 * TILE, WORLD_H - 2 * TILE);
  }
}

function modVignetteRange() { // dark 战区：光圈收缩（返回 [内半径系数, 外半径系数]）
  return game.mod === 'dark' ? [.16, .34] : [.35, .62];
}

function modHudTag(ctx) { // 视口左上角战区规则徽标 + 风向罗盘
  if (!game.mod) return;
  const names = { bounce: '弹跳飞天', ice: '太空滑冰', lava: '熔岩脉冲', dark: '火把视野', wind: '随机侧风' };
  ctx.save();
  const by = IS_MOBILE ? HUD_H + 122 : HUD_H + 4; // 手机下移到小地图叠层之下，防被半透明面板糊住
  const bx = IS_MOBILE ? VIEW_W - 246 : VIEW_W - 118; // 手机再左移，避开右侧按钮列
  ctx.fillStyle = 'rgba(10,7,5,.7)';
  ctx.beginPath(); ctx.roundRect(bx, by, 112, 20, 5); ctx.fill();
  ctx.fillStyle = '#9cc4ee'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center';
  ctx.fillText('◈ ' + names[game.mod], bx + 56, by + 14);
  if (game.mod === 'wind' && game.wind) { // 风向罗盘
    ctx.translate(bx + 14, by + 10); ctx.rotate(Math.atan2(game.wind.y, game.wind.x));
    ctx.strokeStyle = '#e8c85e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(2, -3.4); ctx.moveTo(6, 0); ctx.lineTo(2, 3.4); ctx.stroke();
  }
  ctx.restore();
}
