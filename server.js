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