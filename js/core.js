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
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyR', 'KeyP', 'Enter',
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

// ── 局间元进度：魂 + 永久强化（localStorage 持久化）──
const Meta = {
  KEY: 'lambs_descent_meta_v1',
  data: null,
  load() {
    if (this.data) return this.data;
    try { this.data = JSON.parse(localStorage.getItem(this.KEY)); } catch (e) { this.data = null; }
    if (!this.data || typeof this.data.souls !== 'number')
      this.data = { souls: 0, up: { wpn: 0, hp: 0, spd: 0, coin: 0, bomb: 0, revive: 0 }, cleared: false };
    for (const k of ['wpn', 'hp', 'spd', 'coin', 'bomb', 'revive']) if (!(k in this.data.up)) this.data.up[k] = 0;
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
  { id: 'bomb',   name: '火药囊',   desc: '初始炸弹 +1 / 级',     cost: [60, 180],       max: 2, c: '#8a857c' },
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
  sticks: { move: null, aim: null }, bombTap: false, active: false, btn: null, pauseBtn: null, muteBtn: null, muteTap: false,
  tapped: false, menuTap: null, // menuTap：菜单态（升级/工坊）消费的点选坐标
  startedInPlay: new Set(), // 按下时仍处于战斗的手指 id，抬手不触发菜单确认
  supported() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; },
  init(cv) {
    const btn = this.btn = { x: ROOM_W - 56, y: CANVAS_H - 150, r: 30 };
    const pbtn = this.pauseBtn = { x: ROOM_W - 56, y: CANVAS_H - 240, r: 22 };
    const mbtn = this.muteBtn = { x: ROOM_W - 56, y: CANVAS_H - 302, r: 20 };
    const pts = e => {
      const r = cv.getBoundingClientRect(), sx = CANVAS_W / r.width, sy = CANVAS_H / r.height; // 逻辑坐标，不受 DPR 影响
      return [...e.changedTouches].map(t => ({
        id: t.identifier, x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy
      }));
    };
    cv.addEventListener('touchstart', e => {
      e.preventDefault(); this.active = true; SFX.ensure();
      for (const p of pts(e)) {
        if (game.state === 'play') this.startedInPlay.add(p.id); // 战斗中按下的手指，抬起时不得触发菜单确认
        if (Math.hypot(p.x - pbtn.x, p.y - pbtn.y) < pbtn.r + 8) { this.pauseTap = true; continue; }
        if (Math.hypot(p.x - mbtn.x, p.y - mbtn.y) < mbtn.r + 8) { this.muteTap = true; continue; }
        // 炸弹键仅在已开局且有余弹时吞掉触点；否则照常生成射击摇杆，消除"死区"
        if (game.player && game.player.bombs > 0 && Math.hypot(p.x - btn.x, p.y - btn.y) < btn.r + 10) { this.bombTap = true; continue; }
        // 右侧属性面板区不生成摇杆
        const side = p.x < ROOM_W / 2 ? 'move' : p.x < ROOM_W ? 'aim' : null;
        if (side && !this.sticks[side]) this.sticks[side] = { id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
      }
    }, { passive: false });
    cv.addEventListener('touchmove', e => {
      e.preventDefault();
      for (const p of pts(e)) for (const s of ['move', 'aim']) {
        const st = this.sticks[s];
        if (st && st.id === p.id) { st.x = p.x; st.y = p.y; }
      }
    }, { passive: false });
    const end = e => {
      for (const p of pts(e)) {
        if (this.startedInPlay.has(p.id)) { this.startedInPlay.delete(p.id); continue; } // 战斗期按住摇杆的手指抬起，不触发结算屏/菜单重开
        this.tapped = true; this.menuTap = { x: p.x, y: p.y };
      }
      const alive = [...e.touches].map(t => ({
        id: t.identifier, x: 0, y: 0
      })); // 仍在屏上的手指，用于摇杆移交
      const r = cv.getBoundingClientRect(), sx = CANVAS_W / r.width, sy = CANVAS_H / r.height;
      [...e.touches].forEach((t, i) => { alive[i].x = (t.clientX - r.left) * sx; alive[i].y = (t.clientY - r.top) * sy; });
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
    // 桌面鼠标点击复用同一套菜单命中区（标题/三选一/工坊/结算）
    cv.addEventListener('mousedown', e => {
      SFX.ensure();
      const r = cv.getBoundingClientRect(), sx = CANVAS_W / r.width, sy = CANVAS_H / r.height;
      this.menuTap = { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
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
      case 'bombPlace': this.tone(140, .05, 'square', .06); break;
      case 'boom': this.noise(.5, .5, 400); this.tone(70, .4, 'sawtooth', .22, -40); break;
      case 'doorOpen': this.noise(.15, .1, 500); this.tone(160, .2, 'square', .05, 60); break;
      case 'bossRoar': this.tone(90, .6, 'sawtooth', .2, -30); this.noise(.5, .3, 300); break;
      case 'trapdoor': this.tone(300, .5, 'sine', .1, -240); break;
      case 'death': this.tone(300, .25, 'sawtooth', .16, -200); this.tone(150, .5, 'sawtooth', .14, -100, .2); this.noise(.6, .25, 500); break;
      case 'deny': this.tone(160, .12, 'square', .07, -30); break;
    }
  }
};
