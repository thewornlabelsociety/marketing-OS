const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `marketing-os-verify-3o-${Date.now()}.db`);
process.env.SQLITE_PATH = tmp;
process.env.AI_PROVIDER = '';
process.env.META_MOCK_MODE = '1';
process.env.DEFAULT_SCHEDULE_TIMEZONE = 'Pacific/Auckland';

require('ts-node/register/transpile-only');
require('./verify-phase-3o.ts');

process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmp + suffix); } catch (_) { /* ignore */ }
  }
});
