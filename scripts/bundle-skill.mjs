import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = join(root, 'skills', 'skyscanner-flight-quotes', 'assets', 'flight-scanner');
await mkdir(join(bundle, 'src'), { recursive: true });
await copyFile(join(root, 'package.json'), join(bundle, 'package.json'));
for (const file of await readdir(join(root, 'src'))) {
  if (file.endsWith('.js')) await copyFile(join(root, 'src', file), join(bundle, 'src', file));
}
console.log('Standalone flight-scanner skill bundle updated.');
