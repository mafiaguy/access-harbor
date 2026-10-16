import { cp, mkdir, rm } from 'node:fs/promises';

const siteRoot = new URL('../', import.meta.url);
const outputRoot = new URL('../dist/', import.meta.url);
const rootFiles = [
  '404.html', '_headers', 'app.js', 'auth-client.js', 'brand.css', 'catalog.js',
  'favicon.svg', 'index.html', 'login.js', 'lms.css', 'lms.js', 'marketplace.css', 'robots.txt', 'sitemap.xml', 'styles.css',
];
const siteDirectories = ['courses', 'curriculum', 'lms', 'programs'];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const file of rootFiles) {
  await cp(new URL(file, siteRoot), new URL(file, outputRoot));
}
for (const directory of siteDirectories) {
  await cp(new URL(`${directory}/`, siteRoot), new URL(`${directory}/`, outputRoot), { recursive: true });
}
