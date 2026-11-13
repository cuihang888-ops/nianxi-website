import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { LAND_PLOTS } from "./farm-state.js";

export const FARM_BOUNDS = Object.freeze({ minX: -48, maxX: 48, minZ: -30, maxZ: 66 });

export function farmBlocked(x, z) {
  if (x > 32.4 && x < 42.1 && z > 25.2 && z < 34.7) return true;
  if (x > 36.4 && x < 41.6 && z > 35 && (z < 44.5 || z > 49.5)) return true;
  for (const plot of LAND_PLOTS) {
    const dx = x - plot.x;
    const dz = z - plot.z;
    if (Math.abs(dx) < 12.6 && Math.abs(Math.abs(dz) - 7) < 0.65) return true;
    if (Math.abs(dz) < 7.6 && Math.abs(Math.abs(dx) - 12) < 0.65) {
      const atGate = Math.sign(dx) === -Math.sign(plot.x) && Math.abs(dz) < 1.8;
      if (!atGate) return true;
    }
  }
  return false;
}

function coloredGeometry(parts) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const geometries = parts.map(({ geometry, at, size = [1, 1, 1], rotate = [0, 0, 0], color, gait = 0 }) => {
    const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    quaternion.setFromEuler(new THREE.Euler(...rotate));
    matrix.compose(position.set(...at), quaternion, scale.set(...size));
    part.applyMatrix4(matrix);
    part.deleteAttribute("uv");
    const rgb = new THREE.Color(color);
    const colors = new Float32Array(part.attributes.position.count * 3);
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = rgb.r;
      colors[index + 1] = rgb.g;
      colors[index + 2] = rgb.b;
    }
    part.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    part.setAttribute("farmGait", new THREE.BufferAttribute(new Float32Array(part.attributes.position.count).fill(gait), 1));
    return part;
  });
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach(part => part.dispose());
  geometry.computeBoundingSphere();
  return geometry;
}

function animalGeometry(type) {
  const parts = [];
  const ball = (at, size, color, radius = 1) => parts.push({ geometry: new THREE.IcosahedronGeometry(radius, 1), at, size, color });
  const block = (at, size, color, rotate, gait) => parts.push({ geometry: new THREE.BoxGeometry(1, 1, 1), at, size, color, rotate, gait });
  const cream = 0xf1ead7;
  const dark = 0x4b4a42;
  if (type === "sheep") {
    ball([0, 0.88, 0], [0.68, 0.56, 0.9], cream);
    for (const [x, z] of [[-.4, -.4], [.4, -.4], [-.4, .3], [.4, .3]]) ball([x, 1.03, z], [.35, .34, .4], 0xfff8e9);
    for (const x of [-.37, .37]) for (const z of [-.46, .46]) block([x, .3, z], [.18, .56, .19], dark, undefined, Math.sign(x * z));
    ball([0, 1.02, .86], [.34, .37, .38], dark);
    ball([0, 1.25, .75], [.36, .23, .31], cream);
    for (const x of [-.38, .38]) ball([x, 1.12, .8], [.25, .1, .13], dark);
    ball([0, .94, -.94], [.2, .18, .23], cream);
    for (const x of [-.14, .14]) ball([x, 1.11, 1.19], [.045, .05, .035], 0xfefdf5);
    block([0, .7, .7], [.5, .15, .08], 0xd2a45b);
  } else if (type === "rabbit") {
    ball([0, .39, -.08], [.4, .39, .57], 0xd9d3c8);
    ball([0, .62, .43], [.28, .29, .26], cream);
    for (const x of [-.13, .13]) {
      block([x, 1.05, .43], [.14, .62, .14], cream, [0, 0, -x]);
      block([x, 1.07, .51], [.065, .43, .025], 0xdc9c9d, [0, 0, -x]);
      block([x * 1.8, .13, .36], [.18, .16, .4], cream, undefined, Math.sign(x) * .5);
      ball([x * 1.6, .68, .62], [.036, .04, .035], dark);
    }
    ball([0, .48, -.63], [.2, .2, .18], 0xfffbeb);
    ball([0, .56, .68], [.05, .045, .04], 0xdc9c9d);
  } else if (type === "deer") {
    ball([0, 1.15, -.03], [.48, .47, .88], 0xba8d62);
    ball([0, 1.63, .62], [.25, .62, .28], 0xba8d62);
    ball([0, 2.1, .84], [.27, .28, .4], 0xc99d72);
    ball([0, 1.97, 1.12], [.17, .14, .25], 0xe3c3a0);
    ball([0, 2.03, 1.3], [.12, .09, .09], dark);
    for (const x of [-.3, .3]) for (const z of [-.48, .47]) block([x, .51, z], [.12, .95, .13], 0x8b7056, undefined, Math.sign(x * z));
    for (const x of [-.36, .36]) ball([x, 2.24, .72], [.27, .12, .13], 0xc99d72);
    for (const x of [-.18, .18]) {
      block([x, 2.55, .71], [.075, .7, .075], 0x7d705b, [0, 0, -x]);
      block([x * 1.7, 2.65, .71], [.075, .35, .075], 0x7d705b, [0, 0, -x * 3]);
      ball([x, 2.13, 1.05], [.035, .04, .03], dark);
    }
    for (const x of [-.4, .4]) for (const z of [-.3, .1, .45]) ball([x, 1.28, z], [.045, .06, .06], 0xf3e0bd);
    ball([0, 1.31, -.89], [.1, .14, .2], 0xe3c3a0);
  } else {
    const wild = type === "pheasant";
    ball([0, .54, 0], [.38, .41, .48], wild ? 0xad7659 : 0xf3d993);
    ball([0, .97, .36], [.25, .27, .25], wild ? 0x4f8170 : 0xffe7a4);
    ball([-.3, .56, -.02], [.16, .25, .35], wild ? 0x846e54 : 0xe6bc72);
    ball([.3, .56, -.02], [.16, .25, .35], wild ? 0x846e54 : 0xe6bc72);
    block([0, 1.21, .36], [.12, .2, .28], 0xc75d45);
    parts.push({ geometry: new THREE.ConeGeometry(.13, .25, 4), at: [0, .94, .66], rotate: [Math.PI / 2, 0, 0], color: 0xd7903e });
    for (const x of [-.14, .14]) {
      block([x, .16, .07], [.065, .3, .07], 0xd7903e, undefined, Math.sign(x) * .6);
      block([x, .04, .16], [.19, .06, .26], 0xd7903e, undefined, Math.sign(x) * .6);
      ball([x * 1.2, 1.03, .55], [.035, .04, .03], dark);
    }
    block([0, .79, -.44], [.17, .43, .3], 0xc99059, [-.5, 0, 0]);
    if (wild) block([0, .69, -.87], [.18, .13, 1.1], 0x6c6650, [.3, 0, 0]);
  }
  return coloredGeometry(parts);
}

function cropGeometry(type) {
  if (type === "carrot") return coloredGeometry([
    { geometry: new THREE.ConeGeometry(.15, .46, 6), at: [0, .18, 0], rotate: [Math.PI, 0, 0], color: 0xdf873d },
    ...[-.2, 0, .2].map(angle => ({ geometry: new THREE.ConeGeometry(.14, .65, 4), at: [angle, .62, 0], rotate: [0, 0, -angle], color: 0x4d874e })),
  ]);
  return coloredGeometry([-.2, 0, .2].map((x, index) => ({ geometry: new THREE.ConeGeometry(.18, .92, 4), at: [x, .45, index % 2 * .15], rotate: [0, 0, -x], color: index === 1 ? 0x8eae55 : 0x608c48 })));
}

export function createFarmScene({ scene, mat, mesh, box, cylinder, sphere, textSprite, resources, clickables, chinese }) {
  const staticRoot = new THREE.Group();
  const dynamicRoot = new THREE.Group();
  staticRoot.name = "farm-landscape";
  dynamicRoot.name = "farm-live-state";
  scene.add(staticRoot, dynamicRoot);
  const plotVisuals = new Map();
  const animalMeshes = new Map();
  const animalLists = new Map();
  const cropMeshes = new Map();
  const wildlifeMeshes = new Map();
  const animalCare = new Map();
  const careEffects = new Map();
  const gaitTime = { value: 0 };
  let farmState = { plots: [], animals: [], beds: [] };
  let animalPositions = [];
  let visualSignature = "";
  let animationTime = 0;
  const dummy = new THREE.Object3D();

  box(staticRoot, 0, -.08, 46, 96, .13, 42, 0x88aa72);
  box(staticRoot, 0, .015, 45, 2.8, .12, 42, 0xa4b28a);
  for (const z of [39, 57]) box(staticRoot, 0, .02, z, 19, .13, 2.2, 0xa4b28a);
  box(staticRoot, 20, .025, 47, 41, .14, 2.6, 0xa4b28a);
  box(staticRoot, 0, .03, 27.5, 2.8, .12, 8, 0xa4b28a);
  box(staticRoot, 30.9, .015, 11, 2.4, .12, 37, 0xa4b28a);
  box(staticRoot, 34.5, .015, -9.5, 10.2, .12, 2.4, 0xa4b28a);
  box(staticRoot, 38, .015, -15, 2.4, .12, 11, 0xa4b28a);

  const stream = new THREE.Shape();
  stream.moveTo(36.5, -35);
  stream.bezierCurveTo(38, -40, 35.8, -46, 36.5, -52);
  stream.bezierCurveTo(37.4, -58, 36.3, -63, 37, -68);
  stream.lineTo(41.4, -68);
  stream.bezierCurveTo(41, -60, 42.1, -56, 41.2, -50);
  stream.bezierCurveTo(40.5, -45, 42.4, -39, 41.5, -35);
  stream.closePath();
  const water = mesh(new THREE.ShapeGeometry(stream, 12), mat(0x6caaa8, { roughness: .35 }), staticRoot, [0, .055, 0], false);
  water.rotation.x = -Math.PI / 2;
  box(staticRoot, 39, .17, 47, 7.2, .35, 4.6, 0xb6946b);
  for (const z of [44.8, 49.2]) {
    box(staticRoot, 39, 1.05, z, 7.2, .13, .12, 0x795e48);
    for (const x of [35.8, 39, 42.2]) box(staticRoot, x, .7, z, .15, 1.3, .15, 0x795e48);
  }

  const house = new THREE.Group();
  house.position.set(37.2, 0, 30);
  staticRoot.add(house);
  box(house, 0, .2, 0, 9.3, .35, 8.8, 0x9caa94);
  box(house, 0, 2.1, 0, 8.2, 3.8, 7.4, 0xe0dfc4);
  for (const side of [-1, 1]) {
    const roof = box(house, side * 2.1, 4.55, 0, 5, .28, 8.7, 0x566e68);
    roof.rotation.z = -side * .43;
    box(house, side * 2.55, 2.45, 3.74, 1.45, 1.35, .07, 0x487a80);
    box(house, side * 2.55, 2.45, 3.81, 1.58, .1, .08, 0xefe9d4);
  }
  box(house, 0, 1.4, 3.8, 1.65, 2.5, .12, 0x886a4b);
  box(house, 2.5, 4.8, -1.6, .8, 2.3, .85, 0xb9a991);
  box(staticRoot, 37.2, .04, 39.4, 1.8, .13, 9.8, 0xa4b28a);
  const houseLabel = textSprite(chinese ? "田野小屋" : "Farm cottage", { scale: 5.6, fontSize: chinese ? 44 : 36 });
  houseLabel.position.set(37.2, 6.4, 30);
  staticRoot.add(houseLabel);

  const treePositions = [[-38, 30], [-42, 39], [-39, 49], [-42, 61], [43.7, 56], [44, 63], [-34, 62], [29, 66], [-8, 66], [7, 66], [-36, -12], [34, -14], [43, -10], [45, -20], [33, -25], [41, -27], [45, -1], [37, 6], [44, 15], [36, 19], [52, -12], [57, -22], [51, -30], [48, 4], [54, 16], [50, 30], [-48, 43], [-51, 55], [-46, 21], [28, 74], [-5, 75], [-32, 74]];
  treePositions.forEach(([x, z], index) => {
    cylinder(staticRoot, x, 1.5, z, .24, .32, 3, 0x806349, 7);
    sphere(staticRoot, x, 3.7, z, 2.3, index % 3 ? 0x638c50 : 0x859b55, [1, 1.16, 1]);
    sphere(staticRoot, x - 1.3, 3, z + .7, 1.5, 0x74935b);
    if (index % 3 === 0) for (const [dx, dz] of [[-.9, 1.6], [1.5, .5], [.4, -1.8]]) sphere(staticRoot, x + dx, 3.4, z + dz, .19, 0xcd7354);
  });
  for (const [x, z, radius, height] of [[79, -28, 20, 13], [84, 5, 18, 11], [83, 42, 19, 12], [-83, 18, 20, 14], [-81, 57, 18, 10], [-31, 107, 25, 15], [22, 109, 28, 14]]) {
    sphere(staticRoot, x, -5, z, radius, 0x74977a, [1, height / radius, 1.3]);
    sphere(staticRoot, x + 12, -3, z - 12, radius * .7, 0x83a187, [1, .65, 1.2]);
  }

  const flowerGeometry = coloredGeometry([
    { geometry: new THREE.CylinderGeometry(.025, .035, .42, 4), at: [0, .2, 0], color: 0x658447 },
    { geometry: new THREE.IcosahedronGeometry(.24, 0), at: [0, .45, 0], size: [1, .45, 1], color: 0xf4e3b2 },
  ]);
  resources.add(flowerGeometry);
  const flowers = new THREE.InstancedMesh(flowerGeometry, mat(0xffffff, { vertexColors: true }), 420);
  for (let index = 0; index < 420; index++) {
    const side = index % 2 ? 1 : -1;
    const x = index < 180 ? side * (33.7 + Math.sin(index * 2.41) * 2.1) : -29 + ((index * 13.47) % 58);
    const z = index < 180 ? 28 + ((index * 17.73) % 37) : 31.5 + ((index * 7.81) % 32);
    dummy.position.set(x, .03, z);
    dummy.rotation.set(0, index, 0);
    dummy.scale.setScalar(.8 + (index % 5) * .15);
    dummy.updateMatrix();
    flowers.setMatrixAt(index, dummy.matrix);
    flowers.setColorAt(index, new THREE.Color(index % 4 === 0 ? 0xd4b3df : index % 4 === 1 ? 0xf3c7bf : 0xffffff));
  }
  staticRoot.add(flowers);
  dummy.scale.setScalar(1);
  const meadowGeometry = coloredGeometry([
    { geometry: new THREE.ConeGeometry(.13, .65, 3), at: [-.17, .32, 0], rotate: [0, 0, .22], color: 0x739151 },
    { geometry: new THREE.ConeGeometry(.12, .8, 3), at: [.06, .4, .08], rotate: [0, 0, -.1], color: 0x829d59 },
    { geometry: new THREE.ConeGeometry(.12, .55, 3), at: [.22, .27, -.08], rotate: [0, 0, -.3], color: 0x63854c },
  ]);
  resources.add(meadowGeometry);
  const meadowGrass = new THREE.InstancedMesh(meadowGeometry, mat(0xffffff, { vertexColors: true }), 720);
  for (let index = 0; index < 720; index++) {
    const plot = LAND_PLOTS[index % LAND_PLOTS.length];
    dummy.position.set(plot.x - 10.5 + (index * 8.731) % 21, .12, plot.z - 5.7 + (index * 5.618) % 11.4);
    dummy.rotation.set(0, index * .7, 0);
    dummy.scale.setScalar(.35 + index % 6 * .11);
    dummy.updateMatrix();
    meadowGrass.setMatrixAt(index, dummy.matrix);
  }
  staticRoot.add(meadowGrass);
  dummy.scale.setScalar(1);

  const postGeo = new THREE.BoxGeometry(.16, 1.15, .16);
  resources.add(postGeo);
  const posts = [];
  for (const plot of LAND_PLOTS) {
    const direction = Math.sign(plot.x);
    for (let i = 0; i <= 8; i++) for (const side of [-1, 1]) posts.push([plot.x - 12 + i * 3, .65, plot.z + side * 7]);
    for (let i = 1; i <= 6; i++) for (const side of [-1, 1]) {
      const dz = -7 + i * 2;
      if (side === -direction && Math.abs(dz) < 1.8) continue;
      posts.push([plot.x + side * 12, .65, plot.z + dz]);
    }
    for (const y of [.48, .94]) {
      for (const side of [-1, 1]) box(staticRoot, plot.x, y, plot.z + side * 7, 24, .13, .12, 0xac9471);
      box(staticRoot, plot.x + direction * 12, y, plot.z, .12, .13, 14, 0xac9471);
      for (const side of [-1, 1]) box(staticRoot, plot.x - direction * 12, y, plot.z + side * 4.5, .12, .13, 5, 0xac9471);
    }
    const field = box(dynamicRoot, plot.x, .03, plot.z, 23.7, .12, 13.7, 0x94ad79);
    field.userData.farmPlot = plot.id;
    clickables.push(field);
    const sign = textSprite(chinese ? plot.name : plot.nameEn, { scale: 6.4, fontSize: chinese ? 44 : 33, background: "#f2f4df" });
    sign.position.set(plot.x - direction * 8, 2.7, plot.z - 5.8);
    sign.userData.farmPlot = plot.id;
    dynamicRoot.add(sign);
    clickables.push(sign);
    box(staticRoot, plot.x - direction * 8, 1.15, plot.z - 5.8, .17, 2.1, .17, 0x8c7659);
    const beds = [0, 1].map(index => {
      const point = { x: plot.x + direction * (4.8 + index * 3.5), z: plot.z - 3.4 };
      box(staticRoot, point.x, .2, point.z, 2.65, .3, 4.2, 0x8f7859);
      box(staticRoot, point.x, .36, point.z, 2.3, .04, 3.9, 0x655741);
      return point;
    });
    const troughX = plot.x + direction * 8;
    box(staticRoot, troughX, .44, plot.z + 4.7, 2.7, .65, 1, 0x8a9d9a);
    box(staticRoot, troughX, .77, plot.z + 4.7, 2.35, .04, .7, 0x6caaa8);
    plotVisuals.set(plot.id, { field, sign, beds, definition: plot, owned: false });
  }
  const fencePosts = new THREE.InstancedMesh(postGeo, mat(0x967f61), posts.length);
  posts.forEach((point, index) => { dummy.position.set(...point); dummy.updateMatrix(); fencePosts.setMatrixAt(index, dummy.matrix); });
  fencePosts.castShadow = true;
  fencePosts.receiveShadow = true;
  staticRoot.add(fencePosts);

  const animalMaterial = mat(0xffffff, { vertexColors: true, roughness: .92 });
  animalMaterial.onBeforeCompile = shader => {
    shader.uniforms.farmTime = gaitTime;
    shader.vertexShader = `attribute float farmGait;\nuniform float farmTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      float phase = instanceMatrix[3].x * 0.2 + instanceMatrix[3].z * 0.1;
      transformed.z += sin(farmTime * 5.0 + phase + (farmGait < 0.0 ? 3.14159 : 0.0)) * abs(farmGait) * 0.18;
    `);
  };
  animalMaterial.customProgramCacheKey = () => "anheli-animal-gait-v1";
  for (const type of ["sheep", "rabbit", "chicken"]) {
    const geometry = animalGeometry(type);
    resources.add(geometry);
    const animals = new THREE.InstancedMesh(geometry, animalMaterial, 24);
    animals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    animals.count = 0;
    animals.frustumCulled = false;
    animals.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 18), 110);
    animals.castShadow = true;
    animals.receiveShadow = true;
    animals.userData.farmAnimalType = type;
    dynamicRoot.add(animals);
    clickables.push(animals);
    animalMeshes.set(type, animals);
    animalLists.set(type, []);
  }
  for (const type of ["deer", "pheasant"]) {
    const geometry = animalGeometry(type);
    resources.add(geometry);
    const wildlife = new THREE.InstancedMesh(geometry, animalMaterial, 2);
    wildlife.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wildlife.castShadow = true;
    wildlife.frustumCulled = false;
    wildlife.boundingSphere = new THREE.Sphere(new THREE.Vector3(38, 1, -18), 12);
    wildlife.userData.wildlife = type;
    dynamicRoot.add(wildlife);
    clickables.push(wildlife);
    wildlifeMeshes.set(type, wildlife);
  }
  for (const type of ["grass", "carrot"]) {
    const geometry = cropGeometry(type);
    resources.add(geometry);
    const crops = new THREE.InstancedMesh(geometry, mat(0xffffff, { vertexColors: true, roughness: 1 }), 64);
    crops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    crops.count = 0;
    crops.frustumCulled = false;
    crops.castShadow = true;
    dynamicRoot.add(crops);
    cropMeshes.set(type, crops);
  }
  const careGeometry = coloredGeometry([
    { geometry: new THREE.IcosahedronGeometry(.22, 1), at: [-.12, .08, 0], size: [1, 1, .5], color: 0xdf9b93 },
    { geometry: new THREE.IcosahedronGeometry(.22, 1), at: [.12, .08, 0], size: [1, 1, .5], color: 0xdf9b93 },
    { geometry: new THREE.ConeGeometry(.27, .38, 4), at: [0, -.12, 0], rotate: [Math.PI, Math.PI / 4, 0], size: [1, 1, .4], color: 0xdf9b93 },
  ]);
  resources.add(careGeometry);
  const careHearts = new THREE.InstancedMesh(careGeometry, mat(0xffffff, { vertexColors: true }), 72);
  careHearts.count = 0;
  careHearts.frustumCulled = false;
  careHearts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dynamicRoot.add(careHearts);

  function syncCrops(now) {
    const counts = { grass: 0, carrot: 0 };
    for (const bed of farmState.beds || []) {
      const plot = plotVisuals.get(bed.plotId);
      if (!plot?.owned || !cropMeshes.has(bed.crop)) continue;
      const index = bed.id.endsWith("-2") ? 1 : 0;
      const point = plot.beds[index];
      const span = Math.max(1, bed.readyAt - bed.plantedAt);
      const growth = Math.max(.15, Math.min(1, (now - bed.plantedAt) / span));
      const cropMesh = cropMeshes.get(bed.crop);
      for (let item = 0; item < 6; item++) {
        dummy.position.set(point.x + (item % 2 - .5) * 1.1, .38, point.z + (Math.floor(item / 2) - 1) * 1.05);
        dummy.rotation.set(0, item * 1.7, 0);
        dummy.scale.setScalar(.4 + growth * .6);
        dummy.updateMatrix();
        cropMesh.setMatrixAt(counts[bed.crop]++, dummy.matrix);
      }
    }
    for (const [type, cropMesh] of cropMeshes) {
      cropMesh.count = counts[type];
      cropMesh.instanceMatrix.needsUpdate = true;
    }
    dummy.scale.setScalar(1);
  }

  function setState(next) {
    farmState = next && typeof next === "object" ? next : { plots: [], animals: [], beds: [] };
    const liveAnimals = new Set();
    for (const animal of farmState.animals || []) {
      liveAnimals.add(animal.id);
      const prior = animalCare.get(animal.id);
      if (prior && (animal.lastPettedAt > prior.lastPettedAt || animal.fedUntil > prior.fedUntil || animal.comfort > prior.comfort)) careEffects.set(animal.id, animationTime + 3.2);
      animalCare.set(animal.id, { lastPettedAt: animal.lastPettedAt, fedUntil: animal.fedUntil, comfort: animal.comfort });
    }
    for (const id of animalCare.keys()) if (!liveAnimals.has(id)) { animalCare.delete(id); careEffects.delete(id); }
    const signature = JSON.stringify({ plots: (farmState.plots || []).map(item => [item.id, item.owned]), animals: (farmState.animals || []).map(item => [item.id, item.type, item.plotId]), beds: farmState.beds });
    if (signature === visualSignature) return;
    visualSignature = signature;
    for (const [id, plot] of plotVisuals) {
      plot.owned = Boolean(farmState.plots?.find(item => item.id === id)?.owned);
      plot.field.material = mat(plot.owned ? 0xa2bd83 : 0x91a579);
      plot.sign.material.opacity = plot.owned ? 1 : .83;
    }
    for (const type of animalLists.keys()) {
      animalLists.set(type, (farmState.animals || []).filter(item => item.type === type && plotVisuals.get(item.plotId)?.owned).slice(0, 24));
      const instances = animalMeshes.get(type);
      instances.count = animalLists.get(type).length;
      animalLists.get(type).forEach((animal, index) => {
        const colorIndex = [...animal.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
        instances.setColorAt(index, new THREE.Color(type === "sheep" ? [0xffffff, 0xdce3e0, 0xf3dfd6][colorIndex] : 0xffffff));
      });
      if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
    }
    syncCrops(Date.now());
  }

  let cropClock = 0;
  function animate(dt, time, reducedMotion) {
    animationTime = time;
    gaitTime.value = reducedMotion ? 0 : time;
    animalPositions = [];
    let heartCount = 0;
    for (const [type, list] of animalLists) {
      const instances = animalMeshes.get(type);
      list.forEach((animal, index) => {
        const plot = plotVisuals.get(animal.plotId).definition;
        const seed = [...animal.id].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 17);
        const phase = (seed * 2.399963) % (Math.PI * 2);
        const angle = (reducedMotion ? 0 : time * .14) + phase;
        const x = plot.x + Math.cos(angle) * (3.8 + seed % 3 * .7);
        const z = plot.z + Math.sin(angle * 1.3) * (2.2 + seed % 2 * .5) + 1;
        const careRemaining = Math.max(0, (careEffects.get(animal.id) || 0) - time);
        const bounce = !reducedMotion && careRemaining > 0 ? Math.abs(Math.sin((3.2 - careRemaining) * 5)) * .3 : 0;
        dummy.position.set(x, .1 + bounce + (reducedMotion ? 0 : Math.abs(Math.sin(time * 3 + phase)) * (type === "rabbit" ? .12 : .025)), z);
        dummy.rotation.set(0, Math.atan2(-Math.sin(angle), Math.cos(angle * 1.3) * 1.3), 0);
        dummy.scale.setScalar(type === "sheep" ? 1.4 : type === "rabbit" ? 1.3 : 1.2);
        dummy.updateMatrix();
        instances.setMatrixAt(index, dummy.matrix);
        animalPositions.push({ id: animal.id, type, plotId: animal.plotId, x: +x.toFixed(2), z: +z.toFixed(2) });
        if (careRemaining > 0) {
          for (let heart = 0; heart < 3; heart++) {
            dummy.position.set(x + (heart - 1) * .55, (type === "sheep" ? 2.4 : 1.7) + (3.2 - careRemaining) * .38 + heart * .2, z);
            dummy.rotation.set(0, .65, 0);
            dummy.scale.setScalar(Math.min(1, careRemaining) * (.7 + heart * .15));
            dummy.updateMatrix();
            careHearts.setMatrixAt(heartCount++, dummy.matrix);
          }
        } else careEffects.delete(animal.id);
      });
      if (list.length) instances.instanceMatrix.needsUpdate = true;
    }
    careHearts.count = heartCount;
    careHearts.instanceMatrix.needsUpdate = true;
    for (const [type, instances] of wildlifeMeshes) {
      for (let index = 0; index < 2; index++) {
        const phase = (reducedMotion ? 0 : time * .09) + index * 2.8;
        const x = 39 + Math.sin(phase) * 2.6;
        const z = (type === "deer" ? -20 : -13) + Math.cos(phase * 1.3) * 2.1;
        dummy.position.set(x, .08, z);
        dummy.rotation.set(0, Math.atan2(Math.cos(phase), -Math.sin(phase * 1.3) * 1.3), 0);
        dummy.scale.setScalar(type === "deer" ? 1 : .85);
        dummy.updateMatrix();
        instances.setMatrixAt(index, dummy.matrix);
      }
      instances.instanceMatrix.needsUpdate = true;
    }
    dummy.scale.setScalar(1);
    cropClock += dt;
    if (cropClock > 1) { cropClock = 0; syncCrops(Date.now()); }
  }

  return {
    dynamicRoot,
    setState,
    animate,
    resolveAnimal(type, instanceId) { return animalLists.get(type)?.[instanceId]?.id; },
    getPlot(id) { return plotVisuals.get(id)?.definition; },
    getWorld() {
      return {
        bounds: { ...FARM_BOUNDS },
        plots: [...plotVisuals.values()].map(({ definition, owned }) => ({ ...definition, owned, entry: { x: definition.x - Math.sign(definition.x) * 4, z: definition.z } })),
        animals: animalPositions,
        ownedPlots: [...plotVisuals.values()].filter(plot => plot.owned).length,
        animalCount: [...animalLists.values()].reduce((count, list) => count + list.length, 0),
      };
    },
  };
}
