import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from './live/server.mjs';

const require = createRequire(import.meta.url);
const { createBookingDemo } = require('./booking/scripts/start-demo.js');
const dataDir = fileURLToPath(new URL('./.demo-data/', import.meta.url));
const host = '127.0.0.1';
const portalPort = Number(process.env.REVIEW_PORT || 4277);
const bookingPort = Number(process.env.REVIEW_BOOKING_PORT || 4300);
if ([portalPort, bookingPort].some(port => !Number.isInteger(port) || port < 1 || port > 65535) || portalPort === bookingPort) {
  throw new Error('演示端口须为两个不同的有效端口。');
}

await mkdir(dataDir, { recursive: true });
const booking = createBookingDemo({ dataDir: resolve(dataDir, 'booking') });
const live = createApplication({
  host,
  port: portalPort,
  demo: true,
  mode: 'demo',
  production: false,
  cookieSecure: false,
  dataDir: resolve(dataDir, 'live'),
  bookingUrl: new URL(`http://${host}:${bookingPort}/`),
  dashboardPassword: 'Review-board-only-2026'
});

try {
  await new Promise((accept, reject) => {
    booking.once('error', reject);
    booking.listen(bookingPort, host, accept);
  });
  await Promise.race([
    live.listen(),
    new Promise((_, reject) => live.server.once('error', reject))
  ]);
  console.log(`协作中心演示 http://${host}:${portalPort}/`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    booking.close();
    await live.close();
  });
} catch (error) {
  booking.close();
  await live.close();
  throw error;
}
