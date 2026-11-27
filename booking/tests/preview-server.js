'use strict';
// Disposable UI test instance, isolated from the user's real data and accounts.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {createServer} = require('../server');
const {initializeAdmins} = require('../lib/auth');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tongchang-preview-'));
initializeAdmins(dir, {ownerPassword:'Preview-owner-2026!', staffPassword:'Preview-staff-2026!'});
const bookings = path.join(dir,'bookings.json');fs.writeFileSync(bookings,'{}');
const server = createServer({dataDir:dir,legacyFile:bookings});
server.listen(3002,'127.0.0.1',()=>console.log('Isolated UI preview: http://127.0.0.1:3002'));
