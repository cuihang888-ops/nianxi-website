export const homeSites=Object.freeze([
  Object.freeze({id:'yard',name:'林间宅地',x:-1.8,z:-3.4,price:300,front:Object.freeze({x:-2.95,z:3.4})}),
  Object.freeze({id:'lake-west',name:'湖西望水宅地',x:-28,z:-26.5,width:10,depth:9,price:520,front:Object.freeze({x:-28,z:-20})}),
  Object.freeze({id:'lake-center',name:'湖心观景宅地',x:-15.6,z:-28,width:13.7,depth:10.6,price:760,front:Object.freeze({x:-15.6,z:-20.6})}),
  Object.freeze({id:'lake-east',name:'湖东花岸宅地',x:-3.2,z:-26.5,width:10,depth:9,price:580,front:Object.freeze({x:-3.2,z:-20})}),
]);

export const homeSiteById=id=>homeSites.find(site=>site.id===id);
export const houseFitsSite=(house,site)=>!site.width||
  (house.width+.6<=site.width&&house.depth+.6<=site.depth);
