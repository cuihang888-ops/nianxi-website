import * as THREE from 'three';

export function createYardNameplate(createCanvas,{wood=false,depthTest=true}={}){
  const canvas=createCanvas();
  canvas.width=512;
  canvas.height=72;
  const ctx=canvas.getContext('2d');
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=THREE.LinearFilter;
  texture.generateMipmaps=false;
  const material=new THREE.SpriteMaterial({map:texture,depthTest,depthWrite:false,toneMapped:false});
  const sprite=new THREE.Sprite(material);
  sprite.renderOrder=4;
  sprite.visible=false;
  let previous=null;
  let paintedWidth=0;

  function setText(text){
    if(text===previous)return;
    previous=text;
    sprite.visible=Boolean(text);
    if(!text)return;

    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.font='700 36px "Microsoft YaHei", "PingFang SC", sans-serif';
    const labelWidth=Math.min(474,Math.max(92,ctx.measureText(text).width+34));
    paintedWidth=labelWidth;
    const left=(canvas.width-labelWidth)/2;
    const right=left+labelWidth;
    const top=4,bottom=68,radius=wood?11:20;
    ctx.beginPath();
    ctx.moveTo(left+radius,top);
    ctx.lineTo(right-radius,top);
    ctx.quadraticCurveTo(right,top,right,top+radius);
    ctx.lineTo(right,bottom-radius);
    ctx.quadraticCurveTo(right,bottom,right-radius,bottom);
    ctx.lineTo(left+radius,bottom);
    ctx.quadraticCurveTo(left,bottom,left,bottom-radius);
    ctx.lineTo(left,top+radius);
    ctx.quadraticCurveTo(left,top,left+radius,top);
    ctx.closePath();
    ctx.fillStyle=wood?'#694935':'#fff6e3';
    ctx.fill();
    ctx.strokeStyle=wood?'#ddb886':'#b3bd94';
    ctx.lineWidth=4;
    ctx.stroke();
    ctx.fillStyle=wood?'#fff0ce':'#2c4938';
    ctx.textBaseline='middle';
    ctx.textAlign='center';
    ctx.fillText(text,canvas.width/2,37,labelWidth-22);
    texture.needsUpdate=true;
  }

  return {
    sprite,setText,
    get aspect(){return paintedWidth/canvas.height;},
    resize(height){sprite.scale.set(height*canvas.width/canvas.height,height,1);},
    dispose(){texture.dispose();material.dispose();},
  };
}
