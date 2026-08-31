const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = path.join(os.tmpdir(), `marketing-os-verify-campaign-edit-${Date.now()}.db`);
process.env.SQLITE_PATH = tmp;
process.env.AI_PROVIDER = '';
process.env.META_MOCK_MODE = '1';

require('ts-node/register/transpile-only');
require('./verify-campaign-edit.ts');

process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(tmp + suffix); } catch (_) { /* ignore */ }
  }
});
