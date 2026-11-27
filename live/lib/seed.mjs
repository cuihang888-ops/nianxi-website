export const accountDefaults = [
  { id: 'account-1', name: '边境源头1号', page: '边境源头 · Facebook', color: '#0f766e' },
  { id: 'account-2', name: '翠缘2号', page: '翠缘手镯 · Facebook', color: '#2563eb' },
  { id: 'account-3', name: '臻选3号', page: '臻选翡翠 · Facebook', color: '#9333ea' },
  { id: 'account-4', name: '高货4号', page: '高货手镯 · Facebook', color: '#b45309' },
  { id: 'account-5', name: '甄品5号', page: '甄品翡翠 · Facebook', color: '#be123c' }
];

export const anchorDefaults = ['阿玉', '小满', '若琳', '阿明', '瑶瑶', '苏苏', '阿杰', '小禾', '小晴', '木木', '小雅', '阿林', '小悦', '安安', '沐沐']
  .map((name, index) => ({ id: `anchor-${index + 1}`, name }));

export function chinaDate(value = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

function dayOffset(date, offset) {
  const value = new Date(`${date}T12:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() + offset);
  return chinaDate(value);
}

export function demoData(today = chinaDate()) {
  const sessions = [];
  const slots = [['08:00', '12:00'], ['12:30', '16:30'], ['17:00', '21:00']];
  const monthStart = `${today.slice(0, 7)}-01`;
  const comparisonStart = dayOffset(today, -14);
  const start = monthStart < comparisonStart ? monthStart : comparisonStart;
  const firstOffset = Math.round((new Date(`${start}T12:00:00+08:00`) - new Date(`${today}T12:00:00+08:00`)) / 86400000);
  const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;
  for (let day = firstOffset; day <= 0; day++) {
    const sessionDate = dayOffset(today, day);
    const serialDay = Math.floor(new Date(`${sessionDate}T12:00:00+08:00`).getTime() / 86400000);
    for (let account = 0; account < 5; account++) {
      for (let slot = 0; slot < 3; slot++) {
        const factor = 1 + modulo(account * 11 + slot * 7 + serialDay * 13, 17) / 20;
        const viewers = Math.round((580 + account * 110 + slot * 140) * factor);
        const messages = Math.round(viewers * (0.065 + (account % 3) * 0.009));
        const qualified = Math.round(messages * 0.72);
        const orders = Math.round(qualified * (0.21 + (slot + account) % 3 * 0.035));
        const paidOrders = Math.max(0, orders - modulo(account + slot + serialDay, 3));
        const average = 1500 + account * 780 + slot * 140;
        const received = paidOrders * average;
        const refundOrders = modulo(account + slot + serialDay, 7) === 0 && paidOrders > 0 ? 1 : 0;
        const refunds = refundOrders * average;
        const units = paidOrders - refundOrders;
        const id = `session-${sessionDate}-${account + 1}-${slot + 1}`;
        sessions.push({
          id, date: sessionDate, accountId: `account-${account + 1}`,
          anchorId: `anchor-${account * 3 + slot + 1}`, start: slots[slot][0], end: slots[slot][1],
          actualMinutes: 180 + modulo(account * 7 + slot * 13 + serialDay, 66),
          status: 'completed', target: Math.round(orders * average * (account % 2 ? 1.12 : 0.92)),
          reach: Math.round(viewers * 2.75), impressions: Math.round(viewers * 4.2), viewers,
          shares: Math.round(viewers * 0.02), peak: Math.round(viewers * 0.18),
          watchSeconds: 95 + slot * 23 + account * 9,
          interactions: Math.round(viewers * 0.24), newFollowers: Math.round(viewers * 0.035),
          messages, qualified, orders, orderAmount: orders * average,
          paidOrders, received, refundOrders, refunds, units,
          cogs: Math.round(units * average * (0.52 + account * 0.025)),
          adSpend: Math.round(500 + account * 180 + slot * 150),
          shipping: units * 32, fees: Math.round(received * 0.008), otherCost: 120 + account * 25,
          notes: slot === 1 ? '询单集中在 56–58 圈口；下一场补充同圈口自然光视频。' : account === 3 ? '高货讲解增加证书与瑕疵特写，跟进未付款询单。' : '',
          version: 1, updatedAt: new Date().toISOString(), updatedBy: '演示数据'
        });
      }
    }
  }
  const todaySessions = sessions.filter(item => item.date === today);
  const names = ['冰糯飘花手镯', '糯种晴底手镯', '冰种圆条手镯', '细糯正圈手镯', '飘绿贵妃手镯', '白底青正圈手镯'];
  const inventory = Array.from({ length: 24 }, (_, index) => {
    const cost = 680 + index * 245;
    const state = index < 13 ? 'in_stock' : index < 18 ? 'reserved' : index < 23 ? 'sold' : 'returned';
    return {
      id: `stock-${index + 1}`, sku: `FC${today.replaceAll('-', '')}-${String(index + 1).padStart(3, '0')}`,
      name: names[index % names.length], size: String(52 + index % 10),
      supplier: ['瑞丽货主 A', '边境货主 B', '腾冲货主 C'][index % 3],
      purchaseDate: dayOffset(today, -(index % 7)), cost, askingPrice: Math.round(cost * 1.7 / 10) * 10,
      state, sessionId: index >= 13 ? todaySessions[index % todaySessions.length].id : '',
      notes: index % 5 === 0 ? '已拍自然光、圈口与内纹特写；采购现金已付。' : '现金采购；单件单货号。',
      version: 1, updatedAt: new Date().toISOString(), updatedBy: '演示数据'
    };
  });
  const tasks = [
    { title: '翠缘2号：复查晚班询单未付款原因', account: 1, slot: 2, owner: '阿明', evidence: '有效询单后仍有未确认客户，付款承诺时间未记录。', action: '客服按圈口和预算分组回访，记录未付款原因。', acceptance: '补齐未付款原因并在下一场对比询单付款率。', status: 'doing' },
    { title: '高货4号：补齐证书与瑕疵特写', account: 3, slot: 1, owner: '小雅', evidence: '复盘中客户多次询问纹裂与证书，讲解时没有统一素材。', action: '为下场待播手镯补拍自然光视频和瑕疵图。', acceptance: '下场前完成待播高货素材核对。', status: 'open' },
    { title: '边境源头1号：验证 56–58 圈口货盘', account: 0, slot: 1, owner: '小满', evidence: '本场有效询单集中在 56–58 圈口。', action: '下一场增加该圈口现货比例，标记讲解顺序。', acceptance: '比较两场同圈口询单数、付款件数和贡献利润。', status: 'open' },
    { title: '甄品5号：完成退货成本匹配', account: 4, slot: 0, owner: '小悦', evidence: '退回手镯已验收入库，需要核对销售成本冲回。', action: '财务按原货号核对退款与成本，补齐场次数据。', acceptance: '退款金额与匹配成本核对无差异。', status: 'done' }
  ].map((task, index) => {
    const { account, slot, ...rest } = task;
    return { ...rest, id: `task-${index + 1}`, sessionId: todaySessions[account * 3 + slot].id, due: dayOffset(today, index === 3 ? 0 : 1), version: 1, updatedAt: new Date().toISOString(), updatedBy: '演示数据' };
  });
  return { sessions, inventory, tasks };
}
