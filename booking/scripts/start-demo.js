'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../server');
const { initializeAdmins } = require('../lib/auth');
const { rooms } = require('../lib/config');
const { addDays, shanghaiDate } = require('../lib/validation');

const defaultPasswords = {
  ownerPassword: 'Review-owner-only-2026',
  staffPassword: 'Review-staff-only-2026'
};

function writeFixture(filename, data) {
  try {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

function createBookingDemo({
  dataDir,
  ownerPassword = defaultPasswords.ownerPassword,
  staffPassword = defaultPasswords.staffPassword
}) {
  const demoDirectory = path.resolve(dataDir);
  const legacyFile = path.join(demoDirectory, 'bookings.json');
  const today = shanghaiDate();
  fs.mkdirSync(demoDirectory, { recursive: true });
  if (!fs.existsSync(path.join(demoDirectory, 'admins.json'))) {
    initializeAdmins(demoDirectory, { ownerPassword, staffPassword });
  }
  writeFixture(legacyFile, {
    version: 2,
    bookings: [
      { id: 'demo-booking-1', room: rooms[0], date: today, slot: 'afternoon', department: '示例运营组', bookerName: '演示成员' },
      { id: 'demo-booking-2', room: rooms[9], date: addDays(today, 1), slot: 'morning', department: '示例培训组', bookerName: '演示成员' }
    ]
  });

  const talents = ['演示卖手甲', '演示卖手乙', '演示卖手丙'].map((name, index) => ({
    id: 'demo-talent-' + (index + 1),
    number: 'DEMO-' + (index + 1),
    name,
    active: true,
    avatar: '',
    introduction: '可在排班页面按姓名或编号查询。'
  }));
  const schedules = [0, 1, 2].map(offset => ({
    id: 'demo-schedule-' + (offset + 1),
    date: addDays(today, offset),
    department: 'd1',
    group: '一组',
    slot: 'afternoon',
    business: 'FB',
    batchId: 'demo-batch-1',
    talentIds: talents.slice(0, offset === 1 ? 3 : 2).map(talent => talent.id)
  }));
  writeFixture(path.join(demoDirectory, 'sellers.json'), { version: 1, talents, schedules });
  return createServer({ dataDir: demoDirectory, legacyFile, secureCookies: false });
}

if (require.main === module) {
  const dataDir = process.env.BOOKING_DEMO_DATA_DIR || path.join(__dirname, '..', '.demo-data');
  const ownerPassword = process.env.BOOKING_DEMO_OWNER_PASSWORD || defaultPasswords.ownerPassword;
  const staffPassword = process.env.BOOKING_DEMO_STAFF_PASSWORD || defaultPasswords.staffPassword;
  const port = Number(process.env.BOOKING_DEMO_PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('预约演示端口须为 1 至 65535 的整数。');
  const server = createBookingDemo({ dataDir, ownerPassword, staffPassword });
  server.listen(port, '127.0.0.1', () => {
    console.log('预约系统演示 http://127.0.0.1:' + port + '/');
  });
}

module.exports = { createBookingDemo };
