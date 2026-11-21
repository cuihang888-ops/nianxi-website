import * as THREE from 'three';

const circle=Math.PI*2;
const waterColors={
  spring:{deep:'#397c80',shallow:'#9cbca3',reflection:'#4e7766',glint:'#ffefd0',leaf:'#8bad67',blossom:'#efb0bc'},
  summer:{deep:'#2d6e73',shallow:'#8db99a',reflection:'#3a6865',glint:'#e8f3c6',leaf:'#7f9f57',blossom:'#f0c3bc'},
  autumn:{deep:'#496f74',shallow:'#afbda3',reflection:'#776b54',glint:'#ffe3a8',leaf:'#8d955c',blossom:'#d7aa87'},
  winter:{deep:'#547c89',shallow:'#b5c5b7',reflection:'#5b7376',glint:'#edf2e1',leaf:'#7e9581',blossom:'#bfc8ba'},
};

function lakeSurface(level,shorePoint) {
  const segments=144,rings=24;
  const center=shorePoint(0,0);
  const positions=[center.x,level,center.z];
  const uv=[0,0];
  const indices=[];
  for(let ring=1;ring<=rings;ring++){
    const radius=ring/rings*1.033;
    for(let segment=0;segment<segments;segment++){
      const angle=segment/segments*circle;
      const {x,z}=shorePoint(angle,radius);
      const first=1+(ring-1)*segments;
      const current=first+segment;
      const next=first+(segment+1)%segments;
      positions.push(x,level,z);
      uv.push(radius,Math.max(0,-Math.sin(angle)));
      if(ring===1){
        indices.push(0,next,current);
      }else{
        indices.push(current-segments,next-segments,current,current,next-segments,next);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function waterMaterial() {
  const uniforms={
    lakeTime:{value:0},
    lakeDeep:{value:new THREE.Color()},
    lakeShallow:{value:new THREE.Color()},
    lakeReflection:{value:new THREE.Color()},
    lakeGlint:{value:new THREE.Color()},
  };
  const material=new THREE.MeshStandardMaterial({roughness:.49,metalness:.07});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`
      #include <common>
      varying vec2 vLakePosition;
      varying vec2 vLakeDepth;
    `).replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vLakePosition=position.xz;
      vLakeDepth=uv;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`
      #include <common>
      varying vec2 vLakePosition;
      varying vec2 vLakeDepth;
      uniform float lakeTime;
      uniform vec3 lakeDeep;
      uniform vec3 lakeShallow;
      uniform vec3 lakeReflection;
      uniform vec3 lakeGlint;
    `).replace('#include <color_fragment>',`
      #include <color_fragment>
      float x=vLakePosition.x;
      float z=vLakePosition.y;
      float edge=vLakeDepth.x;
      float wave=sin(z*6.0+x*0.46+sin(x*0.65+lakeTime*0.71)*0.78-lakeTime*1.24);
      float longWave=sin(z*1.9-x*0.35+sin(x*0.73)*0.64+lakeTime*0.76);
      vec3 water=mix(lakeDeep,lakeShallow,smoothstep(0.13,1.05,edge));
      float firShape=abs(sin(x*1.58+0.21*sin(x*0.88)))*0.18;
      float reflection=smoothstep(0.37+firShape,0.92,edge+wave*0.017);
      water=mix(water,lakeReflection,reflection*vLakeDepth.y*0.83);
      float waveBreak=sin(x*1.42+z*1.03+cos(x*0.58-z*1.42))*0.5+0.5;
      float shimmer=smoothstep(0.83,0.996,wave)*smoothstep(0.46,0.93,waveBreak)*smoothstep(0.14,0.82,longWave);
      float sunDistance=x+18.2-(z+9.3)*0.39;
      float sun=exp(-0.011*sunDistance*sunDistance);
      float shoreline=smoothstep(0.965,0.992,edge)*(1.0-smoothstep(1.005,1.034,edge));
      diffuseColor.rgb=water*(0.97+longWave*0.036)+lakeGlint*(shimmer*sun*0.18+shoreline*0.081);
    `);
  };
  return {material,uniforms};
}

function addLilies(group,{level,shorePoint,random,batches,standard}) {
  const pads=[],petals=[],centers=[];
  const groups=[[-2.49,.86,5],[-1.62,.89,5],[-.27,.83,6],[.31,.84,7],[1.25,.85,7],[2.49,.79,6]];
  for(const [angle,radius,count] of groups){
    for(let index=0;index<count;index++){
      const {x,z}=shorePoint(angle+(random()-.5)*.27,radius+(random()-.55)*.17);
      const size=.13+random()*.17;
      pads.push([x,level+.013,z,size,.014,size*.87,random()*circle,index%2?'#8ca75d':'#607f51']);
      if(index%3!==0)continue;
      for(let petal=0;petal<6;petal++){
        const a=petal*circle/6;
        petals.push([x+Math.cos(a)*.053,level+.058,z+Math.sin(a)*.053,.079,.027,.045,-a,'#fce3db',0,.35]);
      }
      centers.push([x,level+.075,z,.047,.037,.047,0,'#dfb773']);
    }
  }
  const padsMaterial=standard({roughness:.44});
  const petalsMaterial=standard({roughness:.78});
  const discs=new THREE.CylinderGeometry(1,1,1,12,1,false,.31,circle-.38);
  batches(group,discs,padsMaterial,pads);
  const shape=new THREE.IcosahedronGeometry(1,0);
  batches(group,shape,petalsMaterial,petals);
  batches(group,shape,standard(),centers);
  return {padsMaterial,petalsMaterial};
}

function addSunRipples(group,{level,shorePoint,lakeRadius,random}) {
  const vertices=[],triangles=[];
  for(let index=0;index<92;index++){
    const {x,z}=shorePoint(random()*circle,.12+random()*.85);
    const length=.14+random()**1.65*.91;
    const thickness=.016+random()*.037;
    if(lakeRadius(x-length,z)>.97||lakeRadius(x+length,z)>.97)continue;
    const first=vertices.length/3;
    vertices.push(x-length,level+.014,z,x,level+.014,z+thickness,x+length,level+.014,z+.019,x,level+.014,z-thickness);
    triangles.push(first,first+1,first+2,first,first+2,first+3);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(triangles);
  const shimmer=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({transparent:true,opacity:.21,depthWrite:false}));
  group.add(shimmer);
  return shimmer;
}

export function addSeasonalWater(group,options) {
  const {level,shorePoint}=options;
  const {material,uniforms}=waterMaterial();
  const surface=new THREE.Mesh(lakeSurface(level,shorePoint),material);
  surface.receiveShadow=true;
  group.add(surface);
  const {padsMaterial,petalsMaterial}=addLilies(group,options);
  const shimmer=addSunRipples(group,options);
  function setSeason(season){
    const colors=waterColors[season];
    uniforms.lakeDeep.value.set(colors.deep);
    uniforms.lakeShallow.value.set(colors.shallow);
    uniforms.lakeReflection.value.set(colors.reflection);
    uniforms.lakeGlint.value.set(colors.glint);
    shimmer.material.color.set(colors.glint);
    padsMaterial.color.set(colors.leaf).lerp(white,.64);
    petalsMaterial.color.set(colors.blossom);
  }
  function animate(time,daylight=1){
    uniforms.lakeTime.value=time;
    shimmer.position.x=Math.sin(time*.44)*.13;
    shimmer.material.opacity=(.18+Math.sin(time*.56)*.06)*(.35+daylight*.65);
  }
  return {setSeason,animate};
}

const white=new THREE.Color('#ffffff');
