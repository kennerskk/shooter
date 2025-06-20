const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ username, room }) => {
    socket.join(room);
    socket.username = username;
    socket.room = room;

    if (!rooms[room]) rooms[room] = {};
    // สุ่มตำแหน่งเกิด
    rooms[room][socket.id] = {
      x: Math.random() * 500 + 50,
      y: Math.random() * 300 + 50,
      username,
      alive: true
    };

    io.to(room).emit('players', rooms[room]);
  });

  socket.on('move', dir => {
    const player = rooms[socket.room]?.[socket.id];
    if (!player || !player.alive) return;
    const speed = 5;
    if (dir === 'left') player.x -= speed;
    if (dir === 'right') player.x += speed;
    if (dir === 'up') player.y -= speed;
    if (dir === 'down') player.y += speed;
    // ขอบเขต
    player.x = Math.max(15, Math.min(585, player.x));
    player.y = Math.max(15, Math.min(385, player.y));
    io.to(socket.room).emit('players', rooms[socket.room]);
  });

  socket.on('shoot', ({ x, y }) => {
    const shooter = rooms[socket.room]?.[socket.id];
    if (!shooter || !shooter.alive) return;
    Object.entries(rooms[socket.room]).forEach(([id, player]) => {
      if (id !== socket.id && player.alive) {
        const dx = player.x - x;
        const dy = player.y - y;
        if (Math.sqrt(dx * dx + dy * dy) < 25) {
          player.alive = false;
        }
      }
    });
    io.to(socket.room).emit('players', rooms[socket.room]);
  });

  socket.on('respawn', () => {
    const player = rooms[socket.room]?.[socket.id];
    if (player && !player.alive) {
      player.x = Math.random() * 500 + 50;
      player.y = Math.random() * 300 + 50;
      player.alive = true;
      io.to(socket.room).emit('players', rooms[socket.room]);
    }
  });

  socket.on('disconnect', () => {
    if (rooms[socket.room]) {
      delete rooms[socket.room][socket.id];
      io.to(socket.room).emit('players', rooms[socket.room]);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server running on http://localhost:' + PORT);
});

function draw() {
  ctx.clearRect(0,0,600,400);
  Object.entries(players).forEach(([id, p]) => {
    ctx.save();
    ctx.globalAlpha = p.alive ? 1 : 0.3;
    ctx.fillStyle = id === myId ? '#4caf50' : '#03a9f4';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 15, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // วาด hitbox ขอบแดง (รัศมี 25)
    ctx.beginPath();
    ctx.arc(p.x, p.y, 25, 0, Math.PI*2);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.username, p.x, p.y - 22);
    ctx.restore();
  });
  requestAnimationFrame(draw);
}