/* 42-layer creative calendar instrument; data only, no drawing or clock reads.
 * Sources and limits: ../notes/42-ring-sources.md
 * ids run from inner to outer. offsetDeg: clockwise from screen north.
 * items are labels; trigram/hexagram entries carry lines from BOTTOM to TOP.
 */
(function(root){
  'use strict';
  const stems=Array.from('甲乙丙丁戊己庚辛壬癸');
  const branches=Array.from('子丑寅卯辰巳午未申酉戌亥');
  const animals=Array.from('鼠牛虎兔龙蛇马羊猴鸡狗猪');
  const elements=Array.from('木火土金水');
  const directions=['北','东北','东','东南','南','西南','西','西北'];
  const mountains=Array.from('壬子癸丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥');
  const terms='立春 雨水 惊蛰 春分 清明 谷雨 立夏 小满 芒种 夏至 小暑 大暑 立秋 处暑 白露 秋分 寒露 霜降 立冬 小雪 大雪 冬至 小寒 大寒'.split(' ');
  const cycle=Array.from({length:60},(_,i)=>stems[i%10]+branches[i%12]);
  const tri={
    乾:{symbol:'☰',lines:[1,1,1],image:'天',element:'金'},
    兑:{symbol:'☱',lines:[1,1,0],image:'泽',element:'金'},
    离:{symbol:'☲',lines:[1,0,1],image:'火',element:'火'},
    震:{symbol:'☳',lines:[1,0,0],image:'雷',element:'木'},
    巽:{symbol:'☴',lines:[0,1,1],image:'风',element:'木'},
    坎:{symbol:'☵',lines:[0,1,0],image:'水',element:'水'},
    艮:{symbol:'☶',lines:[0,0,1],image:'山',element:'土'},
    坤:{symbol:'☷',lines:[0,0,0],image:'地',element:'土'}
  };
  const bagua=Array.from('坎艮震巽离坤兑乾').map((name,i)=>({name,direction:directions[i],bearing:i*45,...tri[name]}));
  // King Wen sequence; each row is name / lower trigram / upper trigram.
  // Lower+upper concatenation yields six lines in bottom-to-top order.
  const hexRows=[
    ['乾','乾','乾'],['坤','坤','坤'],['屯','震','坎'],['蒙','坎','艮'],
    ['需','乾','坎'],['讼','坎','乾'],['师','坎','坤'],['比','坤','坎'],
    ['小畜','乾','巽'],['履','兑','乾'],['泰','乾','坤'],['否','坤','乾'],
    ['同人','离','乾'],['大有','乾','离'],['谦','艮','坤'],['豫','坤','震'],
    ['随','震','兑'],['蛊','巽','艮'],['临','兑','坤'],['观','坤','巽'],
    ['噬嗑','震','离'],['贲','离','艮'],['剥','坤','艮'],['复','震','坤'],
    ['无妄','震','乾'],['大畜','乾','艮'],['颐','震','艮'],['大过','巽','兑'],
    ['坎','坎','坎'],['离','离','离'],['咸','艮','兑'],['恒','巽','震'],
    ['遁','艮','乾'],['大壮','乾','震'],['晋','坤','离'],['明夷','离','坤'],
    ['家人','离','巽'],['睽','兑','离'],['蹇','艮','坎'],['解','坎','震'],
    ['损','兑','艮'],['益','震','巽'],['夬','乾','兑'],['姤','巽','乾'],
    ['萃','坤','兑'],['升','巽','坤'],['困','坎','兑'],['井','巽','坎'],
    ['革','离','兑'],['鼎','巽','离'],['震','震','震'],['艮','艮','艮'],
    ['渐','艮','巽'],['归妹','兑','震'],['丰','离','震'],['旅','艮','离'],
    ['巽','巽','巽'],['兑','兑','兑'],['涣','坎','巽'],['节','兑','坎'],
    ['中孚','兑','巽'],['小过','艮','震'],['既济','离','坎'],['未济','坎','离']
  ];
  const hexagrams=hexRows.map(([name,lower,upper],i)=>({
    number:i+1,name,lower,upper,symbol:String.fromCodePoint(0x4dc0+i),
    lines:tri[lower].lines.concat(tri[upper].lines)
  }));
  const gold='#d8b66d',pale='#eee2bb',cyan='#67d8e3',jade='#6ee4b0',red='#e48c76';
  const rings=[];
  function ring(label,type,semantic,description,extra={}){
    const weight={text:3.5,trigram:3.5,hexagram:3.5,ticks:.8,dots:.65,arc:.65}[type];
    rings.push({id:rings.length+1,label,type,semantic,description,weight,color:gold,speed:0,offsetDeg:0,angleReference:'ordinal',...extra});
  }
  ring('内缘光轨','arc','decoration','内缘呼吸光轨，仅作视觉装饰。',{ticks:5,speed:1.8,color:cyan});
  ring('五行五等分','ticks','symbol','五个相生序位的等分边界；不映射真实方位。',{ticks:5,offsetDeg:36});
  ring('五行相生','text','symbol','木生火、火生土、土生金、金生水、水生木。',{items:elements,color:jade});
  ring('五点光标','dots','decoration','五个均匀光点，不代表运势数值。',{ticks:5,speed:-2.4,color:jade});
  ring('后天八卦分界','ticks','symbol','八卦各占45度，边界在八方中心之间。',{ticks:8,offsetDeg:22.5,angleReference:'bearing'});
  ring('后天八卦爻象','trigram','symbol','北坎、东北艮、东震、东南巽、南离、西南坤、西兑、西北乾；爻自下而上。',{items:bagua.map(x=>x.symbol),entries:bagua,angleReference:'bearing',color:pale});
  ring('八方光轨','arc','decoration','环绕八卦的装饰光轨，不转动真实卦位。',{ticks:8,speed:-.7,color:cyan});
  ring('后天八方卦名','text','symbol','卦名与后天八方一一对应。',{items:bagua.map(x=>x.name+'·'+x.direction),angleReference:'bearing',color:pale});
  ring('八方微分度','ticks','decoration','每个八方扇区分为8小格，共64格；仅为界面微刻度。',{ticks:64});
  ring('天干十等分','ticks','symbol','十天干顺序的十个等分序位。',{ticks:10,offsetDeg:18});
  ring('十天干','text','calendar','甲乙丙丁戊己庚辛壬癸；日干高亮由外部历法模块提供。',{items:stems,highlightField:'dayGanzhi',highlightPart:'stem',color:red});
  ring('天干十点索引','dots','decoration','十个索引点辅助读数，没有独立术数含义。',{ticks:10,color:red});
  ring('地支十二等分','ticks','symbol','十二地支序位的十二个等分边界。',{ticks:12,offsetDeg:15});
  ring('十二地支','text','calendar','子丑寅卯辰巳午未申酉戌亥；此圈为时辰序位，不作地理测向。',{items:branches,highlightField:'hourBranch',color:pale});
  ring('地支双分度','ticks','decoration','十二支序位各分两小格，共24格。',{ticks:24});
  ring('二十四山分界','ticks','symbol','二十四山每山15度，子山中心为北0度，边界相差7.5度。',{ticks:24,offsetDeg:7.5,angleReference:'bearing'});
  ring('二十四山','text','symbol','壬子癸丑艮寅甲卯乙辰巽巳丙午丁未坤申庚酉辛戌乾亥；首项壬在345度。',{items:mountains,offsetDeg:-15,angleReference:'bearing',color:pale});
  ring('山向一度分度','ticks','decoration','360个一度微刻度；屏幕角度参考，不是设备磁力计读数。',{ticks:360,angleReference:'bearing'});
  ring('节气二十四序位','ticks','calendar','二十四节气的顺序索引分界；等分显示不表示节气间公历天数相等。',{ticks:24,offsetDeg:7.5});
  ring('二十四节气','text','calendar','立春起依历序列出24节气；高亮取真实currentTerm，不用于方位定向。',{items:terms,highlightField:'currentTerm',color:jade});
  ring('节气十五级微分度','ticks','decoration','每个节气序位15小格，共360格；创意刻度，不命名为七十二候或分金。',{ticks:360});
  ring('二十四小时分界','ticks','calendar','北京时间24小时读数边界。',{ticks:24,offsetDeg:7.5});
  ring('北京时间小时','text','calendar','00至23的小时标签；高亮由CalendarEngine.hour提供。',{items:Array.from({length:24},(_,i)=>String(i).padStart(2,'0')),highlightField:'hour',color:cyan});
  ring('十二分钟分度','ticks','calendar','一天24小时各分5格，共120格，每小格12分钟。',{ticks:120});
  ring('甲子六十序位','ticks','calendar','六十甲子顺序的60个等分边界。',{ticks:60,offsetDeg:3});
  ring('六十甲子','text','calendar','天干地支同序推进组成60个不同组合，甲子起、癸亥终；高亮实际日柱。',{items:cycle,highlightField:'dayGanzhi',color:pale});
  ring('甲子双分度','ticks','decoration','六十甲子每格再分为两格，仅作视觉分度，不是透地六十龙。',{ticks:120});
  ring('文王卦序分界','ticks','symbol','六十四卦文王序的64个等分边界。',{ticks:64,offsetDeg:360/128});
  ring('文王六十四卦象','hexagram','symbol','依通行《周易》上下经顺序，从乾至未济；不是先天圆图方位。',{items:hexagrams.map(x=>x.symbol),entries:hexagrams,color:pale});
  ring('六十四卦索引点','dots','symbol','每卦一个序位点，便于对应相邻卦象与卦名。',{ticks:64,color:jade});
  ring('文王六十四卦名','text','symbol','64个卦名与内圈卦象保持相同顺序和起点。',{items:hexagrams.map(x=>x.name),entries:hexagrams,color:pale});
  ring('六爻计数分度','ticks','decoration','64×6=384个微刻度表示六爻计数；仅为刻度设计，不冒称384分金排盘。',{ticks:384});
  ring('周天一度刻度','ticks','decoration','0至359度的一度分度，屏幕北为0，顺时针增大。',{ticks:360,angleReference:'bearing'});
  ring('周天三十度标签','text','decoration','0°至330°，每30°标注；仅为图形角度参考。',{items:Array.from({length:12},(_,i)=>(i*30)+'°'),angleReference:'bearing',color:cyan});
  ring('半度微刻度','ticks','decoration','720等分对应每格0.5度；不代表传感器精度。',{ticks:720,angleReference:'bearing'});
  ring('生肖十二序位','ticks','symbol','十二生肖顺序的12个等分边界。',{ticks:12,offsetDeg:15});
  ring('十二生肖','text','calendar','鼠牛虎兔龙蛇马羊猴鸡狗猪，年生肖高亮采用CalendarEngine已说明的立春年规则。',{items:animals,highlightField:'zodiac',color:red});
  ring('二十四点光轨','dots','decoration','24个缓转光点仅作装饰，不代表节气交接或测得方位。',{ticks:24,speed:.6,color:cyan});
  ring('八方方位分界','ticks','symbol','八方方位扇区的45度分界。',{ticks:8,offsetDeg:22.5,angleReference:'bearing'});
  ring('八方方位标','text','symbol','北、东北、东、东南、南、西南、西、西北；采用北上南下屏幕约定。',{items:directions,angleReference:'bearing',color:pale});
  ring('外缘一度分度','ticks','decoration','360个外缘刻度，与内圈周天标注同向；只读图形角度。',{ticks:360,angleReference:'bearing'});
  ring('外缘回环光轨','arc','decoration','外框连续光轨，独立于真实历法与符号方位。',{ticks:12,speed:-.35,color:gold});
  function deepFreeze(o){Object.freeze(o);Object.values(o).forEach(v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v))deepFreeze(v);});return o;}
  if(rings.length!==42)throw new Error('LUOPAN_RINGS must contain exactly 42 independent layers');
  root.LUOPAN_RINGS=deepFreeze(rings);
  root.LUOPAN_DATA=deepFreeze({stems,branches,animals,elements,directions,mountains,terms,cycle,bagua,hexagrams,
    lineOrder:'bottom-to-top',hexagramOrder:'King Wen / received Zhouyi',mountainStartBearing:345});
  root.LUOPAN_RING_META=deepFreeze({version:'1.0.0',layerCount:42,radiusMin:120,radiusMax:440,
    weightTotal:rings.reduce((n,x)=>n+x.weight,0),speedUnit:'degrees per second',
    typeSupport:['ticks','text','trigram','hexagram','dots','arc'],
    positionConvention:'id ascending from inner to outer; north=0 degrees clockwise',
    notice:'42层为创意历法仪表布局；不对应单一流派完整罗经，不是经过专业校准的实体罗盘。'});
})(typeof window!=='undefined'?window:globalThis);
