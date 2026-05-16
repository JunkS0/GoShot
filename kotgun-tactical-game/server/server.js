const http = require("http");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8787;
const players = new Map();
let nextId = 1;

const spawns = [
  { x: 0, z: 24, level: "surface" },
  { x: -46, z: -44, level: "surface" },
  { x: 46, z: 44, level: "surface" },
  { x: -32, z: -34, level: "underground" },
  { x: 32, z: 34, level: "underground" },
];

const server = http.createServer((request, response) => {
  response.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  response.end("Kotgun multiplayer server is running.\n");
});

const wss = new WebSocketServer({ server });

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function broadcast(payload, exceptId = null) {
  players.forEach((player, id) => {
    if (id !== exceptId) send(player.ws, payload);
  });
}

function snapshot() {
  return [...players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    hp: player.hp,
    armor: player.armor,
    alive: player.alive,
    state: player.state,
  }));
}

function randomSpawn() {
  return spawns[Math.floor(Math.random() * spawns.length)];
}

wss.on("connection", (ws) => {
  const id = `p${nextId++}`;
  const spawn = randomSpawn();
  const player = {
    id,
    ws,
    name: id,
    hp: 150,
    armor: "큰갑옷",
    alive: true,
    state: {
      x: spawn.x,
      z: spawn.z,
      level: spawn.level,
      yaw: 0,
      pitch: 0,
      weapon: "고총",
      scoped: false,
      hp: 150,
      armor: "큰갑옷",
      alive: true,
    },
  };
  players.set(id, player);

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (message.type === "join") {
      player.name = String(message.name || id).slice(0, 24);
      player.armor = message.armor || "큰갑옷";
      player.state = { ...player.state, ...sanitizeState(message.state), hp: player.hp, alive: player.alive };
      send(ws, { type: "welcome", id, players: snapshot() });
      broadcast(
        {
          type: "player-joined",
          id,
          name: player.name,
          hp: player.hp,
          armor: player.armor,
          alive: player.alive,
          state: player.state,
        },
        id
      );
      return;
    }

    if (message.type === "state") {
      player.state = { ...player.state, ...sanitizeState(message.state), hp: player.hp, alive: player.alive };
      broadcast({ type: "state", id, name: player.name, state: player.state }, id);
      return;
    }

    if (message.type === "shot") {
      broadcast(
        {
          type: "shot",
          id,
          name: player.name,
          origin: sanitizeVector(message.origin),
          direction: sanitizeVector(message.direction),
          weapon: String(message.weapon || "고총").slice(0, 20),
        },
        id
      );
      return;
    }

    if (message.type === "hit") {
      applyHit(player, message);
    }
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "left", id });
  });
});

function sanitizeState(state = {}) {
  const level = state.level === "underground" ? "underground" : "surface";
  return {
    x: clamp(Number(state.x) || 0, -90, 90),
    z: clamp(Number(state.z) || 0, -100, 100),
    level,
    yaw: clamp(Number(state.yaw) || 0, -Math.PI * 4, Math.PI * 4),
    pitch: clamp(Number(state.pitch) || 0, -1.5, 1.5),
    weapon: String(state.weapon || "고총").slice(0, 20),
    scoped: Boolean(state.scoped),
    armor: String(state.armor || "큰갑옷").slice(0, 12),
  };
}

function sanitizeVector(vector = {}) {
  return {
    x: clamp(Number(vector.x) || 0, -300, 300),
    y: clamp(Number(vector.y) || 0, -80, 120),
    z: clamp(Number(vector.z) || 0, -300, 300),
  };
}

function applyHit(source, message) {
  const target = players.get(message.targetId);
  if (!target || !target.alive || source.id === target.id) return;
  const damage = clamp(Number(message.damage) || 0, 0, 320);
  target.hp = Math.max(0, target.hp - damage);
  target.alive = target.hp > 0;
  target.state.hp = target.hp;
  target.state.alive = target.alive;

  broadcast({
    type: "hit",
    sourceId: source.id,
    sourceName: source.name,
    targetId: target.id,
    targetName: target.name,
    damage,
    targetHp: target.hp,
    zone: String(message.zone || "nose").slice(0, 16),
    weapon: String(message.weapon || "고총").slice(0, 20),
    dead: !target.alive,
  });

  if (!target.alive) {
    setTimeout(() => respawn(target), 3000);
  }
}

function respawn(player) {
  if (!players.has(player.id)) return;
  const spawn = randomSpawn();
  player.hp = 150;
  player.alive = true;
  player.state = {
    ...player.state,
    x: spawn.x,
    z: spawn.z,
    level: spawn.level,
    hp: 150,
    alive: true,
  };
  broadcast({
    type: "respawn",
    id: player.id,
    name: player.name,
    state: player.state,
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

server.listen(PORT, () => {
  console.log(`Kotgun multiplayer server listening on ${PORT}`);
});
