import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) scan(path);
    else if (path.endsWith('.js')) files.push(path);
  }
}
for (const dir of ['src', 'scripts', 'public', 'tests']) scan(dir);
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failures++;
}
console.log(`${files.length} JavaScript files checked.`);
process.exitCode = failures ? 1 : 0;
