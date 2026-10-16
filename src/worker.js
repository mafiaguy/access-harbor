import { loadConfig } from './config.js';
import { openDatabase } from './database.js';
import { tick } from './engine.js';
const config = await loadConfig(),
  db = openDatabase(config.databasePath, config.mode);
let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
console.log(`Access Harbor worker started (${config.mode}). Checking access every 5 seconds.`);
while (!stopping) {
  try {
    await tick(db, config);
  } catch (error) {
    console.error('Worker cycle failed:', error.message);
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 5000));
}
db.close();
