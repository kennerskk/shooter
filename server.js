// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let rooms = {};

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create new player
  const player = new Player(
    socket.id,
    Math.random() * 760 + 20,
    Math.random() * 560 + 20
  );
  
  gameState.players[socket.id] = player;

  // Send initial game state
  socket.emit('gameState', gameState);
  socket.broadcast.emit('playerJoined', player);

  // Join room
  socket.on('joinRoom', ({ username, room }) => {
    socket.join(room);
    socket.username = username;
    socket.room = room;

    if (!rooms[room]) rooms[room] = {};
    // สุ่มตำแหน่งเกิด
    rooms[room][socket.id] = {
      x: Math.random() * 400 + 50,
      y: Math.random() * 300 + 50,
      username,
      alive: true
    };

    // ส่งข้อมูลผู้เล่นทั้งหมดในห้องให้ทุกคน
    io.to(room).emit('players', rooms[room]);
  });

  // Player movement
  socket.on('playerMove', (data) => {
    const player = gameState.players[socket.id];
    if (player && player.health > 0) {
      player.x = Math.max(player.size, Math.min(800 - player.size, data.x));
      player.y = Math.max(player.size, Math.min(600 - player.size, data.y));
    }
  });

  // Player shooting
  socket.on('playerShoot', (data) => {
    const player = gameState.players[socket.id];
    const now = Date.now();
    
    if (player && player.health > 0 && now - player.lastShot > 100) { // Rate limit
      // Count current bullets from this player
      const playerBullets = gameState.bullets.filter(b => b.playerId === socket.id).length;
      
      if (playerBullets < MAX_BULLETS_PER_PLAYER) {
        const bullet = new Bullet(data.x, data.y, data.angle, socket.id);
        gameState.bullets.push(bullet);
        player.lastShot = now;
      }
    }
  });

  // Power-up collection
  socket.on('collectPowerUp', (powerUpId) => {
    const player = gameState.players[socket.id];
    const powerUpIndex = gameState.powerUps.findIndex(p => p.id === powerUpId);
    
    if (player && powerUpIndex !== -1) {
      const powerUp = gameState.powerUps[powerUpIndex];
      
      if (powerUp.type === 'health') {
        player.health = Math.min(100, player.health + 30);
      }
      
      gameState.powerUps.splice(powerUpIndex, 1);
      io.emit('powerUpCollected', { playerId: socket.id, powerUpId, type: powerUp.type });
    }
  });

  socket.on('shoot', ({ x, y }) => {
    // ตรวจสอบโดนผู้เล่นอื่นไหม
    const shooter = rooms[socket.room]?.[socket.id];
    if (!shooter || !shooter.alive) return;
    Object.entries(rooms[socket.room]).forEach(([id, player]) => {
      if (id !== socket.id && player.alive) {
        const dx = player.x - x;
        const dy = player.y - y;
        if (Math.sqrt(dx * dx + dy * dy) < 20) {
          player.alive = false;
        }
      }
    });
    io.to(socket.room).emit('players', rooms[socket.room]);
  });

  // Player disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete gameState.players[socket.id];
    
    // Remove player's bullets
    gameState.bullets = gameState.bullets.filter(b => b.playerId !== socket.id);
    
    if (socket.room && socket.username) {
      socket.to(socket.room).emit('message', `${socket.username} left the room`);
    }
    
    socket.broadcast.emit('playerLeft', socket.id);
  });
});

// Start game loop
setInterval(gameLoop, 1000 / 60); // 60 FPS

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

});