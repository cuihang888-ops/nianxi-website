const seasons=['spring','summer','autumn','winter'];
const names=['春','夏','秋','冬'];
const hours=[7,12,18.7,23];
export const gameDayMilliseconds=240_000;
const seasonLength=3;

export function createYardClock(start=Date.now()){
  let offset=gameDayMilliseconds*(9/24);

  function read(now){
    const progress=(now-start+offset)/gameDayMilliseconds;
    const day=Math.floor(progress);
    const hour=(progress-day)*24;
    const index=((Math.floor(day/seasonLength)%seasons.length)+seasons.length)%seasons.length;
    return {day,season:seasons[index],seasonName:names[index],hour,
      period:hour<5.5||hour>=20?'夜晚':hour<9?'清晨':hour<17?'白天':'黄昏'};
  }

  return {
    read,
    nextSeason(){offset+=gameDayMilliseconds*seasonLength;},
    nextPeriod(now){
      const {hour}=read(now);
      const next=hours.find(time=>time>hour+.22)??hours[0]+24;
      offset+=(next-hour)*gameDayMilliseconds/24;
    },
  };
}
