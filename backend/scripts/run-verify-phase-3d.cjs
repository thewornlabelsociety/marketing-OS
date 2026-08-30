const os = require('os');
const path = require('path');
const fs = require('fs');

const tmp = path.join(os.tmpdir(), `mos-3d-${Date.now()}.db`);
process.env.SQLITE_PATH = tmp;
process.env.AI_PROVIDER = '';

require('ts-node/register/transpile-only');
require('./verify-phase-3d.ts');

process.on('exit', () => {
  try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  try { fs.unlinkSync(`${tmp}-wal`); } catch { /* ignore */ }
  try { fs.unlinkSync(`${tmp}-shm`); } catch { /* ignore */ }
});
