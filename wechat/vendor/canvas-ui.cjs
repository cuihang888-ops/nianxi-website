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
    let teleportItems = null, teleportCallback = null, extraRow = null;
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
      const rows = 3 + (state.home ? 1 : 0) + (albumRowText ? 1 : 0) + (extraRow ? 1 : 0);
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
        const label = fitText(basketText, safe.width - 52, font);
        ctx.font = font;
        const width = ctx.measureText(label).width + 28;
        rr(safe.left + 12, safe.top + 52, width, 26, 13);
        ctx.fillStyle = CREAM; ctx.fill();
        ctx.strokeStyle = BORDER; ctx.lineWidth = 1; ctx.stroke();
        text(label, safe.left + 26, safe.top + 65, font, INK);
      }
      if (sceneName) {
        const font = "12.5px sans-serif";
        const label = fitText(sceneName, safe.width - 50, font);
        ctx.font = font;
        const sw = ctx.measureText(label).width + 26;
        const cx = safe.left + safe.width / 2;
        const top = safe.top + (basketText ? 84 : 54);
        rr(cx - sw / 2, top, sw, 30, 15);
        ctx.fillStyle = "rgba(38,52,44,0.55)"; ctx.fill();
        text(label, cx, top + 15, font, "#f2ecd8", "center");
      }
      if (!panelOpen && !teleportItems && !albumLines) {
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
      if (panelOpen) drawPanel(day);
      if (albumLines) drawAlbum();
      if (teleportItems) drawTeleport();
      drawToast();
      dirty = false;
    }
    function joystickEnd() { joy.active = false; joy.dx = 0; joy.dy = 0; dirty = true; }
    function closeTeleport() { teleportItems = null; teleportCallback = null; dirty = true; }
    function closeAlbum() { albumLines = null; albumPages = []; albumDetail = null; detailPage = 0; dirty = true; }
    function openPanel() { closeTeleport(); closeAlbum(); hallPage = 0; panelOpen = true; joystickEnd(); dirty = true; }
    function closePanel() { panelOpen = false; closeTeleport(); closeAlbum(); dirty = true; }
    function dispatch(id) {
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
      if (extraRow && id === extraRow.id) { if (opts.onExternal) opts.onExternal(id); return; }
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
          if (b.id === "panel" || b.id === "teleport-panel" || b.id === "album-panel") return true;
          if (panelOpen && (b.id === "next-scene")) { closePanel(); return true; }
          if (b.enabled) dispatch(b.id);
          else if (b.id === "signin") toast("今天已经签到了 — 明天再来");
          else if (b.id === "jingxin") toast("今日已静心 — 明日再来坐坐");
          else if (b.id === "quest") toast("今日小确幸已领 — 明天再来");
          return true;
        }
      }
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
      if (panelOpen || teleportItems || albumLines) return true;
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
      getJoystickGeometry: () => ({ ...controls().joystick, visible: joyVisible && !panelOpen && !teleportItems && !albumLines }),
      isPanelOpen: () => panelOpen || !!teleportItems || !!albumLines,
      openPanel, closePanel,
      openTeleport(items, callback) {
        closeAlbum();
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
      setSceneName(name) { sceneName = String(name || ""); dirty = true; },
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
        if (!joyVisible || panelOpen || teleportItems || albumLines) return false;
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
