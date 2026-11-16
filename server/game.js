// server/game.js — منطق مرجع سرور: بازیکنان، وسایل نقلیه، تیر و آسیب، رول‌پلی کلاس‌ها
'use strict';

const WORLD_SEED = 20261116;
const BASES = {
  red:  { x: -620, z: -620 },
  blue: { x: 620, z: -620 },
};

// ارتفاع زمین — باید با public/js/world.js یکسان باشد
function terrainHeight(x, z) {
  let h = 0;
  h += Math.sin(x * 0.004) * Math.cos(z * 0.005) * 18;
  h += Math.sin(x * 0.013 + 2.1) * Math.cos(z * 0.011 - 1.3) * 7;
  h += Math.sin(x * 0.033) * Math.sin(z * 0.029) * 2.5;
  const m1 = Math.hypot(x + 500, z + 500);
  if (m1 < 380) h += (380 - m1) * 0.45 * Math.max(0, Math.sin(m1 * 0.02) * 0.3 + 0.9);
  const sea = Math.max(0, (z - 500) / 260);
  h -= sea * 40;
  return h;
}

const VEHICLE_DEFS = [
  { id: 'v0', type: 'jet',  team: 'any',    x: 120, y: 0, z: -400, hp: 120 },
  { id: 'v1', type: 'jet',  team: 'any',    x: 170, y: 0, z: -400, hp: 120 },
  { id: 'v2', type: 'tank', team: 'red',    x: BASES.red.x + 20,  z: BASES.red.z + 20,  hp: 300 },
  { id: 'v3', type: 'tank', team: 'red',    x: BASES.red.x - 20,  z: BASES.red.z + 25,  hp: 300 },
  { id: 'v4', type: 'tank', team: 'blue',   x: BASES.blue.x + 20, z: BASES.blue.z + 20, hp: 300 },
  { id: 'v5', type: 'tank', team: 'blue',   x: BASES.blue.x - 20, z: BASES.blue.z + 25, hp: 300 },
  { id: 'v6', type: 'tank', team: 'neutral',x: 0, z: 100, hp: 300 },
  { id: 'v7', type: 'ship', team: 'red',    x: -100, z: 640, hp: 500 },
  { id: 'v8', type: 'ship', team: 'blue',   x: 200, z: 660, hp: 500 },
];

class GameServer {
  constructor(io) {
    this.io = io;
    this.players = new Map(); // socketId -> player
    this.vehicles = new Map();
    for (const d of VEHICLE_DEFS) {
      const y = d.type === 'ship' ? -2 + 0.4 : terrainHeight(d.x, d.z) + (d.type === 'jet' ? 1.2 : 0);
      this.vehicles.set(d.id, { ...d, maxHp: d.hp, y, yaw: 0, pitch: 0, speed: 0, driver: null, alive: true });
    }
    this.respawnTimers = new Map();
    setInterval(() => this.tick(), 100); // 10Hz snapshot
  }

  broadcastEvent(ev) { this.io.emit('event', ev); }

  attach(socket) {
    socket.on('join', (info, cb) => {
      const p = {
        id: socket.id,
        name: String(info.name || 'سرباز').slice(0, 16),
        class: ['rifleman','medic','engineer','pilot','tanker','sailor','trader'].includes(info.class) ? info.class : 'rifleman',
        team: info.team === 'blue' ? 'blue' : 'red',
        pos: [0, 30, 0], yaw: 0, pitch: 0, hp: 100, alive: true, vehicle: null,
      };
      const b = BASES[p.team];
      p.pos = [b.x + (Math.random() - 0.5) * 30, terrainHeight(b.x, b.z) + 6, b.z + (Math.random() - 0.5) * 30];
      this.players.set(socket.id, p);
      cb({ id: socket.id, seed: WORLD_SEED, spawn: { x: p.pos[0], z: p.pos[2] } });
      this.broadcastEvent({ type: 'join-msg', playerId: socket.id, name: p.name });
    });

    socket.on('state', (s) => {
      const p = this.players.get(socket.id);
      if (!p || !Array.isArray(s.pos)) return;
      // اگر بازیکن در پایگاه اسپاون شده و هنوز حرکت نکرده، موقعیت اسپاون را حفظ کن
      const stillAtSpawn = p.pos[1] > 3 && s.pos[1] < 2.5;
      if (!stillAtSpawn) p.pos = s.pos.map((v) => Math.round((+v || 0) * 100) / 100);
      p.yaw = +s.yaw || 0; p.pitch = +s.pitch || 0;
      p.alive = !!s.alive;
      // وسیله: سرور مرجع موقعیت وسایل است؛ درایور آپدیت می‌کند
      if (s.vehicle && this.vehicles.has(s.vehicle)) {
        const v = this.vehicles.get(s.vehicle);
        if (v.driver === socket.id) {
          v.x = p.pos[0]; v.y = p.pos[1]; v.z = p.pos[2];
          v.yaw = +s.vehYaw ?? v.yaw;
          v.turretYaw = +s.turretYaw ?? v.turretYaw;
          v.speed = +s.vehSpeed ?? v.speed;
        }
      } else if (p.vehicle && (!s.vehicle || !this.vehicles.has(s.vehicle))) {
        // پیاده شد
        const old = this.vehicles.get(p.vehicle);
        if (old && old.driver === socket.id) old.driver = null;
        p.vehicle = null;
      }
      if (s.vehicle && this.vehicles.has(s.vehicle) && !p.vehicle) {
        const v = this.vehicles.get(s.vehicle);
        if (!v.driver && v.alive) { v.driver = socket.id; p.vehicle = v.id; }
      }
    });

    socket.on('hit', ({ targetId, dmg }) => this.applyPlayerHit(socket.id, targetId, dmg));
    socket.on('hit-report', ({ targetId, dmg }) => {
      if (typeof targetId === 'string' && targetId.startsWith('veh:')) {
        this.applyVehicleDamage(socket.id, targetId.slice(4), dmg);
      } else if (targetId == null) {
        // ممکن است پیاده بوده باشد؛ نادیده
      }
    });
    socket.on('vehicle-shot', () => {}); // اعتبارسنجی کامل در نسخه بعد
    socket.on('crash', ({ vid }) => {
      const v = this.vehicles.get(vid);
      if (v && v.driver === socket.id && v.alive) this.destroyVehicle(v, 'خلبان');
    });

    socket.on('repair', ({ vid }) => {
      const p = this.players.get(socket.id);
      const v = this.vehicles.get(vid);
      if (!p || !v || p.class !== 'engineer') return;
      const d = Math.hypot(p.pos[0] - v.x, p.pos[2] - v.z);
      if (d > 14) return;
      v.hp = Math.min(v.maxHp, v.hp + 60);
      if (!v.alive && d < 14) { v.alive = true; v.meshReset = true; this.broadcastEvent({ type: 'veh-repaired', vid }); }
      this.broadcastEvent({ type: 'repair-done', vid });
    });

    socket.on('revive-request', () => {
      const p = this.players.get(socket.id);
      if (!p || p.class !== 'medic') return;
      for (const q of this.players.values()) {
        if (q.team === p.team && !q.alive && q.id !== p.id) {
          const d = Math.hypot(p.pos[0] - q.pos[0], p.pos[2] - q.pos[2]);
          if (d < 60) { // محدوده زنده کردن پزشک
            q.alive = true; q.hp = 60;
            this.clearRespawn(q.id);
            this.broadcastEvent({ type: 'respawn', playerId: q.id, pos: [q.pos[0], terrainHeight(q.pos[0], q.pos[2]) + 3, q.pos[2]] });
            this.io.to(q.id).emit('chat', { name: p.name + ' (پزشک)', team: p.team, msg: 'زنده شدی! ⛑' });
            break;
          }
        }
      }
    });

    socket.on('supply', () => {
      const p = this.players.get(socket.id);
      if (!p || p.class !== 'trader') return;
      for (const q of this.players.values()) {
        const d = Math.hypot(p.pos[0] - q.pos[0], p.pos[2] - q.pos[2]);
        if (d < 15) this.io.to(q.id).emit('event', { type: 'supply', for: q.id });
      }
    });

    socket.on('chat', (msg) => {
      const p = this.players.get(socket.id);
      if (!p) return;
      const text = String(msg).slice(0, 120);
      this.io.emit('chat', { name: p.name, team: p.team, cls: p.class, msg: text });
    });

    socket.on('disconnect', () => {
      const p = this.players.get(socket.id);
      if (p && p.vehicle) {
        const v = this.vehicles.get(p.vehicle);
        if (v) v.driver = null;
      }
      this.players.delete(socket.id);
      this.clearRespawn(socket.id);
    });
  }

  applyPlayerHit(attackerId, targetId, dmg) {
    const a = this.players.get(attackerId);
    const t = this.players.get(targetId);
    if (!a || !t || !t.alive || a.id === t.id) return;
    dmg = Math.min(50, Math.max(1, Math.round(+dmg || 0)));
    // ضدتیر هم‌تیمی نصف
    if (a.team === t.team) dmg = Math.round(dmg * 0.3);
    t.hp -= dmg;
    this.io.to(t.id).emit('event', { type: 'hurt', targetId: t.id, dmg });
    if (t.hp <= 0) {
      t.hp = 0; t.alive = false;
      if (t.vehicle) { const v = this.vehicles.get(t.vehicle); if (v) v.driver = null; t.vehicle = null; }
      this.broadcastEvent({ type: 'kill', killer: a.name, victim: t.name, victimId: t.id });
      this.scheduleRespawn(t);
    }
  }

  applyVehicleDamage(attackerId, vid, dmg) {
    const a = this.players.get(attackerId);
    const v = this.vehicles.get(vid);
    if (!a || !v || !v.alive) return;
    dmg = Math.min(120, Math.max(1, Math.round(+dmg || 0)));
    v.hp -= dmg;
    if (v.hp <= 0) this.destroyVehicle(v, a.name);
  }

  destroyVehicle(v, killerName) {
    v.alive = false; v.hp = 0;
    this.broadcastEvent({ type: 'boom', pos: [v.x, v.y, v.z], big: v.type !== 'jet' });
    this.broadcastEvent({ type: 'veh-destroyed', vid: v.id });
    if (v.driver) {
      const p = this.players.get(v.driver);
      if (p) {
        p.vehicle = null;
        // راننده زنده می‌ماند (می‌پرد) اما ۳۰ واحد آسیب
        p.hp = Math.max(1, p.hp - 30);
        this.io.to(p.id).emit('event', { type: 'hurt', targetId: p.id, dmg: 30 });
      }
      v.driver = null;
    }
    // بازسازی خودکار پس از ۲۵ ثانیه
    setTimeout(() => {
      v.alive = true; v.hp = v.maxHp;
      v.x = VEHICLE_DEFS.find((d) => d.id === v.id).x;
      v.z = VEHICLE_DEFS.find((d) => d.id === v.id).z;
      v.y = v.type === 'ship' ? -1.6 : terrainHeight(v.x, v.z) + (v.type === 'jet' ? 1.2 : 0);
      v.yaw = 0; v.speed = 0;
      this.broadcastEvent({ type: 'veh-state-reset', vid: v.id });
    }, 25000);
  }

  scheduleRespawn(p) {
    this.clearRespawn(p.id);
    const to = setTimeout(() => this.respawnNow(p.id), 6000);
    this.respawnTimers.set(p.id, to);
  }
  clearRespawn(id) {
    const t = this.respawnTimers.get(id);
    if (t) { clearTimeout(t); this.respawnTimers.delete(id); }
  }
  respawnNow(id) {
    const p = this.players.get(id);
    if (!p) return;
    const b = BASES[p.team];
    const x = b.x + (Math.random() - 0.5) * 40, z = b.z + (Math.random() - 0.5) * 40;
    p.alive = true; p.hp = 100;
    p.pos = [x, terrainHeight(x, z) + 3, z];
    this.clearRespawn(id);
    this.broadcastEvent({ type: 'respawn', playerId: id, pos: p.pos });
  }

  tick() {
    const snap = { players: {}, vehicles: {} };
    for (const p of this.players.values()) {
      snap.players[p.id] = {
        name: p.name, class: p.class, team: p.team,
        pos: p.pos, yaw: p.yaw, pitch: p.pitch, hp: p.hp, alive: p.alive, vehicle: p.vehicle,
      };
    }
    for (const v of this.vehicles.values()) {
      snap.vehicles[v.id] = {
        type: v.type, team: v.team, x: v.x, y: v.y, z: v.z,
        yaw: v.yaw, turretYaw: v.turretYaw ?? v.yaw, speed: v.speed, hp: v.hp, alive: v.alive, driver: v.driver,
      };
    }
    this.io.emit('snapshot', snap);
  }
}

module.exports = { GameServer, terrainHeight, BASES, WORLD_SEED };
