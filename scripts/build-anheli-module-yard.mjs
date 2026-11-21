import {build} from 'esbuild';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const demo = new URL('../demos/anheli-module-yard/', import.meta.url);
const template = await readFile(new URL('index.html', demo), 'utf8');
const marker = '<script src="./browser.js"></script>';
if (!template.includes(marker)) throw new Error('Missing module yard entry script');

const result = await build({
  entryPoints: [fileURLToPath(new URL('browser.js', demo))],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  write: false,
});
const javascript = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const preview = new URL('play.html', demo);
await writeFile(preview, template.replace(marker, () => '<script>\n' + javascript + '\n</script>'));
console.log(fileURLToPath(preview));
