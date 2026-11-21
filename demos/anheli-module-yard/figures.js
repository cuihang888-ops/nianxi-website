import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const sphere = new THREE.SphereGeometry(1, 12, 8);
const cuff = new THREE.CylinderGeometry(1, 1, 1, 12);
const clay = new THREE.MeshStandardMaterial({ roughness: .91, vertexColors: true });
const figures = new Map();
const lambs = new Map();

const looks = {
  daiGirl: { skin: '#edb594', hair: '#413034', top: '#c87060', edge: '#eed0a0', trousers: '#615373',
    shoe: '#8a5246', style: 'bun' },
  daiBoy: { skin: '#deab80', hair: '#42352d', top: '#e0c698', edge: '#5a897a', trousers: '#4c7164',
    shoe: '#76543c', style: 'crop' },
  fairYouth: { skin: '#eeb998', hair: '#764932', top: '#6b9298', edge: '#d8aa66', trousers: '#546987',
    shoe: '#dbc9a7', style: 'cap' },
};

const coats = [
  { wool: '#f4e4cc', face: '#8f6c53', detail: '#dc8b86' },
  { wool: '#dfc79f', face: '#745643', detail: '#d6a967' },
  { wool: '#bbcbd2', face: '#656775', detail: '#83a17f' },
];

function oval(color, position, scale, rotation) {
  return { color, position, scale, rotation, geometry: sphere };
}

function cylinder(color, position, scale, rotation) {
  return { color, position, scale, rotation, geometry: cuff };
}

function line(color, points, radius) {
  const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  return { color, geometry: new THREE.TubeGeometry(path, 6, radius, 4, false), temporary: true };
}

function batch(parts) {
  const geos = parts.map(part => {
    const geo = part.geometry.clone();
    if (part.scale) geo.scale(...part.scale);
    if (part.rotation) {
      const [x, y, z] = part.rotation;
      geo.rotateX(x);
      geo.rotateY(y);
      geo.rotateZ(z);
    }
    if (part.position) geo.translate(...part.position);
    const color = new THREE.Color(part.color);
    const values = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < values.length; i += 3) {
      values[i] = color.r;
      values[i + 1] = color.g;
      values[i + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(values, 3));
    if (part.temporary) part.geometry.dispose();
    return geo;
  });
  const result = mergeGeometries(geos);
  for (const geometry of geos) geometry.dispose();
  return result;
}

function mesh(geometry) {
  const shape = new THREE.Mesh(geometry, clay);
  shape.castShadow = true;
  shape.receiveShadow = true;
  return shape;
}

function ballJoint(parent, geometry, x, y, z) {
  const joint = new THREE.Group();
  joint.position.set(x, y, z);
  joint.add(mesh(geometry));
  parent.add(joint);
  return joint;
}

function headParts(look) {
  const {skin, hair, style, edge} = look;
  const face = [
    oval(skin,[0,0,0],[.245,.251,.214]),
    oval(skin,[0,-.185,.014],[.093,.115,.090]),
    oval(skin,[0,-.056,.212],[.035,.027,.029]),
    oval('#d78f78',[0,-.087,.220],[.020,.012,.013]),
    line('#9d5e55',[[-.043,-.108,.206],[0,-.120,.209],[.043,-.108,.206]],.0065),
    // A broad crown and smaller locks make a continuous silhouette in profile and from the back.
    oval(hair,[0,.099,-.047],[.252,.181,.207]),
    oval(hair,[0,.005,-.095],[.230,.207,.136]),
    oval(hair,[-.103,.126,.093],[.138,.113,.124],[.05,.05,.33]),
    oval(hair,[.103,.150,.077],[.131,.100,.133],[-.13,-.05,-.25]),
  ];

  for (const sign of [-1, 1]) {
    const earX=sign*.23;
    const cheekX=sign*.112;
    face.push(
      oval(skin,[earX,-.037,-.008],[.046,.062,.035],[0,0,-sign*.15]),
      oval('#cf927d',[earX+sign*.008,-.035,.022],[.020,.033,.008]),
      oval(hair,[sign*.182,.093,.015],[.071,.119,.124],[.1,0,-sign*.23]),
      oval('#dd9b82',[cheekX,-.073,.186],[.048,.023,.012],[0,sign*.36,0]),
      line('#594038',[[sign*.039,.006,.215],[sign*.078,.019,.210],[sign*.112,.006,.201]],.009),
      line('#866353',[[sign*.050,.049,.206],[sign*.085,.058,.202],[sign*.113,.054,.188]],.0055),
    );
  }

  if (style==='bun') {
    face.push(
      oval(hair,[-.067,.183,-.173],[.142,.110,.107]),
      oval('#c79565',[-.125,.184,-.079],[.053,.022,.045],[.12,0,-.55]),
      oval(edge,[-.222,-.088,.018],[.017,.022,.017]),
      oval(edge,[.222,-.088,.018],[.017,.022,.017]),
    );
    for (let petal=0; petal<5; petal++) {
      const angle=petal*Math.PI*2/5;
      face.push(oval('#f0ca9d',[-.161+Math.cos(angle)*.023,.179+Math.sin(angle)*.023,.085],[.015,.015,.010]));
    }
  }
  if (style==='crop') {
    face.push(oval('#584336',[-.064,.186,.024],[.145,.059,.148],[0,0,.1]));
  }
  if (style==='cap') {
    const felt='#76937e';
    face.push(
      oval(hair,[.090,-.072,-.174],[.082,.154,.093],[.48,.11,.31]),
      oval(edge,[.078,-.001,-.210],[.064,.027,.062],[0,0,.3]),
      oval(felt,[0,.198,-.022],[.262,.090,.239]),
      oval('#648371',[0,.158,.110],[.253,.036,.233],[-.065,0,0]),
      oval('#dcb37d',[.06,.213,.187],[.023,.025,.010]),
    );
  }
  return face;
}

function villagerGeometry(look) {
  const {skin, top, edge, trousers, shoe, style} = look;
  const trunk = [
    oval(top,[0,.817,0],[.225,.234,.155]),
    oval(top,[0,.716,0],[.192,.142,.152]),
    oval(trousers,[0,.575,.005],[.176,.118,.132]),
    oval(edge,[0,.695,.011],[.181,.028,.154]),
    line(edge,[[-.095,1.006,.108],[0,.948,.149],[.095,1.006,.108]],.014),
  ];
  for (let i=0; i<3; i++) trunk.push(oval(edge,[.026,.884-i*.059,.156],[.012,.012,.009]));
  if (style==='bun') {
    trunk.push(
      oval(trousers,[0,.391,0],[.191,.309,.152]),
      oval('#b77477',[0,.226,0],[.162,.024,.139]),
      line('#856882',[[-.08,.637,.102],[-.097,.416,.136],[-.097,.228,.118]],.011),
      line('#796781',[[.08,.637,.102],[.097,.416,.136],[.097,.228,.118]],.010),
    );
  }
  if (style==='cap') {
    trunk.push(
      oval('#bf8d59',[.111,.786,.144],[.062,.080,.017],[0,0,.22]),
      line(edge,[[-.077,.988,.128],[.043,.860,.162],[.115,.782,.155]],.017),
    );
  }

  const arms=[-1,1].map(sign=>batch([
    oval(top,[sign*.022,-.088,0],[.077,.132,.080],[0,0,sign*.17]),
    oval(top,[sign*.048,-.222,.011],[.061,.102,.066],[.12,0,sign*.1]),
    oval(edge,[sign*.053,-.280,.017],[.059,.027,.059]),
    oval(skin,[sign*.057,-.330,.026],[.052,.059,.052]),
    oval(skin,[sign*.030,-.322,.062],[.024,.037,.023]),
  ]));
  const leg=batch([
    oval(trousers,[0,-.195,0],[.083,.237,.090]),
    oval(trousers,[0,-.381,.008],[.068,.136,.071]),
    oval(shoe,[0,-.480,.047],[.089,.048,.120]),
    oval('#544635',[0,-.513,.049],[.089,.020,.121]),
  ]);
  return { trunk:batch(trunk), head:batch(headParts(look)), arms, leg };
}

export function createVillager(id) {
  const key = Object.hasOwn(looks,id) ? id : 'daiGirl';
  if (!figures.has(key)) figures.set(key, villagerGeometry(looks[key]));
  const geometry=figures.get(key);
  const root=new THREE.Group();
  root.scale.setScalar(1.055);
  const body=new THREE.Group();
  root.add(body);
  body.add(mesh(geometry.trunk));
  const head=ballJoint(body,geometry.head,0,1.275,0);
  const arms=[-1,1].map((side,i)=>ballJoint(body,geometry.arms[i],side*.192,.953,0));
  const legs=[-1,1].map(side=>ballJoint(root,geometry.leg,side*.106,.533,0));

  return {
    root,
    animate(time,walking,riding=false,fishing=false) {
      if(riding) {
        body.position.y=Math.sin(time*14)*.017;
        body.rotation.z=0;
        head.rotation.set(.05,0,Math.sin(time*2.2)*.018);
        for(let i=0;i<2;i++){
          const side=i===0?-1:1;
          arms[i].rotation.set(-.71,0,side*.21);
          legs[i].rotation.set(-.54,0,side*.51);
          legs[i].position.y=.49;
        }
        return;
      }
      const motion=walking?Math.sin(time*10):0;
      body.position.y=walking?Math.abs(motion)*.033:Math.sin(time*2.4)*.006;
      body.rotation.z=motion*.028;
      head.rotation.z=Math.sin(time*2.2)*.032-motion*.015;
      head.rotation.x=walking?-.045:Math.sin(time*1.55)*.014;
      for (let i=0;i<2;i++) {
        const phase=motion*(i===0?1:-1);
        arms[i].rotation.set(-phase*.49,0,0);
        legs[i].rotation.set(phase*.50,0,0);
        legs[i].position.y=.533+Math.max(0,phase)*.058;
      }
      if(fishing)arms[1].rotation.set(-1.24,0,.17);
    },
  };
}

function lambGeometry(index) {
  const {wool,face,detail}=coats[index];
  const woolShade = new THREE.Color(wool).lerp(new THREE.Color('#b49783'), .13);
  const cream = new THREE.Color(wool).lerp(new THREE.Color('#fff4e0'), .45);
  const body=[
    oval(wool,[0,.650,-.139],[.480,.435,.596]),
    oval(cream,[-.218,.766,-.372],[.306,.323,.404],[.11,0,-.15]),
    oval(woolShade,[.243,.687,-.284],[.285,.272,.365]),
    oval(cream,[.118,.914,-.083],[.298,.230,.347]),
    oval(wool,[-.258,.601,.067],[.281,.289,.345]),
    oval(cream,[.261,.737,.092],[.286,.279,.366]),
    oval(wool,[0,.797,.142],[.358,.291,.356]),
    oval(woolShade,[.027,.715,-.673],[.132,.124,.141],[.2,0,.15]),
  ];
  const head=[
    oval(face,[0,0,0],[.254,.260,.235]),
    oval(cream,[0,-.114,.167],[.163,.112,.119]),
    oval(face,[0,-.065,.266],[.039,.024,.020]),
    line('#674e47',[[-.036,-.132,.270],[0,-.142,.282],[.036,-.132,.270]],.005),
    oval(wool,[-.124,.167,.011],[.133,.117,.145],[.12,0,.2]),
    oval(cream,[0,.190,.034],[.133,.122,.140]),
    oval(wool,[.130,.158,.018],[.124,.111,.147],[.14,0,-.2]),
  ];

  for(const sign of [-1,1]) {
    head.push(
      oval(face,[sign*.293,.035,.006],[.137,.059,.084],[.19,0,-sign*.36]),
      oval('#c79a87',[sign*.300,.036,.063],[.081,.034,.024],[0,0,-sign*.38]),
      oval('#4d3d39',[sign*.107,.010,.208],[.029,.037,.017],[0,sign*.46,0]),
      oval('#f8e9d5',[sign*.102,.022,.223],[.008,.009,.006]),
      oval('#d99b91',[sign*.126,-.064,.205],[.032,.018,.010],[0,sign*.38,0]),
    );
  }

  if (index===0) {
    const flowerX=-.130;
    for(let i=0;i<5;i++){
      const angle=i*Math.PI*2/5;
      head.push(oval(detail,[flowerX+Math.cos(angle)*.044,.203+Math.sin(angle)*.044,.141],[.035,.030,.026]));
    }
    head.push(oval('#eac279',[flowerX,.203,.162],[.025,.025,.014]));
  }
  if (index===1) {
    head.push(
      oval(detail,[-.035,.233,.020],[.263,.034,.225],[0,0,.19]),
      oval('#dcb376',[-.037,.276,.019],[.178,.092,.169],[0,0,.2]),
      cylinder('#ae7955',[-.029,.243,.022],[.167,.031,.155],[0,0,.19]),
    );
  }
  if (index===2) {
    body.push(
      oval(detail,[0,.667,.296],[.278,.134,.190]),
      oval('#9db788',[.157,.548,.398],[.068,.145,.024],[-.1,0,.30]),
    );
  }

  const leg=[
    oval(face,[0,-.122,0],[.065,.238,.071]),
    oval('#655049',[0,-.318,.015],[.076,.040,.082]),
  ];
  return {body:batch(body),head:batch(head),leg:batch(leg)};
}

export function createLamb(index) {
  const key=coats[index]?index:0;
  if(!lambs.has(key)) lambs.set(key,lambGeometry(key));
  const geometry=lambs.get(key);
  const root=new THREE.Group();
  const body=new THREE.Group();
  root.add(body);
  body.add(mesh(geometry.body));
  const head=ballJoint(body,geometry.head,0,.817,.375);
  const legs=[
    ballJoint(root,geometry.leg,-.235,.358,.263), ballJoint(root,geometry.leg,.235,.358,.263),
    ballJoint(root,geometry.leg,-.233,.358,-.414), ballJoint(root,geometry.leg,.233,.358,-.414),
  ];

  return {
    root,
    animate(time,walking,reaction=0) {
      const phase=time*9.2+key;
      const gait=walking?Math.sin(phase):0;
      const hop=Math.sin(Math.PI*Math.min(1,Math.max(0,reaction)))*.135;
      body.position.y=hop+Math.abs(gait)*.034;
      body.rotation.z=gait*.030;
      head.rotation.y=Math.sin(time*1.71+key)*.084;
      head.rotation.x=Math.sin(time*2.2+key)*.064-hop*.68;
      for(let i=0;i<legs.length;i++) {
        const direction=i===0||i===3?gait:-gait;
        legs[i].rotation.x=direction*.49;
        legs[i].position.y=.358+hop+Math.max(0,direction)*.047;
      }
    },
  };
}
