// vehicle.js — فیزیک و کنترل وسایل نقلیه: تانک 🛡 جنگنده ✈ ناو ⚓ + سوار/پیاده شدن
import * as THREE from 'three';
import { terrainHeight, isWater, SEA_LEVEL } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class VehicleController {
  constructor(camera) { this.camera = camera; this.mode = 'third'; }

  // ---------- تانک ----------
  updateTank(v, input, dt) {
    const accel = 14, maxSpd = 22, turn = 1.6;
    if (input.forward) v.speed += accel * dt;
    else if (input.back) v.speed -= accel * dt;
    else v.speed *= (1 - 2.2 * dt);
    v.speed = clamp(v.speed, -maxSpd * 0.5, maxSpd);
    if (Math.abs(v.speed) > 0.5) {
      v.yaw += (input.left ? turn : 0) - (input.right ? turn : 0);
    }
    const dx = -Math.sin(v.yaw) * v.speed * dt;
    const dz = -Math.cos(v.yaw) * v.speed * dt;
    const nx = v.mesh.position.x + dx, nz = v.mesh.position.z + dz;
    if (!isWater(nx, nz)) {
      v.mesh.position.x = clamp(nx, -780, 780);
      v.mesh.position.z = clamp(nz, -780, 780);
    } else v.speed *= -0.3;
    v.mesh.position.y = terrainHeight(v.mesh.position.x, v.mesh.position.z);
    v.mesh.rotation.y = v.yaw;

    // برجک به سمت نگاه بازیکن
    if (v.turretYaw !== undefined) {
      v.mesh.userData.turret.rotation.y = clamp(v.turretYaw - v.yaw, -2.4, 2.4);
    }
    return v.speed;
  }

  // ---------- جنگنده ----------
  updateJet(v, input, dt) {
    // گاز با W، ترمز/سرعت کم با S
    if (input.forward) v.speed += 55 * dt;
    else if (input.back) v.speed -= 40 * dt;
    else v.speed += (110 - v.speed) * 0.15 * dt;
    v.speed = clamp(v.speed, 0, 260);

    // پیچش و کج‌شدن (A/D)، ارتفاع با چرخش دوربین (pitch نگاه خلبان)
    const rollTarget = (input.left ? 0.9 : 0) - (input.right ? 0.9 : 0);
    v.roll += (rollTarget - v.roll) * 4 * dt;
    v.yaw -= v.roll * dt * 0.9 * clamp(v.speed / 120, 0, 1);

    // climb از pitch نگاه خلبان
    const pitch = clamp(v.lookPitch ?? 0, -0.6, 0.6);
    v.pitch += ((-pitch * 0.7) - v.pitch) * 3 * dt;

    const dir = new THREE.Vector3(0, 0, -1)
      .applyEuler(new THREE.Euler(v.pitch, v.yaw, 0, 'YXZ'));
    v.mesh.position.addScaledVector(dir, v.speed * dt);

    // مرزها و ارتفاع
    v.mesh.position.x = clamp(v.mesh.position.x, -790, 790);
    v.mesh.position.z = clamp(v.mesh.position.z, -790, 790);
    const ground = terrainHeight(v.mesh.position.x, v.mesh.position.z);
    if (v.mesh.position.y < ground + 3) {
      v.mesh.position.y = ground + 3;
      if (v.pitch < -0.15 && v.speed > 60) v.crashed = true; // برخورد با زمین
    }
    v.mesh.position.y = Math.min(v.mesh.position.y, 420);
    v.mesh.rotation.set(0, 0, 0);
    v.mesh.rotateY(v.yaw); v.mesh.rotateX(v.pitch); v.mesh.rotateZ(v.roll);
    return v.speed;
  }

  // ---------- ناو ----------
  updateShip(v, input, dt) {
    if (input.forward) v.speed += 6 * dt;
    else if (input.back) v.speed -= 6 * dt;
    else v.speed *= (1 - 0.8 * dt);
    v.speed = clamp(v.speed, -8, 16);
    if (Math.abs(v.speed) > 0.3)
      v.yaw += ((input.left ? 0.5 : 0) - (input.right ? 0.5 : 0)) * dt * clamp(Math.abs(v.speed), 0, 1);
    const dx = -Math.sin(v.yaw) * v.speed * dt;
    const dz = -Math.cos(v.yaw) * v.speed * dt;
    const nx = v.mesh.position.x + dx, nz = v.mesh.position.z + dz;
    if (isWater(nx, nz)) {
      v.mesh.position.x = nx; v.mesh.position.z = nz;
    } else v.speed *= -0.2; // به ساحل نکوبد
    v.mesh.position.x = clamp(v.mesh.position.x, -790, 790);
    v.mesh.position.z = clamp(v.mesh.position.z, -790, 790);
    // موج
    v.bob = (v.bob || 0) + dt * 1.4;
    v.mesh.position.y = SEA_LEVEL + 0.4 + Math.sin(v.bob) * 0.25;
    v.mesh.rotation.y = v.yaw;
    v.mesh.rotation.z = Math.sin(v.bob * 0.7) * 0.03;
    if (v.turretYaw !== undefined)
      v.mesh.userData.turret.rotation.y = clamp(v.turretYaw - v.yaw, -2.4, 2.4);
    return v.speed;
  }

  update(v, input, dt) {
    if (v.type === 'tank') return this.updateTank(v, input, dt);
    if (v.type === 'jet') return this.updateJet(v, input, dt);
    if (v.type === 'ship') return this.updateShip(v, input, dt);
    return 0;
  }

  // دوربین داخل/بیرون وسیله
  applyCamera(v, thirdPerson, lookPitch) {
    const cam = this.camera;
    if (v.type === 'jet' && !thirdPerson) {
      // کوکپیت
      const seat = new THREE.Vector3(0, 0.7, 1.2).applyQuaternion(v.mesh.quaternion).add(v.mesh.position);
      cam.position.copy(seat);
      const e = new THREE.Euler(v.pitch, v.yaw, 0, 'YXZ');
      cam.quaternion.setFromEuler(e);
    } else {
      const dist = v.type === 'jet' ? 18 : v.type === 'ship' ? 26 : 12;
      const hOff = v.type === 'jet' ? 4 : 6;
      const behind = new THREE.Vector3(0, 0, dist).applyAxisAngle(new THREE.Vector3(0, 1, 0), v.yaw);
      cam.position.set(v.mesh.position.x + behind.x, v.mesh.position.y + hOff, v.mesh.position.z + behind.z);
      cam.lookAt(v.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)));
    }
  }
}
