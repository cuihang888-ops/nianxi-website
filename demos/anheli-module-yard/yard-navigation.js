export function openSegment(from,to,blocked) {
  const samples=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.16));
  for(let i=1;i<=samples;i++){
    const t=i/samples;
    if(blocked(from.x+(to.x-from.x)*t,from.z+(to.z-from.z)*t)) return false;
  }
  return true;
}

export function routeThroughYard(from,to,bounds,blocked) {
  if(openSegment(from,to,blocked)) return [to];

  const step=.4;
  const columns=Math.floor((bounds.maxX-bounds.minX)/step)+1;
  const rows=Math.floor((bounds.maxZ-bounds.minZ)/step)+1;
  const point=index=>({x:bounds.minX+(index%columns)*step,z:bounds.minZ+Math.floor(index/columns)*step});
  const toIndex=(column,row)=>row*columns+column;
  const distance=spot=>Math.hypot(spot.x-to.x,spot.z-to.z);
  const path=new Int32Array(columns*rows).fill(-2);
  const queue=[];
  const firstColumn=Math.round((from.x-bounds.minX)/step);
  const firstRow=Math.round((from.z-bounds.minZ)/step);
  for(let row=Math.max(0,firstRow-1);row<=Math.min(rows-1,firstRow+1);row++){
    for(let column=Math.max(0,firstColumn-1);column<=Math.min(columns-1,firstColumn+1);column++){
      const index=toIndex(column,row);
      if(!openSegment(from,point(index),blocked)) continue;
      path[index]=-1;
      queue.push(index);
    }
  }
  for(let i=0;i<queue.length;i++){
    const current=queue[i],here=point(current);
    if(distance(here)<.72&&openSegment(here,to,blocked)){
      const route=[to];
      for(let node=current;node>=0;node=path[node]) route.push(point(node));
      route.reverse();
      const turns=[];
      let anchor=from;
      let cursor=0;
      while(cursor<route.length){
        let next=route.length-1;
        while(next>cursor&&!openSegment(anchor,route[next],blocked)) next--;
        anchor=route[next];
        turns.push(anchor);
        cursor=next+1;
      }
      return turns;
    }
    const column=current%columns,row=Math.floor(current/columns);
    for(const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]){
      const c=column+dx,r=row+dz;
      if(c<0||c>=columns||r<0||r>=rows) continue;
      const index=toIndex(c,r);
      if(path[index]!==-2||!openSegment(here,point(index),blocked)) continue;
      path[index]=current;
      queue.push(index);
    }
  }
  return [];
}
