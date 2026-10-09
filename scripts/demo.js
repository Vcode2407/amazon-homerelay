import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(resolve(root, 'data'), { recursive: true });
const directory = await mkdtemp(resolve(root, 'data', 'demo-'));
const running = await startServer({
  port: Number(process.env.HOMERELAY_DEMO_PORT || 4174),
  dataFile: resolve(directory, 'household.json'),
  configuration: { provider: 'offline' },
});
console.log(`Fresh fictional HomeRelay demo: ${running.url}`);
console.log(`Separate persisted data: ${resolve(directory, 'household.json')}`);
console.log('Offline mode. Existing household data is preserved. Dates are seeded relative to today.');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await running.close();
  process.exit(0);
});
