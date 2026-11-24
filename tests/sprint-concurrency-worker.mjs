import { SprintEngine } from '../daemon/lib/sprint-engine.mjs';

const root = process.argv[2];
const action = process.argv[3];
const arg = process.argv[4];
const delay = parseInt(process.env.DELAY || '0', 10);

const engine = new SprintEngine(root);
await new Promise((r) => setTimeout(r, delay));

if (action === 'setup') {
  const item = await engine.createItem({ type: 'task', title: arg || 'doomed' });
  process.stdout.write(JSON.stringify({ ok: true, id: item.id }) + '\n');
} else if (action === 'create') {
  const item = await engine.createItem({ type: 'task', title: arg || 'item' });
  process.stdout.write(JSON.stringify({ ok: true, id: item.id }) + '\n');
} else if (action === 'delete') {
  await engine.deleteItem(arg);
  process.stdout.write(JSON.stringify({ ok: true }) + '\n');
} else {
  process.stderr.write(`unknown action: ${action}\n`);
  process.exit(2);
}
process.exit(0);
