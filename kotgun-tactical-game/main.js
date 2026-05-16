import * as THREE from "./vendor/three.module.js";

const canvas = document.querySelector("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x271721);
scene.fog = new THREE.Fog(0x271721, 70, 220);

const camera = new THREE.PerspectiveCamera(74, 1, 0.1, 260);
camera.rotation.order = "YXZ";

const textureLoader = new THREE.TextureLoader();
const characterTexture = textureLoader.load("./assets/character.png");
const surfaceReference = textureLoader.load("./assets/surface_reference.webp");
const undergroundReference = textureLoader.load("./assets/underground_reference.webp");
characterTexture.colorSpace = THREE.SRGBColorSpace;
surfaceReference.colorSpace = THREE.SRGBColorSpace;
undergroundReference.colorSpace = THREE.SRGBColorSpace;

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const keys = new Set();
const solidTargets = [];
const damageTargets = [];
const bots = [];
const remotePlayers = new Map();

const LEVEL_Y = { surface: 0, underground: -16 };
const CAMERA_HEIGHT = 2;
const levelNames = { surface: "지상", underground: "지하" };
const bounds = {
  surface: { x: 70, z: 84, y: LEVEL_Y.surface + CAMERA_HEIGHT },
  underground: { x: 58, z: 64, y: LEVEL_Y.underground + CAMERA_HEIGHT },
};

const ui = {
  start: document.querySelector("#startButton"),
  weaponName: document.querySelector("#weaponName"),
  weaponStats: document.querySelector("#weaponStats"),
  ammoLine: document.querySelector("#ammoLine"),
  weaponRow: document.querySelector("#weaponRow"),
  hp: document.querySelector("#hp"),
  armor: document.querySelector("#armor"),
  speed: document.querySelector("#speed"),
  level: document.querySelector("#levelBadge"),
  site: document.querySelector("#siteBadge"),
  intel: document.querySelector("#intelBadge"),
  net: document.querySelector("#netBadge"),
  log: document.querySelector("#log"),
  serverUrl: document.querySelector("#serverUrl"),
  connect: document.querySelector("#connectButton"),
};

const player = {
  id: null,
  name: `Player-${Math.floor(Math.random() * 900 + 100)}`,
  hp: 150,
  armor: "큰갑옷",
  armorLimit: 150,
  alive: true,
  level: "surface",
  position: new THREE.Vector3(0, bounds.surface.y, 24),
  yaw: 0,
  pitch: 0,
  scoped: false,
  lastShot: 0,
};

const weapons = [
  {
    key: "1",
    name: "고총",
    role: "권총",
    rate: 2.5,
    spread: 0.035,
    move: 1,
    sound: "deagle",
    falloff: 20,
    damage: { eye: [150, 140], nose: [50, 45], lower: [30, 20] },
  },
  {
    key: "2",
    name: "산총",
    role: "산탄총",
    rate: 0.8,
    spread: 0.145,
    pellets: 8,
    move: 0.92,
    sound: "shotgun",
    falloff: 10,
    damage: { eye: [20, 10], nose: [15, 5], lower: [10, 3] },
  },
  {
    key: "3",
    name: "저총",
    role: "저격총",
    rate: 0.5,
    spread: 0.72,
    scopedSpread: 0,
    move: 0.78,
    sound: "sniper",
    falloff: 50,
    damage: { eye: [300, 300], nose: [150, 140], lower: [85, 75] },
  },
  {
    key: "4",
    name: "소총",
    role: "자동소총",
    rate: 10,
    spread: 0.018,
    recoil: 0.006,
    move: 0.94,
    sound: "rifle",
    falloff: 30,
    damage: { eye: [75, 60], nose: [35, 28], lower: [25, 20] },
  },
  {
    key: "5",
    name: "기총",
    role: "경기관총",
    rate: 15,
    spread: 0.06,
    recoil: 0.012,
    move: 0.64,
    sound: "machine",
    falloff: 20,
    damage: { eye: [50, 40], nose: [24, 18], lower: [15, 10] },
  },
  {
    key: "6",
    name: "단검",
    role: "근접",
    rate: 2,
    heavyRate: 0.7,
    range: 2,
    move: 1.22,
    sound: "knife",
    damage: {
      backLight: 100,
      backHeavy: 200,
      eyeLight: 60,
      eyeHeavy: 120,
      noseLight: 40,
      noseHeavy: 80,
      lowerLight: 25,
      lowerHeavy: 50,
    },
  },
];

let weaponIndex = 0;
let fireHeld = false;
let firingSince = 0;
let burstShots = 0;
let audioContext;
let socket;
let networkStatus = "solo";
let lastNetSend = 0;

function makeMaterial(color, roughness = 0.86, metalness = 0.03) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

const mats = {
  plaza: makeMaterial(0xc9b29b),
  plazaLine: makeMaterial(0x9e7d67),
  redPlaster: makeMaterial(0xb9574f),
  deepRed: makeMaterial(0x813a3a),
  peach: makeMaterial(0xd98d72),
  whiteWall: makeMaterial(0xd9d2bd),
  terracotta: makeMaterial(0x9d3d2f),
  darkRoof: makeMaterial(0x572b2f),
  stone: makeMaterial(0x928b7e),
  metal: makeMaterial(0x363941, 0.55, 0.12),
  yellow: makeMaterial(0xffbe70),
  blue: makeMaterial(0x4f8ec7),
  green: makeMaterial(0x5e8a5d),
  wood: makeMaterial(0x6f563e),
  crate: makeMaterial(0x9b805c),
  tarp: new THREE.MeshStandardMaterial({
    color: 0x456f79,
    side: THREE.DoubleSide,
    roughness: 0.95,
  }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x8ed3ff,
    transparent: true,
    opacity: 0.2,
    roughness: 0.12,
  }),
};

function addBox(x, y, z, sx, sy, sz, mat, name = "cover", solid = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  mesh.position.set(x, y + sy / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.name = name;
  scene.add(mesh);
  if (solid) solidTargets.push(mesh);
  return mesh;
}

function addPlane(x, y, z, w, h, mat, rotation = [0, 0, 0]) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

function addFloor(level, color, size) {
  const floor = new THREE.Mesh(new THREE.BoxGeometry(size[0], 0.42, size[1]), makeMaterial(color));
  floor.position.set(0, LEVEL_Y[level] - 0.21, 0);
  floor.receiveShadow = true;
  scene.add(floor);
  return floor;
}

function addRoof(x, y, z, sx, sz, mat = mats.terracotta) {
  const left = addBox(x - sx * 0.18, y, z, sx * 0.56, 0.45, sz, mat, "roof", false);
  const right = addBox(x + sx * 0.18, y, z, sx * 0.56, 0.45, sz, mat, "roof", false);
  left.rotation.z = 0.36;
  right.rotation.z = -0.36;
}

function addArch(x, y, z, w, h, d, mat) {
  addBox(x - w / 2, y, z, 1.2, h, d, mat, "arch");
  addBox(x + w / 2, y, z, 1.2, h, d, mat, "arch");
  addBox(x, y + h - 1, z, w + 1.2, 1.2, d, mat, "arch");
}

function addSite(level, x, z, label, color) {
  const site = new THREE.Mesh(
    new THREE.CylinderGeometry(12, 12, 0.08, 48),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.44 })
  );
  site.position.set(x, LEVEL_Y[level] + 0.05, z);
  site.userData.site = `${levelNames[level]} ${label}`;
  scene.add(site);
}

function addReferencePanel(texture, x, y, z, w, h, rotationY) {
  const panel = addPlane(
    x,
    y,
    z,
    w,
    h,
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    [0, rotationY, 0]
  );
  panel.userData.name = "reference panel";
}

function buildSurfaceMap() {
  addFloor("surface", 0xbca58e, [146, 174]);

  const sun = new THREE.DirectionalLight(0xffd7a5, 2.5);
  sun.position.set(34, 72, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xb8c8ff, 0x4b241f, 1.16));

  addSite("surface", -38, -48, "A", 0xffbe70);
  addSite("surface", 42, 45, "B", 0xff7668);

  const buildings = [
    [-62, 0, -54, 15, 15, 34, mats.deepRed],
    [-43, 0, -69, 30, 12, 10, mats.redPlaster],
    [-66, 0, 12, 14, 13, 58, mats.peach],
    [-35, 0, 62, 34, 12, 14, mats.whiteWall],
    [62, 0, 52, 18, 14, 40, mats.redPlaster],
    [41, 0, 72, 34, 12, 10, mats.peach],
    [64, 0, -18, 14, 12, 42, mats.whiteWall],
    [29, 0, -63, 32, 13, 13, mats.redPlaster],
    [-12, 0, -36, 12, 8, 26, mats.whiteWall],
    [19, 0, 33, 12, 8, 30, mats.peach],
  ];
  buildings.forEach(([x, y, z, sx, sy, sz, mat]) => {
    addBox(x, y, z, sx, sy, sz, mat, "red city block");
    addRoof(x, y + sy + 0.2, z, sx + 2, sz + 2, sx > 24 ? mats.terracotta : mats.darkRoof);
  });

  addBox(0, 0, -78, 114, 7, 5, mats.stone, "north wall");
  addBox(0, 0, 82, 114, 7, 5, mats.stone, "south wall");
  addBox(-73, 0, 0, 5, 7, 132, mats.stone, "west wall");
  addBox(73, 0, 0, 5, 7, 132, mats.stone, "east wall");

  addArch(-38, 0, -24, 10, 8, 3, mats.redPlaster);
  addArch(39, 0, 19, 10, 8, 3, mats.peach);
  addBox(-19, 0, 0, 26, 3, 4, mats.stone, "mid cover");
  addBox(26, 0, -7, 25, 3, 4, mats.stone, "mid cover");
  addBox(-41, 0, -45, 9, 2.5, 9, mats.stone, "A site cube");
  addBox(-27, 0, -52, 7, 4, 7, mats.stone, "A site cube");
  addBox(42, 0, 45, 9, 2.5, 9, mats.stone, "B site cube");
  addBox(31, 0, 36, 8, 4, 6, mats.stone, "B site cube");

  for (let i = 0; i < 9; i += 1) {
    addBox(-52 + i * 13, 0.02, -6, 7, 0.05, 1.2, mats.plazaLine, "paving", false);
    addBox(-4, 0.03, -50 + i * 13, 1.2, 0.05, 7, mats.plazaLine, "paving", false);
  }

  addBox(4, 0, -18, 7, 34, 7, mats.deepRed, "clock tower");
  addBox(4, 34, -18, 9, 4, 9, mats.whiteWall, "clock tower", false);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(5.7, 17, 4), mats.terracotta);
  spire.position.set(4, 46.5, -18);
  spire.rotation.y = Math.PI / 4;
  spire.castShadow = true;
  scene.add(spire);

  for (let i = 0; i < 7; i += 1) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(5 + i * 0.9, 0), makeMaterial(0x5a4f57));
    rock.position.set(-120 + i * 42, -18 - i * 1.7, -118 - (i % 2) * 16);
    rock.rotation.set(i * 0.4, i * 0.7, 0);
    scene.add(rock);
  }

  addReferencePanel(surfaceReference, 0, 11, -81.8, 28, 16, 0);
}

function addCrateStack(x, z, level, rows = 2) {
  const y = LEVEL_Y[level];
  for (let i = 0; i < rows; i += 1) {
    addBox(x, y + i * 2.2, z, 5.2, 2.2, 5.2, mats.crate, "wood crate");
  }
}

function buildUndergroundMap() {
  addFloor("underground", 0x6d6658, [118, 130]);

  const y = LEVEL_Y.underground;
  const warm = new THREE.PointLight(0xffc884, 2.2, 80);
  warm.position.set(0, y + 21, -4);
  scene.add(warm);

  addSite("underground", -31, -35, "A", 0x64b47b);
  addSite("underground", 33, 35, "B", 0x6da7d4);

  addBox(0, y, -64, 108, 14, 5, mats.wood, "warehouse wall");
  addBox(0, y, 64, 108, 14, 5, mats.wood, "warehouse wall");
  addBox(-59, y, 0, 5, 14, 118, mats.wood, "warehouse wall");
  addBox(59, y, 0, 5, 14, 118, mats.wood, "warehouse wall");
  addArch(0, y, -58, 18, 10, 4, mats.stone);

  for (let i = -4; i <= 4; i += 1) {
    addBox(i * 13, y + 9.8, 0, 1.2, 1.2, 122, mats.wood, "roof beam", false);
    const beam = addBox(0, y + 11 + Math.abs(i) * 0.12, i * 13, 108, 0.8, 1, mats.wood, "roof beam", false);
    beam.rotation.z = i % 2 === 0 ? 0.08 : -0.08;
  }

  addPlane(-27, y + 10.8, -2, 34, 20, mats.tarp, [-0.6, 0.2, 0.08]);
  addPlane(33, y + 11.3, -9, 36, 18, mats.tarp, [-0.7, -0.1, -0.06]);
  addPlane(0, y + 12, -28, 26, 15, mats.glass, [-Math.PI / 2, 0, 0]);

  const crates = [
    [-43, -35, 3], [-35, -26, 2], [-16, -43, 2], [12, -38, 2], [38, -36, 3],
    [-45, 20, 2], [-27, 36, 3], [-2, 24, 2], [26, 21, 2], [43, 38, 3],
    [-12, -4, 2], [12, 5, 2], [0, -18, 1], [30, -7, 2], [-30, 6, 2],
  ];
  crates.forEach(([x, z, rows]) => addCrateStack(x, z, "underground", rows));

  for (let i = 0; i < 24; i += 1) {
    const vine = addBox(
      -50 + Math.random() * 100,
      y + 5 + Math.random() * 3,
      -58 + Math.random() * 116,
      0.35,
      2 + Math.random() * 3,
      0.35,
      mats.green,
      "vine",
      false
    );
    vine.rotation.z = Math.random() * 0.5 - 0.25;
  }

  addReferencePanel(undergroundReference, 56.4, y + 8, -15, 24, 15, -Math.PI / 2);
}

function buildElevator() {
  addBox(0, LEVEL_Y.surface, 0, 10, 8, 10, mats.metal, "elevator");
  addBox(0, LEVEL_Y.underground, 0, 10, 8, 10, mats.metal, "elevator");
  addBox(0, LEVEL_Y.surface + 0.02, 0, 8, 0.12, 8, mats.yellow, "elevator pad", false);
  addBox(0, LEVEL_Y.underground + 0.02, 0, 8, 0.12, 8, mats.yellow, "elevator pad", false);
  addBox(0, LEVEL_Y.underground + 0.25, 0, 5.5, 31.5, 5.5, mats.glass, "sight shaft", false);
}

function registerHitbox(mesh, type, id, zone) {
  mesh.userData.damageTarget = { type, id, zone };
  damageTargets.push(mesh);
}

function createCharacterModel(type, id, tint = mats.green) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.72, 1.75, 6, 12), tint);
  body.position.y = 1.25;
  body.castShadow = true;
  group.add(body);
  registerHitbox(body, type, id, "nose");

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), mats.whiteWall);
  head.position.y = 2.56;
  head.castShadow = true;
  group.add(head);
  registerHitbox(head, type, id, "eye");

  const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: characterTexture, transparent: true }));
  face.position.set(0, 2.56, -0.65);
  face.scale.set(1.35, 1.6, 1);
  group.add(face);

  const legs = new THREE.Mesh(new THREE.BoxGeometry(1, 0.75, 0.62), mats.blue);
  legs.position.y = 0.42;
  legs.castShadow = true;
  group.add(legs);
  registerHitbox(legs, type, id, "lower");

  const marker = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 10), mats.yellow);
  marker.position.y = 6;
  marker.visible = false;
  group.add(marker);
  group.userData.marker = marker;
  return group;
}

function addBot(id, name, x, level, z, armor) {
  const bot = {
    id,
    name,
    level,
    hpLimit: armor === "큰갑옷" ? 150 : armor === "작은갑옷" ? 125 : 100,
    hp: armor === "큰갑옷" ? 150 : armor === "작은갑옷" ? 125 : 100,
    armor,
    alive: true,
    base: new THREE.Vector3(x, LEVEL_Y[level], z),
    group: createCharacterModel("bot", id, mats.green),
  };
  bot.group.position.copy(bot.base);
  scene.add(bot.group);
  bots.push(bot);
}

function setupBots() {
  addBot("surface-a", "지상 A 감시자", -38, "surface", -48, "큰갑옷");
  addBot("surface-b", "지상 B 돌격수", 42, "surface", 45, "작은갑옷");
  addBot("under-a", "지하 A 잠복병", -31, "underground", -35, "큰갑옷");
  addBot("under-b", "지하 B 수비병", 33, "underground", 35, "없음");
}

function initUi() {
  ui.weaponRow.innerHTML = weapons
    .map((w, i) => `<div class="weapon-card" data-index="${i}"><b>${w.key}. ${w.name}</b><span>${w.role}</span></div>`)
    .join("");
  [...ui.weaponRow.children].forEach((el) => {
    el.addEventListener("click", () => selectWeapon(Number(el.dataset.index)));
  });
  const savedServer = getInitialServerUrl();
  ui.serverUrl.value = savedServer;
  ui.connect.addEventListener("click", () => connectMultiplayer(ui.serverUrl.value));
  selectWeapon(0);
  setNetStatus("solo", "혼자 연습");
  log("맵 교체 완료. 중앙 노란 패드에서 E로 지상/지하 이동.");
  if (new URLSearchParams(location.search).get("server")) connectMultiplayer(savedServer);
}

function selectWeapon(index) {
  weaponIndex = THREE.MathUtils.clamp(index, 0, weapons.length - 1);
  const weapon = weapons[weaponIndex];
  [...ui.weaponRow.children].forEach((el, i) => el.classList.toggle("active", i === weaponIndex));
  ui.weaponName.textContent = `${weapon.name} · ${weapon.role}`;
  ui.weaponStats.textContent =
    weapon.name === "단검"
      ? "2m 이내. 좌클릭 베기, 우클릭 찌르기. 등 뒤 공격은 암살 피해."
      : `${weapon.rate}발/초 · 탄퍼짐 ${weapon.name === "저총" ? "조준 0, 비조준 큼" : weapon.spread < 0.04 ? "낮음" : weapon.spread < 0.08 ? "높음" : "매우 넓음"} · 거리 기준 ${weapon.falloff}m`;
  ui.ammoLine.textContent = "처치 기준: 무갑 100 · 작은갑옷 125 · 큰갑옷 150";
}

function log(text) {
  const line = document.createElement("div");
  line.textContent = text;
  ui.log.prepend(line);
  while (ui.log.children.length > 7) ui.log.lastChild.remove();
}

function setNetStatus(status, text) {
  networkStatus = status;
  ui.net.textContent = text;
  ui.net.classList.toggle("online", status === "online");
  ui.net.classList.toggle("offline", status === "offline");
}

function getInitialServerUrl() {
  const fromQuery = new URLSearchParams(location.search).get("server");
  if (fromQuery) return fromQuery;
  const stored = localStorage.getItem("kotgunServerUrl");
  if (stored) return stored;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return "ws://localhost:8787";
  return "";
}

function normalizeServerUrl(rawUrl) {
  let url = rawUrl.trim();
  if (!url) return "";
  if (url.startsWith("https://")) url = `wss://${url.slice(8)}`;
  else if (url.startsWith("http://")) url = `ws://${url.slice(7)}`;
  else if (!url.startsWith("ws://") && !url.startsWith("wss://")) url = `wss://${url}`;
  return url.replace(/\/$/, "");
}

function connectMultiplayer(rawUrl) {
  const url = normalizeServerUrl(rawUrl);
  if (!url) {
    log("Render 서버 주소를 넣으면 멀티플레이에 연결됩니다.");
    return;
  }
  localStorage.setItem("kotgunServerUrl", url);
  if (socket) socket.close();
  setNetStatus("offline", "연결 중");
  const ws = new WebSocket(url);
  socket = ws;
  ws.addEventListener("open", () => {
    if (socket !== ws) return;
    setNetStatus("online", "멀티 연결");
    sendNet("join", {
      name: player.name,
      armor: player.armor,
      state: makeNetworkState(),
    });
    log("멀티플레이 서버 연결 성공.");
  });
  ws.addEventListener("message", (event) => {
    if (socket !== ws) return;
    try {
      handleNetMessage(JSON.parse(event.data));
    } catch (error) {
      console.warn(error);
    }
  });
  ws.addEventListener("close", () => {
    if (socket !== ws) return;
    setNetStatus("offline", "서버 끊김");
    remotePlayers.forEach((remote) => removeRemote(remote.id));
    log("멀티플레이 서버 연결이 끊겼습니다.");
  });
  ws.addEventListener("error", () => {
    if (socket !== ws) return;
    setNetStatus("offline", "연결 실패");
    log("서버 연결 실패. Render 주소가 맞는지 확인하세요.");
  });
}

function sendNet(type, payload = {}) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type, ...payload }));
}

function makeNetworkState() {
  return {
    x: player.position.x,
    z: player.position.z,
    level: player.level,
    yaw: player.yaw,
    pitch: player.pitch,
    weapon: weapons[weaponIndex].name,
    scoped: player.scoped,
    hp: player.hp,
    armor: player.armor,
    alive: player.alive,
  };
}

function handleNetMessage(message) {
  if (message.type === "welcome") {
    player.id = message.id;
    message.players.forEach((entry) => {
      if (entry.id !== player.id) ensureRemote(entry.id, entry);
    });
  }
  if (message.type === "player-joined" && message.id !== player.id) {
    ensureRemote(message.id, message);
    log(`${message.name} 입장.`);
  }
  if (message.type === "state" && message.id !== player.id) updateRemote(message.id, message.state, message.name);
  if (message.type === "left") removeRemote(message.id);
  if (message.type === "shot" && message.id !== player.id) {
    drawTracer(message.origin, message.direction, 0xff7668);
  }
  if (message.type === "hit") {
    handleServerHit(message);
  }
  if (message.type === "respawn") {
    if (message.id === player.id) {
      player.hp = 150;
      player.alive = true;
      player.level = message.state.level;
      player.position.set(message.state.x, bounds[player.level].y, message.state.z);
      log("리스폰 완료.");
    } else {
      updateRemote(message.id, message.state, message.name);
    }
  }
}

function ensureRemote(id, data) {
  if (remotePlayers.has(id)) return remotePlayers.get(id);
  const remote = {
    id,
    name: data.name ?? "Player",
    level: data.state?.level ?? "surface",
    hp: data.hp ?? data.state?.hp ?? 150,
    alive: data.alive ?? data.state?.alive ?? true,
    group: createCharacterModel("remote", id, mats.deepRed),
  };
  scene.add(remote.group);
  remotePlayers.set(id, remote);
  updateRemote(id, data.state ?? data, remote.name);
  return remote;
}

function updateRemote(id, state, name = "Player") {
  const remote = remotePlayers.get(id) ?? ensureRemote(id, { id, name, state });
  if (!state) return;
  remote.name = name;
  remote.level = state.level ?? remote.level;
  remote.hp = state.hp ?? remote.hp;
  remote.alive = state.alive ?? remote.alive;
  remote.group.visible = remote.alive;
  remote.group.position.set(state.x ?? 0, LEVEL_Y[remote.level] ?? 0, state.z ?? 0);
  remote.group.rotation.y = state.yaw ?? 0;
  remote.group.userData.marker.visible = remote.level !== player.level && remote.alive;
}

function removeRemote(id) {
  const remote = remotePlayers.get(id);
  if (!remote) return;
  scene.remove(remote.group);
  for (let i = damageTargets.length - 1; i >= 0; i -= 1) {
    const target = damageTargets[i].userData.damageTarget;
    if (target?.type === "remote" && target.id === id) damageTargets.splice(i, 1);
  }
  remotePlayers.delete(id);
}

function handleServerHit(message) {
  if (message.targetId === player.id) {
    player.hp = Math.max(0, message.targetHp);
    player.alive = !message.dead;
    log(message.dead ? `${message.weapon}에 당했습니다.` : `${message.weapon} 피격 · 체력 ${player.hp}`);
  }
  const remote = remotePlayers.get(message.targetId);
  if (remote) {
    remote.hp = Math.max(0, message.targetHp);
    remote.alive = !message.dead;
    remote.group.visible = remote.alive;
  }
  if (message.sourceId === player.id && message.dead) log("멀티플레이 적 처치.");
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function startAudio() {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === "suspended") audioContext.resume();
}

function playSound(type) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  const presets = {
    deagle: [95, 0.14, 0.55],
    shotgun: [70, 0.24, 0.9],
    sniper: [120, 0.32, 0.75],
    rifle: [150, 0.08, 0.32],
    machine: [115, 0.055, 0.24],
    knife: [520, 0.09, 0.18],
    hit: [260, 0.05, 0.18],
  };
  const [freq, len, peak] = presets[type] ?? presets.rifle;
  osc.type = type === "knife" ? "triangle" : "sawtooth";
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.42), now + len);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(type === "knife" ? 1800 : 760, now);
  gain.gain.setValueAtTime(peak, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + len);
  osc.connect(filter).connect(gain).connect(audioContext.destination);
  osc.start(now);
  osc.stop(now + len);
}

function spreadDirection(base, spread) {
  const dir = base.clone();
  const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  const radius = Math.random() * spread;
  const angle = Math.random() * Math.PI * 2;
  dir.addScaledVector(right, Math.cos(angle) * radius);
  dir.addScaledVector(up, Math.sin(angle) * radius);
  return dir.normalize();
}

function getCurrentSpread(weapon) {
  const scopedSpread = weapon.scopedSpread !== undefined && player.scoped ? weapon.scopedSpread : weapon.spread;
  if (weapon.name !== "소총" && weapon.name !== "기총") return scopedSpread;
  const hold = firingSince ? Math.min(2.2, performance.now() / 1000 - firingSince) : 0;
  return scopedSpread + hold * (weapon.name === "기총" ? 0.06 : 0.026) + burstShots * (weapon.name === "기총" ? 0.003 : 0.0015);
}

function shoot(heavy = false) {
  if (!player.alive) return;
  const weapon = weapons[weaponIndex];
  const now = performance.now() / 1000;
  const rate = weapon.name === "단검" && heavy ? weapon.heavyRate : weapon.rate;
  if (now - player.lastShot < 1 / rate) return;
  player.lastShot = now;
  burstShots += 1;

  if (weapon.name === "단검") {
    knifeAttack(heavy);
    return;
  }

  const baseDir = new THREE.Vector3();
  camera.getWorldDirection(baseDir);
  const pellets = weapon.pellets ?? 1;
  let hitSomething = false;

  for (let i = 0; i < pellets; i += 1) {
    const dir = spreadDirection(baseDir, getCurrentSpread(weapon));
    const hit = traceDamageTarget(dir);
    if (!hit) continue;
    hitSomething = true;
    const target = hit.object.userData.damageTarget;
    const damage = getGunDamage(weapon, target.zone, hit.distance);
    applyDamageTarget(target, damage, weapon.name, hit.distance);
  }

  playSound(weapon.sound);
  drawTracer(camera.position, baseDir, 0xffe1a3);
  sendNet("shot", {
    origin: vectorPayload(camera.position),
    direction: vectorPayload(baseDir),
    weapon: weapon.name,
  });
  if (weapon.recoil) player.pitch = Math.max(-1.25, player.pitch - weapon.recoil);
  if (!hitSomething && weapon.name === "산총") log("산총 탄이 엄폐물에 흩어졌다.");
}

function traceDamageTarget(direction) {
  raycaster.set(camera.position, direction);
  raycaster.far = 190;
  const damageHits = raycaster.intersectObjects(damageTargets, false).filter((hit) => isDamageTargetAlive(hit.object.userData.damageTarget));
  if (damageHits.length === 0) return null;
  const wallHits = raycaster.intersectObjects(solidTargets, false);
  const firstDamage = damageHits[0];
  const firstWall = wallHits[0];
  return !firstWall || firstDamage.distance < firstWall.distance ? firstDamage : null;
}

function isDamageTargetAlive(target) {
  if (!target) return false;
  if (target.type === "bot") return bots.find((bot) => bot.id === target.id)?.alive ?? false;
  if (target.type === "remote") return remotePlayers.get(target.id)?.alive ?? false;
  return false;
}

function getGunDamage(weapon, zone, distance) {
  const pair = weapon.damage[zone] ?? weapon.damage.nose;
  return distance >= weapon.falloff ? pair[1] : pair[0];
}

function knifeAttack(heavy) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const hit = traceDamageTarget(dir);
  playSound("knife");
  if (!hit || hit.distance > 2) {
    log(heavy ? "단검 찌르기가 빗나감." : "단검 베기가 빗나감.");
    return;
  }
  const target = hit.object.userData.damageTarget;
  const targetGroup = getTargetGroup(target);
  const toPlayer = camera.position.clone().sub(targetGroup.position).normalize();
  const enemyForward = new THREE.Vector3(0, 0, -1).applyQuaternion(targetGroup.quaternion);
  const backstab = enemyForward.dot(toPlayer) < -0.35;
  const suffix = heavy ? "Heavy" : "Light";
  const damage = backstab ? weapons[5].damage[`back${suffix}`] : weapons[5].damage[`${target.zone}${suffix}`];
  applyDamageTarget(target, damage, heavy ? "단검 찌르기" : "단검 베기", hit.distance, backstab);
}

function getTargetGroup(target) {
  if (target.type === "bot") return bots.find((bot) => bot.id === target.id).group;
  return remotePlayers.get(target.id).group;
}

function applyDamageTarget(target, damage, weaponName, distance, backstab = false) {
  const zoneName = backstab ? "등 뒤" : { eye: "눈", nose: "코 부근", lower: "아래 부분" }[target.zone];
  if (target.type === "bot") {
    const bot = bots.find((entry) => entry.id === target.id);
    bot.hp -= damage;
    playSound("hit");
    if (bot.hp <= 0) {
      bot.alive = false;
      bot.group.visible = false;
      log(`${weaponName} ${zoneName} ${Math.round(damage)} 피해: ${bot.name} 처치`);
      setTimeout(() => respawnBot(bot), 4000);
    } else {
      log(`${weaponName} ${zoneName} ${Math.round(damage)} 피해 · ${bot.name} 남은 기준 ${Math.ceil(bot.hp)}`);
    }
  }
  if (target.type === "remote") {
    sendNet("hit", {
      targetId: target.id,
      damage,
      zone: target.zone,
      weapon: weaponName,
      distance,
    });
    playSound("hit");
  }
}

function respawnBot(bot) {
  bot.hp = bot.hpLimit;
  bot.alive = true;
  bot.group.visible = true;
  bot.group.position.copy(bot.base);
}

function drawTracer(originPayload, directionPayload, color) {
  const origin = payloadVector(originPayload);
  const direction = payloadVector(directionPayload).normalize();
  const geometry = new THREE.BufferGeometry().setFromPoints([origin, origin.clone().addScaledVector(direction, 48)]);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 })
  );
  scene.add(line);
  setTimeout(() => {
    scene.remove(line);
    geometry.dispose();
    line.material.dispose();
  }, 85);
}

function payloadVector(value) {
  if (value instanceof THREE.Vector3) return value.clone();
  return new THREE.Vector3(value.x, value.y, value.z);
}

function vectorPayload(value) {
  return { x: value.x, y: value.y, z: value.z };
}

function movePlayer(dt) {
  const weapon = weapons[weaponIndex];
  const speed = 9.4 * weapon.move * (player.scoped ? 0.54 : 1);
  const forward = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const wish = new THREE.Vector3();
  if (keys.has("KeyW")) wish.add(forward.clone().multiplyScalar(-1));
  if (keys.has("KeyS")) wish.add(forward);
  if (keys.has("KeyA")) wish.add(right.clone().multiplyScalar(-1));
  if (keys.has("KeyD")) wish.add(right);
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed * dt);

  const next = player.position.clone().add(wish);
  const limit = bounds[player.level];
  next.x = THREE.MathUtils.clamp(next.x, -limit.x, limit.x);
  next.z = THREE.MathUtils.clamp(next.z, -limit.z, limit.z);
  next.y = limit.y;
  player.position.copy(next);
  camera.position.copy(player.position);
  camera.rotation.set(player.pitch, player.yaw, 0);
}

function useElevator() {
  const onPad = Math.hypot(player.position.x, player.position.z) < 6.5;
  if (!onPad) {
    log("엘리베이터는 중앙 노란 패드에서만 작동합니다.");
    return;
  }
  player.level = player.level === "surface" ? "underground" : "surface";
  player.position.y = bounds[player.level].y;
  log(`엘리베이터 이동: ${levelNames[player.level]}`);
}

function updateBots(time) {
  bots.forEach((bot, index) => {
    if (!bot.alive) return;
    const radius = 3.2 + index * 0.35;
    bot.group.position.x = bot.base.x + Math.sin(time * 0.45 + index) * radius;
    bot.group.position.z = bot.base.z + Math.cos(time * 0.32 + index) * radius;
    bot.group.position.y = LEVEL_Y[bot.level];
    bot.group.lookAt(camera.position.x, bot.group.position.y + 1.4, camera.position.z);
    bot.group.userData.marker.visible = bot.level !== player.level;
  });
}

function updateRemoteMarkers() {
  remotePlayers.forEach((remote) => {
    remote.group.userData.marker.visible = remote.alive && remote.level !== player.level;
  });
}

function updateHud() {
  ui.hp.textContent = player.hp;
  ui.armor.textContent = player.armor;
  ui.level.textContent = levelNames[player.level];
  ui.speed.textContent = weapons[weaponIndex].move > 1 ? "빠름" : weapons[weaponIndex].move < 0.8 ? "느림" : "보통";
  ui.site.textContent = getSite();
  const crossLevelThreat =
    bots.some((bot) => bot.alive && bot.level !== player.level) ||
    [...remotePlayers.values()].some((remote) => remote.alive && remote.level !== player.level);
  ui.intel.textContent = crossLevelThreat ? "타층 적 표시" : "같은 층 숨김";
  ui.intel.classList.toggle("revealed", crossLevelThreat);
}

function getSite() {
  const x = player.position.x;
  const z = player.position.z;
  if (player.level === "surface") {
    if (z < -28 && x < 0) return "지상 A";
    if (z > 25 && x > 0) return "지상 B";
  } else {
    if (z < -22 && x < 0) return "지하 A";
    if (z > 22 && x > 0) return "지하 B";
  }
  if (Math.hypot(x, z) < 8) return "엘리베이터";
  return "중앙";
}

function sendStateIfNeeded(time) {
  if (networkStatus !== "online") return;
  if (time - lastNetSend < 1 / 14) return;
  lastNetSend = time;
  sendNet("state", { state: makeNetworkState() });
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;
  if (fireHeld) shoot(false);
  movePlayer(dt);
  updateBots(elapsed);
  updateRemoteMarkers();
  updateHud();
  sendStateIfNeeded(elapsed);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function beginFire() {
  if (!fireHeld) {
    firingSince = performance.now() / 1000;
    burstShots = 0;
  }
  fireHeld = true;
  shoot(false);
}

function endFire() {
  fireHeld = false;
  firingSince = 0;
  burstShots = 0;
}

window.addEventListener("resize", resize);
window.addEventListener("keydown", (event) => {
  keys.add(event.code);
  const number = Number(event.key);
  if (number >= 1 && number <= 6) selectWeapon(number - 1);
  if (event.code === "KeyE") useElevator();
});
window.addEventListener("keyup", (event) => keys.delete(event.code));

window.addEventListener("mousedown", (event) => {
  if (event.target.closest?.(".server-panel")) return;
  if (document.pointerLockElement !== canvas) return;
  if (event.button === 0) beginFire();
  if (event.button === 2) {
    if (weapons[weaponIndex].name === "단검") shoot(true);
    else player.scoped = true;
  }
});

window.addEventListener("mouseup", (event) => {
  if (event.button === 0) endFire();
  if (event.button === 2) player.scoped = false;
});

window.addEventListener("blur", endFire);
window.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement !== canvas) return;
  player.yaw -= event.movementX * 0.0022;
  player.pitch -= event.movementY * 0.0022;
  player.pitch = THREE.MathUtils.clamp(player.pitch, -1.32, 1.32);
});

ui.start.addEventListener("click", async () => {
  startAudio();
  try {
    await canvas.requestPointerLock();
  } catch (error) {
    console.warn(error);
  }
  ui.start.style.display = "none";
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== canvas) {
    endFire();
    ui.start.style.display = "block";
    ui.start.querySelector("span").textContent = "클릭해서 계속";
  }
});

buildSurfaceMap();
buildUndergroundMap();
buildElevator();
setupBots();
initUi();
resize();
camera.position.copy(player.position);
animate();
