import { chinaDate } from './seed.mjs';
import { ApiError, date, keys, numeric } from './validation.mjs';

const kind = 'department-goals';
const amountLabels = { salesTarget: '月度销售目标', signedTarget: '月度签收目标', signedActual: '签收实绩' };
const fields = ['month', ...Object.keys(amountLabels), 'signedAsOf', 'version'];
const system = { id: 'system', name: '系统' };

function monthValue(month) {
  if (typeof month !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ApiError(400, '月份须为 YYYY-MM');
  }
  return month;
}

function toPublic(record, month) {
  return {
    month,
    salesTarget: record?.salesTarget ?? null,
    signedTarget: record?.signedTarget ?? null,
    signedActual: record?.signedActual ?? null,
    signedAsOf: record?.signedAsOf ?? null,
    version: record?.version ?? 0
  };
}

export function createDepartmentGoals({ store, today = chinaDate }) {
  function read(month) {
    const selected = monthValue(month);
    return toPublic(store.get(kind, selected), selected);
  }

  function save(input, actor = system) {
    keys(input, fields);
    if (fields.some(field => !Object.hasOwn(input, field))) throw new ApiError(400, '月度目标字段不完整');
    const month = monthValue(input.month);
    if (!Number.isSafeInteger(input.version) || input.version < 0) throw new ApiError(400, '月度目标版本无效');
    const amounts = Object.fromEntries(Object.entries(amountLabels).map(([name, label]) => [
      name, input[name] === null ? null : numeric(input[name], label)
    ]));
    if ((amounts.signedActual === null) !== (input.signedAsOf === null)) {
      throw new ApiError(400, '请同时填写签收实绩和统计日期');
    }
    const signedAsOf = input.signedAsOf === null ? null : date(input.signedAsOf, '签收统计日期');
    if (signedAsOf && (signedAsOf.slice(0, 7) !== month || signedAsOf > today())) {
      throw new ApiError(400, '签收统计日期须在所选月份内，且不能晚于北京时间今天');
    }
    const item = { id: month, month, ...amounts, signedAsOf };
    try {
      const saved = store.save(kind, item, input.version, actor, { defaultRecord: toPublic(null, month) });
      return toPublic(saved, month);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 409) throw error;
      throw new ApiError(409, '月度目标已更新，请刷新后重新保存', { current: toPublic(error.details?.current, month) });
    }
  }

  return { read, save };
}
