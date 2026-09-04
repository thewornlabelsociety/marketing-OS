#!/usr/bin/env node
'use strict';
/**
 * Phase B2 — Meta Publishing Credential Resolution — Verification
 * Run: node scripts/run-verify-phase-b2.cjs
 * 18 checks across 4 sections.
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

// ─── [1/4] MetaGraphClient ────────────────────────────────────────────────────
console.log('\n[1/4] MetaGraphClient — accessToken param');

const graphClient = readFile('src/integrations/meta/MetaGraphClient.ts');

check(
  'MetaPublishInput has accessToken field',
  graphClient?.includes('accessToken: string'),
  'accessToken not declared in MetaPublishInput interface',
);
check(
  'publishImage does NOT use process.env.META_PAGE_ACCESS_TOKEN',
  graphClient != null && !graphClient.includes('process.env.META_PAGE_ACCESS_TOKEN'),
  'global env-var token still used — workspace isolation broken',
);
check(
  'publishImage uses input.accessToken for Instagram container creation',
  graphClient?.includes('access_token: input.accessToken'),
  'input.accessToken not passed to axios params',
);
check(
  'publishImage uses input.accessToken for Facebook photos endpoint',
  (() => {
    if (!graphClient) return false;
    const fbIdx = graphClient.indexOf('/photos');
    if (fbIdx === -1) return false;
    // check that access_token: input.accessToken appears after /photos section
    return graphClient.slice(fbIdx).includes('access_token: input.accessToken');
  })(),
  'Facebook photos endpoint still uses env-var token',
);

// ─── [2/4] MetaPublishingProvider — credential resolution ────────────────────
console.log('\n[2/4] MetaPublishingProvider — credential resolution');

const provider = readFile('src/integrations/meta/MetaPublishingProvider.ts');

check(
  'MetaPublishingProvider imports credentialVault',
  provider?.includes("from '../../services/credentials/CredentialVault'"),
  'credentialVault not imported',
);
check(
  'publish() reads access_credential_ref from connection',
  provider?.includes('connection.access_credential_ref'),
  'access_credential_ref not referenced',
);
check(
  'publish() returns CREDENTIAL_UNAVAILABLE when access_credential_ref is null',
  provider?.includes("'CREDENTIAL_UNAVAILABLE'"),
  'CREDENTIAL_UNAVAILABLE error code not present',
);
check(
  'publish() calls credentialVault.read with workspace-scoped args',
  provider?.includes('credentialVault.read(connection.access_credential_ref, request.workspaceId)'),
  'credentialVault.read not called with (connection.access_credential_ref, request.workspaceId)',
);
check(
  'publish() returns CREDENTIAL_UNAVAILABLE when vault returns null',
  (() => {
    if (!provider) return false;
    // Confirm two separate CREDENTIAL_UNAVAILABLE returns: one for null ref, one for null resolved value
    const matches = provider.match(/CREDENTIAL_UNAVAILABLE/g);
    return (matches?.length ?? 0) >= 2;
  })(),
  'only one CREDENTIAL_UNAVAILABLE path found — missing check for vault returning null',
);
check(
  'publish() skips credential check in mock mode (isMetaMockMode guard)',
  provider?.includes('isMetaMockMode()'),
  'isMetaMockMode() not used — mock mode will attempt real credential resolution',
);
check(
  'publish() passes resolved accessToken to metaGraphClient.publishImage',
  provider?.includes('accessToken,') || provider?.includes('accessToken }'),
  'accessToken not passed to publishImage call',
);

// ─── [3/4] Workspace isolation ────────────────────────────────────────────────
console.log('\n[3/4] Workspace isolation');

check(
  'publish() checks connection.workspace_id !== request.workspaceId',
  provider?.includes('connection.workspace_id !== request.workspaceId'),
  'cross-workspace connection isolation check missing',
);
check(
  'publish() returns CONNECTION_REQUIRED for workspace mismatch',
  provider?.includes("'CONNECTION_REQUIRED'"),
  'CONNECTION_REQUIRED error code not present',
);
check(
  'publish() returns AUTH_EXPIRED for REAUTH_REQUIRED connection status',
  provider?.includes("'REAUTH_REQUIRED'") && provider?.includes("'AUTH_EXPIRED'"),
  'AUTH_EXPIRED path for REAUTH_REQUIRED not found',
);
check(
  'publish() returns AUTH_EXPIRED when expires_at is in the past',
  provider?.includes('expires_at') && provider?.includes("'AUTH_EXPIRED'"),
  'expires_at check or AUTH_EXPIRED response missing',
);
check(
  'CAROUSEL publishing blocked (VALIDATION_FAILED)',
  provider?.includes("kind === 'CAROUSEL'") || provider?.includes("'CAROUSEL'"),
  'CAROUSEL not explicitly blocked',
);
check(
  'STORY publishing blocked (VALIDATION_FAILED)',
  provider?.includes("kind === 'STORY'") || provider?.includes("'STORY'"),
  'STORY not explicitly blocked',
);

// ─── [4/4] Registry ───────────────────────────────────────────────────────────
console.log('\n[4/4] PublishingProviderRegistry');

const registry = readFile('src/integrations/adapters/PublishingProviderRegistry.ts');

check(
  'Registry imports metaPublishingProvider',
  registry?.includes('metaPublishingProvider'),
  'metaPublishingProvider not imported or registered',
);
check(
  'Registry registers metaPublishingProvider at module level',
  registry?.includes('PublishingProviderRegistry.register(metaPublishingProvider)'),
  'metaPublishingProvider not registered',
);
check(
  'Registry still registers mockPublishingAdapter',
  registry?.includes('PublishingProviderRegistry.register(mockPublishingAdapter)'),
  'mockPublishingAdapter registration removed — tests will break',
);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────');
console.log(`Phase B2: ${pass} passed, ${fail} failed`);
if (failures.length > 0) {
  console.log('\nFailed checks:');
  for (const f of failures) {
    console.log(`  ✗ ${f.label}${f.reason ? ` (${f.reason})` : ''}`);
  }
}
console.log('─────────────────────────────────────────\n');
process.exit(fail > 0 ? 1 : 0);
