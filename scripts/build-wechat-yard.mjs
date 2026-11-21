import {buildWechat} from './build-wechat.mjs';

const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--check'))throw new Error('Usage: node scripts/build-wechat-yard.mjs [--check]');
const checkOnly=args.includes('--check');
const report=await buildWechat({entryPoint:'wechat/yard-game.js',outputName:'wechat-yard',checkOnly});
console.log(`${checkOnly?'Checked':'Built'} Anheli yard: ${report.totalBytes} bytes, ${report.modules.length} modules; dist/wechat-yard`);
