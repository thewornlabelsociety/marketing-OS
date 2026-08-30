const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `marketing-os-verify-3i-${Date.now()}.db`);
process.env.SQLITE_PATH = tmp;
process.env.AI_PROVIDER = '';

require('ts-node/register/transpile-only');
require('./verify-phase-3i.ts');

process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmp + suffix); } catch (_) { /* ignore */ }
  }
});
