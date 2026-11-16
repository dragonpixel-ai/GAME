// entities.js — نمایش بازیکنان (من + دیگران) و وسایل نقلیه در صحنه Three.js
import * as THREE from 'three';
import { makeHumanoid } from './world.js';

const CLASS_COLORS = {
  rifleman: 0x446633, medic: 0xd8d8d8, engineer: 0xcc8833,
  pilot: 0x335577, tanker: 0x555a3a, sailor: 0x22557a, trader: 0x9a7a3a,
};
const TEAM_TINT = { red: 0xdd4444, blue: 0x4488ff };

export function makeNameTag(text, color = '#fff') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 26px Tahoma, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.fillRect(0, 12, 256, 40);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(4, 1, 1);
  return sp;
}

// گروه انیمیت‌شونده humanoid با تگ نام
export function createAvatar(name, cls, team) {
  const g = makeHumanoid(CLASS_COLORS[cls] || 0x446633);
  // نوار تیم روی شانه
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.12, 0.45),
    new THREE.MeshBasicMaterial({ color: TEAM_TINT[team] || 0xffffff }));
  stripe.position.y = 1.85; g.add(stripe);

  const tag = makeNameTag(`${name}`, team === 'red' ? '#ff9a9a' : '#9ac6ff');
  tag.position.y = 2.9; g.add(tag);

  g.userData.parts = {
    legL: g.getObjectByName('legL'), legR: g.getObjectByName('legR'),
    armL: g.getObjectByName('armL'), armR: g.getObjectByName('armR'),
  };
  g.userData.walkPhase = 0;
  return g;
}

// انیمیشن راه رفتن بر اساس سرعت
export function animateAvatar(g, speed, dt) {
  const p = g.userData.parts; if (!p) return;
  if (speed > 0.5) {
    g.userData.walkPhase += dt * (4 + speed * 0.35);
    const s = Math.sin(g.userData.walkPhase);
    p.legL.rotation.x = s * 0.7; p.legR.rotation.x = -s * 0.7;
    p.armL.rotation.x = -s * 0.5; p.armR.rotation.x = s * 0.5;
  } else {
    for (const k of ['legL', 'legR', 'armL', 'armR']) p[k].rotation.x *= 0.85;
  }
}

// ---------- مدیریت موجودیت‌ها ----------
export class EntityMgr {
  constructor(scene) {
    this.scene = scene;
    this.avatars = new Map();   // playerId -> group
    this.vMeshes = new Map();   // vehicleId -> mesh (از world)
  }

  syncPlayers(players, myId) {
    const seen = new Set();
    for (const [id, pl] of Object.entries(players)) {
      if (id === myId) continue; // من مدل جدا دارم
      seen.add(id);
      let av = this.avatars.get(id);
      if (!av) {
        av = createAvatar(pl.name, pl.class, pl.team);
        this.scene.add(av);
        this.avatars.set(id, av);
        av.userData.netPos = new THREE.Vector3(...pl.pos);
      }
      // هموارسازی شبکه
      const target = new THREE.Vector3(...pl.pos);
      av.userData.netPos.lerp(target, 0.35);
      av.position.copy(av.userData.netPos);
      av.rotation.y = pl.yaw ?? 0;
      const speed = av.userData.lastP ? av.userData.netPos.distanceTo(av.userData.lastP) * 20 : 0;
      animateAvatar(av, pl.alive ? speed : 0, 1 / 30);
      av.userData.lastP = av.userData.netPos.clone();
      av.visible = pl.alive !== false;
      if (av.userData.hpTagTimeout === undefined) av.userData.hpTagTimeout = 0;
    }
    // حذف بازیکنان رفته
    for (const [id, av] of this.avatars) {
      if (!seen.has(id)) { this.scene.remove(av); this.avatars.delete(id); }
    }
  }

  clear() {
    for (const av of this.avatars.values()) this.scene.remove(av);
    this.avatars.clear();
  }
}
