import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}

mkdirSync(distDir, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'data.js']) {
  cpSync(join(process.cwd(), file), join(distDir, file));
}

console.log('Built RayMonitor into dist/.');
