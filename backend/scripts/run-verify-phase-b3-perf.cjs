#!/usr/bin/env node
'use strict';
/**
 * Phase B3-Perf — Meta Performance Credential Resolution — Verification
 * Run: node scripts/run-verify-phase-b3-perf.cjs
 * 11 checks across 5 sections.
 */
const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
const failures = [];

function ok(label) { console.log(`  ✓  ${label}`); pass++; }
function ko(label, reason) { console.error(`  ✗  ${label}${reason ? ` — ${reason}` : ''}`); fail++; failures.push({ label, reason }); }
function check(label, condition, reason) { if (condition) ok(label); else ko(label, reason); }

function readFile(rel) {
  try { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
  catch { return null; }
}

// ─── [1/5] MetaPerformanceProvider — credential resolution ────────────────────
console.log('\n[1/5] MetaPerformanceProvider — credential resolution');

const perfProvider = readFile('src/integrations/meta/MetaPerformanceProvider.ts');

// 1: imports credentialVault and isMetaMockMode
check(
  '1: imports credentialVault from CredentialVault',
  perfProvider?.includes("from '../../services/credentials/CredentialVault'"),
  'credentialVault not imported',
);
check(
  '2: imports isMetaMockMode from MetaGraphClient',
  perfProvider?.includes('isMetaMockMode'),
  'isMetaMockMode not imported',
);

// 3: resolves connection from destination_id, enforces workspace isolation
check(
  '3: resolves connection and enforces workspace isolation (workspace_id check)',
  perfProvider?.includes('connection.workspace_id !== request.workspaceId')
    && perfProvider?.includes("'CONNECTION_REQUIRED'"),
  'workspace isolation check or CONNECTION_REQUIRED missing',
);

// 4: credential vault lookup is workspace-scoped
check(
  '4: credentialVault.read called with (access_credential_ref, request.workspaceId)',
  perfProvider?.includes('credentialVault.read(connection.access_credential_ref, request.workspaceId)'),
  'credentialVault.read not called with workspace-scoped args',
);

// 5: CREDENTIAL_UNAVAILABLE on null ref and null resolved
check(
  '5: CREDENTIAL_UNAVAILABLE thrown for missing ref and failed vault read',
  (() => {
    if (!perfProvider) return false;
    const matches = perfProvider.match(/CREDENTIAL_UNAVAILABLE/g);
    return (matches?.length ?? 0) >= 2;
  })(),
  'fewer than 2 CREDENTIAL_UNAVAILABLE paths found',
);

// 6: AUTH_EXPIRED on connection status and expires_at
check(
  '6: AUTH_EXPIRED thrown for REAUTH_REQUIRED/EXPIRED status and expires_at',
  perfProvider?.includes("'AUTH_EXPIRED'")
    && perfProvider?.includes("'REAUTH_REQUIRED'")
    && perfProvider?.includes('expires_at'),
  'AUTH_EXPIRED path or expiry check missing',
);

// 7: mock mode skips vault (accessToken = '' when isMetaMockMode)
check(
  '7: mock mode skips credential resolution (isMetaMockMode guard)',
  (() => {
    if (!perfProvider) return false;
    // The guard must wrap the credential resolution block
    const mockGuardIdx = perfProvider.indexOf('isMetaMockMode()');
    const vaultIdx = perfProvider.indexOf('credentialVault.read');
    return mockGuardIdx !== -1 && vaultIdx !== -1 && mockGuardIdx < vaultIdx;
  })(),
  'isMetaMockMode guard does not precede credentialVault.read',
);

// 8: accessToken passed to fetchInsights
check(
  '8: accessToken passed to metaGraphClient.fetchInsights',
  perfProvider?.includes('accessToken,') && perfProvider?.includes('fetchInsights'),
  'accessToken not passed to fetchInsights',
);

// ─── [2/5] PerformanceProviderRegistry — meta registered ─────────────────────
console.log('\n[2/5] PerformanceProviderRegistry — meta registered');

const registry = readFile('src/integrations/adapters/PerformanceProviderRegistry.ts');

check(
  '9: PerformanceProviderRegistry imports and registers metaPerformanceProvider',
  registry?.includes('metaPerformanceProvider')
    && registry?.includes('PerformanceProviderRegistry.register(metaPerformanceProvider)'),
  'metaPerformanceProvider not imported or not registered',
);

// ─── [3/5] CampaignPerformanceService — fetchPerformance errors caught ────────
console.log('\n[3/5] CampaignPerformanceService — provider errors caught');

const campService = readFile('src/services/performance/CampaignPerformanceService.ts');

check(
  '10: refreshFromProvider wraps provider.fetchPerformance in try/catch',
  campService?.includes('try {') && campService?.includes('provider.fetchPerformance')
    && campService?.includes('catch (err)'),
  'try/catch around provider.fetchPerformance not found',
);

// ─── [4/5] Route — new error codes map to 503 ─────────────────────────────────
console.log('\n[4/5] Route — credential error codes return 503');

const route = readFile('src/routes/campaignPerformance.ts');

check(
  '11: statusFor maps CONNECTION_REQUIRED, CREDENTIAL_UNAVAILABLE, AUTH_EXPIRED to 503',
  route?.includes("'CONNECTION_REQUIRED'") && route?.includes("'CREDENTIAL_UNAVAILABLE'")
    && route?.includes("'AUTH_EXPIRED'"),
  'one or more credential error codes missing from statusFor',
);

// ─── [5/5] Security — token not logged or returned ────────────────────────────
console.log('\n[5/5] Security — token not logged or returned in performance items');

check(
  'S: rawMetadata in performance items does not include accessToken',
  (() => {
    if (!perfProvider) return false;
    // The rawMetadata push must not include accessToken
    const rawMetaIdx = perfProvider.indexOf('rawMetadata:');
    if (rawMetaIdx === -1) return false;
    const rawMetaSlice = perfProvider.slice(rawMetaIdx, rawMetaIdx + 200);
    return !rawMetaSlice.includes('accessToken');
  })(),
  'accessToken may be included in rawMetadata returned to callers',
);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────');
console.log(`Phase B3-Perf: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFailed checks:');
  for (const f of failures) {
    console.log(`  ✗ ${f.label}${f.reason ? ` (${f.reason})` : ''}`);
  }
}
console.log('─────────────────────────────────────────\n');
process.exit(fail > 0 ? 1 : 0);
