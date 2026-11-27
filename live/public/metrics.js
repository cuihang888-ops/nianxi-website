export const n = value => Number(value) || 0;
export function totals(rows) {
  const impressions = rows.filter(row => row.sourceStatus !== 'stopped' && Number.isFinite(row.impressions));
  return { ...Object.fromEntries(['orderAmount', 'orders', 'reach', 'newFollowers', 'viewers', 'shares', 'messages', 'qualified', 'received', 'refunds', 'adSpend'].map(key => [key, rows.reduce((sum, row) => sum + n(row[key]), 0)])), impressions: impressions.length ? impressions.reduce((sum, row) => sum + row.impressions, 0) : null, actualMinutes: rows.reduce((sum, row) => sum + n(row.actualMinutes), 0), missingDuration: rows.filter(row => row.actualMinutes === null || row.actualMinutes === undefined).length };
}
export function change(current, previous) {
  return previous > 0 ? (current - previous) / previous : null;
}
export function saleFactors(value) {
  if (['reach', 'messages', 'qualified', 'orders'].some(key => !(value[key] > 0))) return null;
  return [value.reach, value.messages / value.reach, value.qualified / value.messages, value.orders / value.qualified, value.orderAmount / value.orders];
}
export function decomposeSales(current, previous) {
  const a = saleFactors(previous), b = saleFactors(current);
  if (!a || !b) return null;
  const contributions = Array(5).fill(0);
  let count = 0;
  const product = values => values.reduce((x, y) => x * y, 1);
  function visit(order, remaining) {
    if (remaining.length) { remaining.forEach((key, index) => visit([...order, key], remaining.filter((_, i) => i !== index))); return; }
    const values = [...a];
    let last = product(values);
    for (const key of order) {
      values[key] = b[key];
      const next = product(values);
      contributions[key] += next - last;
      last = next;
    }
    count++;
  }
  visit([], [0, 1, 2, 3, 4]);
  return contributions.map((value, index) => ({ key: ['reach', 'messageRate', 'qualifiedRate', 'orderRate', 'basket'][index], name: ['触达规模', '私信承接率', '询单有效率', '每询单订单数', '订单均价'][index], value: value / count, current: b[index], previous: a[index] }));
}
