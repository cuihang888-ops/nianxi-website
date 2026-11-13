import React, { useState } from "react";
import { ArrowRight, Check, ChessKnight, Coins, Footprints, House, Landmark, MapPin, Mountain, PawPrint, Route, Sprout, Trees, Waves } from "lucide-react";
import { WORLD_REGIONS, WORLD_ROUTES, TEMPLE, HORSE_PRICE, getRegion, getSettlement, planRoute } from "./world-state.js";
import "./world.css";

const landscapeIcons = { yingjiang: Trees, lianghe: Mountain, longchuan: Sprout, mangshi: Trees, ruili: Waves };
const settlementIcons = { riverside: Waves, woodland: Trees, farmland: Sprout, highland: Mountain, meadow: Sprout };

export default function WorldPanel({ farm, onAction, tr, onOpenFarm, onVisitTemple, saved = true, message = "" }) {
  const world = farm.world;
  const home = world.home;
  const [regionId, setRegionId] = useState(home?.regionId || "ruili");
  const region = getRegion(regionId) || getRegion("ruili");
  const [settlementId, setSettlementId] = useState(home?.settlementId || region.settlements[0].id);
  const settlement = getSettlement(region.id, settlementId) || region.settlements[0];
  const homeRegion = home && getRegion(home.regionId);
  const homeSettlement = home && getSettlement(home.regionId, home.settlementId);
  const isHome = home?.regionId === region.id && home?.settlementId === settlement.id;
  const route = planRoute(home?.regionId || "ruili", region.id, world.transport);
  const name = item => tr(item.name, item.nameEn);
  const routeSegments = new Set((route?.regions || []).slice(1).map((id, index) => [route.regions[index], id].sort().join(":")));

  const chooseRegion = id => {
    const next = getRegion(id);
    setRegionId(id);
    setSettlementId(home?.regionId === id ? home.settlementId : next.settlements[0].id);
  };

  return <div className="dehong-world">
    <div className="world-home-line">
      <House size={19} />
      <div><small>{tr("我的归处", "Your home")}</small><strong data-testid="world-home">{homeRegion ? `${name(homeRegion)} · ${name(homeSettlement)}` : tr("还未安家", "A home awaits")}</strong></div>
      <span>{tr("个人家园", "Personal homestead")}</span>
    </div>

    <div className="world-planning-grid">
      <section className="world-atlas-section" aria-label={tr("德宏区域", "Regions of Dehong")}>
        <div className="world-section-title"><h3>{tr("德宏 · 安和里", "Dehong · Anheli")}</h3><span>{tr("原野想象 · 区域示意", "An imagined wilderness · schematic")}</span></div>
        <div className="world-atlas" data-testid="world-map">
          <svg className="world-atlas-terrain" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M6 12 31 6 45 24 37 40 13 46 3 31Z" fill="#d9e8d5" />
            <path d="M43 8 72 3 90 20 76 35 49 33 37 24Z" fill="#e4e3ed" />
            <path d="M13 46 37 37 60 39 64 66 43 73 20 67Z" fill="#e1e9ca" />
            <path d="M64 34 89 32 97 55 83 76 64 66Z" fill="#e5e6d8" />
            <path d="M20 67 44 74 61 69 67 88 41 97 12 89Z" fill="#d6e6e5" />
            <path d="M2 15 C17 25 7 40 26 49 S22 72 42 83 S60 83 69 98" fill="none" stroke="#9fc9cf" strokeWidth="2.1" />
            {WORLD_ROUTES.map(connection => {
              const from = getRegion(connection.from), to = getRegion(connection.to);
              const selected = routeSegments.has([connection.from, connection.to].sort().join(":"));
              return <line key={`${from.id}-${to.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={selected ? "world-route-line selected" : "world-route-line"} />;
            })}
          </svg>
          <span className="world-north" aria-hidden="true">N ↑</span>
          {WORLD_REGIONS.map(item => {
            const Icon = landscapeIcons[item.id];
            return <button key={item.id} type="button" className={`world-region ${region.id === item.id ? "world-region-selected" : ""}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} onClick={() => chooseRegion(item.id)} aria-pressed={region.id === item.id} aria-label={tr(`选择${item.name}`, `Choose ${item.nameEn}`)} data-testid={`world-region-${item.id}`}>
              <Icon size={18} strokeWidth={1.5} /><strong>{name(item)}</strong>{home?.regionId === item.id && <House className="world-home-marker" size={12} aria-label={tr("我的家园", "Your home")} />}
            </button>;
          })}
        </div>
        <button type="button" className="world-temple-link" onClick={onVisitTemple}><Landmark size={20} /><span><strong>{name(TEMPLE)}</strong><small>{tr("瑞丽 · 庭院原型", "Ruili · Courtyard prototype")}</small></span><ArrowRight size={16} /></button>
      </section>

      <section className="world-settlement" aria-label={tr("安家选址", "Choose a homestead")}>
        <div className="world-section-title"><h3>{name(region)}</h3><MapPin size={17} /></div>
        <p className="world-landscape">{tr(region.landscape, region.landscapeEn)}</p>
        <fieldset className="world-settlement-options"><legend>{tr("择一处安家", "Choose your place")}</legend>{region.settlements.map(item => {
          const Icon = settlementIcons[item.kind] || House;
          return <label key={item.id} className={settlement.id === item.id ? "world-settlement-selected" : ""}>
            <input type="radio" name="world-settlement" value={item.id} checked={settlement.id === item.id} onChange={() => setSettlementId(item.id)} />
            <Icon size={21} strokeWidth={1.5} /><span>{name(item)}</span>
          </label>;
        })}</fieldset>
        <p className="world-free-settlement">{tr("安家与迁居免费，已有田地和伙伴随你同行。", "Settling and moving are free. Your plots and companions stay with you.")}</p>
        <button type="button" className="primary world-settle-button" disabled={isHome} onClick={() => onAction({ type: "settleHome", regionId: region.id, settlementId: settlement.id })}>
          {isHome ? <Check size={17} /> : <House size={17} />}{isHome ? tr("已在这里安家", "You live here") : home ? tr("迁居到这里", "Move here") : tr("安家在这里", "Settle here")}
        </button>
        <button type="button" className="text-link world-open-farm" onClick={onOpenFarm}><PawPrint size={16} />{tr("看看田地与伙伴", "Visit your plots and companions")}<ArrowRight size={15} /></button>
      </section>
    </div>

    <section className="world-journey" aria-label={tr("行路规划", "Route planning")}>
      <div className="world-section-title"><h3><Route size={18} />{tr("山水之间", "Between hills and rivers")}</h3><span>{tr("路程规划", "Route planning")}</span></div>
      <div className="world-route-heading"><span>{name(getRegion(home?.regionId || "ruili"))}</span><ArrowRight size={16} /><label><span className="world-screen-reader">{tr("目的地区域", "Destination region")}</span><select aria-label={tr("目的地区域", "Destination region")} value={region.id} onChange={event => chooseRegion(event.target.value)}>{WORLD_REGIONS.map(item => <option key={item.id} value={item.id}>{name(item)}</option>)}</select></label></div>
      <div className="world-travel-row">
        <div className="world-transport" role="group" aria-label={tr("出行方式", "Travel mode")}>
          <button type="button" aria-pressed={world.transport === "walk"} onClick={() => onAction({ type: "setTransport", transport: "walk" })}><Footprints size={18} />{tr("步行", "Walk")}</button>
          <button type="button" disabled={!world.horseOwned} aria-pressed={world.transport === "horse"} onClick={() => onAction({ type: "setTransport", transport: "horse" })}><ChessKnight size={18} />{tr("骑马", "Horseback")}</button>
        </div>
        <span className="world-route-duration" data-testid="world-route-duration">{route?.gameMinutes ? tr(`游戏路程 ${route.gameMinutes} 分钟`, `${route.gameMinutes} game minutes`) : tr("同一区域", "Within this region")}</span>
      </div>
      <p className="world-route-stops">{route?.regions.map(id => name(getRegion(id))).join(" → ")}</p>
      <div className="world-horse-row"><span><ChessKnight size={20} />{world.horseOwned ? tr("马匹已领养", "Your horse is adopted") : tr("一匹同行的马", "A horse for your travels")}</span>{world.horseOwned ? <Check size={17} /> : <button type="button" className="secondary" disabled={farm.coins < HORSE_PRICE} onClick={() => onAction({ type: "buyHorse" })} aria-label={tr(`领养马匹 ${HORSE_PRICE} 安币`, `Adopt a horse for ${HORSE_PRICE} An coins`)}>{tr("领养", "Adopt")}<span>{HORSE_PRICE} {tr("安币", "An coins")}</span></button>}</div>
    </section>

    <section className="world-wallet" aria-label={tr("安币账户", "An coin balance")}>
      <div><Coins size={21} /><span><strong data-testid="world-coins">{farm.coins}</strong><small>{tr("安币 · 游戏内", "An coins · in game")}</small></span></div>
      <button type="button" className="secondary" onClick={onOpenFarm}>{tr("去集市", "To the market")}<ArrowRight size={15} /></button>
      <button type="button" className="world-recharge" disabled>{tr("充值未开放", "Top-ups unavailable")}</button>
    </section>
    <div className="world-feedback" role="status">{message}</div>
    <footer className={`world-save-state ${saved ? "" : "world-save-failed"}`} role={saved ? undefined : "alert"}>{saved ? tr("家园与安币保存在本机", "Your homestead and coins are saved on this device") : tr("本次进度未保存", "Progress could not be saved")}</footer>
  </div>;
}
