const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `marketing-os-verify-3e-${Date.now()}.db`);
process.env.SQLITE_PATH = tmp;
process.env.AI_PROVIDER = '';
process.env.PUBLISHING_POLL_MS = '60000';
process.env.DEFAULT_SCHEDULE_TIMEZONE = 'Pacific/Auckland';

require('ts-node/register/transpile-only');
require('./verify-phase-3e.ts');

process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmp + suffix); } catch (_) { /* ignore */ }
  }
});
