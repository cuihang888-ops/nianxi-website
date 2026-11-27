#!/usr/bin/env node
'use strict';
const path = require('path');
const { initializeAdmins } = require('../lib/auth');
try {
  const credentials = initializeAdmins(path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data')), {
    ownerPassword: process.env.OWNER_PASSWORD,
    staffPassword: process.env.STAFF_PASSWORD
  });
  console.log('两个管理账号已建立。密码只在此初始化时显示，请安全保存：');
  for (const account of credentials) console.log(`${account.displayName}：账号 ${account.username} / 密码 ${account.password}`);
  console.log('管理员凭据保存在 data/admins.json（密码仅存储为 scrypt 哈希）。');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
