export const PERIODS = [
  { id: 'early', name: '早场', start: '08:00', end: '13:40', endDayOffset: 0 },
  { id: 'middle', name: '中场', start: '14:00', end: '19:40', endDayOffset: 0 },
  { id: 'late', name: '晚场', start: '20:00', end: '02:00', endDayOffset: 1 }
];

const periodIds = new Set(PERIODS.map(period => period.id));
const legacyPeriods = ['early', 'middle', 'late'];
const namedPeriods = {
  早: 'early', 上午: 'early', 中: 'middle', 午: 'middle', 下午: 'middle', 晚: 'late', 夜: 'late'
};

function legacyPeriod(slotId, slotLabel) {
  const id = String(slotId ?? '');
  if (periodIds.has(id)) return id;
  const numberedId = /^(?:fb-slot-[0-9]+-|slot-)([1-3])$/.exec(id);
  if (numberedId) return legacyPeriods[Number(numberedId[1]) - 1];

  const label = String(slotLabel ?? '').normalize('NFKC').trim()
    .replace(/\s*\((?:实际)?时段待补\)$/, '');
  const shift = /^(早|上午|中|午|下午|晚|夜)(?:场|班)?$/.exec(label);
  if (shift) return namedPeriods[shift[1]];

  const numberedLabel = /^第\s*([1-3一二三])\s*场$/.exec(label);
  if (numberedLabel) {
    const number = '一二三'.indexOf(numberedLabel[1]) + 1 || Number(numberedLabel[1]);
    return legacyPeriods[number - 1];
  }
  return 'unknown';
}

export function resolveShiftPeriod(row, slots = []) {
  if (periodIds.has(row.period)) return row.period;
  const original = legacyPeriod(row.slotId, row.slotLabel);
  if (original !== 'unknown') return original;

  if (row.scheduleUnknown === false || row.scheduleUnknown == null) {
    const offset = row.endDayOffset ?? (row.end < row.start ? 1 : 0);
    const scheduled = PERIODS.find(period => row.start === period.start && row.end === period.end && offset === period.endDayOffset);
    if (scheduled) return scheduled.id;
  }

  const slot = row.slotId && slots.find(item => item.accountId === row.accountId && item.id === row.slotId);
  if (periodIds.has(slot?.period)) return slot.period;
  return legacyPeriod(null, slot?.name);
}
