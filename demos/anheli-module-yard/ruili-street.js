import {houseChoices} from './houses.js';

export const streetEast = 56;
export const streetWest = 18.15;
export const avenueEastStops = [[26,11.6],[39,12.1],[47,12.3],[60,13.1]];
const avenueStops = [
  [-35,10.4],[-23.5,11.55],[-17.3,11.7],[-10,12.5],[-1.05,12.5],
  [5.9,12.55],[12.7,11.85],[17.4,11.85],...avenueEastStops,
];
export const avenueHalfWidth = 1.57;
export const marketCenter = Object.freeze({x:34,z:8.25});
export const marketSquare = Object.freeze({west:27.5,east:40.5,north:3.6,south:10.55});

export function avenueZ(x) {
  for(let index=1;index<avenueStops.length;index++){
    const [right,zRight]=avenueStops[index];
    if(x>right)continue;
    const [left,zLeft]=avenueStops[index-1];
    const t=Math.min(1,Math.max(0,(x-left)/(right-left)));
    const blend=t*t*(3-2*t);
    return (1-blend)*zLeft+blend*zRight;
  }
  return avenueStops.at(-1)[1];
}

const frontage = [
  ['merchant',22.6,6.6,0], ['grand_estate',47.6,4.75,0],
  ['simple_shed',21.3,16.35,Math.PI], ['lumber_cabin',27.35,17.35,Math.PI],
  ['brick_dai',34.05,18.1,Math.PI], ['dai_stilt',42.1,19.4,Math.PI],
  ['myanmar_villa',51.65,18.85,Math.PI],
  ['official',24,-2.4,0], ['landlord',35.8,-1.8,0],
];
const houseById = new Map(houseChoices.map(house=>[house.id,house]));
export const streetHomes = Object.freeze(frontage.map(([id,x,z,yaw])=>
  Object.freeze({house:houseById.get(id),x,z,yaw})));

export const squareStalls = Object.freeze([
  {x:29.45,z:6.45,w:2.45,d:1.55,cloth:'#aaa86d',trim:'#e3ce9f',type:'produce'},
  {x:38.55,z:6.42,w:2.4,d:1.55,cloth:'#7d9e96',trim:'#c6dad0',type:'fish'},
  {x:29.45,z:9.2,w:2.35,d:1.45,cloth:'#bd8b78',trim:'#e5ba9c',type:'goods'},
  {x:38.55,z:9.2,w:2.35,d:1.45,cloth:'#b49c62',trim:'#edd29b',type:'produce'},
].map(Object.freeze));
export const marketHall = Object.freeze({x:34,z:5.2,w:4.65,d:2.65});
export const marketPlanters = Object.freeze([
  {x:31.3,z:9.88},{x:36.7,z:9.88},{x:27.9,z:7.9},{x:40.1,z:7.9},
].map(Object.freeze));

function contains(x,z,cx,cz,width,depth,pad=0){
  return Math.abs(x-cx)<width/2+pad&&Math.abs(z-cz)<depth/2+pad;
}

export function inMarket(x,z) {
  const {west,east,north,south}=marketSquare;
  return x>=west&&x<=east&&z>=north&&z<=south;
}

export function streetBlocks(x,z) {
  if(x<streetWest)return false;
  return streetHomes.some(({house,x:cx,z:cz})=>contains(x,z,cx,cz,house.width,house.depth,.18))||
    squareStalls.some(stall=>contains(x,z,stall.x,stall.z,stall.w,stall.d,.18))||
    contains(x,z,marketHall.x,marketHall.z,marketHall.w,marketHall.d,.18)||
    marketPlanters.some(plant=>contains(x,z,plant.x,plant.z,.64,.59,.12));
}

export function streetReserved(x,z,padding=0) {
  if(x<streetWest-padding)return false;
  const {west,east,north,south}=marketSquare;
  const inSquare=x>=west-padding&&x<=east+padding&&z>=north-padding&&z<=south+padding;
  const squareEntry=x>32.4-padding&&x<35.6+padding&&z>south-padding&&z<11.9+padding;
  return inSquare||squareEntry||streetHomes.some(({house,x:cx,z:cz,yaw})=>{
    const walkUp=Math.max(.8,house.approach.z-house.depth/2);
    const front=yaw===0?1:-1;
    return contains(x,z,cx,cz+front*walkUp/2,house.width+1.7,house.depth+walkUp+1.2,padding);
  });
}

export function streetTerrainBlend(x,z) {
  if(x<streetWest-2)return 0;
  const {west,east,north,south}=marketSquare;
  let gap=Math.max(west-x,x-east,north-z,z-south,0);
  for(const {house,x:cx,z:cz,yaw} of streetHomes){
    const front=yaw===0?1:-1;
    const walkUp=house.approach.z-house.depth/2;
    const houseGap=Math.max(Math.abs(x-cx)-house.width/2-.55,
      Math.abs(z-cz-front*walkUp/2)-(house.depth+walkUp)/2-.6);
    gap=Math.min(gap,houseGap);
  }
  const t=Math.min(1,Math.max(0,gap/1.8));
  return 1-t*t*(3-2*t);
}
