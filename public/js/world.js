// world.js — ساخت جهان: زمین، آب، کوه‌ها، شهر (جامعه)، پایگاه‌ها، وسایل نقلیه
import * as THREE from 'three';

export const WORLD_SIZE = 1600;      // اندازه نقشه
export const SEA_LEVEL = -2;         // سطح دریا (بخش فرورفته)

const rand = (a, b) => a + Math.random() * (b - a);

// ارتفاع زمین در مختصات (x,z) — تپه‌های نویزی + دریاچه/دریا در جنوب
export function terrainHeight(x, z) {
  let h = 0;
  h += Math.sin(x * 0.004) * Math.cos(z * 0.005) * 18;
  h += Math.sin(x * 0.013 + 2.1) * Math.cos(z * 0.011 - 1.3) * 7;
  h += Math.sin(x * 0.033) * Math.sin(z * 0.029) * 2.5;
  // کوه در شمال غرب
  const m1 = Math.hypot(x + 500, z + 500);
  if (m1 < 380) h += (380 - m1) * 0.45 * Math.max(0, Math.sin(m1 * 0.02) * 0.3 + 0.9);
  // دریا در جنوب (زیر سطح آب می‌رود)
  const sea = Math.max(0, (z - 500) / 260);
  h -= sea * 40;
  return h;
}

export function isWater(x, z) {
  return terrainHeight(x, z) < SEA_LEVEL;
}

// ---------- مدل‌سازها ----------
function makeHumanoid(color = 0x446633, skin = 0xd9b38c) {
  const g = new THREE.Group();
  const matBody = new THREE.MeshLambertMaterial({ color });
  const matSkin = new THREE.MeshLambertMaterial({ color: skin });
  const matDark = new THREE.MeshLambertMaterial({ color: 0x22262a });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.95, 0.4), matBody);
  torso.position.y = 1.35; g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), matSkin);
  head.position.y = 2.05; g.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), matDark);
  helmet.position.y = 2.1; g.add(helmet);

  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), matBody);
    arm.position.set(s * 0.48, 1.4, 0); arm.name = s < 0 ? 'armL' : 'armR'; g.add(arm);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.9, 0.26), matDark);
    leg.position.set(s * 0.2, 0.45, 0); leg.name = s < 0 ? 'legL' : 'legR'; g.add(leg);
  }
  // تفنگ پیاده
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.9), matDark);
  gun.position.set(0.45, 1.35, 0.55); gun.name = 'gun'; g.add(gun);
  return g;
}

function makeTank(teamColor) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: teamColor });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b2b22 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 5.2), mat);
  body.position.y = 1.0; g.add(body);
  const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 5.4), dark);
  trackL.position.set(-1.7, 0.6, 0); g.add(trackL);
  const trackR = trackL.clone(); trackR.position.x = 1.7; g.add(trackR);

  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.y = 1.8;
  const tp = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.5, 0.8, 12), mat);
  turret.add(tp);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 4.2, 8), dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.1, 2.4); barrel.name = 'barrel';
  turret.add(barrel);
  g.add(turret);
  g.userData.turret = turret;
  return g;
}

function makeJet() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x8a929c });
  const dark = new THREE.MeshLambertMaterial({ color: 0x33383f });

  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 8, 10), mat);
  fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 10), dark);
  nose.rotation.x = -Math.PI / 2; nose.position.z = 4.6; g.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshLambertMaterial({ color: 0x3355aa }));
  canopy.position.set(0, 0.4, 1.6); g.add(canopy);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.16, 2.2), mat);
  wing.position.z = -0.5; g.add(wing);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 1.2), mat);
  tailWing.position.z = -3.6; g.add(tailWing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 1.6), mat);
  fin.position.set(0, 0.9, -3.5); g.add(fin);
  for (const s of [-1, 1]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.4, 8), dark);
    eng.rotation.x = Math.PI / 2; eng.position.set(s * 1.6, -0.1, -0.8); g.add(eng);
  }
  return g;
}

function makeShip(teamColor) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x6d7a86 });
  const accent = new THREE.MeshLambertMaterial({ color: teamColor });

  const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 22), mat);
  hull.position.y = 0.6; g.add(hull);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 4), mat);
  bow.rotation.x = -Math.PI / 2; bow.rotation.z = Math.PI / 4;
  bow.scale.set(1, 0.4, 1); bow.position.set(0, 0.6, 13.5); g.add(bow);

  const bridge = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 5), mat);
  bridge.position.set(0, 3.2, -3); g.add(bridge);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 6), accent);
  mast.position.set(0, 6.5, -3); g.add(mast);

  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.set(0, 2.2, 7);
  turret.add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 1, 10), accent));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 4, 8), mat);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.3, 2); turret.add(barrel);
  g.add(turret);
  g.userData.turret = turret;
  return g;
}

function makeBuilding(w, h, d, color) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
  b.position.y = h / 2; g.add(b);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.5, d + 0.6),
    new THREE.MeshLambertMaterial({ color: 0x5a4632 }));
  roof.position.y = h + 0.25; g.add(roof);
  return g;
}

function makeTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 2.4, 6),
    new THREE.MeshLambertMaterial({ color: 0x5b3d22 }));
  trunk.position.y = 1.2; g.add(trunk);
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.6, 8),
    new THREE.MeshLambertMaterial({ color: 0x2e6b2e }));
  leaves.position.y = 4; g.add(leaves);
  return g;
}

// ---------- ساخت کل جهان (تکرارپذیر با seed) ----------
export function buildWorld(scene, seed = 12345) {
  let _s = seed >>> 0;
  const srand = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
  const rand = (a, b) => a + srand() * (b - a);

  const colliders = [];   // موانع برای برخورد پیاده: {x,z,r}
  const vehicles = [];    // اطلاعات وسایل نقلیه قابل سوار شدن

  // زمین با ارتفاع نویزی
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 128, 128);
  geo.rotateX(-Math.PI / 2);
  const posAttr = geo.attributes.position;
  const colors = [];
  const cGrass = new THREE.Color(0x4a7a3a), cSand = new THREE.Color(0xbfa06a),
        cRock = new THREE.Color(0x7c7c78), cSnow = new THREE.Color(0xe8eef2), cMud = new THREE.Color(0x5c5138);
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i), z = posAttr.getZ(i);
    const h = terrainHeight(x, z);
    posAttr.setY(i, h);
    let c = cGrass;
    if (h < SEA_LEVEL + 2) c = cSand;
    else if (h > 30) c = cSnow;
    else if (h > 18) c = cRock;
    else if (h < 2 && Math.abs(z) > 400) c = cMud;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(ground);

  // آب
  const waterGeo = new THREE.PlaneGeometry(WORLD_SIZE * 1.6, WORLD_SIZE * 1.6);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, new THREE.MeshLambertMaterial({
    color: 0x1c5f8a, transparent: true, opacity: 0.8
  }));
  water.position.y = SEA_LEVEL;
  water.name = 'water';
  scene.add(water);

  // ===== شهر / جامعه (منطقه مرکزی-غربی) =====
  const cityCenter = { x: -180, z: -40 };
  const buildingColors = [0x9a8a70, 0x8a6f56, 0xa09080, 0x707a86, 0x86604a];
  for (let i = 0; i < 34; i++) {
    const bx = cityCenter.x + rand(-140, 140);
    const bz = cityCenter.z + rand(-110, 110);
    if (isWater(bx, bz)) continue;
    const w = rand(6, 14), h = rand(6, 22), d = rand(6, 14);
    const bld = makeBuilding(w, h, d, buildingColors[i % buildingColors.length]);
    bld.position.set(bx, terrainHeight(bx, bz), bz);
    scene.add(bld);
    colliders.push({ x: bx, z: bz, r: Math.max(w, d) / 2 + 0.5 });
  }
  // بازار جامعه: چادرها
  for (let i = 0; i < 8; i++) {
    const mx = cityCenter.x + rand(-40, 40), mz = cityCenter.z + rand(-30, 30);
    const tent = new THREE.Mesh(new THREE.ConeGeometry(3, 4, 4),
      new THREE.MeshLambertMaterial({ color: i % 2 ? 0xc8b04a : 0xaa5533 }));
    tent.position.set(mx, terrainHeight(mx, mz) + 2, mz);
    scene.add(tent);
    colliders.push({ x: mx, z: mz, r: 2.5 });
  }

  // ===== درخت‌ها =====
  for (let i = 0; i < 220; i++) {
    const tx = rand(-WORLD_SIZE / 2, WORLD_SIZE / 2), tz = rand(-WORLD_SIZE / 2, 420);
    if (isWater(tx, tz)) continue;
    if (Math.hypot(tx - cityCenter.x, tz - cityCenter.z) < 60) continue;
    const t = makeTree();
    t.position.set(tx, terrainHeight(tx, tz), tz);
    const s = rand(0.8, 1.6); t.scale.set(s, s, s);
    scene.add(t);
    colliders.push({ x: tx, z: tz, r: 0.8 });
  }

  // ===== پایگاه‌ها =====
  const bases = {
    red:  { x: -620, z: -620 },
    blue: { x: 620, z: -620 },
  };
  for (const [team, b] of Object.entries(bases)) {
    const color = team === 'red' ? 0xbb3333 : 0x3366bb;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 1, 24),
      new THREE.MeshLambertMaterial({ color }));
    pad.position.set(b.x, terrainHeight(b.x, b.z) + 0.5, b.z);
    scene.add(pad);
    // پرچم
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 14, 6),
      new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    pole.position.set(b.x, terrainHeight(b.x, b.z) + 7, b.z);
    scene.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(5, 2.5, 0.15),
      new THREE.MeshLambertMaterial({ color }));
    flag.position.set(b.x + 2.6, terrainHeight(b.x, b.z) + 12, b.z);
    scene.add(flag);
  }

  // ===== باند فرود جنگنده =====
  const runwayZ = -300;
  const rw = new THREE.Mesh(new THREE.BoxGeometry(24, 0.4, 320),
    new THREE.MeshLambertMaterial({ color: 0x3a3a3e }));
  rw.position.set(150, terrainHeight(150, runwayZ) + 0.2, runwayZ);
  scene.add(rw);

  // ===== وسایل نقلیه (جنگنده، تانک، ناو) =====
  const spawnList = [
    // نوع، موقعیت، تیم
    ['jet', { x: 120, z: -400 }, 'any'], ['jet', { x: 170, z: -400 }, 'any'],
    ['tank', { x: bases.red.x + 20, z: bases.red.z + 20 }, 'red'],
    ['tank', { x: bases.red.x - 20, z: bases.red.z + 25 }, 'red'],
    ['tank', { x: bases.blue.x + 20, z: bases.blue.z + 20 }, 'blue'],
    ['tank', { x: bases.blue.x - 20, z: bases.blue.z + 25 }, 'blue'],
    ['tank', { x: 0, z: 100 }, 'neutral'],
    ['ship', { x: -100, z: 640 }, 'red'],
    ['ship', { x: 200, z: 660 }, 'blue'],
  ];
  for (const [type, p, team] of spawnList) {
    let mesh, y, hp;
    if (type === 'jet') {
      mesh = makeJet(); y = terrainHeight(p.x, p.z) + 1.2; hp = 120;
      mesh.rotation.y = Math.PI;
    } else if (type === 'tank') {
      const tc = team === 'red' ? 0x8a5a3a : team === 'blue' ? 0x4a6a5a : 0x6a6a5a;
      mesh = makeTank(tc); y = terrainHeight(p.x, p.z); hp = 300;
    } else {
      const tc = team === 'red' ? 0x994444 : 0x446699;
      mesh = makeShip(tc); y = SEA_LEVEL + 0.4; hp = 500;
    }
    const v = { id: 'v' + vehicles.length, type, mesh, team, hp, maxHp: hp, alive: true,
                seat: new THREE.Vector3(), yaw: 0, pitch: 0, speed: 0, alt: y };
    mesh.position.set(p.x, y, p.z);
    scene.add(mesh);
    vehicles.push(v);
  }

  return { colliders, vehicles, bases, cityCenter };
}

export { makeHumanoid, makeTank, makeJet, makeShip };
