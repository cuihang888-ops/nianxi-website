/* Beijing civil calendar adapter. Load ../vendor/lunar.js before this classic script.
 * Vendor: 6tail/lunar-javascript, MIT; see notes/calendar-sources.md.
 * No clock reads: all results derive solely from the supplied Unix epoch ms.
 */
(function (root) {
  'use strict';
  if (!root.Solar) throw new Error('CalendarEngine requires vendor/lunar.js before calendar.js');
  const OFFSET_MS = 8 * 60 * 60 * 1000;
  const DAY_MS = 86400000;
  const DAY_YI_JI_SECT = 1;
  const DAY_YI_JI_SOURCE = 'lunar-javascript 1.7.7 / 6tail';
  const GAN = '甲乙丙丁戊己庚辛壬癸'.split('');
  const ZHI = '子丑寅卯辰巳午未申酉戌亥'.split('');
  const WEEK = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  const pad = n => String(n).padStart(2, '0');
  const bagua = [
    {name:'坎',symbol:'☵',direction:'北',bearing:0,element:'水',image:'水',lines:[0,1,0]},
    {name:'艮',symbol:'☶',direction:'东北',bearing:45,element:'土',image:'山',lines:[0,0,1]},
    {name:'震',symbol:'☳',direction:'东',bearing:90,element:'木',image:'雷',lines:[1,0,0]},
    {name:'巽',symbol:'☴',direction:'东南',bearing:135,element:'木',image:'风',lines:[0,1,1]},
    {name:'离',symbol:'☲',direction:'南',bearing:180,element:'火',image:'火',lines:[1,0,1]},
    {name:'坤',symbol:'☷',direction:'西南',bearing:225,element:'土',image:'地',lines:[0,0,0]},
    {name:'兑',symbol:'☱',direction:'西',bearing:270,element:'金',image:'泽',lines:[1,1,0]},
    {name:'乾',symbol:'☰',direction:'西北',bearing:315,element:'金',image:'天',lines:[1,1,1]}
  ].map(x => Object.freeze({...x, lines:Object.freeze(x.lines)}));
  const elements = [
    {name:'木',generates:'火',direction:'东'},
    {name:'火',generates:'土',direction:'南'},
    {name:'土',generates:'金',direction:'中'},
    {name:'金',generates:'水',direction:'西'},
    {name:'水',generates:'木',direction:'北'}
  ].map(Object.freeze);
  const data = Object.freeze({
    bagua:Object.freeze(bagua),
    fiveElements:Object.freeze(elements),
    generatingCycle:Object.freeze(['木','火','土','金','水']),
    heavenlyStems:Object.freeze(GAN), earthlyBranches:Object.freeze(ZHI),
    lineOrder:'bottom-to-top', compassBearing:'clockwise from north',
    conventions:Object.freeze({timeZone:'Asia/Shanghai',utcOffset:'+08:00',year:'exact Li Chun instant',month:'exact 12 jie instants',day:'00:00 Beijing civil midnight',hour:'two-hour branches; stem uses the same midnight-based day stem',zodiac:'same Li Chun year as yearGanzhi',dayYiJi:'sect 1; jie date month boundary; stable throughout the Beijing civil day'})
  });
  function solarISO(s) {
    return `${String(s.getYear()).padStart(4,'0')}-${pad(s.getMonth())}-${pad(s.getDay())}T${pad(s.getHour())}:${pad(s.getMinute())}:${pad(s.getSecond())}+08:00`;
  }
  function termData(term) {
    if (!term) return {name:'',iso:null,epochMs:null};
    const iso=solarISO(term.getSolar());
    return {name:term.getName(),iso,epochMs:Date.parse(iso)};
  }
  let lastSecond = null;
  let cached = null;
  function at(epochMs) {
    epochMs=Number(epochMs);
    if (!Number.isFinite(epochMs)) throw new TypeError('CalendarEngine.at expects a finite Unix epoch in milliseconds');
    const secondKey=Math.floor(epochMs/1000);
    const millisecond=((Math.floor(epochMs)%1000)+1000)%1000;
    if (cached && lastSecond===secondKey) {
      return {...cached,epochMs,millisecond,nextTermCountdownDays:(cached.nextTermEpochMs-epochMs)/DAY_MS};
    }
    // Deliberately use UTC accessors on a +08:00-shifted instant. Host TZ never enters.
    const d=new Date(epochMs+OFFSET_MS);
    const year=d.getUTCFullYear(),month=d.getUTCMonth()+1,day=d.getUTCDate();
    if(year<1901||year>2100) throw new RangeError('This presentation calendar supports Gregorian 1901–2100');
    const hour=d.getUTCHours(),minute=d.getUTCMinutes(),second=d.getUTCSeconds();
    const dateISO=`${year}-${pad(month)}-${pad(day)}`;
    const solar=root.Solar.fromYmdHms(year,month,day,hour,minute,second);
    const lunar=solar.getLunar();
    const previous=termData(lunar.getPrevJieQi(false));
    const next=termData(lunar.getNextJieQi(false));
    const hourBranchIndex=Math.floor((hour+1)/2)%12;
    // Vendor's getTimeInGanZhi uses its 23:00-next-day convention. We explicitly
    // derive the hour stem from the civil-midnight day to keep this display coherent.
    const hourStemIndex=(lunar.getDayGanIndex()%5*2+hourBranchIndex)%10;
    const dayOfYear=Math.round((Date.UTC(year,month-1,day)-Date.UTC(year,0,1))/DAY_MS)+1;
    const daysInYear=Math.round((Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/DAY_MS);
    // Sect 1 switches its month on the civil date of jie, so daily almanac
    // entries stay unchanged at 23:00 and through the exact jie instant.
    // Preserve the vendor's labels and ['无'] sentinel without rewriting them.
    const dayYi=Object.freeze(lunar.getDayYi(DAY_YI_JI_SECT).slice());
    const dayJi=Object.freeze(lunar.getDayJi(DAY_YI_JI_SECT).slice());
    cached={
      epochMs,dateISO,dateDisplay:`${year}年${month}月${day}日`,
      week:WEEK[d.getUTCDay()],weekIndex:d.getUTCDay(),
      lunarText:`农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
      lunarYear:lunar.getYear(),lunarMonth:lunar.getMonth(),lunarDay:lunar.getDay(),
      yearGanzhi:lunar.getYearInGanZhiExact(),monthGanzhi:lunar.getMonthInGanZhiExact(),
      dayGanzhi:lunar.getDayInGanZhiExact2(),hourGanzhi:GAN[hourStemIndex]+ZHI[hourBranchIndex],
      dayYi,dayJi,dayYiJiSect:DAY_YI_JI_SECT,dayYiJiSource:DAY_YI_JI_SOURCE,dayYiJiNotice:'传统黄历参考',
      zodiac:lunar.getYearShengXiaoExact(),hourBranch:ZHI[hourBranchIndex],hourBranchIndex,
      solarTerm:lunar.getJieQi(),currentTerm:previous.name,currentTermISO:previous.iso,currentTermEpochMs:previous.epochMs,
      nextTerm:next.name,nextTermISO:next.iso,nextTermEpochMs:next.epochMs,
      nextTermCountdownDays:(next.epochMs-epochMs)/DAY_MS,
      hour,minute,second,millisecond,dayOfYear,daysInYear,
      monthDays:new Date(Date.UTC(year,month,0)).getUTCDate(),
      firstWeekday:new Date(Date.UTC(year,month-1,1)).getUTCDay(),
      day,month,year,timeZone:'Asia/Shanghai',utcOffset:'+08:00'
    };
    lastSecond=secondKey;
    return {...cached};
  }
  root.CalendarEngine=Object.freeze({at,data,version:'1.1.0',vendorVersion:'lunar-javascript 1.7.7'});
})(typeof window!=='undefined'?window:globalThis);
