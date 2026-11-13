import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bell, BookOpen, Camera,
  Check, ChevronRight, Circle, Compass, CupSoda, Flower2, Home,
  Leaf, Map, Maximize, Minimize, Moon, Pause, Play, RotateCcw,
  Send, Settings2, ShoppingBag, Sun, Sunrise, Users, Volume2,
  VolumeX, Wind, X, Mountain, PawPrint, Heart, Wheat, Package,
} from "lucide-react";
import { createCourtyard } from "./scene.js";
import { configureAudio, disposeAudio, playBead, playBell, playTea, playWoodfish } from "./audio.js";
import { connectPresence } from "./presence.js";
import FarmPanel from "./FarmPanel.jsx";
import HuntPanel from "./HuntPanel.jsx";
import { createFarm, loadFarm, saveFarm, advanceFarm, applyFarmAction, FARM_KEY, ANIMAL_TYPES } from "./farm-state.js";

const chinese = new URLSearchParams(location.search).get("locale") !== "en";
const tr = (zh, en) => chinese ? zh : en;
const wishes = {
  peace: ["岁岁平安", "Peace"],
  family: ["阖家和乐", "Family"],
  health: ["身心安康", "Wellbeing"],
  study: ["学有所成", "Learning"],
  prosperity: ["诸事顺意", "Good wishes"],
  gratitude: ["心怀感恩", "Gratitude"],
};
const places = [
  { id: "hall", name: ["静心堂", "Quiet hall"], icon: Home, x: 50, y: 31, detail: ["静坐 · 礼拜", "Sit · Bow"] },
  { id: "tea", name: ["一盏茶亭", "Tea pavilion"], icon: CupSoda, x: 24, y: 54, detail: ["饮茶 · 相遇", "Tea · Company"] },
  { id: "pond", name: ["听雨池", "Lotus pond"], icon: Flower2, x: 76, y: 61, detail: ["临水 · 歇脚", "Rest by the water"] },
  { id: "bell", name: ["晚钟亭", "Bell pavilion"], icon: Bell, x: 20, y: 25, detail: ["听一声钟", "A quiet bell"] },
  { id: "lantern", name: ["心愿树", "Wish tree"], icon: Leaf, x: 77, y: 34, detail: ["留一盏心灯", "Leave a wish"] },
  { id: "calendar", name: ["玄枢阁", "Calendar pavilion"], icon: Compass, x: 80, y: 15, detail: ["玄枢万年历", "Perpetual calendar"] },
  { id: "grove", name: ["竹间小径", "Bamboo path"], icon: Wind, x: 13, y: 76, detail: ["散步 · 听风", "Walk · Listen"] },
  { id: "gate", name: ["安和里", "Anheli gate"], icon: Home, x: 50, y: 87, detail: ["庭院入口", "Courtyard entrance"] },
];

function safeStored() {
  try {
    const data = JSON.parse(localStorage.getItem("anheli-progress-v1") || "{}");
    const integer = key => Number.isSafeInteger(data[key]) && data[key] >= 0 ? Math.min(data[key], 99999999) : 0;
    return { woodfish: integer("woodfish"), beads: integer("beads"), bows: integer("bows"), tea: integer("tea") };
  } catch { return { woodfish: 0, beads: 0, bows: 0, tea: 0 }; }
}

function IconButton({ icon: Icon, label, active, children, ...props }) {
  return <button className={`icon-button ${active ? "selected" : ""}`} title={label} aria-label={label} {...props}><Icon size={20} strokeWidth={1.6} />{children}</button>;
}

function Destination({ place, onGo }) {
  return <button className="destination" onClick={() => onGo(place.id)}><place.icon size={20} /><span><strong>{place.name[chinese ? 0 : 1]}</strong><small>{place.detail[chinese ? 0 : 1]}</small></span><ChevronRight size={16} /></button>;
}

function Modal({ title, subtitle, children, onClose, wide, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const focusable = () => [...ref.current.querySelectorAll("button:not(:disabled), a, input, select, iframe, [tabindex='0']")];
    (focusable()[0] || ref.current)?.focus();
    const key = event => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusables = focusable();
      if (!focusables.length) return;
      const first = focusables[0], last = focusables.at(-1);
      const outside = !focusables.includes(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus?.(); };
  }, [onClose]);
  return <div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <section ref={ref} tabIndex={-1} className={`modal ${wide ? "modal-wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <header className="modal-header"><div><small>{subtitle || "ANHELI"}</small><h2>{title}</h2></div><IconButton icon={X} label={tr("关闭", "Close")} onClick={onClose} /></header>
      <div className="modal-content">{children}</div>
    </section>
  </div>;
}

export default function Courtyard() {
  const host = useRef(null);
  const scene = useRef(null);
  const presence = useRef(null);
  const stateRef = useRef({});
  const callbacks = useRef({});
  const [ready, setReady] = useState(false);
  const [sceneError, setSceneError] = useState("");
  const [panel, setPanel] = useState(null);
  const panelReturn = useRef(null);
  const invitationRef = useRef(null);
  const [progress, setProgress] = useState(safeStored);
  const [farm, setFarm] = useState(() => { try { return loadFarm(localStorage); } catch { return createFarm(); } });
  const farmRef = useRef(farm);
  const [farmSaved, setFarmSaved] = useState(true);
  const farmSavedRef = useRef(true);
  const [selectedPlot, setSelectedPlot] = useState("meadow-west");
  const [selectedAnimal, setSelectedAnimal] = useState("");
  const [area, setArea] = useState("courtyard");
  const [status, setStatus] = useState("connecting");
  const [people, setPeople] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selfId, setSelfId] = useState("");
  const [roomId, setRoomId] = useState("bamboo");
  const [lanterns, setLanterns] = useState([]);
  const [selectedWish, setSelectedWish] = useState("peace");
  const [wishPending, setWishPending] = useState(false);
  const [active, setActive] = useState("idle");
  const [autoFish, setAutoFish] = useState(false);
  const [fishTempo, setFishTempo] = useState(48);
  const [bowing, setBowing] = useState(false);
  const [sitMinutes, setSitMinutes] = useState(5);
  const [sitSeconds, setSitSeconds] = useState(0);
  const [sitting, setSitting] = useState(false);
  const [sound, setSound] = useState({ enabled: false, volume: 0.5, environment: 0.3, effects: 0.65 });
  const [light, setLight] = useState("day");
  const [toast, setToast] = useState("");
  const [photo, setPhoto] = useState("");
  const [invitation, setInvitation] = useState(null);
  const [pendingTea, setPendingTea] = useState("");
  const [approachingTea, setApproachingTea] = useState("");
  const [teaState, setTeaState] = useState("idle");
  const [selectedPerson, setSelectedPerson] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [fishPulse, setFishPulse] = useState(0);
  const [beadDrag, setBeadDrag] = useState(false);
  const dragX = useRef(null);
  const lastBead = useRef(0);
  const lastBell = useRef(0);
  const [bellCooling, setBellCooling] = useState(false);
  const teaTimers = useRef([]);
  const approachingRef = useRef("");
  const approachStarted = useRef(0);
  const closePanel = React.useCallback(() => setPanel(null), []);

  stateRef.current = { selfId, people, roomId, active, status, sound, panel, invitation };
  const flash = text => setToast(text);
  const cancelTeaTimers = () => {
    teaTimers.current.forEach(clearTimeout);
    teaTimers.current = [];
  };
  const setAction = action => {
    if (action !== "fish") setAutoFish(false);
    if (action !== "bow") setBowing(false);
    if (action !== "sit") setSitting(false);
    if (action !== "tea") { cancelTeaTimers(); setTeaState("idle"); }
    setActive(action);
    scene.current?.setAction(action);
  };
  const stop = () => {
    setSelectedAnimal("");
    setAutoFish(false);
    setBowing(false);
    setSitting(false);
    setTeaState("idle");
    approachingRef.current = "";
    setApproachingTea("");
    setAction("idle");
  };
  const go = id => {
    stop();
    setPanel(null);
    scene.current?.goTo(id);
    const place = places.find(p => p.id === id);
    flash(tr(`去${place.name[0]}`, `Walking to ${place.name[1]}`));
  };
  const storeFarm = next => {
    farmRef.current = next;
    setFarm(next);
    try { farmSavedRef.current = saveFarm(localStorage, next); } catch { farmSavedRef.current = false; }
    setFarmSaved(farmSavedRef.current);
    scene.current?.setFarmState(next);
  };
  const farmAction = action => {
    let current = farmRef.current;
    try { if (farmSavedRef.current && localStorage.getItem(FARM_KEY)) current = loadFarm(localStorage); } catch {}
    const result = applyFarmAction(current, action, Date.now());
    storeFarm(result.state);
    flash(tr(result.message, result.messageEn));
    return result.ok;
  };
  const visitFarm = plotId => {
    stop(); setPanel(null);
    const result = scene.current?.goToFarm(plotId);
    flash(result === false ? tr("这条路暂时走不通", "This path is unavailable") : tr("穿过山门，去山谷里", "Through the gate, into the valley"));
  };
  const visitHunt = () => {
    stop(); setPanel(null);
    const result = scene.current?.goToHunt();
    flash(result === false ? tr("山路暂时走不通", "The forest path is unavailable") : tr("沿溪流走向远山", "Following the stream to the forest"));
  };
  callbacks.current = {
    arrive(id) {
      setActive("idle");
      if (stateRef.current.panel || stateRef.current.invitation) return;
      if (id === "hall") setPanel("sit");
      if (id === "tea") setPanel("tea");
      if (id === "calendar") setPanel("calendar");
      if (id === "lantern") setPanel("lantern");
      if (id === "bell") setPanel("bell");
      if (id === "pond") { setAction("sit"); flash(tr("听雨池 · 歇一会儿", "Resting by the lotus pond")); }
      if (id === "grove") flash(tr("竹间小径", "Bamboo path"));
      if (id === "hunt") setPanel("hunt");
    },
    network(data) {
      if (data.type === "error") {
        setWishPending(false); setPendingTea("");
        const errors = {
          tea_too_far: tr("请先走近对方，再递一盏茶", "Move closer before inviting them for tea"),
          too_far: tr("请先走近对方，再递一盏茶", "Move closer before inviting them for tea"),
          tea_busy: tr("对方正在等一盏茶", "They already have a tea invitation"),
          room_full: tr("这一庭已满，请选择其他庭院", "This courtyard is full"),
          lantern_cooldown: tr("稍等片刻，再留一份祝愿", "Wait a moment before hanging another wish"),
          rate_limited: tr("慢一点，庭院不着急", "A little slower. There is no hurry"),
        };
        flash(errors[data.code] || (chinese ? data.messageZh : data.messageEn) || tr("暂时无法完成，请稍后再试", "Please try again in a moment"));
      }
      if (data.type === "lantern.created") {
        if (data.lantern?.ownerId === stateRef.current.selfId) {
          setWishPending(false);
          flash(tr("心灯已挂上，愿你顺意", "Your wish is hanging in the courtyard"));
        }
      }
      if (data.type === "tea.invitation") {
        panelReturn.current = document.activeElement;
        setPanel(null);
        setInvitation(data.invitation);
      }
      if (data.type === "tea.pending") setPendingTea(data.invitation?.id || "");
      if (data.type === "tea.result") {
        setInvitation(null); setPendingTea("");
        if (data.status === "accepted") {
          cancelTeaTimers();
          setTeaState("shared"); setAction("tea"); playTea();
          setProgress(p => ({ ...p, tea: p.tea + 1 }));
          flash(tr("此刻，共饮一盏茶", "Sharing a quiet cup of tea"));
          teaTimers.current.push(setTimeout(() => setAction("idle"), 8000));
        } else flash(tr(data.status === "declined" ? "对方想安静待一会儿" : "茶邀已结束", data.status === "declined" ? "They are taking a quiet moment" : "The invitation has ended"));
      }
    },
  };

  useEffect(() => {
    let cancelled = false;
    try {
      scene.current = createCourtyard(host.current, {
        locale: chinese ? "zh" : "en",
        onReady: () => { if (!cancelled) setReady(true); },
        onArrive: id => callbacks.current.arrive(id),
        onPosition: position => {
          setArea(position.x > 29 && position.z < 25 ? "forest" : position.z > 26 ? "farm" : "courtyard");
          presence.current?.send({ type: "move", ...position, yaw: position.yaw || 0, action: position.action === "fish" ? "woodfish" : position.action === "tea" ? "sit" : position.action });
          if (position.action === "walk") setActive(current => {
            if (current !== "walk") {
              setAutoFish(false); setBowing(false); setSitting(false);
              cancelTeaTimers(); setTeaState("idle");
            }
            return "walk";
          });
          else if (position.action === "idle") setActive(current => current === "walk" ? "idle" : current);
        },
        onSelectVisitor: id => { setSelectedPerson(typeof id === "string" ? id : id.id); setPanel("people"); },
        onSelectPlot: id => { setSelectedPlot(id); setSelectedAnimal(""); setPanel("farm"); },
        onSelectAnimal: id => {
          const animal = farmRef.current.animals.find(item => item.id === id);
          if (animal) { stop(); setSelectedPlot(animal.plotId); setSelectedAnimal(id); setPanel(null); }
        },
        onSelectWildlife: () => setPanel("hunt"),
        onError: error => setSceneError(String(error?.message || error || "WebGL unavailable")),
      });
      scene.current.setFarmState(farmRef.current);
    } catch (error) { setSceneError(error.message); }
    presence.current = connectPresence({
      onStatus: next => {
        setStatus(next);
        if (next !== "connected") { setPeople([]); scene.current?.setPeople([], ""); }
      },
      onJoined: data => {
        setSelfId(data.selfId); setRoomId(data.roomId); setRooms(data.rooms || []);
        stateRef.current.selfId = data.selfId;
        const current = data.snapshot?.players?.find(person => person.id === data.selfId);
        if (current) scene.current?.updateSelf?.(current);
        stop();
        setInvitation(null); setPendingTea("");
      },
      onState: data => {
        const players = data.players || [];
        setPeople(players);
        setLanterns(data.lanterns || []);
        if (data.rooms) setRooms(data.rooms);
        const sharing = new Set((data.teas || []).flatMap(tea => [tea.fromId, tea.toId]));
        scene.current?.setPeople(players.map(person => sharing.has(person.id) ? { ...person, action: "tea" } : person), stateRef.current.selfId);
        scene.current?.setLanterns(data.lanterns || []);
        setWishPending(p => {
          if (p && data.lanterns?.some(item => item.ownerId === stateRef.current.selfId)) {
            setToast(tr("心灯已挂上，愿你顺意", "Your wish is hanging in the courtyard"));
            return false;
          }
          return p;
        });
        if (approachingRef.current) {
          const target = players.find(person => person.id === approachingRef.current);
          const current = scene.current?.getState();
          if (!target) {
            approachingRef.current = ""; setApproachingTea("");
          } else if (Date.now() - approachStarted.current > 18000) {
            approachingRef.current = ""; setApproachingTea("");
            setToast(tr("对方已移步，稍后再邀茶", "They have moved on. Invite them again later"));
          } else if (current && Math.hypot(target.x - current.x, target.z - current.z) < 8) {
            presence.current?.send({ type: "tea.invite", targetId: target.id });
            approachingRef.current = ""; setApproachingTea("");
            setToast(tr("茶邀已递出", "Tea invitation sent"));
          } else if (current?.action === "idle" && Date.now() - approachStarted.current > 1200) {
            scene.current?.approachVisitor?.(target.id);
          }
        }
      },
      onEvent: data => callbacks.current.network(data),
    });
    return () => {
      cancelled = true;
      presence.current?.dispose();
      scene.current?.dispose();
      cancelTeaTimers();
      disposeAudio();
    };
  }, []);

  useEffect(() => {
    if (!invitation) return;
    invitationRef.current?.querySelector("button")?.focus();
    const key = event => {
      const buttons = [...invitationRef.current.querySelectorAll("button")];
      if (event.key === "Escape") presence.current?.send({ type: "tea.reply", invitationId: invitation.id, accept: false });
      if (event.key === "Tab") {
        event.preventDefault();
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      panelReturn.current?.focus?.();
    };
  }, [invitation]);
  useEffect(() => {
    try { localStorage.setItem("anheli-progress-v1", JSON.stringify(progress)); } catch {}
  }, [progress]);
  useEffect(() => {
    const update = next => {
      farmRef.current = next;
      setFarm(next);
      scene.current?.setFarmState(next);
    };
    const tick = () => update(advanceFarm(farmRef.current, Date.now()));
    const storageChanged = event => {
      if (event.key !== FARM_KEY || !event.newValue) return;
      if (!farmSavedRef.current) return;
      try { update(advanceFarm(JSON.parse(event.newValue), Date.now())); setFarmSaved(true); } catch {}
    };
    tick();
    const timer = setInterval(tick, 1000);
    window.addEventListener("storage", storageChanged);
    return () => { clearInterval(timer); window.removeEventListener("storage", storageChanged); };
  }, []);
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    const changed = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", changed);
    return () => { clearInterval(interval); document.removeEventListener("fullscreenchange", changed); };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3400);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!autoFish) return;
    const timer = setInterval(() => {
      playWoodfish(); setFishPulse(p => p + 1);
      setProgress(p => ({ ...p, woodfish: p.woodfish + 1 }));
    }, 60000 / fishTempo);
    return () => clearInterval(timer);
  }, [autoFish, fishTempo]);
  useEffect(() => {
    if (!bowing) return;
    const timer = setInterval(() => setProgress(p => ({ ...p, bows: p.bows + 1 })), 4000);
    return () => clearInterval(timer);
  }, [bowing]);
  useEffect(() => {
    if (!sitting) return;
    const timer = setInterval(() => setSitSeconds(seconds => {
      if (seconds <= 1) {
        setSitting(false); setAction("idle");
        flash(tr("这一刻，留给自己", "A quiet moment, yours to keep"));
        return 0;
      }
      return seconds - 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [sitting]);
  useEffect(() => {
    if (!bellCooling) return;
    const timer = setTimeout(() => setBellCooling(false), 6000);
    return () => clearTimeout(timer);
  }, [bellCooling]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (invitation?.expiresAt < Date.now()) setInvitation(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [invitation]);

  const updateSound = next => {
    setSound(current => {
      const result = { ...current, ...next };
      configureAudio(result);
      return result;
    });
  };
  const strike = () => {
    if (autoFish) return;
    playWoodfish(); setFishPulse(p => p + 1);
    setProgress(p => ({ ...p, woodfish: p.woodfish + 1 }));
    setAction("fish");
  };
  const bead = () => {
    const time = performance.now();
    if (time - lastBead.current < 95) return;
    lastBead.current = time;
    playBead(); setProgress(p => ({ ...p, beads: p.beads + 1 }));
    setAction("beads");
  };
  const drink = () => {
    if (teaState !== "idle") return;
    setTeaState("brewing"); setAction("tea"); playTea();
    teaTimers.current.push(setTimeout(() => {
      setTeaState("drinking");
      setProgress(p => ({ ...p, tea: p.tea + 1 }));
      teaTimers.current.push(setTimeout(() => setAction("idle"), 4000));
    }, 2200));
  };
  const inviteForTea = person => {
    const current = scene.current?.getState();
    if (current && Math.hypot(person.x - current.x, person.z - current.z) > 10) {
      stop();
      if (scene.current?.approachVisitor?.(person.id)) {
        approachingRef.current = person.id;
        approachStarted.current = Date.now();
        setApproachingTea(person.id);
        setPanel(null);
        flash(tr("走近一些，再递一盏茶", "Walking over for a cup of tea"));
      }
      return;
    }
    presence.current?.send({ type: "tea.invite", targetId: person.id });
    flash(tr("茶邀已递出", "Tea invitation sent"));
  };
  const navigate = destination => {
    if (location.search.includes("embedded=1") && parent !== window) {
      parent.postMessage({ type: "anheli:navigate", destination }, location.origin);
      return;
    }
    const paths = { mall: "", collection: "/anheli/collection", knowledge: "/anheli/knowledge", culture: "/anheli/collection#culture", calendar: "/anheli/calendar" };
    location.href = `https://nxmall.net/${chinese ? "zh" : "en"}${paths[destination]}`;
  };
  const otherPeople = people.filter(person => person.id !== selfId);
  const companion = farm.animals.find(animal => animal.id === selectedAnimal);
  const self = people.find(person => person.id === selfId);
  const activePlace = places.find(p => p.id === panel);
  const title = {
    map: tr("一庭之间", "Around the courtyard"),
    people: tr("此刻同在", "Here together"),
    rooms: tr("择一庭院", "Choose a courtyard"),
    fish: tr("木鱼", "Wooden fish"),
    beads: tr("一百零八", "One hundred and eight"),
    sit: tr("静心堂", "Quiet hall"),
    tea: tr("一盏茶", "A cup of tea"),
    lantern: tr("留一盏心灯", "Leave a wish"),
    calendar: tr("玄枢万年历", "Perpetual calendar"),
    bell: tr("晚钟", "Evening bell"),
    sound: tr("声音与时光", "Sound & light"),
    menu: tr("安和里", "Anheli"),
    photo: tr("此刻留影", "A moment to keep"),
    farm: tr("溪山牧场", "Valley farm"),
    hunt: tr("远山猎场", "Forest hunt"),
  }[panel] || activePlace?.name[chinese ? 0 : 1];

  return <main className="courtyard-app" data-ready={ready} data-online={status} data-action={active} data-self={selfId} data-room={roomId} data-area={area}>
    <div className="experience-layer" inert={panel || invitation ? true : undefined}>
    <div className="world" ref={host} aria-label={tr("安和里三维庭院", "Anheli 3D courtyard")} />
    <header className="top-bar">
      <button className="brand" onClick={() => setPanel("menu")} aria-label={tr("安和里菜单", "Anheli menu")}><span className="brand-seal">安</span><span><strong>{tr("安和里", "ANHELI")}</strong><small>{tr("共处一庭", "A QUIET COURTYARD")}</small></span></button>
      <button className="room-indicator" onClick={() => setPanel("rooms")}><span className={`live-dot ${status === "connected" ? "" : "offline"}`} /><span>{rooms.find(room => room.id === roomId)?.[chinese ? "name" : "englishName"] || tr("竹风庭", "Bamboo courtyard")}</span><Users size={14} /><b>{status === "connected" ? people.length : 1}</b><ChevronRight size={14} /></button>
      <div className="top-tools">
        <IconButton icon={sound.enabled ? Volume2 : VolumeX} label={tr("声音与时光", "Sound & light")} active={sound.enabled} onClick={() => setPanel("sound")} />
        <IconButton icon={Camera} label={tr("留影", "Take a photo")} onClick={() => { const image = scene.current?.capture(); if (image) { setPhoto(image); setPanel("photo"); } }} />
        <IconButton icon={fullscreen ? Minimize : Maximize} label={tr(fullscreen ? "退出全屏" : "全屏", fullscreen ? "Exit fullscreen" : "Fullscreen")} onClick={async () => {
          try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { flash(tr("当前浏览器不支持全屏", "Fullscreen is unavailable")); }
        }} />
      </div>
    </header>
    <aside className="location-label"><span>{tr("风过竹间，茶正温。", "Bamboo in the breeze. Tea on the table.")}</span><time>{now.toLocaleTimeString(chinese ? "zh-CN" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}</time></aside>
    <button className="valley-entry" onClick={() => { setSelectedAnimal(""); setPanel("farm"); }}><PawPrint size={18} /><span>{tr("溪山牧场", "Valley farm")}</span><small><Leaf size={12} />{farm.coins}</small><ChevronRight size={15} /></button>
    <div className="side-tools">
      <IconButton icon={Map} label={tr("庭院地图", "Courtyard map")} onClick={() => setPanel("map")} />
      <IconButton icon={Users} label={tr("同庭访客", "Visitors")} onClick={() => setPanel("people")} />
      <IconButton icon={Mountain} label={tr("远山猎场", "Forest hunt")} onClick={visitHunt} />
      {area !== "courtyard" && <IconButton icon={Home} label={tr("回到庭院", "Return to courtyard")} onClick={() => go("gate")} />}
      <IconButton icon={RotateCcw} label={tr("视角归位", "Reset view")} onClick={() => scene.current?.recenter()} />
    </div>
    {companion && <aside className="animal-care" aria-label={tr("照顾小伙伴", "Care for your companion")}>
      <div className="animal-care-title"><PawPrint size={20} /><strong>{tr(ANIMAL_TYPES[companion.type].name, ANIMAL_TYPES[companion.type].nameEn)} <small>#{companion.id.replace("animal-", "")}</small></strong><IconButton icon={X} label={tr("收起照料", "Close animal care")} onClick={() => setSelectedAnimal("")} /></div>
      <span className="animal-care-bond"><Heart size={13} />{tr("亲近", "Bond")} {companion.comfort} / 100</span>
      <div className="animal-care-buttons"><button disabled={!farm.inventory.grass} onClick={() => farmAction({ type: "feed", animalId: companion.id, feed: "grass" })}><Wheat size={18} /><span>{tr("喂草", "Feed")}</span><small>{farm.inventory.grass}</small></button><button disabled={now.getTime() - companion.lastPettedAt < 5000} onClick={() => farmAction({ type: "pet", animalId: companion.id })}><Heart size={18} /><span>{tr("摸摸", "Pet")}</span></button><button disabled={!companion.readyProduct} onClick={() => farmAction({ type: "collect", animalId: companion.id })}><Package size={18} /><span>{tr("收获", "Collect")}</span><small>{companion.readyProduct || ""}</small></button></div>
    </aside>}
    <div className="bottom-left">
      <span className="visitor-name"><span className={`live-dot ${status === "connected" ? "" : "offline"}`} />{status === "connected" ? self?.nickname || tr("一位来客", "A visitor") : tr("独处", "A quiet visit")}</span>
      {status !== "connected" && <small role="status">{status === "connecting" ? tr("正在入庭", "Entering the courtyard") : status === "replaced" ? tr("已在另一窗口接续", "Continued in another window") : tr("多人连接恢复中", "Reconnecting to the courtyard")}</small>}
      <div className="movement-pad" aria-label={tr("行走方向", "Movement")}>{[
        ["gate", ArrowDown, tr("去入口", "Go to gate")], ["grove", ArrowLeft, tr("去竹径", "Go to bamboo")], ["hall", ArrowUp, tr("去静心堂", "Go to hall")], ["pond", ArrowRight, tr("去池边", "Go to pond")],
      ].map(([id, Icon, label]) => <IconButton key={id} icon={Icon} label={label} onClick={() => go(id)} />)}</div>
    </div>
    <nav className="action-dock" aria-label={tr("庭院活动", "Courtyard activities")}>
      {[
        ["sit", Flower2, tr("静坐", "Sit")], ["fish", Bell, tr("木鱼", "Wooden fish")], ["beads", Circle, tr("拨珠", "Beads")],
        ["tea", CupSoda, tr("喝茶", "Tea")], ["lantern", Leaf, tr("心灯", "Wishes")], ["calendar", Compass, tr("万年历", "Calendar")],
      ].map(([id, Icon, label]) => <button key={id} className={panel === id ? "dock-active" : ""} onClick={() => setPanel(id)} title={label}><Icon size={23} strokeWidth={1.5} /><span>{label}</span></button>)}
      {["sit", "bow", "fish", "beads", "tea"].includes(active) && <IconButton icon={Pause} label={tr("停止当前活动", "Stop activity")} onClick={stop} />}
    </nav>
    <button className="mall-link" onClick={() => navigate("mall")}><ShoppingBag size={15} /><span>{tr("年禧商城", "Nianxi")}</span><ChevronRight size={14} /></button>
    </div>
    {toast && <div className="toast" role="status">{toast}</div>}
    {!ready && !sceneError && <div className="loading-screen"><span className="brand-seal">安</span><h1>{tr("安和里", "ANHELI")}</h1><span className="loading-line" /><small>{tr("庭院正在苏醒", "The courtyard is waking")}</small></div>}
    {sceneError && <div className="loading-screen"><h1>{tr("庭院暂未打开", "The courtyard could not open")}</h1><p>{tr("请使用支持 WebGL 的浏览器重新进入。", "Please reopen in a browser with WebGL support.")}</p><button className="primary" onClick={() => location.reload()}>{tr("重新进入", "Try again")}</button><button className="text-link" onClick={() => navigate("calendar")}>{tr("先看玄枢万年历", "Open the calendar")}</button></div>}

    {panel && <Modal title={title} subtitle={panel === "calendar" ? "ANHELI · ORIGINAL CALENDAR" : panel === "farm" ? "ANHELI · VALLEY" : undefined} onClose={closePanel} wide={["calendar", "map", "photo"].includes(panel)} className={panel === "calendar" ? "calendar-modal" : panel === "farm" ? "farm-modal" : ""}>
      {panel === "farm" && <FarmPanel farm={farm} onAction={farmAction} onGo={visitFarm} tr={tr} now={now.getTime()} selectedPlot={selectedPlot} onSelectPlot={setSelectedPlot} selectedAnimal={selectedAnimal} saved={farmSaved} />}
      {panel === "hunt" && <HuntPanel farm={farm} onAction={farmAction} onGo={visitHunt} tr={tr} now={now.getTime()} />}
      {panel === "map" && <><div className="world-links"><button className="secondary" onClick={() => visitFarm()}><PawPrint size={18} />{tr("溪山牧场", "Valley farm")}</button><button className="secondary" onClick={visitHunt}><Mountain size={18} />{tr("远山猎场", "Forest hunt")}</button></div><div className="map-layout"><div className="courtyard-map" role="img" aria-label={tr("庭院地点分布", "Courtyard destinations")}><div className="map-path map-path-vertical" /><div className="map-path map-path-horizontal" /><div className="map-water" />{places.map(place => <button key={place.id} style={{ left: `${place.x}%`, top: `${place.y}%` }} onClick={() => go(place.id)}><place.icon size={17} /><span>{place.name[chinese ? 0 : 1]}</span></button>)}</div><div className="destination-list">{places.map(place => <Destination key={place.id} place={place} onGo={go} />)}</div></div></>}
      {panel === "rooms" && <div className="room-list">{(rooms.length ? rooms : [{ id: "bamboo", name: tr("竹风庭", "Bamboo courtyard"), capacity: 24, count: 0 }]).map(room => <button key={room.id} disabled={status !== "connected" || room.id !== roomId && (room.count ?? room.online ?? 0) >= room.capacity} className={room.id === roomId ? "current-room" : ""} onClick={() => {
        stop(); presence.current?.join(room.id); setPanel(null); flash(tr("正在移步另一庭院", "Entering another courtyard"));
      }}><Leaf size={22} /><span><strong>{room[chinese ? "name" : "englishName"] || room.name || room.id}</strong><small>{room.count ?? room.online ?? 0} / {room.capacity}</small></span>{room.id === roomId ? <Check size={18} /> : <ChevronRight size={18} />}</button>)}</div>}
      {panel === "people" && <><div className="quiet-caption">{status === "connected" ? tr(`${people.length} 位来客，此刻同在`, `${people.length} visitors, here together`) : tr("此刻独处", "A quiet moment alone")}</div><div className="people-list">{people.map(person => <div className={`person ${selectedPerson === person.id ? "person-selected" : ""}`} key={person.id}><span className="avatar-mark" style={{ background: person.color || "#738f81" }}>{person.nickname?.slice(0, 1)}</span><span><strong>{person.nickname}</strong><small>{person.id === selfId ? tr("我", "You") : person.action === "walk" ? tr("漫步中", "Walking") : tr("在庭院里", "In the courtyard")}</small></span>{person.id !== selfId && <button className="small-command" disabled={Boolean(pendingTea || approachingTea)} onClick={() => inviteForTea(person)}><CupSoda size={16} />{tr("邀茶", "Invite")}</button>}</div>)}</div>{!people.length && <div className="empty-state"><Users size={34} /><p>{tr("听风，也很好。", "The breeze is good company.")}</p></div>}<button className="text-link" onClick={() => setPanel("rooms")}>{tr("看看其他庭院", "Explore other courtyards")}<ChevronRight size={16} /></button></>}
      {panel === "fish" && <div className="ritual-panel"><div className="counter"><strong data-testid="woodfish-count">{progress.woodfish}</strong><span>{tr("声", "BEATS")}</span></div><button className={`woodfish ${autoFish ? "woodfish-auto" : ""}`} aria-label={tr("敲一下木鱼", "Strike the wooden fish")} onClick={strike} disabled={autoFish}><span key={fishPulse} className="woodfish-body"><i /><b>安</b></span><span className="woodfish-mallet" /></button><div className="ritual-controls"><button className="primary" onClick={() => { setAutoFish(!autoFish); setAction(!autoFish ? "fish" : "idle"); }}>{autoFish ? <Pause size={17} /> : <Play size={17} />}{tr(autoFish ? "暂停" : "自动敲击", autoFish ? "Pause" : "Play automatically")}</button><button className="secondary" onClick={() => setProgress(p => ({ ...p, woodfish: 0 }))}><RotateCcw size={16} />{tr("归零", "Reset")}</button></div><label className="slider-field"><span>{tr("节奏", "Tempo")}<b>{fishTempo} / min</b></span><input aria-label={tr("木鱼节奏", "Wooden fish tempo")} type="range" min="20" max="100" step="1" value={fishTempo} onChange={e => setFishTempo(Number(e.target.value))} /></label></div>}
      {panel === "beads" && <div className="ritual-panel"><div className={`bead-ring ${beadDrag ? "bead-dragging" : ""}`} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); dragX.current = e.clientX; setBeadDrag(true); bead(); }} onPointerMove={e => { if (dragX.current !== null && Math.abs(e.clientX - dragX.current) > 18) { bead(); dragX.current = e.clientX; } }} onPointerUp={() => { dragX.current = null; setBeadDrag(false); }} onPointerCancel={() => { dragX.current = null; setBeadDrag(false); }}><button className="bead-center" aria-label={tr("拨一颗念珠", "Move one bead")} onClick={e => { if (e.detail === 0) bead(); }}><strong data-testid="bead-count">{progress.beads % 108}</strong><span>/ 108</span></button>{Array.from({ length: 27 }, (_, index) => <span key={index} className={`bead ${index < (progress.beads % 108) / 4 ? "bead-passed" : ""}`} style={{ "--angle": `${index * 360 / 27}deg` }} />)}<span className="bead-tassel" /></div><div className="cycle-count">{tr("已圆满", "Completed")} <b>{Math.floor(progress.beads / 108)}</b> {tr("轮", "cycles")}</div><div className="ritual-controls"><button className="primary" onClick={bead}><Circle size={17} />{tr("拨珠", "Move a bead")}</button><button className="secondary" onClick={() => setProgress(p => ({ ...p, beads: 0 }))}><RotateCcw size={16} />{tr("归零", "Reset")}</button></div></div>}
      {panel === "sit" && <div className="ritual-panel"><div className={`breathing ${sitting ? "breathing-active" : ""}`}><Flower2 size={58} strokeWidth={0.8} /><strong>{Math.floor(sitSeconds / 60).toString().padStart(2, "0")}:{(sitSeconds % 60).toString().padStart(2, "0")}</strong><span>{tr(sitting ? "一呼，一吸" : "此刻，安坐", sitting ? "Breathe in. Breathe out." : "A moment of stillness")}</span></div><div className="segments" aria-label={tr("静坐时长", "Duration")}>{[3, 5, 10].map(minutes => <button key={minutes} aria-pressed={sitMinutes === minutes} onClick={() => { setSitMinutes(minutes); setSitSeconds(minutes * 60); setSitting(false); setAction("idle"); }}>{minutes} {tr("分钟", "min")}</button>)}</div><button className="primary full" onClick={() => {
        setBowing(false);
        if (!sitting && sitSeconds === 0) setSitSeconds(sitMinutes * 60);
        setSitting(!sitting); setAction(!sitting ? "sit" : "idle");
      }}>{sitting ? <Pause size={17} /> : <Play size={17} />}{tr(sitting ? "暂停静坐" : "开始静坐", sitting ? "Pause" : "Begin sitting")}</button><div className="bow-row"><div><strong>{tr("礼拜", "Bow")}</strong><small><b data-testid="bow-count">{progress.bows}</b> / 108</small></div><button className="secondary" onClick={() => { setSitting(false); setBowing(!bowing); setAction(!bowing ? "bow" : "idle"); }}>{bowing ? <Pause size={16} /> : <Play size={16} />}{tr(bowing ? "停一停" : "自动礼拜", bowing ? "Pause" : "Bow gently")}</button></div><button className="text-link" onClick={() => go("hall")}>{tr("移步静心堂", "Walk to the quiet hall")}<ChevronRight size={16} /></button></div>}
      {panel === "tea" && <div className="ritual-panel"><div className={`tea-still ${teaState !== "idle" ? "tea-pouring" : ""}`}><span className="tea-steam steam-one" /><span className="tea-steam steam-two" /><div className="tea-cup"><i /><span>和</span></div><div className="tea-saucer" /></div><h3 className="ritual-heading">{tr(teaState === "brewing" ? "茶汤渐温" : teaState === "shared" ? "共饮此刻" : teaState === "drinking" ? "慢慢饮" : "清茶一盏", teaState === "brewing" ? "Steeping" : teaState === "shared" ? "Here together" : teaState === "drinking" ? "A quiet sip" : "A quiet cup")}</h3><div className="ritual-controls"><button className="primary" disabled={teaState !== "idle"} onClick={drink}><CupSoda size={18} />{tr("为自己沏茶", "Brew a cup")}</button><button className="secondary" onClick={() => setPanel("people")}><Users size={18} />{tr("邀人共饮", "Invite someone")}</button></div><div className="quiet-caption">{tr(`已饮 ${progress.tea} 盏`, `${progress.tea} cups enjoyed`)}</div>{otherPeople.length === 0 && <p className="soft-note">{tr("一人一茶，也是一段好时光。", "A cup alone is a good moment, too.")}</p>}<button className="text-link" onClick={() => go("tea")}>{tr("移步一盏茶亭", "Walk to the tea pavilion")}<ChevronRight size={16} /></button></div>}
      {panel === "lantern" && <><div className="lantern-visual"><div className="paper-lantern"><span>{wishes[selectedWish][0].slice(0, 2)}</span><i /></div></div><div className="wish-options" role="group" aria-label={tr("选择祝愿", "Choose a wish")}>{Object.entries(wishes).map(([id, text]) => <button key={id} aria-pressed={selectedWish === id} onClick={() => setSelectedWish(id)}>{text[chinese ? 0 : 1]}</button>)}</div><button className="primary full" disabled={status !== "connected" || wishPending} onClick={() => {
        setWishPending(true); presence.current?.send({ type: "lantern", wish: selectedWish });
        setTimeout(() => setWishPending(false), 2500);
      }}><Send size={17} />{tr(wishPending ? "心灯升起" : "挂上心灯", wishPending ? "Hanging your wish" : "Hang a wish")}</button><div className="quiet-caption">{tr("这一庭的祝愿", "Wishes in this courtyard")} · {lanterns.length}</div><div className="wish-list">{lanterns.slice(-6).reverse().map(item => <span key={item.id}><Leaf size={12} />{wishes[item.wish]?.[chinese ? 0 : 1]}</span>)}</div>{status !== "connected" && <p className="soft-note">{tr("心灯在多人庭院连接后开放。", "Wishes reopen when the courtyard reconnects.")}</p>}</>}
      {panel === "bell" && <div className="ritual-panel"><div className={`bell-visual ${bellCooling ? "bell-ringing" : ""}`}><Bell size={125} strokeWidth={0.7} /></div><h3 className="ritual-heading">{tr("钟声入心", "A bell, a moment")}</h3><button className="primary full" disabled={bellCooling} onClick={() => { if (Date.now() - lastBell.current < 6000) return; lastBell.current = Date.now(); setBellCooling(true); playBell(); flash(tr(sound.enabled ? "余音慢慢散去" : "钟已敲响 · 声音已静音", sound.enabled ? "Let the sound settle" : "Bell struck · audio is muted")); }}><Bell size={18} />{tr(bellCooling ? "余音未尽" : "叩钟一声", bellCooling ? "Let it resonate" : "Ring the bell")}</button><p className="soft-note">{tr("钟声只在你的耳畔响起。", "This bell sounds only for you.")}</p></div>}
      {panel === "sound" && <div className="settings"><label className="toggle-row"><span><Volume2 size={19} />{tr("庭院声音", "Courtyard sound")}</span><input type="checkbox" role="switch" aria-label={tr("庭院声音", "Courtyard sound")} checked={sound.enabled} onChange={e => updateSound({ enabled: e.target.checked })} /></label>{[
        ["volume", tr("总音量", "Master volume")], ["environment", tr("竹风与环境", "Breeze & ambience")], ["effects", tr("木鱼与钟声", "Wooden fish & bell")],
      ].map(([key, label]) => <label className="slider-field" key={key}><span>{label}<b>{Math.round(sound[key] * 100)}%</b></span><input type="range" aria-label={label} min="0" max="1" step="0.01" value={sound[key]} onChange={e => updateSound({ [key]: Number(e.target.value) })} /></label>)}<div className="setting-divider" /><span className="field-label">{tr("庭院光景", "Courtyard light")}</span><div className="light-modes">{[
        ["day", Sun, tr("晴日", "Day")], ["dusk", Sunrise, tr("暮色", "Dusk")], ["night", Moon, tr("月夜", "Night")],
      ].map(([id, Icon, label]) => <button key={id} aria-pressed={light === id} onClick={() => { setLight(id); scene.current?.setLight(id); }}><Icon size={22} /><span>{label}</span></button>)}</div></div>}
      {panel === "calendar" && <iframe className="calendar-frame" src={`${import.meta.env.BASE_URL}calendar/index.html`} allow="fullscreen" allowFullScreen title={tr("安和里原版玄枢万年历", "Anheli original perpetual calendar")} />}
      {panel === "menu" && <div className="menu-links"><button onClick={() => { setPanel(null); scene.current?.recenter(); }}><Home size={21} /><span>{tr("回到庭院", "The courtyard")}</span><ChevronRight size={17} /></button><button onClick={() => setPanel("calendar")}><Compass size={21} /><span>{tr("玄枢万年历", "Perpetual calendar")}</span><ChevronRight size={17} /></button><button onClick={() => navigate("collection")}><ShoppingBag size={21} /><span>{tr("东方好物", "Meaningful objects")}</span><ChevronRight size={17} /></button><button onClick={() => navigate("culture")}><BookOpen size={21} /><span>{tr("东方志", "The journal")}</span><ChevronRight size={17} /></button><button onClick={() => navigate("knowledge")}><Leaf size={21} /><span>{tr("国学问答", "Culture guide")}</span><ChevronRight size={17} /></button><button onClick={() => navigate("mall")}><ArrowLeft size={21} /><span>{tr("返回年禧商城", "Back to Nianxi")}</span><ChevronRight size={17} /></button><p className="menu-signature">{tr("安于日常，和于心意。", "Rooted in culture. Given with care.")}</p></div>}
      {panel === "photo" && <div className="photo-view"><img src={photo} alt={tr("安和里庭院留影", "A moment in the Anheli courtyard")} /><div className="photo-caption"><span>安和里 · ANHELI</span><time>{now.toLocaleDateString(chinese ? "zh-CN" : "en-GB")}</time></div><a className="primary full" href={photo} download={`anheli-${Date.now()}.png`}><Camera size={17} />{tr("保存留影", "Save photo")}</a></div>}
    </Modal>}
    {invitation && <div ref={invitationRef} className="tea-invitation" role="alertdialog" aria-modal="true" aria-label={tr("收到茶邀", "Tea invitation")}><CupSoda size={25} /><div><strong>{invitation.fromNickname}</strong><p>{tr("想与你共饮一盏茶", "invites you for a quiet cup of tea")}</p></div><button className="primary" onClick={() => presence.current?.send({ type: "tea.reply", invitationId: invitation.id, accept: true })}><Check size={17} />{tr("赴约", "Accept")}</button><IconButton icon={X} label={tr("婉拒茶邀", "Decline")} onClick={() => presence.current?.send({ type: "tea.reply", invitationId: invitation.id, accept: false })} /></div>}
  </main>;
}
