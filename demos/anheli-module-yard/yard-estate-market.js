export const residentIds=Object.freeze(['resident','buyer']);

export function listYardEstate(city,price,now) {
  const sellerId=city.residentId;
  const owner=city.residents[sellerId];
  const {homeId,homeRecords,ownedHomes,plots,animals}=owner;
  const listing={
    id:'estate-'+city.nextListingId,sellerId,price,listedAt:now,
    homeId,homeRecords,ownedHomes,plots,animals,
  };
  const resident={
    ...owner,homeId:null,homeRecords:{},ownedHomes:[],plots:[],animals:[],homesteadOwned:false,
  };
  return {
    ...city,nextListingId:city.nextListingId+1,listing,
    residents:{...city.residents,[sellerId]:resident},
  };
}

export function purchaseYardEstate(city,id,now) {
  const buyerId=city.residentId;
  const listing=city.listing;
  const buyer=city.residents[buyerId];
  if(!listing||listing.id!==id||listing.sellerId===buyerId||buyer.homesteadOwned||buyer.coins<listing.price)return null;
  const {price,homeId,homeRecords,ownedHomes,plots,animals}=listing;
  const receipt={listingId:id,sellerId:listing.sellerId,buyerId,amount:price,settledAt:now};
  const resident={
    ...buyer,coins:buyer.coins-price,homesteadOwned:true,homeId,homeRecords,ownedHomes,
    plots:[...buyer.plots,...plots],animals:[...buyer.animals,...animals],
    nextId:city.nextId,nextPlotId:city.nextPlotId,
  };
  return {
    ...city,listing:null,receipts:[...city.receipts,receipt],
    residents:{...city.residents,[buyerId]:resident},
  };
}
