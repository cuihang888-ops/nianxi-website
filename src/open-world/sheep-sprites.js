/** The exact wool, face and accessory drawing from the approved Mianmian sample. */
export const SHEEP_COLORS=[
  {n:'奶油',base:'#F6EDDB',deep:'#8C7860'},{n:'燕麦',base:'#E6D5B8',deep:'#7E6A52'},
  {n:'雾蓝',base:'#CBD8DA',deep:'#5F7276'},{n:'浅粉',base:'#F4D1C9',deep:'#8E655E'},
  {n:'苔绿',base:'#CBD8B3',deep:'#68794F'},{n:'云白',base:'#FBF7EF',deep:'#7C6B58'},
  {n:'可可',base:'#B79C87',deep:'#4F3E32'}];
export const SHEEP_HATS=[{key:'none',label:'无'},{key:'straw',label:'草帽'},{key:'knit',label:'针织帽'},
  {key:'flower',label:'小花冠'},{key:'party',label:'派对帽'},{key:'shell',label:'贝壳帽'},
  {key:'scarf',label:'围巾'},{key:'bell',label:'铃铛'}];

export function createSheepSpriteFactory(createCanvas) {
  if(typeof createCanvas!=='function')throw new TypeError('A Canvas factory is required');
  const COLORS=SHEEP_COLORS,HATS=SHEEP_HATS;
  var spriteCache={},sheepSpriteKeys=[],disposed=false;
var TAU = Math.PI * 2;
function clamp(v,a,b){return v<a?a:v>b?b:v}
function lerp(a,b,t){return a+(b-a)*t}
function smooth(t){return t*t*(3-2*t)}
function rnd(seed){var s=seed>>>0;return function(){s=(s*1664525+1013904223)>>>0;return s/4294967296}}
function rr(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);
  g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}

function drawHat(g,hat,hx,hy){
  var i,a;
  switch(hat){
    case 'straw':
      g.fillStyle='#CBA96F';g.beginPath();g.ellipse(hx,hy+12,54,16,0,0,TAU);g.fill();
      g.fillStyle='#E4C98F';g.beginPath();g.ellipse(hx,hy+9,54,15,0,0,TAU);g.fill();
      g.fillStyle='#D7B474';g.beginPath();g.ellipse(hx,hy-4,30,27,0,Math.PI,TAU);g.fill();
      g.fillStyle='rgba(150,110,60,.30)';g.fillRect(hx-30,hy-7,60,7);break;
    case 'knit':
      g.fillStyle='#C98E8E';g.beginPath();g.ellipse(hx,hy+2,33,22,0,Math.PI,TAU);g.fill();
      g.fillStyle='#D9A0A0';g.fillRect(hx-33,hy-4,66,10);
      g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1.6;
      for(i=-2;i<=2;i++){g.beginPath();g.moveTo(hx+i*11,hy-4);g.lineTo(hx+i*11,hy-26);g.stroke()}
      g.fillStyle='#EBD3D3';g.beginPath();g.arc(hx,hy-30,9,0,TAU);g.fill();break;
    case 'flower':
      g.strokeStyle='#B7C68F';g.lineWidth=3;
      g.beginPath();g.ellipse(hx,hy+6,36,12,0,0,TAU);g.stroke();
      var fc=['#F7E2A0','#F3C3C3','#FBF7EC','#D9C7E8','#F7D2AC'];
      for(i=0;i<5;i++){
        a=i/5*TAU-.5;var fx=hx+Math.cos(a)*34,fy=hy+6+Math.sin(a)*12;
        g.fillStyle=fc[i];
        for(var p=0;p<5;p++){var pa=p/5*TAU;
          g.beginPath();g.arc(fx+Math.cos(pa)*4,fy+Math.sin(pa)*4,3.4,0,TAU);g.fill()}
        g.fillStyle='#E8B85E';g.beginPath();g.arc(fx,fy,2.4,0,TAU);g.fill();
      }
      break;
    case 'party':
      g.fillStyle='#D9A6B0';g.beginPath();
      g.moveTo(hx-26,hy+8);g.lineTo(hx,hy-48);g.lineTo(hx+26,hy+8);g.closePath();g.fill();
      g.save();g.clip();g.fillStyle='#F6E7E9';
      for(i=-3;i<=3;i++){g.beginPath();g.moveTo(hx+i*16-6,hy+10);g.lineTo(hx+i*16+2,hy-50);
        g.lineTo(hx+i*16+10,hy-50);g.lineTo(hx+i*16+2,hy+10);g.closePath();g.fill()}
      g.restore();
      g.fillStyle='#F2D9A0';g.beginPath();g.arc(hx,hy-50,7,0,TAU);g.fill();break;
    case 'shell':
      g.fillStyle='#EFCDC4';g.beginPath();g.ellipse(hx,hy+10,38,16,0,Math.PI,TAU);g.fill();
      g.strokeStyle='rgba(190,140,130,.55)';g.lineWidth=2;
      for(i=1;i<6;i++){var t=i/6;g.beginPath();g.moveTo(hx,hy+10);
        g.lineTo(hx-38+76*t,hy+10-Math.sin(t*Math.PI)*32);g.stroke()}
      break;
    case 'scarf':
      g.fillStyle='#C7D3B0';g.beginPath();g.ellipse(hx-4,hy+22,36,12,.1,0,TAU);g.fill();
      g.fillStyle='#B3C29B';g.beginPath();g.moveTo(hx-34,hy+20);g.lineTo(hx-44,hy+56);
      g.lineTo(hx-26,hy+52);g.lineTo(hx-18,hy+22);g.closePath();g.fill();break;
    case 'bell':
      g.fillStyle='#B9873F';g.beginPath();g.ellipse(hx-4,hy+24,32,8,0,0,TAU);g.fill();
      g.fillStyle='#E7B85C';g.beginPath();g.moveTo(hx+30,hy+6);
      g.bezierCurveTo(hx+44,hy+8,hx+46,hy+26,hx+46,hy+30);g.lineTo(hx+14,hy+30);
      g.bezierCurveTo(hx+16,hy+18,hx+22,hy+8,hx+30,hy+6);g.fill();
      g.fillStyle='#C99A44';g.beginPath();g.arc(hx+30,hy+33,3.6,0,TAU);g.fill();break;
  }
}
function makeSheepSprite(ci,hat,flip,variant){
  var key=ci+'|'+hat+'|'+(flip?1:0)+'|'+variant;
  if(spriteCache[key]){
    sheepSpriteKeys.splice(sheepSpriteKeys.indexOf(key),1);sheepSpriteKeys.push(key);
    return spriteCache[key];
  }
  var S=320,cv=createCanvas();cv.width=S;cv.height=S;
  var g=cv.getContext('2d'),col=COLORS[ci];
  var hi0=HATS.findIndex(function(h){return h.key===hat});
  var R=rnd(917+variant*131+ci*17+hi0*71);
  g.save();if(flip){g.translate(S,0);g.scale(-1,1)}
  var bx=172,by=198,brx=84,bry=56;

  g.fillStyle=col.deep;g.globalAlpha=.92;
  var legs=[[bx-46,244],[bx-12,254],[bx+24,252],[bx+54,242]];
  for(var li=0;li<legs.length;li++){rr(g,legs[li][0]-8,legs[li][1],16,316-legs[li][1],8);g.fill()}
  g.globalAlpha=1;

  var fl=[],i,a,r2;
  for(i=0;i<12;i++){a=i/12*TAU+.22;fl.push([bx+Math.cos(a)*brx*.74,by+Math.sin(a)*bry*.72,42])}
  for(i=0;i<7;i++){a=R()*TAU;r2=Math.sqrt(R());
    fl.push([bx+Math.cos(a)*brx*.58*r2,by+Math.sin(a)*bry*.55*r2,40])}
  g.fillStyle=col.base;
  for(i=0;i<fl.length;i++){g.beginPath();g.arc(fl[i][0],fl[i][1],fl[i][2],0,TAU);g.fill()}

  g.globalCompositeOperation='source-atop';
  var grd=g.createLinearGradient(bx-110,by-120,bx+110,by+100);
  grd.addColorStop(0,'rgba(255,253,246,.75)');grd.addColorStop(.34,'rgba(255,253,246,.10)');
  grd.addColorStop(.72,'rgba(120,95,70,.06)');grd.addColorStop(1,'rgba(105,82,60,.26)');
  g.fillStyle=grd;g.fillRect(0,0,S,S);
  var hi=g.createRadialGradient(bx-40,by-46,4,bx-40,by-46,78);
  hi.addColorStop(0,'rgba(255,255,250,.55)');hi.addColorStop(1,'rgba(255,255,250,0)');
  g.fillStyle=hi;g.fillRect(0,0,S,S);
  g.fillStyle='rgba(120,98,74,.10)';
  for(i=0;i<5;i++){
    var pa=R()*TAU,pr=R()*44;
    g.beginPath();g.ellipse(bx+Math.cos(pa)*50,by+Math.sin(pa)*30+pr*.2,18+R()*12,12+R()*8,R()*3,0,TAU);g.fill();
  }
  g.globalCompositeOperation='source-over';

  var hx=268,hy=172;
  g.fillStyle=col.deep;
  g.beginPath();g.ellipse(hx-26,hy-16,15,10,-.5,0,TAU);g.fill();
  g.beginPath();g.ellipse(hx,hy,31,27,.06,0,TAU);g.fill();
  g.fillStyle='rgba(255,255,255,.14)';g.beginPath();g.ellipse(hx-8,hy-10,16,12,.2,0,TAU);g.fill();
  g.fillStyle='#F3E6D8';g.beginPath();g.ellipse(hx+16,hy+8,18,14,.14,0,TAU);g.fill();
  g.fillStyle='rgba(90,70,58,.55)';g.beginPath();g.ellipse(hx+27,hy+4,4.4,3.2,.3,0,TAU);g.fill();
  g.fillStyle='#3C3128';
  g.beginPath();g.ellipse(hx-6,hy-2,4.6,5.4,0,0,TAU);g.fill();
  g.beginPath();g.ellipse(hx+16,hy-1,4.2,5,0,0,TAU);g.fill();
  g.fillStyle='rgba(255,255,255,.85)';
  g.beginPath();g.arc(hx-7.6,hy-4,1.5,0,TAU);g.fill();
  g.beginPath();g.arc(hx+14.6,hy-3,1.4,0,TAU);g.fill();
  g.fillStyle='rgba(226,148,136,.30)';g.beginPath();g.ellipse(hx+4,hy+15,8,5,.1,0,TAU);g.fill();

  if(hat!=='scarf'&&hat!=='bell')drawHat(g,hat,hx+2,hy-26);
  if(hat==='scarf'||hat==='bell')drawHat(g,hat,hx-6,hy-4);

  g.restore();spriteCache[key]=cv;sheepSpriteKeys.push(key);
  if(sheepSpriteKeys.length>48){
    var oldest=sheepSpriteKeys.shift();spriteCache[oldest].width=0;spriteCache[oldest].height=0;delete spriteCache[oldest];
  }
  return cv;
}

  return {
    get(options={}) {
      if(disposed)throw new Error('Sheep sprite factory has been disposed');
      const color=Number.isInteger(options.color)?clamp(options.color,0,COLORS.length-1):0;
      const hat=HATS.some(h=>h.key===options.hat)?options.hat:'none';
      const variant=Number.isInteger(options.variant)?clamp(options.variant,0,2):0;
      return makeSheepSprite(color,hat,!!options.flip,variant);
    },
    get cacheSize(){return sheepSpriteKeys.length;},
    dispose(){
      if(disposed)return;disposed=true;
      for(const key of sheepSpriteKeys){spriteCache[key].width=0;spriteCache[key].height=0;}
      spriteCache={};sheepSpriteKeys=[];
    },
  };
}
