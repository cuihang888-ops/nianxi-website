export const residentIds=Object.freeze(['resident','buyer']);

export function listYardEstate(city,price,now) {
  const sellerId=city.residentId;
  const owner=city.residents[sellerId];
  // Each paddock is an owned parcel. Its residents keep the same parcel ID when the estate changes hands.
  const {homeId,homeSiteId,homeSitePrice,homeRecords,ownedHomes,plots,animals}=owner;
  const listing={
    id:'estate-'+city.nextListingId,sellerId,price,listedAt:now,
    homeId,homeSiteId,homeSitePrice,homeRecords,ownedHomes,plots,animals,
  };
  const resident={
    ...owner,homeId:null,homeSiteId:'yard',homeSitePrice:0,homeRecords:{},ownedHomes:[],plots:[],animals:[],homesteadOwned:false,
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
  const {price,homeId,homeSiteId,homeSitePrice,homeRecords,ownedHomes,plots,animals}=listing;
  const receipt={listingId:id,sellerId:listing.sellerId,buyerId,amount:price,settledAt:now};
  const resident={
    ...buyer,coins:buyer.coins-price,homesteadOwned:true,homeId,homeSiteId,homeSitePrice,homeRecords,ownedHomes,
    plots:[...buyer.plots,...plots],animals:[...buyer.animals,...animals],
    nextId:city.nextId,nextPlotId:city.nextPlotId,
  };
  return {
    ...city,listing:null,receipts:[...city.receipts,receipt],
    residents:{...city.residents,[buyerId]:resident},
  };
}
