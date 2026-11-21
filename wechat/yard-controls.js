const actionLabels={
  season:'春', 'time-of-day':'白天', interact:'摸摸小羊', water:'给菜地浇水',
  market:'去集市', 'home-route':'回林间小院', livestock:'围栏买卖', mount:'骑马', land:'买地',
  'build-house':'建房', 'shop-homes':'买房', 'housing-close':'关闭',
  'home-sites':'宅基地', 'buy-home-site':'买下宅地', 'sell-home-site':'卖出空宅地', 'visit-home-site':'去看地',
  'housing-market':'去集市办理建房', 'rename-player':'改名字',
  'land-kind':'农田', 'land-smaller':'缩小', 'land-larger':'放大', 'pen-land':'选地建围栏',
  fishing:'下竿', 'lake-route':'去湖边', 'pen-route':'去围栏',
  reel:'收竿', 'buy-plot':'买地', zoom:'近看', eat:'吃饭', 'market-help':'领开荒补助',
  sow:'播种', irrigate:'浇水', fertilize:'施肥', harvest:'收获', 'buy-seed':'购买种子',
  'sell-crops':'卖出收成', 'sell-plot':'退回空田', 'sell-goods':'卖出畜产',
  'sell-fish':'卖出鱼获', 'house-upgrade':'开工建造', 'house-sell':'挂牌出售宅院',
  'house-repair':'修缮住宅', 'buy-used-house':'买入宅院',
  'house-cancel-sale':'取消挂牌', 'switch-player':'切换试玩角色',
};

function control(textContent=''){
  const listeners=new Map();
  const attributes=new Map();
  return {
    textContent,children:[],dataset:{},hidden:false,disabled:false,open:false,value:'',
    append(...children){this.children.push(...children);},
    add(option){this.append(option);if(this.children.length===1)this.value=String(option.value);},
    replaceChildren(...children){this.children=children;},
    setAttribute(key,value){attributes.set(key,value);},
    getAttribute(key){return attributes.get(key);},
    scrollIntoView(){},
    addEventListener(name,listener){listeners.set(name,listener);},
    fire(name='click'){if(!this.hidden&&!this.disabled)listeners.get(name)?.({currentTarget:this});},
  };
}

/**
 * Scoped controls for the native canvas surface. Gameplay callbacks use the
 * same controls as the browser and keep the platform's UI outside the rules.
 */
export function createYardControls(){
  const elements=new Map();
  const actions=new Map(Object.entries(actionLabels).map(([id,label])=>{
    const button=control(label);
    button.dataset.action=id;
    return [id,button];
  }));
  function element(id){
    if(!elements.has(id))elements.set(id,control());
    return elements.get(id);
  }
  for(const id of ['reel','home-route','buy-plot','market-help','sell-plot','house-upgrade','house-sell','house-repair','buy-used-house','house-cancel-sale','switch-player']){
    actions.get(id).hidden=true;
  }
  const choices=type=>type==='house'
    ? [...element('houses').children,...element('heritage-houses').children]
    : element('avatars').children;
  const document={
    createElement:()=>control(),
    getElementById:element,
    querySelector(selector){return actions.get(selector.slice(13,-1));},
    querySelectorAll(selector){return selector==='[data-action]'?[...actions.values()]:choices(selector.slice(6,-1));},
  };
  element('message').textContent='想安家，可以直接点「买地」「建房」或「买房」。';
  return {document,actions,element,choices,createOption:(textContent,value)=>({textContent,value})};
}

const ink='#2b493c';
const pale='#fff9ec';
const border='#d3d8be';
const muted='#5d7060';
const marketTabs=[['farm','田地'],['market','养殖'],['fish','鱼获'],['house','宅院']];
const ownerTabs=[...marketTabs,['city','城主']];
const travelActions=['market','home-route','land'];
const housingActions=['land','build-house','shop-homes','home-sites'];
const surveyActions=['land-kind','land-smaller','land-larger','buy-plot','sell-plot'];
const surveyLabels=['land-legend','land-quote'];
const surveyColors=['#315b34','#385c89','#844d4e'];
const localActions=['fishing','reel','sow','irrigate','fertilize','harvest','interact','livestock','mount'];
const panelTitles={farm:'田地与农产',market:'牲畜与饲料',fish:'出售鱼获',house:'建房与升级',estate:'买房',site:'宅基地',city:'城主账本',pen:'围栏',settings:'菜单'};
const inventoryLabels=['livestock-capacity','goods-basket','livestock-result','livestock-storage'];
const panelContent={
  farm:{actions:['buy-seed','sell-crops'],labels:['farm-plot-state','crop-price','farm-inventory','farm-feedback'],pickers:['plot-picker','crop-picker']},
  market:{actions:['sell-goods'],labels:inventoryLabels},
  pen:{actions:['pen-land'],labels:inventoryLabels},
  fish:{actions:['sell-fish'],labels:['fish-basket','fish-quote','fish-feedback','fish-catalog']},
  house:{actions:['housing-market','switch-player','house-sell','house-cancel-sale','buy-used-house','house-upgrade','house-repair'],
    labels:['market-status','housing-guide','housing-result','estate-summary','estate-confirm','home-site-status','product-name','house-progress','house-price',
      'product-floor-plan','product-silhouette','product-experience','product-expansion'],choice:'house',pickers:['home-site-picker']},
  estate:{actions:['housing-market','buy-used-house'],labels:['housing-guide','estate-summary','housing-result']},
  site:{actions:['buy-home-site','sell-home-site','visit-home-site'],labels:['housing-guide','home-site-status','home-site-price','housing-result'],pickers:['home-site-picker']},
  city:{actions:['switch-player'],labels:['player-role','city-balance','city-receipts']},
  settings:{actions:['lake-route','pen-route','season','time-of-day','eat','market-help'],choice:'avatar'},
};

const label=node=>node.textContent||node.children?.map(label).join(' · ')||'';

function wrap(ctx,text,maxWidth,limit){
  const lines=[];
  let line='';
  for(const character of text){
    const next=line+character;
    if(line&&ctx.measureText(next).width>maxWidth){
      lines.push(line);
      if(lines.length===limit){
        lines[limit-1]=lines[limit-1].slice(0,-1)+'…';
        return lines;
      }
      line=character;
    }else line=next;
  }
  if(line)lines.push(line);
  return lines;
}

export function createYardCanvasUI(controls,canvas){
  const ctx=canvas.getContext('2d');
  const {actions,element,choices}=controls;
  let viewport,active='',scroll=0,maxScroll=0,clipTop=0,clipBottom=0;
  let hits=[],last='',drag=null,dirty=true,marketOpen=false,penOpen=false,surveyOpen=false,housingMode='';
  let lastMessage='',noticeUntil=0;
  let stick={x:0,y:0,radius:42},stickTouch=null,stickX=0,stickY=0;
  function resize(value,pixelRatio=1){
    viewport=value;
    const width=Math.max(1,Math.round(value.width*pixelRatio));
    const height=Math.max(1,Math.round(value.height*pixelRatio));
    if(canvas.width!==width)canvas.width=width;
    if(canvas.height!==height)canvas.height=height;
    ctx.setTransform(width/value.width,0,0,height/value.height,0,0);
    stick={x:value.safeLeft+57,y:value.height-value.safeBottom-56,radius:42};
    scroll=0;
    dirty=true;
  }
  function round(x,y,w,h,r){
    ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);
    else{
      ctx.moveTo(x+r,y);
      ctx.arcTo(x+w,y,x+w,y+h,r);
      ctx.arcTo(x+w,y+h,x,y+h,r);
      ctx.arcTo(x,y+h,x,y,r);
      ctx.arcTo(x,y,x+w,y,r);
      ctx.closePath();
    }
  }
  function plate(x,y,w,h,fill=pale){
    round(x,y,w,h,9);
    ctx.fillStyle=fill;
    ctx.fill();
    ctx.strokeStyle=border;
    ctx.lineWidth=1;
    ctx.stroke();
  }
  function text(value,x,y,size=13,color=ink){
    ctx.textAlign='left';
    ctx.textBaseline='middle';
    ctx.font=size+'px sans-serif';
    ctx.fillStyle=color;
    ctx.fillText(value,x,y);
  }
  function button(id,node,x,y,w,h=35,onTap,pressed=false,clipped=false,caption){
    if(!node||node.hidden)return;
    const disabled=node.disabled;
    plate(x,y,w,h,pressed||node.getAttribute?.('aria-pressed')==='true'?'#dce9ce':disabled?'#efeee2':pale);
    ctx.font='13px sans-serif';
    const content=wrap(ctx,caption??label(node),w-12,2);
    content.forEach((line,index)=>text(line,x+6,y+h/2+(index-(content.length-1)/2)*14,13,disabled?muted:ink));
    if(clipped){
      const bottom=Math.min(clipBottom,y+h);
      y=Math.max(y,clipTop);
      h=bottom-y;
    }
    if(h>0)hits.push({id,x,y,w,h,disabled,activate:disabled?()=>{}:onTap||(()=>node.fire())});
  }
  const action=(id,x,y,w,h,clipped)=>button(id,actions.get(id),x,y,w,h,null,false,clipped);
  function picker(id,x,y,w,clipped=true,height=35){
    const node=element(id);
    const selected=node.children.find(child=>String(child.value)===String(node.value))??node.children[0];
    if(!selected)return;
    button(id,control(label(selected)+' ▸'),x,y,w,height,()=>{
      const index=node.children.indexOf(selected);
      const next=node.children[(index+1)%node.children.length];
      if(next){node.value=String(next.value);node.fire('change');}
    },false,clipped);
  }
  function switchMenu(value){
    const next=active===value?'':value;
    if(housingMode&&active===housingMode&&next!==housingMode)actions.get('housing-close').fire();
    if(active==='pen'&&next!=='pen'){
      element('livestock-market').open=false;
      penOpen=false;
    }
    active=next;
    scroll=0;
    dirty=true;
  }
  function drawJoystick(){
    const {x,y,radius}=stick;
    ctx.beginPath();
    ctx.arc(x,y,radius,0,2*Math.PI);
    ctx.fillStyle=stickTouch===null?'#fff9ec99':'#fff9ecda';
    ctx.fill();
    ctx.lineWidth=1.5;
    ctx.strokeStyle='#697c61ae';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x+stickX*26,y+stickY*26,15,0,2*Math.PI);
    ctx.fillStyle=stickTouch===null?'#77916bdd':'#6f8a62';
    ctx.fill();
    ctx.strokeStyle='#fff9ecdd';
    ctx.stroke();
  }
  function drawSurvey(x,bottom,width){
    const selectedActions=surveyActions.filter(id=>!actions.get(id).hidden);
    const padding=8,gap=4,buttonHeight=44;
    const inside=width-padding*2;
    ctx.font='13px sans-serif';
    const quote=wrap(ctx,label(element('land-quote')),inside,3);
    const legend=label(element('land-legend')).split(' · ');
    const height=padding*2+17+quote.length*16+buttonHeight+gap;
    const y=bottom-height;
    plate(x,y,width,height);
    hits.push({id:'land-survey',x,y,w:width,h:height,activate:()=>{}});
    let legendX=x+padding;
    for(const [index,entry] of legend.entries()){
      text(entry,legendX,y+padding+6,11,surveyColors[index]??muted);
      legendX+=ctx.measureText(entry).width+8;
    }
    quote.forEach((line,index)=>text(line,x+padding,y+padding+24+index*16));
    const buttonWidth=(inside-(selectedActions.length-1)*gap)/selectedActions.length;
    for(const [index,id] of selectedActions.entries()){
      const node=actions.get(id);
      const caption=id==='buy-plot'?'确认买入':id==='sell-plot'?'卖出':node.textContent.replace('用途 · ','');
      button(id,node,x+padding+index*(buttonWidth+gap),bottom-padding-buttonHeight,buttonWidth,buttonHeight,null,false,false,caption);
    }
  }
  function draw(){
    if(!viewport)return false;
    const {width,height,safeTop,safeBottom,safeLeft,safeRight}=viewport;
    const context=element('yard-context');
    const place=context.dataset.kind||context.value;
    const surveying=element('land-survey').open;
    if(surveying!==surveyOpen){
      surveyOpen=surveying;
      if(surveyOpen){active='';scroll=0;}
      dirty=true;
    }
    const atMarket=!surveyOpen&&element('city-market').open;
    const requestedHousing=element('housing-panel').dataset.mode||'';
    const atPen=!surveyOpen&&!actions.get('livestock').hidden&&!atMarket&&element('livestock-market').open;
    if(atMarket!==marketOpen){
      marketOpen=atMarket;
      active=atMarket?'house':'';
      scroll=0;
      dirty=true;
    }
    if(atPen!==penOpen){
      penOpen=atPen;
      if(atPen||active==='pen'){
        active=atPen?'pen':'';
        scroll=0;
        dirty=true;
      }
    }
    if(housingMode!==requestedHousing){
      if(!requestedHousing&&active===housingMode&&!marketOpen)active='';
      if(requestedHousing)active=requestedHousing;
      housingMode=requestedHousing;
      scroll=0;
      dirty=true;
    }
    const isOwner=!element('city-balance').hidden;
    if(active==='city'&&!isOwner)switchMenu('house');
    const message=label(element('message'));
    const now=Date.now();
    if(message!==lastMessage){
      lastMessage=message;
      noticeUntil=now+4800;
    }
    const notice=now<noticeUntil?message:'';
    const local=marketOpen||surveyOpen||active?[]:localActions.filter(id=>!actions.get(id).hidden);
    const chooseCrop=local.includes('sow');
    const content=panelContent[active];
    const actionState=id=>{
      const node=actions.get(id);
      return [id,node.textContent,node.hidden,node.disabled,node.getAttribute('aria-pressed')];
    };
    const labelState=id=>{
      const node=element(id);
      return node.hidden?'':label(node);
    };
    const pickerState=id=>{
      const node=element(id);
      return [node.value,node.children.map(label)];
    };
    const mark=JSON.stringify([
      marketOpen,surveyOpen,isOwner,active,housingMode,scroll,active||surveyOpen?'':notice,active||surveyOpen?'':context.textContent,
      [...travelActions,...housingActions,'rename-player',...local,...(surveyOpen?surveyActions:content?.actions??[])].map(actionState),
      ['avenue-location','farm-status',...(surveyOpen?surveyLabels:content?.labels??[])].map(labelState),
      (chooseCrop?['crop-picker']:content?.pickers??[]).map(pickerState),
      content?.choice?choices(content.choice).map(node=>[label(node),node.getAttribute('aria-pressed')]):null,
      active==='market'||active==='pen'
        ?element('livestock-inventory').children.map(row=>[label(row),row.children[2].children.map(node=>[node.hidden,node.disabled])])
        :null,
    ]);
    if(!dirty&&mark===last)return false;
    dirty=false;
    last=mark;
    hits=[];
    ctx.clearRect(0,0,width,height);
    const left=safeLeft+8;
    const usable=width-left-safeRight-8;
    const top=safeTop+7;
    const bottom=height-safeBottom-7;
    const right=left+usable;
    const hudWidth=Math.min(usable-(surveyOpen?0:126),210);
    plate(left,top,hudWidth,46);
    text(surveyOpen?'安和里 · 选地':marketOpen?'安和里 · 瑞丽集市':'安和里 · 林间小院',left+8,top+11,15);
    text(label(element('farm-status')),left+8,top+32,12);
    if(!surveyOpen){
      action('rename-player',right-118,top,64,42);
      button('tab-settings',control('菜单'),right-48,top,48,42,()=>switchMenu('settings'),active==='settings');
      const quickWidth=(Math.min(usable,307)-15)/4;
      housingActions.forEach((id,index)=>button(id,actions.get(id),left+index*(quickWidth+5),top+52,quickWidth,42,null,
        id==='build-house'&&active==='house'||id==='shop-homes'&&active==='estate'||id==='home-sites'&&active==='site'));
    }
    const location=element('avenue-location');
    if(!location.hidden&&location.textContent){
      ctx.font='13px sans-serif';
      const y=top+(surveyOpen?52:100);
      plate(left,y,ctx.measureText(location.textContent).width+14,25);
      text(location.textContent,left+7,y+12,13);
    }

    drawJoystick();
    const stripX=Math.max(stick.x+stick.radius+9,right-380);
    const stripWidth=right-stripX;
    const travel=travelActions.filter(id=>!actions.get(id).hidden&&(id!=='land'||surveyOpen));
    const travelWidth=(stripWidth-(travel.length-1)*5)/travel.length;
    travel.forEach((id,index)=>action(id,stripX+index*(travelWidth+5),bottom-42,travelWidth,42));
    let panelBottom=bottom-50;
    if(surveyOpen){
      drawSurvey(stripX,panelBottom,stripWidth);
      return true;
    }
    if(marketOpen){
      const tabs=isOwner?ownerTabs:marketTabs;
      const tabWidth=(stripWidth-(tabs.length-1)*4)/tabs.length;
      tabs.forEach(([id,name],index)=>button('tab-'+id,control(name),stripX+index*(tabWidth+4),panelBottom-40,tabWidth,40,()=>{
        if(id==='house'&&housingMode&&active==='house'){
          actions.get('housing-close').fire();
          scroll=0;
          dirty=true;
        }else switchMenu(id);
      },active===id));
      panelBottom-=48;
    }else if(!active){
      if(place&&context.textContent){
        ctx.font='13px sans-serif';
        const contextWidth=Math.min(stripWidth,Math.max(136,ctx.measureText(context.textContent).width+22));
        plate(right-contextWidth,panelBottom-28,contextWidth,28);
        text(context.textContent,right-contextWidth+8,panelBottom-14,13);
        panelBottom-=35;
      }
      const count=local.length+Number(chooseCrop);
      if(count){
        const columns=Math.min(count,stripWidth<290?2:3);
        const actionWidth=(stripWidth-(columns-1)*5)/columns;
        panelBottom-=Math.ceil(count/columns)*45;
        let index=0;
        if(chooseCrop){
          picker('crop-picker',stripX,panelBottom,actionWidth,false,41);
          index++;
        }
        for(const id of local){
          action(id,stripX+(index%columns)*(actionWidth+5),panelBottom+Math.floor(index/columns)*45,actionWidth,41);
          index++;
        }
      }
    }
    if(!active){
      ctx.font='12px sans-serif';
      const lines=wrap(ctx,notice,Math.max(0,stripWidth-18),2);
      if(lines.length){
        const w=Math.min(stripWidth,Math.max(...lines.map(item=>ctx.measureText(item).width))+18);
        const y=panelBottom-lines.length*15-13;
        plate(right-w,y,w,lines.length*15+6);
        lines.forEach((item,index)=>text(item,right-w+9,y+11+index*15,12));
      }
      return true;
    }

    const portrait=width<height;
    if(portrait)panelBottom=Math.min(panelBottom,stick.y-stick.radius-7);
    const panelWidth=Math.min(portrait?usable:stripWidth,433);
    const panelX=right-panelWidth;
    const overlapsQuickActions=panelX<left+Math.min(usable,307);
    const panelY=Math.max(top+(overlapsQuickActions?102:51),panelBottom-Math.min(height*.58,382));
    const panelHeight=panelBottom-panelY;
    if(panelHeight<75)return true;
    plate(panelX,panelY,panelWidth,panelHeight);
    const panelLeft=panelX+7;
    const inside=panelWidth-14;
    clipTop=panelY+44;
    clipBottom=panelY+panelHeight-4;
    hits.push({id:'menu-panel',x:panelX,y:panelY,w:panelWidth,h:panelHeight,activate:()=>{}});
    text(panelTitles[active],panelLeft+2,panelY+22,15);
    button('close-panel',control('关闭'),right-57,panelY+4,50,36,()=>switchMenu(active));
    let y=clipTop-scroll;
    ctx.save();
    ctx.beginPath();
    ctx.rect(panelLeft,clipTop,inside,clipBottom-clipTop);
    ctx.clip();
    const line=(id,size=12)=>{
      const node=element(id);
      const value=node.hidden?'':label(node);
      if(!value)return;
      ctx.font=size+'px sans-serif';
      for(const item of wrap(ctx,value,inside-6,4)){
        text(item,panelLeft+2,y+8,size,muted);
        y+=17;
      }
      y+=3;
    };
    const actionRow=(ids,onTap)=>{
      const shown=ids.filter(id=>actions.has(id)&&!actions.get(id).hidden);
      if(!shown.length)return;
      const columns=Math.min(shown.length,3);
      const w=(inside-4*(columns-1))/columns;
      shown.forEach((id,index)=>button(id,actions.get(id),panelLeft+(index%columns)*(w+4),y+Math.floor(index/columns)*42,w,38,onTap?()=>onTap(id):null,false,true));
      y+=Math.ceil(shown.length/columns)*42;
    };
    const choicesGrid=(nodes,type)=>{
      for(let index=0;index<nodes.length;index+=2){
        const w=(inside-4)/2;
        nodes.slice(index,index+2).forEach((node,column)=>button(type+'-'+node.dataset[type],node,panelLeft+column*(w+4),y,w,35,null,false,true));
        y+=39;
      }
    };
    if(marketOpen&&active==='house'&&!housingMode)line('market-status',14);
    if(active==='farm'){
      line('farm-plot-state');
      picker('plot-picker',panelLeft,y,(inside-4)/2);
      picker('crop-picker',panelLeft+(inside+4)/2,y,(inside-4)/2);
      y+=39;
      line('crop-price');
      actionRow(['buy-seed']);
      line('farm-inventory');
      actionRow(['sell-crops']);
      line('farm-feedback');
    }else if(active==='market'||active==='pen'){
      if(active==='pen')actionRow(['pen-land']);
      line('livestock-capacity');
      line('goods-basket');
      if(active==='market')actionRow(['sell-goods']);
      line('livestock-result');
      if(!element('livestock-storage').hidden)line('livestock-storage');
      for(const row of element('livestock-inventory').children){
        const [title,subtitle,group]=row.children;
        const buttons=group.children.filter(node=>!node.hidden&&(active==='pen'||!node.dataset.livestockCare));
        text(label(title),panelLeft+2,y+8,13);
        y+=19;
        ctx.font='12px sans-serif';
        wrap(ctx,label(subtitle),inside-6,2).forEach(item=>{text(item,panelLeft+2,y+8,12,muted);y+=16;});
        if(buttons.length){
          const w=(inside-4*(buttons.length-1))/buttons.length;
          buttons.forEach((node,index)=>button('market-'+Object.keys(node.dataset)[0]+'-'+row.dataset.livestock,node,panelLeft+index*(w+4),y,w,33,null,false,true));
          y+=39;
        }
      }
    }else if(active==='fish'){
      line('fish-basket',13);
      line('fish-quote');
      if(marketOpen)actionRow(['sell-fish']);
      line('fish-feedback');
      line('fish-catalog');
    }else if(active==='house'){
      if(marketOpen&&!housingMode){
        actionRow(['switch-player']);
        line('estate-summary');
        line('estate-confirm');
        actionRow(['house-sell','house-cancel-sale','buy-used-house']);
      }
      if(housingMode)line('housing-guide',13);
      picker('home-site-picker',panelLeft,y,inside);
      y+=40;
      line('product-name',14);
      line('house-progress',13);
      line('house-price',13);
      actionRow(['housing-market','house-upgrade','house-repair']);
      line('housing-result');
      choicesGrid(choices('house'),'house');
      for(const id of ['product-floor-plan','product-silhouette','product-experience','product-expansion'])line(id);
    }else if(active==='estate'){
      line('estate-summary',14);
      line('housing-guide');
      actionRow(['housing-market','buy-used-house']);
      line('housing-result');
    }else if(active==='site'){
      picker('home-site-picker',panelLeft,y,inside);
      y+=40;
      line('home-site-status',14);
      line('home-site-price',13);
      actionRow(['buy-home-site','sell-home-site','visit-home-site']);
      line('housing-result');
      line('housing-guide');
    }else if(active==='city'){
      line('player-role',13);
      line('city-balance',14);
      actionRow(['switch-player']);
      line('city-receipts');
    }else if(active==='settings'){
      actionRow(['lake-route','pen-route'],id=>{
        actions.get(id).fire();
        switchMenu('settings');
      });
      actionRow(['season','time-of-day']);
      actionRow(['eat','market-help']);
      choicesGrid(choices('avatar'),'avatar');
    }
    ctx.restore();
    maxScroll=Math.max(0,y+scroll-clipBottom);
    if(scroll>maxScroll){scroll=maxScroll;dirty=true;}
    return true;
  }
  function hit(x,y){
    for(let index=hits.length-1;index>=0;index--){
      const box=hits[index];
      if(x>=box.x&&x<=box.x+box.w&&y>=box.y&&y<=box.y+box.h)return box;
    }
  }
  function joystickMove(point){
    const offsetX=point.x-stick.x,offsetY=point.y-stick.y;
    const distance=Math.hypot(offsetX,offsetY);
    const deadZone=7,travel=stick.radius-10;
    const intensity=Math.max(0,Math.min(1,(distance-deadZone)/(travel-deadZone)));
    stickX=distance?offsetX/distance*intensity:0;
    stickY=distance?offsetY/distance*intensity:0;
    dirty=true;
  }
  function overJoystick(point){
    return Math.hypot(point.x-stick.x,point.y-stick.y)<=stick.radius+5;
  }
  function joystickStart(point){
    if(stickTouch!==null||hit(point.x,point.y)||!overJoystick(point))return false;
    stickTouch=point.id;
    joystickMove(point);
    return true;
  }
  function releaseJoystick(){
    stickTouch=null;
    stickX=0;
    stickY=0;
    dirty=true;
  }
  function joystickTouch(point,type){
    if(stickTouch===null||point.id!==stickTouch)return false;
    if(type==='move')joystickMove(point);
    else if(type==='end')releaseJoystick();
    return true;
  }
  function touchStart(point){
    const target=hit(point.x,point.y);
    if(!target)return false;
    const panel=hits.find(box=>box.id==='menu-panel');
    const inPanel=!!panel&&point.x>=panel.x&&point.x<=panel.x+panel.w&&point.y>=panel.y&&point.y<=panel.y+panel.h;
    drag={target,startX:point.x,startY:point.y,lastY:point.y,scroll:inPanel,moved:false};
    return true;
  }
  function touchMove(point){
    if(!drag)return;
    if(Math.hypot(point.x-drag.startX,point.y-drag.startY)>7)drag.moved=true;
    if(drag.moved&&drag.scroll){
      scroll=Math.max(0,Math.min(maxScroll,scroll+drag.lastY-point.y));
      dirty=true;
    }
    drag.lastY=point.y;
  }
  function touchEnd(point){
    if(drag&&!drag.moved&&hit(point.x,point.y)?.id===drag.target.id){drag.target.activate();dirty=true;}
    drag=null;
  }
  return {
    resize,draw,touchStart,touchMove,touchEnd,joystickStart,joystickTouch,
    hitsControl:point=>overJoystick(point)||!!hit(point.x,point.y),
    movement:()=>({x:stickX,y:stickY}),
    cancel(){drag=null;releaseJoystick();},
    snapshot:()=>({
      menu:active,scroll,survey:surveyOpen,
      context:element('yard-context').dataset.kind||element('yard-context').value,
      joystick:{...stick,dx:stickX,dy:stickY,active:stickTouch!==null},
      buttons:hits.map(({id,x,y,w,h,disabled=false})=>({id,x,y,w,h,disabled})),
    }),
  };
}
