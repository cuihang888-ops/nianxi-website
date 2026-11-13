import React, { useEffect, useState } from "react";
import { ArrowRight, Bird, Carrot, Check, Coins, Droplets, Egg, Fence, Gift, Heart, Leaf, MapPin, Package, PawPrint, Plus, Rabbit, Scissors, ShoppingBasket, Sprout, Wheat } from "lucide-react";
import { ANIMAL_TYPES, CROPS } from "./farm-state.js";
import { ECONOMY_CONFIG, PRODUCT_VALUES } from "./economy-config.js";
import CompanionName from "./CompanionName.jsx";
import "./farm.css";

const animalIcons = { sheep: PawPrint, rabbit: Rabbit, chicken: Bird };
const productNames = { wool: ["羊毛", "Wool"], fur: ["兔绒", "Soft fur"], egg: ["鸡蛋", "Eggs"], game: ["山野收获", "Game"] };
const productValues = PRODUCT_VALUES;
const productIcons = { wool: Scissors, fur: Rabbit, egg: Egg, game: Leaf };
const seconds = (until, now) => Math.max(0, Math.ceil((until - now) / 1000));

export default function FarmPanel({ farm, onAction, onGo, tr, now, selectedPlot, onSelectPlot, selectedAnimal, saved, message }) {
  const [tab, setTab] = useState("land");
  useEffect(() => { if (selectedAnimal) setTab("animals"); }, [selectedAnimal]);
  const plot = farm.plots.find(item => item.id === selectedPlot) || farm.plots[0];
  const owned = farm.plots.filter(item => item.owned);
  const localAnimals = farm.animals.filter(animal => animal.plotId === plot.id);
  const beds = farm.beds.filter(bed => bed.plotId === plot.id);
  const name = item => tr(item.name, item.nameEn);
  const today = new Date(now);
  const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const dailyClaimed = farm.lastDailyGift === localDay;
  const tabs = [["land", Fence, tr("土地", "Land")], ["animals", PawPrint, tr("小伙伴", "Animals")], ["crops", Sprout, tr("种植", "Crops")], ["basket", ShoppingBasket, tr("收获篮", "Basket")]];

  return <div className="farm-panel">
    <div className="farm-wallet"><span><Leaf size={18} /><strong data-testid="farm-coins">{farm.coins}</strong><small>{tr("安币 · 游戏内", "An coins · in game")}</small></span><button className="small-command" disabled={dailyClaimed} onClick={() => onAction({ type: "dailyGift" })}>{dailyClaimed ? <Check size={16} /> : <Gift size={16} />}{tr(dailyClaimed ? "今日已领" : "每日补给", dailyClaimed ? "Claimed today" : "Daily supplies")}</button></div>
    <div className="farm-feedback" role="status">{message}</div>
    <div className="farm-tabs" role="tablist" aria-label={tr("牧场事务", "Farm views")}>{tabs.map(([id, Icon, label]) => <button role="tab" aria-selected={tab === id} key={id} onClick={() => setTab(id)}><Icon size={18} /><span>{label}</span></button>)}</div>
    <div className="farm-view" role="tabpanel">
      {tab === "land" && <div className="farm-lands">{farm.plots.map((item, index) => <article className={`farm-land land-tone-${index} ${selectedPlot === item.id ? "farm-land-selected" : ""}`} key={item.id} data-testid={`plot-${item.id}`}>
        <div className="farm-land-title"><span className="farm-land-number">0{index + 1}</span><div><h3>{name(item)}</h3><p>{tr(`${item.capacity} 只小伙伴 · 2 块菜畦`, `${item.capacity} animals · 2 crop beds`)}</p></div>{item.owned && <Check size={18} />}</div>
        <div className="farm-land-footer"><span>{item.owned ? tr("我的土地", "Your land") : <><Leaf size={14} />{item.price}</>}</span>{item.owned ? <button className="secondary" onClick={() => { onSelectPlot(item.id); onGo(item.id); }}><MapPin size={15} />{tr("去看看", "Visit")}</button> : <button className="primary" disabled={farm.coins < item.price} aria-label={tr(`买下${item.name}`, `Buy ${item.nameEn}`)} onClick={() => { if (onAction({ type: "buyPlot", plotId: item.id })) { onSelectPlot(item.id); setTab("animals"); } }}><Plus size={15} />{tr("买下土地", "Buy land")}</button>}</div>
      </article>)}</div>}
      {tab !== "land" && tab !== "basket" && <div className="farm-plot-picker"><label><Fence size={16} /><select aria-label={tr("当前土地", "Current plot")} value={plot.id} onChange={event => onSelectPlot(event.target.value)}>{farm.plots.map(item => <option value={item.id} key={item.id}>{name(item)}{item.owned ? "" : tr(" · 未拥有", " · unowned")}</option>)}</select></label><button className="small-command" onClick={() => onGo(plot.id)}><MapPin size={14} />{tr("前往", "Visit")}</button></div>}
      {(tab === "animals" || tab === "crops") && !plot.owned && <div className="farm-empty"><Fence size={38} /><h3>{tr("一片属于自己的山谷", "A little valley of your own")}</h3><button className="primary" onClick={() => setTab("land")}><Plus size={16} />{tr("挑选土地", "Choose land")}</button></div>}
      {tab === "animals" && plot.owned && <>
        <div className="farm-section-heading"><h3>{tr("牧场小伙伴", "Your little companions")}</h3><span>{localAnimals.length} / {plot.capacity}</span></div>
        <div className="farm-animal-list">{localAnimals.map(animal => {
          const spec = ANIMAL_TYPES[animal.type], Icon = animalIcons[animal.type];
          const fed = animal.fedUntil > now;
          return <article className={`farm-animal ${selectedAnimal === animal.id ? "farm-animal-selected" : ""}`} key={animal.id} data-testid={`animal-${animal.id}`}>
            <div className="farm-animal-head"><span className={`farm-animal-mark animal-${animal.type}`}><Icon size={30} strokeWidth={1.5} /></span><div><CompanionName animal={animal} onAction={onAction} tr={tr} /><p>{name(spec)} · {animal.readyProduct ? tr(`收获篮里有 ${animal.readyProduct} 份小礼物`, `${animal.readyProduct} little gifts are ready`) : fed ? tr("吃饱了，在草地上慢慢散步", "Well fed, wandering through the grass") : tr("在草地上自在歇着", "Resting in the meadow")}</p></div></div>
            <div className="farm-comfort"><Heart size={13} /><span>{tr("亲近", "Bond")}</span><meter min="0" max={ECONOMY_CONFIG.care.maxComfort} value={animal.comfort} aria-label={tr("亲近程度", "Bond level")} /><b>{animal.comfort}</b></div>
            <div className="farm-animal-actions"><button className="secondary" disabled={!farm.inventory.grass} onClick={() => onAction({ type: "feed", animalId: animal.id, feed: "grass" })}><Wheat size={15} />{tr("喂牧草", "Feed grass")}</button><button className="secondary" disabled={!farm.inventory.carrot} onClick={() => onAction({ type: "feed", animalId: animal.id, feed: "carrot" })}><Carrot size={15} />{tr("喂萝卜", "Carrot")}</button><button className="secondary" disabled={now - animal.lastPettedAt < ECONOMY_CONFIG.timing.petCooldownMs} onClick={() => onAction({ type: "pet", animalId: animal.id })}><Heart size={15} />{tr("摸摸", "Pet")}</button><button className="primary" disabled={!animal.readyProduct} onClick={() => onAction({ type: "collect", animalId: animal.id })}><Package size={15} />{tr("收获", "Collect")}</button></div>
          </article>;
        })}</div>
        <div className="farm-section-heading"><h3>{tr("迎接新伙伴", "Welcome a companion")}</h3></div><div className="farm-adoptions">{Object.values(ANIMAL_TYPES).map(spec => { const Icon = animalIcons[spec.id]; return <button key={spec.id} disabled={farm.coins < spec.price || localAnimals.length >= plot.capacity} onClick={() => onAction({ type: "buyAnimal", plotId: plot.id, animalType: spec.id })} aria-label={tr(`领养${spec.name}`, `Adopt ${spec.nameEn}`)}><Icon size={30} strokeWidth={1.4} /><strong>{name(spec)}</strong><span><Leaf size={12} />{spec.price}</span><Plus size={15} /></button>; })}</div>
      </>}
      {tab === "crops" && plot.owned && <><div className="farm-section-heading"><h3>{tr("山谷菜畦", "Valley garden")}</h3><span><Wheat size={13} />{farm.inventory.grass}<Carrot size={13} />{farm.inventory.carrot}</span></div><div className="farm-beds">{beds.map((bed, index) => { const crop = CROPS[bed.crop], remaining = seconds(bed.readyAt, now), ready = crop && remaining === 0; return <article className={`farm-bed ${crop ? "farm-bed-growing" : ""}`} key={bed.id} data-testid={bed.id}>
        <div className="farm-bed-title"><Sprout size={26} /><h4>{tr(`菜畦 ${index + 1}`, `Garden bed ${index + 1}`)}</h4><span>{crop ? name(crop) : tr("待播种", "Ready to sow")}</span></div>
        {crop ? <><p className="farm-crop-state">{ready && !bed.watered ? tr("土有些干，补一点水", "The soil needs a little water") : ready ? tr("长好了，来收获吧", "Ready to harvest") : tr(`${remaining} 秒后成熟`, `Ready in ${remaining}s`)}</p><progress max="1" value={Math.min(1, Math.max(0, (now - bed.plantedAt) / Math.max(1, bed.readyAt - bed.plantedAt)))} aria-label={tr("生长进度", "Growth")} /><div className="farm-bed-actions"><button className="secondary" disabled={bed.watered} onClick={() => onAction({ type: "water", bedId: bed.id })}><Droplets size={16} />{tr(bed.watered ? "已浇水" : "浇水", bed.watered ? "Watered" : "Water")}</button><button className="primary" disabled={!ready || !bed.watered} onClick={() => onAction({ type: "harvest", bedId: bed.id })}><ShoppingBasket size={16} />{tr("采收", "Harvest")}</button></div></> : <div className="farm-seeds">{Object.values(CROPS).map(spec => <button className="secondary" key={spec.id} disabled={farm.coins < spec.cost} onClick={() => onAction({ type: "plant", bedId: bed.id, crop: spec.id })}>{spec.id === "grass" ? <Wheat size={16} /> : <Carrot size={16} />}<span>{name(spec)}<small>{spec.cost} {tr("安币", "coins")}</small></span></button>)}</div>}
      </article>; })}</div></>}
      {tab === "basket" && <><div className="farm-inventory"><span><Wheat size={23} /><strong>{farm.inventory.grass}</strong>{tr("牧草", "Grass")}</span><span><Carrot size={23} /><strong>{farm.inventory.carrot}</strong>{tr("胡萝卜", "Carrots")}</span><span><Fence size={23} /><strong>{owned.length}</strong>{tr("土地", "Plots")}</span></div><div className="farm-product-list">{Object.entries(productNames).map(([item, names]) => { const Icon = productIcons[item]; return <div className="farm-product" key={item}><Icon size={22} /><div><strong>{tr(...names)}</strong><small>{tr(`每份 ${productValues[item]} 安币`, `${productValues[item]} coins each`)}</small></div><b data-testid={`inventory-${item}`}>{farm.inventory[item] || 0}</b><button className="secondary" disabled={!farm.inventory[item]} onClick={() => onAction({ type: "sell", item, quantity: farm.inventory[item] })}><Coins size={15} />{tr("售出", "Sell")}</button></div>; })}</div></>}
    </div>
    <footer className="farm-footer"><span>{saved ? tr("个人牧场 · 已保存在本机", "Personal farm · saved on this device") : tr("本次进度未保存", "Progress could not be saved")}</span><button className="text-link" onClick={() => onGo(plot.id)}>{tr("走进山谷", "Into the valley")}<ArrowRight size={15} /></button></footer>
  </div>;
}
