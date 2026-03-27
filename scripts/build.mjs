import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');
const distLibDir = join(distDir, 'lib');

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true });
}

mkdirSync(distDir, { recursive: true });
mkdirSync(distLibDir, { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js', 'server.js']) {
  cpSync(join(process.cwd(), file), join(distDir, file));
}
for (const file of ['monitors.js', 'notifications.js']) {
  cpSync(join(process.cwd(), 'lib', file), join(distLibDir, file));
}

console.log('Built RayMonitor uptime app into dist/.');
