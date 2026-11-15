"use strict";

// 纠偏样板夜光配方（2026-11-16 按 Sansa 实测修正）：深蓝夜底 + 环境光只适度抬底保证辨路，
// 暖意交给场景里的灯点（石灯/集市/寺院/家门口，见 ruili-scene 的 setNightFactor），不把整夜拉成灰白。
// 正午/午后关键帧（9.0–16.5）一字未动。雨夜仍按下方雨天系数再压一档。
const SKY_KEYS = Object.freeze([
  [0.0, 0x22334c, 0x2a3f5c, 0.44, 0.2, 0x93a7cc, 1],
  [4.8, 0x22334c, 0x2a3f5c, 0.44, 0.2, 0x93a7cc, 1],
  [6.8, 0xd9c3a5, 0xe6d6ba, 0.58, 0.5, 0xffb27a, 0.3],
  [9.0, 0xc2dbee, 0xd6e5ee, 0.95, 0.9, 0xffe3b3, 0],
  [16.5, 0xc2dbee, 0xd6e5ee, 0.95, 0.9, 0xffe3b3, 0],
  [18.2, 0xe9b47e, 0xeccfa3, 0.62, 0.62, 0xff9a4d, 0.22],
  [19.6, 0x66799f, 0x7688ad, 0.47, 0.24, 0xb08cc9, 0.68],
  [21.2, 0x22334c, 0x2a3f5c, 0.44, 0.2, 0x93a7cc, 1],
  [24.0, 0x22334c, 0x2a3f5c, 0.44, 0.2, 0x93a7cc, 1],
].map(Object.freeze));
const WEATHER = Object.freeze({ seedMultiplier: 2654435761, rainBelow: 18, cloudyBelow: 48 });
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function lerpHex(a, b, fraction) {
  const red = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * fraction);
  const green = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * fraction);
  const blue = Math.round((a & 255) + ((b & 255) - (a & 255)) * fraction);
  return (red << 16) | (green << 8) | blue;
}

function skyLabel(hour) {
  if (hour < 4.8) return "夜里";
  if (hour < 6.8) return "清晨";
  if (hour < 11) return "上午";
  if (hour < 14) return "正午";
  if (hour < 16.5) return "午后";
  if (hour < 18.2) return "傍晚";
  if (hour < 19.6) return "黄昏";
  if (hour < 21.2) return "暮色";
  return "夜里";
}

function computeSky(nowMs) {
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) throw new TypeError("A finite epoch timestamp is required");
  const date = new Date(nowMs + SHANGHAI_OFFSET_MS);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999) throw new TypeError("Sky timestamp is outside the supported calendar");
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60;
  const seed = year * 372 + (date.getUTCMonth() + 1) * 31 + date.getUTCDate();
  // Reduce before multiplication to preserve the intended modulo on all supported years.
  const sample = (seed % 100) * (WEATHER.seedMultiplier % 100) % 100;
  const weather = sample < WEATHER.rainBelow ? "rain" : sample < WEATHER.cloudyBelow ? "cloudy" : "sunny";
  let before = SKY_KEYS[0], after = SKY_KEYS[1];
  for (let index = 0; index < SKY_KEYS.length - 1; index += 1) {
    if (hour >= SKY_KEYS[index][0] && hour <= SKY_KEYS[index + 1][0]) {
      before = SKY_KEYS[index]; after = SKY_KEYS[index + 1]; break;
    }
  }
  const fraction = (hour - before[0]) / (after[0] - before[0]);
  let bg = lerpHex(before[1], after[1], fraction);
  let fog = lerpHex(before[2], after[2], fraction);
  let hemi = before[3] + (after[3] - before[3]) * fraction;
  let sun = before[4] + (after[4] - before[4]) * fraction;
  const sunColor = lerpHex(before[5], after[5], fraction);
  const night = before[6] + (after[6] - before[6]) * fraction;
  let label = skyLabel(hour);
  if (weather === "rain") {
    sun *= 0.55; hemi *= 0.82;
    bg = lerpHex(bg, 0x8fa3b0, 0.32); fog = lerpHex(fog, 0x93a8b5, 0.32);
    label += " · 细雨";
  } else if (weather === "cloudy") {
    sun *= 0.78;
    label += " · 多云";
  }
  return { label, bg, fog, hemi, sun, sunColor, night, rain: weather === "rain", weather };
}

module.exports = { SKY_KEYS, WEATHER, computeSky };
