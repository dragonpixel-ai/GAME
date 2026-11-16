// main.js — نقطه ورود: صحنه، حلقه بازی، کنترل‌ها، HUD، چت جامعه، سوار/پیاده شدن
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { buildWorld, terrainHeight, isWater, SEA_LEVEL, WORLD_SIZE, makeHumanoid } from './world.js';
import { EntityMgr, createAvatar, animateAvatar } from './entities.js';
import { VehicleController } from './vehicle.js';
import { socket, state, join, sendState, emit } from './net.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ==================== پایه ====================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5d8);
scene.fog = new THREE.Fog(0x87b5d8, 300, 1400);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 3000);

scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x3a5c30, 0.9));
const sun = new THREE.DirectionalLight(0xfff2cc, 1.1);
sun.position.set(300, 500, 200);
scene.add(sun);

// ==================== جهان ====================
let world = null;      // بعد از دریافت seed سرور ساخته می‌شود
let vehiclesById = {};
const vc = new VehicleController(camera);
const entities = new EntityMgr(scene);

// ==================== بازیکن محلی ====================
const player = {
  name: 'ناشناس', class: 'rifleman', team: 'red',
  pos: new THREE.Vector3(0, 20, 0),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  hp: 100, alive: true,
  onGround: false,
  vehicle: null,          // وسیله‌ای که سوارم
  ammo: 30, maxAmmo: 30,
  lastShot: 0, reloading: false, reloadEnd: 0,
};
let avatar = null;        // مدل من (وقتی پیاده‌ام)

const controls = new PointerLockControls(camera, renderer.domElement);

// ==================== ورود / رول‌پلی ====================
$('btn-start').onclick = () => {
  player.name = ($('inp-name').value || 'سرباز-' + Math.floor(Math.random() * 999)).slice(0, 16);
  player.class = $('inp-class').value;
  player.team = $('inp-team').value;

  join(player.name, player.class, player.team, (res) => {
    // ساخت جهان با seed مشترک همه کلاینت‌ها
    world = buildWorld(scene, res.seed);
    for (const v of world.vehicles) {
      v.turretYaw = 0; v.roll = 0; v.pitch = 0; v.bob = 0; v.lookPitch = 0;
      vehiclesById[v.id] = v;
    }
    avatar = createAvatar(player.name, player.class, player.team);
    scene.add(avatar);

    const spawn = res.spawn;
    player.pos.set(spawn.x, terrainHeight(spawn.x, spawn.z) + 3, spawn.z);

    $('start-screen').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('info-team').textContent = player.team === 'red' ? '🔴 ارتش سرخ' : '🔵 ارتش آبی';
    $('info-team').className = player.team;
    $('info-class').textContent = { rifleman: '🪖 پیاده', medic: '⛑ پزشک', engineer: '🔧 مهندس',
      pilot: '✈ خلبان', tanker: '🛡 تانک‌سوار', sailor: '⚓ دریانورد', trader: '💰 تاجر' }[player.class];
    addChat('سیستم', `به جبهه خوش آمدی ${player.name}! با T حرف بزن، نزدیک وسیله E بزن.`);
    lockPointer();
  });
};

function lockPointer() {
  if (!controls.isLocked) { try { controls.lock(); } catch (e) {} }
}
controls.addEventListener('lock', () => { mouseLocked = true; });
controls.addEventListener('unlock', () => { mouseLocked = false; });
let mouseLocked = false;
renderer.domElement.addEventListener('click', () => {
  if (!$('hud').classList.contains('hidden') && !chatOpen) lockPointer();
});

// ==================== ورودی کیبورد ====================
const keys = {};
addEventListener('keydown', (e) => {
  if (chatOpen) {
    if (e.code === 'Escape') closeChat();
    return;
  }
  keys[e.code] = true;
  if (e.code === 'KeyE') toggleVehicle();
  if (e.code === 'KeyF') classAbility();
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyC' && player.vehicle) vc.mode = vc.mode === 'third' ? 'cockpit' : 'third';
  if (e.code === 'KeyT') openChat();
});
addEventListener('keyup', (e) => keys[e.code] = false);

let firing = false;
addEventListener('mousedown', (e) => {
  if (!mouseLocked || chatOpen) return;
  if (e.button === 0) firing = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) firing = false; });

// ==================== چت جامعه (رول‌پلی) ====================
let chatOpen = false;
function openChat() {
  chatOpen = true;
  if (controls.isLocked) controls.unlock();
  $('chat-input').classList.remove('hidden');
  $('chat-input').focus();
}
function closeChat() {
  chatOpen = false;
  $('chat-input').classList.add('hidden');
  $('chat-input').blur();
  lockPointer();
}
$('chat-input').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    const msg = $('chat-input').value.trim();
    if (msg) emit('chat', msg);
    $('chat-input').value = '';
    closeChat();
  } else if (e.key === 'Escape') closeChat();
});
socket.on('chat', ({ name, team, msg, cls }) => addChat(`${name}`, msg, team));
function addChat(who, msg, team) {
  const log = $('chat-log');
  const d = document.createElement('div');
  d.innerHTML = `<b style="color:${team === 'red' ? '#ff8a8a' : team === 'blue' ? '#8ab8ff' : '#ffd45e'}">${who}:</b> ${msg}`;
  log.appendChild(d);
  while (log.children.length > 40) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

// ==================== سوار/پیاده شدن ====================
function nearestVehicle(maxDist = 8) {
  if (!world) return null;
  let best = null, bd = maxDist;
  const p = player.vehicle ? player.vehicle.mesh.position : player.pos;
  for (const v of world.vehicles) {
    if (!v.alive || v.driver) continue;
    const d = v.mesh.position.distanceTo(p);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function toggleVehicle() {
  if (!world) return;
  if (player.vehicle) {
    // خروج از جنگنده/تانک/ناو
    const v = player.vehicle;
    const exitPos = v.mesh.position.clone().add(new THREE.Vector3(v.type === 'jet' ? 8 : 5, 1, 0));
    v.driver = null;
    player.vehicle = null;
    if (v.type === 'jet') {
      // چتر نجات: سقوط آرام
      player.pos.copy(exitPos);
      player.vel.set(0, -8, 0);
      player.parachute = true;
    } else {
      player.pos.set(exitPos.x, Math.max(terrainHeight(exitPos.x, exitPos.z) + 2, exitPos.y), exitPos.z);
    }
    if (avatar) avatar.visible = true;
    $('info-mode').textContent = 'پیاده';
    return;
  }
  const v = nearestVehicle();
  if (v) {
    player.vehicle = v;
    v.driver = state.myId;
    if (avatar) avatar.visible = false;
    $('info-mode').textContent = { jet: '✈ جنگنده', tank: '🛡 تانک', ship: '⚓ ناو' }[v.type];
    addChat('سیستم', `سوار ${v.type === 'jet' ? 'جنگنده' : v.type === 'tank' ? 'تانک' : 'ناو'} شدید — برای خروج E`);
  }
}

// ==================== توانایی کلاس‌ها (F) ====================
function classAbility() {
  if (!world) return;
  if (player.class === 'medic') {
    // زنده کردن هم‌تیمی نزدیک
    emit('revive-request', {});
  } else if (player.class === 'engineer') {
    // تعمیر وسیله نزدیک (خود یا هم‌تیمی)
    let target = player.vehicle;
    if (!target) {
      for (const v of world.vehicles) {
        if (v.alive && v.mesh.position.distanceTo(player.pos) < 10) { target = v; break; }
      }
    }
    if (target) emit('repair', { vid: target.id });
  } else if (player.class === 'trader') {
    emit('supply', {}); // پخش مهمات به اطرافیان
  }
}

// ==================== تیراندازی ====================
const raycaster = new THREE.Raycaster();
const tracerPool = [];
function spawnTracer(from, to, color = 0xffdd66) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(line);
  line.userData.life = 0.12;
  tracerPool.push(line);
}
function updateTracers(dt) {
  for (let i = tracerPool.length - 1; i >= 0; i--) {
    const t = tracerPool[i];
    t.userData.life -= dt;
    t.material.opacity = Math.max(0, t.userData.life / 0.12);
    if (t.userData.life <= 0) { scene.remove(t); t.geometry.dispose(); t.material.dispose(); tracerPool.splice(i, 1); }
  }
}

function shoot() {
  const now = performance.now();
  if (player.vehicle) {
    // توپ تانک/ناو یا مسلسل/بمب جنگنده
    const cd = player.vehicle.type === 'tank' ? 1500 : player.vehicle.type === 'ship' ? 1800 : 120;
    if (now - player.lastShot < cd) return;
    player.lastShot = now;
    const v = player.vehicle;
    const origin = v.mesh.position.clone().add(new THREE.Vector3(0, v.type === 'jet' ? 1 : 3, 0));
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    emit('vehicle-shot', { vid: v.id, o: origin.toArray(), d: dir.toArray(), kind: v.type });
    raycaster.set(origin, dir);
    raycaster.far = 900;
    const hits = raycaster.intersectObjects(scene.children, true);
    let end = origin.clone().addScaledVector(dir, 300);
    for (const h of hits) {
      if (h.object.parent === v.mesh || h.object === v.mesh) continue;
      let obj = h.object, isPlayer = false, isVeh = null;
      while (obj) {
        if (avatar && obj === avatar) isPlayer = true;
        for (const vv of world.vehicles) if (vv.mesh === obj) isVeh = vv;
        obj = obj.parent;
      }
      if (isPlayer || isVeh) {
        end = h.point.clone();
        emit('hit-report', { targetId: isVeh ? ('veh:' + isVeh.id) : null, point: end.toArray(),
                            dmg: v.type === 'tank' ? 90 : v.type === 'ship' ? 70 : 12 });
        break;
      }
      if (h.object.name !== 'water' && h.face) { end = h.point.clone(); break; }
    }
    const col = v.type === 'jet' ? 0xff8844 : 0xffee88;
    spawnTracer(origin, end, col);
    return;
  }

  // پیاده
  if (player.reloading) return;
  if (now - player.lastShot < 130) return;
  if (player.ammo <= 0) { reload(); return; }
  player.lastShot = now;
  player.ammo--;

  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  // پراکندگی ساده
  dir.x += (Math.random() - 0.5) * 0.012;
  dir.y += (Math.random() - 0.5) * 0.012;
  dir.normalize();

  raycaster.set(origin, dir);
  raycaster.far = 500;
  const hitList = raycaster.intersectObjects(scene.children, true);
  let end = origin.clone().addScaledVector(dir, 200);
  for (const h of hitList) {
    let obj = h.object, victimId = null, vehHit = null;
    while (obj) {
      if (avatar && obj === avatar) break; // خودم
      for (const [id, av] of entities.avatars) if (av === obj) victimId = id;
      for (const vv of world.vehicles) if (vv.mesh === obj) vehHit = vv;
      obj = obj.parent;
    }
    if (victimId) {
      end = h.point.clone();
      emit('hit', { targetId: victimId, point: end.toArray(), dmg: 18 });
      break;
    }
    if (vehHit) {
      end = h.point.clone();
      emit('hit-report', { targetId: 'veh:' + vehHit.id, point: end.toArray(), dmg: 10 });
      break;
    }
    if (h.object.name === 'water') continue;
    end = h.point.clone(); break;
  }
  spawnTracer(origin.clone().addScaledVector(dir, 1.2), end);
}

function reload() {
  if (player.reloading || player.ammo === player.maxAmmo) return;
  player.reloading = true;
  player.reloadEnd = performance.now() + 1600;
}

// Space: در پیاده پرش، در وسیله شلیک
addEventListener('keydown', (e) => {
  if (e.code === 'Space' && player.vehicle && mouseLocked) {
    e.preventDefault();
    shoot();
  }
});

// ==================== انفجار و افکت‌ها ====================
const explosions = [];
function spawnExplosion(pos, scale = 1) {
  const geo = new THREE.SphereGeometry(2 * scale, 12, 10);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 1 }));
  m.position.copy(pos);
  scene.add(m);
  explosions.push({ m, life: 0.5, scale });
}
function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.life -= dt;
    const k = Math.max(0, e.life / 0.5);
    e.m.scale.setScalar(1 + (1 - k) * 3 * e.scale);
    e.m.material.opacity = k;
    if (e.life <= 0) { scene.remove(e.m); e.m.geometry.dispose(); e.m.material.dispose(); explosions.splice(i, 1); }
  }
}

// ==================== رویدادهای سرور ====================
socket.on('event', (ev) => {
  if (ev.type === 'join-msg' && ev.playerId !== state.myId) addChat('سیستم', `${ev.name} به میدان آمد ⚔️`, null);
  if (ev.type === 'kill') {
    addKillFeed(ev.killer, ev.victim);
    if (ev.victimId === state.myId) {
      player.hp = 0; player.alive = false; respawnTimer = 6;
      // اگر سوار وسیله بودم، پیاده می‌شوم
      if (player.vehicle) { const v = player.vehicle; player.vehicle = null; v.driver = null;
        if (avatar) avatar.visible = true; $('info-mode').textContent = 'پیاده'; }
    }
  }
  if (ev.type === 'boom') spawnExplosion(new THREE.Vector3(...ev.pos), ev.big ? 3 : 1);
  if (ev.type === 'hurt' && ev.targetId === state.myId) { flashDamage(); }
  if (ev.type === 'respawn' && ev.playerId === state.myId) {
    player.hp = 100; player.alive = true; respawnTimer = 0;
    player.pos.set(ev.pos[0], ev.pos[1], ev.pos[2]);
    player.vel.set(0, 0, 0);
    player.ammo = player.maxAmmo; player.reloading = false;
  }
  if (ev.type === 'veh-destroyed') {
    const v = vehiclesById[ev.vid];
    if (v) { v.alive = false; v.driver = null; v.mesh.visible = false; }
    if (player.vehicle && player.vehicle.id === ev.vid) {
      player.vehicle = null;
      if (avatar) avatar.visible = true;
      $('info-mode').textContent = 'پیاده';
    }
  }
  if (ev.type === 'veh-repaired' || ev.type === 'veh-state-reset') {
    const v = vehiclesById[ev.vid];
    if (v) { v.alive = true; v.mesh.visible = true; }
  }
  if (ev.type === 'supply' && ev.for === state.myId) { player.ammo = player.maxAmmo; addChat('تدارکات', 'مهمات شما پر شد! 💰'); }
});

let respawnTimer = 0;
function addKillFeed(killer, victim) {
  const kf = $('killfeed');
  const d = document.createElement('div');
  d.className = 'killmsg';
  d.textContent = `☠ ${killer} ⟶ ${victim}`;
  kf.appendChild(d);
  setTimeout(() => d.remove(), 6000);
  while (kf.children.length > 5) kf.removeChild(kf.firstChild);
}
function flashDamage() {
  const f = $('damage-flash');
  f.style.opacity = 0.8;
  setTimeout(() => f.style.opacity = 0, 180);
}

// ==================== همگام‌سازی وسایل از سرور ====================
let lastSnap = null;
window.addEventListener('net-snapshot', (e) => { lastSnap = e.detail; });

function syncVehiclesFromServer(dt) {
  if (!lastSnap || !world) return;
  for (const [vid, sv] of Object.entries(lastSnap.vehicles)) {
    const v = vehiclesById[vid];
    if (!v) continue;
    // وضعیت حیات/سرنشین
    if (v.alive !== sv.alive) { v.alive = sv.alive; v.mesh.visible = sv.alive; }
    if (v.driver !== sv.driver) v.driver = sv.driver;
    v.hp = sv.hp;
    // درایور محلی: سرور فقط تأیید می‌کند؛ هموارسازی جزئی
    const target = new THREE.Vector3(sv.x, sv.y, sv.z);
    if (player.vehicle && player.vehicle.id === vid) {
      v.mesh.position.lerp(target, 0.15);
    } else {
      v.mesh.position.lerp(target, 0.35);
      v.mesh.rotation.y += ((sv.yaw ?? 0) - v.mesh.rotation.y) * 0.25;
      if (v.type !== 'jet' && v.mesh.userData.turret) {
        v.mesh.userData.turret.rotation.y = clamp((sv.turretYaw ?? sv.yaw ?? 0) - v.mesh.rotation.y, -2.4, 2.4);
      }
    }
  }
}

// ==================== حلقه اصلی ====================
const clock = new THREE.Clock();
let fpsAcc = 0, fpsCount = 0, fpsShown = 0;

addEventListener('mousemove', (e) => {
  if (!mouseLocked || chatOpen) return;
  const sens = 0.0022;
  player.yaw -= e.movementX * sens;
  player.pitch = clamp(player.pitch - e.movementY * sens, -1.5, 1.5);
  camera.quaternion.setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
});

function getInput() {
  return {
    forward: keys['KeyW'], back: keys['KeyS'], left: keys['KeyA'], right: keys['KeyD'],
    jump: keys['Space'], run: keys['ShiftLeft'] || keys['ShiftRight'],
  };
}

function updateOnFoot(dt) {
  const inp = getInput();
  const speed = inp.run ? 11 : 6.5;
  const dir = new THREE.Vector3();
  const fwd = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const rgt = new THREE.Vector3(fwd.z, 0, -fwd.x);
  if (inp.forward) dir.add(fwd);
  if (inp.back) dir.sub(fwd);
  if (inp.left) dir.add(rgt);
  if (inp.right) dir.sub(rgt);
  if (dir.lengthSq() > 0) dir.normalize();

  // شنا در آب
  const inWater = isWater(player.pos.x, player.pos.z);
  const grav = player.parachute ? 4 : 30;
  player.vel.y -= grav * dt;
  if (inWater) { player.vel.y = Math.max(player.vel.y, -2.5); player.parachute = false; }

  player.pos.x += dir.x * speed * dt + player.vel.x * dt;
  player.pos.z += dir.z * speed * dt + player.vel.z * dt;
  player.pos.y += player.vel.y * dt;
  player.vel.x *= 0.9; player.vel.z *= 0.9;

  const gh = terrainHeight(player.pos.x, player.pos.z) + (inWater ? -1 : 0);
  if (player.pos.y <= gh) {
    player.pos.y = gh;
    if (player.vel.y < -22 && !player.parachute) { /* ضربه فرود */ }
    player.vel.y = 0;
    player.onGround = true;
    player.parachute = false;
    if (inp.jump) player.vel.y = 9;
  } else player.onGround = false;

  // برخورد با موانع
  for (const c of world.colliders) {
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < c.r + 0.6 && d > 0.001) {
      const push = (c.r + 0.6 - d);
      player.pos.x += dx / d * push;
      player.pos.z += dz / d * push;
    }
  }
  player.pos.x = clamp(player.pos.x, -790, 790);
  player.pos.z = clamp(player.pos.z, -790, 790);

  // مرگ بر اثر ارتفاع زیاد؟ نه؛ اما غرق در اعماق نه (آب کم‌عمق است)

  // دوربین و مدل من (وقتی زنده‌ام)
  if (player.alive) {
    camera.position.set(player.pos.x, player.pos.y + 1.7, player.pos.z);

    if (avatar) {
      avatar.visible = false; // نمای اول‌شخص: مدل خود را نمی‌بینم
      avatar.position.copy(player.pos);
      avatar.rotation.y = player.yaw;
      animateAvatar(avatar, dir.length() * speed, dt);
    }
  } else if (avatar) {
    avatar.visible = false;
  }

  // بازگشت جان
  if (!player.alive) {
    respawnTimer -= dt;
    if (respawnTimer <= 0) emit('respawn', {});
  }
}

function updateInVehicle(dt) {
  const v = player.vehicle;
  const inp = getInput();
  v.lookPitch = player.pitch;

  // turret به سمت مرکز صفحه
  if (v.type !== 'jet') {
    v.turretYaw = atan2FromCam();
  } else {
    v.turretYaw = undefined;
  }

  const spd = vc.update(v, inp, dt);

  if (v.crashed) {
    emit('crash', { vid: v.id });
    v.crashed = false;
  }

  vc.applyCamera(v, vc.mode === 'third', player.pitch);

  // موقعیت من = موقعیت وسیله (برای شبکه)
  player.pos.copy(v.mesh.position);

  // خروج خودکار اگر وسیله نابود شد (سرور اطلاع می‌دهد)
  const hint = $('interact-hint');
  hint.classList.add('hidden');
}

function atan2FromCam() {
  const d = new THREE.Vector3();
  camera.getWorldDirection(d);
  return Math.atan2(-d.x, -d.z);
}

function updateHUD(dt) {
  const hpPct = player.vehicle ? (player.vehicle.hp / player.vehicle.maxHp) * 100 : player.hp;
  $('hp-fill').style.width = clamp(hpPct, 0, 100) + '%';
  $('hp-text').textContent = player.vehicle
    ? `${Math.round(player.vehicle.hp)} / ${player.vehicle.maxHp} HP وسیله`
    : `${Math.round(player.hp)} HP`;
  $('ammo-text').textContent = player.vehicle
    ? (player.vehicle.type === 'jet' ? 'مسلسل + بمب: Space' : 'توپ: Space')
    : (player.reloading ? 'در حال شارژ...' : `${player.ammo} / ∞`);
  $('speed-text').textContent = player.vehicle
    ? `سرعت: ${Math.abs(player.vehicle.speed * 3.6).toFixed(0)} km/h   ارتفاع: ${player.vehicle.mesh.position.y.toFixed(0)}m`
    : (player.parachute ? '🪂 چتر نجات باز شد!' : '');

  // راهنمای تعامل
  if (!player.vehicle && world) {
    const nv = nearestVehicle(8);
    const hint = $('interact-hint');
    if (nv) {
      hint.classList.remove('hidden');
      hint.textContent = `[E] سوار شدن: ${nv.type === 'jet' ? 'جنگنده ✈' : nv.type === 'tank' ? 'تانک 🛡' : 'ناو ⚓'}`;
    } else hint.classList.add('hidden');
  }

  // مینی‌مپ
  drawMinimap();

  fpsAcc += dt; fpsCount++;
  if (fpsAcc > 0.5) { fpsShown = Math.round(fpsCount / fpsAcc); fpsAcc = 0; fpsCount = 0; $('info-fps').textContent = fpsShown + ' FPS'; }
}

const mmCtx = $('minimap').getContext('2d');
function drawMinimap() {
  const S = 180, R = 90; // شعاع نمایش
  mmCtx.clearRect(0, 0, S, S);
  mmCtx.fillStyle = 'rgba(20,40,20,.6)';
  mmCtx.beginPath(); mmCtx.arc(S / 2, S / 2, S / 2, 0, 7); mmCtx.fill();
  const px = player.vehicle ? player.vehicle.mesh.position.x : player.pos.x;
  const pz = player.vehicle ? player.vehicle.mesh.position.z : player.pos.z;
  const toMap = (x, z) => [S / 2 + (x - px) * (R / 160), S / 2 + (z - pz) * (R / 160)];
  // پایگاه‌ها
  if (world) {
    for (const [t, b] of Object.entries(world.bases)) {
      const [mx, my] = toMap(b.x, b.z);
      mmCtx.fillStyle = t === 'red' ? '#f55' : '#59f';
      mmCtx.fillRect(mx - 3, my - 3, 6, 6);
    }
    // وسایل
    for (const v of world.vehicles) {
      if (!v.alive) continue;
      const [mx, my] = toMap(v.mesh.position.x, v.mesh.position.z);
      mmCtx.fillStyle = v.type === 'jet' ? '#fd0' : v.type === 'tank' ? '#af6' : '#6df';
      mmCtx.beginPath(); mmCtx.arc(mx, my, 2.5, 0, 7); mmCtx.fill();
    }
  }
  // بازیکنان
  for (const [id, pl] of Object.entries(state.players)) {
    if (id === state.myId) continue;
    const [mx, my] = toMap(pl.pos[0], pl.pos[2]);
    mmCtx.fillStyle = pl.team === 'red' ? '#f77' : '#7af';
    mmCtx.beginPath(); mmCtx.arc(mx, my, 2, 0, 7); mmCtx.fill();
  }
  // من
  mmCtx.fillStyle = '#fff';
  mmCtx.beginPath(); mmCtx.arc(S / 2, S / 2, 3, 0, 7); mmCtx.fill();
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  // چرخش دوربین در حالت پیاده (first-person) — در وسیله کنترل مستقیم است
  if (mouseLocked && !chatOpen && !player.vehicle) {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    player.yaw = e.y; player.pitch = e.x;
  }

  if (world) {
    if (player.vehicle) {
      updateInVehicle(dt);
    } else {
      updateOnFoot(dt);
      // دوربین پیاده: اول‌شخص با جهت ماوس
      camera.position.set(player.pos.x, player.pos.y + 1.7, player.pos.z);
      camera.quaternion.setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
    }

    if (firing && mouseLocked) shoot();
    if (player.reloading && performance.now() > player.reloadEnd) {
      player.reloading = false; player.ammo = player.maxAmmo;
    }

    // ارسال وضعیت به سرور
    const posArr = player.vehicle
      ? [player.vehicle.mesh.position.x, player.vehicle.mesh.position.y, player.vehicle.mesh.position.z]
      : [player.pos.x, player.pos.y, player.pos.z];
    sendState({
      pos: posArr, yaw: player.yaw, pitch: player.pitch,
      hp: player.hp, alive: player.alive,
      vehicle: player.vehicle ? player.vehicle.id : null,
      vehYaw: player.vehicle ? player.vehicle.yaw : undefined,
      vehSpeed: player.vehicle ? player.vehicle.speed : undefined,
      turretYaw: player.vehicle ? (player.vehicle.turretYaw ?? player.vehicle.yaw) : undefined,
    }, dt);

    syncVehiclesFromServer(dt);

    // حرکت تدریجی آب برای حس موج
    const water = scene.getObjectByName('water');
    if (water) water.position.y = SEA_LEVEL + Math.sin(performance.now() * 0.0008) * 0.15;

    entities.syncPlayers(state.players, state.myId);
    updateTracers(dt);
    updateExplosions(dt);
    updateHUD(dt);
  }

  renderer.render(scene, camera);
}
loop();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// اتصال مجدد صفحه
socket.on('connect_error', () => {
  $('chat-log') && addChat('سیستم', 'اتصال قطع شد... تلاش مجدد', null);
});
