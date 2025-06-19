// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // ให้ไฟล์ index.html อยู่ในโฟลเดอร์ public

// Game state
const gameState = {
  players: {},
  bullets: [],
  powerUps: []
};

const BULLET_SPEED = 8;
const BULLET_DAMAGE = 20;
const MAX_BULLETS_PER_PLAYER = 10;

// Player class
class Player {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.health = 100;
    this.score = 0;
    this.size = 15;
    this.color = this.getRandomColor();
    this.lastShot = 0;
    this.kills = 0;
    this.deaths = 0;
  }

  getRandomColor() {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffa500', '#800080'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  takeDamage(damage) {
    this.health -= damage;
    if (this.health <= 0) {
      this.health = 0;
      this.deaths++;
      return true; // Player died
    }
    return false;
  }

  respawn() {
    this.health = 100;
    this.x = Math.random() * 760 + 20;
    this.y = Math.random() * 560 + 20;
  }
}

// Bullet class
class Bullet {
  constructor(x, y, angle, playerId) {
    this.x = x;
    this.y = y;
    this.vx = Math.cos(angle) * BULLET_SPEED;
    this.vy = Math.sin(angle) * BULLET_SPEED;
    this.playerId = playerId;
    this.id = Math.random().toString(36).substr(2, 9);
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    
    // Remove bullet if out of bounds
    return this.x < 0 || this.x > 800 || this.y < 0 || this.y > 600;
  }
}

// Spawn power-ups occasionally
function spawnPowerUp() {
  if (Math.random() < 0.1) { // 10% chance every update
    gameState.powerUps.push({
      id: Math.random().toString(36).substr(2, 9),
      x: Math.random() * 760 + 20,
      y: Math.random() * 560 + 20,
      type: Math.random() < 0.5 ? 'health' : 'damage',
      spawned: Date.now()
    });
  }
}

// Game loop
function gameLoop() {
  // Update bullets
  for (let i = gameState.bullets.length - 1; i >= 0; i--) {
    const bullet = gameState.bullets[i];
    
    if (bullet.update()) {
      gameState.bullets.splice(i, 1);
      continue;
    }

    // Check collision with players
    for (const playerId in gameState.players) {
      const player = gameState.players[playerId];
      
      if (player.id === bullet.playerId || player.health <= 0) continue;

      const distance = Math.sqrt(
        Math.pow(player.x - bullet.x, 2) + Math.pow(player.y - bullet.y, 2)
      );

      if (distance < player.size + 5) {
        // Hit!
        const died = player.takeDamage(BULLET_DAMAGE);
        gameState.bullets.splice(i, 1);

        if (died) {
          // Award kill to shooter
          if (gameState.players[bullet.playerId]) {
            gameState.players[bullet.playerId].kills++;
            gameState.players[bullet.playerId].score += 100;
          }
          
          // Respawn player after 2 seconds
          setTimeout(() => {
            if (gameState.players[playerId]) {
              player.respawn();
            }
          }, 2000);
        }

        io.emit('playerHit', {
          playerId: playerId,
          shooterId: bullet.playerId,
          health: player.health,
          died: died
        });
        break;
      }
    }
  }

  // Remove old power-ups (after 10 seconds)
  gameState.powerUps = gameState.powerUps.filter(powerUp => 
    Date.now() - powerUp.spawned < 10000
  );

  // Spawn power-ups
  spawnPowerUp();

  // Send game state to all clients
  io.emit('gameUpdate', {
    players: gameState.players,
    bullets: gameState.bullets.map(b => ({
      x: b.x,
      y: b.y,
      id: b.id,
      playerId: b.playerId
    })),
    powerUps: gameState.powerUps
  });
}

// Socket events
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

  // Join room
  socket.on('joinRoom', ({ username, room }) => {
    socket.join(room);
    socket.username = username;
    socket.room = room;
    // แจ้งผู้เล่นในห้อง
    socket.to(room).emit('message', `${username} joined room ${room}`);
    // ส่งยืนยันกลับไปหาไคลเอนต์
    socket.emit('joined', { room });
  });

  // Send message
  socket.on('sendMessage', (msg) => {
    io.to(socket.room).emit('message', `${socket.username}: ${msg}`);
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