import http from 'node:http';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApplication } from './live/server.mjs';

const require = createRequire(import.meta.url);
const { createBookingDemo } = require('./booking/scripts/start-demo.js');
const root = process.env.REVIEW_DATA_DIR
  ? resolve(process.env.REVIEW_DATA_DIR)
  : fileURLToPath(new URL('./.preview-data/', import.meta.url));
const host = '127.0.0.1';
const port = Number(process.env.REVIEW_PORT || 4297);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('试用端口须为 1 至 65535 的整数');
const bookingPrefix = '/booking-app/';

async function demoAssistantFetch(url, options) {
  const host = new URL(url).hostname;
  if (host === 'primary.example.invalid') return new Response(null, { status: 503 });
  if (host !== 'fallback.example.invalid') throw new Error('Unexpected demo model');
  const { messages } = JSON.parse(options.body);
  const instruction = messages[0].content;
  const replies = {
    'Simplified Chinese': '欢迎来到直播间，有喜欢的款式可以告诉我们。',
    English: 'Welcome to the livestream. Let us know if you see a style you like.',
    Vietnamese: 'Chào mừng bạn đến với buổi phát trực tiếp. Hãy cho chúng tôi biết nếu bạn thích mẫu nào nhé.',
    Burmese: 'တိုက်ရိုက်ထုတ်လွှင့်မှုမှ ကြိုဆိုပါတယ်။ ကြိုက်နှစ်သက်တဲ့ ပုံစံရှိရင် ပြောပြနိုင်ပါတယ်။'
  };
  const language = Object.keys(replies).find(name => instruction.includes('into ' + name + '.'));
  const text = language ? replies[language] : '欢迎来到直播间。喜欢哪一款，随时告诉我们，我们可以给您近距离展示。';
  return Response.json({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 120, completion_tokens: 45 } });
}

const booking = createBookingDemo({ dataDir: resolve(root, 'booking') });
const live = createApplication({
  host, port: 0, demo: true, mode: 'demo', production: false, cookieSecure: false,
  dataDir: resolve(root, 'live'),
  bookingUrl: new URL(bookingPrefix, `http://${host}:${port}`),
  dashboardPassword: 'Local-admin-board-2026',
  assistantConfig: {
    primary: { url: 'https://primary.example.invalid/v1/chat/completions', key: 'local-primary-fixture', model: 'demo-primary' },
    fallback: { url: 'https://fallback.example.invalid/v1/chat/completions', key: 'local-fallback-fixture', model: 'demo-fallback' },
    timeoutMs: 1000
  },
  assistantFetch: demoAssistantFetch
});

await live.listen();
await new Promise((resolveListen, reject) => {
  booking.once('error', reject);
  booking.listen(0, host, resolveListen);
});

const preview = http.createServer((request, response) => {
  const isBooking = request.url.startsWith(bookingPrefix);
  const upstream = isBooking ? booking : live.server;
  const path = isBooking ? '/' + request.url.slice(bookingPrefix.length) : request.url;
  const proxy = http.request({
    host, port: upstream.address().port, path, method: request.method, headers: request.headers
  }, result => {
    response.writeHead(result.statusCode, result.headers);
    result.pipe(response);
  });
  proxy.on('error', () => {
    if (!response.headersSent) response.writeHead(502);
    response.end();
  });
  request.pipe(proxy);
});

try {
  await new Promise((resolveListen, reject) => {
    preview.once('error', reject);
    preview.listen(port, host, resolveListen);
  });
  console.log(`协作中心试用 http://${host}:${port}/`);
} catch (error) {
  booking.close();
  await live.close();
  throw error;
}
