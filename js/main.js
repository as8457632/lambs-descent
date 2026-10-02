'use strict';
// ─────────────────────────────────────────────
// 主循环 / 状态机 / 房间切换 / 碰撞 / 界面
// ─────────────────────────────────────────────

const game = {
  state: 'title', // title | play | dead | win
  paused: false,
  floor: null, floorNum: 1,
  player: null, cur: null,
  particles: [], toast: null, fx: [],
  shakeAmt: 0, time: 0,
  kills: 0, roomsSeen: 0, deaths: 0,
  runTime: 0,
};

function shake(n) { game.shakeAmt = Math.max(game.shakeAmt, n); }

let cv, cx;
const BUILD = 'v2.3'; // 版本号水印：确认玩家加载的是否为最新构建
window.__BUILD = BUILD;
window.DBG_VP = () => ({ build: BUILD, inner: [innerWidth, innerHeight], vv: window.visualViewport ? [Math.round(visualViewport.width), Math.round(visualViewport.height)] : null, dpr: devicePixelRatio, css: [Math.round(cv ? cv.getBoundingClientRect().width : 0), Math.round(cv ? cv.getBoundingClientRect().height : 0)] });

function boot() {
  cv = document.getElementById('game');
  const dpr = Math.min(window.devicePixelRatio || 1, 3); // 高分屏按 DPR 放大缓冲（上限3），消除模糊/锯齿
  cv.width = CANVAS_W * dpr; cv.height = CANVAS_H * dpr;
  cx = cv.getContext('2d');
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  window.LOGICAL_W = ROOM_W;
  Input.init();
  Touch.init(cv);
  // JS 驱动画布尺寸：免疫平板桌面模式/工具栏收展导致的 vw/dvh 失准
  function fitCanvas() {
    const vv = window.visualViewport;
    // visualViewport 在捏合缩放/平板桌面模式怪癖下可能远小于布局视口 → 取两者较大值，画布永不被压成小方块
    const w = Math.max(vv ? vv.width : 0, window.innerWidth || 0) || CANVAS_W;
    const h = Math.max(vv ? vv.height : 0, window.innerHeight || 0) || CANVAS_H;
    // 强制横屏：仅竖屏时旋转；用户真把设备转过来了就自动转回正常布局
    const rot = !!game.rotMode && h > w;
    game.rotOn = rot;
    cv.classList.toggle('rot', rot);
    document.body.classList.toggle('rot', rot);
    const s = rot ? Math.min(h / CANVAS_W, w / CANVAS_H) : Math.min(w / CANVAS_W, h / CANVAS_H);
    game.rotScale = s;
    const cw = Math.floor(CANVAS_W * s) + 'px', chh = Math.floor(CANVAS_H * s) + 'px';
    if (cv.style.width !== cw) cv.style.width = cw;
    if (cv.style.height !== chh) cv.style.height = chh;
    if (rot) { // 确定性居中锚点：旋转后包围盒 = (CANVAS_H*s)宽 × (CANVAS_W*s)高
      cv.style.left = Math.round((w - CANVAS_H * s) / 2) + 'px';
      cv.style.top = Math.round((h - CANVAS_W * s) / 2) + 'px';
    } else { cv.style.left = ''; cv.style.top = ''; }
    game.fitScale = s;
    const fsb = document.getElementById('fsbtn');
    if (fsb) {
      fsb.classList.toggle('show', s < .74 || (Touch.supported() && h > w)); // 竖屏手机常驻：那是"强制横屏"入口
      fsb.textContent = game.rotMode ? '⛶ 退出横屏' : (Touch.supported() && h > w ? '⛶ 强制横屏' : '⛶ 全屏横屏');
    }
  }
  window.__fitCanvas = fitCanvas;
  addEventListener('resize', () => { fitCanvas(); setTimeout(fitCanvas, 300); }); // 过渡态双保险
  addEventListener('orientationchange', () => setTimeout(fitCanvas, 150));
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', fitCanvas);
    visualViewport.addEventListener('scroll', fitCanvas);
  }
  setInterval(fitCanvas, 1000); // 兜底：个别浏览器丢事件时 1 秒内自愈
  document.addEventListener('fullscreenchange', () => setTimeout(fitCanvas, 120));
  fitCanvas();
  // 全屏横屏按钮：绕开系统"旋转锁定"（Android 有效；iOS 不支持则改提示）
  const fsb = document.getElementById('fsbtn');
  if (fsb) {
    const el = document.documentElement;
    if (!el.requestFullscreen && !el.webkitRequestFullscreen) {
      fsb.textContent = '↻ 请开启系统自动旋转后横握';
      fsb.style.fontSize = '12px';
    }
    fsb.addEventListener('click', () => {
      const portrait = () => {
        const vv = window.visualViewport;
        return Math.max(vv ? vv.height : 0, innerHeight) > Math.max(vv ? vv.width : 0, innerWidth);
      };
      const setRot = on => {
        game.rotMode = on;
        cv.classList.toggle('rot', on);
        document.body.classList.toggle('rot', on); // 让退出按钮浮到画布之上、贴屏幕底缘
        fitCanvas();
      };
      const goFs = () => {
        try { const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (r && r.catch) r.catch(() => { }); } catch (e) { }
      };
      if (game.rotMode) { // 退出：解除旋转 + 退出全屏
        setRot(false);
        if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        return;
      }
      if (Touch.supported() && portrait()) { goFs(); setRot(true); return; } // 手机竖屏：全屏(收地址栏)+CSS旋转双管齐下，画布铺满
      goFs();
      setTimeout(() => {
        try {
          const so = screen.orientation;
          if (so && so.lock) so.lock('landscape').catch(() => { if (portrait()) setRot(true); });
          else if (portrait()) setRot(true);
        } catch (e) { if (portrait()) setRot(true); }
      }, 350);
    });
  }
  window.game = game;                       // 调试接口：HP/敌人/子弹/房间/道具/属性
  window.DBG = {
    newRun, loadFloor, enterRoom, genFloor, Player, Enemy, Boss, Pickup, Tear, ETYPE, ITEMS, BOSSES, TILE, ROOM_W, ROOM_H,
    // 测试辅助：用真实 moveCircle 碰撞逐帧走到目标点（不瞬移）
    moveTo(x, y, spd = 3) {
      const p = game.player;
      for (let i = 0; i < 600; i++) {
        const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
        if (d < 6) return true;
        const slide = d > 40 ? 1 : d / 40; // 接近目标时减速，避免过冲
        moveCircle(p, dx / d * spd * slide, dy / d * spd * slide, game.cur);
      }
      return false;
    }
  };
  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame); // 先排下一帧，单帧异常不会杀死主循环
    acc += Math.min(now - last, 100); last = now;
    while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
    draw();
  }
  requestAnimationFrame(frame);
}

function newRun() {
  game.floorNum = 1;
  game.kills = 0; game.roomsSeen = 0; game.runTime = 0;
  game.theme = choice(THEMES);
  game.player = new Player(ROOM_W / 2, ROOM_H / 2);
  game.player.char = Meta.load().char || 0;
  game.particles = []; game.toast = null;
  game.taughtClear = false; game.taughtWeapon = false; game.taughtDash = false; game.lastKiller = null; game.hint = null;
  // 应用局间永久强化（锻造工坊）
  const m = Meta.load();
  const p = game.player;
  p.dmg += .8 * m.up.wpn;
  p.maxHearts += 2 * m.up.hp; p.hearts = p.maxHearts;
  p.speed += .15 * m.up.spd;
  p.coins += 3 * m.up.coin;
  p.dashCdMax = Math.max(24, p.dashCdMax - 10 * m.up.dash);
  game.reviveAvail = m.up.revive > 0;
  game.soulsRun = 0; game.levelUps = 0; game.pendingLevelUps = 0; game.levelChoices = null;
  Touch.sticks.move = Touch.sticks.aim = null;
  Touch.dashTap = false; Touch.tapped = false; Touch.menuTap = null; Touch.startedInPlay.clear();
  loadFloor(1);
  game.state = 'play'; game.paused = false;
  BGM.start();
}

// ── 升级三选一 ──
game.gainXp = function (n) {
  const p = game.player;
  p.xp += n;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext; p.level++;
    p.xpNext = 6 + p.level * 5;
    game.pendingLevelUps++;
  }
  if (game.pendingLevelUps > 0 && game.state === 'play') game.openLevelUp();
};
game.openLevelUp = function () {
  const p = game.player;
  const pool = UPGRADES.filter(u => (p.upLv[u.id] || 0) < u.max);
  const picks = [];
  const bag = pool.slice();
  for (let i = 0; i < 3 && bag.length; i++)
    picks.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  game.levelChoices = picks.length ? picks : null;
  if (!game.levelChoices) { game.pendingLevelUps = 0; return; }
  game.state = 'levelup';
  SFX.play('item');
};
game.pickUpgrade = function (i) {
  const u = game.levelChoices && game.levelChoices[i];
  if (!u) return;
  const p = game.player;
  p.upLv[u.id] = (p.upLv[u.id] || 0) + 1;
  u.apply(p);
  game.levelUps++;
  game.toast = { item: { name: u.name, desc: u.desc, color: u.c }, t: 140 };
  game.pendingLevelUps--;
  game.levelChoices = null;
  if (game.pendingLevelUps > 0) game.openLevelUp();
  else game.state = 'play';
};

function loadFloor(n) {
  game.floorNum = n;
  game.floor = genFloor(n);
  const start = game.floor.rooms.get(game.floor.startId);
  enterRoom(start, null);
}

function enterRoom(room, fromDir) {
  game.cur = room;
  game.particles = [];
  game.fx = [];
  if (!room.visited) { room.visited = true; game.roomsSeen++; }
  room.tears = []; // 敌方弹幕进房即散

  let ex = ROOM_W / 2, ey = ROOM_H / 2;
  if (fromDir) {
    // 从 fromDir 方向穿门 → 出现在新房间 OPP[fromDir] 侧的门，并向房内推
    const side = OPP[fromDir];
    const [dx, dy] = DOOR_CELL[side];
    ex = dx * TILE + TILE / 2; ey = dy * TILE + TILE / 2;
    const [vx, vy] = DVEC[side];
    ex -= vx * TILE * 1.35; ey -= vy * TILE * 1.35;
  }
  createRoomContents(room, game.floorNum, ex, ey);
  game.player.x = ex; game.player.y = ey;
  game.player.q = []; game.player.dashing = 0; // 跨房不清位移会带进新房"幽灵冲刺" 

  if (!room.cleared && room.enemies.length > 0) {
    SFX.play('doorOpen');
    if (!game.taughtClear) { // 首次进战斗房的教学提示，一局只出现一次
      game.taughtClear = true;
      game.hint = { text: '清光敌人，门才会开 —— 方向键/右摇杆射击', t: 260 };
    }
  }
  if (room.boss) SFX.play('bossRoar');
}

// ── 更新 ──
function update() {
  game.time++;
  Input.tick();
  if (Input.pressed('KeyF')) { // F 一键全屏：窗口太小时的自救键
    const el = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
  if (game.state === 'title') {
    const mt = Touch.menuTap; Touch.menuTap = null;
    const m = Meta.load();
    for (let i = 0; i < CHARS.length; i++) {
      if (Input.pressed('Digit' + (i + 1)) || (mt && inZone(mt, charZones()[i]))) { m.char = i; Meta.save(); SFX.play('coin'); Touch.tapped = false; } // 点卡=只选人，不触发"点屏开局"
    }
    if (Input.pressed('Enter')) newRun();
    else if (Input.pressed('KeyS')) { game.workshopFrom = 'title'; game.state = 'workshop'; }
    else if (mt && inZone(mt, workshopBtnZone())) { game.workshopFrom = 'title'; game.state = 'workshop'; }
    else if (mt && !CHARS.some((_, i) => inZone(mt, charZones()[i]))) newRun(); // 点选人区外才开局
    else if (Touch.tapped) newRun();
    Touch.tapped = false;
    return;
  }
  if (game.state === 'levelup') {
    for (let i = 0; i < 3; i++) if (Input.pressed('Digit' + (i + 1))) game.pickUpgrade(i);
    const mt = Touch.menuTap; Touch.menuTap = null;
    if (mt) {
      const zones = levelCardZones();
      for (let i = 0; i < zones.length; i++)
        if (inZone(mt, zones[i])) { game.pickUpgrade(i); break; }
    }
    return;
  }
  if (game.state === 'workshop') {
    const mt = Touch.menuTap; Touch.menuTap = null;
    if (Input.pressed('Escape') || (mt && inZone(mt, backBtnZone()))) {
      game.state = (game.workshopFrom === 'dead' || game.workshopFrom === 'win') ? game.workshopFrom : 'title';
      Touch.tapped = false; return;
    }
    for (let i = 0; i < META_UPS.length; i++) {
      const want = Input.pressed('Digit' + (i + 1)) || (mt && inZone(mt, metaRowZone(i)));
      if (want) SFX.play(Meta.buy(META_UPS[i].id) === 'ok' ? 'coin' : 'deny');
    }
    Touch.tapped = false;
    return;
  }
  if (game.state === 'dead' || game.state === 'win') {
    const mt = Touch.menuTap; Touch.menuTap = null;
    if (Input.pressed('KeyR')) newRun();
    else if (Input.pressed('KeyS')) { game.workshopFrom = game.state; game.state = 'workshop'; }
    else if (Input.pressed('Escape')) game.state = 'title';
    else if (mt && inZone(mt, workshopBtnZone())) { game.workshopFrom = game.state; game.state = 'workshop'; }
    else if (mt || Touch.tapped) newRun();
    Touch.tapped = false;
    return;
  }
  if (Input.pressed('KeyP') || Touch.pauseTap) { game.paused = !game.paused; Touch.pauseTap = false; }
  if (Input.pressed('KeyM') || Touch.muteTap) { Touch.muteTap = false; game.bgmOn = BGM.toggle(); game.toastBgm = 90; }
  if (game.paused) return;

  game.runTime++;
  Object.defineProperty(game, 'diff', { get() { return 1 + (game.runTime / 3600) * .08; }, configurable: true });
  Touch.tapped = false; // play 态不累积点屏标志：手指常按摇杆时死亡不能被 0 帧跳过
  Touch.menuTap = null; // 战斗中的鼠标点击不应残留到下一个菜单态
  if (game.shakeAmt > 0) game.shakeAmt *= .84;
  if (game.flashT > 0) game.flashT--;
  if (game.toast) { game.toast.t--; if (game.toast.t <= 0) game.toast = null; }
  if (game.hint) { game.hint.t--; if (game.hint.t <= 0) game.hint = null; }

  const room = game.cur, p = game.player;
  p.update(room);

  // 配额制持续刷怪：没杀满就一直从边缘补怪；杀满后残余蒸发
  if (room.quota && !room.cleared) {
    if (room.killed < room.quota) {
      if (--room.spawnT <= 0 && room.enemies.length < 7) waveSpawn(room, game.floorNum);
    } else {
      for (const e of room.enemies) {
        if (!e.dead) { e.dead = true; spawnParticles(room, e.x, e.y, 5, '#a82020', 2.4); }
      }
    }
  }

  for (const e of room.enemies) if (!e.dead) e.update(room);
  if (room.boss && !room.boss.dead) room.boss.update(room);
  const tearN = room.tears.length; // 快照长度迭代：分裂弹 push 不再同帧二次更新
  for (let i = 0; i < tearN; i++) room.tears[i].update(room);
  for (const pk of room.pickups) if (!pk.dead) pk.update(room);

  handleCollisions(room);

  // 本帧内死亡（同帧先爆死后踩地洞的竞态）→ 立即停止世界推进
  if (game.state !== 'play') return;

  // 清理尸体/弹/拾取物
  room.enemies = room.enemies.filter(e => !e.dead);
  room.tears = room.tears.filter(t => !t.dead);
  room.pickups = room.pickups.filter(k => !k.dead);

  // 清房判定：有配额的房间必须杀满，波次间隙"假清空"不再开门
  if (!room.cleared && room.enemies.length === 0 && (!room.boss || room.boss.dead)) {
    if ((room.hasEnemiesPlanned || room.boss) && (!room.quota || room.killed >= room.quota)) onRoomCleared(room);
  }

  // 粒子与武器特效
  for (const q of game.particles) { q.x += q.vx; q.y += q.vy; q.vy += .12; if (--q.life <= 0) q.dead = true; }
  game.particles = game.particles.filter(q => !q.dead);
  for (const f of game.fx) f.t--;
  game.fx = game.fx.filter(f => f.t > 0);

  // 地洞
  if (room.trapdoor && dist2(p.x, p.y, room.trapdoor.x, room.trapdoor.y) < 26) {
    SFX.play('trapdoor');
    game.soulsRun += 30 * game.floorNum; // 过层奖励
    p.heal(2);
    loadFloor(game.floorNum + 1);
  }

  // 门的通行
  if (room.cleared) tryDoors(room);
}

function handleCollisions(room) {
  const p = game.player;
  for (const tr of room.tears) {
    if (tr.dead) continue;
    if (tr.isPlayer) {
      let hit = false;
      for (const e of room.enemies) {
        if (!e.dead && !(tr.hits || (tr.hits = [])).includes(e) &&
            dist2(tr.x, tr.y, e.x, e.y) < tr.r + e.r) {
          e.hit(tr.dmg, room, tr.x, tr.y);
          tr.hits.push(e);
          if (tr.pierce > 0) { tr.pierce--; } // 穿透：不消失，换下一个目标
          else { hit = true; }
          if (e.cfg.id !== 'minifly' && Math.random() < .35) knockback(e, tr);
          if (hit) break;
        }
      }
      if (!hit && room.boss && !room.boss.dead &&
          dist2(tr.x, tr.y, room.boss.x, room.boss.y) < tr.r + room.boss.r * .85) {
        room.boss.hit(tr.dmg); hit = true;
      }
      if (!hit) for (const o of room.props) {
        if (!o.dead && o.kind === 'junk' && dist2(tr.x, tr.y, o.x, o.y) < tr.r + 14) {
          damageProp(room, o, tr.dmg); hit = true; break;
        }
      }
      if (hit) tr.plop(room);
    } else if (p.inv <= 0 && dist2(tr.x, tr.y, p.x, p.y) < tr.r + p.r * .75) {
      p.hurt(tr.dmg, game, tr.x, tr.y, '敌方弹幕'); tr.plop(room);
    }
  }
  // 接触伤害（出生动画期间的敌人不伤人；双向击退制造挨打感）
  for (const e of room.enemies) {
    if (!e.dead && e.spawnT <= 0 && dist2(e.x, e.y, p.x, p.y) < e.r + p.r * .75) {
      p.hurt(e.cfg.dmg, game, e.x, e.y, e.cfg.label + (e.elite ? '·精英' : ''));
      const d = Math.max(1, dist2(e.x, e.y, p.x, p.y));
      moveCircle(e, (e.x - p.x) / d * 20, (e.y - p.y) / d * 20, room);
    }
  }
  if (room.boss && !room.boss.dead && dist2(room.boss.x, room.boss.y, p.x, p.y) < room.boss.r * .85 + p.r * .7) {
    p.hurt(game.floorNum >= 3 ? 3 : 2, game, room.boss.x, room.boss.y, room.boss.cfg.name); // 前期 Boss 接触伤减半心
  }
}

function knockback(e, tr) {
  const a = Math.atan2(tr.vy, tr.vx);
  moveCircle(e, Math.cos(a) * 6, Math.sin(a) * 6, game.cur);
}

function onRoomCleared(room) {
  room.cleared = true;
  SFX.play('clear');
  if (room.boss) {
    room.boss = null; room.hasEnemiesPlanned = false;
    game.gainXp(30 + 10 * game.floorNum);
    game.soulsRun += 40 + 20 * game.floorNum;
    const cxr = ROOM_W / 2, cyr = ROOM_H / 2;
    room.pickups.push(new Pickup('chest', cxr - 40, cyr));
    if (game.floorNum < 3) room.trapdoor = { x: cxr + 44, y: cyr };
    else room.finalChest = true;
  } else {
    rollClearReward(room, game.floorNum);
    if (room.type === 'normal' && !game.floor.gaveStarter) {
      game.floor.gaveStarter = true;
      game.cur.pickups.push(new Pickup('weapon', ROOM_W / 2 + rand(-40, 40), ROOM_H / 2 + rand(-30, 30), null, 0, pickWeaponId(game.player)));
      game.hint = { text: '拾取武器：同一把枪再捡会升级，换枪会归零', t: 240 };
    }
  }
}

function tryDoors(room) {
  const p = game.player;
  for (const d of DIRS) {
    const nb = room.links[d];
    if (!nb) continue;
    const [dx, dy] = DOOR_CELL[d];
    const cxx = dx * TILE + TILE / 2, cyy = dy * TILE + TILE / 2;
    if (dist2(p.x, p.y, cxx, cyy) < TILE * .72) {
      enterRoom(game.floor.rooms.get(nb), d);
      return;
    }
  }
}

game.die = function () {
  game.state = 'dead'; game.deaths++;
  game.toast = null; game.hint = null; // 结算屏不残留战斗提示文字
  game.bankSouls();
  SFX.play('death');
};
game.victory = function () {
  game.state = 'win';
  const m = Meta.load();
  if (!m.cleared) { game.soulsRun += 300; m.cleared = true; } // 首通大奖
  game.bankSouls();
  SFX.play('clear');
};
game.bankSouls = function () {
  const m = Meta.load();
  m.souls += game.soulsRun;
  game.soulsBanked = game.soulsRun; game.soulsRun = 0;
  m.save ? m.save() : Meta.save();
};

// ── 绘制 ──
function draw() {
  cx.fillStyle = '#000';
  cx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (game.state === 'title') { drawTitle(); return; }
  if (game.state === 'workshop') { drawWorkshop(cx, game); return; }

  const pal = themePal(game.theme || THEMES[0], game.floorNum);
  cx.save();
  if (game.shakeAmt > .5) cx.translate(rand(-game.shakeAmt, game.shakeAmt), rand(-game.shakeAmt, game.shakeAmt));

  drawRoom(cx, game.cur, pal, game.time);
  for (const pk of game.cur.pickups) if (!pk.dead) drawPickup(cx, pk, game.time);
  for (const e of game.cur.enemies) drawEnemy(cx, e, game.time);
  if (game.cur.boss && !game.cur.boss.dead) drawBoss(cx, game.cur.boss, game.time);
  if (!(game.state === 'dead' || game.state === 'win')) drawPlayer(cx, game.player, game.time);
  for (const tr of game.cur.tears) drawTear(cx, tr);
  drawFx(cx, game);
  for (const q of game.particles) {
    cx.globalAlpha = clamp(q.life / 18, 0, 1);
    cx.fillStyle = q.c;
    cx.beginPath(); cx.arc(q.x, q.y + HUD_H, q.r, 0, TAU); cx.fill();
  }
  cx.globalAlpha = 1;
  cx.restore();

  drawHUD(cx, game);
  if (game.state === 'play' && !game.rotMode && cv.getBoundingClientRect().width < 700) { // 画面过小：自救指引 + 视口自检数据
    cx.fillStyle = 'rgba(120,20,20,.88)'; cx.fillRect(ROOM_W / 2 - 258, HUD_H + 2, 516, 36);
    cx.strokeStyle = '#e8c85e'; cx.lineWidth = 1; cx.strokeRect(ROOM_W / 2 - 258, HUD_H + 2, 516, 36);
    cx.fillStyle = '#ffe0c0'; cx.font = 'bold 13px monospace'; cx.textAlign = 'center';
    cx.fillText('画面过小！按 F 全屏 / 最大化窗口 / 按 Ctrl+0 重置缩放', ROOM_W / 2, HUD_H + 17);
    cx.font = '10px monospace'; cx.fillStyle = '#e0b090';
    const vv = window.visualViewport;
    cx.fillText(`诊断[${BUILD}] inner=${innerWidth}x${innerHeight} vv=${vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) + ' scale=' + vv.scale.toFixed(2) : '-'} dpr=${devicePixelRatio}`, ROOM_W / 2, HUD_H + 32);
    cx.textAlign = 'left';
  }
  if (game.state === 'play' && game.cur.quota && !game.cur.cleared) { // 房间底部配额进度：杀到多少才开门一目了然
    const q = game.cur.quota, k = Math.min(game.cur.killed, q), cxb = ROOM_W / 2;
    cx.fillStyle = 'rgba(0,0,0,.55)'; cx.fillRect(cxb - 72, CANVAS_H - 24, 144, 15);
    cx.fillStyle = '#d9a92e'; cx.fillRect(cxb - 70, CANVAS_H - 22, 140 * (k / q), 11);
    cx.strokeStyle = 'rgba(217,169,46,.7)'; cx.lineWidth = 1; cx.strokeRect(cxb - 72, CANVAS_H - 24, 144, 15);
    cx.fillStyle = '#f0e2c0'; cx.font = 'bold 10px monospace'; cx.textAlign = 'center';
    cx.fillText(`本房猎杀 ${k}/${q}`, cxb, CANVAS_H - 13);
    cx.textAlign = 'left';
  }
  drawVignette(cx, game);
  drawSidePanel(cx, game);
  if (game.state === 'levelup') drawLevelUp(cx, game);

  // 受击红闪
  if (game.flashT > 0) {
    cx.fillStyle = `rgba(180,20,20,${(game.flashT / 14) * .22})`;
    cx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }
  if (game.paused && game.state === 'play') {
    cx.fillStyle = 'rgba(0,0,0,.55)'; cx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    cx.fillStyle = '#d8cba8'; cx.font = 'bold 34px monospace'; cx.textAlign = 'center';
    cx.fillText('暂停', ROOM_W / 2, CANVAS_H / 2);
    cx.font = '14px monospace'; cx.fillStyle = '#a8937c';
    cx.fillText(Touch.supported() ? '点右下 ‖ 按钮继续' : '按 P 继续', ROOM_W / 2, CANVAS_H / 2 + 30);
  }
  if ((Touch.supported() || Touch.active) && game.state === 'play') drawTouchUI(cx, game.time);

  if (game.state === 'dead') drawDeathScreen();
  if (game.state === 'win') drawWinScreen();
  // 未清房锁门提示
  if (game.state === 'play' && !game.cur.cleared && game.cur.enemies.length === 0 && !game.cur.boss && !game.cur.hasEnemiesPlanned) {
    // 无怪房间（安全房）不需要提示
  }
}

function drawTitle() {
  const ctx = cx, t = game.time;
  ctx.save();
  ctx.fillStyle = '#0a0808'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.translate(PANEL_W / 2, 0); // 标题内容居中于全画布
  for (let row = 0; row < Math.ceil(CANVAS_H / 24); row++) for (let col = -4; col < 20; col++) {
    const x = col * 52 + (row % 2) * 26, y = row * 24;
    const shade = (row * 7 + col * 13) % 5;
    ctx.fillStyle = ['#170f0b', '#1a120c', '#150e09', '#1b130d', '#160f0a'][shade];
    ctx.fillRect(x + 1, y + 1, 50, 22);
  }
  // 干涸血渍
  ctx.fillStyle = 'rgba(60,12,10,.5)';
  for (const [bx, by, br] of [[120, 90, 26], [560, 60, 18], [640, 400, 30], [80, 430, 22], [300, 480, 16]]) {
    ctx.beginPath(); ctx.ellipse(bx, by, br, br * .55, br, 0, TAU); ctx.fill();
  }
  // 身后透光的门洞
  const dg = ctx.createRadialGradient(ROOM_W / 2, 318, 8, ROOM_W / 2, 318, 110);
  dg.addColorStop(0, 'rgba(255,190,110,.16)'); dg.addColorStop(.5, 'rgba(180,110,50,.07)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(ROOM_W / 2, 318, 110, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(5,3,2,.85)';
  ctx.beginPath();
  ctx.moveTo(ROOM_W / 2 - 44, 372); ctx.lineTo(ROOM_W / 2 - 44, 268);
  ctx.quadraticCurveTo(ROOM_W / 2, 214, ROOM_W / 2 + 44, 268);
  ctx.lineTo(ROOM_W / 2 + 44, 372); ctx.fill();
  // 背景晕光
  const g = ctx.createRadialGradient(ROOM_W / 2, CANVAS_H / 2, 60, ROOM_W / 2, CANVAS_H / 2, 420);
  g.addColorStop(0, 'rgba(36,21,18,.0)'); g.addColorStop(1, 'rgba(3,2,2,.82)');
  ctx.fillStyle = g; ctx.fillRect(-PANEL_W / 2, 0, CANVAS_W, CANVAS_H);

  // 标题
  ctx.save();
  ctx.translate(ROOM_W / 2, 122);
  ctx.fillStyle = '#120808';
  ctx.font = 'bold 64px monospace'; ctx.textAlign = 'center';
  ctx.fillText('解救行动', 3, 5);
  ctx.fillStyle = '#c98f2e';
  ctx.fillText('解救行动', 0, 0);
  // 标题火星飞散
  ctx.fillStyle = '#e8b24a';
  for (let i = 0; i < 6; i++) {
    const x = -130 + i * 52 + Math.sin(i * 5) * 16;
    const y = 14 + ((t * .05 + i * 27) % 34);
    ctx.globalAlpha = clamp(1 - (y - 14) / 34, 0, 1) * .8;
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  ctx.fillStyle = '#8a9ab0'; ctx.font = '16px monospace'; ctx.textAlign = 'center';
  ctx.fillText('O P E R A T I O N :   R E S C U E', ROOM_W / 2, 158);
  ctx.fillStyle = '#5a6472'; ctx.font = '12px monospace';
  ctx.fillText('— 突入敌楼，逐层清剿，解救人质 —', ROOM_W / 2, 180);

  // 角色选择行（4 个可选干员，纯外观；点击/数字键 1-4 选择）
  ctx.fillStyle = '#8a7a66'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
  ctx.fillText('选择干员（1-4 键或点击 · 纯外观差异）', ROOM_W / 2, 236);
  const cz = charZones();
  CHARS.forEach((ch, i) => {
    const z = cz[i], sel = (Meta.load().char || 0) === i;
    ctx.fillStyle = sel ? 'rgba(60,44,26,.95)' : 'rgba(24,18,12,.85)';
    ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 7); ctx.fill();
    ctx.strokeStyle = sel ? '#e8c85e' : '#4a3a2a'; ctx.lineWidth = sel ? 2.4 : 1.4;
    ctx.beginPath(); ctx.roundRect(z.x, z.y, z.w, z.h, 7); ctx.stroke();
    ctx.save(); ctx.translate(z.x + z.w / 2, z.y + 34); ctx.scale(1.5, 1.5);
    drawPlayer(ctx, { x: 0, y: -HUD_H, inv: 0, anim: 0, moving: false, aim: { x: 0, y: 1 }, shotsPerDir: 1, char: i }, t);
    ctx.restore();
    ctx.fillStyle = sel ? '#e8c85e' : '#8a7a66'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    ctx.fillText(ch.name, z.x + z.w / 2, z.y + z.h - 6);
  });

  // 脚下血泊与泪迹
  ctx.fillStyle = 'rgba(70,10,10,.55)';
  ctx.beginPath(); ctx.ellipse(ROOM_W / 2, 378, 62, 13, .06, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(140,190,255,.18)';
  ctx.beginPath(); ctx.ellipse(ROOM_W / 2 + 30, 384, 16, 4, 0, 0, TAU); ctx.fill();
  // 本局主题预告（随机于开局）
  ctx.fillStyle = '#5a6472'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
  ctx.fillText('本局行动区域随机 · 逐层深入解救人质', ROOM_W / 2, 366);
  const fly = { cfg: ETYPE.fly, x: ROOM_W / 2 + Math.cos(t * .04) * 150, y: 205 + Math.sin(t * .04) * 18, r: 12, flash: 0, spawnT: 0 };
  const fly2 = { cfg: ETYPE.attackfly, x: ROOM_W / 2 + Math.cos(t * .05 + 3) * 190, y: 222 + Math.sin(t * .03 + 2) * 14, r: 11, flash: 0, spawnT: 0 };
  drawEnemy(ctx, fly, t); drawEnemy(ctx, fly2, t);

  // 提示
  if (Math.floor(t / 32) % 2 === 0) {
    cx.fillStyle = '#e0d0b8'; cx.font = 'bold 20px monospace';
    cx.fillText(Touch.supported() ? '轻触屏幕 开始行动' : '按 Enter 开始行动', ROOM_W / 2, 424);
  }
  drawWorkshopBtn(cx, game);
  cx.fillStyle = '#8a7a66'; cx.font = '12px monospace';
  cx.fillText(Touch.supported() ? '左摇杆移动 · 右摇杆射击 · 打怪升级三选一 · 攒魂进工坊' : 'WASD 移动 · 方向键射击 · Space 冲刺 · 打怪升级三选一 · 攒魂进工坊', ROOM_W / 2, 490);
  ctx.restore(); // 归还标题居中变换
  cx.fillStyle = 'rgba(138,115,96,.55)'; cx.font = '10px monospace'; cx.textAlign = 'right';
  cx.fillText(BUILD, CANVAS_W - 6, CANVAS_H - 6); cx.textAlign = 'left';
}

function statLines() {
  const p = game.player;
  const sec = Math.floor(game.runTime / 60);
  return [
    `突入区域：${game.theme ? game.theme.floors[game.floorNum - 1] : ''}`,
    `击杀：${game.kills}    探索房间：${game.roomsSeen}`,
    `拾取道具：${p ? p.items.length : 0} 个    存活时间：${Math.floor(sec / 60)}分${sec % 60}秒`,
  ];
}

function drawDeathScreen() {
  cx.fillStyle = 'rgba(20,2,2,.78)';
  cx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  cx.save(); cx.translate(PANEL_W / 2, 0);
  cx.fillStyle = '#c4303a'; cx.font = 'bold 58px monospace'; cx.textAlign = 'center';
  cx.fillText('行 动 失 败', ROOM_W / 2, 170);
  cx.fillStyle = '#8a5a4a'; cx.font = '15px monospace';
  statLines().forEach((s, i) => cx.fillText(s, ROOM_W / 2, 240 + i * 26));
  cx.fillStyle = '#c46a5a'; cx.font = '13px monospace';
  cx.fillText(`致命伤来自：${game.lastKiller || '未知'}`, ROOM_W / 2, 330);
  const p = game.player;
  if (p && p.items.length) {
    p.items.slice(0, 9).forEach((it, i) => {
      drawItemIcon(cx, it, ROOM_W / 2 - (Math.min(p.items.length, 9) - 1) * 20 + i * 40, 350, game.time);
    });
  }
  cx.fillStyle = '#b093e8'; cx.font = 'bold 14px monospace';
  cx.fillText(`本局收获魂 +${game.soulsBanked || 0}（已入库）`, ROOM_W / 2, 412);
  drawWorkshopBtn(cx, game);
  if (Math.floor(game.time / 30) % 2 === 0) {
    cx.fillStyle = '#e0d0b8'; cx.font = 'bold 14px monospace';
    cx.fillText(Touch.supported() ? '点别处再来一局 · 点工坊按钮强化自己' : 'R 再来一局 · S 工坊 · Esc 回标题', ROOM_W / 2, 490);
  }
  cx.restore();
}

function drawWinScreen() {
  cx.fillStyle = 'rgba(10,8,2,.72)';
  cx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  cx.save(); cx.translate(PANEL_W / 2, 0);
  cx.fillStyle = '#e8c85e'; cx.font = 'bold 46px monospace'; cx.textAlign = 'center';
  cx.fillText('人 质 解 救 成 功', ROOM_W / 2, 170);
  cx.fillStyle = '#9a8a5a'; cx.font = '15px monospace';
  statLines().forEach((s, i) => cx.fillText(s, ROOM_W / 2, 240 + i * 26));
  cx.fillStyle = '#b093e8'; cx.font = 'bold 14px monospace';
  cx.fillText(`本局收获魂 +${game.soulsBanked || 0}（已入库）`, ROOM_W / 2, 400);
  drawWorkshopBtn(cx, game);
  if (Math.floor(game.time / 30) % 2 === 0) {
    cx.fillStyle = '#e0d0b8'; cx.font = 'bold 14px monospace';
    cx.fillText(Touch.supported() ? '点别处再战一局' : 'R 再战一局 · S 工坊 · Esc 回标题', ROOM_W / 2, 490);
  }
  cx.restore();
}

boot();
