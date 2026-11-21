import { createSheepSpriteFactory } from '../../src/open-world/sheep-sprites.js';

const REACH = 2.35;
const REACTION_DURATION = 1.55;
const TAU = Math.PI * 2;
const SHEEP = [
  { id: 'mianmian', name: '绵绵', x: 6.15, z: 3.4, radiusX: 1.05, radiusZ: 0.8,
    size: 2.2, color: 0, hat: 'flower', tint: '#f5d39b', phase: 3.4, speed: 0.53 },
  { id: 'maimai', name: '麦麦', x: 8.35, z: 5.7, radiusX: 1.5, radiusZ: 1.05,
    size: 2.04, color: 1, hat: 'straw', tint: '#edbc9a', phase: 2.45, speed: 0.43 },
  { id: 'xiaoyun', name: '小云', x: 9.05, z: 2.85, radiusX: 1.15, radiusZ: 0.95,
    size: 1.86, color: 2, hat: 'scarf', tint: '#b6c79d', phase: 0.85, speed: 0.58 },
];

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function screenPoint(project, x, z, y = 0) {
  const point = project(x, z, y);
  return Array.isArray(point) ? { x: point[0], y: point[1] } : point;
}

function paintHeart(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y + size * .65);
  ctx.bezierCurveTo(x - size * 1.16, y - size * .02, x - size * .57, y - size * .87, x, y - size * .34);
  ctx.bezierCurveTo(x + size * .57, y - size * .87, x + size * 1.16, y - size * .02, x, y + size * .65);
  ctx.closePath();
  ctx.fill();
}

export function createAnimals(createCanvas) {
  const sprites = createSheepSpriteFactory(createCanvas);
  const tintedSprites = new WeakSet();

  // This factory is private to the yard. Tint each cached sprite once to match its light.
  function spriteFor(sheep) {
    const canvas = sprites.get(sheep);
    if (!tintedSprites.has(canvas)) {
      const spriteContext = canvas.getContext('2d');
      spriteContext.save();
      spriteContext.globalCompositeOperation = 'source-atop';
      spriteContext.globalAlpha = .1;
      spriteContext.fillStyle = sheep.tint;
      spriteContext.fillRect(0, 0, canvas.width, canvas.height);
      spriteContext.restore();
      tintedSprites.add(canvas);
    }
    return canvas;
  }
  const flock = SHEEP.map((sheep, variant) => ({
    ...sheep, variant, centerX: sheep.x, centerZ: sheep.z, timeOffset: 0,
    petAt: -Infinity, flip: false, step: 0, bounds: null,
  }));

  function update(time) {
    for (const sheep of flock) {
      if (time - sheep.petAt < REACTION_DURATION) continue;
      const movingTime = time - sheep.timeOffset;
      const phase = sheep.phase + sheep.speed * movingTime;
      const dx = sheep.radiusX * Math.cos(phase);
      const dz = -sheep.radiusZ * Math.sin(phase);
      sheep.x = sheep.centerX + sheep.radiusX * Math.sin(phase);
      sheep.z = sheep.centerZ + sheep.radiusZ * Math.cos(phase);
      sheep.flip = dx - .62 * dz < 0;
      sheep.step = Math.abs(Math.sin(movingTime * 6.5 + sheep.variant));
    }
  }

  function nearest(player) {
    let target = null;
    let closest = REACH;
    if (!player) return target;
    for (const sheep of flock) {
      const gap = distance(player, sheep);
      if (gap < closest) {
        closest = gap;
        target = sheep;
      }
    }
    return target;
  }

  function paintSheep(ctx, project, scale, time, sheep, selected) {
    const feet = screenPoint(project, sheep.x, sheep.z);
    const petTime = time - sheep.petAt;
    const reacting = petTime < REACTION_DURATION;
    const rise = reacting ? petTime / REACTION_DURATION : 0;
    const hop = reacting ? Math.max(0, Math.sin(petTime * 8)) * .16 * (1 - rise) : sheep.step * .028;
    const size = sheep.size * scale;
    const width = size * (1 + .012 * sheep.step);
    const height = size * (.995 + .02 * sheep.step);
    const x = feet.x - width * (sheep.flip ? .44 : .56);
    const y = feet.y - height * .982 - scale * hop;

    ctx.beginPath();
    ctx.ellipse(feet.x, feet.y + scale * .015, scale * .69, scale * .17, 0, 0, TAU);
    ctx.fillStyle = 'rgba(65,84,54,.08)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(feet.x, feet.y, scale * .49, scale * .105, 0, 0, TAU);
    ctx.fillStyle = 'rgba(62,69,46,.16)';
    ctx.fill();
    ctx.drawImage(spriteFor(sheep), x, y, width, height);

    sheep.bounds = {
      x: x + width * (sheep.flip ? .02 : .18), y: y + height * .24, w: width * .8, h: height * .75,
    };
    if (!reacting && !selected) return;

    ctx.save();
    const fontSize = Math.max(12, Math.min(15, Math.round(scale * .48)));
    const labelY = feet.y - size * .82;
    const labelWidth = fontSize * sheep.name.length + 14;
    ctx.beginPath();
    ctx.ellipse(feet.x, labelY, labelWidth * .51, (fontSize + 6) * .5, 0, 0, TAU);
    ctx.fillStyle = '#fffae9';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#d9cbb0';
    ctx.stroke();
    ctx.fillStyle = '#4e5c45';
    ctx.font = '600 ' + fontSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sheep.name, feet.x, labelY + 1);

    if (reacting) {
      const heartY = labelY - 17 - rise * scale * .53;
      ctx.globalAlpha *= Math.min(1, (1 - rise) * 2.8);
      ctx.fillStyle = '#cf7d70';
      paintHeart(ctx, feet.x, heartY, Math.max(5, scale * .29));
    }
    ctx.restore();
  }

  function drawEntries(ctx, project, scale, time, player) {
    update(time);
    const selected = nearest(player);
    return flock.map(sheep => ({
      z: sheep.z,
      paint: () => paintSheep(ctx, project, scale, time, sheep, sheep === selected),
    }));
  }

  function draw(ctx, project, scale, time, player) {
    for (const entry of drawEntries(ctx, project, scale, time, player).sort((a, b) => a.z - b.z)) {
      entry.paint();
    }
  }

  function hitTest(x, y) {
    let hit = null;
    for (const sheep of flock) {
      const rect = sheep.bounds;
      if (rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h &&
          (!hit || sheep.z > hit.z)) {
        hit = sheep;
      }
    }
    return hit?.id ?? null;
  }

  function interact(player, time, targetId) {
    update(time);
    const sheep = targetId ? flock.find(animal => animal.id === targetId) : nearest(player);
    if (!sheep || !player || distance(player, sheep) >= REACH) return null;
    if (time - sheep.petAt >= REACTION_DURATION) {
      sheep.petAt = time;
      sheep.timeOffset += REACTION_DURATION;
      sheep.flip = player.x - sheep.x - .62 * (player.z - sheep.z) < 0;
    }
    return { id: sheep.id, name: sheep.name, action: 'pet', message: sheep.name + '蹭了蹭你的手' };
  }

  function describe() {
    return flock.map(({ id, name, x, z, flip, petAt }) => ({
      id, name, x, z, flip, petAt: Number.isFinite(petAt) ? petAt : null,
    }));
  }

  return { update, draw, drawEntries, hitTest, interact, describe, dispose: () => sprites.dispose() };
}
