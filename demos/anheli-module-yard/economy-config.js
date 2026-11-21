function livestock(name, price, resale, product, value, seconds, feedPrice) {
  return Object.freeze({name,price,resale,product,value,seconds,feedPrice});
}

export const livestockTypes=Object.freeze({
  sheep:livestock('羊',260,215,'羊毛',32,65,17),
  chicken:livestock('鸡',140,110,'鸡蛋',16,35,9),
  duck:livestock('鸭',160,130,'鸭蛋',19,45,10),
  goose:livestock('鹅',200,165,'鹅蛋',24,55,13),
  rabbit:livestock('兔子',180,145,'兔毛',22,55,11),
  cattle:livestock('牛',430,365,'牛奶',42,95,20),
  horse:Object.freeze({name:'马',price:760,resale:700}),
});

function crop(name, product, price, value, yieldCount, seconds, energy) {
  return Object.freeze({name,product,price,value,yield:yieldCount,seconds,...(energy?{energy}:{})});
}

export const crops=Object.freeze({
  rice:crop('水稻','稻米',22,12,3,24,30),
  corn:crop('玉米','玉米',30,17,3,32,24),
  tobacco:crop('烟叶','烟叶',39,22,3,50),
  coffee:crop('咖啡','咖啡豆',50,30,3,70),
  tea:crop('茶','茶叶',42,19,4,58),
});

export const fishMarket=Object.freeze({fullPriceCount:5,surplusRate:.35});
export const fishBasketCapacity=12;
export const cropFertilizer=Object.freeze({energy:2,growthTimeMultiplier:.75});
