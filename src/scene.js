import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createFarmScene, farmBlocked, FARM_BOUNDS } from "./farm-scene.js";

export const DESTINATIONS = {
  gate: { x: 0, z: 20, zh: "山门", en: "Entrance" },
  hall: { x: 0, z: -9, zh: "静心堂", en: "Quiet hall" },
  tea: { x: -12, z: 2, zh: "一盏茶", en: "Tea pavilion" },
  pond: { x: 12, z: 6, zh: "听水池", en: "Lotus pond" },
  bell: { x: -14, z: -13, zh: "晚钟亭", en: "Bell pavilion" },
  lantern: { x: 12, z: -10, zh: "心愿树", en: "Wish tree" },
  calendar: { x: 15, z: -18, zh: "玄枢万年历", en: "Celestial calendar" },
  grove: { x: -19, z: 12, zh: "竹间小径", en: "Bamboo path" },
  farm: { x: 0, z: 31, zh: "田野农场", en: "Countryside farm" },
  hunt: { x: 38, z: -18, zh: "深山林地", en: "Mountain woods" },
};

const TAU = Math.PI * 2;
const COLORS = {
  sky: 0xd9e9ed,
  grass: 0x759c74,
  grassLight: 0x91af80,
  stone: 0xb4bdb5,
  stoneLight: 0xd1d6ce,
  stoneDark: 0x7c8c87,
  plaster: 0xeeeae0,
  wood: 0x633e35,
  vermillion: 0x963e37,
  roof: 0x365f60,
  roofEdge: 0x26494c,
  gold: 0xc7a65c,
  leaf: 0x527b57,
  leafDark: 0x355d48,
  pine: 0x315e51,
  water: 0x4c958b,
  red: 0xc85548,
};
const PALETTE = [0x4f7775, 0x9b665c, 0x687e9d, 0x8a765d, 0x7d7896, 0x71945f];

function blocked(x, z) {
  if (x < FARM_BOUNDS.minX || x > FARM_BOUNDS.maxX || z < FARM_BOUNDS.minZ || z > FARM_BOUNDS.maxZ) return true;
  if (Math.abs(Math.abs(x) - 27) < .8 && z > -26.8 && z < 25) return true;
  if (Math.abs(z + 26) < .8 && Math.abs(x) < 27.8) return true;
  if (Math.abs(z - 24) < .85 && Math.abs(x) > 3 && Math.abs(x) < 27.8) return true;
  if (farmBlocked(x, z)) return true;
  if (x > -8.8 && x < 8.8 && z > -24 && z < -11.6) return true;
  if (((x - 18) / 5.9) ** 2 + ((z - 6) / 4.9) ** 2 < 1) return true;
  if (Math.hypot(x + 17, z - 3) < 1.5) return true;
  if (Math.hypot(x - 12.8, z + 12) < 1.1) return true;
  return false;
}

function findPath(start, end) {
  const size = FARM_BOUNDS.maxX - FARM_BOUNDS.minX + 1;
  const key = (x, z) => (z - FARM_BOUNDS.minZ) * size + x - FARM_BOUNDS.minX;
  const decode = (id) => ({ x: id % size + FARM_BOUNDS.minX, z: Math.floor(id / size) + FARM_BOUNDS.minZ });
  const nearest = (point) => {
    let best;
    let distance = Infinity;
    for (let r = 0; r < 5; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          const x = Math.round(point.x) + dx;
          const z = Math.round(point.z) + dz;
          const d = Math.hypot(x - point.x, z - point.z);
          if (!blocked(x, z) && d < distance) { best = { x, z }; distance = d; }
        }
      }
      if (best) return best;
    }
    return null;
  };
  const a = nearest(start);
  const b = nearest(end);
  if (!a || !b) return [];
  const first = key(a.x, a.z);
  const last = key(b.x, b.z);
  const open = new Set([first]);
  const from = new Map();
  const cost = new Map([[first, 0]]);
  const score = new Map([[first, Math.hypot(a.x - b.x, a.z - b.z)]]);
  let visits = 0;
  while (open.size && visits++ < 10000) {
    let current;
    let lowest = Infinity;
    for (const id of open) {
      if (score.get(id) < lowest) { current = id; lowest = score.get(id); }
    }
    if (current === last) {
      const result = [];
      let step = current;
      while (from.has(step)) { result.push(decode(step)); step = from.get(step); }
      result.reverse();
      if (!blocked(end.x, end.z)) result.push({ x: end.x, z: end.z });
      return result;
    }
    open.delete(current);
    const p = decode(current);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const x = p.x + dx;
        const z = p.z + dz;
        if (blocked(x, z) || (dx && dz && (blocked(p.x + dx, p.z) || blocked(p.x, p.z + dz)))) continue;
        const id = key(x, z);
        const candidate = cost.get(current) + Math.hypot(dx, dz);
        if (candidate >= (cost.get(id) ?? Infinity)) continue;
        from.set(id, current);
        cost.set(id, candidate);
        score.set(id, candidate + Math.hypot(x - b.x, z - b.z));
        open.add(id);
      }
    }
  }
  return [];
}

export function createCourtyard(container, callbacks = {}) {
  const { onReady, onArrive, onPosition, onSelectVisitor, onSelectPlot, onSelectAnimal, onSelectWildlife, onError, locale = "zh" } = callbacks;
  const chinese = locale === "zh";
  let disposed = false;
  let frames = 0;
  let frameId;
  let lightMode = "day";
  let farmMode = false;
  let focusedFarm = false;
  let selfId = null;
  let destinationId = null;
  let path = [];
  let action = "idle";
  let sendElapsed = 0;
  let metricsElapsed = 1;
  let lanternSignature = "";
  let width = 1;
  let height = 1;
  const pointer = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const timer = new THREE.Timer();
  timer.connect(document);
  const keys = new Set();
  const resources = new Set();
  const clickables = [];
  const animatedLanterns = [];
  const fish = [];
  const waterRings = [];
  const remote = new Map();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 100, 200);
  const camera = new THREE.OrthographicCamera(-35, 35, 26, -26, 0.1, 240);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.setAttribute("aria-label", chinese ? "安和里三维庭院" : "Anhe three-dimensional courtyard");
  renderer.domElement.setAttribute("tabindex", "0");
  renderer.domElement.dataset.courtyardCanvas = "true";
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none";
  container.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = true;
  controls.maxPolarAngle = Math.PI * 0.4;
  controls.minPolarAngle = Math.PI * 0.16;
  controls.minZoom = 0.6;
  controls.maxZoom = 2.6;
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.target.set(0, 1, 0);
  camera.position.set(36, 43, 47);
  controls.update();

  const ambient = new THREE.HemisphereLight(0xe8f6ff, 0x667c5d, 2.6);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffedc7, 3.1);
  sun.position.set(-25, 43, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 78;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.08;
  scene.add(sun);

  const materials = new Map();
  function mat(color, extras = {}) {
    const id = `${color}-${JSON.stringify(extras)}`;
    if (!materials.has(id)) {
      const value = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extras });
      materials.set(id, value);
      resources.add(value);
    }
    return materials.get(id);
  }
  function mesh(geometry, material, parent = scene, position = [0, 0, 0], shadow = true) {
    resources.add(geometry);
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...position);
    object.castShadow = shadow;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  function box(parent, x, y, z, w, h, d, color, options) {
    return mesh(new THREE.BoxGeometry(w, h, d), mat(color, options), parent, [x, y, z]);
  }
  function cylinder(parent, x, y, z, top, bottom, h, color, sides = 12, options) {
    return mesh(new THREE.CylinderGeometry(top, bottom, h, sides), mat(color, options), parent, [x, y, z]);
  }
  function sphere(parent, x, y, z, size, color, scale = [1, 1, 1], options) {
    const value = mesh(new THREE.SphereGeometry(size, 10, 7), mat(color, options), parent, [x, y, z]);
    value.scale.set(...scale);
    return value;
  }
  function lineTube(parent, points, radius, color, sides = 6) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve, 12, radius, sides, false), mat(color), parent);
  }
  function textSprite(text, opts = {}) {
    const c = document.createElement("canvas");
    c.width = opts.width || 512;
    c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = opts.background || "#fffdf2";
    ctx.beginPath();
    ctx.roundRect(6, 12, c.width - 12, 102, 8);
    ctx.fill();
    ctx.strokeStyle = opts.border || "rgba(39,75,68,.2)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `600 ${opts.fontSize || 45}px "Microsoft YaHei","PingFang SC",sans-serif`;
    ctx.fillStyle = opts.color || "#153f36";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, c.width / 2, 65, c.width - 40);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    resources.add(texture);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, sizeAttenuation: true, toneMapped: false });
    resources.add(material);
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(opts.scale || 5, (opts.scale || 5) * c.height / c.width, 1);
    sprite.renderOrder = 5;
    return sprite;
  }
  function disposeGroup(group) {
    group.traverse((object) => {
      if (object.geometry) {
        object.geometry.dispose();
        resources.delete(object.geometry);
      }
      if (object.isSprite && object.material) {
        if (object.material.map) {
          object.material.map.dispose();
          resources.delete(object.material.map);
        }
        object.material.dispose();
        resources.delete(object.material);
      }
    });
    group.clear();
  }

  const ground = box(scene, 0, -0.3, 18, 220, 0.5, 220, COLORS.grass);
  ground.name = "walkable-ground";
  const outerBase = box(scene, 0, -0.6, 0, 59, 0.75, 56, 0x718d78);
  outerBase.receiveShadow = true;
  const yard = box(scene, 0, -0.02, 0, 51, 0.08, 47, COLORS.grassLight);
  yard.castShadow = false;
  const paverPoints = new Map();
  function pave(x1, x2, z1, z2) {
    for (let x = x1; x <= x2; x += 1.5) {
      for (let z = z1; z <= z2; z += 1.5) {
        if (((x - 18) / 5.6) ** 2 + ((z - 6) / 4.6) ** 2 < 1) continue;
        paverPoints.set(`${x.toFixed(1)},${z.toFixed(1)}`, [x, z]);
      }
    }
  }
  pave(-9, 9, -10.5, 22.5);
  pave(-24, 24, 0, 4.5);
  pave(-15, -9, -16.5, 1.5);
  pave(9, 18, -21, 1.5);
  const paverGeo = new THREE.BoxGeometry(1.43, 0.1, 1.43);
  resources.add(paverGeo);
  const pavers = new THREE.InstancedMesh(paverGeo, mat(COLORS.stoneLight), paverPoints.size);
  const matrix = new THREE.Matrix4();
  let paverIndex = 0;
  for (const [x, z] of paverPoints.values()) {
    matrix.makeTranslation(x, 0.06, z);
    pavers.setMatrixAt(paverIndex, matrix);
    pavers.setColorAt(paverIndex++, new THREE.Color(paverIndex % 5 === 0 ? 0xbfc8bf : 0xd0d4cb));
  }
  pavers.receiveShadow = true;
  scene.add(pavers);

  // Raised eaves are built from rings so the roof reads as a tiled Chinese roof from every angle.
  function roof(parent, cx, cy, cz, w, d, style = COLORS.roof) {
    const vertices = [];
    const indices = [];
    const rings = [
      { w: w * 0.27, d: 0.08, y: 1.85 },
      { w: w * 0.39, d: d * 0.22, y: 1.5 },
      { w: w * 0.48, d: d * 0.44, y: 0.28 },
      { w: w * 0.56, d: d * 0.57, y: 0.12, lift: 0.45 },
    ];
    for (const ring of rings) {
      const lift = ring.lift || 0;
      [[-ring.w, -ring.d, lift], [0, -ring.d, 0], [ring.w, -ring.d, lift],
        [ring.w, 0, 0], [ring.w, ring.d, lift], [0, ring.d, 0],
        [-ring.w, ring.d, lift], [-ring.w, 0, 0]].forEach(([x, z, y]) => vertices.push(x + cx, cy + ring.y + y, z + cz));
    }
    for (let r = 0; r < rings.length - 1; r++) {
      for (let k = 0; k < 8; k++) {
        const a = r * 8 + k;
        const b = r * 8 + (k + 1) % 8;
        const c = (r + 1) * 8 + k;
        const e = (r + 1) * 8 + (k + 1) % 8;
        indices.push(a, c, b, b, c, e);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    mesh(geo, mat(style, { side: THREE.DoubleSide, roughness: 0.62 }), parent);
    box(parent, cx, cy + 1.92, cz, w * 0.63, 0.16, 0.26, COLORS.roofEdge);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        lineTube(parent, [
          [cx, cy + 0.08, cz + d * 0.57 * side],
          [cx + w * 0.36 * end, cy + 0.15, cz + d * 0.57 * side],
          [cx + w * 0.56 * end, cy + 0.58, cz + d * 0.57 * side],
        ], 0.1, COLORS.roofEdge);
      }
    }
    for (let x = -w * 0.43; x < w * 0.44; x += 0.45) {
      for (const side of [-1, 1]) {
        lineTube(parent, [[cx + x * 0.66, cy + 1.81, cz],
          [cx + x * 0.85, cy + 1.43, cz + side * d * 0.22],
          [cx + x, cy + 0.36, cz + side * d * 0.44],
          [cx + x * 1.1, cy + 0.16, cz + side * d * 0.57]], 0.028, 0x537575, 4);
      }
    }
    for (const end of [-1, 1]) {
      lineTube(parent, [[cx + w * 0.27 * end, cy + 1.95, cz],
        [cx + w * 0.34 * end, cy + 2.07, cz],
        [cx + w * 0.36 * end, cy + 2.36, cz]], 0.085, COLORS.roofEdge);
    }
  }
  function column(parent, x, z, baseY, h) {
    cylinder(parent, x, baseY + 0.13, z, 0.38, 0.44, 0.26, COLORS.stone);
    cylinder(parent, x, baseY + h / 2 + 0.2, z, 0.19, 0.22, h, COLORS.vermillion);
    box(parent, x, baseY + h + 0.15, z, 0.62, 0.2, 0.62, COLORS.wood);
  }
  function railing(parent, x, y, z, w, alongZ = false) {
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    if (alongZ) holder.rotation.y = Math.PI / 2;
    parent.add(holder);
    box(holder, 0, 0.8, 0, w, 0.1, 0.12, COLORS.wood);
    box(holder, 0, 0.35, 0, w, 0.08, 0.1, COLORS.wood);
    for (let n = -w / 2; n <= w / 2; n += 0.65) box(holder, n, 0.5, 0, 0.09, 1, 0.09, COLORS.vermillion);
  }
  function windowPanel(parent, x, y, z, w, h) {
    box(parent, x, y, z, w, h, 0.16, 0x3a4a44);
    for (let i = -w / 2; i < w / 2 + 0.01; i += w / 4) box(parent, x + i, y, z + 0.12, 0.075, h, 0.08, COLORS.wood);
    for (let i = -h / 2; i < h / 2 + 0.01; i += h / 4) box(parent, x, y + i, z + 0.12, w, 0.075, 0.08, COLORS.wood);
  }
  function plaque(parent, text, x, y, z, w = 5) {
    const sprite = textSprite(text, { scale: w, background: "#31524b", color: "#ead9a6", border: "#bc9f62" });
    sprite.position.set(x, y, z);
    parent.add(sprite);
    return sprite;
  }
  function lantern(parent, x, y, z, color = COLORS.red, scale = 1) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    parent.add(g);
    lineTube(g, [[0, 0.8, 0], [0, 0.5, 0]], 0.025, COLORS.wood);
    const paper = { emissive: color, emissiveIntensity: 0.14 };
    cylinder(g, 0, 0, 0, 0.38, 0.38, 0.7, color, 12, paper);
    sphere(g, 0, 0.27, 0, 0.37, color, [1, 0.45, 1], paper);
    sphere(g, 0, -0.27, 0, 0.37, color, [1, 0.45, 1], paper);
    cylinder(g, 0, 0.39, 0, 0.23, 0.23, 0.07, COLORS.gold);
    cylinder(g, 0, -0.39, 0, 0.23, 0.23, 0.07, COLORS.gold);
    cylinder(g, 0, -0.63, 0, 0.035, 0.05, 0.38, COLORS.gold, 6);
    for (let a = 0; a < TAU; a += Math.PI / 3) {
      lineTube(g, [[Math.cos(a) * 0.21, 0.37, Math.sin(a) * 0.21],
        [Math.cos(a) * 0.39, 0, Math.sin(a) * 0.39],
        [Math.cos(a) * 0.21, -0.37, Math.sin(a) * 0.21]], 0.012, COLORS.gold, 4);
    }
    const groups = new Map();
    for (const child of g.children) {
      child.updateMatrix();
      if (!groups.has(child.material)) groups.set(child.material, []);
      groups.get(child.material).push(child);
    }
    for (const [material, children] of groups) {
      const parts = children.map((child) => {
        const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        geometry.applyMatrix4(child.matrix);
        geometry.deleteAttribute("uv");
        return geometry;
      });
      const geometry = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      if (!geometry) continue;
      mesh(geometry, material, g);
      for (const child of children) {
        g.remove(child);
        child.geometry.dispose();
        resources.delete(child.geometry);
      }
    }
    animatedLanterns.push({ group: g, phase: x * 0.5 + z });
    return g;
  }

  // Boundary walls and a genuinely open front gate keep the main routes legible.
  for (const side of [-1, 1]) {
    box(scene, side * 27, 1.35, -1, 0.55, 2.7, 51, COLORS.plaster);
    box(scene, side * 27, 2.78, -1, 0.86, 0.18, 51.4, COLORS.roofEdge);
    box(scene, side * 17.1, 1.35, 24, 19.2, 2.7, 0.55, COLORS.plaster);
    box(scene, side * 17.1, 2.78, 24, 19.5, 0.18, 0.86, COLORS.roofEdge);
  }
  box(scene, 0, 1.35, -26, 54, 2.7, 0.55, COLORS.plaster);
  box(scene, 0, 2.78, -26, 54.5, 0.18, 0.86, COLORS.roofEdge);
  const gate = new THREE.Group();
  gate.position.set(0, 0, 24);
  scene.add(gate);
  for (const s of [-1, 1]) {
    column(gate, s * 4.6, 0, 0, 5.4);
    box(gate, s * 4.6, 2.25, 0.2, 0.8, 4.7, 0.7, COLORS.vermillion);
    const door = box(gate, s * 3.5, 2.2, 0.8, 1.7, 4.4, 0.18, COLORS.wood);
    door.rotation.y = s * Math.PI * 0.27;
    lantern(gate, s * 3.1, 4.65, -0.8, COLORS.red, 0.8);
  }
  roof(gate, 0, 5.4, 0, 11, 3.5);
  plaque(gate, chinese ? "安 和 里" : "ANHE HOME", 0, 5.35, 0.7, 4.7);

  const hall = new THREE.Group();
  hall.position.set(0, 0, -17);
  scene.add(hall);
  box(hall, 0, 0.35, 0, 17.6, 0.7, 10.8, COLORS.stone);
  box(hall, 0, 0.75, 0, 16.8, 0.2, 10.2, COLORS.stoneLight);
  box(hall, 0, 3.1, -1.2, 15.3, 4.5, 6.8, COLORS.plaster);
  box(hall, 0, 3.05, 2.24, 3.2, 4.1, 0.12, 0x30433e);
  for (const s of [-1, 1]) {
    windowPanel(hall, s * 4.9, 3.3, 2.29, 3.8, 2.65);
    windowPanel(hall, s * 2.8, 3.3, 2.3, 0.22, 3.4);
    railing(hall, s * 5.5, 0.9, 4.7, 5.6);
    railing(hall, s * 8.1, 0.9, 0.3, 8, true);
  }
  for (const x of [-7.6, -4.5, 0, 4.5, 7.6]) column(hall, x, 4.3, 0.85, 4.5);
  box(hall, 0, 5.4, 4.25, 16.1, 0.35, 0.4, COLORS.wood);
  roof(hall, 0, 5.45, 0, 18, 11);
  plaque(hall, chinese ? "静 心 堂" : "QUIET HALL", 0, 5.42, 4.5, 4.4);
  for (const s of [-1, 1]) lantern(hall, s * 6.1, 4.85, 4.8, COLORS.red, 0.78);
  for (let step = 0; step < 3; step++) box(hall, 0, step * 0.21 + 0.1, 6.5 - step * 0.5, 5.2, 0.21, 1.6, COLORS.stoneLight);
  for (const x of [-3.4, 0, 3.4]) {
    cylinder(scene, x, 0.2, -8.5, 0.8, 0.9, 0.25, 0xb49569, 20);
    cylinder(scene, x, 0.34, -8.5, 0.66, 0.72, 0.13, 0xa9926d, 20);
  }
  const incense = new THREE.Group();
  incense.position.set(0, 0, -5.4);
  scene.add(incense);
  cylinder(incense, 0, 0.9, 0, 0.9, 0.5, 1.2, 0x657e77, 16);
  cylinder(incense, 0, 1.5, 0, 0.98, 0.98, 0.14, COLORS.gold, 16);
  for (const x of [-0.35, 0, 0.35]) cylinder(incense, x, 1.85, 0, 0.025, 0.025, 0.8, COLORS.wood, 5);

  function gazebo(cx, cz, w, d, title) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    scene.add(g);
    box(g, 0, 0.18, 0, w + 0.6, 0.36, d + 0.6, COLORS.stoneLight);
    box(g, 0, 0.4, 0, w, 0.08, d, 0x8f8170);
    for (const x of [-w / 2 + 0.35, w / 2 - 0.35]) {
      for (const z of [-d / 2 + 0.35, d / 2 - 0.35]) column(g, x, z, 0.4, 3.5);
    }
    box(g, 0, 4.05, -d / 2 + 0.35, w, 0.25, 0.25, COLORS.wood);
    box(g, 0, 4.05, d / 2 - 0.35, w, 0.25, 0.25, COLORS.wood);
    roof(g, 0, 4, 0, w + 1, d + 1);
    if (title) plaque(g, title, 0, 4.1, d / 2 + 0.2, Math.min(w - 1, 4));
    return g;
  }
  const tea = gazebo(-17, 3, 8, 7, chinese ? "一 盏 茶" : "TEA");
  cylinder(tea, 0, 0.9, 0, 0.27, 0.38, 1, COLORS.wood);
  cylinder(tea, 0, 1.45, 0, 1.5, 1.5, 0.15, 0x976c4f, 24);
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const x = Math.cos(a) * 2.15;
    const z = Math.sin(a) * 2.15;
    cylinder(tea, x, 0.8, z, 0.55, 0.48, 0.65, COLORS.wood);
    cylinder(tea, x, 1.15, z, 0.63, 0.63, 0.12, 0x967f62, 16);
    const cx = Math.cos(a) * 0.8;
    const cz = Math.sin(a) * 0.8;
    cylinder(tea, cx, 1.6, cz, 0.13, 0.09, 0.19, COLORS.plaster);
    cylinder(tea, cx, 1.7, cz, 0.105, 0.105, 0.015, 0x695b3c);
  }
  sphere(tea, 0, 1.77, 0, 0.28, 0x7a8f72, [1, 0.8, 1]);
  cylinder(tea, 0, 2.02, 0, 0.16, 0.18, 0.06, 0x7a8f72);
  lineTube(tea, [[0.2, 1.8, 0], [0.4, 1.92, 0], [0.48, 1.95, 0]], 0.07, 0x7a8f72);
  lantern(tea, -2.7, 3.7, 2.5, COLORS.red, 0.65);
  lantern(tea, 2.7, 3.7, 2.5, COLORS.red, 0.65);

  const bell = gazebo(-18, -15.7, 5.7, 5.2, chinese ? "晚 钟" : "BELL");
  box(bell, 0, 3.5, 0, 4.2, 0.28, 0.3, COLORS.wood);
  cylinder(bell, 0, 2.45, 0, 0.58, 1.05, 1.65, 0x8b9b81, 20, { metalness: 0.4, roughness: 0.5 });
  cylinder(bell, 0, 1.62, 0, 1.12, 1.12, 0.18, 0x637a69, 20);
  cylinder(bell, 0, 3.4, 0, 0.08, 0.08, 0.7, COLORS.wood, 8);
  const striker = cylinder(bell, 0, 2.6, 1.7, 0.19, 0.19, 3.4, COLORS.wood, 12);
  striker.rotation.z = Math.PI / 2;
  lineTube(bell, [[-1.2, 4, 1.7], [-1.2, 2.6, 1.7]], 0.025, COLORS.gold);
  lineTube(bell, [[1.2, 4, 1.7], [1.2, 2.6, 1.7]], 0.025, COLORS.gold);

  const calendar = gazebo(19, -19, 7.3, 6, chinese ? "玄 枢" : "CALENDAR");
  const dial = new THREE.Group();
  dial.position.set(0, 2.2, 0.3);
  calendar.add(dial);
  cylinder(dial, 0, -0.9, 0, 0.3, 0.6, 1.6, COLORS.wood, 10);
  for (const r of [0.8, 1.17, 1.54]) {
    const ring = mesh(new THREE.TorusGeometry(r, 0.055, 8, 64), mat(COLORS.gold, { metalness: 0.5, roughness: 0.4 }), dial);
    ring.rotation.x = -0.15;
    if (r === 1.17) ring.rotation.y = Math.PI / 3;
  }
  sphere(dial, 0, 0, 0, 0.32, 0x3e6967, [1, 1, 1], { metalness: 0.5 });
  box(dial, 0, 0, 0, 3.2, 0.045, 0.045, COLORS.gold);
  box(dial, 0, 0, 0, 0.045, 3.2, 0.045, COLORS.gold);
  for (const s of [-1, 1]) lantern(calendar, s * 2.4, 3.6, 2.2, COLORS.red, 0.65);

  const pond = new THREE.Group();
  pond.position.set(18, 0, 6);
  scene.add(pond);
  const pondStone = mesh(new THREE.RingGeometry(5.35, 5.95, 64), mat(COLORS.stoneDark), pond, [0, 0.12, 0]);
  pondStone.rotation.x = -Math.PI / 2;
  pondStone.scale.y = 0.85;
  const water = mesh(new THREE.CircleGeometry(5.45, 64), mat(COLORS.water, { roughness: 0.23, metalness: 0.15, transparent: true, opacity: 0.92 }), pond, [0, 0.085, 0], false);
  water.rotation.x = -Math.PI / 2;
  water.scale.y = 0.85;
  for (const [x, z, s] of [[-1, -1, 0.65], [2.2, 0.8, 0.8], [1.5, -2, 0.6], [-2.5, 2, 0.7], [0, 2.8, 0.65]]) {
    const pad = mesh(new THREE.CircleGeometry(s, 14, 0.15, TAU - 0.35), mat(0x608e5c, { side: THREE.DoubleSide }), pond, [x, 0.14, z], false);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = x;
    if (x > 0) {
      for (let a = 0; a < TAU; a += TAU / 6) {
        const petal = sphere(pond, x + Math.cos(a) * 0.19, 0.24, z + Math.sin(a) * 0.19, 0.2, 0xe8bbb8, [0.65, 0.5, 1.4]);
        petal.rotation.y = -a;
      }
      sphere(pond, x, 0.28, z, 0.1, 0xd1ad61);
    }
  }
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    pond.add(g);
    sphere(g, 0, 0, 0, 0.18, i % 2 ? 0xf4e5cc : 0xd7784d, [0.7, 0.45, 1.8]);
    const tail = mesh(new THREE.ConeGeometry(0.16, 0.35, 3), mat(i % 2 ? 0xe1bd84 : 0xe7b287), g, [0, 0, 0.38], false);
    tail.rotation.x = Math.PI / 2;
    sphere(g, 0, 0.04, -0.07, 0.1, 0xc1593b, [0.8, 0.3, 1]);
    fish.push({ group: g, phase: i * 1.7, radius: 2 + i * 0.5, speed: 0.1 + i * 0.022 });
  }
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.RingGeometry(0.95, 1, 48), mat(0xb7ded0, { transparent: true, opacity: 0.25, side: THREE.DoubleSide }), pond, [-1.5, 0.16, 0.8], false);
    ring.rotation.x = -Math.PI / 2;
    waterRings.push({ mesh: ring, phase: i / 3 });
  }
  const jetty = box(scene, 12.1, 0.25, 6, 2.8, 0.24, 3.4, 0x8f806d);
  for (let z = 4.4; z <= 7.7; z += 0.35) box(scene, 12.1, 0.39, z, 2.8, 0.03, 0.035, 0x665d52);
  jetty.receiveShadow = true;

  function rock(x, z, scale = 1, color = COLORS.stoneDark) {
    const g = mesh(new THREE.DodecahedronGeometry(0.8, 0), mat(color), scene, [x, scale * 0.38, z]);
    g.scale.set(scale, scale * 0.8, scale * 0.75);
    g.rotation.set(0.3, x, 0.15);
    return g;
  }
  for (const [x, z, s] of [[23, 8, 1.2], [21, 10, 0.7], [15, 10.2, 0.9], [22, 2, 0.7], [-9.7, -5, 1], [8, -4, 1.3], [-22, -7, 1.7], [-22.5, -6, 0.8]]) rock(x, z, s);
  function stoneLantern(x, z) {
    cylinder(scene, x, 0.22, z, 0.65, 0.85, 0.4, COLORS.stone, 8);
    cylinder(scene, x, 1, z, 0.2, 0.3, 1.3, COLORS.stone, 8);
    box(scene, x, 1.9, z, 1.05, 0.8, 1.05, COLORS.stoneLight);
    box(scene, x, 1.95, z + 0.54, 0.48, 0.36, 0.02, 0x99895d, { emissive: 0xffbd65, emissiveIntensity: 0.4 });
    const cap = cylinder(scene, x, 2.5, z, 0.08, 1, 0.5, COLORS.stoneDark, 4);
    cap.rotation.y = Math.PI / 4;
    sphere(scene, x, 2.85, z, 0.16, COLORS.stoneDark);
  }
  [[-8.4, 16], [8.4, 16], [-8.4, -4], [8.4, -4], [10.4, 10.6], [-22, 14]].forEach(([x, z]) => stoneLantern(x, z));

  function pineTree(x, z, size = 1, tilt = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(size);
    g.rotation.y = tilt;
    scene.add(g);
    lineTube(g, [[0, 0, 0], [0.2, 1.8, 0], [-0.3, 3, 0.2], [0.15, 5.8, 0]], 0.18, 0x6e5c43, 7);
    const branches = [[-1.5, 2.7, 0], [1.6, 3.6, 0.1], [-1, 4.8, -0.3], [0.1, 5.8, 0]];
    for (const [bx, by, bz] of branches) {
      lineTube(g, [[0, by - 0.8, 0], [bx * 0.7, by - 0.1, bz], [bx, by, bz]], 0.09, 0x6e5c43);
      sphere(g, bx, by + 0.23, bz, 1, COLORS.pine, [1.75, 0.5, 1.2]);
      sphere(g, bx + 0.5, by + 0.45, bz - 0.4, 0.85, COLORS.leaf, [1.5, 0.6, 1.1]);
    }
  }
  [[-11, -6, 1.1, 0.5], [9.5, -3.5, 1, 1], [-23, -20, 1.4, 0.7], [24, -12, 1.1, 2], [23, 17, 1.1, -1], [-12, 18, 0.85, 0.5]].forEach((p) => pineTree(...p));

  const bambooGeo = new THREE.CylinderGeometry(0.095, 0.12, 1, 7);
  resources.add(bambooGeo);
  const bambooMatrices = [];
  const leafMatrices = [];
  const leafGeo = new THREE.SphereGeometry(1, 5, 3);
  resources.add(leafGeo);
  const bambooDummy = new THREE.Object3D();
  let seed = 15721;
  function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  for (let i = 0; i < 40; i++) {
    const cluster = i < 24 ? [-22, 12] : [22, -5];
    const x = cluster[0] + (random() - 0.5) * 5;
    const z = cluster[1] + (random() - 0.5) * 11;
    const h = 4.4 + random() * 3.2;
    bambooDummy.position.set(x, h / 2, z);
    bambooDummy.rotation.set((random() - 0.5) * 0.09, 0, (random() - 0.5) * 0.09);
    bambooDummy.scale.set(1, h, 1);
    bambooDummy.updateMatrix();
    bambooMatrices.push(bambooDummy.matrix.clone());
    for (let n = 0; n < 4; n++) {
      const a = random() * TAU;
      const len = 0.65 + random() * 0.4;
      bambooDummy.position.set(x + Math.cos(a) * 0.6, h * (0.6 + n * 0.09), z + Math.sin(a) * 0.6);
      bambooDummy.rotation.set(0.2, -a, 0.3);
      bambooDummy.scale.set(len, 0.055, 0.16);
      bambooDummy.updateMatrix();
      leafMatrices.push(bambooDummy.matrix.clone());
    }
  }
  const bambooMeshes = new THREE.InstancedMesh(bambooGeo, mat(0x65925b), bambooMatrices.length);
  bambooMatrices.forEach((m, i) => bambooMeshes.setMatrixAt(i, m));
  bambooMeshes.castShadow = true;
  scene.add(bambooMeshes);
  const bambooLeaves = new THREE.InstancedMesh(leafGeo, mat(0x3d7951), leafMatrices.length);
  leafMatrices.forEach((m, i) => bambooLeaves.setMatrixAt(i, m));
  bambooLeaves.castShadow = true;
  scene.add(bambooLeaves);
  for (let i = 0; i < 14; i++) {
    const z = 6 + i * 0.95;
    const x = -18.7 + Math.sin(i * 0.5) * 0.65;
    const stepping = cylinder(scene, x, 0.09, z, 0.68, 0.7, 0.16, COLORS.stoneLight, 7);
    stepping.rotation.y = i;
  }
  function bench(x, z, rotation = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotation;
    scene.add(g);
    box(g, 0, 0.75, 0, 3, 0.2, 0.8, COLORS.wood);
    box(g, 0, 1.2, -0.35, 3, 0.65, 0.12, 0x8d7053);
    for (const s of [-1, 1]) box(g, s * 1.05, 0.35, 0, 0.2, 0.7, 0.55, COLORS.stoneDark);
    return g;
  }
  bench(-19, 17, 0);
  bench(13.5, 12.5, Math.PI / 2);
  bench(10, -8, 0);
  bench(-10, 9, Math.PI / 2);

  const wishRoot = new THREE.Group();
  wishRoot.position.set(12.8, 0, -12);
  scene.add(wishRoot);
  lineTube(wishRoot, [[0, 0, 0], [-0.4, 2, 0.2], [0.2, 4, 0], [-0.2, 7, 0.1]], 0.3, 0x786043, 8);
  for (const [x, y, z] of [[-2.7, 4.7, 0.4], [2.4, 5.1, 0.2], [-1.3, 6.4, -1.6], [1.4, 6.8, -1.2], [0.6, 4.3, 1.8]]) {
    lineTube(wishRoot, [[0, 2.2, 0], [x * 0.6, y - 1, z * 0.5], [x, y, z]], 0.13, 0x786043, 7);
    sphere(wishRoot, x, y + 0.3, z, 1, 0x839963, [1.7, 0.9, 1.25]);
    sphere(wishRoot, x - 0.4, y + 0.7, z - 0.25, 0.85, 0x94a56f, [1.5, 0.8, 1.25]);
  }
  const sharedLanternRoot = new THREE.Group();
  wishRoot.add(sharedLanternRoot);
  const baselineLanterns = [
    [-2.3, 3.5, 0.6], [2, 4, 0.4], [-0.9, 5.2, -1.4], [1.2, 5.7, -0.8], [0.6, 3.3, 1.5],
  ];
  baselineLanterns.forEach(([x, y, z]) => lantern(wishRoot, x, y, z, COLORS.red, 0.58));

  const mountainGeo = new THREE.ConeGeometry(1, 1, 6);
  resources.add(mountainGeo);
  for (let i = 0; i < 17; i++) {
    const x = -89 + i * 11;
    const h = 13 + random() * 19;
    const mountain = new THREE.Mesh(mountainGeo, mat(i % 2 ? 0x8ba399 : 0xa4b8ad, { flatShading: true }));
    mountain.position.set(x, h / 2 - 5, -63 - random() * 20);
    mountain.scale.set(15 + random() * 11, h, 12 + random() * 10);
    mountain.rotation.y = random() * 3;
    scene.add(mountain);
  }
  for (let i = 0; i < 24; i++) {
    const x = -45 + random() * 90;
    const z = -34 - random() * 10;
    pineTree(x, z, 1 + random() * 0.7, random() * TAU);
  }

  const farm = createFarmScene({ scene, mat, mesh, box, cylinder, sphere, textSprite, resources, clickables, chinese });

  const destinationMarkers = new THREE.Group();
  scene.add(destinationMarkers);
  for (const [id, point] of Object.entries(DESTINATIONS)) {
    const label = textSprite(chinese ? point.zh : point.en, { scale: chinese ? 4.2 : 5.2, fontSize: chinese ? 45 : 37 });
    label.position.set(point.x, id === "hall" ? 3 : 2.7, point.z);
    label.userData.destination = id;
    destinationMarkers.add(label);
    clickables.push(label);
    const ring = mesh(new THREE.RingGeometry(0.53, 0.61, 32), mat(0xf0e5ba, { side: THREE.DoubleSide, transparent: true, opacity: 0.8 }), scene, [point.x, 0.18, point.z], false);
    ring.rotation.x = -Math.PI / 2;
  }

  // Static architecture shares draw calls by material; animated objects retain their own transforms.
  const dynamicRoots = new Set([
    ...animatedLanterns.map((item) => item.group),
    ...fish.map((item) => item.group),
    ...waterRings.map((item) => item.mesh),
    sharedLanternRoot,
    farm.dynamicRoot,
  ]);
  const batches = new Map();
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || Array.isArray(object.material)) return;
    let ancestor = object;
    while (ancestor && !dynamicRoots.has(ancestor)) ancestor = ancestor.parent;
    if (ancestor) return;
    const id = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    if (!batches.has(id)) batches.set(id, { material: object.material, castShadow: object.castShadow, receiveShadow: object.receiveShadow, items: [] });
    batches.get(id).items.push(object);
  });
  for (const batch of batches.values()) {
    if (batch.items.length < 2) continue;
    const parts = batch.items.map((item) => {
      const geometry = item.geometry.index ? item.geometry.toNonIndexed() : item.geometry.clone();
      geometry.applyMatrix4(item.matrixWorld);
      for (const attribute of Object.keys(geometry.attributes)) {
        if (attribute !== "position" && attribute !== "normal") geometry.deleteAttribute(attribute);
      }
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      return geometry;
    });
    const geometry = mergeGeometries(parts, false);
    parts.forEach((part) => part.dispose());
    if (!geometry) continue;
    const combined = mesh(geometry, batch.material, scene, [0, 0, 0], batch.castShadow);
    combined.receiveShadow = batch.receiveShadow;
    for (const item of batch.items) item.parent.remove(item);
  }

  function makePerson(nickname, color, isSelf = false) {
    const g = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.position.y = 0.45;
    g.add(pivot);
    const robeColor = typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) ? color : (typeof color === "number" ? color : PALETTE[0]);
    cylinder(pivot, 0, 0.2, 0, 0.28, 0.45, 0.85, robeColor, 12);
    cylinder(pivot, 0, 0.7, 0, 0.25, 0.3, 0.32, robeColor, 12);
    box(pivot, 0.03, 0.53, 0.245, 0.13, 0.65, 0.025, 0xd9d2bb);
    cylinder(pivot, 0, 0.31, 0, 0.3, 0.3, 0.09, 0xd6c49d, 12);
    sphere(pivot, 0, 1.08, 0, 0.26, 0xe1b997, [0.9, 1.07, 0.9]);
    sphere(pivot, 0, 1.21, -0.025, 0.25, 0x34413c, [0.93, 0.57, 0.9]);
    sphere(pivot, 0, 1.37, -0.08, 0.095, 0x34413c, [1, 0.7, 1]);
    sphere(pivot, -0.09, 1.11, 0.224, 0.021, 0x413e33);
    sphere(pivot, 0.09, 1.11, 0.224, 0.021, 0x413e33);
    const arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 0.27, 0.7, 0);
      arm.rotation.z = s * 0.14;
      pivot.add(arm);
      cylinder(arm, 0, -0.23, 0, 0.12, 0.15, 0.5, robeColor, 9);
      sphere(arm, 0, -0.5, 0, 0.09, 0xe1b997);
      arms.push(arm);
    }
    const feet = [];
    for (const s of [-1, 1]) {
      const foot = sphere(g, s * 0.17, 0.1, 0.1, 0.15, 0x35453f, [0.7, 0.5, 1.3]);
      feet.push(foot);
    }
    if (isSelf) {
      const halo = mesh(new THREE.RingGeometry(0.48, 0.57, 32), mat(0xffe8a6, { side: THREE.DoubleSide, transparent: true, opacity: 0.95 }), g, [0, 0.17, 0], false);
      halo.rotation.x = -Math.PI / 2;
    }
    const name = textSprite(nickname || (chinese ? "来客" : "Visitor"), { scale: 2.8, fontSize: 46, width: 384, background: isSelf ? "#fff6ce" : "#fffdf2", color: "#153f36" });
    name.position.set(0, 2.23, 0);
    g.add(name);
    scene.add(g);
    return { group: g, pivot, arms, feet, name, time: Math.random() * 4, action: "idle", target: new THREE.Vector3(), nickname };
  }
  const player = makePerson(chinese ? "我" : "You", PALETTE[0], true);
  player.group.position.set(0, 0.13, 18);
  player.group.rotation.y = Math.PI;
  const destinationDisk = mesh(new THREE.RingGeometry(0.5, 0.65, 32), mat(0xe6d38b, { transparent: true, opacity: 0.8, side: THREE.DoubleSide }), scene, [0, 0.2, 18], false);
  destinationDisk.rotation.x = -Math.PI / 2;
  destinationDisk.visible = false;

  function animatePerson(person, dt, time, personAction) {
    if (person.previousAction !== personAction) {
      person.previousAction = personAction;
      person.time = 0;
    }
    person.time += dt;
    person.pivot.rotation.x = 0;
    person.pivot.position.y = 0.45;
    person.group.scale.y = 1;
    person.arms[0].rotation.x = 0;
    person.arms[1].rotation.x = 0;
    person.arms[0].rotation.z = -0.14;
    person.arms[1].rotation.z = 0.14;
    for (const foot of person.feet) foot.position.z = 0.1;
    if (personAction === "walk") {
      const swing = Math.sin(person.time * 9);
      person.arms[0].rotation.x = swing * 0.45;
      person.arms[1].rotation.x = -swing * 0.45;
      person.feet[0].position.z = 0.1 + swing * 0.13;
      person.feet[1].position.z = 0.1 - swing * 0.13;
      person.pivot.position.y += Math.abs(swing) * 0.04;
    } else if (personAction === "sit") {
      person.pivot.position.y = 0.21;
      person.group.scale.y = 0.76;
      person.arms[0].rotation.x = -0.7;
      person.arms[1].rotation.x = -0.7;
    } else if (personAction === "bow") {
      const bow = (Math.sin(person.time * Math.PI / 2 - Math.PI / 2) + 1) / 2;
      person.pivot.rotation.x = bow * 1.15;
      person.pivot.position.y = 0.45 - bow * 0.18;
      person.arms[0].rotation.x = -0.9;
      person.arms[1].rotation.x = -0.9;
      person.arms[0].rotation.z = -0.45;
      person.arms[1].rotation.z = 0.45;
    } else if (personAction === "tea") {
      person.arms[1].rotation.x = -1.4 + Math.sin(time) * 0.12;
      person.arms[1].rotation.z = 0.4;
    } else if (personAction === "fish" || personAction === "beads") {
      person.arms[1].rotation.x = -0.9 + Math.sin(time * 4) * 0.3;
      person.arms[0].rotation.x = -0.6;
    } else {
      person.pivot.position.y += Math.sin(person.time * 1.6) * 0.018;
    }
  }
  function announcePosition() {
    onPosition?.({ x: +player.group.position.x.toFixed(3), z: +player.group.position.z.toFixed(3), yaw: +player.group.rotation.y.toFixed(3), action });
  }
  function moveTo(point, id = null) {
    const next = findPath({ x: player.group.position.x, z: player.group.position.z }, point);
    if (!next.length && Math.hypot(player.group.position.x - point.x, player.group.position.z - point.z) > 0.6) return false;
    path = next;
    destinationId = id;
    destinationDisk.position.set(point.x, 0.2, point.z);
    destinationDisk.visible = true;
    action = "walk";
    if (!path.length && id) {
      action = "idle";
      destinationDisk.visible = false;
      onArrive?.(id);
    }
    announcePosition();
    return true;
  }
  function handleKeyDown(event) {
    if (document.querySelector("[role=dialog],[role=alertdialog]")) { clearKeys(); return; }
    if (event.target instanceof HTMLElement && event.target.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=alertdialog]")) { clearKeys(); return; }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
      path = [];
      destinationId = null;
      destinationDisk.visible = false;
    }
  }
  function handleKeyUp(event) { keys.delete(event.code); }
  function clearKeys() { keys.clear(); }
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", clearKeys);
  let pointerStart = null;
  function pointerDown(event) { pointerStart = { x: event.clientX, y: event.clientY, at: performance.now() }; }
  function pointerUp(event) {
    if (!pointerStart || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 7 || performance.now() - pointerStart.at > 450) return;
    pointerStart = null;
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(clickables, true);
    if (hits.length) {
      let obj = hits[0].object;
      while (obj && !obj.userData.destination && !obj.userData.visitor && !obj.userData.farmPlot && !obj.userData.farmAnimalType && !obj.userData.wildlife) obj = obj.parent;
      if (obj?.userData.destination) { api.goTo(obj.userData.destination); return; }
      if (obj?.userData.visitor) { onSelectVisitor?.(obj.userData.visitor); return; }
      if (obj?.userData.farmPlot) { onSelectPlot?.(obj.userData.farmPlot); return; }
      if (obj?.userData.farmAnimalType) {
        const animalId = farm.resolveAnimal(obj.userData.farmAnimalType, hits[0].instanceId);
        if (animalId) onSelectAnimal?.(animalId);
        return;
      }
      if (obj?.userData.wildlife) { onSelectWildlife?.(obj.userData.wildlife); return; }
    }
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) && !blocked(hit.x, hit.z)) moveTo(hit);
  }
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  function contextLost(event) {
    event.preventDefault();
    onError?.(new Error(chinese ? "画面连接中断，请刷新重试" : "The graphics context was lost. Please reload."));
  }
  renderer.domElement.addEventListener("webglcontextlost", contextLost);

  function resize() {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    const aspect = width / height;
    const view = aspect < 0.8 ? 61 : aspect < 1.15 ? 57 : 52;
    camera.left = -view * aspect / 2;
    camera.right = view * aspect / 2;
    camera.top = view / 2;
    camera.bottom = -view / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const movement = new THREE.Vector3();
  const lastPosition = new THREE.Vector3();
  const followDelta = new THREE.Vector3();
  function render() {
    if (disposed) return;
    frameId = requestAnimationFrame(render);
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.05);
    const time = timer.getElapsed();
    if (document.hidden) return;
    if (keys.size && document.querySelector("[role=dialog],[role=alertdialog]")) clearKeys();
    lastPosition.copy(player.group.position);
    if (keys.size) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
      movement.set(0, 0, 0);
      if (keys.has("KeyW") || keys.has("ArrowUp")) movement.add(forward);
      if (keys.has("KeyS") || keys.has("ArrowDown")) movement.sub(forward);
      if (keys.has("KeyD") || keys.has("ArrowRight")) movement.add(right);
      if (keys.has("KeyA") || keys.has("ArrowLeft")) movement.sub(right);
      movement.normalize().multiplyScalar(dt * 4);
      const pos = player.group.position;
      if (!blocked(pos.x + movement.x, pos.z)) pos.x += movement.x;
      if (!blocked(pos.x, pos.z + movement.z)) pos.z += movement.z;
      action = "walk";
    } else if (path.length) {
      const next = path[0];
      const dx = next.x - player.group.position.x;
      const dz = next.z - player.group.position.z;
      const distance = Math.hypot(dx, dz);
      const speed = dt * 4.5;
      if (distance <= speed) {
        player.group.position.x = next.x;
        player.group.position.z = next.z;
        path.shift();
        if (!path.length) {
          action = "idle";
          destinationDisk.visible = false;
          if (destinationId) {
            const arrived = destinationId;
            destinationId = null;
            onArrive?.(arrived);
          }
          announcePosition();
        }
      } else {
        player.group.position.x += dx / distance * speed;
        player.group.position.z += dz / distance * speed;
        action = "walk";
      }
    } else if (action === "walk") action = "idle";
    const movedX = player.group.position.x - lastPosition.x;
    const movedZ = player.group.position.z - lastPosition.z;
    if (Math.abs(movedX) + Math.abs(movedZ) > 0.001) player.group.rotation.y = Math.atan2(movedX, movedZ);
    const outside = player.group.position.z > 27 || player.group.position.x > 28;
    if (outside !== focusedFarm) {
      focusedFarm = outside;
      camera.zoom = outside ? 1.45 : 1;
      camera.updateProjectionMatrix();
    }
    animatePerson(player, dt, time, action);
    farm.animate(dt, time, reducedMotion, player.group.position);
    for (const person of remote.values()) {
      const before = person.group.position.clone();
      person.group.position.lerp(person.target, Math.min(1, dt * 10));
      const dx = person.group.position.x - before.x;
      const dz = person.group.position.z - before.z;
      if (Math.hypot(dx, dz) > 0.002) person.group.rotation.y = Math.atan2(dx, dz);
      animatePerson(person, dt, time, Math.hypot(dx, dz) > 0.008 ? "walk" : person.action);
    }
    if (!reducedMotion) {
      for (const item of animatedLanterns) item.group.rotation.z = Math.sin(time * 0.8 + item.phase) * 0.035;
      for (const item of fish) {
        const a = time * item.speed + item.phase;
        item.group.position.set(Math.cos(a) * item.radius, 0.16, Math.sin(a) * item.radius * 0.7);
        item.group.rotation.y = -a;
        item.group.rotation.z = Math.sin(time * 3 + item.phase) * 0.06;
      }
      for (const item of waterRings) {
        const scale = ((time * 0.12 + item.phase) % 1) * 2.1 + 0.2;
        item.mesh.scale.setScalar(scale);
        item.mesh.material.opacity = Math.max(0, (2.3 - scale) * 0.12);
      }
    }
    if (width < 700 || farmMode || player.group.position.z > 27 || player.group.position.x > 28) {
      followDelta.set(player.group.position.x - controls.target.x, 0, player.group.position.z - 4 - controls.target.z);
      followDelta.multiplyScalar(Math.min(1, dt * 1.6));
      controls.target.add(followDelta);
      camera.position.add(followDelta);
    }
    controls.update();
    sendElapsed += dt;
    if (sendElapsed >= 0.1) { sendElapsed = 0; announcePosition(); }
    renderer.render(scene, camera);
    frames++;
    metricsElapsed += dt;
    if (metricsElapsed >= 1) {
      metricsElapsed = 0;
      renderer.domElement.dataset.state = JSON.stringify(api.getState());
    }
    if (frames === 2) onReady?.();
  }
  const api = {
    goTo(id) {
      const point = DESTINATIONS[id];
      if (!point) return false;
      farmMode = id === "farm" || id === "hunt";
      return moveTo(point, id);
    },
    goToFarm(plotId) {
      const plot = plotId ? farm.getPlot(plotId) : null;
      if (plotId && !plot) return false;
      farmMode = true;
      const point = plot ? { x: plot.x - Math.sign(plot.x) * 4, z: plot.z } : DESTINATIONS.farm;
      return moveTo(point, plot ? `farm:${plot.id}` : "farm");
    },
    goToHunt() { return api.goTo("hunt"); },
    setFarmState(state) { farm.setState(state); },
    setFarmMode(enabled) { farmMode = Boolean(enabled); },
    getFarmWorld() { return farm.getWorld(); },
    approachVisitor(id) {
      const person = remote.get(id);
      if (!person) return false;
      const position = person.target;
      const from = player.group.position;
      const startAngle = Math.atan2(from.z - position.z, from.x - position.x);
      for (let step = 0; step < 8; step++) {
        const angle = startAngle + step * Math.PI / 4;
        const point = { x: position.x + Math.cos(angle) * 1.8, z: position.z + Math.sin(angle) * 1.8 };
        if (!blocked(point.x, point.z) && moveTo(point)) return true;
      }
      return false;
    },
    updateSelf(position) {
      const x = Number(position?.x);
      const z = Number(position?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
      let target = { x: Math.max(FARM_BOUNDS.minX, Math.min(FARM_BOUNDS.maxX, x)), z: Math.max(FARM_BOUNDS.minZ, Math.min(FARM_BOUNDS.maxZ, z)) };
      if (blocked(target.x, target.z)) {
        const nearestPath = findPath({ x: player.group.position.x, z: player.group.position.z }, target);
        if (!nearestPath.length) return false;
        target = nearestPath.at(-1);
      }
      player.group.position.set(target.x, 0.13, target.z);
      path = [];
      destinationId = null;
      destinationDisk.visible = false;
      action = "idle";
      return true;
    },
    setAction(nextAction) {
      if (!["idle", "walk", "sit", "bow", "tea", "fish", "beads"].includes(nextAction)) return;
      path = [];
      destinationId = null;
      destinationDisk.visible = false;
      action = nextAction;
      if (["sit", "bow"].includes(action)) player.group.rotation.y = Math.PI;
      announcePosition();
    },
    setPeople(people, ownId) {
      selfId = ownId;
      const active = new Set();
      for (const visitor of people || []) {
        if (!visitor || visitor.id === selfId || typeof visitor.id !== "string") continue;
        const visitorX = Number.isFinite(visitor.x) ? visitor.x : 0;
        const visitorZ = Number.isFinite(visitor.z) ? visitor.z : 18;
        active.add(visitor.id);
        let person = remote.get(visitor.id);
        if (!person) {
          person = makePerson(String(visitor.nickname || (chinese ? "来客" : "Visitor")).slice(0, 20), visitor.color || PALETTE[remote.size % PALETTE.length]);
          person.group.userData.visitor = visitor.id;
          person.name.userData.visitor = visitor.id;
          person.group.position.set(visitorX, 0.13, visitorZ);
          remote.set(visitor.id, person);
          clickables.push(person.group);
        }
        person.target.set(Math.max(FARM_BOUNDS.minX, Math.min(FARM_BOUNDS.maxX, visitorX)), 0.13, Math.max(FARM_BOUNDS.minZ, Math.min(FARM_BOUNDS.maxZ, visitorZ)));
        person.action = visitor.action === "woodfish" ? "fish" : visitor.action === "meditate" ? "sit" : visitor.action || "idle";
        if (person.action !== "walk" && Number.isFinite(visitor.yaw)) person.group.rotation.y = visitor.yaw;
      }
      for (const [id, person] of remote) {
        if (active.has(id)) continue;
        scene.remove(person.group);
        const index = clickables.indexOf(person.group);
        if (index >= 0) clickables.splice(index, 1);
        disposeGroup(person.group);
        remote.delete(id);
      }
    },
    setLanterns(items) {
      const visible = (items || []).slice(-24);
      const signature = visible.map((item) => `${item.id}:${item.color}`).join("|");
      if (signature === lanternSignature) return;
      lanternSignature = signature;
      disposeGroup(sharedLanternRoot);
      for (let i = animatedLanterns.length - 1; i >= 0; i--) {
        if (animatedLanterns[i].shared) animatedLanterns.splice(i, 1);
      }
      const hues = { red: 0xc85548, gold: 0xdeb761, jade: 0x78a88c, pink: 0xd28e95 };
      visible.forEach((item, index) => {
        const a = index * 2.399;
        const r = 1.3 + index % 4 * 0.45;
        lantern(sharedLanternRoot, Math.cos(a) * r, 2.8 + index % 5 * 0.48, Math.sin(a) * r, hues[item.color] || COLORS.red, 0.44);
        animatedLanterns[animatedLanterns.length - 1].shared = true;
      });
    },
    setLight(mode) {
      lightMode = ["day", "dusk", "night"].includes(mode) ? mode : "day";
      const settings = lightMode === "night" ? [0x223e4d, 0xa7c1ce, 0.9, 0xc4d9f2, 1.1, 0.85]
        : lightMode === "dusk" ? [0xe5d5c6, 0xffe8c5, 1.7, 0xffc286, 2.4, 1.05]
          : [COLORS.sky, 0xe8f6ff, 2.6, 0xffedc7, 3.1, 1.15];
      scene.background.setHex(settings[0]);
      scene.fog.color.setHex(settings[0]);
      ambient.color.setHex(settings[1]);
      ambient.intensity = settings[2];
      sun.color.setHex(settings[3]);
      sun.intensity = settings[4];
      renderer.toneMappingExposure = settings[5];
    },
    recenter() {
      const outside = farmMode || player.group.position.z > 27 || player.group.position.x > 28;
      const x = outside ? player.group.position.x : 0;
      const z = outside ? player.group.position.z - 4 : 0;
      camera.position.set(x + 36, 43, z + 47);
      controls.target.set(x, 1, z);
      camera.zoom = outside ? 1.45 : 1;
      camera.updateProjectionMatrix();
      controls.update();
    },
    capture() {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    },
    resize,
    getState() {
      const farmWorld = farm.getWorld();
      const projected = new THREE.Vector3();
      const animals = farmWorld.animals.map(animal => {
        projected.set(animal.x, animal.type === "sheep" ? 1.4 : .8, animal.z).project(camera);
        return { ...animal, screenX: +((projected.x + 1) * width / 2).toFixed(1), screenY: +((1 - projected.y) * height / 2).toFixed(1) };
      });
      return {
        x: +player.group.position.x.toFixed(3),
        z: +player.group.position.z.toFixed(3),
        target: destinationId,
        action,
        renderedFrames: frames,
        width,
        height,
        remoteVisitors: remote.size,
        lightMode,
        area: player.group.position.x > 28 && player.group.position.z < 24 ? "forest" : player.group.position.z > 27 ? "farm" : "courtyard",
        farm: { ...farmWorld, animals },
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        paths: Object.fromEntries(Object.entries(DESTINATIONS).map(([id, point]) => [id, !blocked(point.x, point.z)])),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", clearKeys);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      controls.dispose();
      resources.forEach((value) => value.dispose());
      timer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  frameId = requestAnimationFrame(render);
  return api;
}
