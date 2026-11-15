// Muse canvas interface, adapted to the host clock, storage contract and safe area.
(function (global, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./daily-state.cjs"));
  else global.AnheliUI = factory(global.AnheliDaily);
})(typeof self !== "undefined" ? self : this, function (Daily) {
  "use strict";

  const CREAM = "rgba(246,241,224,0.97)";
  const BORDER = "#cbbd93";
  const INK = "#5a5344";
  const FAINT = "#8a8071";
  const ACCENT = "#a8874f";
  const GREEN = "#7a9a5c";
  const DISABLED = "#b9b09a";

  // Keep fractional rewards visible without rounding the stored balance.
  const formatCoins = value => String(value);

  function createCanvasUI(opts) {
    const canvas = opts.canvas;
    const state = opts.state;
    const save = opts.save || (() => ({ ok: true }));
    const today = opts.today || (() => new Date().toLocaleDateString("sv-SE"));
    const now = opts.now || Date.now;
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, DPR = 1;
    let safe = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    let panelOpen = false, sceneName = "", dirty = true;
    let basketText = "";
    let mapFeatures = null, mapPlayer = null, mapOpen = false, mapGesture = null;
    const mapLayouts = new Map();
    let teleportItems = null, teleportCallback = null, extraRow = null;
    let worldRows = [];
    let albumRowText = "", albumLines = null, albumPage = 0, albumPages = [];
    let albumDetail = null, detailPage = 0, detailPages = 1;
    let hallPage = 0, hallPages = 1;
    let toastMsg = "", toastUntil = 0, breathStart = null;
    let btns = [];
    let joyVisible = false, actionLabel = "", actionFn = null;
    const joy = { active: false, dx: 0, dy: 0 };

    function toast(msg) {
      toastMsg = String(msg || "");
      toastUntil = now() + 2600;
      dirty = true;
    }
    function saveResult(result) {
      if (result.ok) {
        try {
          const saved = save();
          if (!saved || saved.ok !== true) {
            toast("本机保存失败，请重试");
            return false;
          }
        } catch (_) {
          toast("本机保存失败，请重试");
          return false;
        }
      }
      if (result.msg) toast(result.msg);
      return result.ok;
    }
    function resize(w, h, dpr, viewport) {
      W = Math.max(1, Number(w) || 1);
      H = Math.max(1, Number(h) || 1);
      DPR = Math.max(1, Number(dpr) || 1);
      const insets = viewport || {};
      const inset = (value, limit) => Math.min(limit, Math.max(0, Number(value) || 0));
      const left = inset(insets.safeLeft, W / 3);
      const right = W - inset(insets.safeRight, W / 3);
      const top = inset(insets.safeTop, H / 3);
      const bottom = H - inset(insets.safeBottom, H / 3);
      safe = { left, top, right, bottom, width: right - left, height: bottom - top };
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      joystickEnd();
      cancelMinimapInput();
      btns = [];
      dirty = true;
    }
    function rr(x, y, w, h, radius) {
      const r = Math.max(0, Math.min(radius, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function text(str, x, y, font, color, align) {
      ctx.font = font;
      ctx.fillStyle = color;
      ctx.textAlign = align || "left";
      ctx.textBaseline = "middle";
      ctx.fillText(str, x, y);
    }
    function fitText(str, width, font) {
      ctx.font = font;
      const value = String(str);
      if (ctx.measureText(value).width <= width) return value;
      const chars = Array.from(value);
      while (chars.length && ctx.measureText(chars.join("") + "…").width > width) chars.pop();
      return chars.length ? chars.join("") + "…" : "";
    }
    function wrapText(str, width, font) {
      ctx.font = font;
      const lines = [];
      for (const paragraph of String(str).split("\n")) {
        let line = "";
        for (const char of paragraph) {
          if (line && ctx.measureText(line + char).width > width) {
            lines.push(line);
            line = char;
          } else line += char;
        }
        lines.push(line);
      }
      return lines;
    }
    function addBtn(id, x, y, w, h, enabled) {
      btns.push({ id, x, y, w, h, enabled: !!enabled });
    }
    function controls() {
      const hallW = Math.min(126, safe.width - 24);
      const hall = { x: safe.right - hallW - 12, y: safe.bottom - 58, w: hallW, h: 46 };
      const radius = Math.min(50, Math.max(24, (safe.width - hallW - 48) / 2));
      return {
        hall,
        action: { x: hall.x, y: hall.y - 58, w: hallW, h: 48 },
        joystick: { x: safe.left + 12 + radius, y: safe.bottom - 86, radius },
      };
    }
    const mapPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.z);
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const inside = (point, frame) => point && point.x >= frame.x && point.x <= frame.x + frame.w && point.y >= frame.y && point.y <= frame.y + frame.h;
    const touchPoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);
    function minimapArea() {
      const layout = controls(), top = safe.top + 54;
      const bottom = Math.min(layout.action.y, joyVisible ? layout.joystick.y - layout.joystick.radius : layout.action.y) - 12;
      return { x: safe.left + 12, y: top, w: Math.max(1, safe.width - 24), h: bottom - top };
    }
    function fitMinimap(frame) {
      const area = minimapArea();
      const w = clamp(frame.w, Math.min(116, area.w), area.w);
      const h = clamp(frame.h, Math.min(96, area.h), area.h);
      return { x: clamp(frame.x, area.x, area.x + area.w - w), y: clamp(frame.y, area.y, area.y + area.h - h), w, h };
    }
    function rememberMinimap(frame) {
      const area = minimapArea(), fitted = fitMinimap(frame);
      mapLayouts.set(mapFeatures.villageId || "default", {
        w: fitted.w, h: fitted.h,
        horizontal: area.w > fitted.w ? (fitted.x - area.x) / (area.w - fitted.w) : 0.5,
        vertical: area.h > fitted.h ? (fitted.y - area.y) / (area.h - fitted.h) : 0.5,
      });
      dirty = true;
    }
    function minimapFrame() {
      if (!mapFeatures || panelOpen || teleportItems || albumLines) return null;
      if (mapOpen) {
        const w = Math.min(580, safe.width - 24), h = Math.min(520, safe.height - 24);
        return { x: safe.left + (safe.width - w) / 2, y: safe.top + (safe.height - h) / 2, w, h };
      }
      const area = minimapArea();
      if (area.h < 72) return null;
      const saved = mapLayouts.get(mapFeatures.villageId || "default");
      if (saved) {
        const w = clamp(saved.w, Math.min(116, area.w), area.w);
        const h = clamp(saved.h, Math.min(96, area.h), area.h);
        return { x: area.x + (area.w - w) * saved.horizontal, y: area.y + (area.h - h) * saved.vertical, w, h };
      }
      const w = Math.min(176, Math.max(116, Math.floor((safe.width - 36) / 2)));
      return { x: safe.right - w - 12, y: area.y, w, h: Math.min(176, area.h) };
    }
    function minimapResizeHandle(frame) {
      return { x: frame.x + frame.w - 36, y: frame.y + frame.h - 36, w: 36, h: 36 };
    }
    function cancelMinimapInput() { mapGesture = null; }
    function beginMinimapPinch(gesture, touches) {
      const points = gesture.ids.map(id => touches.find(point => point.id === id)).filter(Boolean);
      if (points.length < 2) return;
      const [a, b] = points;
      gesture.pinch = {
        ids: [a.id, b.id], frame: minimapFrame(),
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y),
      };
      gesture.multiple = true;
      gesture.moved = true;
    }
    function handleMinimapInput(event) {
      const touches = (event.touches || []).filter(touchPoint), changed = (event.changedTouches || []).filter(touchPoint);
      if (event.type === "cancel") {
        const captured = !!mapGesture;
        cancelMinimapInput();
        return captured;
      }
      if (!mapGesture) {
        const frame = !mapOpen && minimapFrame();
        if (event.type !== "start" || !frame) return false;
        const point = changed.find(value => inside(value, frame));
        if (!point) return false;
        joystickEnd();
        mapGesture = {
          ids: [point.id], pointerId: point.id, start: { x: point.x, y: point.y }, frame,
          resize: inside(point, minimapResizeHandle(frame)), moved: false, multiple: false, time: now(), pinch: null,
        };
        for (const value of touches) if (value.id !== point.id && inside(value, frame)) mapGesture.ids.push(value.id);
        beginMinimapPinch(mapGesture, touches);
        return true;
      }
      const gesture = mapGesture;
      if (event.type === "start") {
        const frame = minimapFrame();
        if (touches.length > 1) { gesture.multiple = true; gesture.tap = false; }
        for (const point of changed) if (inside(point, frame) && !gesture.ids.includes(point.id)) gesture.ids.push(point.id);
        beginMinimapPinch(gesture, touches);
      } else if (event.type === "move") {
        if (gesture.pinch) {
          const points = gesture.pinch.ids.map(id => touches.find(point => point.id === id));
          if (points.every(Boolean)) {
            const [a, b] = points, initial = gesture.pinch, area = minimapArea();
            const minScale = Math.max(Math.min(116, area.w) / initial.frame.w, Math.min(96, area.h) / initial.frame.h);
            const maxScale = Math.min(area.w / initial.frame.w, area.h / initial.frame.h);
            const scale = clamp(initial.distance >= 1 ? Math.hypot(a.x - b.x, a.y - b.y) / initial.distance : 1, minScale, maxScale);
            const w = initial.frame.w * scale, h = initial.frame.h * scale;
            rememberMinimap({
              x: initial.frame.x + initial.frame.w / 2 + (a.x + b.x) / 2 - initial.x - w / 2,
              y: initial.frame.y + initial.frame.h / 2 + (a.y + b.y) / 2 - initial.y - h / 2, w, h,
            });
          }
        } else {
          const point = touches.find(value => value.id === gesture.pointerId);
          if (point) {
            const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y;
            gesture.moved ||= Math.hypot(dx, dy) > 6;
            if (gesture.moved) rememberMinimap(gesture.resize
              ? { ...gesture.frame, w: gesture.frame.w + dx, h: gesture.frame.h + dy }
              : { ...gesture.frame, x: gesture.frame.x + dx, y: gesture.frame.y + dy });
          }
        }
      } else if (event.type === "end") {
        const point = changed.find(value => value.id === gesture.pointerId);
        if (point && !gesture.moved && !gesture.multiple && !gesture.resize) {
          gesture.tap = Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) <= 8
            && now() - gesture.time < 500 && inside(point, minimapFrame());
        }
        if (!touches.length) {
          mapGesture = null;
          if (gesture.tap) { mapOpen = true; dirty = true; }
        } else if (gesture.pinch) {
          const remaining = touches.filter(value => gesture.ids.includes(value.id));
          if (remaining.length < 2) {
            gesture.pinch = null;
            if (remaining.length) {
              gesture.pointerId = remaining[0].id;
              gesture.start = { x: remaining[0].x, y: remaining[0].y };
              gesture.frame = minimapFrame();
              gesture.resize = false;
            }
          }
        }
      }
      return true;
    }
    function statusSpace(top, height) {
      const map = minimapFrame();
      const full = { x: safe.left + 12, w: safe.width - 24 };
      if (!map || mapOpen || top >= map.y + map.h || top + height <= map.y) return full;
      const left = { x: full.x, w: Math.max(0, map.x - 8 - full.x) };
      const right = { x: map.x + map.w + 8, w: Math.max(0, safe.right - 12 - map.x - map.w - 8) };
      return left.w >= right.w ? left : right;
    }
    function minimapGeometry() {
      const frame = minimapFrame();
      if (!frame) return null;
      const content = { x: frame.x + 8, y: frame.y + (mapOpen ? 48 : 28), w: frame.w - 16, h: frame.h - (mapOpen ? 76 : 36) };
      const points = [...mapFeatures.boundsPolygon];
      for (const road of mapFeatures.roads || []) points.push(...road.points.filter(mapPoint));
      for (const exit of mapFeatures.exits || []) {
        if (mapPoint(exit.from)) points.push(exit.from);
        if (mapPoint(exit.to)) points.push(exit.to);
      }
      for (const point of [mapFeatures.market, mapFeatures.hall, mapFeatures.pagoda?.center]) if (mapPoint(point)) points.push(point);
      const xs = points.map(point => point.x), zs = points.map(point => point.z);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
      const scale = Math.min(Math.max(1, content.w - 24) / Math.max(1, maxX - minX), Math.max(1, content.h - 24) / Math.max(1, maxZ - minZ));
      const cx = content.x + content.w / 2, cy = content.y + content.h / 2;
      const project = point => ({ x: cx + (point.x - (minX + maxX) / 2) * scale, y: cy + (point.z - (minZ + maxZ) / 2) * scale });
      const plots = (mapFeatures.plots || []).filter(plot => mapPoint(plot) && Number.isFinite(plot.w) && Number.isFinite(plot.d)).map((plot, index) => {
        const center = project(plot);
        return { id: plot.id, label: String.fromCharCode(65 + index), reserved: !!plot.reserved, x: center.x - plot.w * scale / 2, y: center.y - plot.d * scale / 2, w: plot.w * scale, h: plot.d * scale };
      });
      const landmarks = [];
      for (const [kind, point, name] of [["hall", mapFeatures.hall, "大厅"], ["market", mapFeatures.market, "集市"], ["pagoda", mapFeatures.pagoda?.center, mapOpen ? "姐勒金塔" : "金塔"]]) {
        if (mapPoint(point)) landmarks.push({ kind, name, ...project(point) });
      }
      const exits = (mapFeatures.exits || []).filter(exit => mapPoint(exit.from) && mapPoint(exit.to)).map(exit => ({ id: exit.id, name: exit.name, from: project(exit.from), to: project(exit.to) }));
      let player = null;
      if (mapPlayer) {
        const position = project(mapPlayer.position);
        const ahead = project({ x: mapPlayer.position.x + mapPlayer.forward.x, z: mapPlayer.position.z + mapPlayer.forward.z });
        const length = Math.hypot(ahead.x - position.x, ahead.y - position.y) || 1;
        const direction = { x: (ahead.x - position.x) / length, y: (ahead.y - position.y) / length };
        const x = clamp(position.x, content.x + 9, content.x + content.w - 9);
        const y = clamp(position.y, content.y + 9, content.y + content.h - 9);
        const triangle = [
          { x: x + direction.x * 7, y: y + direction.y * 7 },
          { x: x - direction.x * 4 - direction.y * 4, y: y - direction.y * 4 + direction.x * 4 },
          { x: x - direction.x * 4 + direction.y * 4, y: y - direction.y * 4 - direction.x * 4 },
        ];
        player = { x, y, direction, triangle, outside: x !== position.x || y !== position.y };
      }
      return {
        ...frame, expanded: mapOpen, content, scale, plots, landmarks, exits, player,
        resizeHandle: mapOpen ? null : minimapResizeHandle(frame),
        bounds: mapFeatures.boundsPolygon.map(project),
        commons: mapFeatures.commons ? [
          project({ x: mapFeatures.commons.minX, z: mapFeatures.commons.minZ }),
          project({ x: mapFeatures.commons.maxX, z: mapFeatures.commons.maxZ }),
        ] : null,
        roads: (mapFeatures.roads || []).map(road => ({ points: road.points.filter(mapPoint).map(project), width: road.width * scale })),
        commonPoint: mapPoint(mapFeatures.commonPoint) ? project(mapFeatures.commonPoint) : null,
      };
    }
    function path(points, close) {
      if (!points.length) return;
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
      if (close) ctx.closePath();
    }
    function drawMinimap() {
      const map = minimapGeometry();
      if (!map) return;
      if (map.expanded) {
        btns = [];
        ctx.fillStyle = "rgba(28,38,32,0.45)"; ctx.fillRect(0, 0, W, H);
      }
      rr(map.x, map.y, map.w, map.h, 8);
      ctx.fillStyle = "rgba(244,248,239,0.96)"; ctx.fill();
      ctx.strokeStyle = "#899d81"; ctx.lineWidth = 1; ctx.stroke();
      text(map.expanded ? "瑞丽江畔 · 村落地图" : "瑞丽坝", map.x + 10, map.y + (map.expanded ? 22 : 14), (map.expanded ? "bold 16px" : "bold 11px") + " sans-serif", "#35584c");
      if (map.expanded) {
        addBtn("minimap-panel", map.x, map.y, map.w, map.h, true);
        text("×", map.x + map.w - 26, map.y + 22, "22px sans-serif", INK, "center");
        addBtn("minimap-close", map.x + map.w - 44, map.y + 6, 36, 36, true);
        text("北 ↑", map.content.x + map.content.w - 4, map.content.y + 6, "11px sans-serif", "#35584c", "right");
        text("A/B 样板 · C-H 预留", map.x + map.w / 2, map.y + map.h - 14, "12px sans-serif", FAINT, "center");
      } else {
        text("北 ↑", map.x + map.w - 9, map.y + 14, "10px sans-serif", "#35584c", "right");
        addBtn("minimap", map.x, map.y, map.w, map.h, true);
      }
      path(map.bounds, true);
      ctx.fillStyle = "#e5ecd9"; ctx.fill();
      ctx.strokeStyle = "#a7b495"; ctx.lineWidth = 1; ctx.stroke();
      if (map.commons) {
        const [a, b] = map.commons;
        ctx.fillStyle = "#cee0bd"; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      }
      for (const road of map.roads) {
        path(road.points);
        ctx.strokeStyle = "#bbad88"; ctx.lineWidth = Math.max(2, road.width); ctx.stroke();
      }
      for (const plot of map.plots) {
        rr(plot.x, plot.y, plot.w, plot.h, 1);
        ctx.fillStyle = plot.reserved ? "#d0d6ca" : "#73a68c"; ctx.fill();
        ctx.strokeStyle = plot.reserved ? "#a4ada0" : "#436f59"; ctx.lineWidth = 0.8; ctx.stroke();
        if (plot.w >= 9 && plot.h >= 10) text(plot.label, plot.x + plot.w / 2, plot.y + plot.h / 2, (map.expanded ? "11px" : "8px") + " sans-serif", plot.reserved ? "#56614f" : "#ffffff", "center");
      }
      if (map.commonPoint) {
        ctx.beginPath(); ctx.arc(map.commonPoint.x, map.commonPoint.y, map.expanded ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = "#4e8ca2"; ctx.fill();
      }
      const font = (map.expanded ? "12px" : "9px") + " sans-serif";
      const label = (value, x, y, align = "left") => {
        if (!map.expanded && map.h < 128) return;
        ctx.font = font;
        const width = ctx.measureText(value).width;
        const offset = align === "right" ? width : align === "center" ? width / 2 : 0;
        const left = clamp(x - offset, map.x + 5, map.x + map.w - width - 5);
        text(value, left, clamp(y, map.content.y + 5, map.y + map.h - (map.expanded ? 32 : 7)), font, "#35584c");
      };
      for (const landmark of map.landmarks) {
        if (landmark.kind === "pagoda") {
          path([{ x: landmark.x, y: landmark.y - 5 }, { x: landmark.x - 4, y: landmark.y + 3 }, { x: landmark.x + 4, y: landmark.y + 3 }], true);
          ctx.fillStyle = "#b18a34"; ctx.fill();
          label(landmark.name, landmark.x - 7, landmark.y - 6, "right");
        } else if (landmark.kind === "hall") {
          ctx.fillStyle = "#71688a"; ctx.fillRect(landmark.x - 3, landmark.y - 3, 6, 6);
          label(landmark.name, landmark.x - 5, landmark.y - 9, "right");
        } else {
          ctx.beginPath(); ctx.arc(landmark.x, landmark.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = "#b66b58"; ctx.fill();
          label(landmark.name, landmark.x + 5, landmark.y + 21);
        }
      }
      for (const exit of map.exits) {
        const dx = exit.to.x - exit.from.x, dy = exit.to.y - exit.from.y, length = Math.hypot(dx, dy) || 1;
        const ux = dx / length, uy = dy / length;
        path([
          { x: exit.to.x - ux * 5 - uy * 3, y: exit.to.y - uy * 5 + ux * 3 },
          exit.to,
          { x: exit.to.x - ux * 5 + uy * 3, y: exit.to.y - uy * 5 - ux * 3 },
        ]);
        ctx.strokeStyle = "#6f7e54"; ctx.lineWidth = 1.5; ctx.stroke();
        label(exit.name, exit.to.x + (ux < 0 ? 2 : -2), exit.to.y + (ux < 0 ? 13 : -13), ux < 0 ? "left" : "right");
      }
      if (map.player) {
        ctx.beginPath(); ctx.arc(map.player.x, map.player.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.fill();
        path(map.player.triangle, true);
        ctx.fillStyle = "#d45d45"; ctx.fill();
        ctx.strokeStyle = "#8b392d"; ctx.lineWidth = 0.8; ctx.stroke();
      }
      if (!map.expanded) {
        ctx.strokeStyle = "#5d7867"; ctx.lineWidth = 1.5;
        for (const offset of [7, 12, 17]) {
          path([
            { x: map.x + map.w - offset, y: map.y + map.h - 5 },
            { x: map.x + map.w - 5, y: map.y + map.h - offset },
          ]);
          ctx.stroke();
        }
      }
    }
    function drawRow(x, y, w, h, id, label, right, enabled, accent) {
      rr(x, y, w, h, 10);
      ctx.fillStyle = enabled ? "#fffdf4" : "rgba(255,253,244,0.55)";
      ctx.fill();
      ctx.strokeStyle = BORDER; ctx.lineWidth = 1; ctx.stroke();
      const labelFont = "14px sans-serif", rightFont = "12px sans-serif";
      ctx.font = labelFont;
      const labelW = ctx.measureText(label).width;
      ctx.font = rightFont;
      const rightW = ctx.measureText(right).width;
      const stacked = labelW + rightW + 36 > w && h >= 38;
      const labelLimit = stacked ? w - 24 : Math.max(0, w - rightW - 36);
      text(fitText(label, labelLimit, labelFont), x + 12, y + (stacked ? h / 2 - 8 : h / 2), labelFont, enabled ? INK : FAINT);
      text(fitText(right, w - 24, rightFont), x + w - 12, y + (stacked ? h / 2 + 9 : h / 2), rightFont, enabled ? (accent ? ACCENT : FAINT) : DISABLED, "right");
      addBtn(id, x, y, w, h, enabled);
    }
    function drawPanel(day) {
      ctx.fillStyle = "rgba(28,38,32,0.38)";
      ctx.fillRect(0, 0, W, H);
      const pw = Math.min(448, safe.width - 24);
      const q = state.quests;
      const mark = value => value ? "✓" : "—";
      const footer = "喂动物 " + mark(q.fed) + " · 收获 " + mark(q.harvest) + " · 静心 " + mark(q.jingxin) + "（去牧场摸摸动物、收一畦菜）";
      const lines = wrapText(footer, pw - 36, "12px sans-serif");
      const rows = worldRows.length + 3 + (state.home ? 1 : 0) + (albumRowText ? 1 : 0) + (extraRow ? 1 : 0);
      const footerH = lines.length * 16 + 8;
      const ph = Math.min(82 + rows * 48 + (rows - 1) * 8 + footerH + 14, safe.height - 24);
      const available = ph - 82 - footerH - 14;
      const paginated = (available - (rows - 1) * 8) / rows < 38;
      const pageSize = paginated ? Math.max(1, Math.floor((available - 38 + 8) / 46)) : rows;
      hallPages = Math.max(1, Math.ceil(rows / pageSize));
      hallPage = Math.min(hallPage, hallPages - 1);
      const visibleCount = Math.min(pageSize, rows - hallPage * pageSize);
      const rowH = Math.min(48, (available - (paginated ? 38 : 0) - (visibleCount - 1) * 8) / visibleCount);
      const px = safe.left + (safe.width - pw) / 2;
      const py = safe.top + (safe.height - ph) / 2;
      rr(px, py, pw, ph, 16);
      ctx.fillStyle = CREAM; ctx.fill();
      ctx.strokeStyle = BORDER; ctx.lineWidth = 1.5; ctx.stroke();
      addBtn("panel", px, py, pw, ph, true);
      text("安和里大厅", px + 18, py + 28, "bold 19px sans-serif", "#7a5c1e");
      rr(px + pw - 48, py + 10, 36, 36, 10);
      ctx.fillStyle = "#fffdf4"; ctx.fill();
      ctx.strokeStyle = BORDER; ctx.lineWidth = 1; ctx.stroke();
      text("×", px + pw - 30, py + 28, "19px sans-serif", INK, "center");
      addBtn("close", px + pw - 48, py + 10, 36, 36, true);
      text(fitText("安币 " + formatCoins(state.coins) + " · 本月签到 " + state.signin.days.length + " 天", pw - 36, "13px sans-serif"), px + 18, py + 62, "13px sans-serif", FAINT);

      if (breathStart !== null) {
        const progress = Math.min(1, Math.max(0, now() - breathStart) / Daily.ECONOMY.meditationMilliseconds);
        const centerY = py + 82 + (ph - 82) / 2 - 15;
        const radius = Math.min(49, (ph - 120) / 2) * (0.74 + 0.26 * Math.sin(progress * Math.PI * 2 - Math.PI / 2));
        ctx.beginPath(); ctx.arc(px + pw / 2, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(151,178,124,0.35)"; ctx.fill();
        ctx.strokeStyle = GREEN; ctx.lineWidth = 2; ctx.stroke();
        text("跟着呼吸", px + pw / 2, centerY, "15px sans-serif", "#47603c", "center");
        text("把心放下来 · 静坐中", px + pw / 2, py + ph - 24, "13px sans-serif", FAINT, "center");
        return;
      }

      const rx = px + 18, rw = pw - 36;
      let ry = py + 82;
      const jDone = state.jingxinDate === day;
      const sDone = state.signin.last === day;
      const doneN = [q.fed, q.harvest, q.jingxin].filter(Boolean).length;
      const claimable = Daily.questAllDone(state) && !q.claimed;
      const entries = [
        ...worldRows.map(row => [row.id, row.label, row.right, row.enabled, row.enabled]),
        ["jingxin", "静坐片刻 · 净心", jDone ? "今日已静心 ✓" : "开始", !jDone, false],
        ["signin", "每日签到", sDone ? "已签 · 本月 " + state.signin.days.length + " 天" : "+5 安币", !sDone, !sDone],
        ["quest", "每日小确幸", q.claimed ? "今日已领" : claimable ? "领取 40 安币" : doneN + " / 3", claimable || !q.claimed, claimable],
      ];
      if (state.home) entries.push(["go-home", "我的家园 · " + (state.home.label || ""), "回家", true, true]);
      if (albumRowText) entries.push(["album", "我的图鉴", albumRowText, true, false]);
      if (extraRow) entries.push([extraRow.id, extraRow.label, extraRow.right, extraRow.enabled, extraRow.enabled]);
      for (const entry of entries.slice(hallPage * pageSize, (hallPage + 1) * pageSize)) {
        drawRow(rx, ry, rw, rowH, ...entry);
        ry += rowH + 8;
      }
      if (paginated) {
        drawPager("hall", rx, ry, rw, hallPage, hallPages);
        ry += 38;
      }
      ry += 8;
      lines.forEach((line, index) => text(line, rx, ry + index * 16, "12px sans-serif", FAINT));
    }
    function drawPager(id, x, y, width, page, pages) {
      for (const [suffix, label, bx, enabled] of [["prev", "‹", x, page > 0], ["next", "›", x + width - 36, page + 1 < pages]]) {
        rr(bx, y, 36, 32, 8); ctx.fillStyle = "#fffdf4"; ctx.fill();
        text(label, bx + 18, y + 15, "22px sans-serif", enabled ? INK : DISABLED, "center");
        addBtn(id + "-" + suffix, bx, y, 36, 32, enabled);
      }
      text((page + 1) + " / " + pages, x + width / 2, y + 16, "12px sans-serif", FAINT, "center");
    }
    function drawAlbum() {
      if (albumDetail) { drawAlbumDetail(); return; }
      btns = [];
      ctx.fillStyle = "rgba(28,38,32,0.45)"; ctx.fillRect(0, 0, W, H);
      const width = Math.min(580, safe.width - 24), height = Math.min(560, safe.height - 24);
      const x = safe.left + (safe.width - width) / 2, y = safe.top + (safe.height - height) / 2;
      const contentWidth = width - 36, contentHeight = height - 106;
      const columns = contentWidth >= 420 ? 2 : 1;
      const cellWidth = (contentWidth - (columns - 1) * 16) / columns;
      const rows = [];
      let pending = [];
      const flush = () => { if (pending.length) { rows.push({ type: "items", entries: pending, height: Math.max(...pending.map(item => item.height)) }); pending = []; } };
      for (const line of albumLines) {
        if (line.type === "group") {
          flush(); rows.push({ type: "group", text: line.text, height: 30 });
        } else {
          const names = wrapText(line.name, cellWidth - 20, "13.5px sans-serif");
          const hints = !line.got && line.hint ? wrapText(line.hint, cellWidth - 20, "11px sans-serif") : [];
          pending.push({ ...line, names, hints, height: Math.max(line.got && line.note ? 36 : 0, names.length * 17 + hints.length * 15 + 10) });
          if (pending.length === columns) flush();
        }
      }
      flush();
      albumPages = [[]];
      let used = 0;
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const keepNext = row.type === "group" && rows[index + 1] ? rows[index + 1].height : 0;
        if (used && used + row.height + keepNext > contentHeight) { albumPages.push([]); used = 0; }
        albumPages[albumPages.length - 1].push(row); used += row.height;
      }
      albumPage = Math.min(albumPage, albumPages.length - 1);
      rr(x, y, width, height, 16); ctx.fillStyle = CREAM; ctx.fill();
      ctx.strokeStyle = BORDER; ctx.lineWidth = 1.5; ctx.stroke();
      addBtn("album-panel", x, y, width, height, true);
      text("我的图鉴", x + 18, y + 28, "bold 18px sans-serif", "#7a5c1e");
      rr(x + width - 48, y + 10, 36, 36, 10); ctx.fillStyle = "#fffdf4"; ctx.fill();
      text("×", x + width - 30, y + 28, "19px sans-serif", INK, "center");
      addBtn("album-close", x + width - 48, y + 10, 36, 36, true);
      let cy = y + 58;
      for (const row of albumPages[albumPage]) {
        if (row.type === "group") text(fitText(row.text, contentWidth, "bold 13.5px sans-serif"), x + 18, cy + 12, "bold 13.5px sans-serif", "#7a5c1e");
        else row.entries.forEach((item, column) => {
          const cx = x + 18 + column * (cellWidth + 16);
          text(item.got ? "✓" : "·", cx, cy + 8, "13px sans-serif", item.got ? ACCENT : FAINT);
          item.names.forEach((line, index) => text(line, cx + 20, cy + 8 + index * 17, "13.5px sans-serif", item.got ? INK : FAINT));
          item.hints.forEach((line, index) => text(line, cx + 20, cy + 8 + item.names.length * 17 + index * 15, "11px sans-serif", FAINT));
          if (item.got && item.note) addBtn("al:" + item.index, cx, cy - 2, cellWidth, item.height, true);
        });
        cy += row.height;
      }
      drawPager("album", x + 18, y + height - 40, contentWidth, albumPage, albumPages.length);
    }
    function drawAlbumDetail() {
      btns = [];
      ctx.fillStyle = "rgba(28,38,32,0.45)"; ctx.fillRect(0, 0, W, H);
      const width = Math.min(520, safe.width - 24), height = Math.min(460, safe.height - 24);
      const x = safe.left + (safe.width - width) / 2, y = safe.top + (safe.height - height) / 2;
      const lines = wrapText(albumDetail.note, width - 48, "14px sans-serif");
      const pageSize = Math.max(1, Math.floor((height - 138) / 24));
      detailPages = Math.max(1, Math.ceil(lines.length / pageSize));
      detailPage = Math.min(detailPage, detailPages - 1);
      rr(x, y, width, height, 16); ctx.fillStyle = CREAM; ctx.fill();
      ctx.strokeStyle = BORDER; ctx.lineWidth = 1.5; ctx.stroke();
      addBtn("album-panel", x, y, width, height, true);
      for (const [id, label, left] of [["album-back", "‹", x + 12], ["album-close", "×", x + width - 48]]) {
        rr(left, y + 10, 36, 36, 10); ctx.fillStyle = "#fffdf4"; ctx.fill();
        text(label, left + 18, y + 28, "22px sans-serif", INK, "center");
        addBtn(id, left, y + 10, 36, 36, true);
      }
      text(fitText(albumDetail.name, width - 132, "bold 17px sans-serif"), x + width / 2, y + 28, "bold 17px sans-serif", "#7a5c1e", "center");
      text("已收录 · 手记", x + 24, y + 60, "12px sans-serif", ACCENT);
      lines.slice(detailPage * pageSize, (detailPage + 1) * pageSize).forEach((line, index) => text(line, x + 24, y + 88 + index * 24, "14px sans-serif", INK));
      drawPager("album-detail", x + 24, y + height - 42, width - 48, detailPage, detailPages);
    }
    function drawTeleport() {
      btns = [];
      ctx.fillStyle = "rgba(28,38,32,0.45)";
      ctx.fillRect(0, 0, W, H);
      const width = Math.min(360, safe.width - 24);
      const height = Math.min(130 + teleportItems.length * 52, safe.height - 24);
      const rowHeight = Math.min(46, (height - 130 - Math.max(0, teleportItems.length - 1) * 6) / Math.max(1, teleportItems.length));
      const x = safe.left + (safe.width - width) / 2, y = safe.top + (safe.height - height) / 2;
      rr(x, y, width, height, 16);
      ctx.fillStyle = CREAM; ctx.fill();
      ctx.strokeStyle = BORDER; ctx.lineWidth = 1.5; ctx.stroke();
      addBtn("teleport-panel", x, y, width, height, true);
      text("传送 · 去往何方", x + 18, y + 28, "bold 17px sans-serif", "#7a5c1e");
      text(fitText("行旅免费 · 传送 0.5 安币", width - 36, "12.5px sans-serif"), x + 18, y + 54, "12.5px sans-serif", FAINT);
      teleportItems.forEach((item, index) => {
        drawRow(x + 16, y + 76 + index * (rowHeight + 6), width - 32, rowHeight, "tp:" + item.id, item.label, item.right || "0.5 安币", true, true);
      });
      text("再想想", x + width / 2, y + height - 24, "13px sans-serif", FAINT, "center");
      addBtn("tp-cancel", x + width / 2 - 60, y + height - 40, 120, 32, true);
    }
    function drawToast() {
      if (!toastMsg || now() >= toastUntil) return;
      const font = "13.5px sans-serif";
      const lines = wrapText(toastMsg, safe.width - 58, font);
      const maxLines = Math.max(1, Math.floor((safe.height - 40) / 19));
      if (lines.length > maxLines) {
        lines.length = maxLines;
        lines[maxLines - 1] = fitText(lines[maxLines - 1] + "…", safe.width - 58, font);
      }
      ctx.font = font;
      const tw = Math.max(...lines.map(line => ctx.measureText(line).width)) + 28;
      const th = lines.length * 19 + 18;
      const tx = safe.left + (safe.width - tw) / 2;
      const ty = Math.max(safe.top + 12, safe.bottom - th - (panelOpen ? 12 : 132));
      rr(tx, ty, tw, th, 14);
      ctx.fillStyle = "rgba(38,52,44,0.88)"; ctx.fill();
      lines.forEach((line, index) => text(line, tx + tw / 2, ty + 18 + index * 19, font, "#f2ecd8", "center"));
    }
    function draw() {
      btns = [];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const day = today();
      Daily.refreshDaily(state, day);
      const coinFont = "bold 15px sans-serif";
      const coinTxt = fitText("安币 " + formatCoins(state.coins), safe.width - 112, coinFont);
      ctx.font = coinFont;
      const cw = ctx.measureText(coinTxt).width + 46;
      rr(safe.left + 12, safe.top + 10, cw, 36, 18);
      ctx.fillStyle = CREAM; ctx.fill();
      ctx.strokeStyle = BORDER; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(safe.left + 30, safe.top + 28, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#d9a441"; ctx.fill();
      text(coinTxt, safe.left + 44, safe.top + 29, coinFont, "#7a5c1e");
      if (opts.onNextScene) {
        rr(safe.right - 52, safe.top + 10, 40, 36, 18);
        ctx.fillStyle = CREAM; ctx.fill();
        ctx.strokeStyle = BORDER; ctx.lineWidth = 1.2; ctx.stroke();
        text("›", safe.right - 32, safe.top + 27, "28px sans-serif", INK, "center");
        addBtn("next-scene", safe.right - 52, safe.top + 10, 40, 36, true);
      }
      if (basketText) {
        const font = "12px sans-serif";
        const space = statusSpace(safe.top + 52, 26);
        if (space.w >= 68) {
          const label = fitText(basketText, space.w - 28, font);
          ctx.font = font;
          const width = ctx.measureText(label).width + 28;
          rr(space.x, safe.top + 52, width, 26, 13);
          ctx.fillStyle = CREAM; ctx.fill();
          ctx.strokeStyle = BORDER; ctx.lineWidth = 1; ctx.stroke();
          text(label, space.x + 14, safe.top + 65, font, INK);
        }
      }
      if (sceneName) {
        const font = "12.5px sans-serif";
        const top = safe.top + (basketText ? 84 : 54);
        const space = statusSpace(top, 30);
        if (space.w >= 68) {
          const label = fitText(sceneName, space.w - 26, font);
          ctx.font = font;
          const sw = ctx.measureText(label).width + 26;
          const cx = space.x + space.w / 2;
          rr(cx - sw / 2, top, sw, 30, 15);
          ctx.fillStyle = "rgba(38,52,44,0.55)"; ctx.fill();
          text(label, cx, top + 15, font, "#f2ecd8", "center");
        }
      }
      if (!panelOpen && !teleportItems && !albumLines && !mapOpen) {
        const layout = controls(), hall = layout.hall;
        rr(hall.x, hall.y, hall.w, hall.h, 23);
        ctx.fillStyle = CREAM; ctx.fill();
        ctx.strokeStyle = BORDER; ctx.lineWidth = 1.2; ctx.stroke();
        text("安和里大厅", hall.x + hall.w / 2, hall.y + hall.h / 2, "15px sans-serif", "#7a5c1e", "center");
        addBtn("open-hall", hall.x, hall.y, hall.w, hall.h, true);
        if (joyVisible) {
          const j = layout.joystick;
          ctx.beginPath(); ctx.arc(j.x, j.y, j.radius, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(246,241,224,0.35)"; ctx.fill();
          ctx.strokeStyle = "rgba(203,189,147,0.8)"; ctx.lineWidth = 1.5; ctx.stroke();
          const knob = Math.min(23, j.radius * 0.46), reach = j.radius - knob;
          ctx.beginPath(); ctx.arc(j.x + joy.dx * reach, j.y + joy.dy * reach, knob, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(246,241,224,0.85)"; ctx.fill();
          ctx.strokeStyle = BORDER; ctx.lineWidth = 1.2; ctx.stroke();
        }
        if (actionLabel) {
          const a = layout.action;
          rr(a.x, a.y, a.w, a.h, 24);
          ctx.fillStyle = ACCENT; ctx.fill();
          const amount = actionLabel.match(/[+\-]?\d+(?:\.\d+)?\s*安币/);
          let lines;
          if (amount) {
            const before = actionLabel.slice(0, amount.index).trim();
            const after = actionLabel.slice(amount.index + amount[0].length).trim();
            ctx.font = "14px sans-serif";
            if (ctx.measureText(before + amount[0]).width > a.w - 24) {
              lines = [...wrapText(before, a.w - 24, "14px sans-serif"), amount[0] + after];
            }
          }
          lines ||= wrapText(actionLabel, a.w - 24, "14px sans-serif");
          if (lines.length > 2) {
            lines.length = 2;
            lines[1] = fitText(lines[1] + "…", a.w - 24, "14px sans-serif");
          }
          lines.forEach((line, index) => text(line, a.x + a.w / 2, a.y + a.h / 2 + (index - (lines.length - 1) / 2) * 17, "14px sans-serif", "#fff8e6", "center"));
          addBtn("action", a.x, a.y, a.w, a.h, true);
        }
      }
      drawMinimap();
      if (panelOpen) drawPanel(day);
      if (albumLines) drawAlbum();
      if (teleportItems) drawTeleport();
      drawToast();
      dirty = false;
    }
    function joystickEnd() { joy.active = false; joy.dx = 0; joy.dy = 0; dirty = true; }
    function closeTeleport() { teleportItems = null; teleportCallback = null; dirty = true; }
    function closeAlbum() { albumLines = null; albumPages = []; albumDetail = null; detailPage = 0; dirty = true; }
    function openPanel() { closeTeleport(); closeAlbum(); cancelMinimapInput(); mapOpen = false; hallPage = 0; panelOpen = true; joystickEnd(); dirty = true; }
    function closePanel() { panelOpen = false; closeTeleport(); closeAlbum(); cancelMinimapInput(); mapOpen = false; dirty = true; }
    function dispatch(id) {
      if (id === "minimap") { mapOpen = true; joystickEnd(); dirty = true; return; }
      if (id === "minimap-close") { mapOpen = false; dirty = true; return; }
      if (id === "album") { if (opts.onAlbum) opts.onAlbum(); return; }
      if (id === "album-close") { closeAlbum(); return; }
      if (id === "album-back") { albumDetail = null; detailPage = 0; dirty = true; return; }
      if (id === "album-detail-prev" || id === "album-detail-next") { detailPage = Math.max(0, Math.min(detailPages - 1, detailPage + (id.endsWith("next") ? 1 : -1))); dirty = true; return; }
      if (id.startsWith("al:")) {
        const item = albumLines?.[Number(id.slice(3))];
        if (item?.got && item.note) { albumDetail = { name: item.name, note: item.note }; detailPage = 0; dirty = true; }
        return;
      }
      if (id === "album-prev" || id === "album-next") { albumPage = Math.max(0, Math.min(albumPages.length - 1, albumPage + (id.endsWith("next") ? 1 : -1))); dirty = true; return; }
      if (id === "hall-prev" || id === "hall-next") { hallPage = Math.max(0, Math.min(hallPages - 1, hallPage + (id.endsWith("next") ? 1 : -1))); dirty = true; return; }
      if (id === "tp-cancel") { closeTeleport(); return; }
      if (id.startsWith("tp:")) {
        const callback = teleportCallback, destination = id.slice(3);
        const result = callback ? callback(destination) : undefined;
        if (result?.ok !== false) closeTeleport();
        return;
      }
      if ((extraRow && id === extraRow.id) || worldRows.some(row => row.id === id)) { if (opts.onExternal) opts.onExternal(id); return; }
      if (id === "open-hall") { openPanel(); return; }
      if (id === "close") { closePanel(); return; }
      if (id === "next-scene") { joystickEnd(); opts.onNextScene(); return; }
      if (id === "action") { if (actionFn) actionFn(); return; }
      if (id === "go-home") { if (opts.onExternal) opts.onExternal("go-home"); return; }
      if (id === "jingxin") { breathStart = now(); dirty = true; return; }
      if (id === "signin") { saveResult(Daily.doSignin(state, today())); dirty = true; return; }
      if (id === "quest") {
        const result = Daily.claimQuest(state, today());
        if (result.ok || result.msg) saveResult(result);
        else {
          const q = state.quests;
          toast("还差：" + [!q.fed && "喂一次动物", !q.harvest && "收获一次", !q.jingxin && "大厅静心"].filter(Boolean).join(" · "));
        }
        dirty = true;
      }
    }
    function handleTap(x, y) {
      if (dirty) { draw(); dirty = true; }
      for (let index = btns.length - 1; index >= 0; index--) {
        const b = btns[index];
        if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
          if (b.id === "panel" || b.id === "teleport-panel" || b.id === "album-panel" || b.id === "minimap-panel") return true;
          if (panelOpen && (b.id === "next-scene")) { closePanel(); return true; }
          if (b.enabled) dispatch(b.id);
          else if (b.id === "signin") toast("今天已经签到了 — 明天再来");
          else if (b.id === "jingxin") toast("今日已静心 — 明日再来坐坐");
          else if (b.id === "quest") toast("今日小确幸已领 — 明天再来");
          return true;
        }
      }
      if (mapOpen) { mapOpen = false; dirty = true; return true; }
      if (teleportItems) { closeTeleport(); return true; }
      if (albumLines) {
        if (albumDetail) { albumDetail = null; detailPage = 0; dirty = true; } else closeAlbum();
        return true;
      }
      if (panelOpen) { closePanel(); return true; }
      return false;
    }
    function getHitRects() {
      if (dirty) { draw(); dirty = true; }
      return btns.filter(button => !panelOpen || button.id !== "next-scene").map(button => ({ ...button }));
    }
    function containsControl(x, y) {
      if (panelOpen || teleportItems || albumLines || mapOpen) return true;
      if (getHitRects().some(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)) return true;
      const j = controls().joystick;
      return joyVisible && Math.hypot(x - j.x, y - j.y) <= j.radius + 10;
    }
    function joyMoveTo(x, y) {
      const j = controls().joystick;
      let dx = (x - j.x) / (j.radius * 0.8), dy = (y - j.y) / (j.radius * 0.8);
      const magnitude = Math.hypot(dx, dy);
      if (magnitude > 1) { dx /= magnitude; dy /= magnitude; }
      joy.dx = dx; joy.dy = dy; dirty = true;
    }
    function update() {
      const time = now();
      if (breathStart !== null && time - breathStart >= Daily.ECONOMY.meditationMilliseconds) {
        breathStart = null;
        saveResult(Daily.doJingxin(state, today()));
        dirty = true;
      }
      if (toastMsg && time >= toastUntil) { toastMsg = ""; dirty = true; }
      return dirty || joy.active || breathStart !== null || !!toastMsg;
    }

    return {
      canvas, resize, draw, handleTap, update, toast, containsControl, getHitRects,
      handleMinimapInput, cancelMinimapInput,
      getJoystickGeometry: () => ({ ...controls().joystick, visible: joyVisible && !panelOpen && !teleportItems && !albumLines && !mapOpen }),
      getMinimapGeometry: () => {
        const geometry = minimapGeometry();
        return geometry ? JSON.parse(JSON.stringify(geometry)) : null;
      },
      isPanelOpen: () => panelOpen || !!teleportItems || !!albumLines || mapOpen,
      openPanel, closePanel,
      openTeleport(items, callback) {
        closeAlbum();
        cancelMinimapInput();
        mapOpen = false;
        teleportItems = items.map(item => ({ id: String(item.id), label: String(item.label), right: String(item.right || "") }));
        teleportCallback = callback;
        panelOpen = false;
        joystickEnd(); dirty = true;
      },
      closeTeleport,
      isTeleportOpen: () => !!teleportItems,
      setAlbumRow(value) { if ((value || "") !== albumRowText) { albumRowText = String(value || ""); dirty = true; } },
      openAlbum(lines) {
        closeTeleport();
        cancelMinimapInput();
        mapOpen = false;
        albumLines = lines.map((line, index) => line.type === "group" ? { type: "group", text: String(line.text || "") }
          : { type: "item", index, name: String(line.name || ""), hint: String(line.hint || ""), note: String(line.note || ""), got: !!line.got });
        albumDetail = null; detailPage = 0; albumPage = 0; joystickEnd(); dirty = true;
      },
      closeAlbum,
      isAlbumOpen: () => !!albumLines,
      setExtraRow(row) {
        const next = row ? { id: String(row.id), label: String(row.label), right: String(row.right), enabled: !!row.enabled } : null;
        if (JSON.stringify(next) !== JSON.stringify(extraRow)) { extraRow = next; dirty = true; }
      },
      setWorldRows(rows) {
        const next = (Array.isArray(rows) ? rows : []).map(row => ({
          id: String(row.id), label: String(row.label || ""), right: String(row.right || ""), enabled: !!row.enabled,
        }));
        if (JSON.stringify(next) !== JSON.stringify(worldRows)) { worldRows = next; dirty = true; }
      },
      setSceneName(name) { sceneName = String(name || ""); dirty = true; },
      setMinimapFeatures(features) {
        cancelMinimapInput();
        mapFeatures = Array.isArray(features?.boundsPolygon) && features.boundsPolygon.length >= 3 && features.boundsPolygon.every(mapPoint) ? features : null;
        mapPlayer = null; mapOpen = false; dirty = true;
      },
      setMinimapPlayer(position, forward) {
        if (!mapFeatures) return;
        if (!mapPoint(position) || !mapPoint(forward) || Math.hypot(forward.x, forward.z) < 1e-6) {
          if (mapPlayer) { mapPlayer = null; dirty = true; }
          return;
        }
        const length = Math.hypot(forward.x, forward.z);
        const direction = { x: forward.x / length, z: forward.z / length };
        if (!mapPlayer || Math.hypot(position.x - mapPlayer.position.x, position.z - mapPlayer.position.z) >= 0.5 ||
          Math.hypot(direction.x - mapPlayer.forward.x, direction.z - mapPlayer.forward.z) >= 0.015) {
          mapPlayer = { position: { x: position.x, z: position.z }, forward: direction }; dirty = true;
        }
      },
      setBasket(value) {
        const next = String(value || "");
        if (next !== basketText) { basketText = next; dirty = true; }
      },
      markDirty() { dirty = true; },
      setAction(label, fn) {
        if ((label || "") !== actionLabel) { actionLabel = label || ""; dirty = true; }
        actionFn = fn || null;
      },
      getActionLabel: () => actionLabel,
      setJoystickVisible(value) {
        if (!!value !== joyVisible) { joyVisible = !!value; dirty = true; }
        if (!joyVisible) joystickEnd();
      },
      joystickStart(x, y) {
        if (!joyVisible || panelOpen || teleportItems || albumLines || mapOpen) return false;
        const j = controls().joystick;
        if (x < safe.left || x > safe.right || y < safe.top || y > safe.bottom || Math.hypot(x - j.x, y - j.y) > j.radius + 10) return false;
        joy.active = true; joyMoveTo(x, y);
        return true;
      },
      joystickMove(x, y) { if (joy.active) joyMoveTo(x, y); },
      joystickEnd,
      getMove: () => ({ x: joy.dx, y: joy.dy, active: joy.active }),
    };
  }

  return { createCanvasUI };
});
