import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Check, Clock3, Crosshair, Footprints, Mountain,
  Rabbit, RotateCcw, Target, Wind,
} from "lucide-react";
import "./hunt.css";

const COOLDOWN_MS = 20_000;
const TRAILS = {
  rabbit: {
    name: ["野兔踪迹", "Rabbit trail"],
    detail: ["草叶低伏，细小足印通向林边。", "Small prints lead through the grass to the woods."],
    hint: ["草丛边的一线动静", "Movement by the tall grass"],
    center: 0.5,
    width: 0.28,
    crossingMs: 1500,
    Icon: Rabbit,
  },
  deer: {
    name: ["山鹿踪迹", "Deer trail"],
    detail: ["泥地留着蹄印，山风从松林吹来。", "Hoofprints cross the mud toward the pines."],
    hint: ["松林深处的一段踪影", "A glimpse among the pines"],
    center: 0.62,
    width: 0.2,
    crossingMs: 1900,
    Icon: Footprints,
  },
};

function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function currentTime(value) {
  const time = value instanceof Date ? value.getTime() : value;
  return typeof time === "number" && Number.isFinite(time) ? time : Date.now();
}

export default function HuntPanel({ farm, onAction, onGo, tr = (zh) => zh, now }) {
  const [target, setTarget] = useState("rabbit");
  const [phase, setPhase] = useState("tracking");
  const [outcome, setOutcome] = useState(null);
  const [inTarget, setInTarget] = useState(false);
  const previousTarget = useRef(false);
  const marker = useRef(null);
  const track = useRef(null);
  const position = useRef(0.06);
  const animation = useRef(0);
  const resolved = useRef(false);
  const trail = TRAILS[target];
  const time = currentTime(now);
  const lastHuntAt = typeof farm?.lastHuntAt === "number" && Number.isFinite(farm.lastHuntAt)
    ? Math.max(0, farm.lastHuntAt) : 0;
  const remainingMs = lastHuntAt > 0 ? Math.max(0, lastHuntAt + COOLDOWN_MS - time) : 0;
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const attempts = validCount(farm?.huntStats?.attempts ?? farm?.huntStats?.total);
  const successes = validCount(farm?.huntStats?.successes ?? farm?.huntStats?.success);
  const targetStart = trail.center - trail.width / 2;
  const targetEnd = trail.center + trail.width / 2;
  const TrailIcon = trail.Icon;

  useEffect(() => {
    if (phase !== "aiming") return undefined;
    const startedAt = performance.now();
    const animate = (timestamp) => {
      const progress = (timestamp - startedAt) / trail.crossingMs % 2;
      position.current = 0.06 + (progress <= 1 ? progress : 2 - progress) * 0.88;
      const inside = position.current >= targetStart && position.current <= targetEnd;
      if (inside !== previousTarget.current) { previousTarget.current = inside; setInTarget(inside); }
      if (marker.current) marker.current.style.left = `${position.current * 100}%`;
      if (track.current) {
        track.current.dataset.position = position.current.toFixed(4);
        track.current.dataset.inTarget = String(position.current >= targetStart && position.current <= targetEnd);
      }
      animation.current = requestAnimationFrame(animate);
    };
    animation.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animation.current);
  }, [phase, trail, targetStart, targetEnd]);

  function begin() {
    if (remainingMs > 0 || phase === "aiming") return;
    resolved.current = false;
    position.current = 0.06;
    setOutcome(null);
    setPhase("aiming");
  }

  function shoot() {
    if (phase !== "aiming" || resolved.current) return;
    if (remainingMs > 0) {
      cancelAnimationFrame(animation.current);
      resolved.current = true;
      setOutcome({ kind: "cooldown" });
      setPhase("result");
      return;
    }
    resolved.current = true;
    cancelAnimationFrame(animation.current);
    const success = position.current >= targetStart && position.current <= targetEnd;
    const result = onAction?.({ type: "hunt", success });
    setOutcome(result === false || result?.ok === false ? { kind: "unavailable" } : { kind: success ? "success" : "miss" });
    setPhase("result");
  }

  function selectTrail(id) {
    if (phase === "aiming") return;
    setTarget(id);
    setOutcome(null);
    setPhase("tracking");
  }

  return <section className="hunt-panel" data-hunt-phase={phase} aria-label={tr("深山寻踪", "Mountain trails")}>
    <div className={`hunt-landscape hunt-landscape-${target}`} aria-hidden="true">
      <span className="hunt-ridge hunt-ridge-back" />
      <span className="hunt-ridge hunt-ridge-front" />
      <span className="hunt-trail-line" />
      <Mountain className="hunt-summit" size={35} strokeWidth={1} />
      <TrailIcon className="hunt-trail-mark" size={30} strokeWidth={1.5} />
      <Footprints className="hunt-footprints hunt-footprints-one" size={17} />
      <Footprints className="hunt-footprints hunt-footprints-two" size={15} />
    </div>

    <div className="hunt-heading">
      <div><span className="hunt-eyebrow">{tr("远峰 · 深山猎场", "Mountain hunting ground")}</span><h3>{tr("循足印，入山林", "Follow the mountain trail")}</h3></div>
      <button className="hunt-go" type="button" onClick={() => onGo?.("hunting")} title={tr("前往深山猎场", "Walk to the hunting ground")}>
        <Mountain size={16} /><span>{tr("前往猎场", "Walk there")}</span><ArrowRight size={15} />
      </button>
    </div>

    <fieldset className="hunt-targets" disabled={phase === "aiming"}>
      <legend className="hunt-legend"><Footprints size={15} />{tr("选择一条踪迹", "Choose a trail")}</legend>
      <div className="hunt-target-options">{Object.entries(TRAILS).map(([id, item]) => {
        const Icon = item.Icon;
        return <label key={id} className={`hunt-target ${target === id ? "hunt-target-selected" : ""}`}>
          <input className="hunt-target-input" type="radio" name="anheli-hunt-target" value={id} checked={target === id} onChange={() => selectTrail(id)} />
          <Icon size={20} strokeWidth={1.6} />
          <span><strong>{tr(...item.name)}</strong><small>{tr(...item.detail)}</small></span>
          {target === id && <Check className="hunt-target-check" size={16} />}
        </label>;
      })}</div>
    </fieldset>

    <div className="hunt-timing">
      <div className="hunt-timing-heading"><span><Crosshair size={16} />{tr(...trail.hint)}</span><span>{phase === "aiming" ? tr("等待时机", "Take your moment") : tr("弓已备好", "Bow ready")}</span></div>
      <div ref={track} className={`hunt-timing-track ${phase === "aiming" ? "hunt-timing-active" : ""}`} role="img" aria-label={tr("准星时机条，绿色区域为命中区", "Timing track with a green target zone")} data-testid="hunt-timing-track" data-position="0.0600" data-in-target="false">
        <span className="hunt-target-zone" style={{ left: `${targetStart * 100}%`, width: `${trail.width * 100}%` }}><Target size={20} strokeWidth={1.5} /></span>
        <span className="hunt-track-tick hunt-track-tick-one" />
        <span className="hunt-track-tick hunt-track-tick-two" />
        <span ref={marker} className="hunt-aim-marker" style={{ left: `${position.current * 100}%` }}><Crosshair size={26} strokeWidth={1.8} /></span>
      </div>
      <span className="hunt-screen-reader" role="status" aria-live="polite">{phase === "aiming" ? tr(inTarget ? "现在可以松弦" : "等待时机", inTarget ? "Release now" : "Wait for the target") : ""}</span>
      <p className="hunt-timing-caption">{phase === "aiming"
        ? tr("准星进入绿区时，松弦。", "Release when the marker enters the green zone.")
        : tr("山风轻过，等一个好时机。", "Wait for a quiet moment in the mountain breeze.")}</p>
    </div>

    <div className={`hunt-result ${outcome ? `hunt-result-${outcome.kind}` : "hunt-result-empty"}`} role="status" aria-live="polite" aria-atomic="true" data-testid="hunt-result">
      {outcome?.kind === "success" ? <><Check size={20} /><div><strong>{tr("这一箭命中", "A clear shot")}</strong><p>{tr("这一趟山行，收获已记下。", "A successful mountain outing.")}</p></div></>
        : outcome?.kind === "miss" ? <><Wind size={20} /><div><strong>{tr("踪影隐入林间", "The trail slips into the woods")}</strong><p>{tr("这一箭落空了，歇一会儿再寻踪。", "The shot missed. Rest a moment before trying again.")}</p></div></>
          : outcome ? <><Clock3 size={20} /><div><strong>{tr("稍歇片刻", "Rest a moment")}</strong><p>{tr("山路不急，等这一程准备好。", "Wait until the next outing is ready.")}</p></div></>
            : <><Footprints size={20} /><div><strong>{tr("足印还很清晰", "The trail is fresh")}</strong><p>{tr(...trail.detail)}</p></div></>}
    </div>

    <div className="hunt-controls">
      {phase === "aiming" ? <>
        <button className="hunt-command hunt-command-primary" type="button" onClick={shoot} data-testid="hunt-shoot"><Crosshair size={18} />{tr("发射", "Release")}</button>
        <button className="hunt-command hunt-command-secondary" type="button" onClick={() => setPhase("tracking")}><RotateCcw size={16} />{tr("收弓", "Lower bow")}</button>
      </> : <button className="hunt-command hunt-command-primary" type="button" onClick={begin} disabled={remainingMs > 0} data-testid="hunt-begin">
        {remainingMs > 0 ? <Clock3 size={18} /> : phase === "result" ? <RotateCcw size={18} /> : <Footprints size={18} />}
        {remainingMs > 0 ? tr(`再出发 · ${remainingSeconds} 秒`, `Next outing · ${remainingSeconds}s`) : phase === "result" ? tr("再次寻踪", "Follow another trail") : tr("开始寻踪", "Follow the trail")}
      </button>}
    </div>

    <dl className="hunt-statistics" aria-label={tr("山行记录", "Mountain outings")}>
      <div><dt>{tr("寻踪", "Outings")}</dt><dd data-testid="hunt-attempts">{attempts}</dd></div>
      <div><dt>{tr("命中", "Successful shots")}</dt><dd data-testid="hunt-successes">{successes}</dd></div>
    </dl>
  </section>;
}
