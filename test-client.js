// تست یکپارچگی سرور با کلاینت واقعی socket.io
const { io } = require('socket.io-client');
(async () => {
  const results = [];
  function makeClient(name, cls, team) {
    return new Promise((resolve) => {
      const s = io('http://localhost:3000', { transports: ['websocket'] });
      const c = { s, name, snapshots: [], events: [], chats: [] };
      s.on('snapshot', (snap) => c.snapshots.push(snap));
      s.on('event', (ev) => c.events.push(ev));
      s.on('chat', (m) => c.chats.push(m));
      s.on('connect', () => {
        s.emit('join', { name, class: cls, team }, (res) => { c.id = res.id; c.seed = res.seed; resolve(c); });
      });
    });
  }
  const a = await makeClient('Ali', 'rifleman', 'red');
  console.log('A joined:', a.id, 'seed:', a.seed);
  const b = await makeClient('Reza', 'medic', 'blue');
  console.log('B joined:', b.id);

  // A وضعیت می‌فرستد، سوار تانک v2 می‌شود
  await new Promise(r => setTimeout(r, 300));
  a.s.emit('state', { pos: [-600, 5, -600], yaw: 0, pitch: 0, hp: 100, alive: true, vehicle: 'v2', vehYaw: 0.5, vehSpeed: 10 });
  b.s.emit('state', { pos: [600, 5, -600], yaw: 0, pitch: 0, hp: 100, alive: true, vehicle: null });
  await new Promise(r => setTimeout(r, 400));
  a.s.emit('state', { pos: [-590, 5, -600], yaw: 0.5, pitch: 0, hp: 100, alive: true, vehicle: 'v2', vehYaw: 0.5, vehSpeed: 12 });
  await new Promise(r => setTimeout(r, 400));

  // چت
  a.s.emit('chat', 'سلام جامعه!');
  await new Promise(r => setTimeout(r, 200));

  // B به A شلیک می‌کند (تیم مخالف) — ۶ بار × 18 dmg = 108 → کشته
  for (let i = 0; i < 6; i++) b.s.emit('hit', { targetId: a.id, dmg: 18 });
  await new Promise(r => setTimeout(r, 300));

  const kill = a.events.find(e => e.type === 'kill');
  const respawnEv = a.events.find(e => e.type === 'respawn' && e.playerId === a.id);
  console.log('KILL event:', kill ? `${kill.killer} -> ${kill.victim}` : 'NONE');
  console.log('A got hurt flash:', a.events.some(e => e.type === 'hurt'));
  console.log('Chat received by B:', b.chats.length > 0 ? b.chats[0].msg : 'NONE');

  // بررسی snapshot: A در سرور باید مرده و از تانک خارج شده باشد
  const lastSnap = b.snapshots[b.snapshots.length - 1];
  const pa = lastSnap.players[a.id];
  console.log('Server state of A: alive=' + pa.alive + ' hp=' + pa.hp + ' vehicle=' + pa.vehicle);
  console.log('Vehicle v2 driver after death:', lastSnap.vehicles['v2'].driver);

  // مهندس: B را مهندس کن—we can't change class mid-game; test repair via engineer client
  const c = await makeClient('Natalia', 'engineer', 'blue');
  c.s.emit('state', { pos: [0, 5, 100], yaw: 0, pitch: 0, hp: 100, alive: true, vehicle: null });
  await new Promise(r => setTimeout(r, 200));
  // آسیب به تانک خنثی v6
  b.s.emit('hit-report', { targetId: 'veh:v6', point: [0,5,100], dmg: 295 });
  await new Promise(r => setTimeout(r, 300));
  let snap2 = b.snapshots[b.snapshots.length - 1];
  console.log('Tank v6 hp after damage:', snap2.vehicles['v6'].hp, 'alive:', snap2.vehicles['v6'].alive);
  // تخریب کامل
  b.s.emit('hit-report', { targetId: 'veh:v6', point: [0,5,100], dmg: 100 });
  await new Promise(r => setTimeout(r, 300));
  snap2 = b.snapshots[b.snapshots.length - 1];
  console.log('Tank v6 destroyed event seen:', b.events.some(e => e.type === 'veh-destroyed' && e.vid === 'v6'));
  console.log('Boom event seen:', b.events.some(e => e.type === 'boom'));
  // تعمیر توسط مهندس نزدیک
  c.s.emit('repair', { vid: 'v6' });
  await new Promise(r => setTimeout(r, 300));
  snap2 = c.snapshots[c.snapshots.length - 1];
  console.log('Tank v6 repaired hp:', snap2.vehicles['v6'].hp);

  // تست بمباران خودی (friendly fire ضعیف‌تر)
  const beforeHp = (b.snapshots[b.snapshots.length-1].players[c.id]||{}).hp;
  b.s.emit('hit', { targetId: c.id, dmg: 10 }); // تیم مخالف blue... c هم blue → friendly
  await new Promise(r => setTimeout(r, 250));
  const afterHp = b.snapshots[b.snapshots.length-1].players[c.id].hp;
  console.log('Friendly-fire reduced hp 10->', 100-afterHp, '(expect 3)');

  a.s.close(); b.s.close(); c.s.close();
  console.log('ALL TESTS DONE');
  process.exit(0);
})().catch(e => { console.error('TEST FAIL:', e); process.exit(1); });
