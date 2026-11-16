// net.js — ارتباط با سرور (Socket.IO) و همگام‌سازی حالت بازی
import { io } from '/socket.io/socket.io.js';

export const socket = io();

export const state = {
  myId: null,
  seed: 12345,
  players: {},     // id -> {name, class, team, pos:[x,y,z], yaw, pitch, hp, alive, vehicle}
  vehicles: {},    // vid -> {type, team, x,y,z, yaw, pitch, speed, hp, driver}
  shots: [],       // گلوله‌های این فریم
  events: [],      // رویدادها: kill / boom / hit
};

// ارسال ورود بازیکن (رول‌پلی: نام، کلاس، تیم)
export function join(name, cls, team, cb) {
  socket.emit('join', { name, class: cls, team }, (res) => {
    state.myId = res.id;
    state.seed = res.seed;
    cb && cb(res);
  });
}

// ارسال وضعیت محلی با نرخ پایین (سرور مرجع است)
let lastSend = 0;
export function sendState(p, dt) {
  const now = performance.now();
  if (now - lastSend < 66) return; // ~15Hz
  lastSend = now;
  socket.emit('state', p);
}

export function emit(action, data) {
  socket.emit(action, data);
}

socket.on('snapshot', (snap) => {
  state.players = snap.players;
  // رویداد برای world-sync در main.js
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('net-snapshot', { detail: snap }));
});

socket.on('event', (ev) => {
  state.events.push(ev);
});
