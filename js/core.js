'use strict';
// ─────────────────────────────────────────────
// 核心常量 / 工具 / 输入 / 合成音效
// ─────────────────────────────────────────────
const TILE = 48, GRID_W = 15, GRID_H = 9;
const ROOM_W = GRID_W * TILE, ROOM_H = GRID_H * TILE;
const HUD_H = 64, PANEL_W = 240;
const CANVAS_W = ROOM_W + PANEL_W;
const CANVAS_H = ROOM_H + HUD_H;
const TAU = Math.PI * 2;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const choice = arr => arr[Math.floor(Math.random() * arr.length)];
const dist2 = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// 门格（墙上的开口位置，单位=格）
const DOOR_CELL = { n: [7, 0], s: [7, GRID_H - 1], w: [0, 4], e: [GRID_W - 1, 4] };
const DIRS = ['n', 'e', 's', 'w'];
const OPP = { n: 's', s: 'n', w: 'e', e: 'w' };
const DVEC = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

// ── 输入 ──
const Input = {
  keys: new Set(), edge: new Set(), _tap: new Set(),
  init() {
    const blocked = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'KeyP', 'Enter', 'Tab',
      'Digit1', 'Digit2', 'Digit3', 'Escape'];
    addEventListener('keydown', e => {
      if (blocked.includes(e.code)) e.preventDefault();
      if (!e.repeat) this._tap.add(e.code); // 快按（不足一帧）也不丢
      this.keys.add(e.code);
      SFX.ensure();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this._tap.clear(); }); // 清 tap 防回前台"幽灵放弹"
  },
  // 每帧开头调用：tap 队列转 edge，供 pressed() 消费一次
  tick() {
    this.edge = this._tap;
    this._tap = new Set();
  },
  down(c) { return this.keys.has(c); },
  pressed(c) { return this.edge.has(c); },
  dir(code) { // 把键码翻译成单位向量，支持同时按
    let x = 0, y = 0;
    if (code === 'v') {
      if (this.down('KeyW')) y -= 1; if (this.down('KeyS')) y += 1;
      if (this.down('KeyA')) x -= 1; if (this.down('KeyD')) x += 1;
    } else {
      if (this.down('ArrowUp')) y -= 1; if (this.down('ArrowDown')) y += 1;
      if (this.down('ArrowLeft')) x -= 1; if (this.down('ArrowRight')) x += 1;
    }
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    return [x, y];
  }
};

// ── 每局主题：同一局所有房间共享主题风格，三层为同主题不同区域 ──
const THEMES = [
  { name: '学校',   floors: ['教学楼·教室', '体育馆', '行政楼·顶层'], hue: 36,  sat: 22,
    solids: [{ art: 'table', c: '#9a7448' }, { art: 'box', c: '#7d5c38' }, { art: 'panel', c: '#2e4a38' }], junk: { art: 'pot', c: '#5a6152' } },
  { name: '办公楼', floors: ['办公层', '会议区', '主管层'], hue: 210, sat: 12,
    solids: [{ art: 'box', c: '#8a94a0' }, { art: 'cyl', c: '#5c646c' }, { art: 'panel', c: '#a8c0cc' }], junk: { art: 'pot', c: '#4e7a44' } },
  { name: '医院',   floors: ['病房区', '手术室', '档案层'], hue: 150, sat: 10,
    solids: [{ art: 'slab', c: '#c8d4d0' }, { art: 'box', c: '#8fa8a0' }, { art: 'dome', c: '#3a5a62' }], junk: { art: 'pile', c: '#7a8a88' } },
  { name: '商场',   floors: ['服饰区', '美食广场', '中庭'], hue: 320, sat: 14,
    solids: [{ art: 'rack', c: '#b06a8e' }, { art: 'box', c: '#8a6f4a' }, { art: 'pot', c: '#4e7a44' }], junk: { art: 'pile', c: '#9aa0a8' } },
  { name: '工厂',   floors: ['装配线', '锅炉房', '控制室'], hue: 24,  sat: 18,
    solids: [{ art: 'cyl', c: '#6a6058' }, { art: 'barrel', c: '#8a5a2a' }, { art: 'box', c: '#7a6a4a' }], junk: { art: 'pile', c: '#6a6a70' } },
  { name: '地铁',   floors: ['站台层', '隧道段', '换乘厅'], hue: 200, sat: 16,
    solids: [{ art: 'slab', c: '#3a5a7a' }, { art: 'box', c: '#8a3a3a' }, { art: 'column', c: '#5a5a60' }], junk: { art: 'pot', c: '#4a5058' } },
  { name: '图书馆', floors: ['阅览室', '书库', '珍本室'], hue: 42,  sat: 20,
    solids: [{ art: 'rack', c: '#6a4a2e' }, { art: 'table', c: '#8a6b46' }, { art: 'dome', c: '#3a6a7a' }], junk: { art: 'pile', c: '#7a5a3a' } },
  { name: '酒店',   floors: ['客房层', '宴会厅', '顶层套房'], hue: 280, sat: 12,
    solids: [{ art: 'slab', c: '#6a3a52' }, { art: 'box', c: '#7a5a3a' }, { art: 'panel', c: '#4a3a52' }], junk: { art: 'pile', c: '#8a6a4a' } },
  { name: '仓库',   floors: ['存货区', '装卸台', '管理员层'], hue: 48,  sat: 14,
    solids: [{ art: 'box', c: '#8a7a50' }, { art: 'slab', c: '#6a5a3a' }, { art: 'barrel', c: '#5a6a7a' }], junk: { art: 'pile', c: '#6a6a70' } },
  { name: '银行',   floors: ['营业厅', '金库走廊', '行长层'], hue: 220, sat: 10,
    solids: [{ art: 'table', c: '#c8c0b0' }, { art: 'box', c: '#3a4a5a' }, { art: 'column', c: '#5a5a66' }], junk: { art: 'pot', c: '#4e7a44' } },
  { name: '研究所', floors: ['实验区', '冷冻舱', '核心区'], hue: 180, sat: 16,
    solids: [{ art: 'table', c: '#a8b8bc' }, { art: 'dome', c: '#3a7a8a' }, { art: 'cyl', c: '#5a6068' }], junk: { art: 'pile', c: '#7a8a88' } },
  { name: '港口',   floors: ['码头', '货轮船舱', '灯塔'], hue: 205, sat: 22,
    solids: [{ art: 'box', c: '#a84a3a' }, { art: 'barrel', c: '#7a6a4a' }, { art: 'column', c: '#4a5258' }], junk: { art: 'pile', c: '#6a5a3a' } },
];
function themePal(th, fn) {
  const h = th.hue + (fn - 2) * 14, s = th.sat;
  const L = l => `hsl(${h},${s}%,${l}%)`;
  return {
    name: `${th.floors[fn - 1]}`, fa: L(13), fb: L(11.5), wall: L(21), wallHi: L(27), wallSh: L(9),
    stain: `hsla(${h},${s + 8}%,32%,.16)`, rock: L(33), tint: `hsla(${h},${s}%,6%,.14)`,
  };
}

// ── 可选角色（纯外观差异）──
const CHARS = [
  { id: 'veteran',  name: '老兵',   hair: '#5a4634', style: 'short',    suit: '#4a5a3e', skin: '#d9b08c', gun: '#3a3d42' },
  { id: 'agent',    name: '女探员', hair: '#8a4a2e', style: 'ponytail', suit: '#3e4658', skin: '#e6c0a0', gun: '#2e3238' },
  { id: 'girl',     name: '少女',   hair: '#c98a3a', style: 'twintail', suit: '#7a3e58', skin: '#ecc9ae', gun: '#4a4048' },
  { id: 'operator', name: '特工',   hair: '#2a2a2e', style: 'cap',      suit: '#2e2e34', skin: '#c9a07e', gun: '#1e2024' },
];

// ── 局间元进度：魂 + 永久强化（localStorage 持久化）──
const Meta = {
  KEY: 'lambs_descent_meta_v1',
  data: null,
  load() {
    if (this.data) return this.data;
    try { this.data = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { this.data = null; }
    if (!this.data || typeof this.data.souls !== 'number')
      this.data = { souls: 0, up: { wpn: 0, hp: 0, spd: 0, coin: 0, dash: 0, revive: 0 }, cleared: false, char: 0 };
    for (const k of ['wpn', 'hp', 'spd', 'coin', 'dash', 'revive']) if (!(k in this.data.up)) this.data.up[k] = 0;
    delete this.data.up.bomb; // 旧存档：炸弹槽已废弃（冲刺取代）
    if (typeof this.data.char !== 'number') this.data.char = 0;
    return this.data;
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { } },
  buy(id) {
    const def = META_UPS.find(u => u.id === id), d = this.load();
    if (!def) return 'no';
    const lv = d.up[id];
    if (lv >= def.max) return 'max';
    const cost = def.cost[lv];
    if (d.souls < cost) return 'poor';
    d.souls -= cost; d.up[id]++; this.save();
    return 'ok';
  },
};
const META_UPS = [
  { id: 'wpn',    name: '武具大师', desc: '初始攻击 +0.8 / 级',   cost: [120, 300, 650], max: 3, c: '#d9a92e' },
  { id: 'hp',     name: '不灭躯壳', desc: '初始心之上限 +1 / 级', cost: [80, 200, 420],  max: 3, c: '#c4303a' },
  { id: 'spd',    name: '风之步',   desc: '初始移速 +0.15 / 级',  cost: [60, 150, 320],  max: 3, c: '#7fae5a' },
  { id: 'coin',   name: '开运之手', desc: '初始金币 +3 / 级',     cost: [50, 120, 260],  max: 3, c: '#e8c85e' },
  { id: 'dash',   name: '疾风核心', desc: '冲刺冷却 -0.17 秒 / 级',   cost: [60, 180],       max: 2, c: '#7fb2e8' },
  { id: 'revive', name: '亡者残响', desc: '每局死亡时原地复活一次（2心起步）', cost: [500], max: 1, c: '#b093e8' },
];

// ── 拦截浏览器缩放：游戏误触的第二根手指不该触发捏合/双击缩放（iOS 无视 user-scalable=no）──
['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
let __lastTap = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - __lastTap < 320 && e.touches.length === 0) e.preventDefault();
  __lastTap = now;
}, { passive: false });

// ── 触屏虚拟摇杆 ──
const Touch = {
  sticks: { move: null, aim: null }, dashTap: false, active: false, btn: null, pauseBtn: null, muteBtn: null, muteTap: false, mapBtn: null, mapTap: false, drag: null,
  tapped: false, menuTap: null, // menuTap：菜单态（升级/工坊）消费的点选坐标
  startedInPlay: new Set(), // 按下时仍处于战斗的手指 id，抬手不触发菜单确认
  supported() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; },
  init(cv) {
    const btn = this.btn = { x: ROOM_W - 56, y: CANVAS_H - 150, r: 30 };
    const pbtn = this.pauseBtn = { x: ROOM_W - 56, y: CANVAS_H - 240, r: 22 };
    const mbtn = this.muteBtn = { x: ROOM_W - 56, y: CANVAS_H - 302, r: 20 };
    const gbtn = this.mapBtn = { x: ROOM_W - 56, y: CANVAS_H - 360, r: 20 };
    const pts = e => {
      const r = cv.getBoundingClientRect();
      if (game.rotOn) { // CSS rotate(90deg)：屏幕(y向下) → 画布逻辑坐标的逆旋转
        const s = r.height / CANVAS_W, cxp = r.left + r.width / 2, cyp = r.top + r.height / 2;
        return [...e.changedTouches].map(t => ({
          id: t.identifier,
          x: CANVAS_W / 2 + (t.clientY - cyp) / s,
          y: CANVAS_H / 2 - (t.clientX - cxp) / s
        }));
      }
      const sx = CANVAS_W / r.width, sy = CANVAS_H / r.height; // 逻辑坐标，不受 DPR 影响
      return [...e.changedTouches].map(t => ({
        id: t.identifier, x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy
      }));
    };
    cv.addEventListener('touchstart', e => {
      e.preventDefault(); this.active = true; SFX.ensure();
      if (game.mapOpen) { // 大地图层：单指拖动=平移，轻点=回中，不再生成摇杆
        const q = pts(e)[0];
        if (q) this.drag = { id: q.id, x: q.x, y: q.y, moved: 0 };
        return;
      }
      for (const p of pts(e)) {
        if (game.state === 'play' && Math.hypot(p.x - gbtn.x, p.y - gbtn.y) < gbtn.r + 8) { this.mapTap = true; continue; } // 仅战斗态响应，防跨态幻影开图
        if (game.state === 'play') this.startedInPlay.add(p.id); // 战斗中按下的手指，抬起时不得触发菜单确认
        if (Math.hypot(p.x - pbtn.x, p.y - pbtn.y) < pbtn.r + 8) { this.pauseTap = true; continue; }
        if (Math.hypot(p.x - mbtn.x, p.y - mbtn.y) < mbtn.r + 8) { this.muteTap = true; continue; }
        // 冲刺键：战斗中常驻（不再按余弹吞触点）；其他状态照常生成摇杆消除死区
        if (game.state === 'play' && game.player && game.player.dashCd <= 0 && Math.hypot(p.x - btn.x, p.y - btn.y) < btn.r + 10) { this.dashTap = true; continue; }
        // 右侧属性面板区不生成摇杆
        const side = p.x < ROOM_W / 2 ? 'move' : p.x < ROOM_W ? 'aim' : null;
        if (side && !this.sticks[side]) this.sticks[side] = { id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
      }
    }, { passive: false });
    cv.addEventListener('touchmove', e => {
      e.preventDefault();
      if (game.mapOpen && this.drag) {
        for (const p of pts(e)) if (p.id === this.drag.id) {
          game.mapCam.x -= p.x - this.drag.x; game.mapCam.y -= p.y - this.drag.y;
          this.drag.moved += Math.abs(p.x - this.drag.x) + Math.abs(p.y - this.drag.y);
          this.drag.x = p.x; this.drag.y = p.y; game.mapAuto = false;
        }
        return;
      }
      for (const p of pts(e)) for (const s of ['move', 'aim']) {
        const st = this.sticks[s];
        if (st && st.id === p.id) { st.x = p.x; st.y = p.y; }
      }
    }, { passive: false });
    const end = e => {
      if (game.mapOpen && this.drag) {
        for (const p of pts(e)) if (p.id === this.drag.id) {
          if (this.drag.moved < 14) this.menuTap = { x: p.x, y: p.y }; // 轻点交给 main 判 × 关闭 / 否则回中
          this.drag = null;
        }
        if (this.drag && ![...e.changedTouches].some(t => t.identifier === this.drag.id)) this.drag = null;
        return;
      }
      for (const p of pts(e)) {
        if (this.startedInPlay.has(p.id)) { this.startedInPlay.delete(p.id); continue; } // 战斗期按住摇杆的手指抬起，不触发结算屏/菜单重开
        this.tapped = true; this.menuTap = { x: p.x, y: p.y };
      }
      const alive = [...e.touches].map(t => ({
        id: t.identifier, x: 0, y: 0
      })); // 仍在屏上的手指，用于摇杆移交
      const r = cv.getBoundingClientRect();
      if (game.rotOn) {
        const s = r.height / CANVAS_W, cxp = r.left + r.width / 2, cyp = r.top + r.height / 2;
        [...e.touches].forEach((t, i) => { alive[i].x = CANVAS_W / 2 + (t.clientY - cyp) / s; alive[i].y = CANVAS_H / 2 - (t.clientX - cxp) / s; });
      } else {
        const sx = CANVAS_W / r.width, sy = CANVAS_H / r.height;
        [...e.touches].forEach((t, i) => { alive[i].x = (t.clientX - r.left) * sx; alive[i].y = (t.clientY - r.top) * sy; });
      }
      for (const p of pts(e)) for (const s of ['move', 'aim']) {
        const st = this.sticks[s];
        if (!st || st.id !== p.id) continue;
        // 抬起的主指 → 移交给了同侧还按着的指头，避免双指操作断流
        const heir = alive.find(a => a.id !== p.id && (s === 'move' ? a.x < ROOM_W / 2 : (a.x >= ROOM_W / 2 && a.x < ROOM_W)) &&
          !Object.values(this.sticks).some(v => v && v.id === a.id));
        this.sticks[s] = heir ? { id: heir.id, ox: heir.x, oy: heir.y, x: heir.x, y: heir.y } : null;
      }
    };
    cv.addEventListener('touchend', end);
    cv.addEventListener('touchcancel', end);
    // 逻辑坐标换算（含强制横屏旋转逆变换）
    const toLogical = (clientX, clientY) => {
      const r = cv.getBoundingClientRect();
      if (game.rotOn) {
        const s = r.height / CANVAS_W, cxp = r.left + r.width / 2, cyp = r.top + r.height / 2;
        return { x: CANVAS_W / 2 + (clientY - cyp) / s, y: CANVAS_H / 2 - (clientX - cxp) / s };
      }
      return { x: (clientX - r.left) * (CANVAS_W / r.width), y: (clientY - r.top) * (CANVAS_H / r.height) };
    };
    // 桌面鼠标点击复用同一套菜单命中区（标题/三选一/工坊/结算）
    cv.addEventListener('mousedown', e => {
      SFX.ensure();
      if (game.mapOpen) { const q = toLogical(e.clientX, e.clientY); this.drag = { x: e.clientX, y: e.clientY, lx: q.x, ly: q.y, moved: 0 }; return; }
      this.menuTap = toLogical(e.clientX, e.clientY);
    });
    addEventListener('mousemove', e => {
      if (!game.mapOpen || !this.drag) return;
      const r = cv.getBoundingClientRect(), k = CANVAS_W / r.width;
      game.mapCam.x -= (e.clientX - this.drag.x) * k; game.mapCam.y -= (e.clientY - this.drag.y) * k;
      this.drag.moved += Math.abs(e.clientX - this.drag.x) + Math.abs(e.clientY - this.drag.y);
      this.drag.x = e.clientX; this.drag.y = e.clientY; game.mapAuto = false;
    });
    addEventListener('mouseup', () => {
      if (!this.drag) return;
      if (game.mapOpen && this.drag.moved < 8) this.menuTap = { x: this.drag.lx, y: this.drag.ly }; // 轻点：交给 main 判 × 关闭 / 否则回中
      this.drag = null; // 无条件清理，杜绝"关图后悬停即平移"的幽灵拖动
    });
  },
  vector(side) {
    const st = this.sticks[side];
    if (!st) return [0, 0];
    const dx = st.x - st.ox, dy = st.y - st.oy, l = Math.hypot(dx, dy);
    if (l < 14) return [0, 0];
    const s = Math.min(1, l / 60);
    return [dx / l * s, dy / l * s];
  }
};

// ── 环境 BGM：低频嗡鸣 + 缓慢脉动（M 开关）──
const BGM = {
  on: true, nodes: null,
  start() {
    if (!this.ctx() || this.nodes || !this.on) return;
    const ctx = this.ctx();
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 54;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 54.7;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = 27;
    const lfo = ctx.createOscillator(); lfo.frequency.value = .09;
    const lfoG = ctx.createGain(); lfoG.gain.value = .018;
    lfo.connect(lfoG).connect(g.gain);
    o1.connect(lp); o2.connect(lp); o3.connect(lp); lp.connect(g).connect(ctx.destination);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(.035, ctx.currentTime + 3);
    [o1, o2, o3, lfo].forEach(o => o.start());
    this.nodes = { o1, o2, o3, lfo, g };
  },
  stop() {
    if (!this.nodes) return;
    const ctx = this.ctx();
    this.nodes.g.gain.cancelScheduledValues(ctx.currentTime);
    this.nodes.g.gain.setValueAtTime(this.nodes.g.gain.value, ctx.currentTime);
    this.nodes.g.gain.linearRampToValueAtTime(0, ctx.currentTime + .5);
    const n = this.nodes; this.nodes = null;
    setTimeout(() => { try { Object.values(n).forEach(x => x.stop && x.stop()); } catch (e) { } }, 800);
  },
  toggle() { this.on = !this.on; this.on ? this.start() : this.stop(); return this.on; },
  ctx() { return SFX.ctx; }
};

// ── WebAudio 合成音效（无素材文件）──
const SFX = {
  ctx: null, _keep: null,
  ensure() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // 静音心跳节点：保持渲染进程活跃，防止后台节流停摆 rAF（对玩家完全无声）
    if (this.ctx && !this._keep) {
      try {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.frequency.value = 30; g.gain.value = 0;
        o.connect(g).connect(this.ctx.destination); o.start();
        this._keep = o;
      } catch (e) { }
    }
  },
  tone(freq, dur, type = 'square', vol = .12, slide = 0, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t0); o.stop(t0 + dur + .02);
  },
  noise(dur, vol = .2, lp = 1200) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t0);
  },
  play(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'shoot': this.tone(560, .06, 'triangle', .06, -260); break;
      case 'laser': this.tone(1100, .16, 'sawtooth', .07, -900); this.tone(600, .12, 'square', .04, -400); break;
      case 'zap': this.tone(1800, .05, 'square', .05, -1500); this.tone(900, .09, 'sawtooth', .06, -700, .04); this.noise(.08, .1, 4000); break;
      case 'flame': this.noise(.14, .07, 900); this.tone(220, .1, 'sawtooth', .03, -120); break;
      case 'hit': this.noise(.06, .12, 2400); this.tone(180, .05, 'square', .05, -60); break;
      case 'kill': this.noise(.12, .18, 900); this.tone(120, .12, 'sawtooth', .07, -70); break;
      case 'enemyShoot': this.tone(300, .07, 'sawtooth', .045, -120); break;
      case 'hurt': this.tone(220, .18, 'sawtooth', .14, -140); this.noise(.1, .2, 700); break;
      case 'heal': this.tone(520, .09, 'sine', .1, 0); this.tone(780, .12, 'sine', .1, 0, .08); break;
      case 'coin': this.tone(980, .06, 'square', .07); this.tone(1400, .09, 'square', .06, 0, .05); break;
      case 'clear': this.tone(392, .1, 'sine', .09); this.tone(523, .1, 'sine', .09, 0, .09); this.tone(659, .16, 'sine', .09, 0, .18); break;
      case 'item': this.tone(440, .1, 'triangle', .1); this.tone(660, .1, 'triangle', .1, 0, .1); this.tone(880, .22, 'triangle', .1, 0, .2); break;
      case 'dash': this.tone(300, .1, 'sine', .08, 500); this.noise(.08, .08, 2600); break;
      case 'boom': this.noise(.5, .5, 400); this.tone(70, .4, 'sawtooth', .22, -40); break;
      case 'doorOpen': this.noise(.15, .1, 500); this.tone(160, .2, 'square', .05, 60); break;
      case 'bossRoar': this.tone(90, .6, 'sawtooth', .2, -30); this.noise(.5, .3, 300); break;
      case 'trapdoor': this.tone(300, .5, 'sine', .1, -240); break;
      case 'death': this.tone(300, .25, 'sawtooth', .16, -200); this.tone(150, .5, 'sawtooth', .14, -100, .2); this.noise(.6, .25, 500); break;
      case 'deny': this.tone(160, .12, 'square', .07, -30); break;
    }
  }
};
