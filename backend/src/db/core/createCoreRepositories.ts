import {
  assertCoreDbDriverAllowed,
  resolveCoreDbDriver,
  type CoreDbDriver,
} from '../../config/coreDbConfig';
import type { CoreDomainRepositories } from './coreDomainTypes';
import { SqliteTenantRepository } from '../repositories/sqlite/SqliteTenantRepository';
import { SqliteWorkspaceRepository } from '../repositories/sqlite/SqliteWorkspaceRepository';
import { SqliteObjectiveRepository } from '../repositories/sqlite/SqliteObjectiveRepository';
import { SqliteCampaignRepository } from '../repositories/sqlite/SqliteCampaignRepository';
import {
  PostgresTenantRepository,
  PostgresWorkspaceRepository,
  PostgresObjectiveRepository,
  PostgresCampaignRepository,
} from '../repositories/postgres/PostgresCoreRepositories';

let cached: CoreDomainRepositories | null = null;
let cachedDriver: CoreDbDriver | null = null;

function buildRepositories(driver: CoreDbDriver): CoreDomainRepositories {
  if (driver === 'postgres') {
    return {
      driver: 'postgres',
      tenant: new PostgresTenantRepository(),
      workspace: new PostgresWorkspaceRepository(),
      objective: new PostgresObjectiveRepository(),
      campaign: new PostgresCampaignRepository(),
    };
  }
  return {
    driver: 'sqlite',
    tenant: new SqliteTenantRepository(),
    workspace: new SqliteWorkspaceRepository(),
    objective: new SqliteObjectiveRepository(),
    campaign: new SqliteCampaignRepository(),
  };
}

/** Lazy singleton for core domain repositories. Default driver: sqlite. */
export function getCoreRepositories(env: NodeJS.ProcessEnv = process.env): CoreDomainRepositories {
  const driver = resolveCoreDbDriver(env);
  assertCoreDbDriverAllowed(driver, env);

  if (cached && cachedDriver === driver) return cached;

  cached = buildRepositories(driver);
  cachedDriver = driver;
  return cached;
}

/** @internal — verification harness resets factory when env changes between sections. */
export function resetCoreRepositoriesForTests(): void {
  cached = null;
  cachedDriver = null;
}

/** Create a fresh repository bundle without touching the route singleton. */
export function createCoreRepositories(env: NodeJS.ProcessEnv = process.env): CoreDomainRepositories {
  const driver = resolveCoreDbDriver(env);
  assertCoreDbDriverAllowed(driver, env);
  return buildRepositories(driver);
}
