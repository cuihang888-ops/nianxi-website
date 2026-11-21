import {landMarket} from './economy-config.js';
import {avenueHalfWidth,avenueZ,marketSquare} from './ruili-street.js';

export const plotSizes=landMarket.sizes;
export const plotWidth=plot=>plot?.size??landMarket.legacySize;
export const plotPurpose=plot=>plot?.purpose??'field';
export const plotResaleValue=plot=>plot?.resale??landMarket.legacyResale;
export const paddockCapacity=plot=>plotPurpose(plot)==='paddock'?landMarket.paddockCapacities[plotWidth(plot)]??0:0;

export function plotsOverlap(first,second) {
  const combinedHalf=(plotWidth(first)+plotWidth(second))/2;
  return Math.abs(first.x-second.x)<combinedHalf&&Math.abs(first.z-second.z)<combinedHalf;
}

export function pointInPlot(point,plot) {
  const half=plotWidth(plot)/2;
  return Math.abs(point.x-plot.x)<=half&&Math.abs(point.z-plot.z)<=half;
}

export function quoteYardLand(plot) {
  const {x,z,size,purpose}=plot;
  const avenueDistance=Math.max(0,Math.abs(z-avenueZ(x))-avenueHalfWidth);
  const {west,east,north,south}=marketSquare;
  const marketDistance=Math.hypot(Math.max(0,west-x,x-east),Math.max(0,north-z,z-south));
  const avenuePremium=landMarket.avenuePremium*Math.max(0,1-avenueDistance/landMarket.avenueReach);
  const marketPremium=landMarket.marketPremium*Math.max(0,1-marketDistance/landMarket.marketReach);
  const fenceCost=purpose==='paddock'?4*size*landMarket.fencePerMeter:0;
  const price=Math.round(size*size*landMarket.basePerArea*(1+avenuePremium+marketPremium)+fenceCost);
  return {price,resale:Math.floor(price*landMarket.resaleRate),capacity:paddockCapacity(plot)};
}
