// server.js — Express + Socket.IO، سرو فایل‌های static و بازی
'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { GameServer } = require('./server/game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// three.js به صورت مستقیم از node_modules سرو می‌شود (بدون build)
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));
app.use(express.static(path.join(__dirname, 'public')));

const game = new GameServer(io);
io.on('connection', (socket) => game.attach(socket));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`⚔️  جبهه — نبرد سه‌بعدی روی http://localhost:${PORT} اجرا شد`);
});
