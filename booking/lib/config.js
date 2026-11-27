'use strict';

const rooms = [
  '直播间 A', '直播间 B', '直播间 C', '办公室 A',
  '共享工作间 A', '共享工作间 B', '共享工作间 C', '直播间 D',
  '直播间 E', '会议室 A', '休息室 A', '器材室 A'
];
const slots = [
  { id: 'morning', name: '早场', start: '08:00', end: '13:30' },
  { id: 'afternoon', name: '中场', start: '14:00', end: '19:30' },
  { id: 'evening', name: '晚场', start: '20:00', end: '01:30', endDayOffset: 1 }
];
const departments = [
  { id: 'd1', name: '一部', groups: ['一组', '二组', '三组', '四组', '五组'], slots: ['afternoon', 'evening'], retiredSlots: ['morning'] },
  { id: 'd2', name: '二部', groups: ['一组', '二组', '三组', '四组'], slots: ['morning', 'afternoon', 'evening'] },
  { id: 'd3', name: '三部', groups: ['一组', '二组'], slots: ['morning', 'afternoon', 'evening'] },
  { id: 'd4', name: '四部', groups: ['一组', '二组', '三组', '四组'], slots: ['morning', 'afternoon', 'evening'] },
  { id: 'd5', name: '五部', groups: ['一组'], slots: ['morning', 'afternoon', 'evening'] }
];
const release = {
  version: '1.2.3',
  date: '2026-10-26',
  policy: {
    minimumChanges: 6,
    importantFeatureCanRelease: true,
    description: '累计超过5项变动（至少6项），或新增重要功能时，才升级系统版本；零散修复先累计记录。'
  },
  history: [
    {
      version: '1.2.3',
      date: '2026-10-26',
      title: '部门与场次管理',
      changes: [
        '管理员可新增、改名和停用直播间部门，维护组别；已停用的部门和组别继续保留原有排班。',
        '管理员可按部门和组别增加或删除早、中、晚场，变更立即同步到公开排班看板。',
        '已停用场次的历史排班继续保留、可查看，新增或调整仅允许当前启用场次。',
        '特殊场次允许最多 3 位卖手，常规排班仍按 2 位卖手展示。'
      ]
    },
    {
      version: '1.2.2',
      date: '2026-10-20',
      title: '便捷排班与照片加载优化',
      changes: [
        '可收藏常看直播间，下次进入看卖手时直接查看今天的安排。',
        '新增沿用上轮：带入原班次卖手和业务，默认接着安排3天，保存前核对日期和整个区间的冲突。',
        '新增排班及当天调整支持按头像、姓名和编号选人，显示占用原因，防止重复选择，第2位可暂时待补。',
        '手机排班完整显示卖手原照片，点击可放大，返回时保留原日期和直播间。',
        '人才资料与头像分开加载，照片按需缓存，资料未变化不重复传输，首页更快显示。'
      ]
    },
    {
      version: '1.2.1',
      date: '2026-10-18',
      title: '卖手查看与手机编辑优化',
      changes: [
        '排班默认显示今天，选择直播间后查看当天早、中、晚场，可切换日期查看未来安排。',
        '每场最多两位卖手，放大头像，旁边直接显示姓名、编号和资料入口。',
        '点击身份简介可查看卖手完整资料。',
        '新增最近剧情，管理员按卖手录入和修改，查看时从最新内容开始显示。',
        '按姓名或编号搜索卖手，快速查找正在进行、即将开始及最近结束的场次。',
        '页面和详情支持返回上一层、回到主页面，返回时保留未保存的编辑内容。',
        '手机编辑表单简化，内容单独滚动，保存按钮固定在底部，适配横屏及键盘占用区域。'
      ]
    },
    {
      version: '1.1',
      title: '新增卖手系统',
      changes: ['增加卖手人才总库、头像姓名编号录入、部门组别排班、早中晚安排及默认连续3天排班。']
    },
    {
      version: '1',
      title: '房间预约系统',
      changes: ['提供房间、日期及早中晚时段预约，已预约时段向所有人员显示占用，防止重复预约。']
    }
  ]
};
function scheduleSlots(department, group) {
  const selected = typeof department === 'string'
    ? departments.find(item => item.id === department) : department;
  if (!selected?.groups?.includes(group)) return [];
  return selected.groupSlots && Object.hasOwn(selected.groupSlots, group)
    ? selected.groupSlots[group] : selected.slots;
}

// Reading and importing old records must accept known archived departments,
// groups and shifts. New assignments must use the active directory instead.
function storedScheduleSlots(department, group) {
  const selected = typeof department === 'string'
    ? departments.find(item => item.id === department) : department;
  if (!selected || !(selected.groups?.includes(group) || selected.archivedGroups?.includes(group))) return [];
  return slots.map(item => item.id);
}

const slotIds = slots.map(item => item.id);
const maxTalentsPerSchedule = 3;
const reservedNames = new Set(['__proto__', 'prototype', 'constructor']);
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
function directoryError() { throw new Error('部门与场次配置文件结构无法识别，已保留原文件'); }
function validDirectoryName(value, max = 40) {
  return typeof value === 'string' && value.length > 0 && value.length <= max &&
    value === value.trim() && !/[\u0000-\u001f\u007f-\u009f]/u.test(value) &&
    !reservedNames.has(value.normalize('NFKC').toLowerCase());
}
function directoryNameKey(value) { return value.normalize('NFKC').toLowerCase(); }
function validSlots(value, allowEmpty = true) {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= slotIds.length &&
    new Set(value).size === value.length && value.every(slot => slotIds.includes(slot));
}
function validGroups(value, allowEmpty = false) {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= 100 &&
    value.every(name => validDirectoryName(name, 20)) &&
    new Set(value.map(directoryNameKey)).size === value.length;
}
function validateScheduleConfig(value) {
  if (!plainObject(value)) directoryError();
  if (value.version === 1) {
    if (Object.keys(value).some(key => !['version', 'groups'].includes(key)) || !plainObject(value.groups)) directoryError();
    for (const [departmentId, groups] of Object.entries(value.groups)) {
      const department = departments.find(item => item.id === departmentId);
      if (!department || !plainObject(groups)) directoryError();
      for (const [group, selected] of Object.entries(groups)) {
        if (!department.groups.includes(group) || !validSlots(selected)) directoryError();
      }
    }
    return value;
  }
  if (value.version !== 2 ||
      Object.keys(value).some(key => !['version', 'departments', 'archivedDepartments'].includes(key)) ||
      !Array.isArray(value.departments) || !Array.isArray(value.archivedDepartments) ||
      value.departments.length + value.archivedDepartments.length > 1000) directoryError();
  const all = [...value.departments, ...value.archivedDepartments];
  const identifiers = new Set();
  for (const department of all) {
    if (!plainObject(department) ||
        Object.keys(department).some(key => !['id', 'name', 'groups', 'slots', 'groupSlots', 'archivedGroups', 'retiredSlots'].includes(key)) ||
        typeof department.id !== 'string' ||
        !(/^[A-Za-z0-9][A-Za-z0-9_-]{12,19}$/.test(department.id) || departments.some(item => item.id === department.id)) ||
        identifiers.has(department.id) || !validDirectoryName(department.name) ||
        !validGroups(department.groups) || !validSlots(department.slots, false) ||
        (department.archivedGroups !== undefined && !validGroups(department.archivedGroups, true)) ||
        (department.retiredSlots !== undefined && !validSlots(department.retiredSlots))) directoryError();
    identifiers.add(department.id);
    const groupNames = [...department.groups, ...(department.archivedGroups || [])];
    if (new Set(groupNames.map(directoryNameKey)).size !== groupNames.length) directoryError();
    if (department.groupSlots !== undefined) {
      if (!plainObject(department.groupSlots)) directoryError();
      for (const [group, selected] of Object.entries(department.groupSlots)) {
        // Empty overrides from old version-1 files remain readable and can be
        // repaired through the slot API. New mutations cannot create one.
        if (!groupNames.includes(group) || !validSlots(selected)) directoryError();
      }
    }
  }
  if (new Set(value.departments.map(item => directoryNameKey(item.name))).size !== value.departments.length) directoryError();
  return value;
}
function scheduleDirectory(value = { version: 1, groups: {} }) {
  validateScheduleConfig(value);
  if (value.version === 2) {
    return { departments: structuredClone(value.departments), archivedDepartments: structuredClone(value.archivedDepartments) };
  }
  const active = structuredClone(departments);
  for (const department of active) {
    const overrides = value.groups[department.id];
    if (overrides && Object.keys(overrides).length) department.groupSlots = structuredClone(overrides);
    department.archivedGroups = [];
  }
  return { departments: active, archivedDepartments: [] };
}
module.exports = {
  rooms, slots, slotIds, departments, businesses: ['FB', '虾皮', '国内'],
  maxTalentsPerSchedule, release, scheduleSlots, storedScheduleSlots,
  validateScheduleConfig, scheduleDirectory, validDirectoryName, directoryNameKey
};
