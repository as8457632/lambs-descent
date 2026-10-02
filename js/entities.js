'use strict';
// ─────────────────────────────────────────────
// 实体：玩家 / 弹道 / 敌人 / Boss / 掉落 / 道具
// ─────────────────────────────────────────────

function hitWall(room, x, y, r) {
  for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, -r], [0, r], [-r, 0], [r, 0]]) {
    if (room.solidTile(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE))) return true;
  }
  return false;
}
function moveCircle(e, dx, dy, room) {
  const r = e.r * .8;
  if (dx && !hitWall(room, e.x + dx, e.y, r)) e.x += dx;
  if (dy && !hitWall(room, e.x, e.y + dy, r)) e.y += dy;
}

// ── 泪弹 / 敌方弹 ──
class Tear {
  constructor(x, y, vx, vy, dmg, r, isPlayer, opts = {}) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.dmg = dmg; this.r = r; this.isPlayer = isPlayer;
    this.life = opts.life || 80; this.dead = false;
    this.homing = opts.homing || false; this.big = opts.big || false;
    this.colorKey = opts.colorKey || null;
    this.pierce = opts.pierce || 0;
    if (opts.splitT !== undefined) { this.splitT = opts.splitT; this.sp = Math.hypot(vx, vy); this.rot = opts.rot; this.eliteSplit = opts.eliteSplit; }
  }
  update(room) {
    if (this.homing) {
      const tgt = this.isPlayer ? nearestEnemy(room, this.x, this.y) : game.player;
      if (tgt) {
        const a0 = Math.atan2(this.vy, this.vx), sp = Math.hypot(this.vx, this.vy);
        let a1 = Math.atan2(tgt.y - this.y, tgt.x - this.x);
        let da = a1 - a0; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        const a2 = a0 + clamp(da, -.09, .09);
        this.vx = Math.cos(a2) * sp; this.vy = Math.sin(a2) * sp;
      }
    }
    this.x += this.vx; this.y += this.vy;
    if (this.splitT !== undefined && --this.splitT <= 0) {
      this.dead = true;
      const base = Math.PI / 4 + (this.rot || 0);
      for (let i = 0; i < 4; i++) {
        const a = base + i * Math.PI / 2;
        room.tears.push(new Tear(this.x, this.y, Math.cos(a) * this.sp, Math.sin(a) * this.sp,
          2, 5.5, false, { life: 90 }));
      }
      if (this.eliteSplit) for (let i = 0; i < 4; i++) {
        const a = base + Math.PI / 4 + i * Math.PI / 2;
        room.tears.push(new Tear(this.x, this.y, Math.cos(a) * this.sp, Math.sin(a) * this.sp,
          2, 5.5, false, { life: 90 }));
      }
      SFX.play('enemyShoot');
      return;
    }
    if (--this.life <= 0) { this.plop(room); return; }
    if (hitWall(room, this.x, this.vy ? this.y + Math.sign(this.vy) * this.r : this.y, this.r * .6) ||
        hitWall(room, this.vx ? this.x + Math.sign(this.vx) * this.r : this.x, this.y, this.r * .6)) {
      this.plop(room);
    }
  }
  plop(room) {
    this.dead = true;
    spawnParticles(room, this.x, this.y, 3, this.isPlayer ? '#9cc4ee' : '#c96a4a', 1.4);
  }
}

function nearestEnemy(room, x, y) {
  let best = null, bd = 1e9;
  for (const e of room.enemies) { if (e.dead) continue; const d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
  if (room.boss && !room.boss.dead) { const d = dist2(x, y, room.boss.x, room.boss.y); if (d < bd) best = room.boss; }
  return best;
}

// ── 局内升级三选一卡池（可叠加，带等级上限）──
const UPGRADES = [
  { id: 'spread',  name: '散弹之芯', desc: '弹数 +1（每发伤害 -10%）', max: 3, c: '#e8a83a', glyph: '散',
    apply(p) { p.shotsPerDir++; p.dmg *= .9; } },
  { id: 'dmg',     name: '空尖弹', desc: '伤害 +15%', max: 5, c: '#c94a4a', glyph: '刃',
    apply(p) { p.dmg *= 1.15; } },
  { id: 'rate',    name: '急促呼吸', desc: '射击间隔 -2 帧', max: 4, c: '#8ecbff', glyph: '急',
    apply(p) { p.fireDelay = Math.max(5, p.fireDelay - 2); } },
  { id: 'boots',   name: '鼠捷之靴', desc: '移动速度 +0.3', max: 3, c: '#7fae5a', glyph: '捷',
    apply(p) { p.speed += .3; } },
  { id: 'pierce',  name: '贯穿之刺', desc: '子弹穿透 +1 个敌人', max: 2, c: '#b8c4cc', glyph: '穿',
    apply(p) { p.pierce++; } },
  { id: 'homing',  name: '磁引之核', desc: '眼泪追踪敌人', max: 1, c: '#7f7fe8', glyph: '磁',
    apply(p) { p.homing = true; } },
  { id: 'vital',   name: '生之心', desc: '上限 +1 心并回满', max: 3, c: '#c4303a', glyph: '生',
    apply(p) { p.maxHearts += 2; p.hearts = p.maxHearts; } },
  { id: 'vacuum',  name: '贪婪磁石', desc: '拾取范围 +45', max: 2, c: '#d9a92e', glyph: '贪',
    apply(p) { p.pickupMag += 45; } },
  { id: 'dashcd',  name: '疾风核心', desc: '冲刺冷却 -18%', max: 3, c: '#7fb2e8', glyph: '风',
    apply(p) { p.dashCdMax = Math.max(24, Math.round(p.dashCdMax * .82)); } },
  { id: 'vamp',    name: '荆棘血约', desc: '击杀 8% 概率掉半心', max: 2, c: '#b06a8e', glyph: '血',
    apply(p) { p.vamp += .08; } },
  { id: 'longer',  name: '长歌之弦', desc: '射程 +20%', max: 2, c: '#b093e8', glyph: '弦',
    apply(p) { p.tearLife = Math.round(p.tearLife * 1.2); } },
];

// ── 玩家：移动 / 瞄准 / 射击 / 经验 ──
class Player {
  constructor(x, y) {
    this.x = x; this.y = y; this.r = 15;
    this.speed = 3.0; this.dmg = 3.2; this.tearSpeed = 6.6; this.tearR = 6.5;
    this.fireDelay = 13; this.tearLife = 80;
    this.hearts = 6; this.maxHearts = 6;
    this.coins = 0; this.keys = 0;
    this.dashCd = 0; this.dashCdMax = 70; this.dashing = 0; this.dashVx = 0; this.dashVy = 0;
    this.homing = false; this.shotsPerDir = 1; this.pickupMag = 24;
    this.pierce = 0; this.vamp = 0;
    this.weapon = { id: 'tear', lvl: 1 };
    this.level = 1; this.xp = 0; this.xpNext = 8; this.upLv = {};
    this.inv = 0; this.cd = 0; this.q = [];
    this.aim = { x: 0, y: 1 }; this.moving = false; this.anim = 0;
    this.items = [];
  }
  hurt(n, g, srcX, srcY, killer) {
    if (this.inv > 0 || g.state !== 'play') return;
    this.hearts -= n; this.inv = 90;
    g.lastKiller = killer || '未知';
    this.q = []; // 受击打断已排队的连射
    g.flashT = 14;
    if (srcX !== undefined) { // 玩家自己被弹开，制造"挨打感"与脱离贴脸
      const d = Math.max(1, dist2(this.x, this.y, srcX, srcY));
      moveCircle(this, (this.x - srcX) / d * 14, (this.y - srcY) / d * 14, g.cur);
    }
    SFX.play('hurt'); shake(n >= 3 ? 9 : 5);
    spawnParticles(g.cur, this.x, this.y, 10, '#c93030', 3);
    addBlood(g.cur, this.x, this.y, 14);
    if (this.hearts <= 0 && g.reviveAvail) { // 亡者残响：每局一次的复活
      g.reviveAvail = false;
      this.hearts = 4; this.inv = 200;
      g.hint = { text: '亡者残响：你从血泊里爬了回来', t: 160 };
      SFX.play('item'); shake(10);
      return;
    }
    if (this.hearts <= 0) { this.hearts = 0; g.die(); }
  }
  fireLaser(room, ux, uy, lvl) {
    const len = (340 + 30 * lvl) * (this.tearLife / 80), hitR = 13 + 2.5 * lvl; // 射程随 tearLife 成长（长歌之弦等）
    const dmg = weaponDmg(this, WEAPONS.laser);
    let ex = this.x, ey = this.y;
    const hits = [];
    for (let d = 18; d < len; d += 7) {
      const px = this.x + ux * d, py = this.y + uy * d;
      if (room.solidTile(Math.floor(px / TILE), Math.floor(py / TILE))) break;
      ex = px; ey = py;
      for (const e of room.enemies)
        if (!e.dead && e.spawnT <= 0 && !hits.includes(e) && dist2(px, py, e.x, e.y) < hitR + e.r * .6) { hits.push(e); }
      if (room.boss && !room.boss.dead && !hits.includes(room.boss) && dist2(px, py, room.boss.x, room.boss.y) < room.boss.r * .9) hits.push(room.boss);
    }
    for (const h of hits) h.hit ? (h.cfg ? h.hit(dmg, room, h.x, h.y) : h.hit(dmg)) : null;
    game.fx.push({ type: 'laser', x1: this.x + ux * 16, y1: this.y + uy * 16, x2: ex, y2: ey, w: 5 + 2.2 * lvl, t: 9 });
    SFX.play('laser');
  }
  fireChain(room, ux, uy, lvl) {
    const dmg = weaponDmg(this, WEAPONS.light);
    const maxChain = 2 + Math.min(3, lvl);
    const pts = [{ x: this.x + ux * 14, y: this.y + uy * 14 }];
    const hit = [];
    const los = (x1, y1, x2, y2) => {
      const d = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(d / 16));
      for (let i = 1; i < n; i++) {
        const x = x1 + (x2 - x1) * i / n, y = y1 + (y2 - y1) * i / n;
        if (room.solidTile(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
      }
      return true;
    };
    for (let c = 0; c < maxChain; c++) {
      let best = null, bd = c === 0 ? 280 * (this.tearLife / 80) : 170;
      for (const e of room.enemies) {
        if (e.dead || e.spawnT > 0 || hit.includes(e)) continue;
        const d = dist2(pts[c].x, pts[c].y, e.x, e.y);
        if (d < bd && los(pts[c].x, pts[c].y, e.x, e.y)) { bd = d; best = e; }
      }
      if (room.boss && !room.boss.dead && !hit.includes(room.boss)) {
        const d = dist2(pts[c].x, pts[c].y, room.boss.x, room.boss.y);
        if (d < bd && los(pts[c].x, pts[c].y, room.boss.x, room.boss.y)) { bd = d; best = room.boss; }
      }
      if (!best) break;
      hit.push(best);
      pts.push({ x: best.x, y: best.y });
      if (best.cfg) best.hit(dmg, room, best.x, best.y); else best.hit(dmg);
    }
    if (pts.length > 1) {
      game.fx.push({ type: 'bolt', pts, t: 10 });
      SFX.play('zap');
    } else {
      // 无目标时向前发射一枚短程电弧弹，保证开火必有反馈
      room.tears.push(new Tear(this.x + ux * 14, this.y + uy * 14,
        ux * this.tearSpeed * .9, uy * this.tearSpeed * .9, dmg * .7, 6 + lvl * .6, true,
        { life: Math.round(30 * (this.tearLife / 80)), colorKey: 'spark', pierce: 1 }));
      SFX.play('zap');
    }
  }
  heal(n) { this.hearts = clamp(this.hearts + n, 0, this.maxHearts); }
  update(room) {
    if (this.inv > 0) this.inv--;
    // 玩家卡岩自救（击退/异常导致的嵌入），与敌人同策略，防永久软锁
    if (room.solidTile(Math.floor(this.x / TILE), Math.floor(this.y / TILE))) {
      outer: for (let r2 = 1; r2 < 5; r2++)
        for (let oy = -r2; oy <= r2; oy++) for (let ox = -r2; ox <= r2; ox++) {
          const tx = Math.floor(this.x / TILE) + ox, ty = Math.floor(this.y / TILE) + oy;
          if (tx > 0 && ty > 0 && tx < GRID_W - 1 && ty < GRID_H - 1 && !room.solidTile(tx, ty)) {
            this.x = tx * TILE + 24; this.y = ty * TILE + 24; break outer;
          }
        }
    }
    let [mx, my] = Input.dir('v');
    if (Touch.active) {
      const [tx, ty] = Touch.vector('move');
      mx += tx; my += ty;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
    }
    this.moving = !!(mx || my);
    // 冲刺（Space / 触屏按钮）：移动方向优先，静止时朝枪口；带无敌帧，可撞开宝箱与杂物
    if ((Input.pressed('Space') || Touch.dashTap) && this.dashCd <= 0 && this.dashing <= 0) {
      Touch.dashTap = false;
      let dx = mx, dy = my;
      if (!dx && !dy) { dx = this.aim.x; dy = this.aim.y; }
      const l = Math.hypot(dx, dy) || 1;
      this.dashing = 13; this.dashVx = dx / l * 9.2; this.dashVy = dy / l * 9.2;
      this.dashCd = this.dashCdMax;
      SFX.play('dash');
      if (!game.taughtDash) { game.taughtDash = true; game.hint = { text: '冲刺有无敌帧，还能撞开箱子和杂物', t: 200 }; }
    } else if (Touch.dashTap) Touch.dashTap = false;
    if (this.dashing > 0) {
      this.dashing--;
      this.inv = Math.max(this.inv, 2); // 冲刺全程无敌
      moveCircle(this, this.dashVx, this.dashVy, room);
      if (this.dashing % 2 === 0) game.fx.push({ type: 'ghost', x: this.x, y: this.y, char: this.char, t: 8 });
      for (const pk of room.pickups)
        if (!pk.dead && pk.kind === 'chest' && dist2(pk.x, pk.y, this.x, this.y) < pk.r + this.r) openChest(room, pk);
      for (const o of room.props)
        if (!o.dead && dist2(o.x, o.y, this.x, this.y) < 20 + this.r) damageProp(room, o, 99);
      if (this.dashing === 0) this.inv = Math.max(this.inv, 3); // 尾帧仅 3 帧缓冲，配合 CD 防永无敌
    } else if (this.moving) { this.anim++; moveCircle(this, mx * this.speed, my * this.speed, room); }
    if (this.dashCd > 0) this.dashCd--;
    // 射击（方向键优先，其次右摇杆）：按当前武器分派弹道
    let [ax, ay] = Input.dir('a');
    if (!ax && !ay && Touch.active) { const v = Touch.vector('aim'); ax = v[0]; ay = v[1]; }
    if (ax || ay) {
      const l = Math.hypot(ax, ay);
      const ux = ax / l, uy = ay / l;
      this.aim = { x: ux, y: uy };
      const w = WEAPONS[this.weapon.id];
      const effCd = Math.max(4, Math.round(w.cd * (this.fireDelay / 13)));
      if (this.cd <= 0) {
        this.cd = effCd;
        const lvl = this.weapon.lvl;
        if (w.id === 'tear') {
          for (let i = 0; i < this.shotsPerDir; i++) this.q.push({ dx: ux, dy: uy, d: i * 7, kind: 'tear' });
        } else if (w.id === 'flame') {
          const n = 3 + Math.floor(lvl / 2), base = Math.atan2(uy, ux);
          for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * .17 + rand(-.04, .04);
            const sp = this.tearSpeed * rand(.8, .98);
            room.tears.push(new Tear(this.x + Math.cos(a) * 14, this.y + Math.sin(a) * 14,
              Math.cos(a) * sp, Math.sin(a) * sp, weaponDmg(this, w), 6.5 + lvl * .8, true,
              { life: 24 + lvl * 3, colorKey: 'flame' }));
          }
          SFX.play('flame');
        } else if (w.id === 'laser') {
          this.fireLaser(room, ux, uy, lvl);
        } else if (w.id === 'light') {
          this.fireChain(room, ux, uy, lvl);
        }
      }
    }
    if (this.cd > 0) this.cd--;
    for (const s of this.q) {
      if (--s.d <= 0) {
        const j = (s.kind === 'tear') ? (Math.random() - .5) * .06 : 0;
        const c = Math.cos(j), sn = Math.sin(j);
        const dx = s.dx * c - s.dy * sn, dy = s.dx * sn + s.dy * c;
        room.tears.push(new Tear(
          this.x + dx * 16, this.y + dy * 16,
          dx * this.tearSpeed, dy * this.tearSpeed,
          weaponDmg(this, WEAPONS.tear), this.tearR, true,
          { life: this.tearLife, homing: this.homing, big: this.tearR > 9, pierce: this.pierce }
        ));
        SFX.play('shoot');
      }
    }
    this.q = this.q.filter(s => s.d > 0);
  }
}

// ── 敌人配置 ──
const ETYPE = {
  fly:       { id: 'fly',       label: '绿头蝇',   hp: 4,  r: 12, spd: 1.0, dmg: 2, ai: 'wander' },
  attackfly: { id: 'attackfly', label: '吸血蝇',   hp: 4,  r: 11, spd: 1.7, dmg: 2, ai: 'chase' },
  gaper:     { id: 'gaper',     label: '空洞行者', hp: 11, r: 16, spd: 1.2, dmg: 2, ai: 'chase' },
  pooter:    { id: 'pooter',    label: '喷射囊',   hp: 8,  r: 14, spd: .9,  dmg: 2, ai: 'shooter', fire: 105, bs: 2.7 },
  spider:    { id: 'spider',    label: '裂腭蛛',   hp: 5,  r: 13, spd: 1.9, dmg: 2, ai: 'zig' },
  hopper:    { id: 'hopper',    label: '跳脸蛤',   hp: 8,  r: 14, spd: 2.6, dmg: 2, ai: 'hop' },
  splitter:  { id: 'splitter',  label: '脓包分裂怪', hp: 10, r: 15, spd: 1.2, dmg: 2, ai: 'chase', split: 'minifly' },
  minifly:   { id: 'minifly',   label: '小飞虫',   hp: 3,  r: 8,  spd: 2.1, dmg: 2, ai: 'chase' },
  turret:    { id: 'turret',    label: '四向炮台', hp: 12, r: 14, spd: 0,   dmg: 2, ai: 'turret',  fire: 85,  bs: 2.7 },
  spreader:  { id: 'spreader',  label: '散射甲虫', hp: 9,  r: 14, spd: 1.0, dmg: 2, ai: 'spread',  fire: 95,  bs: 2.9 },
  ghost:     { id: 'ghost',     label: '孤魂',     hp: 10, r: 15, spd: .75, dmg: 2, ai: 'ghostx',  fire: 135, bs: 2.3, float: true },
  bat:       { id: 'bat',       label: '血蝠',     hp: 5,  r: 12, spd: 2.2, dmg: 2, ai: 'swoop' },
  mushroom:  { id: 'mushroom',  label: '孢子菇',   hp: 9,  r: 14, spd: 0,   dmg: 2, ai: 'ring',    fire: 150, bs: 2.0 },
  bone:      { id: 'bone',      label: '骨蛇',     hp: 8,  r: 12, spd: 1.1, dmg: 2, ai: 'charge' },
  eye:       { id: 'eye',       label: '浮眼',     hp: 8,  r: 13, spd: .9,  dmg: 2, ai: 'burst',   fire: 130, bs: 2.9 },
};
const ELITE_CHANCE = [0.10, 0.18, 0.26];

class Enemy {
  constructor(typeId, x, y, floorNum, opts = {}) {
    this.cfg = ETYPE[typeId];
    this.x = x; this.y = y; this.r = this.cfg.r;
    this.elite = opts.elite !== undefined ? opts.elite
      : Math.random() < (ELITE_CHANCE[clamp(floorNum - 1, 0, 2)] || 0) && typeId !== 'minifly';
    const es = this.elite ? 2.2 : 1;
    this.hp = Math.ceil(this.cfg.hp * (1 + .35 * (floorNum - 1)) * es * (game.diff || 1));
    this.maxHp = this.hp;
    this.spdMul = this.elite ? 1.12 : 1;
    this.dead = false; this.flash = 0;
    this.spawnT = opts.instant ? 0 : 42; // 出生动画期间不移动不伤人
    this.t = randi(0, 100); this.fire = randi(50, this.cfg.fire || 100);
    this.wdx = rand(-1, 1); this.wdy = rand(-1, 1);
    this.state = 'ground'; this.hopT = randi(20, 50); this.hvx = 0; this.hvy = 0;
  }
  hit(d, room, tx, ty) {
    this.hp -= d; this.flash = 6;
    spawnParticles(room, tx, ty, 4, '#c93030', 2.2);
    if (this.hp <= 0) {
      this.dead = true;
      SFX.play('kill');
      spawnParticles(room, this.x, this.y, 9, '#a82020', 3.2);
      addBlood(room, this.x, this.y, this.r + 6);
      game.kills++;
      if (room.quota && !room.cleared) room.killed++;
      game.gainXp(Math.ceil(this.maxHp / 2));
      game.soulsRun += 2;
      if (Math.random() < .06) // 刷怪流：武器持续掉落
        room.pickups.push(new Pickup('weapon', this.x, this.y, null, 0, pickWeaponId(game.player)));
      if (game.player.vamp > 0 && Math.random() < game.player.vamp)
        room.pickups.push(new Pickup('halfheart', this.x, this.y));
      if (this.elite) // 精英必掉 1 资源，风险回报成立
        room.pickups.push(new Pickup(choice(['coin', 'coin', 'heart', 'key']), this.x, this.y));
      if (this.cfg.split) for (let i = 0; i < 2; i++)
        room.enemies.push(new Enemy(this.cfg.split, this.x + rand(-14, 14), this.y + rand(-14, 14), game.floorNum));
    } else SFX.play('hit');
  }
  update(room) {
    if (this.flash > 0) this.flash--;
    if (this.spawnT > 0) { this.spawnT--; return; }
    // 卡墙自救：非漂浮怪若困在实心格里（击退/生成导致），传送到最近空格，防止房间永远清不掉
    if (this.t % 30 === 0 && !this.cfg.float && room.solidTile(Math.floor(this.x / TILE), Math.floor(this.y / TILE))) {
      outer: for (let r2 = 1; r2 < 5; r2++)
        for (let oy = -r2; oy <= r2; oy++) for (let ox = -r2; ox <= r2; ox++) {
          const tx = Math.floor(this.x / TILE) + ox, ty = Math.floor(this.y / TILE) + oy;
          if (tx > 0 && ty > 0 && tx < GRID_W - 1 && ty < GRID_H - 1 && !room.solidTile(tx, ty)) {
            this.x = tx * TILE + 24; this.y = ty * TILE + 24; break outer;
          }
        }
    }
    this.t++;
    const p = game.player;
    const c = this.cfg;
    const spd = c.spd * this.spdMul;
    const [dx, dy] = [p.x - this.x, p.y - this.y];
    const dl = Math.max(1, Math.hypot(dx, dy));
    const mv = c.float ? moveFloat : ((e, vx, vy, r) => moveCircle(e, vx, vy, r));
    switch (c.ai) {
      case 'wander':
        if (this.t % 70 === 0) { const a = rand(0, TAU); this.wdx = Math.cos(a); this.wdy = Math.sin(a); }
        if (!this.bump(room, this.wdx * spd, this.wdy * spd, mv))
        { const a = rand(0, TAU); this.wdx = Math.cos(a); this.wdy = Math.sin(a); }
        this.bump(room, 0, Math.sin(this.t * .3) * .5, mv); // 抖动也走碰撞，防止漂进石头里
        break;
      case 'chase':
        this.bump(room, dx / dl * spd, dy / dl * spd, mv);
        break;
      case 'zig': {
        const px = -dy / dl, py = dx / dl, s = Math.sin(this.t * .22);
        this.bump(room, (dx / dl + px * s) * spd, (dy / dl + py * s) * spd, mv);
        break;
      }
      case 'shooter':
        if (dl < 130) this.bump(room, -dx / dl * spd * .6, -dy / dl * spd * .6, mv);
        else this.bump(room, Math.sin(this.t * .04) * spd, Math.cos(this.t * .055) * spd, mv);
        if (--this.fire <= 0) {
          this.fire = c.fire;
          room.tears.push(new Tear(this.x, this.y, dx / dl * c.bs, dy / dl * c.bs, 2, 6, false, { life: 120 }));
          SFX.play('enemyShoot');
        }
        break;
      case 'hop':
        if (this.state === 'ground') {
          if (--this.hopT <= 0) {
            this.state = 'air';
            const pow = spd * 1.35;
            this.hvx = dx / dl * pow; this.hvy = dy / dl * pow;
            this.hopT = randi(28, 55);
          }
        } else {
          this.bump(room, this.hvx, this.hvy, mv);
          this.hvx *= .93; this.hvy *= .93;
          if (Math.hypot(this.hvx, this.hvy) < .6) this.state = 'ground';
        }
        break;
      case 'turret': // 定身四向炮台，齐射角度逐轮旋转
        if (--this.fire <= 0) {
          this.fire = c.fire;
          const base = (this.t * .05) % (Math.PI / 2);
          const n = this.elite ? 8 : 4;
          for (let i = 0; i < n; i++) {
            const a = base + i * TAU / n;
            room.tears.push(new Tear(this.x, this.y, Math.cos(a) * c.bs, Math.sin(a) * c.bs, 2, 6, false, { life: 130 }));
          }
          SFX.play('enemyShoot');
        }
        break;
      case 'spread': // 三向（精英五向）散射甲虫
        this.bump(room, Math.sin(this.t * .03) * spd, Math.cos(this.t * .047) * spd, mv);
        if (--this.fire <= 0) {
          this.fire = c.fire;
          const a0 = Math.atan2(dy, dx), n = this.elite ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const a = a0 + (i - (n - 1) / 2) * .24;
            room.tears.push(new Tear(this.x, this.y, Math.cos(a) * c.bs, Math.sin(a) * c.bs, 2, 6, false, { life: 120 }));
          }
          SFX.play('enemyShoot');
        }
        break;
      case 'ghostx': // 飘忽幽灵：穿岩缓进，X 形弹道飞至中途分裂
        this.bump(room, dx / dl * spd + Math.sin(this.t * .06) * .5, dy / dl * spd + Math.cos(this.t * .05) * .5, mv);
        if (--this.fire <= 0) {
          this.fire = c.fire;
          const rot = Math.atan2(dy, dx) - Math.PI / 4;
          room.tears.push(new Tear(this.x, this.y, Math.cos(rot) * c.bs, Math.sin(rot) * c.bs, 2, 6.5, false,
            { life: 150, splitT: 42, rot, eliteSplit: this.elite }));
          room.tears.push(new Tear(this.x, this.y, Math.cos(rot + Math.PI / 2) * c.bs, Math.sin(rot + Math.PI / 2) * c.bs, 2, 6.5, false,
            { life: 150, splitT: 42, rot, eliteSplit: this.elite }));
          room.tears.push(new Tear(this.x, this.y, Math.cos(rot + Math.PI) * c.bs, Math.sin(rot + Math.PI) * c.bs, 2, 6.5, false,
            { life: 150, splitT: 42, rot, eliteSplit: this.elite }));
          room.tears.push(new Tear(this.x, this.y, Math.cos(rot + Math.PI * 1.5) * c.bs, Math.sin(rot + Math.PI * 1.5) * c.bs, 2, 6.5, false,
            { life: 150, splitT: 42, rot, eliteSplit: this.elite }));
          SFX.play('enemyShoot');
        }
        break;
      case 'swoop': { // 血蝠：俯冲正弦轨迹，快而飘忽
        const px2 = -dy / dl, py2 = dx / dl, s = Math.sin(this.t * .18) * 1.6;
        this.bump(room, (dx / dl + px2 * s) * spd, (dy / dl + py2 * s) * spd * 1.15, mv);
        break;
      }
      case 'ring': // 孢子菇：定点八向环射
        if (--this.fire <= 0) {
          this.fire = c.fire;
          for (let i = 0; i < 8; i++) {
            const a = i * TAU / 8 + this.t * .01;
            room.tears.push(new Tear(this.x, this.y, Math.cos(a) * c.bs, Math.sin(a) * c.bs, 2, 6, false, { life: 130, colorKey: 'spore' }));
          }
          SFX.play('enemyShoot');
        }
        break;
      case 'charge': // 骨蛇：蓄力瞄准 → 直线冲锋 → 硬直
        if (this.state === 'ground') {
          if (--this.hopT <= 0) { this.state = 'wind'; this.hopT = 34; }
        } else if (this.state === 'wind') {
          if (--this.hopT <= 0) {
            this.state = 'air';
            this.hvx = dx / dl * 7.2; this.hvy = dy / dl * 7.2; this.hopT = 46;
          }
        } else if (this.state === 'air') {
          this.bump(room, this.hvx, this.hvy, mv);
          if (--this.hopT <= 0 || hitWall(room, this.x, this.y, this.r * .8)) { this.state = 'rest'; this.hopT = 26; }
        } else if (--this.hopT <= 0) { this.state = 'ground'; this.hopT = randi(40, 70); }
        break;
      case 'burst': { // 浮眼：漂移 + 三连发点射
        this.bump(room, Math.sin(this.t * .035) * spd, Math.cos(this.t * .05) * spd, mv);
        this.burst = this.burst || 0; this.burstT = this.burstT || 0;
        if (this.burst > 0) {
          if (--this.burstT <= 0) {
            this.burstT = 11; this.burst--;
            room.tears.push(new Tear(this.x, this.y, dx / dl * c.bs, dy / dl * c.bs, 2, 6, false, { life: 120 }));
            SFX.play('enemyShoot');
          }
        } else if (--this.fire <= 0) { this.fire = c.fire; this.burst = 3; this.burstT = 0; }
        break;
      }
    }
  }
  bump(room, vx, vy, mv) {
    mv = mv || ((e, ax, ay, r) => moveCircle(e, ax, ay, r));
    const before = this.x + this.y;
    mv(this, vx, vy, room);
    return Math.abs(this.x + this.y - before) > Math.abs(vx + vy) * .3;
  }
}

// 幽灵移动：只被墙挡，不被岩石挡
function moveFloat(e, dx, dy, room) {
  const r = e.r * .8;
  if (dx && !hitWallFloat(room, e.x + dx, e.y, r)) e.x += dx;
  if (dy && !hitWallFloat(room, e.x, e.y + dy, r)) e.y += dy;
}
function hitWallFloat(room, x, y, r) {
  for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, -r], [0, r], [-r, 0], [r, 0]]) {
    if (room.wallOnlyTile(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE))) return true;
  }
  return false;
}

// ── Boss ──
const BOSSES = [
  { id: 'gluttony',    arch: 'glutton', name: '暴食肉山', hp: 128, r: 56, cycle: ['spit', 'hop', 'summon'], bs: 2.7 },
  { id: 'broodmother', arch: 'brood',   name: '铁颚蛛后', hp: 240, r: 50, cycle: ['radial', 'dash', 'summon2', 'spit'], bs: 2.5 },
  { id: 'the_maw',     arch: 'glutton', name: '巨颚装甲车', hp: 290, r: 58, cycle: ['spit', 'radial', 'hop', 'dash', 'summon'], bs: 3.1 },
];

class Boss {
  constructor(cfg, x, y, floorNum) {
    this.cfg = cfg;
    this.x = x; this.y = y; this.r = cfg.r;
    this.hp = Math.ceil(cfg.hp * (1 + .18 * (floorNum - 1)));
    this.maxHp = this.hp;
    this.dead = false; this.flash = 0; this.phase2 = false;
    this.act = 'idle'; this.actT = 50; this.cycleI = randi(0, cfg.cycle.length - 1);
    this.vx = 0; this.vy = 0; this.t = 0; this.volley = 0;
  }
  nextAct() {
    this.act = this.cfg.cycle[this.cycleI % this.cfg.cycle.length];
    this.cycleI++;
    const p = game.player;
    const [dx, dy] = [p.x - this.x, p.y - this.y];
    const dl = Math.max(1, Math.hypot(dx, dy));
    const bs = this.cfg.bs * (this.phase2 ? 1.15 : 1);
    switch (this.act) {
      case 'spit': this.actT = 22; this.volley = this.phase2 ? 2 : 1; break;
      case 'hop': // 先亮落点红圈 16 帧再跳，杜绝零预警必中
        this.teleKind = 'hop'; this.act = 'tele'; this.actT = 16;
        this.hopFrom = { x: this.x, y: this.y };
        this.hopTo = { x: clamp(p.x, TILE * 2, ROOM_W - TILE * 2), y: clamp(p.y, TILE * 2, ROOM_H - TILE * 2) };
        break;
      case 'radial': this.actT = 16; break;
      case 'dash': // 先锁定方向原地蓄力预警，再真正冲锋（玩家有躲避窗口）
        if (Math.abs(dx) > Math.abs(dy)) { this.vx = Math.sign(dx) * 8.2; this.vy = 0; }
        else { this.vy = Math.sign(dy) * 8.2; this.vx = 0; }
        this.teleKind = 'dash'; this.act = 'tele'; this.actT = 30;
        break;
      case 'summon': { this.actT = 30;
        if (game.cur.enemies.length < 10) { // 随从上限，防滚雪球
          const n = this.phase2 ? 4 : 3;
          for (let i = 0; i < n; i++)
            game.cur.enemies.push(new Enemy('attackfly', this.x + rand(-60, 60), this.y + rand(-60, 60), game.floorNum));
        }
        break; }
      case 'summon2': { this.actT = 30;
        if (game.cur.enemies.length < 10) for (let i = 0; i < 2; i++)
          game.cur.enemies.push(new Enemy('spider', this.x + rand(-60, 60), this.y + rand(-60, 60), game.floorNum));
        break; }
    }
    this.actParam = { dx: dx / dl, dy: dy / dl, bs };
  }
  fireFan(n, spread, baseAng, speed) {
    for (let i = 0; i < n; i++) {
      const a = baseAng + (i - (n - 1) / 2) * spread;
      game.cur.tears.push(new Tear(
        this.x + Math.cos(a) * this.r * .6, this.y + Math.sin(a) * this.r * .6,
        Math.cos(a) * speed, Math.sin(a) * speed, 2, 7, false, { life: 150 }));
    }
    SFX.play('enemyShoot');
  }
  hit(d) {
    this.hp -= d; this.flash = 5;
    spawnParticles(game.cur, this.x, this.y, 3, '#c93030', 2);
    if (!this.phase2 && this.hp <= this.maxHp * .5) {
      this.phase2 = true; SFX.play('bossRoar'); shake(8);
    }
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true;
      SFX.play('bossRoar'); shake(14);
      for (let i = 0; i < 8; i++)
        spawnParticles(game.cur, this.x + rand(-this.r, this.r), this.y + rand(-this.r, this.r), 6, '#a82020', 3.5);
      addBlood(game.cur, this.x, this.y, this.r);
    } else SFX.play('hit');
  }
  update(room) {
    if (this.flash > 0) this.flash--;
    this.t++;
    if (!this.phase2 && this.hp <= this.maxHp * .5) { this.phase2 = true; SFX.play('bossRoar'); shake(8); }
    const slow = this.phase2 ? .7 : 1;
    if (this.act === 'idle') {
      const p = game.player;
      moveCircle(this, (p.x - this.x) * .004, (p.y - this.y) * .004, room);
      if (--this.actT <= 0) this.nextAct();
      return;
    }
    this.actT -= 1;
    switch (this.act) {
      case 'tele': // 蓄力预警：定身不动，渲染层按 teleKind 画危险带/落点圈
        if (this.t % 5 === 0) spawnParticles(room, this.x + rand(-this.r, this.r) * .5, this.y + rand(-this.r, this.r) * .5, 2, '#ffcf5e', 2);
        if (this.actT <= 0) {
          if (this.teleKind === 'hop') { this.act = 'hop'; this.actT = 20; }
          else { this.act = 'dash'; this.actT = 34; shake(5); }
          SFX.play('bossRoar');
        }
        break;
      case 'spit':
        if (this.actT <= 0) {
          const a = Math.atan2(this.actParam.dy, this.actParam.dx);
          this.fireFan(5, .26, a, this.actParam.bs * (this.phase2 ? 1.2 : 1));
          if (--this.volley > 0) this.actT = 14 * slow; else { this.act = 'idle'; this.actT = 26 * slow; }
        }
        break;
      case 'hop':
        if (this.actT > 0) {
          const f = 1 - this.actT / 20;
          this.x = lerp(this.hopFrom.x, this.hopTo.x, f); this.y = lerp(this.hopFrom.y, this.hopTo.y, f);
        } else {
          shake(7); SFX.play('bossRoar');
          this.fireFan(10, TAU / 10, rand(0, TAU), this.cfg.bs * .85);
          this.act = 'idle'; this.actT = 24 * slow;
        }
        break;
      case 'radial':
        if (this.actT <= 0) {
          this.fireFan(this.phase2 ? 16 : 12, TAU / (this.phase2 ? 16 : 12), this.t * .3, this.actParam.bs * .9);
          this.act = 'idle'; this.actT = 22 * slow;
        }
        break;
      case 'dash':
        moveCircle(this, this.vx, this.vy, room);
        if (this.t % 6 === 0) spawnParticles(room, this.x, this.y, 2, '#5a4466', 2);
        if (this.actT <= 0 || hitWall(room, this.x, this.y, this.r * .8)) {
          this.act = 'idle'; this.actT = 26 * slow; shake(4);
        }
        break;
      default: // summon 类
        if (this.actT <= 0) { this.act = 'idle'; this.actT = 28 * slow; }
    }
  }
}

// ── 掉落物 ──
class Pickup {
  constructor(kind, x, y, item = null, price = 0, wid = null) {
    this.kind = kind; this.x = x; this.y = y; this.item = item; this.price = price; this.wid = wid;
    this.r = kind === 'chest' ? 16 : 12;
    this.dead = false; this.taken = false; this.denyCd = 0;
  }
  // 武器拾取：换装或升级
  takeWeapon(p) {
    const wd = WEAPONS[this.wid];
    if (p.weapon.id === this.wid) {
      if (p.weapon.lvl < wd.max) p.weapon.lvl++;
      else p.dmg += .3; // 满级后转化为永久伤害
    } else p.weapon = { id: this.wid, lvl: 1 };
    SFX.play('item'); this.dead = true;
    game.toast = { item: { name: `${wd.name} Lv${p.weapon.lvl}`, desc: wd.desc, color: wd.c }, t: 160 };
    if (!game.taughtWeapon) {
      game.taughtWeapon = true;
      game.hint = { text: '同一把枪再捡→升级；换别的枪→等级清零，捡前先想清楚', t: 300 };
    }
  }
  update(room) {
    const p = game.player;
    const d = dist2(p.x, p.y, this.x, this.y);
    if (this.kind !== 'chest' && this.kind !== 'item' && this.kind !== 'weapon' && this.price <= 0) {
      const mag = p.pickupMag + 6;
      if (d < mag * 2 && d > 1) {
        const pull = this.kind === 'coin' ? 2.6 : 1.6;
        this.x += (p.x - this.x) / d * pull; this.y += (p.y - this.y) / d * pull;
      }
    }
    if (this.denyCd > 0) this.denyCd--;
    // 商店货：先付钱后拾取
    if (this.price > 0) {
      if (d < this.r + p.r * .7) {
        if (p.coins >= this.price) {
          p.coins -= this.price; this.price = 0;
          SFX.play('coin');
          spawnParticles(room, this.x, this.y, 6, '#e8c85e', 2);
        } else if (this.denyCd <= 0) { SFX.play('deny'); this.denyCd = 45; game.hint = { text: `金币不足（需 ${this.price} 枚）`, t: 80 }; }
      }
      return;
    }
    // 拾取
    if (d < this.r + p.r * .7) {
      switch (this.kind) {
        case 'heart': case 'halfheart':
          if (p.hearts >= p.maxHearts) return;
          p.heal(this.kind === 'heart' ? 2 : 1); SFX.play('heal'); this.dead = true; break;
        case 'coin': p.coins++; SFX.play('coin'); this.dead = true; break;
        case 'key': p.keys++; SFX.play('coin'); this.dead = true; break;
        case 'item':
          p.applyItem(this.item); SFX.play('item'); this.dead = true;
          game.toast = { item: this.item, t: 200 };
          if (this.win) game.victory();
          break;
        case 'weapon':
          this.takeWeapon(p);
          if (this.win) game.victory(); // 最终宝箱可能出武器，通关标记不能丢
          break;
        case 'chest':
          if (p.keys > 0) { p.keys--; openChest(room, this); }
          else if (this.denyCd <= 0) { SFX.play('deny'); this.denyCd = 40; game.hint = { text: '需要一把钥匙（或冲刺撞开）', t: 80 }; }
          break;
      }
    }
  }
}

// 宝箱开启（钥匙或冲刺撞开，防钥匙单点锁死通关）
function openChest(room, c) {
  const p = game.player;
  SFX.play('doorOpen'); c.dead = true;
  spawnParticles(room, c.x, c.y, 14, '#e8c85e', 3);
  const def = randomItem(p);
  const wRoll = Math.random() < .35;
  if (wRoll || def) {
    const it = wRoll ? new Pickup('weapon', c.x, c.y - 6, null, 0, pickWeaponId(p))
      : new Pickup('item', c.x, c.y - 6, def);
    if (room.finalChest) it.win = true;
    room.pickups.push(it);
  } else {
    for (let i = 0; i < 3; i++) room.pickups.push(new Pickup('coin', c.x + rand(-20, 20), c.y + rand(-10, 10)));
    if (room.finalChest) game.victory(); // 道具池耗尽的最终层宝箱直接判通关
  }
  room.pickups.push(new Pickup('coin', c.x - 26, c.y + 8));
  room.pickups.push(new Pickup(choice(['heart', 'coin', 'key']), c.x + 26, c.y + 8));
}

// ── 武器系统：四种枪，拾取换装/升级（重复拾取 +1 级，最高 5 级）──
const WEAPONS = {
  tear:  { id: 'tear',  name: '制式冲锋枪', c: '#9cc4ee', glyph: '枪', cd: 13, mult: 1,   max: 5, desc: '均衡的基础火力' },
  laser: { id: 'laser', name: '激光枪', c: '#ff5f5f', glyph: '激', cd: 30, mult: 2.8, max: 5, desc: '贯穿一切的光束' },
  light: { id: 'light', name: '闪电枪', c: '#ffe066', glyph: '雷', cd: 22, mult: 1.8, max: 5, desc: '在敌人间跳跃的电弧' },
  flame: { id: 'flame', name: '火焰枪', c: '#ff9040', glyph: '焰', cd: 11, mult: .5,  max: 5, desc: '近距扇形烈焰，以量取胜' },
};
function weaponDmg(p, w) { return p.dmg * w.mult * (1 + .35 * (p.weapon.lvl - 1)); }

// ── 被动道具池 ──
const ITEMS = [
  { id: 'eye3',    name: '第三只眼', desc: '朝同一方向连射三发', color: '#8ecbff',
    apply(p) { p.shotsPerDir = Math.max(p.shotsPerDir, 3); } },
  { id: 'big',     name: '巨泪', desc: '子弹变大 伤害+2', color: '#7fb2e8',
    apply(p) { p.tearR += 4.5; p.dmg += 2; } },
  { id: 'speed',   name: '疾行靴', desc: '移动速度提升', color: '#d9a92e',
    apply(p) { p.speed += .75; } },
  { id: 'yarn',    name: '线球', desc: '射击间隔缩短', color: '#c96f9a',
    apply(p) { p.fireDelay = Math.max(6, p.fireDelay - 4); } },
  { id: 'blood',   name: '血之契约', desc: '伤害+3', color: '#c4303a',
    apply(p) { p.dmg += 3; } },
  { id: 'homing',  name: '追魂核', desc: '子弹追踪敌人', color: '#7f7fe8',
    apply(p) { p.homing = true; } },
  { id: 'wings',   name: '褪色翅', desc: '移速+ 射程+', color: '#b8d8c9',
    apply(p) { p.speed += .45; p.tearLife += 24; } },
  { id: 'lucky',   name: '磨损念珠', desc: '心之上限+2 并回满', color: '#7fae5a',
    apply(p) { p.maxHearts += 2; p.hearts = p.maxHearts; } },
  { id: 'polaris', name: '苍白之星', desc: '拾取范围大增 回复1心', color: '#e8e0c9',
    apply(p) { p.pickupMag += 55; p.heal(2); } },
  { id: 'awl',     name: '腐烂锥', desc: '子弹可穿透1个敌人', color: '#b8c4cc',
    apply(p) { p.pierce += 1; } },
  { id: 'fang',    name: '蛀牙', desc: '伤害+2.2 移速略降', color: '#d9d0c0',
    apply(p) { p.dmg += 2.2; p.speed = Math.max(2.4, p.speed - .25); } },
  { id: 'spring',  name: '发条弹簧', desc: '弹速+ 射速微增', color: '#9ec4a8',
    apply(p) { p.tearSpeed += 1.4; p.fireDelay = Math.max(6, p.fireDelay - 1); } },
  { id: 'piggy',   name: '小猪钱罐', desc: '立刻获得5枚金币', color: '#d99aa8',
    apply(p) { p.coins += 5; } },
  { id: 'halo',    name: '糖制光环', desc: '上限+1心 移速微增', color: '#f0e2b8',
    apply(p) { p.maxHearts += 2; p.heal(2); p.speed += .15; } },
];
function randomItem(p) {
  const pool = ITEMS.filter(i => !p.items.some(x => x.id === i.id));
  return pool.length ? choice(pool) : null; // 池耗尽返回 null，由生成点折算金币
}
// 掉武器偏好：优先未拿的枪型或低等级枪
function pickWeaponId(p) {
  const ids = ['tear', 'laser', 'light', 'flame'];
  const fresh = ids.filter(id => id !== p.weapon.id || p.weapon.lvl < WEAPONS[id].max);
  return choice(fresh.length ? fresh : ids);
}
// 奖励生成：35% 概率是武器，否则被动道具（池尽折金币由调用方兜底）
function makeRewardPickup(x, y, p, winFlag) {
  if (Math.random() < .35) return new Pickup('weapon', x, y, null, 0, pickWeaponId(p));
  return new Pickup('item', x, y, randomItem(p));
}
Player.prototype.applyItem = function (item) {
  this.items.push(item); item.apply(this);
};

// ── 粒子 / 血渍 ──
function spawnParticles(room, x, y, n, color, spd) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(.5, spd);
    game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - .5, life: randi(14, 30), c: color, r: rand(1.5, 3.5) });
  }
  if (game.particles.length > 300) game.particles.splice(0, game.particles.length - 300);
}
function addBlood(room, x, y, r) {
  room.blood.push({ x, y, r, a: rand(0, TAU), c: '140,25,25', al: rand(.18, .34) });
  if (room.blood.length > 45) room.blood.shift();
}

// 可破坏杂物（受冲刺/子弹摧毁）
function damageProp(room, o, d) {
  o.hp -= d;
  spawnParticles(room, o.x, o.y, 3, '#8a6b3f', 2);
  if (o.hp <= 0) {
    o.dead = true;
    spawnParticles(room, o.x, o.y, 8, '#8a6b3f', 2.6);
    if (Math.random() < .3) room.pickups.push(new Pickup(choice(['coin', 'heart', 'key']), o.x, o.y));
  }
}
