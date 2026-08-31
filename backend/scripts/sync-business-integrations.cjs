require('dotenv/config');
require('ts-node/register/transpile-only');

const { initDatabase } = require('../src/db/database');
const { businessIntegrationService } = require('../src/services/business/BusinessIntegrationService');

async function main() {
  initDatabase();
  const workspaceId = process.env.WORN_LABEL_WORKSPACE_ID?.trim();
  if (!workspaceId) throw new Error('WORN_LABEL_WORKSPACE_ID is required');
  const integration = businessIntegrationService.connectWornLabelFromEnvironment(workspaceId);
  const result = await businessIntegrationService.sync(integration.id, workspaceId);
  console.log(`Worn Label sync complete: ${result.imported} imported, ${result.failed} isolated.`);
}

main().catch((error) => { console.error(`Worn Label sync failed: ${error.message}`); process.exitCode = 1; });
