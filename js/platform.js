'use strict';
// ─────────────────────────────────────────────
// v4.0 平台适配层：登录三通道（微信/抖音/游客）+ 云存档
// 模式参考 speedStream 问题反馈：无状态 HTTP POST + 设备 ID + 失败重试队列
// 原则：游戏永远先写本地 localStorage，异步上云；断网零阻塞
// ─────────────────────────────────────────────
const CloudSave = {
  api: (location.search.match(/api=([^&]+)/) || [])[1] || localStorage.getItem('tr_api') ||
       (/^http/.test(location.origin) ? location.origin : ''), // file://(origin=null)与公网 https 默认纯本地档；LAN http 部署自动同源
  token: localStorage.getItem('tr_token') || null,
  profile: null,
  online: false,
  deviceId: null,
  platform: 'guest',

  detect() {
    if (typeof wx !== 'undefined' && wx.login) this.platform = 'wechat';
    else if (typeof tt !== 'undefined' && tt.login) this.platform = 'douyin';
    if (!this.deviceId) {
      this.deviceId = localStorage.getItem('tr_device_id');
      if (!this.deviceId) {
        this.deviceId = 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        try { localStorage.setItem('tr_device_id', this.deviceId); } catch (e) { }
      }
    }
  },
  platformCode() { // 小游戏平台静默换 code；guest 直接用设备 ID
    return new Promise(res => {
      if (this.platform === 'guest') return res(null);
      const P = this.platform === 'wechat' ? wx : tt;
      try { P.login({ success: r => res(r.code || null), fail: () => res(null) }); } catch (e) { res(null); }
    });
  },
  boot() { // 冷启动/恢复在线自动补传（修复"积压只能等 reload 触发点"）
    setInterval(() => { if (this.token && !this.online) this.login().then(ok => ok && this.flushQueue()); }, 30000);
    addEventListener('online', () => this.login().then(ok => ok && this.flushQueue()));
  },
  async login() {
    if (!this.api) { this.online = false; return false; } // 公网默认离线模式：纯本地存档
    this.detect();
    const code = await this.platformCode();
    try {
      const r = await fetch(this.api + '/api/login', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ platform: this.platform, deviceId: this.deviceId, code }),
      });
      if (!r.ok) throw 0;
      const j = await r.json();
      this.token = j.token; this.profile = j.profile; this.online = true;
      localStorage.setItem('tr_token', j.token);
      this.applyProfile(j.profile); // 登录即云端 max 合并（换设备找回进度）
      this.flushQueue();
      return true;
    } catch (e) { this.online = false; return false; } // 离线照常本地玩
  },
  applyProfile(p) { // 增量基线=服务器金币；本地取 max(本地, 云端+积压)（换设备找回进度）
    const m = Meta.load();
    let q = [];
    try { q = JSON.parse(localStorage.getItem('tr_sync_q') || '[]'); } catch (e) { }
    const pending = q.reduce((s, x) => s + (x.coinsDelta || 0), 0);
    m.coins = Math.max(m.coins || 0, (p.coins || 0) + pending);
    m.maxStage = Math.max(m.maxStage || 0, p.maxStage || 0);
    for (const k of Object.keys(m.up)) m.up[k] = Math.max(m.up[k], (p.upgrades || {})[k] || 0);
    if (p.charId >= 0 && p.charId < 4) m.char = p.charId; // 钳制，防脏档崩渲染
    Meta.save();
    try { localStorage.setItem('tr_last_sync', String(p.coins || 0)); } catch (e) { } // 基线=服务器值，本地未同步盈余下次增量上补
  },
  snapshot() { // 金币用增量：消费真实上云，不会被 max 合并"复活"
    const m = Meta.load();
    const last = +(localStorage.getItem('tr_last_sync') || 0);
    return { coinsDelta: m.coins - last, maxStage: m.maxStage, upgrades: m.up, weapons: m.weapons || null, charId: m.char, nickname: m.nickname || '' };
  },
  markSynced() { try { localStorage.setItem('tr_last_sync', String(Meta.load().coins)); } catch (e) { } },
  async queue() { // 结算点调用：通关/死亡/撤离/工坊购买
    const body = this.snapshot();
    if (!this.token) { this.pushQueue(body); return; }
    try {
      const r = await fetch(this.api + '/api/sync', {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.token },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw 0;
      this.online = true; this.markSynced();
      this.flushQueue();
    } catch (e) { this.online = false; this.pushQueue(body); }
  },
  pushQueue(body) { // 失败重试队列：本地积压、封顶 20；溢出时把最旧一条合并进新条（增量可加性）
    try {
      let q = JSON.parse(localStorage.getItem('tr_sync_q') || '[]');
      if (q.length >= 20) {
        const old = q.shift();
        body = { ...body, coinsDelta: (old.coinsDelta || 0) + (body.coinsDelta || 0), maxStage: Math.max(old.maxStage || 0, body.maxStage || 0) };
      }
      q.push(body);
      localStorage.setItem('tr_sync_q', JSON.stringify(q));
    } catch (e) { }
  },
  async flushQueue() {
    if (!this.token) return;
    let q = [];
    try { q = JSON.parse(localStorage.getItem('tr_sync_q') || '[]'); } catch (e) { }
    while (q.length) {
      const head = q[0];
      try {
        const r = await fetch(this.api + '/api/sync', {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + this.token },
          body: JSON.stringify(head),
        });
        if (!r.ok) throw 0;
        q.shift();
        localStorage.setItem('tr_sync_q', JSON.stringify(q));
        this.markSynced();
      } catch (e) { break; } // 仍离线，留队下次
    }
  },
  statusText() {
    if (!this.token) return '未登录（本地存档）';
    if (this.online) return `账号 #${this.profile && this.profile.id} · 云同步✓`;
    return `账号 #${this.profile && this.profile.id} · 离线（积压${(JSON.parse(localStorage.getItem('tr_sync_q') || '[]')).length}）`;
  },
};
window.CloudSave = CloudSave;
