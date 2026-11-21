function fish(name,value,weight,favoredSeason,hours) {
  return Object.freeze({name,value,weight,favoredSeason,hours:Object.freeze(hours)});
}

export const fishCatalog=Object.freeze({
  crucian:fish('鲫鱼',7,25,'spring',[6,10]),
  carp:fish('鲤鱼',9,18,'spring',[5,9]),
  mudCarp:fish('鲮鱼',10,15,'summer',[10,17]),
  grassCarp:fish('草鱼',12,13,'summer',[7,15]),
  silverCarp:fish('鲢鱼',12,11,'summer',[10,16]),
  bigheadCarp:fish('鳙鱼',15,9,'autumn',[8,17]),
  culter:fish('翘嘴鲌',18,7,'autumn',[16,21]),
  yellowCatfish:fish('黄颡鱼',18,6,'summer',[18,4]),
  snakehead:fish('乌鳢',22,5,'summer',[6,10]),
  mandarin:fish('鳜鱼',26,4,'winter',[17,23]),
});

const seasonAliases=Object.freeze({春:'spring',夏:'summer',秋:'autumn',冬:'winter'});
const species=Object.entries(fishCatalog);

function selectFish(random,season,hour) {
  const currentSeason=Object.hasOwn(seasonAliases,season)?seasonAliases[season]:season;
  const weights=species.map(([,type])=>{
    const [start,end]=type.hours;
    const active=start<end?hour>=start&&hour<end:hour>=start||hour<end;
    return type.weight*(currentSeason===type.favoredSeason?1.7:1)*(active?1.55:1);
  });
  let remaining=random()*weights.reduce((sum,weight)=>sum+weight,0);
  for(let index=0;index<species.length;index++){
    remaining-=weights[index];
    if(remaining<0)return species[index][0];
  }
  return species.at(-1)[0];
}

export function createFishing(random=Math.random) {
  let line=null;

  function cast(now=Date.now(),season='spring',hour=12) {
    if(line||!Number.isFinite(now))return false;
    const delay=3000+Math.floor(random()*3000);
    line={biteAt:now+delay,fishId:selectFish(random,season,hour)};
    return true;
  }

  function snapshot(now=Date.now()) {
    if(!line)return {phase:'idle',biteAt:null,remainingMs:0};
    const remainingMs=Math.max(0,line.biteAt-now);
    return {phase:remainingMs?'waiting':'bite',biteAt:line.biteAt,remainingMs};
  }

  function reel(now=Date.now()) {
    if(!line||!Number.isFinite(now)||now<line.biteAt)return null;
    const {fishId}=line;
    line=null;
    return fishId;
  }

  function cancel(){line=null;}

  return {cast,snapshot,reel,cancel};
}
